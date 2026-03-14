# SPEC 006 — Evaluation and Quality Gates

Stage-level quality gates with concrete pass/fail criteria. Every gate listed here must have
a corresponding test. If it is not tested, it is not a gate.

---

## Quality Gate Philosophy

- **Structural integrity = errors.** If a structural rule is violated, the stage must throw
  or return a null/error result. Tests must assert the error.
- **Trust calibration = warnings.** Output quality issues (e.g., low confidence across all
  assessments) are worth flagging but must not block production.
- **The pipeline is a chain.** Each stage's output is the next stage's input. Garbage in,
  garbage out. Quality gates exist to stop garbage propagating.

---

## Gate 1: GTM Analysis

### Hard structural gates (must throw or produce default):

| Test | Condition | Expected |
|---|---|---|
| All 6 sub-assessments present | Missing any sub-assessment | Structural error |
| Scores in range | `fragility_score` outside [0, 1] | Throw |
| Scores in range | `hidden_services_risk` outside [0, 1] | Throw |
| Scores in range | `risk_score` outside [0, 1] | Throw |
| evidence_refs array present | Any sub-assessment missing the field | Structural error |

### Calibration gates (logged warnings in tests, not errors):

| Test | Condition | Warning |
|---|---|---|
| Low confidence across all assessments | All 6 are `"low"` | "No high-signal evidence found" |
| Empty evidence pool | All `evidence_refs` arrays are empty | "GTM analysis has no evidence linkage" |

### Fixture-based accuracy tests:

Using eval fixtures in `src/intelligence-v2/evals/fixtures/`:

| Fixture | Expected GTM output |
|---|---|
| `001-services-disguised-as-saas` | `service_dependency.hidden_services_risk >= 0.5` |
| `002-founder-led-sales-ceiling` | `sales_motion.mode = "founder_led"`, `founder_dependency.risk_score >= 0.6` |
| `003-developer-adoption-without-buyer-motion` | `buyer_structure.user_buyer_mismatch = true` |
| `004-enterprise-theatre` | `distribution_architecture.fragility_score >= 0.5`, `sales_motion.mode = "founder_led"` |
| `005-distribution-fragility` | `distribution_architecture.fragility_score >= 0.7` |
| `006-narrative-distribution-mismatch` | `pricing_delivery_fit.delivery_fit_tension = true` |

---

## Gate 2: Diagnosis

### Hard structural gates:

| Test | Condition | Expected |
|---|---|---|
| Exactly one diagnosis | Function returns single Diagnosis object (not array) | By type contract |
| Non-empty statement | `statement.length === 0` | Throw |
| Non-empty supporting patterns | `supporting_pattern_ids.length === 0` | Throw |
| Non-empty evidence refs | `evidence_refs.length === 0` | Throw |
| Valid diagnosis type | Type not in enum | TypeScript compile error |
| Throws on empty patterns input | `patterns.length === 0` | Throws |

### Fixture-based accuracy tests:

| Fixture | Expected `diagnosis.type` |
|---|---|
| `001-services-disguised-as-saas` | `"services_disguised_as_saas"` |
| `002-founder-led-sales-ceiling` | `"founder_led_sales_ceiling"` |
| `003-developer-adoption-without-buyer-motion` | `"developer_adoption_without_buyer_motion"` |
| `004-enterprise-theatre` | `"enterprise_theatre"` |
| `005-distribution-fragility` | `"distribution_fragility"` |
| `006-narrative-distribution-mismatch` | `"narrative_distribution_mismatch"` |

---

## Gate 3: Mechanisms

### Hard structural gates:

| Test | Condition | Expected |
|---|---|---|
| 2–3 mechanisms | `mechanisms.length < 2` OR `mechanisms.length > 3` | Throw |
| All reference same diagnosis | Any `explains_diagnosis_id` ≠ input diagnosis.id | Structural error |
| Non-empty evidence refs | Any mechanism has empty `evidence_refs` | Structural error |
| Valid mechanism types | Any type not in enum | TypeScript compile error |

### Count boundary tests:

| Test | Setup | Expected |
|---|---|---|
| 3 mechanisms when evidence >= 2 | 2+ evidence refs in pool | Returns 3 |
| 2 mechanisms when evidence < 2 | 0-1 evidence refs in pool | Returns 2 |

---

## Gate 4: Intervention

### Hard structural gates:

| Test | Condition | Expected |
|---|---|---|
| Exactly one intervention | Function returns single object | By type contract |
| Throws on 0 mechanisms | `mechanisms.length === 0` | Throws |
| Throws on 4+ mechanisms | `mechanisms.length > 3` | Throws |
| Diagnosis ID matches | `diagnosis_id` != input diagnosis.id | Structural error |
| All mechanism IDs present | `mechanism_ids` missing any mechanism | Structural error |
| Non-empty evidence refs | `evidence_refs.length === 0` | Structural error |
| Non-empty rationale | `rationale.length === 0` | Structural error |

### Archetype-to-intervention mapping tests:

For each of the 6 diagnosis types, assert the correct intervention type is selected (see SPEC 005
mapping table). These are deterministic — the test is a lookup verification.

---

## Gate 5: Report Validation

### Hard budget gates (ValidationError results in null report):

| Check | Limit | Test setup |
|---|---|---|
| Total word count | <= 900 | Generate report with 901 words -> expect error `total_word_limit` |
| Per-section word count | <= 350 | Generate section with 351 words -> expect error `section_word_limit` |
| Section count | exactly 3 | Pass 2 or 4 sections -> expect error `section_count` |
| Required section titles | all 3 present | Rename a section -> expect error `required_sections` |
| Non-empty sections | no empty content | Pass empty string for one section -> expect error `non_empty_sections` |
| No em dashes | 0 | Include em dash in content -> expect error `no_em_dashes` |
| Banned phrases | 0 | Include "well positioned" -> expect error `banned_phrases` |
| Diagnosis ID present | non-empty | Missing field -> expect error `diagnosis_id_present` |
| Evidence refs present | non-empty | Empty array -> expect error `evidence_refs_populated` |

### Quality gates (tested but not structural errors):

| Check | Condition |
|---|---|
| Report is specific | No sentence that could apply to any B2B company unchanged |
| Diagnosis named in Section 1 | Section 1 must reference the diagnosis type |
| Mechanisms visible in Section 2 | All mechanism themes must appear |
| Intervention named in Section 3 | Section 3 must reference the intervention type |

---

## Gate 6: Pipeline Contract

The pipeline orchestrator (`pipeline.ts`) must be tested end-to-end using mock data that
bypasses the LLM call.

### Contract assertions:

| Test | Assertion |
|---|---|
| Output contract: diagnosis count | `result.diagnosis` is a single object (not array) |
| Output contract: mechanism count | `result.mechanisms.length >= 2 && <= 3` |
| Output contract: intervention count | `result.intervention` is a single object |
| Traceability: diagnosis -> patterns | `result.diagnosis.supporting_pattern_ids` all in `result.v2_patterns` |
| Traceability: mechanisms -> diagnosis | All `result.mechanisms[].explains_diagnosis_id === result.diagnosis.id` |
| Traceability: intervention -> diagnosis | `result.intervention.diagnosis_id === result.diagnosis.id` |
| Traceability: intervention -> mechanisms | All `result.intervention.mechanism_ids` in `result.mechanisms[].id` |

---

## Eval Dimensions

When assessing output quality beyond structural gates, use these five dimensions:

### 1. Specificity
Does every statement reference a concrete condition observable from this company's evidence?
- Pass: "The company's demand generation is visible only through the founder's LinkedIn presence"
- Fail: "The company faces challenges in its go-to-market approach"

### 2. Commercial Relevance
Is the finding connected to revenue, growth, or distribution -- not product, culture, or vision?
- Pass: "Buyers cannot self-justify the purchase because there is no published ROI case"
- Fail: "The company has a strong product vision but needs to communicate it better"

### 3. Traceability
Can every claim be traced back to evidence IDs in the dossier?
- Pass: `evidence_refs` populated on all objects, refs exist in dossier
- Fail: Claims made that have no `evidence_refs`

### 4. Founder Resonance
Would a founder opening this letter recognise their situation?
- Pass: Uses language the founder uses themselves (from testimonials, case studies, founder content)
- Fail: Uses generic category language the founder never uses

### 5. Agency Fit
Is the intervention deliverable by the sending agency?
- Pass: "Reposition the company's pricing page and case study assets to speak to economic buyers"
- Fail: "Hire a VP Sales" or "Raise another round" or "Rebuild the product"

---

## Test File Locations

| Test suite | File |
|---|---|
| Report validation | `src/__tests__/intelligence-v2-validation.test.ts` |
| Pipeline output contract | `src/__tests__/intelligence-v2-contract.test.ts` |
| GTM analysis rules | Add to `src/__tests__/intelligence-v2-contract.test.ts` |

---

## Hard Fail Conditions (no exceptions)

These conditions must never reach a delivered report. If detected, the pipeline must error:

1. Generic language in diagnosis statement (statement applies to any B2B company)
2. Diagnosis has no supporting evidence (`evidence_refs` empty)
3. More than one primary diagnosis produced
4. Mechanism with no evidence refs
5. Intervention type not implied by the diagnosis type (see mapping in SPEC 005)
6. Report word count exceeds 900 words
7. Report contains banned phrases or em dashes
8. Report has missing or empty sections
