# ADR-003: 17 万 QPS の読み取りを捌く多層キャッシュ戦略

- **Status:** Accepted
- **Date:** 2025-12-24

# Context

- ピーク時に 170000QPS に達する Read 要求を RDB だけで処理することはパフォーマンスの面で厳しい
- ユーザ(受取人)へのレスポンスは 10 秒以内が非機能要件として求められる

# Decision

- CDN/Edge Caching: 一般公開の追跡ページ(Read の大部分)に対し、エッジサーバーで短時間(10~30 秒)の TTL を設定する
- Redis Cache: API サーバ層の直前に、配送中の荷物データを保持する Redis を配置し、DB アクセスを回避する
- CQRS: 更新系(Write)と参照系(Read)を物理的に分離して、参照系は Read Replica を通して提供する

# Consequence

- Positive: DB 負荷を劇的に軽減して、グローバルでの低レイテンシ閲覧を実現
- Negative: 書き込みから反映までに数秒の遅延(レプリケーションラグやキャッシュ TTL)が発生する結果整合性を受け入れる必要がある
