# 候補者側(Candidates)

`CandidateCapabilities`を永続化する

| TableName        | Column         | Type    | Note                     |
| ---------------- | -------------- | ------- | ------------------------ |
| candidates       | id             | UUID    | PK                       |
|                  | name           | varchar |                          |
|                  | request_salary | int     | 希望年収                 |
| candidate_skills | candidate_id   | UUID    | FK                       |
|                  | skill_name     | carchar | スキル名("JAVA","AWS"等) |

# 募集要項側(Job Offerings)

`OfferingRequirements`は構造が複雑(Must/Want)のリストなので、これをどう保存するかは 2 つの流派がある

## 案 1: 完全な正規化。クエリで分析したい場合に有利

| TableName        | Column         | Type    | Note                             |
| ---------------- | -------------- | ------- | -------------------------------- |
| job_posting      | id             | UUID    | PK(募集 ID)                      |
|                  | title          | varchar | 募集タイトル                     |
| job_requirements | id             | UUID    | PK                               |
|                  | job_posting_id | UUID    | FK                               |
|                  | type           | ENUM    | 'MUST' or 'WANT'                 |
|                  | category       | ENUM    | 'SKILL'or'SALARY',etc            |
|                  | parameter      | varchar | 条件値('JaVa','8000000')         |
|                  | weight         | int     | Must なら 0(無視)、Want なら点数 |

## 案 2: JSON 保存(ドキュメント指向なアプローチ)

`OfferingRequirements`をひとつの塊(Aggregate)とみなし、再構築の容易さを優先する場合、最近の PostgresSQL などでは、こちらが主流になりつつある。

| TableName    | Column            | Type    | Note                                   |
| ------------ | ----------------- | ------- | -------------------------------------- |
| job_postings | id                | UUID    | PK                                     |
|              | title             | varchar |                                        |
|              | requirements_json | JSONB   | オブジェクトをそのまま JSON 化して保存 |

今回の検索ロジックでは RDB の SQL で頑張るのではなく、アプリメモリ上や検索エンジン側で行う方針。その場合は RDB 側は複雑な JOIN を避けて、案 2(JSONB)を採用して、シンプルに「保存・復元」できるようにする構成が、開発スピードとパフォーマンスのバランスが良い。

# 検索エンジン(Elasticsearch/OpenSearch)を使うか、JSONB を使うかの判断基準

「転置インデックス」を持つ検索エンジンが RDB(JSONB)にいつ有利になるか

**PostgreSQL(JSONB)で十分な場合**

- データ件数が数十万件以下
- あるいは,Must 条件が厳しく、ヒット数が常に数千件いかに絞り込まれることが保証されている
- Want 条件(重みづけ)が単純か、不要な場合
- インフラを増やしたくない(RDB 一本で)

**Elastic Search が必須になる場合**

- データ総数が数百万～数億件
- 「東京」のような、ヒット数が膨大になる検索条件がある(検索結果が数万件以上とか)。
- 複雑な重みづけ(Want 条件)や、全文検索(あいまい検索)が必要
- 「ユーザがスライダーを動かしたら瞬時に再検索」のような、低レイテンシ体験を提供したい

今回の「求人マッチング」で、特に「採用担当者が条件をいじってリアルタイムに再計算」という体験を重視するなら、JSONB はヒット数が多いときにかくつきが発生する。ヌルヌル動くような UX 体験を目指すなら、ElasticSearch などが良い。

### Want 条件のスコアリング計算

```sql
SELECT id, name, data,
  -- ここで計算が発生する
  (CASE WHEN data->'skills' ? 'AWS' THEN 10 ELSE 0 END +
   CASE WHEN data->'skills' ? 'English' THEN 20 ELSE 0 END) AS score
FROM candidates
-- 1. ここはGINインデックスで速い
WHERE data @> '{"location": "Tokyo", "skills": ["Java"]}'
-- 2. ここが重い！
ORDER BY score DESC
LIMIT 50;
```

### 全文検索エンジンのクエリイメージ

```json
GET /candidates/_search
{
  "query": {
    "bool": {
      // --- 1. Must (足切り) ---
      // "filter" コンテキスト:
      // スコア計算には影響せず、「Yes/No」だけで高速に絞り込む。
      // 結果はキャッシュされ、爆速で動作する。
      "filter": [
        { "term": { "skills": "Java" } },
        { "term": { "location": "Tokyo" } },
        { "range": { "salary_request": { "lte": 8000000 } } }
      ],

      // --- 2. Want (加点) ---
      // "should" コンテキスト:
      // 条件に合えばスコアが加算される。合わなくても除外はされない。
      // "boost" が我々の設計した "Weight" に相当する。
      "should": [
        {
          "term": { "skills": "AWS" },
          "boost": 10 // AWSがあればスコア +10
        },
        {
          "term": { "skills": "English" },
          "boost": 20 // 英語があればスコア +20
        }
      ]
    }
  },
  // スコアが高い順にソート（デフォルト挙動だが明示）
  "sort": [
    { "_score": { "order": "desc" } }
  ]
}
```
