import type { Plausibility } from "./shared"

export type MechanismType =
  | "investor_signalling"
  | "category_gravity"
  | "founder_lock_in"
  | "local_success_trap"
  | "buyer_psychology"
  | "delivery_constraint"
  | "proof_gap"

// 2–3 Mechanisms are produced per Diagnosis. Each explains a causal force
// behind the diagnosis. References are by ID — no circular imports.
export interface Mechanism {
  id: string
  company_id: string
  type: MechanismType
  statement: string
  plausibility: Plausibility
  explains_diagnosis_id: string
  evidence_refs: string[]
}
