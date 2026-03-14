/**
 * Build Evidence Pack — V3-M1
 * Spec: docs/specs/intelligence-engine-v3/003_evidence_pack_spec.md
 *
 * Curates and annotates evidence records from the Dossier for memo use.
 * Runs AFTER V2 reasoning so that memo roles can be assigned relative
 * to the winning diagnosis, mechanisms, and intervention.
 *
 * Selection algorithm:
 *   1. Score all dossier evidence records on 4 dimensions (max score: 10)
 *   2. Filter out records with total_score < 3
 *   3. Assign memo roles based on V2 output evidence_refs
 *   4. Rank by total_score descending
 *   5. Select top 15 (or all if < 15 remain)
 *   6. Enforce minimum coverage requirements
 *   7. Build hook_candidates from is_hook_eligible records
 *
 * Errors:
 *   ERR_EVIDENCE_PACK_INSUFFICIENT — < 5 scoreable records after filtering
 *   ERR_NO_HOOK_CANDIDATES — zero hook-eligible records
 *   ERR_EVIDENCE_ORPHAN — a pack record references a non-existent dossier evidence_id
 */

import type { Dossier } from "../../types/dossier";
import type { Diagnosis } from "../../intelligence-v2/types/diagnosis";
import type { Mechanism } from "../../intelligence-v2/types/mechanism";
import type { InterventionOpportunity } from "../../intelligence-v2/types/intervention";
import type { EvidencePack } from "../types/evidence-pack";

export interface BuildEvidencePackInput {
  dossier: Dossier;
  diagnosis: Diagnosis;
  mechanisms: Mechanism[];
  intervention: InterventionOpportunity;
}

/**
 * Build the EvidencePack from dossier evidence + V2 reasoning outputs.
 *
 * TODO: Implement
 * - Score each dossier evidence record on commercial_salience, specificity,
 *   customer_voice, and recency dimensions
 * - Assign memo roles: diagnosis_support (from diagnosis.evidence_refs),
 *   mechanism_illustration (from mechanism.evidence_refs),
 *   intervention_evidence (from intervention.evidence_refs),
 *   counter_narrative (pairs of company claim + customer signal),
 *   specificity_anchor (specificity = 3),
 *   hook_anchor (eligible hook candidates)
 * - Determine is_hook_eligible: is_inferred=false, specificity≥2, customer_voice≥1, total_score≥6
 * - Compute PackQuality and coverage_assessment
 * - Raise ERR_EVIDENCE_PACK_INSUFFICIENT if < 5 scoreable records
 * - Raise ERR_NO_HOOK_CANDIDATES if 0 hook-eligible records
 */
export function buildEvidencePack(input: BuildEvidencePackInput): EvidencePack {
  // TODO: implement
  throw new Error("Not implemented: buildEvidencePack");
}
