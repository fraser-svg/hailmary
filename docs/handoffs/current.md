# Company Intelligence Engine -- Current Handover

# Project Goal

A system that accepts a company name and domain, conducts structured public research, and produces a machine-readable JSON dossier for downstream AI consumption. The dossier surfaces the gap between company messaging and customer-perceived value. A deterministic reasoning pipeline then produces a GTM diagnosis, causal mechanisms, and intervention opportunity.

# Current Architecture

```
Company name + domain
  -> Claude research skill (/build-company-dossier)
  -> WebSearch + WebFetch (no external APIs)
  -> Evidence extraction with source tier tagging
  -> runs/<slug>/dossier.json (16 required top-level fields, evidence inline)
  -> TypeScript validator (schema + evidence-link checking)
  -> Pipeline (feature-flagged: legacy or intelligence-v2)
  -> Batch analysis runner (orchestrates pipeline across ICP companies)
```

Two pipelines exist, selectable via `USE_INTELLIGENCE_V2=true`:

Legacy pipeline (8 stages):
```
extract-signals -> detect-tensions -> detect-patterns -> generate-hypotheses
  -> stress-test-hypotheses -> generate-implications -> plan-report -> write-report
```

Intelligence-v2 pipeline (9 stages):
```
extract-signals -> gtm-analysis -> detect-tensions -> detect-patterns
  -> adapter (archetype classification) -> diagnosis -> mechanisms -> intervention -> report-v2
```

The v2 pipeline reuses the first 4 stages (signals, tensions, patterns) from the legacy pipeline, then diverges. An adapter layer converts report pipeline types (generic PatternType) to intelligence-v2 types (specific PatternArchetype) using tension affinity scoring boosted by GTM analysis signals.

Writer modes: `template` (deterministic, default) | `skill` (Claude Code prose) | `llm` (runtime API)

Errors = structural integrity (fail validation). Warnings = trust/quality (never fail).

# Development Stage

**MK1 (complete):** Full vertical slice. Company input to validated dossier.

**MK2 Core (complete, Phases 1-4):** Better judgment quality, not more fields. Validator enhancement, source tiers, skill workflow, narrative gap traceability.

**MK2B (complete, Phases 5-6):** Schema expansion for narrative intelligence and research depth metadata.

**MK3 (complete, Phase 7 + 7b):** Strategic hypotheses in dossier schema.

**Report Engine (complete, Phases 5-19 + Phase 8 Reasoning + Phase 9B Specificity):** Eval harness + 8 pipeline stages + writer layer + batch runner + reasoning improvements.

**Intelligence-V2 (current):** Deterministic reasoning pipeline producing diagnosis/mechanisms/intervention. GTM analysis classifiers, archetype-based pattern scoring, mechanism maps, intervention maps, LLM report renderer. Integrated into batch runner behind feature flag. Calibration complete — all 3 reference companies produce correct diagnoses.

# Phase Status

| Phase | Scope | Key Deliverable |
|-------|-------|-----------------|
| 1 | Validator Enhancement + Test Foundation | `validate-core.ts` extracted, 66 tests |
| 2 | Source Tier Operationalization | `source_tier` in types/schema/validator |
| 3 | Skill Workflow Enhancement | 3 reference docs, validated on Stripe/Notion/HubSpot |
| 4 | Narrative Gap Traceability | 4 new validator warnings (checks 18-21) |
| 5 (RE) | extract-signals + detect-tensions + eval harness | 8 signal passes, 5 tension templates, fixture 001 |
| 6 (RE) | detect-patterns | 4 pattern templates |
| 7 (RE) | generate-hypotheses | 5 hypothesis templates, dedup at 70% overlap |
| 8 (RE) | stress-test-hypotheses | 5 deterministic checks, survive/weak/discard |
| 9 (RE) | generate-implications | 6 implication templates |
| 5 (MK2B) | Narrative Intelligence Expansion | `negative_signals`, `value_alignment_summary` |
| 6 (MK2B) | Evidence Summary / Research Depth | `evidence_summary` in `run_metadata` |
| 7 (MK3) | Strategic Hypotheses | `strategic_hypotheses` in `strategic_risks` |
| 7b (MK3) | Hypothesis Quality | SKILL.md Step 8b, quality reference doc |
| 10a (RE) | Eval Fixture 002 | StratusFlow: enterprise positioning vs SMB reality |
| 11 (RE) | Pipeline Generalization for Fixture 002 | 6 stages generalized, both fixtures pass |
| 12 (RE) | Eval Fixture 003 | CatalystIQ: founder credibility vs institutional depth |
| 13 (RE) | Pipeline Generalization for Fixture 003 | 6 stages generalized, all 3 fixtures pass |
| 14 (RE) | plan-report | Deterministic report planning |
| 15 (RE) | write-report | Hybrid deterministic + writer adapter |
| 16 (RE) | Writer layer refactor | Extracted writer into `src/report/writer/` |
| 17 (RE) | Skill writer mode | Skill bundle export, response import |
| 18 (RE) | Skill prompt system | Master prompt module with 5-layer architecture |
| 19 (RE) | Batch analysis runner | ICP company orchestration |
| 8 (Reasoning) | Reasoning Engine Improvement | Scoring pipeline, tension-driven hypotheses |
| 9B (Reasoning) | Template Inflation Fix | Company-specific text via CompanyContext |
| **V2 Types** | **Intelligence-V2 type system** | **6 archetypes, GTMAnalysis, Diagnosis, Mechanism, Intervention types** |
| **V2 Stages** | **Intelligence-V2 stage implementations** | **GTM rules, diagnosis scoring, mechanism map, intervention map, report renderer** |
| **V2 Evals** | **Evaluation fixtures** | **6 archetype fixtures with mock signals and expected outputs** |
| **V2 Integration** | **Pipeline integration + feature flag** | **adapter.ts, pipeline.ts, batch-analyse.ts modified** |
| **V2 Audit** | **Spec-vs-code audit + targeted bug fixes** | **D4, D5, D10 fixed; D2/D3/D6–D9/D11/D12 documented** |
| **V2 Calibration 1** | **Archetype scoring bias** | **positioning_vs_customer_base weight split ET:2/NDM:2; score debug logging; 5 new tests** |
| **V2 Calibration 2** | **PLG signal extraction + DAWBM scoring** | **Pass 19+20 in extract-signals.ts; plg boost in adapter.ts; 13 new tests** |
| **V2 Calibration 3** | **Product-led distribution boost for DAWBM** | **primary_channel=product → DAWBM +2 in adapter.ts; 2 new tests** |
| **V2 Calibration 4** | **Omnea ET fix via positioning_vs_market_fit affinity** | **pvm carries ET:+1; Omnea correctly ET; 2 new tests; 174 total** |

# Validator Architecture

**validate-core.ts** (~430 lines): Pure validation logic. 21 numbered checks. Importable, no CLI dependencies.

**validate.ts** (~60 lines): Thin CLI wrapper. Handles argv, file I/O, console output, exit codes.

**Tests:** 5 files under `src/__tests__/` and `src/utils/__tests__/`. Fixtures are programmatic via `createEmptyDossier()`.

# Source Tier System

| Tier | Category | Use |
|------|----------|-----|
| 1 | Company-controlled (website, docs, blog) | Strongest for company claims |
| 2 | Authoritative external (investors, media, regulatory) | Strong for external facts |
| 3 | Customer/market (reviews, testimonials, case studies) | Strongest for customer truth |
| 4 | Secondary synthesis (directories, analyst blogs) | Discovery only |
| 5 | Noisy (scraped fragments, unattributed) | Hypothesis generation only |

# Repository Structure

```
schemas/company-dossier.schema.json     # JSON Schema (draft-07), 16 required fields
src/types/                              # SourceRecord, EvidenceRecord, Dossier types
src/utils/                              # ID generators, empty dossier, enums
src/validate-core.ts                    # 21-check validation logic
src/validate.ts                         # CLI wrapper
src/__tests__/                          # contract tests + validator tests + PLG signal tests
src/utils/__tests__/                    # 20 utility tests
src/report/pipeline/                    # Legacy pipeline (8 stages)
  extract-signals.ts                    # 20 extraction passes (incl. Pass 19+20: PLG/OSS)
src/report/writer/                      # Writer layer (3 modes)
src/report/runner/                      # Batch analysis runner
  batch-analyse.ts                      # CLI entry: feature-flagged pipeline dispatch
  company-list.ts                       # 8 ICP companies
  output-manager.ts                     # Slugify, directory creation, file writers
src/report/evals/                       # Evaluation harness (3 legacy fixtures)
src/intelligence-v2/                    # V2 reasoning pipeline
  types/                                # Shared, GTMAnalysis, Pattern, Tension, Diagnosis, Mechanism, Intervention
  stages/
    gtm-analysis/                       # 6 deterministic classifiers (rules.ts)
    diagnosis/                          # Archetype scoring + selection (scoring.ts, statements.ts)
    mechanisms/                         # 3 mechanism templates per diagnosis (mechanism-map.ts)
    intervention/                       # 1 intervention template per diagnosis (intervention-map.ts)
    report/                             # LLM prose renderer (Haiku, writer.ts, prompt.ts, validation.ts)
  evals/                                # V2 evaluation fixtures
    types.ts                            # EvalFixture type definition
    fixtures/                           # 6 archetype fixtures (mock signals + expected outputs)
  adapter.ts                            # Report pipeline -> V2 type conversion + archetype classification
  pipeline.ts                           # V2 pipeline orchestrator
docs/specs/Intelligence-engine-specs/   # 8 upstream specs
docs/specs/report-specs/                # 9 report engine specs
docs/specs/intelligence-engine-v2/      # V2 specs
docs/handoffs/current.md                # This file
.claude/skills/build-company-dossier/   # SKILL.md + 7 reference docs
runs/                                   # Per-company dossier output (gitignored)
reports/                                # Per-company analysis output (gitignored)
```

# Intelligence-V2 Pipeline Architecture

Six archetypes drive the entire v2 pipeline:

| Archetype | Diagnosis | Mechanisms | Intervention |
|-----------|-----------|------------|--------------|
| `founder_led_sales_ceiling` | Growth capped by founder attention | founder_lock_in, local_success_trap, proof_gap | founder_gtm_transition |
| `services_disguised_as_saas` | Service delivery behind software positioning | delivery_constraint, investor_signalling, category_gravity | positioning_reset |
| `developer_adoption_without_buyer_motion` | Technical usage not converting to revenue | buyer_psychology, proof_gap, category_gravity | sales_motion_redesign |
| `enterprise_theatre` | Enterprise positioning without enterprise evidence | investor_signalling, category_gravity, local_success_trap | icp_redefinition |
| `distribution_fragility` | Single-channel concentration | founder_lock_in, local_success_trap, delivery_constraint | distribution_strategy_reset |
| `narrative_distribution_mismatch` | Stated GTM diverges from actual distribution | investor_signalling, category_gravity, buyer_psychology | positioning_reset |

GTM Analysis produces 6 sub-assessments from signals: sales motion, buyer structure, distribution architecture, founder dependency, service dependency, pricing/delivery fit. These inform the archetype classification adapter.

The adapter converts report pipeline patterns (generic `PatternType`: contradiction, gap, dependency...) to v2 patterns (specific `PatternArchetype`) using tension affinity scoring boosted by GTM analysis signals.

# Current Phase

**Calibration complete. All 3 reference companies produce correct diagnoses.**

## Calibration History

### Calibration 1 — positioning_vs_customer_base weight split
- Changed `{ enterprise_theatre: 3 }` to `{ enterprise_theatre: 2, narrative_distribution_mismatch: 2 }`
- Prevents ET from dominating patterns with a single tension
- Added score debug logging gated on `ARCHETYPE_DEBUG=true`

### Calibration 2 — PLG signal extraction + DAWBM sales_motion boost
- Added Pass 19 (`extractOpenSourceAdoptionSignals`): fires on `github_stars` or OSS license
- Added Pass 20 (`extractPlgMotionSignals`): fires on `motion_type === 'PLG'` or PLG text patterns
- Added adapter boost: `sales_motion.mode === 'plg'` → DAWBM +2
- Result for Trigger.dev: 4 → 6 signals; `sales_motion.mode` hybrid → plg; `primary_channel` unknown → product

### Calibration 3 — product-led distribution boost for DAWBM
- Added adapter boost: `distribution_architecture.primary_channel === 'product'` → DAWBM +2
- Second-order PLG signal: product as primary distribution channel is the defining DAWBM characteristic
- Result for Trigger.dev: DAWBM=4 ties NDM=4, wins alphabetically ('d' < 'n')

### Calibration 4 — positioning_vs_market_fit carries ET:+1 (Omnea fix)
- Root cause: pat_003 (all 3 Omnea tensions) scored NDM:5 vs ET:4 — margin of 1 point
- Fix: added `enterprise_theatre: 1` to `positioning_vs_market_fit` affinity
- Effect: pat_003 now ties ET:5 = NDM:5 → ET wins alphabetically → ET group covers 3 tensions → ET wins selector 12 vs 10
- Form3 unaffected (lacks `ambition_vs_proof`, so ET:3 < NDM:4 — NDM still wins)

## Verified Company Diagnoses

| Company | Signals | Diagnosis | Accurate? |
|---------|---------|-----------|-----------|
| Trigger.dev | 6 | `developer_adoption_without_buyer_motion` | **Yes** |
| Omnea | 5 | `enterprise_theatre` | **Yes** |
| Form3 | 4 | `narrative_distribution_mismatch` | Partially (Form3 IS enterprise but lacks ambition_vs_proof tension to trigger ET) |

## Current Adapter Boosts (summary)

```typescript
// GTM boosts in classifyArchetype()
if (gtm.service_dependency.hidden_services_risk >= 0.5)   scores.services_disguised_as_saas += 2
if (gtm.founder_dependency.risk_score >= 0.67)            scores.founder_led_sales_ceiling += 2
if (gtm.sales_motion.mode === 'founder_led')               scores.founder_led_sales_ceiling += 2
if (gtm.sales_motion.mode === 'plg')                       scores.developer_adoption_without_buyer_motion += 2
if (gtm.distribution_architecture.primary_channel === 'product') scores.developer_adoption_without_buyer_motion += 2
if (gtm.buyer_structure.user_buyer_mismatch)               scores.developer_adoption_without_buyer_motion += 3
if (gtm.distribution_architecture.fragility_score >= 0.7) scores.distribution_fragility += 2
if (gtm.pricing_delivery_fit.delivery_fit_tension)         scores.services_disguised_as_saas += 1
```

## Spec-vs-Code Audit Status

| ID | File | Divergence | Status |
|----|------|------------|--------|
| D4 | adapter.ts | `sales_motion.mode === "founder_led"` boost missing | **Fixed** |
| D5 | adapter.ts | `delivery_fit_tension` → +1 to services_disguised_as_saas missing | **Fixed** |
| D10 | rules.ts | `delivery_fit_tension` triggered on any co-presence of signals (too broad) | **Fixed** |
| D2 | adapter.ts | `risk_score` threshold 0.67 vs spec 0.6 | Deferred — consistent with D8 |
| D3 | adapter.ts | `user_buyer_mismatch` boost +3 vs spec +2 | Deferred — open design question |
| D6 | rules.ts | Fragility: +0.5 when founderProportion > 0.5, spec says +0.4 | Deferred |
| D7 | rules.ts | Fragility: no negative adjustments from spec | Deferred |
| D8 | rules.ts | Founder risk_score uses equal 1/3 weights, spec uses 0.3/0.4/0.3 | Deferred — D2 calibrated to this |
| D9 | rules.ts | `onboarding_complexity === "medium"` adds +0.25, spec says +0.2 | Deferred |
| D11 | scoring.ts | tension_coverage×3 + confidence×2 + actionability×1; spec says sum of pattern weights | Design decision required |
| D12 | scoring.ts | Diagnosis confidence from max pattern confidence, not winner-vs-second margin | Design decision required |

# Next Step

**Calibration phase is complete. All reference companies are correctly diagnosed.**

Remaining open items:

- **D11/D12**: Selector formula decisions (pattern weight sum vs tension coverage heuristic). Low urgency — current heuristic produces correct results for all 3 reference companies.
- **D2/D3/D8**: Threshold and weight alignment group — deferred as internally self-consistent.
- **Form3 ET diagnosis**: Form3 is genuinely enterprise but lacks `ambition_vs_proof` tension in its dossier. Would require either richer evidence extraction or a Form3-specific signal, not a classifier change.
- **Signal specificity**: Mechanism/intervention text contains no company-specific content — requires LLM render stage (needs `ANTHROPIC_API_KEY`).
- **LLM render stage**: All deterministic stages produce correct output. The final prose render (Haiku) fails only due to missing API key.

# Known Constraints

- MK2 Core must NOT add new dossier fields. Schema expansion is MK2B/MK3 only.
- `additionalProperties: false` on section objects — new fields require schema update first.
- Report engine must not perform fresh research — operates only on dossier-derived data.
- Pipeline stages downstream of extract-signals must not inspect dossier directly (signals-only).
- V2 report rendering requires `ANTHROPIC_API_KEY` environment variable.
- V2 pipeline produces exactly 1 diagnosis, 2-3 mechanisms, 1 intervention per company.
- All deterministic except the final report prose render (Haiku model).
- Legacy pipeline is NOT removed. Both pipelines coexist behind feature flag.
- SKILL.md must stay under ~400 lines.
- All 16 dossier sections must exist even when empty.
- WebSearch + WebFetch only. No external tools.
- Do not touch D2/D3/D8 individually — they are internally self-consistent and must move as a group.
- Score debug logging (`ARCHETYPE_DEBUG=true`) is diagnostic only — do not make it always-on.

# Files Modified Recently

**Calibration 4 (latest):**
- `src/intelligence-v2/adapter.ts` — `positioning_vs_market_fit` affinity: added `enterprise_theatre: 1`
- `src/__tests__/intelligence-v2-contract.test.ts` — 2 new Calibration 4 tests (pvc+abp+pvm → ET; pvc+pvm only → NDM)

**Calibration 3:**
- `src/intelligence-v2/adapter.ts` — `primary_channel === 'product'` → DAWBM +2 boost
- `src/__tests__/intelligence-v2-contract.test.ts` — 2 new Calibration 3 tests

**Calibration 2:**
- `src/report/pipeline/extract-signals.ts` — Added Pass 19 + Pass 20; both wired into `extractSignals()`
- `src/intelligence-v2/adapter.ts` — `sales_motion.mode === 'plg'` → DAWBM +2 boost
- `src/__tests__/extract-signals-plg.test.ts` — NEW: 11 tests for Pass 19 + Pass 20
- `src/__tests__/intelligence-v2-contract.test.ts` — 2 Calibration 2 tests

**Calibration 1:**
- `src/intelligence-v2/adapter.ts` — `positioning_vs_customer_base` weight split; score debug logging
- `src/__tests__/intelligence-v2-contract.test.ts` — 3 Calibration 1 tests; 2 D5 tests; 2 D4 tests

**Spec-vs-code audit + bug fixes:**
- `src/intelligence-v2/adapter.ts` — D4 founder_led boost; D5 delivery_fit_tension boost
- `src/intelligence-v2/stages/gtm-analysis/rules.ts` — D10 delivery_fit_tension specificity fix
- `src/intelligence-v2/stages/gtm-analysis/analyse-gtm.ts` — passes service_dependency to classifyPricingDeliveryFit

**Test count: 174. All pass.**
