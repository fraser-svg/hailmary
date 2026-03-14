# Company Intelligence Engine -- Current Handover

# Project Goal

A system that accepts a company name and domain, conducts structured public research, and produces a machine-readable JSON dossier for downstream AI consumption. The dossier surfaces the gap between company messaging and customer-perceived value. A deterministic reasoning pipeline then produces a GTM diagnosis, causal mechanisms, and intervention opportunity. V3 adds a memo generation layer: the system produces a founder-facing strategic memo good enough for physical outreach.

# Current Architecture

```
Company name + domain
  -> [V3] siteCorpusAcquisition + externalResearchAcquisition
  -> [V3] mergeResearchCorpus -> corpusToDossierAdapter
  OR (legacy path):
  -> Claude research skill (/build-company-dossier)
  -> WebSearch + WebFetch (no external APIs)
  -> Evidence extraction with source tier tagging
  -> runs/<slug>/dossier.json (16 required top-level fields, evidence inline)
  -> TypeScript validator (schema + evidence-link checking)
  -> V2 reasoning pipeline (deterministic, 9 stages)
  -> [V3] buildEvidencePack -> adjudicateDiagnosis -> buildMemoBrief
  -> [V3] writeMemo (LLM) -> criticiseMemo (adversarial LLM) -> runSendGate
  -> MarkdownMemo + SendGateResult
```

Three pipelines exist:

Legacy pipeline (8 stages):
```
extract-signals -> detect-tensions -> detect-patterns -> generate-hypotheses
  -> stress-test-hypotheses -> generate-implications -> plan-report -> write-report
```

Intelligence-v2 pipeline (9 stages, feature-flagged via USE_INTELLIGENCE_V2=true):
```
extract-signals -> gtm-analysis -> detect-tensions -> detect-patterns
  -> adapter (archetype classification) -> diagnosis -> mechanisms -> intervention -> report-v2
```

Intelligence-v3 pipeline (17 stages — upstream implemented, memo layer stubbed):
```
siteCorpusAcquisition -> externalResearchAcquisition -> mergeResearchCorpus
  -> corpusToDossierAdapter -> [V2 reasoning spine] -> buildEvidencePack
  -> adjudicateDiagnosis -> buildMemoBrief -> writeMemo -> criticiseMemo -> runSendGate
```

Errors = structural integrity (fail validation). Warnings = trust/quality (never fail).

# Development Stage

**MK1 (complete):** Full vertical slice. Company input to validated dossier.

**MK2 Core (complete, Phases 1-4):** Better judgment quality, not more fields. Validator enhancement, source tiers, skill workflow, narrative gap traceability.

**MK2B (complete, Phases 5-6):** Schema expansion for narrative intelligence and research depth metadata.

**MK3 (complete, Phase 7 + 7b):** Strategic hypotheses in dossier schema.

**Report Engine (complete, Phases 5-19 + Phase 8 Reasoning + Phase 9B Specificity):** Eval harness + 8 pipeline stages + writer layer + batch runner + reasoning improvements.

**Intelligence-V2 (complete):** Deterministic reasoning pipeline producing diagnosis/mechanisms/intervention. GTM analysis classifiers, archetype-based pattern scoring, mechanism maps, intervention maps, LLM report renderer. Calibration complete — all 3 reference companies produce correct diagnoses. 174 tests pass.

**Intelligence-V3 Upstream (current — V3-U1 through V3-U4 implemented):** Acquisition layer complete. `siteCorpusAcquisition`, `externalResearchAcquisition`, `mergeResearchCorpus`, `corpusToDossierAdapter` all implemented with fixture/manual mode + pluggable provider interfaces. 208 tests pass (174 existing + 34 new). Memo layer (V3-M1 through V3-M6) remains stubbed.

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
| **V2 Calibration 1** | **Archetype scoring bias** | **positioning_vs_customer_base weight split ET:2/NDM:2** |
| **V2 Calibration 2** | **PLG signal extraction + DAWBM scoring** | **Pass 19+20; plg boost; 174 tests** |
| **V2 Calibration 3** | **Product-led distribution boost for DAWBM** | **primary_channel=product → DAWBM +2** |
| **V2 Calibration 4** | **Omnea ET fix via positioning_vs_market_fit affinity** | **pvm carries ET:+1; all 3 companies correct** |
| **V3 Spec Pack** | **6 implementation-grade spec files** | **docs/specs/intelligence-engine-v3/001–006** |
| **V3 Scaffold** | **TypeScript types + TODO stubs** | **src/intelligence-v3/ — 15 files, no logic** |
| **V3 Upstream** | **Acquisition layer (V3-U1 through V3-U4)** | **site-corpus, external-research, merge-corpus, corpus-to-dossier — 34 new tests** |

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
src/intelligence-v3/                    # V3 pipeline
  types/                                # ResearchCorpus, EvidencePack, Adjudication, MemoBrief, Memo, MemoCritic, SendGate
  acquisition/                          # V3-U1 through V3-U4 (IMPLEMENTED)
    site-corpus.ts                      # siteCorpusAcquisition() — fixture + provider mode
    external-research.ts                # externalResearchAcquisition() — fixture + provider mode
    merge-corpus.ts                     # mergeResearchCorpus() — dedup + tier distribution
    corpus-to-dossier.ts                # corpusToDossierAdapter() — ResearchCorpus → Dossier
  __tests__/
    acquisition.test.ts                 # 34 tests for V3-U1 through V3-U4
  memo/                                 # V3-M1 through V3-M6 (stubbed — not implemented)
    build-evidence-pack.ts
    adjudicate-diagnosis.ts
    build-memo-brief.ts
    write-memo.ts
    criticise-memo.ts
    run-send-gate.ts
  pipeline/
    run-v3-pipeline.ts                  # runV3Pipeline() orchestrator (stubbed)
docs/specs/Intelligence-engine-specs/   # 8 V1 upstream specs
docs/specs/report-specs/                # 9 report engine specs
docs/specs/intelligence-engine-v2/      # 6 V2 specs
docs/specs/intelligence-engine-v3/      # 6 V3 specs
  001_product_contract.md
  002_pipeline_architecture.md
  003_evidence_pack_spec.md
  004_adjudication_spec.md
  005_memo_spec.md
  006_send_gate_spec.md
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

Current adapter boosts in `classifyArchetype()`:
```typescript
if (gtm.service_dependency.hidden_services_risk >= 0.5)       scores.services_disguised_as_saas += 2
if (gtm.founder_dependency.risk_score >= 0.67)                scores.founder_led_sales_ceiling += 2
if (gtm.sales_motion.mode === 'founder_led')                   scores.founder_led_sales_ceiling += 2
if (gtm.sales_motion.mode === 'plg')                           scores.developer_adoption_without_buyer_motion += 2
if (gtm.distribution_architecture.primary_channel === 'product') scores.developer_adoption_without_buyer_motion += 2
if (gtm.buyer_structure.user_buyer_mismatch)                   scores.developer_adoption_without_buyer_motion += 3
if (gtm.distribution_architecture.fragility_score >= 0.7)     scores.distribution_fragility += 2
if (gtm.pricing_delivery_fit.delivery_fit_tension)             scores.services_disguised_as_saas += 1
```

Verified company diagnoses (208 tests, all pass):

| Company | Signals | Diagnosis | Accurate? |
|---------|---------|-----------|-----------|
| Trigger.dev | 6 | `developer_adoption_without_buyer_motion` | Yes |
| Omnea | 5 | `enterprise_theatre` | Yes |
| Form3 | 4 | `narrative_distribution_mismatch` | Partially (IS enterprise but lacks ambition_vs_proof) |

# Intelligence-V3 Upstream Layer

The acquisition layer (V3-U1 through V3-U4) is complete. It feeds the V2 reasoning spine a richer Dossier produced from structured web research rather than manual skill output.

**V3-U1: siteCorpusAcquisition**
- Two modes: fixture/manual (for tests) and provider (pluggable — future Cloudflare)
- Validates mandatory pages (homepage, pricing, about); ERR_CORPUS_EMPTY on missing homepage
- Enforces ≤10 pages, ≤20k tokens with priority-ordered truncation
- Token counts computed automatically from raw_text (1 token ≈ 4 chars)

**V3-U2: externalResearchAcquisition**
- Two modes: fixture/manual and provider (pluggable — future Perplexity)
- Non-fatal on sparse results (WARN_EXTERNAL_RESEARCH_SPARSE, pipeline continues)
- Typed source priority order matches spec (reviews → press → competitors → funding → LinkedIn)

**V3-U3: mergeResearchCorpus**
- URL dedup: keeps higher token-count version
- Content hash dedup (SHA-256, 16 chars): catches identical excerpts from different queries
- Four-bucket structure: site_pages, external_sources, community_mentions, founder_statements
- company_id derived from domain via slugify()

**V3-U4: corpusToDossierAdapter**
- Starts from createEmptyDossier() — all 16 sections always present
- One SourceRecord + one EvidenceRecord per corpus item
- evidence_type derived from page_type / source_type via static maps
- Populates: company_input, run_metadata, company_profile, product_and_offer, gtm_model, customer_and_personas, competitors, signals, narrative_intelligence, confidence_and_gaps
- Inline integrity check throws ERR_DOSSIER_INVALID on broken evidence/source links
- TODOs mark where NLP extraction will come in a later phase

# Current Phase

**V3 Upstream acquisition layer (V3-U1 through V3-U4) implemented and tested. 208 tests pass.**

The V2 reasoning spine can now consume V3-produced dossiers. The corpusToDossierAdapter output passes structural integrity checks. Deeper field population (leadership extraction, pricing signal parsing, narrative gap detection) is marked TODO for a subsequent phase.

# Next Step

Implement V3 memo layer stages in order:

1. **V3-M1: buildEvidencePack** — score all dossier evidence records on 4 dimensions; assign memo roles; build hook_candidates. Fully deterministic. Spec: `003_evidence_pack_spec.md`.

2. **V3-M2: adjudicateDiagnosis** — run 4 checks; compute total_points; apply override rules; return AdjudicationResult. Fully deterministic. Spec: `004_adjudication_spec.md`.

3. **V3-M3: buildMemoBrief** — select hook, derive thesis, build evidence_spine, generate CTA. Deterministic. Merge V2 banned phrases from `src/intelligence-v2/stages/report/prompt.ts` into `BANNED_PHRASES` export. Spec: `005_memo_spec.md`.

4. **V3-M4/M5: writeMemo + criticiseMemo** — two LLM calls (Haiku). Pattern after `src/intelligence-v2/stages/report/writer.ts`. Wire revision loop in pipeline orchestrator.

5. **V3-M6: runSendGate** — evaluate all 6 criteria; compute quality score; return SendGateResult. Spec: `006_send_gate_spec.md`.

6. **V3 pipeline orchestrator** — wire all stages in `runV3Pipeline()`. Export `V2PipelineResult` from `src/intelligence-v2/pipeline.ts` (currently not exported).

Pre-implementation note:
- `V2PipelineResult` needs to be exported from `src/intelligence-v2/pipeline.ts`

# Known Constraints

- MK2 Core must NOT add new dossier fields. Schema expansion is MK2B/MK3 only.
- `additionalProperties: false` on section objects — new fields require schema update first.
- Report engine must not perform fresh research — operates only on dossier-derived data.
- Pipeline stages downstream of extract-signals must not inspect dossier directly (signals-only).
- V2 report rendering requires `ANTHROPIC_API_KEY` environment variable.
- V2 pipeline produces exactly 1 diagnosis, 2-3 mechanisms, 1 intervention per company.
- All deterministic except the final report prose render (Haiku model).
- Legacy pipeline is NOT removed. All three pipelines coexist.
- SKILL.md must stay under ~400 lines.
- All 16 dossier sections must exist even when empty.
- WebSearch + WebFetch only. No external tools.
- Do not touch D2/D3/D8 individually — they are internally self-consistent.
- Score debug logging (`ARCHETYPE_DEBUG=true`) is diagnostic only.
- V3 acquisition must not modify any existing V2 source files.
- `CorpusToDossierAdapter` must produce a Dossier that passes existing `src/validate.ts`.
- All LLM calls isolated to V3-M4 and V3-M5; no other stages may call an LLM.

# Files Modified Recently

**V3 Upstream Implementation (this session):**
- `src/intelligence-v3/acquisition/site-corpus.ts` — implemented (was stub)
- `src/intelligence-v3/acquisition/external-research.ts` — implemented (was stub)
- `src/intelligence-v3/acquisition/merge-corpus.ts` — implemented (was stub)
- `src/intelligence-v3/acquisition/corpus-to-dossier.ts` — implemented (was stub)
- `src/intelligence-v3/__tests__/acquisition.test.ts` — NEW (34 tests)
- `docs/handoffs/current.md` — updated (this file)

**No V2 files modified. Test count: 208. All pass.**
