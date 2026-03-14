/**
 * Adjudication Types — V3 Memo Layer
 * Spec: docs/specs/intelligence-engine-v3/004_adjudication_spec.md
 *
 * Adjudication is a confidence gate (stage V3-M2) that runs after buildEvidencePack()
 * and before buildMemoBrief(). It determines the epistemic framing mode for the memo.
 * Fully deterministic — no LLM call.
 */

/**
 * The adjudication mode determines how assertively the memo may state the diagnosis.
 * - full_confidence: assertive framing ("This company has X problem")
 * - conditional: indicative framing ("The evidence points to X")
 * - exploratory: hypothesis framing ("There are signs that X may be happening")
 * - abort: do not generate a memo; surface AdjudicationReport instead
 */
export type AdjudicationMode =
  | "full_confidence"
  | "conditional"
  | "exploratory"
  | "abort";

/**
 * The framing instruction passed to MemoBrief.
 * Maps 1:1 with AdjudicationMode (except abort → blocked).
 */
export type MemoFraming =
  | "assertive"
  | "indicative"
  | "hypothesis"
  | "blocked";

/** Result of the diagnosis confidence check (Check 1) */
export interface DiagnosisConfidenceCheck {
  v2_confidence: "low" | "medium" | "high";
  points: 0 | 2 | 3;
}

/** Result of the evidence pack coverage check (Check 2) */
export interface EvidenceCoverageCheck {
  coverage_assessment: "strong" | "adequate" | "weak" | "insufficient";
  points: 0 | 1 | 2 | 3;
}

/** Result of the source diversity check (Check 3) */
export interface SourceDiversityCheck {
  distinct_tiers: number;
  has_tier2_or_3: boolean;
  points: 0 | 1 | 2;
}

/** Result of the competing archetype gap check (Check 4) */
export interface ArchetypeGapCheck {
  winning_score: number;
  runner_up_score: number;
  gap: number;
  points: 0 | 1 | 2;
}

/** All 4 check results bundled */
export interface AdjudicationChecks {
  diagnosis_confidence: DiagnosisConfidenceCheck;
  evidence_pack_coverage: EvidenceCoverageCheck;
  source_diversity: SourceDiversityCheck;
  competing_archetype_gap: ArchetypeGapCheck;
  total_points: number;   // Sum of all check points (max: 10)
}

/**
 * Diagnostic report surfaced when adjudication mode = "abort".
 * Explains why the memo could not be written and suggests upstream improvements.
 */
export interface AdjudicationReport {
  company_id: string;
  generated_at: string;
  total_points: number;
  mode: "abort";
  blocking_reasons: string[];
  improvement_suggestions: string[];
}

/**
 * AdjudicationResult — output of adjudicateDiagnosis().
 * Consumed by buildMemoBrief().
 */
export interface AdjudicationResult {
  result_id: string;             // "adj_<company_id>_<timestamp>"
  company_id: string;
  adjudicated_at: string;

  adjudication_mode: AdjudicationMode;
  diagnosis_id: string;

  checks: AdjudicationChecks;
  recommended_memo_framing: MemoFraming;

  // Only populated when mode = "abort"
  adjudication_report?: AdjudicationReport;

  // Only populated when mode = "conditional" or "exploratory"
  confidence_caveats?: string[];   // Statements the memo may not assert as fact
}
