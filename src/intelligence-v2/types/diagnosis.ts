import type { Confidence } from "./shared"

export type DiagnosisType =
  | "founder_led_sales_ceiling"
  | "services_disguised_as_saas"
  | "developer_adoption_without_buyer_motion"
  | "enterprise_theatre"
  | "distribution_fragility"
  | "narrative_distribution_mismatch"

// Exactly one Diagnosis is produced per company.
export interface Diagnosis {
  id: string
  company_id: string
  type: DiagnosisType
  statement: string
  confidence: Confidence
  supporting_pattern_ids: string[]
  counterevidence_refs: string[]
  evidence_refs: string[]
}
