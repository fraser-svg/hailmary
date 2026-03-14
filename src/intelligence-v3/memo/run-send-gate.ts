/**
 * Run Send Gate — V3-M6
 * Spec: docs/specs/intelligence-engine-v3/006_send_gate_spec.md
 *
 * Final binary gate. Fully deterministic — no LLM call.
 * Produces: result ("pass" | "fail") + memo_quality_score (0–100).
 *
 * Six criteria (all must pass):
 *   1. critic_overall_pass    — criticResult.overall_pass = true
 *   2. evidence_ref_count     — memo.evidence_ids.length >= 3
 *   3. adjudication_not_aborted — adjudication.adjudication_mode !== "abort"
 *   4. no_banned_phrases      — independent banned phrase scan on memo.markdown
 *   5. cta_present_singular   — cta section present, ≤50 words
 *   6. word_count_in_range    — 300 ≤ word_count ≤ 850
 *
 * Hard failures (never overridable):
 *   - Genericity test failed
 *   - evidence_ids.length < 2
 *   - adjudication mode = abort
 *   - Banned phrase detected
 *   - word_count > 850 or < 200
 *
 * Quality score derivation (0–100):
 *   critic_dimensions        40 pts (4 × score × 2)
 *   evidence_ref_count       20 pts
 *   word_count_target_range  15 pts
 *   genericity_test          15 pts
 *   founder_pushback_severity 10 pts
 */

import type { MarkdownMemo } from "../types/memo";
import type { MemoCriticResult } from "../types/memo-critic";
import type { AdjudicationResult } from "../types/adjudication";
import type { EvidencePack } from "../types/evidence-pack";
import type { SendGateResult } from "../types/send-gate";
import { BANNED_PHRASES } from "./build-memo-brief";

export interface RunSendGateInput {
  memo: MarkdownMemo;
  criticResult: MemoCriticResult;
  adjudication: AdjudicationResult;
  evidencePack: EvidencePack;
}

/**
 * Evaluate the memo against all 6 gate criteria and compute quality score.
 *
 * TODO: Implement
 * - Evaluate each of the 6 criteria; classify failures as hard or conditional
 * - Run independent banned phrase scan using BANNED_PHRASES list
 * - Compute memo_quality_score (0–100) per spec formula
 * - result = "pass" only if all 6 criteria pass
 * - Populate blocking_reasons and has_hard_failures on failure
 * - Set ready_to_send = true and passed_at on pass
 * - Build GateSummary with human-readable recommendation
 */
export function runSendGate(input: RunSendGateInput): SendGateResult {
  // TODO: implement
  throw new Error("Not implemented: runSendGate");
}
