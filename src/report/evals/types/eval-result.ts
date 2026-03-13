/**
 * Eval result types — scoring outputs written to results/.
 */

export interface MatchDetail {
  expected_title: string;
  matched: boolean;
  matched_to?: string;
}

export interface ViolationDetail {
  rule: string;
  violated: boolean;
  violated_by?: string;
}

export interface CategoryScore {
  expected: number;
  matched: number;
  details: MatchDetail[];
}

export interface ViolationScore {
  checked: number;
  violations: number;
  details: ViolationDetail[];
}

export interface StageScore {
  stage: string;
  must_detect: CategoryScore;
  nice_to_detect: CategoryScore;
  must_avoid: ViolationScore;
  passed: boolean;
}

export interface FixtureResult {
  fixture_id: string;
  ran_at: string;
  stages: StageScore[];
  passed: boolean;
}
