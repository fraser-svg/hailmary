import type { Confidence } from "./shared"

export type TensionType =
  | "enterprise_narrative_vs_founder_distribution"
  | "product_led_claim_vs_service_onboarding"
  | "developer_usage_vs_executive_buyer"
  | "software_claim_vs_delivery_reality"
  | "narrative_vs_distribution"
  | "pricing_model_vs_delivery_reality"
  | "growth_ambition_vs_distribution_fragility"
  | "other"

export interface Tension {
  id: string
  company_id: string
  type: TensionType
  title: string
  statement: string
  signal_ids: string[]
  evidence_refs: string[]
  confidence: Confidence
  severity: "low" | "medium" | "high"
}
