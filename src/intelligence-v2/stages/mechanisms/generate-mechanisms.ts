/**
 * Stage: Generate Mechanisms
 *
 * Consumes the selected Diagnosis and its supporting Patterns and Tensions.
 * Produces 2–3 Mechanism objects that explain why the diagnosis exists.
 *
 * Input:  Diagnosis     — from the diagnosis stage
 *         Pattern[]     — supporting patterns (for evidence refs)
 *         Tension[]     — supporting tensions (for evidence refs)
 * Output: Mechanism[]   — exactly 2–3, never more
 *
 * Algorithm:
 *   1. Look up the 3 mechanism templates for the diagnosis type (mechanism-map.ts)
 *   2. Collect all evidence refs from supporting patterns and tensions
 *   3. Assign evidence refs to each mechanism
 *   4. Drop the lowest-plausibility mechanism if evidence is thin (< 2 refs total)
 *   5. Return 2–3 mechanisms, always capped at 3
 *
 * No LLM calls. Statements are deterministic templates from mechanism-map.ts.
 */

import type { Diagnosis, Mechanism } from './types.js'
import type { Pattern } from '../../types/index.js'
import type { Tension } from '../../types/index.js'
import { getMechanismTemplates } from './mechanism-map.js'

function unique(ids: string[]): string[] {
  return [...new Set(ids)]
}

let _counter = 0

function nextId(): string {
  return `mech_${String(++_counter).padStart(3, '0')}`
}

// Distribute evidence refs across mechanisms.
// All mechanisms draw from the same diagnosis evidence pool — they explain
// the same diagnosis from different angles. The full pool is assigned to each.
// If patterns or tensions carry distinct sub-pools, those are included too.
function collectEvidenceRefs(
  diagnosis: Diagnosis,
  patterns: Pattern[],
  tensions: Tension[],
): string[] {
  return unique([
    ...diagnosis.evidence_refs,
    ...patterns.flatMap(p => p.evidence_refs),
    ...tensions.flatMap(t => t.evidence_refs),
  ])
}

export function generateMechanisms(
  companyId: string,
  diagnosis: Diagnosis,
  patterns: Pattern[],
  tensions: Tension[],
): Mechanism[] {
  _counter = 0

  const templates = getMechanismTemplates(diagnosis.type)
  const allEvidence = collectEvidenceRefs(diagnosis, patterns, tensions)

  // Build all 3 candidate mechanisms
  const candidates: Mechanism[] = templates.map(template => ({
    id: nextId(),
    company_id: companyId,
    type: template.type,
    statement: template.statement,
    plausibility: template.plausibility,
    explains_diagnosis_id: diagnosis.id,
    evidence_refs: allEvidence,
  }))

  // Enforce 2–3 cap.
  // Drop the third mechanism (lowest plausibility, always last in the map)
  // only when the total evidence pool is very thin — fewer than 2 refs means
  // we cannot make three credible claims.
  const MIN_EVIDENCE_FOR_THREE = 2

  if (allEvidence.length < MIN_EVIDENCE_FOR_THREE) {
    return candidates.slice(0, 2)
  }

  // Standard output: all 3
  return candidates
}
