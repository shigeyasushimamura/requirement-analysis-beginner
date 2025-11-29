# ドメインモデリング練習：会議室予約システム

## 1. 概要

- **テーマ:** 社内会議室予約システム（簡易版）
- **焦点:** ドメインモデルの貧血症対策、リポジトリとの境界、整合性の担保
- **実施日:** 2025/11/26

## 2. 要件定義（ヒアリング結果）

- 会議室は「Room A」「Room B」「Room C」の 3 つ。
- 予約は「1 時間単位」かつ「正時（00 分）スタート」のみ。
- **絶対ルール:** 同じ会議室・同じ時間帯の重複予約は禁止。
- 過去の予約は不可。

## 3. モデリングと実装（TypeScript）

### A. Value Object: `ReservationTimeSlot`

予約の時間枠を表現。

**設計のポイント:**

- **完全コンストラクタ:** 不正な値（1 時間でない、分が 00 でないなど）でのインスタンス生成を阻止。
- **不変性 (Immutability):** Setter を排除し、`readonly`にすることで意図しない書き換えを防ぐ。

```typescript
export class ReservationTimeSlot {
  public readonly startAt: Date;
  public readonly endAt: Date;

  constructor(startAt: Date) {
    if (startAt.getMinutes() !== 0) {
      throw new Error("予約は正時（00分）開始である必要があります。");
    }
    this.startAt = new Date(startAt.getTime());
    // 期間は1時間固定というルールをここで強制
    this.endAt = new Date(this.startAt.getTime() + 60 * 60 * 1000);
  }
}
```

### B. Entity: Reservation

予約そのものを表現。

設計のポイント:

- ID（同一性）を持つ。
- 自分自身の構造的な整合性のみをチェック（部屋名があるか等）。
- 他の予約との重複チェックはここには含めない（Repository への依存を避けるため）。

```typescript
export class Reservation {
  public readonly id: string;
  public readonly roomName: string;
  public readonly slot: ReservationTimeSlot;

  constructor(roomName: string, slot: ReservationTimeSlot, id?: string) {
    this.id = id || crypto.randomUUID();
    if (!roomName) throw new Error("部屋名は必須です。");
    this.roomName = roomName;
    this.slot = slot;
  }
}
```

### C. Domain Service: ReservationDomainService

「重複禁止」とういうドメインルールを表現。

**設計のポイント**:

- Entity 単体では判断できない「集合に対するルール」を扱う
- Repository インターフェースを利用して、永続化層に問い合わせる

```typescript
export class ReservationDomainService {
  constructor(private readonly reservationRepo: IReservationRepository) {}

  async canReserve(reservation: Reservation): Promise<boolean> {
    const existing = await this.reservationRepo.find(
      reservation.roomName,
      reservation.slot
    );
    return existing === null;
  }
}
```

## 4 アーキテクチャ・ディスカッション

### Q. 書き込みスキューによる重複予約をどう防ぐ？

チェック時点と書き込み時点のタイムラグで、並行リクエスト時に重複が発生するリスクがある

**議論された解決策**

- アプリ側のロック(悲観的ロックなど): 実装が複雑になり、パフォーマンス悪化が激しい
- **DB のユニーク制約(採用)**: `(room_id, start_at)`に対してユニークキーを付ける。アプリ側はエラーをハンドリングして、ユーザに通知するだけで済む

### Q. Repository の責務は？

- トランザクション管理(Commit/Rollback)は Repository の責務ではなく、アプリケーションサービスの責務
- Repository はあくまで「ドメインオブジェクトのコレクション」としてふるまう。
