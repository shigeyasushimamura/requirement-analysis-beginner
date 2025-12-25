// 配送状態の型定義
type DeliveryStatus =
  | "PENDING"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "RETURNED";

// 端末側で生成されるイベントのメタデータ
interface TransitEvent {
  readonly id: string;
  readonly shipmentId: string;
  readonly status: DeliveryStatus;
  readonly sequenceNumber: number; // 順序制御の要
  readonly occurredAt: Date;
  readonly locationId: string;
  readonly signature: string; // 改ざん防止
}

class Shipment {
  private currentStatus: DeliveryStatus = "PENDING";
  private lastSequenceNumber: number = 0;
  private eventLogs: TransitEvent[] = [];

  constructor(public readonly id: string) {}

  /**
   * ビジネスルール：イベントの適用
   * 「追い越し問題」を考慮した状態遷移ロジック
   */
  public applyEvent(event: TransitEvent): void {
    // 1. 署名検証（セキュリティ）
    if (!this.verifySignature(event)) throw new Error("Invalid signature");

    // 2. 順序制御：古いシーケンス番号のイベントが来ても、状態は更新しない（ログには残す）
    if (event.sequenceNumber > this.lastSequenceNumber) {
      // 3. 状態遷移のガードルール（例：完了後は戻せない等）
      if (this.canTransitionTo(event.status)) {
        this.currentStatus = event.status;
        this.lastSequenceNumber = event.sequenceNumber;
      }
    }

    this.eventLogs.push(event);
  }

  private canTransitionTo(next: DeliveryStatus): boolean {
    if (this.currentStatus === "DELIVERED") return false; // 完了後のステータス変更は不可
    return true;
  }

  private verifySignature(event: TransitEvent): boolean {
    // インフラ層のGatewayを通じて署名を検証するロジック（実際はDIPでインターフェース化）
    return true;
  }
}
