-- 1. 拡張機能の有効化
-- UUIDとRange型の組み合わせでGISTインデックスを使うために必要です
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. テーブル作成
CREATE TABLE reservations (
    -- IDにはUUID推奨
    reservation_id UUID PRIMARY KEY,
    
    -- 外部キー制約（roomsテーブルがある想定）
    room_id UUID NOT NULL,
    
    -- 期間データ: タイムゾーン付きの範囲型
    -- Userの入力した start_at, end_at はここに格納されます
    period tstzrange NOT NULL,
    
    -- ステータス管理
    status VARCHAR(50) NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED')),
    
    -- 作成日時（バッチでの救済処理用）
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 【核心】排他制約 (Exclusion Constraint)
    -- 意味: 「同じroom_id」かつ「periodが重複(&&)」するレコードはお断り
    CONSTRAINT no_double_booking EXCLUDE USING GIST (
        room_id WITH =,
        period WITH &&
    )
);

-- 3. インデックス（検索用）
-- GISTインデックスは排他制御だけでなく、範囲検索も高速化します
-- "この期間を含む予約はあるか？" などのクエリに有効です
CREATE INDEX idx_reservations_period ON reservations USING GIST (period);
CREATE INDEX idx_reservations_status ON reservations (status);