// ==========================================
// 0. Shared Kernel / Types (型定義)
// ==========================================
type SalesStockId = string;

// Redisクライアントのモック（実際は ioredis 等を使う）
class MockRedis {
  private store = new Map<string, any>();

  // Luaスクリプト実行の模倣
  async eval(
    script: string,
    numKeys: number,
    ...args: (string | number)[]
  ): Promise<any> {
    console.log(`[Redis] Executing Lua Script...`);
    // ※実際のRedisではここでアトミックな判定が行われる
    return 1; // 成功をシミュレート
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.store.get(key) || {};
  }

  async hset(key: string, field: string, value: string) {
    const data = this.store.get(key) || {};
    data[field] = value;
    this.store.set(key, data);
  }

  // SetではなくHashでAllocationを管理する想定（userId -> timestamp）
  async hgetall_allocations(key: string): Promise<Record<string, string>> {
    return this.store.get(`allocations:${key}`) || {};
  }
}

// ==========================================
// 1. Core Domain (ビジネスルール)
// ==========================================

// 値オブジェクト: 個別の引当権利
class Allocation {
  constructor(
    public readonly userId: string,
    public readonly setupTime: Date,
    public readonly status: "Active" | "Expired" | "Sold" = "Active"
  ) {}

  checkExpiry(now: Date): Allocation {
    if (this.status !== "Active") return this;

    // 10分 = 600,000ms
    const isTimeout = now.getTime() - this.setupTime.getTime() > 600000;

    if (isTimeout) {
      return new Allocation(this.userId, this.setupTime, "Expired");
    }
    return this;
  }
}

// 集約ルート: 在庫管理の整合性担当
class SalesStock {
  constructor(
    public readonly id: SalesStockId,
    public readonly version: number,
    public readonly total: number,
    public readonly allocations: Allocation[] = []
  ) {
    if (this.countActive() > total) {
      throw new Error("システムエラー: 有効引当数が在庫上限を超えています");
    }
  }

  private countActive(): number {
    return this.allocations.filter((a) => a.status === "Active").length;
  }

  // 表示用などに使う（リポジトリからロードした後、これを呼んで最新状態にする）
  checkTimeout(now: Date): SalesStock {
    const updatedAllocations = this.allocations.map((a) => a.checkExpiry(now));
    return new SalesStock(
      this.id,
      this.version,
      this.total,
      updatedAllocations
    );
  }

  // 読み取り専用プロパティ（JSON化など用）
  get activeCount() {
    return this.countActive();
  }
}

// リポジトリインターフェース (DIP: 依存関係逆転の原則)
interface ISalesStockRepository {
  // Command: 書き込みはプリミティブな型で高速に行う
  allocate(stockId: SalesStockId, userId: string, now: Date): Promise<void>;

  // Query: 読み取りはリッチなドメインモデルを返す
  findById(id: SalesStockId): Promise<SalesStock | null>;
}

// ==========================================
// 2. Infrastructure (Redis実装)
// ==========================================

class RedisSalesStockRepository implements ISalesStockRepository {
  constructor(private redis: MockRedis) {}

  // 【Command】 Luaスクリプトによる「アトミックな早い者勝ち」
  // ドメインモデルをメモリ展開せず、Redis上で計算して決着をつける
  async allocate(
    stockId: SalesStockId,
    userId: string,
    now: Date
  ): Promise<void> {
    const timestamp = now.getTime();
    const stockKey = `stock:${stockId}`;
    const allocationsKey = `allocations:${stockId}`;

    // Luaスクリプト:
    // 1. 現在の在庫上限(total)を取得
    // 2. 現在の引当数(HLEN)を取得
    // 3. 空きがあれば HSET で書き込む
    // 4. 空きがなければエラーを返す
    // ※実際は期限切れキーのクリーンアップもLua内で行うとより厳密だが、
    //   ここでは「枠の確保」に集中する。
    const luaScript = `
      local total = tonumber(redis.call('HGET', KEYS[1], 'total'))
      local current_count = redis.call('HLEN', KEYS[2])
      
      if current_count >= total then
        return 0 -- 在庫不足
      end
      
      -- 既に存在するかチェック(冪等性)
      if redis.call('HEXISTS', KEYS[2], ARGV[1]) == 1 then
        return 0 -- 既に確保済み（あるいはエラー扱い）
      end

      -- 引当実行 (Field: UserId, Value: Timestamp)
      redis.call('HSET', KEYS[2], ARGV[1], ARGV[2])
      return 1 -- 成功
    `;

    // 実行
    const result = await this.redis.eval(
      luaScript,
      2, // Keyの数
      stockKey,
      allocationsKey, // KEYS
      userId,
      timestamp // ARGV
    );

    if (result === 0) {
      throw new Error("在庫確保に失敗しました（在庫切れ または 済）");
    }

    // 実際にはここで TTL (EXPIRE) の更新なども行う
  }

  // 【Query】 ドメインモデルの再構築
  async findById(id: SalesStockId): Promise<SalesStock | null> {
    const stockKey = `stock:${id}`;
    const allocationsKey = `allocations:${id}`;

    // パイプラインで取得想定
    const stockData = await this.redis.hgetall(stockKey);
    const allocationData = await this.redis.hgetall_allocations(allocationsKey);

    if (!stockData.total) return null;

    // 生データを Allocation オブジェクトに変換
    const allocations = Object.entries(allocationData).map(([uid, timeStr]) => {
      return new Allocation(uid, new Date(parseInt(timeStr)), "Active");
    });

    // SalesStockを復元
    const stock = new SalesStock(
      id,
      parseInt(stockData.version || "1"),
      parseInt(stockData.total),
      allocations
    );

    // ★重要: ロード直後に期限切れチェックを行い、最新の状態にして返す
    // （View側で「実は期限切れ」のものをActiveと誤認させないため）
    return stock.checkTimeout(new Date());
  }

  // 初期データ投入用ヘルパー
  async createStock(id: string, total: number) {
    await this.redis.hset(`stock:${id}`, "total", total.toString());
    await this.redis.hset(`stock:${id}`, "version", "1");
  }
}

// ==========================================
// 3. Main (動作確認)
// ==========================================
(async () => {
  const redis = new MockRedis();
  const repo = new RedisSalesStockRepository(redis);
  const stockId = "item-999";

  // 初期データ: 在庫1個
  await repo.createStock(stockId, 1);
  console.log("--- 初期化: 在庫1 ---");

  // ユーザーAが確保
  try {
    console.log("UserA: 確保を試みます...");
    await repo.allocate(stockId, "user-A", new Date());
    console.log("UserA: 成功!");
  } catch (e: any) {
    console.log(`UserA: 失敗 (${e.message})`);
  }

  // ユーザーBが確保（在庫1なので失敗するはず）
  try {
    console.log("UserB: 確保を試みます...");
    await repo.allocate(stockId, "user-B", new Date());
    console.log("UserB: 成功!");
  } catch (e: any) {
    console.log(`UserB: 失敗 (${e.message})`);
  }

  // 状態確認
  const stock = await repo.findById(stockId);
  console.log(`現在の有効引当数: ${stock?.activeCount}`);
  console.log(`引当内訳:`, stock?.allocations);
})();

export {};
