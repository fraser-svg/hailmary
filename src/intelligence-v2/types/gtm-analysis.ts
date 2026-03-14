import type { Confidence } from "./shared"

export interface GTMAnalysis {
  company_id: string
  sales_motion: SalesMotionAssessment
  buyer_structure: BuyerStructureAssessment
  distribution_architecture: DistributionArchitectureAssessment
  founder_dependency: FounderDependencyAssessment
  service_dependency: ServiceDependencyAssessment
  pricing_delivery_fit: PricingDeliveryFitAssessment
  evidence_refs: string[]
}

export interface SalesMotionAssessment {
  mode: "founder_led" | "sales_led" | "plg" | "community_led" | "hybrid"
  confidence: Confidence
  rationale: string
  evidence_refs: string[]
}

export interface BuyerStructureAssessment {
  primary_user: string | null
  economic_buyer: string | null
  champion: string | null
  user_buyer_mismatch: boolean
  confidence: Confidence
  rationale: string
  evidence_refs: string[]
}

export interface DistributionArchitectureAssessment {
  primary_channel:
    | "founder_content"
    | "community"
    | "product"
    | "outbound"
    | "partnerships"
    | "paid"
    | "unknown"
  secondary_channels: string[]
  fragility_score: number
  fragility_reasons: string[]
  confidence: Confidence
  evidence_refs: string[]
}

export interface FounderDependencyAssessment {
  narrative_dependency: boolean
  demand_dependency: boolean
  sales_dependency: boolean
  risk_score: number
  rationale: string
  evidence_refs: string[]
}

export interface ServiceDependencyAssessment {
  onboarding_complexity: "low" | "medium" | "high" | "unknown"
  implementation_required: boolean
  hidden_services_risk: number
  rationale: string
  evidence_refs: string[]
}

export interface PricingDeliveryFitAssessment {
  pricing_model: "seat" | "usage" | "custom" | "hybrid" | "unknown"
  roi_clarity: "low" | "medium" | "high" | "unknown"
  delivery_fit_tension: boolean
  rationale: string
  evidence_refs: string[]
}
