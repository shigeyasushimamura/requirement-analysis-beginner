export class TimeRange {
  constructor(public readonly start: Date, public readonly end: Date) {
    if (start >= end)
      throw new Error("終了日時は開始日時より後である必要があります");
  }

  // 重複判定: 「互いに、相手の終了時刻より前に始まっている」状態
  overlaps(other: TimeRange): boolean {
    return this.start < other.end && this.end > other.start;
  }

  // 期間の拡張: startは減算、endは加算
  expand(minutes: number): TimeRange {
    const delta = minutes * 60 * 1000;
    return new TimeRange(
      new Date(this.start.getTime() - delta), // マイナス（前倒し）
      new Date(this.end.getTime() + delta) // プラス（後ろ倒し）
    );
  }

  // ついでにこれも欲しい（後で使います）
  // 指定した日時が期間内に含まれるか
  contains(date: Date): boolean {
    return date >= this.start && date < this.end;
  }
}

// 鍵の解錠権限（Entity または Value Object）
export class LockCredential {
  constructor(
    public readonly roomId: string,
    public readonly validPeriod: TimeRange,
    public readonly pinCode: string
  ) {}
}

export class BookingConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingConflictError";
  }
}

// 予約（Entity - Aggregate Root）
export class Reservation {
  private _status: "PENDING" | "CONFIRMED" | "CANCELLED" = "PENDING";

  constructor(
    public readonly reservationId: string,
    public readonly roomId: string,
    public readonly period: TimeRange
  ) {
    this.pend();
  }

  // 変更点:
  // 1. PINコードは外部から「値」として受け取る（ランダム生成の責任を持たない）
  // 2. roomId や period は自分の情報を使う
  // 3. 「前後5分拡張」というビジネスルールをここで表現する
  public grantLockCredential(pinCode: string): LockCredential {
    // ここにビジネスルールが凝縮されています
    const credentialPeriod = this.period.expand(5);

    return new LockCredential(this.roomId, credentialPeriod, pinCode);
  }

  public confirm() {
    this._status = "CONFIRMED";
  }

  public cancel() {
    this._status = "CANCELLED";
  }

  public pend() {
    this._status = "PENDING";
  }

  get status() {
    return this._status;
  }
}

export interface ReservationRepository {
  save(reservation: Reservation): Promise<void>;
  findById(reservationId: string): Promise<Reservation> | undefined;
}

// export class PostgresReservationRepository implements ReservationRepository {
//   constructor(private pool: Pool) {}

//   async save(reservation: Reservation): Promise<void> {
//     const query = `
//       INSERT INTO reservations (reservation_id, room_id, period, status)
//       VALUES ($1, $2, tstzrange($3, $4, '[)'), $5)
//       ON CONFLICT (reservation_id) DO UPDATE
//       SET status = $5
//     `;

//     try {
//       await this.pool.query(query, [
//         reservation.reservationId,
//         reservation.roomId,
//         reservation.period.start,
//         reservation.period.end,
//         reservation.status
//       ]);
//     } catch (e: any) {
//       // PostgreSQLのエラーコード '23P01' (exclusion_violation) をハンドリング
//       if (e.code === '23P01') {
//         throw new BookingConflictError("指定された時間帯は既に予約が埋まっています。");
//       }
//       throw e;
//     }
//   }

//   async findById(id: string): Promise<Reservation | null> {
//     // 省略：DBから取得して new Reservation() して返す
//     return null;
//   }
// }

export interface SmartLockService {
  apply(lockCredential: LockCredential): Promise<void>;
}

type ReserveCommand = {
  userId: string;
  roomId: string;
  startAt: Date;
  endAt: Date;
};

class ReserveRoomUseCase {
  constructor(
    private reservationRepo: ReservationRepository,
    private smartLockService: SmartLockService
  ) {}

  public async execute(command: ReserveCommand): Promise<void> {
    const timeRange = new TimeRange(command.startAt, command.endAt);
    const reservation = new Reservation(
      crypto.randomUUID(),
      command.roomId,
      timeRange
    );

    const pin = this.generatePinCode();
    const lockCredential = reservation.grantLockCredential(pin);
    await this.reservationRepo.save(reservation);
    try {
      await this.smartLockService.apply(lockCredential);
      reservation.confirm();
      await this.reservationRepo.save(reservation);
    } catch (e) {
      reservation.cancel();
      await this.reservationRepo.save(reservation);
      throw e;
    }
  }

  private generatePinCode() {
    return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  }
}
