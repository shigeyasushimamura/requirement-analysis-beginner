dto はクライアント要求側の都合？じゃあいつつかう？port からとるとか、わたすとき？

その通りです！ DTO（Data Transfer Object）は、完全に**「クライアント（画面や API 利用者）の都合」**で作るものです。

「いつ使うか？」というと、**「アプリケーション層の玄関（入り口と出口）」**で使います。

もっと具体的に言うと、「UseCase（進行役）」が、外の世界と会話するときに使います。

図とコードで「DTO の活動限界エリア」を見ると一発でわかります。

1.  DTO が活躍する場所（活動限界図）
    DTO は**「UseCase」まで**しか入れません。ドメイン層（Service や Policy）には絶対に入れてはいけません。

        2. 「いつ使う？」の答え

    ① 入力時（Input）：Port から受け取るとき
    クライアントからリクエストが来た瞬間です。

いつ: Controller が UseCase を呼ぶとき。

なぜ: クライアントは「ドメインの複雑なルール」を知らないので、単純な JSON（DTO）しか送れないからです。

```typescript
// 【小】DTO: クライアントが送ってくる単純なデータ
export class GrantPointInputDto {
  userId: string;
  itemIds: string[]; // ただの文字列の配列
}

// 【大】UseCase
export class GrantPointUseCase {
  // ★ここで DTO を受け取る！
  async execute(input: GrantPointInputDto): Promise<void> {
    // ★ここで DTO を Domain Entity に「翻訳」する！
    // (バリデーションなどは Entity 生成時に走る)
    const fact = new UserTransactionFact(input.userId, input.itemIds);

    // ドメイン層には Entity (fact) を渡す。DTOは渡さない。
    await this.domainService.grant(fact);
  }
}
```

② 出力時（Output）：Port へ返すとき
処理が終わって、結果をクライアントに返す瞬間です。

いつ: UseCase が Controller (Client) に戻り値を返すとき。

なぜ: ドメインオブジェクト（Entity）をそのまま返すと、画面に不要なデータが含まれていたり、循環参照でエラーになったりするからです。

```typescript
// 【小】DTO: クライアントに見せたいデータだけの箱
export class GrantPointOutputDto {
  grantedPoints: number;
  message: string;
}

// 【大】UseCase
export class GrantPointUseCase {
  async execute(...): Promise<GrantPointOutputDto> {
    // ...計算処理...
    const pointEntry = ...; // これは Entity

    // ★ここで Entity を DTO に「翻訳」して返す！
    return new GrantPointOutputDto({
      grantedPoints: pointEntry.amount,
      message: '付与しました'
    });
  }
}
```

3. 注意：Infrastructure の Port（メールなど）では？
   先ほどの議論にあった IMailNotifier（中：Port）などの場合、ここでも DTO に似たものを使うことがありますが、それは**「クライアント用 DTO」とは別物**にするのが理想です。

Controller 用の DTO: GrantPointInput (画面の都合)

Mail 用の DTO: MailSendCommand (メールの都合)

混ぜると、「画面の項目を変えたら、なぜかメール送信が壊れた」という事故が起きるからです。

まとめ
DTO は誰の都合？: クライアント（画面・API）の都合。

いつ使う？:

入る時: Controller → UseCase に渡すとき。

出る時: UseCase → Controller に返すとき。

どこで消える？: UseCase の中で Entity に変換された瞬間に役目を終えて消えます。ドメイン層の奥（Service, Policy, Repo）には連れて行きません。
