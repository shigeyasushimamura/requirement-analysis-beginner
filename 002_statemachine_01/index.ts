type ReviewOutcome =
  | { type: "Approved" }
  | { type: "Rejected" }
  | { type: "Remanded"; returnToStepIndex?: number };

/**
 * 値オブジェクト: 承認フロー
 */
interface ApprovalStep {
  approvalId: string;
  isCompleted: boolean;
}

class ApprovalFlow {
  private readonly steps: ApprovalStep[];
  private readonly currentStepIndex: number;
  private readonly _isRejected: boolean;

  private constructor(
    steps: ApprovalStep[],
    currentStepIndex: number,
    isRejected: boolean
  ) {
    this.steps = steps;
    this.currentStepIndex = currentStepIndex;
    this._isRejected = isRejected;
  }

  static create(approvalIds: string[]): ApprovalFlow {
    if (approvalIds.length === 0)
      throw new Error("承認者がないとフローが作れない");

    const steps = approvalIds.map((id) => ({
      approvalId: id,
      isCompleted: false,
    }));
    return new ApprovalFlow(steps, 0, false);
  }

  static reconstitute(
    steps: ApprovalStep[],
    currentStepIndex: number,
    isRejected: boolean
  ) {
    //TODO:整合性チェック
    return new ApprovalFlow(steps, currentStepIndex, isRejected);
  }

  // ビジネスロジック
  isCurrentApprover(actorId: string): boolean {
    if (this.isFinished()) return false;
    return this.steps[this.currentStepIndex].approvalId === actorId;
  }

  isFinished(): boolean {
    return this._isRejected || this.currentStepIndex >= this.steps.length;
  }

  isRejectedStatus(): boolean {
    return this._isRejected;
  }

  proceed(outcom: ReviewOutcome): ApprovalFlow {
    // step情報を不変性を守るためコピー
    const nextSteps = this.steps.map((s) => ({ ...s }));
    switch (outcom.type) {
      case "Approved":
        nextSteps[this.currentStepIndex].isCompleted = true;
        return new ApprovalFlow(nextSteps, this.currentStepIndex + 1, false);
      case "Rejected":
        return new ApprovalFlow(nextSteps, this.currentStepIndex + 1, false);
      case "Remanded":
        let targetIndex = outcom.returnToStepIndex ?? 0;
        if (targetIndex < 0 || targetIndex > this.currentStepIndex) {
          targetIndex = 0;
        }
        const resetSteps = nextSteps.map((step, idx) => ({
          ...step,
          isCompleted: idx < targetIndex,
        }));
        return new ApprovalFlow(resetSteps, targetIndex, false);
    }
  }
}

class ExpenseClaim {
  private readonly id: string;
  private readonly applicantId: string;
  private readonly amount: number;
  private flow: ApprovalFlow;
  private status: "InReview" | "Authorized" | "Remanded" | "Rejected";

  private constructor(
    id: string,
    applicantId: string,
    amount: number,
    flow: ApprovalFlow
  ) {
    this.id = id;
    this.applicantId = applicantId;
    this.amount = amount;
    this.flow = flow;
    this.status = "InReview"; // 生成時は審査中スタート（またはDraft）
  }

  public static create(
    applicantId: string,
    amount: number,
    flow: ApprovalFlow
  ): ExpenseClaim {
    const newId = crypto.randomUUID();
    return new ExpenseClaim(newId, applicantId, amount, flow);
  }

  public review(actorId: string, outcome: ReviewOutcome) {
    if (!this.flow.isCurrentApprover(actorId)) {
      throw new Error("現在の担当者ではない");
    }

    // Flowを進める
    this.flow = this.flow.proceed(outcome);

    // Flowの状態を見て、請求自体のステータスを更新
    // ドメインエキスパート注: ここで「誰かが却下したら即Rejected」などのルールが決まる
    if (this.flow.isRejectedStatus()) {
      this.status = "Rejected";
    } else if (this.flow.isFinished()) {
      this.status = "Authorized";
    } else if (outcome.type === "Remanded") {
      this.status = "Remanded";
    } else {
      this.status = "InReview";
    }
  }
}
