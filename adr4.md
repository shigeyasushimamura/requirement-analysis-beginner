# ADR-004: Transactional Outbox Pattern によるイベント配送の信頼性担保

- **Status:** Accepted
- **Date:** 2025-12-24

# Context

- ステータス更新(DB)と、通知・分析へのイベント送信(Message Queue)をアトミックに行う必要がある
- DB 更新後に MQ 送信が失敗した場合、システム間でデータ不整合が発生する

# Decision

- Transactional Outbox Pattern: エンティティの更新と同時に、同じ DB トランザクション内で Outbox テーブルにイベントを書き込む
- Message Relayer: 別プロセスのポーリングまたは CDC(Change Data Capture)により、Outbox から MQ(Kafka 等)へイベントを確実にパブリッシュする

# Consequence

- Positive: 2PC(2 相コミット)を使わずに、DB と MQ の間で「少なくとも 1 回」の配信を保証できる
- Negative: Outbox パターンのクリーンアップ処理が必要
