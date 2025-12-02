# Domain 層

ドメインのビジネスロジックを語る

## 情報粒度

### 大

Domain Service 複数のルールを束ねる業務フロー

### 中

- Policy/Rule 　特定の計算・判断ロジック
- Repository IF データの出し入れの契約

### 小

Entity/VO 最小単位のデータと振る舞い

# Application 層

クライアントの要求にこたえる

## 情報粒度

### 大

UseCase Client の要求(ストーリー)を実現する進行役

### 中

Port/Interface 特定の役割(外部詳細の契約)

### 小

DTO/Command 処理の入出力となるデータの入れ物。振る舞いは最小限

# Infra 層

外部詳細
