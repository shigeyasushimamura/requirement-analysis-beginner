// 値オブジェクトとしての Allocation (完全不変)
class Allocation {
  constructor(
    public readonly userId: string,
    public readonly setupTime: Date,
    public readonly status: "Active" | "Expired" | "Sold" = "Active"
  ) {}

  // 判定だけを行う（副作用なし）
  // ※メソッド名を isExpired? にするなら boolean を返すべきですが、
  //   ここは「期限切れかどうかチェックして、新しい状態を返す」責務にします。
  checkExpiry(now: Date): Allocation {
    // 既にActiveじゃないなら何もしない
    if (this.status !== "Active") {
      return this;
    }

    // 期限切れ判定 (10分 = 600,000ms)
    const isTimeout = now.getTime() - this.setupTime.getTime() > 600000;

    if (isTimeout) {
      // ★重要: 状態を変えた「新しいインスタンス」を返す
      return new Allocation(this.userId, this.setupTime, "Expired");
    }

    // 変化なしなら自分自身を返す
    return this;
  }
}

// 集約ルートとしての SalesStock
class SalesStock {
  constructor(
    public readonly id: string,
    public readonly version: number,
    public readonly total: number,
    public readonly allocations: Allocation[] = []
  ) {
    // コンストラクタでのガード節（不変条件の維持）
    if (this.countActive() > total) {
      throw new Error("システムエラー: 有効引当数が在庫上限を超えています");
    }
  }

  // 残り在庫数の計算（Expiredは除外する！）
  private countActive(): number {
    return this.allocations.filter((a) => a.status === "Active").length;
  }

  // 在庫があるかどうかの判定
  canAllocate(): boolean {
    return this.countActive() < this.total;
  }

  // 既にこのユーザーが確保済みか
  hasActiveAllocation(userId: string): boolean {
    return this.allocations.some(
      (a) => a.userId === userId && a.status === "Active"
    );
  }

  // 引当操作
  allocate(userId: string, now: Date): SalesStock {
    if (this.hasActiveAllocation(userId)) {
      throw new Error("既に有効な引当があります");
    }
    if (!this.canAllocate()) {
      throw new Error("在庫不足");
    }

    const newAllocation = new Allocation(userId, now, "Active");
    // 新しいリストを作って新しいStockを返す
    return new SalesStock(this.id, this.version, this.total, [
      ...this.allocations,
      newAllocation,
    ]);
  }

  // 期限切れチェック操作
  checkTimeout(now: Date): SalesStock {
    // 全てのAllocationに対して再計算を行い、変化があれば新しいインスタンスになる
    const updatedAllocations = this.allocations.map((a) => a.checkExpiry(now));

    return new SalesStock(
      this.id,
      this.version,
      this.total,
      updatedAllocations
    );
  }
}

interface ISalesStockRepository {
  save(salesstock: SalesStock): Promise<void>;
  findById(id: string): Promise<SalesStock | null>;
}

export {};
