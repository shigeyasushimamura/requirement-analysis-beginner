// ドメイン層 データ

/**
 * Input
 * 事実：ユーザの購買履歴
 * 不変
 */
export class UserTransactionFact {
  constructor(
    public readonly factId: string,
    public readonly purchaserId: string,
    public readonly itemIDList: string[]
  ) {}
}

/**
 * Output
 * 結果: 付与すべきポイント
 */

export class PointEntry {
  constructor(
    public readonly purchaserId: string,
    public readonly amount: number,
    public readonly sourceFactId: string
  ) {}
}

// ドメイン層 ビジネスロジック
export class PointPolicy {
  /**
   * 事実を受け取り、新しい価値(PointEntity)を計算する
   */
  calculate(fact: UserTransactionFact): PointEntry {
    // 例：アイテム一つにつき10ポイントとか
    let points = fact.itemIDList.length * 10;

    // 例:特定のアイテムが含まれていたらボーナス
    if (fact.itemIDList.includes("premium_item")) {
      points += 50;
    }

    return new PointEntry(fact.purchaserId, points, fact.factId);
  }
}

// アプリケーション層:サービス
export class PointGrantService {
  constructor(
    private readonly pointPolicy: PointPolicy,
    private readonly pointRepo: IPointRepository
  ) {}

  /**
   * ユースケース:購入事実に基づいて、ポイントを付与する
   */
  async grantPoints(fact: UserTransactionFact): Promise<void> {
    const pointEntry = this.pointPolicy.calculate(fact);

    console.log(
      `計算結果: ${pointEntry.amount} ポイント (User: ${pointEntry.purchaserId})`
    );

    if (pointEntry.amount > 0) {
      await this.pointRepo.save(pointEntry);
    }
  }
}

interface DatabaseConnection {
  execute(sql: string, params: Array<any>): void;
}

class TransactionRepository {
  constructor(private readonly db: DatabaseConnection) {}
  async save(fact: UserTransactionFact) {
    await this.db.execute(
      "INSERT into transaction (id, purchaser_id) values (?,?)",
      [fact.factId, fact.purchaserId]
    );
    for (const itemId of fact.itemIDList) {
      await this.db.execute(
        "insert into transaction_item (transaction_id, item_id) values (?,?)",
        [fact.factId, itemId]
      );
    }
  }
}

export interface IPointRepository {
  // Factではなく、PointEntry（結果）を保存することを型で強制
  save(entry: PointEntry): Promise<void>;
}

export class PointRepositoryImpl implements IPointRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async save(entry: PointEntry): Promise<void> {
    const sql = `
      insert into point_history
      (purchaser_id, amount, source_fact_id, created_at)
      values (?,?,?,NOW())
    `;

    const params = [entry.purchaserId, entry.amount, entry.sourceFactId];

    await this.db.execute(sql, params);
  }
}
