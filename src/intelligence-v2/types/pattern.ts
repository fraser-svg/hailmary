import type { Confidence } from "./shared"

// Patterns cluster tensions into recurring commercial failure archetypes.
// Pattern types mirror the Diagnosis type set: a pattern is the structural
// form observed; a diagnosis is the selected interpretation of that form.
export type PatternArchetype =
  | "founder_led_sales_ceiling"
  | "services_disguised_as_saas"
  | "developer_adoption_without_buyer_motion"
  | "enterprise_theatre"
  | "distribution_fragility"
  | "narrative_distribution_mismatch"

export interface Pattern {
  id: string
  company_id: string
  archetype: PatternArchetype
  title: string
  description: string
  tension_ids: string[]
  signal_ids: string[]
  evidence_refs: string[]
  confidence: Confidence
  weight: number
}
