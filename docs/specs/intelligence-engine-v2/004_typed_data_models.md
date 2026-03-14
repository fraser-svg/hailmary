# SPEC 004 — Typed Data Models

This spec defines the canonical TypeScript shapes for all intelligence-v2 reasoning objects.
Implementations must match these interfaces exactly. Changes to interfaces require a spec update first.

---

## Shared Types

```typescript
export type Confidence = "low" | "medium" | "high"
export type Plausibility = "low" | "medium" | "high"
export type ImpactLevel = "low" | "medium" | "high"
```

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
  fragility_score: number           // [0.0, 1.0] — 0 = robust, 1 = single point of failure
  fragility_reasons: string[]
  confidence: Confidence
  evidence_refs: string[]
}

export interface FounderDependencyAssessment {
  narrative_dependency: boolean     // founder's name/brand drives the narrative
  demand_dependency: boolean        // founder's content/network drives inbound
  sales_dependency: boolean         // founder is closing deals personally
  risk_score: number                // [0.0, 1.0] — composite risk
  rationale: string
  evidence_refs: string[]
}

export interface ServiceDependencyAssessment {
  onboarding_complexity: "low" | "medium" | "high" | "unknown"
  implementation_required: boolean
  hidden_services_risk: number      // [0.0, 1.0] — degree of hidden delivery cost
  rationale: string
  evidence_refs: string[]
}

export interface PricingDeliveryFitAssessment {
  pricing_model: "seat" | "usage" | "custom" | "hybrid" | "unknown"
  roi_clarity: "low" | "medium" | "high" | "unknown"
  delivery_fit_tension: boolean     // true when pricing implies self-serve but delivery requires custom work
  rationale: string
  evidence_refs: string[]
}
```

**Validation rules:**
- `fragility_score` must be in [0.0, 1.0]. Scores outside range must throw at construction.
- `hidden_services_risk` must be in [0.0, 1.0]. Same rule.
- `risk_score` must be in [0.0, 1.0]. Same rule.
- All `evidence_refs` arrays may be empty (low-evidence case) — they must not be omitted.
- All 6 sub-assessments must be present. No optional sub-assessments.

---

## V2 Tension

```typescript
export type V2TensionType =
  | "enterprise_narrative_vs_founder_distribution"
  | "software_claim_vs_delivery_reality"
  | "product_led_claim_vs_service_onboarding"
  | "growth_ambition_vs_distribution_fragility"
  | "narrative_vs_distribution"
  | "pricing_model_vs_delivery_reality"
  | "other"

export interface Tension {
  id: string
  type: V2TensionType
  title: string
  description: string
  severity: Confidence
  evidence_refs: string[]
}
```

**Validation rules:**
- `evidence_refs` must not be empty. A tension with no evidence is invalid.
- `type` must be one of the 7 enumerated values. No freeform types.

---

## V2 Pattern

```typescript
export type PatternArchetype =
  | "founder_led_sales_ceiling"
  | "services_disguised_as_saas"
  | "developer_adoption_without_buyer_motion"
  | "enterprise_theatre"
  | "distribution_fragility"
  | "narrative_distribution_mismatch"

export interface Pattern {
  id: string
  archetype: PatternArchetype
  title: string
  tension_ids: string[]
  strength: Confidence
  evidence_refs: string[]
}
```

**Validation rules:**
- `tension_ids` must not be empty. A pattern must cluster at least one tension.
- `evidence_refs` must not be empty.
- `archetype` must be one of the 6 enumerated values.

---

## Diagnosis

```typescript
export type DiagnosisType =
  | "founder_led_sales_ceiling"
  | "services_disguised_as_saas"
  | "developer_adoption_without_buyer_motion"
  | "enterprise_theatre"
  | "distribution_fragility"
  | "narrative_distribution_mismatch"

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
```

**Rule:** Exactly one primary diagnosis per report. Enforced in `select-diagnosis.ts`.

**Validation rules:**
- `statement` must not be empty.
- `supporting_pattern_ids` must not be empty.
- `evidence_refs` must not be empty.
- `counterevidence_refs` may be empty (no competing patterns) — must not be omitted.
- `type` must match the winning pattern's archetype.

---

## Mechanisms

```typescript
export type MechanismType =
  | "investor_signalling"
  | "category_gravity"
  | "founder_lock_in"
  | "local_success_trap"
  | "buyer_psychology"
  | "delivery_constraint"
  | "proof_gap"

export interface Mechanism {
  id: string
  company_id: string
  type: MechanismType
  statement: string
  plausibility: Plausibility
  explains_diagnosis_id: string
  evidence_refs: string[]
}
```

**Rule:** 2–3 mechanisms per diagnosis. Enforced in `generate-mechanisms.ts`.

**Validation rules:**
- `explains_diagnosis_id` must match the diagnosis.id from the diagnosis stage.
- `evidence_refs` must not be empty.
- `plausibility` must be one of the enumerated values.
- Mechanisms are ordered by plausibility descending. If one is dropped, it is always the
  last (lowest plausibility) mechanism.

---

## Intervention Opportunity

```typescript
export type InterventionType =
  | "positioning_reset"
  | "icp_redefinition"
  | "sales_motion_redesign"
  | "founder_gtm_transition"
  | "distribution_strategy_reset"
  | "proof_architecture_design"

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
```

**Rule:** Exactly one intervention per report. Enforced in `select-intervention.ts`.

**Validation rules:**
- `diagnosis_id` must match the diagnosis.id.
- `mechanism_ids` must reference all mechanism IDs from the mechanisms stage.
- `evidence_refs` must not be empty.
- `rationale` must not be empty.
- `delivery_fit` must reflect whether the agency sending the letter could credibly deliver this.

---

## Report (V2)

```typescript
export interface ReportSectionV2 {
  id: string
  title: "The Diagnosis" | "Why This Happens" | "The Opportunity"
  markdown: string
  evidence_refs: string[]
}

export interface ReportV2 {
  report_id: string
  company_id: string
  generated_at: string             // ISO 8601
  diagnosis_id: string
  mechanism_ids: string[]
  intervention_id: string
  sections: ReportSectionV2[]      // exactly 3
  markdown: string                 // assembled full document
  evidence_refs: string[]
}

export interface ValidationError {
  check: string
  message: string
  details?: string
}

export interface WriteReportResult {
  report: ReportV2 | null          // null if validation fails
  markdown: string                 // always present for debugging
  errors: ValidationError[]
}
```

**Validation rules:**
- `sections` must have exactly 3 elements.
- Section titles must be exactly: "The Diagnosis", "Why This Happens", "The Opportunity" (in order).
- Each section's `markdown` must not be empty.
- Each section must not exceed 350 words.
- Total word count across all sections must not exceed 900 words.
- No em dashes (U+2014) in any section.
- No banned consulting phrases (see `prompt.ts:BANNED_PHRASES`).
- `diagnosis_id` must not be empty.
- `evidence_refs` must not be empty.

---

## ID Format Conventions

| Object | Prefix | Example |
|--------|--------|---------|
| Diagnosis | `diag_` | `diag_001` |
| Mechanism | `mech_` | `mech_001` |
| Intervention | `intv_` | `intv_001` |
| Report | `rptv2_` | `rptv2_001` |
| Report section | `sec_` | `sec_diagnosis` |

IDs are scoped to a single pipeline run. They are not globally unique across runs.

---

## Null Safety Rules

- No interface field may be `undefined`. Use `null` for absent optional values.
- Arrays must always be initialised: `[]` not `undefined`.
- Scores must always be numeric: `0` not `undefined`.
- Confidence/plausibility strings must always be one of the enumerated values — never empty string.
