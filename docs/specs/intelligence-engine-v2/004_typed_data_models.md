# SPEC 004 — Typed Data Models

This is where engineering discipline comes in.

Below is the shape I would use.

---

## GTM Analysis

```typescript
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
```

---

## Diagnosis

```typescript
export interface Diagnosis {
  id: string
  type:
    | "founder_led_sales_ceiling"
    | "services_disguised_as_saas"
    | "developer_adoption_without_buyer_motion"
    | "enterprise_theatre"
    | "distribution_fragility"
    | "narrative_distribution_mismatch"
  statement: string
  confidence: Confidence
  supporting_pattern_ids: string[]
  counterevidence_refs: string[]
  evidence_refs: string[]
}
```

**Rule:** Exactly one primary diagnosis per report.

---

## Mechanisms

```typescript
export interface Mechanism {
  id: string
  type:
    | "investor_signalling"
    | "category_gravity"
    | "founder_lock_in"
    | "local_success_trap"
    | "buyer_psychology"
    | "delivery_constraint"
    | "proof_gap"
  statement: string
  plausibility: "low" | "medium" | "high"
  explains_diagnosis_id: string
  evidence_refs: string[]
}
```

**Rule:** 2–3 mechanisms only.

---

## Intervention Opportunity

```typescript
export interface InterventionOpportunity {
  id: string
  type:
    | "positioning_reset"
    | "icp_redefinition"
    | "sales_motion_redesign"
    | "founder_gtm_transition"
    | "distribution_strategy_reset"
    | "proof_architecture_design"
  statement: string
  expected_impact: "low" | "medium" | "high"
  delivery_fit: "low" | "medium" | "high"
  rationale: string
  evidence_refs: string[]
}
```

This object is crucial because it ties the report to revenue.
