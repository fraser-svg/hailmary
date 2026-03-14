/**
 * Memo Critic Types — V3 Memo Layer
 * Spec: docs/specs/intelligence-engine-v3/005_memo_spec.md (Sub-Stage C)
 *
 * MemoCriticResult is the output of criticiseMemo() — an adversarial LLM evaluation
 * of the generated memo. The critic's default posture is to find problems.
 *
 * The critic evaluates 4 scoring dimensions (0–5 each, pass ≥ 3) plus
 * 2 named explicit tests: the Genericity Test and the Founder Pushback Test.
 */

import type { RevisionInstructions } from "./memo-brief";

/** Score for a single critic evaluation dimension */
export interface DimensionScore {
  score: 0 | 1 | 2 | 3 | 4 | 5;
  pass: boolean;           // true if score >= 3
  notes: string;           // Critic's brief explanation
}

/**
 * Genericity Test — Named Test 1
 * "Could this memo plausibly be sent to another SaaS company?"
 * Binary pass/fail. Failure is always a hard failure at the send gate.
 */
export interface GenericityTest {
  result: "pass" | "fail";
  reasoning: string;       // 1–2 sentence explanation from the critic
}

/**
 * Founder Pushback Test — Named Test 2
 * "What would the founder say is wrong here?"
 * Adversarial simulation identifying the memo's weakest claim.
 * Does not directly gate the memo, but feeds revision instructions.
 */
export interface FounderPushbackTest {
  most_vulnerable_claim: string;
  likely_objection: string;
  severity: "low" | "medium" | "high";
  revision_suggestion?: string;
}

/**
 * MemoCriticResult — output of criticiseMemo().
 * overall_pass = true only if all 4 dimensions ≥ 3 AND genericity_test = "pass".
 */
export interface MemoCriticResult {
  critic_id: string;             // "critic_<company_id>_<timestamp>"
  memo_id: string;
  evaluated_at: string;
  attempt_number: 1 | 2;

  dimensions: {
    evidence_grounding: DimensionScore;
    commercial_sharpness: DimensionScore;
    cta_clarity: DimensionScore;
    tone_compliance: DimensionScore;
  };

  genericity_test: GenericityTest;
  founder_pushback_test: FounderPushbackTest;

  overall_pass: boolean;
  revision_instructions?: RevisionInstructions;  // Populated when overall_pass = false
}
