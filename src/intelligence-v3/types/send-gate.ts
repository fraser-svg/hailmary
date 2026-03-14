/**
 * Send Gate Types — V3 Memo Layer
 * Spec: docs/specs/intelligence-engine-v3/006_send_gate_spec.md
 *
 * SendGateResult is the final binary output of the V3 pipeline.
 * A memo is either "pass" (ready_to_send) or "fail" (blocked with reasons).
 *
 * Produces two outputs:
 * - result: "pass" | "fail"
 * - memo_quality_score: 0–100 (computed even on fail, for diagnostics)
 */

/** The 6 gate criteria identifiers */
export type GateCriterion =
  | "critic_overall_pass"
  | "evidence_ref_count"
  | "adjudication_not_aborted"
  | "no_banned_phrases"
  | "cta_present_singular"
  | "word_count_in_range";

/** Result of a single gate criterion evaluation */
export interface GateCriteriaResult {
  criterion_id: GateCriterion;
  pass: boolean;
  failure_type?: "hard" | "conditional";   // Only present when pass = false
  observed_value: string | number | boolean;
  threshold: string;
  notes?: string;
}

/** A single blocking reason on gate failure */
export interface BlockingReason {
  criterion_id: GateCriterion;
  failure_type: "hard" | "conditional";
  description: string;
}

/** Human-readable summary of the gate outcome */
export interface GateSummary {
  total_criteria: 6;
  criteria_passed: number;
  criteria_failed: number;
  hard_failures: number;
  conditional_failures: number;
  memo_quality_score: number;
  recommendation: string;
}

/**
 * SendGateResult — final output of the V3 pipeline.
 * Produced by runSendGate(). This is the artifact consulted before sending.
 */
export interface SendGateResult {
  gate_id: string;                    // "gate_<company_id>_<timestamp>"
  company_id: string;
  memo_id: string;
  evaluated_at: string;

  result: "pass" | "fail";
  memo_quality_score: number;         // 0–100

  // Populated on pass
  passed_at?: string;
  ready_to_send?: boolean;            // Always true when result = "pass"

  // Populated on fail
  blocking_reasons?: BlockingReason[];
  has_hard_failures: boolean;

  // Always present
  gate_summary: GateSummary;
  criteria_results: GateCriteriaResult[];
}
