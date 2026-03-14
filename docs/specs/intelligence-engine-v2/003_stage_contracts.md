# SPEC 003 — Stage Contracts

Each pipeline stage is defined as a pure function with typed inputs, typed outputs, and
explicit failure conditions. No stage may produce output that is not derivable from its inputs.

---

## Pipeline Architecture

```
dossier
  → signals          [deterministic]
  → gtm_analysis     [deterministic]
  → tensions         [deterministic — BRIDGED from report pipeline]
  → patterns         [deterministic — BRIDGED from report pipeline]
  → v2_tensions      [deterministic adapter layer]
  → v2_patterns      [deterministic adapter layer]
  → diagnosis        [deterministic]
  → mechanisms       [deterministic]
  → intervention     [deterministic]
  → report           [LLM — prose rendering only]
```

### Bridge Decision: tensions and patterns

The `tensions` and `patterns` stages reuse the legacy report pipeline's implementations
(`detectTensions`, `detectPatterns`). This is intentional.

**Rationale:**
- The legacy implementations are well-tested and produce accurate structural observations.
- The v2 system needs tensions and patterns as intermediate objects — not as report content.
- An adapter layer (`adapter.ts`) reclassifies report tension/pattern types into v2 archetypes.
- Introducing true v2 tension/pattern stages would require rewriting ~600 lines of tested logic
  for no material gain in output quality.

**Constraints on this bridge:**
- The bridge must never be removed without replacing both stages with v2-native equivalents.
- The adapter must be updated whenever new tension types are added to the report pipeline.
- Both bridged stages must remain in the v2 pipeline orchestrator (`pipeline.ts`), not skipped.

---

## Stage: signals

**Source:** `src/report/pipeline/extract-signals.ts` (shared)

**Input:**
```
Dossier — 16-section company intelligence object
```

**Output:**
```
Signal[] — structured factual observations extracted from dossier evidence
  id: string
  category: SignalCategory
  value: string
  evidence_ids: string[]
  confidence: Confidence
```

**Contract:**
- Signals are facts. No interpretation beyond local meaning.
- Every signal must reference at least one `evidence_id`.
- Signals with no evidence linkage must be dropped, not included with empty refs.
- Output may be empty if the dossier has no parseable evidence — this is a warning, not an error.

**Failure conditions:**
- Throws if dossier is null or malformed.

---

## Stage: gtm_analysis

**Source:** `src/intelligence-v2/stages/gtm-analysis/`

**Input:**
```
companyId: string
signals: Signal[]
```

**Output:**
```
GTMAnalysis — six commercial state assessments
  company_id: string
  sales_motion: SalesMotionAssessment
  buyer_structure: BuyerStructureAssessment
  distribution_architecture: DistributionArchitectureAssessment
  founder_dependency: FounderDependencyAssessment
  service_dependency: ServiceDependencyAssessment
  pricing_delivery_fit: PricingDeliveryFitAssessment
  evidence_refs: string[]
```

**Contract:**
- All six sub-assessments must be present. No sub-assessment may be omitted.
- Assessments default to `confidence: "low"` when evidence is sparse — never fabricate confidence.
- `fragility_score` must be in range [0.0, 1.0].
- `hidden_services_risk` must be in range [0.0, 1.0].
- `risk_score` (founder_dependency) must be in range [0.0, 1.0].
- Scores are derived from rules (see SPEC 005), not LLM inference.

**Failure conditions:**
- Returns low-confidence defaults if signals are empty. Does not throw.
- Throws if companyId is empty string.

---

## Stage: tensions (BRIDGED)

**Source:** `src/report/pipeline/detect-tensions.ts` (shared — bridge)

**Input:**
```
signals: Signal[]
```

**Output:**
```
Tension[] — (report pipeline type)
  tension_id: string
  type: TensionType  (one of 21 report tension types)
  title: string
  description: string
  severity: "low" | "medium" | "high"
  evidence_ids: string[]
```

**Contract:**
- Produced by the legacy pipeline. Not v2-native.
- Consumed immediately by the adapter layer to produce V2Tension[].
- Do not write report-level content from this output — it is an intermediate object.

---

## Stage: patterns (BRIDGED)

**Source:** `src/report/pipeline/detect-patterns.ts` (shared — bridge)

**Input:**
```
tensions: Tension[]  (report pipeline type)
signals: Signal[]
```

**Output:**
```
Pattern[] — (report pipeline type)
  pattern_id: string
  pattern_type: PatternType  (one of 7 report pattern types)
  title: string
  tension_ids: string[]
  strategic_weight: "low" | "medium" | "high"
  evidence_ids: string[]
```

**Contract:**
- Same bridge note as tensions. Intermediate object only.
- Do not write report-level content from this output.

---

## Stage: adapter (v2_tensions, v2_patterns)

**Source:** `src/intelligence-v2/adapter.ts`

**Input:**
```
tensions: Tension[]        (report pipeline type)
patterns: Pattern[]        (report pipeline type)
gtm_analysis: GTMAnalysis
```

**Output:**
```
v2_tensions: V2Tension[]
  id: string
  type: V2TensionType  (one of 6 v2 types)
  title: string
  description: string
  severity: Confidence
  evidence_refs: string[]

v2_patterns: V2Pattern[]
  id: string
  archetype: PatternArchetype  (one of 6 v2 archetypes)
  title: string
  tension_ids: string[]
  strength: Confidence
  evidence_refs: string[]
```

**V2 Tension Types:**
- `enterprise_narrative_vs_founder_distribution`
- `software_claim_vs_delivery_reality`
- `product_led_claim_vs_service_onboarding`
- `growth_ambition_vs_distribution_fragility`
- `narrative_vs_distribution`
- `pricing_model_vs_delivery_reality`
- `other`

**V2 Pattern Archetypes (= diagnosis types):**
- `founder_led_sales_ceiling`
- `services_disguised_as_saas`
- `developer_adoption_without_buyer_motion`
- `enterprise_theatre`
- `distribution_fragility`
- `narrative_distribution_mismatch`

**Contract:**
- Every v2 pattern must have at least one tension_id.
- Every v2 tension must have at least one evidence_ref.
- Archetype classification uses weighted scoring from tension types + GTM signal boosts (see adapter.ts).

---

## Stage: diagnosis

**Source:** `src/intelligence-v2/stages/diagnosis/`

**Input:**
```
companyId: string
patterns: V2Pattern[]
tensions: V2Tension[]
```

**Output:**
```
Diagnosis — exactly one
  id: string
  company_id: string
  type: DiagnosisType  (one of 6 archetypes)
  statement: string
  confidence: Confidence
  supporting_pattern_ids: string[]
  counterevidence_refs: string[]
  evidence_refs: string[]
```

**Contract:**
- Exactly one Diagnosis per run. This is structurally enforced in `select-diagnosis.ts`.
- Statement is generated from deterministic templates in `statements.ts` — not from LLM.
- `supporting_pattern_ids` must reference patterns that exist in the input.
- `counterevidence_refs` must be populated from non-winning patterns.
- Confidence reflects the scoring margin: narrow margin → `"low"`, clear winner → `"high"`.

**Failure conditions:**
- Throws if `patterns` is empty.
- Throws if scoring produces no candidates.

---

## Stage: mechanisms

**Source:** `src/intelligence-v2/stages/mechanisms/`

**Input:**
```
companyId: string
diagnosis: Diagnosis
patterns: V2Pattern[]   (supporting patterns only — filtered by diagnosis.supporting_pattern_ids)
tensions: V2Tension[]   (supporting tensions only — derived from supporting patterns)
```

**Output:**
```
Mechanism[]  — exactly 2 or 3, never more, never fewer than 2
  id: string
  company_id: string
  type: MechanismType  (one of 7 types)
  statement: string
  plausibility: "low" | "medium" | "high"
  explains_diagnosis_id: string
  evidence_refs: string[]
```

**Contract:**
- 3 mechanisms are the default output.
- The third mechanism is dropped only when total evidence pool has fewer than 2 refs.
- All mechanisms reference the same diagnosis ID.
- Statements are deterministic templates from `mechanism-map.ts`.
- `evidence_refs` on each mechanism draws from the shared pool of all supporting patterns + tensions.

**Failure conditions:**
- Throws via `selectIntervention` validation if more than 3 are generated.

---

## Stage: intervention

**Source:** `src/intelligence-v2/stages/intervention/`

**Input:**
```
companyId: string
diagnosis: Diagnosis
mechanisms: Mechanism[]  (2–3)
```

**Output:**
```
InterventionOpportunity — exactly one
  id: string
  company_id: string
  type: InterventionType  (one of 6 types)
  statement: string
  expected_impact: "low" | "medium" | "high"
  delivery_fit: "low" | "medium" | "high"
  rationale: string
  mechanism_ids: string[]
  diagnosis_id: string
  evidence_refs: string[]
```

**Contract:**
- Exactly one intervention per run. Structurally enforced.
- Throws if `mechanisms.length > 3`.
- Throws if `mechanisms.length === 0`.
- Template selected by `diagnosis.type` — one deterministic template per archetype.
- `diagnosis_id` must match the input diagnosis.
- `mechanism_ids` must reference all input mechanism IDs.

---

## Stage: report (LLM)

**Source:** `src/intelligence-v2/stages/report/`

**Input:**
```
companyId: string
diagnosis: Diagnosis
mechanisms: Mechanism[]
intervention: InterventionOpportunity
```

**Output:**
```
WriteReportResult
  report: ReportV2 | null    (null if validation fails)
  markdown: string           (always populated — even on error, for debugging)
  errors: ValidationError[]
```

**Contract:**
- This is the ONLY LLM call in the v2 pipeline. All other stages are deterministic.
- The LLM renders, it does not reason. All analytical content comes from structured inputs.
- The prompt must pass only: diagnosis type+statement, mechanism types+statements, intervention.
- Evidence IDs and internal scores must NOT be passed to the LLM.
- Report must have exactly 3 sections with titles: "The Diagnosis", "Why This Happens",
  "The Opportunity".
- Max 900 total words. Max 350 words per section. (Physical mail ≤3-page budget.)
- Report is null if any validation error occurs. The runner must not silently continue with a
  null report — it must log the error and fail the company's run.

**Hard fail conditions (ValidationError):**
- Section count ≠ 3
- Missing required section title
- Empty section content
- Any section exceeds 350 words
- Total words exceed 900
- Em dash present (—)
- Banned consulting phrase present
- Missing diagnosis_id on report object
- Empty evidence_refs on report object

**Failure conditions:**
- Returns `{ report: null, markdown: '', errors: [{ check: 'llm_call', ... }] }` on API failure.
- Caller (pipeline.ts) must check for errors and handle appropriately.
