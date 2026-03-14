/**
 * Stage: Select Intervention
 *
 * Consumes the Diagnosis and its Mechanisms. Produces exactly ONE
 * InterventionOpportunity.
 *
 * Input:  Diagnosis     — from the diagnosis stage
 *         Mechanism[]   — from the mechanisms stage (2–3)
 * Output: InterventionOpportunity — exactly one
 *
 * Algorithm:
 *   1. Look up the intervention template for the diagnosis type (intervention-map.ts)
 *   2. Collect all evidence refs from the diagnosis and mechanisms
 *   3. Attach mechanism IDs and diagnosis ID for full traceability
 *
 * No LLM calls. Statement and rationale are deterministic templates.
 * The stage cannot produce more than one intervention — this is structurally enforced.
 */

import type { Diagnosis, InterventionOpportunity, Mechanism } from './types.js'
import { getInterventionTemplate } from './intervention-map.js'

function unique(ids: string[]): string[] {
  return [...new Set(ids)]
}

let _counter = 0

function nextId(): string {
  return `intv_${String(++_counter).padStart(3, '0')}`
}

export function selectIntervention(
  companyId: string,
  diagnosis: Diagnosis,
  mechanisms: Mechanism[],
): InterventionOpportunity {
  _counter = 0

  if (mechanisms.length === 0) {
    throw new Error(`selectIntervention [${companyId}]: no mechanisms provided`)
  }

  if (mechanisms.length > 3) {
    throw new Error(
      `selectIntervention [${companyId}]: received ${mechanisms.length} mechanisms — maximum is 3`,
    )
  }

  const template = getInterventionTemplate(diagnosis.type)

  const evidence_refs = unique([
    ...diagnosis.evidence_refs,
    ...mechanisms.flatMap(m => m.evidence_refs),
  ])

  return {
    id: nextId(),
    company_id: companyId,
    type: template.type,
    statement: template.statement,
    expected_impact: template.expected_impact,
    delivery_fit: template.delivery_fit,
    rationale: template.rationale,
    mechanism_ids: mechanisms.map(m => m.id),
    diagnosis_id: diagnosis.id,
    evidence_refs,
  }
}
