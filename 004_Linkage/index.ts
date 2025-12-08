/**
 * 候補者の能力
 * 識別子(ID)はこのクラスの関心毎でなく、Entityの関心毎なので、
 */
class CandidateCapabilites {
  constructor(
    public readonly skills: Set<string>, //重複排除のためSet推奨
    public readonly salaryRequest: number
  ) {}

  hasSkill(skill: string): boolean {
    return this.skills.has(skill);
  }
}

// Specification Pattern
interface Reqirement {
  isSatifiedBy(capabilities: CandidateCapabilites): boolean;
}

class SkillRequirement implements Reqirement {
  constructor(private readonly requiredSkill: string) {}

  isSatifiedBy(capabilities: CandidateCapabilites): boolean {
    return capabilities.hasSkill(this.requiredSkill);
  }
}

class SalaryRequirement implements Reqirement {
  constructor(private readonly maxBudget: number) {}
  isSatifiedBy(capabilities: CandidateCapabilites): boolean {
    return capabilities.salaryRequest <= this.maxBudget;
  }
}

/**
 * 重み付き条件
 */
class WeightedRequirement {
  constructor(
    public readonly requirement: Reqirement,
    public readonly weight: number // 例:10点、20点
  ) {}

  calculateScore(capabilities: CandidateCapabilites): number {
    return this.requirement.isSatifiedBy(capabilities) ? this.weight : 0;
  }
}

/**
 * 判定結果(DTO)
 */
class MatchResult {
  constructor(
    public readonly isMatched: boolean,
    public readonly score: number
  ) {}
}

/**
 * 募集要項(Aggregate Root/Entity)
 */
class OfferingRequirements {
  constructor(
    private readonly musts: Reqirement[],
    private readonly wants: WeightedRequirement[]
  ) {}

  evaluate(candidate: CandidateCapabilites): MatchResult {
    for (const req of this.musts) {
      if (!req.isSatifiedBy(candidate)) {
        return new MatchResult(false, 0);
      }
    }

    let totalScore = 0;
    for (const want of this.wants) {
      totalScore += want.calculateScore(candidate);
    }

    return new MatchResult(true, totalScore);
  }
}

// リポジトリ

/**
 * 検索結果表示用の計量モデル(CQRS: Read Model)
 */
interface CandidateSummary {
  id: string;
  name: string;
  matchedScore: number;
  skills: string[];
}

interface CandidateRepository {
  save(candidate: any): Promise<void>;

  /**
   * マッチング検索
   */
  search(requirement: OfferingRequirements): Promise<CandidateSummary[]>;
}
