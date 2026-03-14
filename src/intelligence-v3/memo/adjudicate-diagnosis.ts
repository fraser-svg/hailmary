/**
 * Diagnosis Adjudication — V3-M2
 * Spec: docs/specs/intelligence-engine-v3/004_adjudication_spec.md
 *
 * Confidence gate before memo commitment. Fully deterministic — no LLM call.
 *
 * Four checks (max 10 points total):
 *   Check 1 — Diagnosis confidence (0/2/3 pts)
 *   Check 2 — Evidence pack coverage (0/1/2/3 pts)
 *   Check 3 — Source diversity (0/1/2 pts)
 *   Check 4 — Competing archetype gap (0/1/2 pts)
 *
 * Mode determination:
 *   8–10 pts → full_confidence
 *   5–7 pts  → conditional
 *   3–4 pts  → exploratory
 *   0–2 pts  → abort
 *
 * Override rules (applied after scoring):
 *   - evidence_pack_coverage = "insufficient" → force abort
 *   - diagnosis.confidence = "low" AND source_diversity.points = 0 → force abort
 *   - competing_archetype_gap ≤ 1 → cap at conditional
 *
 * Errors:
 *   ERR_ADJUDICATION_ABORT — mode = abort, pipeline must not proceed to memo
 */

import type { Diagnosis } from "../../intelligence-v2/types/diagnosis";
import type { Pattern } from "../../intelligence-v2/types/pattern";
import type { EvidencePack } from "../types/evidence-pack";
import type { AdjudicationResult } from "../types/adjudication";

export interface AdjudicateDiagnosisInput {
  diagnosis: Diagnosis;
  evidencePack: EvidencePack;
  patterns: Pattern[];
}

/**
 * Adjudicate diagnosis confidence and return framing mode for the memo.
 *
 * TODO: Implement
 * - Run all 4 checks and compute total_points
 * - Apply override rules (force abort, cap at conditional)
 * - Determine adjudication_mode from total_points
 * - Map mode to recommended_memo_framing
 * - Derive confidence_caveats for conditional/exploratory modes
 * - Build AdjudicationReport (with improvement_suggestions) when mode = abort
 */
export function adjudicateDiagnosis(
  input: AdjudicateDiagnosisInput
): AdjudicationResult {
  // TODO: implement
  throw new Error("Not implemented: adjudicateDiagnosis");
}
