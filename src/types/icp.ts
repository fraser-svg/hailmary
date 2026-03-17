/**
 * ICP (Ideal Customer Profile) types for company discovery and fit scoring.
 *
 * These types define the contract for discovery skill output.
 * The skill writes JSON conforming to DiscoveryRun; batch-analyse.ts reads it.
 *
 * ICP criteria themselves live in the skill's SKILL.md (single source of truth).
 */

/** Fit score per ICP dimension: 0 = miss, 1 = partial, 2 = match */
export type DimensionScore = 0 | 1 | 2;

export interface ICPScore {
  geography: DimensionScore;
  arr_range: DimensionScore;
  stage: DimensionScore;
  category: DimensionScore;
  messy_growth: DimensionScore;
  evidence_depth: DimensionScore;
  /** Sum of all dimensions, max 12 */
  total: number;
  /** true when total >= qualification threshold */
  qualified: boolean;
  confidence: 'low' | 'medium' | 'high';
  /** Per-dimension scoring rationale */
  notes: string[];
}

export interface ScoredCompany {
  name: string;
  domain: string;
  /** Which VC portfolio surfaced this company */
  source_investor: string;
  /** Portfolio page or search result URL */
  source_url: string;
  score: ICPScore;
  discovered_at: string;
  /** Raw signals from WebSearch used for scoring */
  raw_signals: Record<string, string>;
}

export interface DiscoveryRun {
  run_id: string;
  discovered_at: string;
  investors_searched: string[];
  candidates_found: number;
  candidates_qualified: number;
  qualification_threshold: number;
  companies: ScoredCompany[];
}
