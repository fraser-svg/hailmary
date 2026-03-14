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

The v2 pipeline reuses the first 4 stages (signals, tensions, patterns) from the legacy pipeline, then diverges. An adapter layer converts report pipeline types (generic PatternType) to intelligence-v2 types (specific PatternArchetype) using tension affinity scoring + GTM analysis signals.

Writer modes: `template` (deterministic, default) | `skill` (Claude Code prose) | `llm` (runtime API)

Errors = structural integrity (fail validation). Warnings = trust/quality (never fail).

# Development Stage

**MK1 (complete):** Full vertical slice. Company input to validated dossier.

**MK2 Core (complete, Phases 1-4):** Better judgment quality, not more fields. Validator enhancement, source tiers, skill workflow, narrative gap traceability.

**MK2B (complete, Phases 5-6):** Schema expansion for narrative intelligence and research depth metadata.

**MK3 (complete, Phase 7 + 7b):** Strategic hypotheses in dossier schema.

**Report Engine (complete, Phases 5-19 + Phase 8 Reasoning + Phase 9B Specificity):** Eval harness + 8 pipeline stages + writer layer + batch runner + reasoning improvements.

**Intelligence-V2 (current):** Deterministic reasoning pipeline producing diagnosis/mechanisms/intervention. GTM analysis classifiers, archetype-based pattern scoring, mechanism maps, intervention maps, LLM report renderer. Integrated into batch runner behind feature flag.

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

# Validator Architecture

**validate-core.ts** (~430 lines): Pure validation logic. 21 numbered checks. Importable, no CLI dependencies.

**validate.ts** (~60 lines): Thin CLI wrapper. Handles argv, file I/O, console output, exit codes.

**Tests:** 4 files under `src/__tests__/` and `src/utils/__tests__/`. Fixtures are programmatic via `createEmptyDossier()`.

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
src/__tests__/                          # 86 validator tests
src/utils/__tests__/                    # 20 utility tests
src/report/pipeline/                    # Legacy pipeline (8 stages)
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

Intelligence-V2 integration complete. The v2 pipeline is operational behind `USE_INTELLIGENCE_V2=true`.

# Next Step

- Run v2 pipeline against real dossiers to validate end-to-end output quality
- Write tests for adapter archetype classification logic
- Evaluate whether v2 report prose quality (Haiku-rendered) meets standards
- Consider removing legacy pipeline once v2 is validated
- Phase 4 (narrative gap traceability): 3 new validator warnings for v2 output

# Known Constraints

- MK2 Core must NOT add new dossier fields. Schema expansion is MK2B/MK3 only.
- `additionalProperties: false` on section objects -- new fields require schema update first.
- Report engine must not perform fresh research -- operates only on dossier-derived data.
- Pipeline stages downstream of extract-signals must not inspect dossier directly (signals-only).
- V2 report rendering requires `ANTHROPIC_API_KEY` environment variable.
- V2 pipeline produces exactly 1 diagnosis, 2-3 mechanisms, 1 intervention per company.
- All deterministic except the final report prose render (Haiku model).
- Legacy pipeline is NOT removed. Both pipelines coexist behind feature flag.
- SKILL.md must stay under ~400 lines.
- All 16 dossier sections must exist even when empty.
- WebSearch + WebFetch only. No external tools.

# Files Modified Recently

**Intelligence-V2 Eval Fixtures (this session):**
- `src/intelligence-v2/evals/types.ts` -- NEW: EvalFixture type definition
- `src/intelligence-v2/evals/fixtures/001-services-disguised-as-saas.ts` -- NEW: CloudOps Pro fixture
- `src/intelligence-v2/evals/fixtures/002-founder-led-sales-ceiling.ts` -- NEW: InsightMetrics fixture
- `src/intelligence-v2/evals/fixtures/003-developer-adoption-without-buyer-motion.ts` -- NEW: QueryForge fixture
- `src/intelligence-v2/evals/fixtures/004-enterprise-theatre.ts` -- NEW: ScaleGrid fixture
- `src/intelligence-v2/evals/fixtures/005-distribution-fragility.ts` -- NEW: GrowthPulse fixture
- `src/intelligence-v2/evals/fixtures/006-narrative-distribution-mismatch.ts` -- NEW: FlowStack fixture
- `src/intelligence-v2/evals/fixtures/index.ts` -- NEW: barrel export + ALL_FIXTURES

**Intelligence-V2 Pipeline Integration (this session):**
- `src/intelligence-v2/adapter.ts` -- NEW: tension/pattern type conversion + archetype classification
- `src/intelligence-v2/pipeline.ts` -- NEW: v2 pipeline orchestrator (runV2Pipeline)
- `src/report/runner/batch-analyse.ts` -- MODIFIED: USE_INTELLIGENCE_V2 feature flag, v2 dispatch
