import type { ImpactLevel } from "./shared"

export type InterventionType =
  | "positioning_reset"
  | "icp_redefinition"
  | "sales_motion_redesign"
  | "founder_gtm_transition"
  | "distribution_strategy_reset"
  | "proof_architecture_design"

// Exactly one InterventionOpportunity is produced per report.
// It ties the diagnosis to agency-deliverable work.
export interface InterventionOpportunity {
  id: string
  company_id: string
  type: InterventionType
  statement: string
  expected_impact: ImpactLevel
  delivery_fit: ImpactLevel
  rationale: string
  mechanism_ids: string[]
  diagnosis_id: string
  evidence_refs: string[]
}
