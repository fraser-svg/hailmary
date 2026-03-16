# Company Intelligence Engine — Current Handover

# Project Goal

A system that accepts a company name and domain, conducts structured public research, and produces a machine-readable JSON dossier for downstream AI consumption. The dossier surfaces the gap between company messaging and customer-perceived value. A deterministic reasoning pipeline then produces a GTM diagnosis, causal mechanisms, and intervention opportunity. V3 adds a memo generation layer: the system produces a founder-facing strategic memo good enough for physical outreach. V4 adds an argument synthesis layer: a second LLM pass produces a structurally distinct argument to elevate the memo beyond pattern-matching.

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
  -> [V4] synthesiseArgument (if memoIntelligenceVersion === 'v4') -> ArgumentSynthesis injected into MemoBrief
  -> [V3/V4] writeMemo (LLM, attempt 1)
       -> criticiseMemo (adversarial LLM, attempt 1)
       -> [if !overall_pass] writeMemo (LLM, attempt 2, revision_instructions injected)
       -> [if !overall_pass] criticiseMemo (adversarial LLM, attempt 2)
  -> runSendGate (deterministic, on final memo)
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

Intelligence-v3 pipeline (fully implemented M1 through M6 + revision loop):
```
siteCorpusAcquisition -> externalResearchAcquisition -> mergeResearchCorpus
  -> corpusToDossierAdapter -> [V2 reasoning spine] -> buildEvidencePack
  -> adjudicateDiagnosis -> buildMemoBrief
  -> writeMemo(1) -> criticiseMemo(1)
  -> [revision if fail] writeMemo(2) -> criticiseMemo(2)
  -> runSendGate(final)
```

V4 extends the V3 path with an additional synthesis stage before writeMemo:
```
... -> buildMemoBrief -> synthesiseArgument (Sonnet 4.6) -> [ArgumentSynthesis injected] -> writeMemo ...
```

Errors = structural integrity (fail validation). Warnings = trust/quality (never fail).

# Development Stage

**MK1 (complete):** Full vertical slice. Company input to validated dossier.

**MK2 Core (complete, Phases 1-4):** Better judgment quality, not more fields. Validator enhancement, source tiers, skill workflow, narrative gap traceability.

**MK2B (complete, Phases 5-6):** Schema expansion for narrative intelligence and research depth metadata.

**MK3 (complete, Phase 7 + 7b):** Strategic hypotheses in dossier schema.

**Report Engine (complete, Phases 5-19 + Phase 8 Reasoning + Phase 9B Specificity):** Eval harness + 8 pipeline stages + writer layer + batch runner + reasoning improvements.

**Intelligence-V2 (complete):** Deterministic reasoning pipeline producing diagnosis/mechanisms/intervention. GTM analysis classifiers, archetype-based pattern scoring, mechanism maps, intervention maps, LLM report renderer. Calibration complete — all 3 reference companies produce correct diagnoses. 174 tests pass.

**Intelligence-V3 Upstream (complete — V3-U1 through V3-U4):** Acquisition layer complete. `siteCorpusAcquisition`, `externalResearchAcquisition`, `mergeResearchCorpus`, `corpusToDossierAdapter` all implemented with fixture/manual mode + pluggable provider interfaces.

**Intelligence-V3 Memo Layer (complete — M1 through M6 + revision loop):** Full pipeline from evidence pack through send gate. 443 tests pass. Manual memo QA conducted on Omnea (verdict: would send) and Trigger.dev (DAWBM framing gap confirmed).

**V4 Phase 1 (complete):** `memoIntelligenceVersion` flag (`'v3' | 'v4'`) added to `runV3Pipeline` options. Branch scaffold: V4 path is a no-op stub returning undefined synthesis. 537 tests pass.

**V4 Phase 2 (complete):** `synthesiseArgument` (V4-M2a) fully implemented. Sonnet 4.6 produces a structurally distinct argument from the evidence pack. 4 distinctness checks (≥4 unique claims, no banned phrases, ≥2 evidence refs, ≤250 words). 3-attempt retry protocol with fallback to template on exhaustion. `buildMemoBrief` consumes `ArgumentSynthesis` when present. `writeMemo` V4 system prompt extended with synthesis instructions. Pipeline wired. 621 tests pass.

**V4 Phase 3 (complete — eval harness + live evaluation):** `compare-v3-v4.ts` evaluation harness implemented with mock and live modes. `RunComparison` type, `ComparisonSummary` (27 fields), 3 quality heuristics. Fixture-specific mock synthesis for 001-ai-services. 2 new pipeline integration tests (fallback path + success path with mock synth client). 671 tests pass.

**V4 Phase 3 Live Eval (complete — Trigger.dev + Omnea + Gendo):** Synthesis fell back to template in all 3 companies (`confidence=low`, `fit=strained`). V3 outperformed V4 in every case (quality: 69 avg vs 53 avg). Root cause: current dossiers lack Tier 3 buyer-side evidence needed for synthesis confidence > low. Even with `fallback_to_template=true`, V4 brief produces different (worse) writer output than V3 brief because synthesis fields are still present in the brief and confuse the writer. **Acquisition layer (real Cloudflare + Perplexity providers) is the prerequisite before V4 synthesis can be useful.**

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
| **V3-M1** | **buildEvidencePack + runV3Pipeline** | **4-dim scoring, 6 roles, hook detection, pipeline wired — 64 new tests** |
| **V3-M2** | **adjudicateDiagnosis** | **4-check scoring, mode determination, override rules, confidence caveats, abort report** |
| **V3-M3** | **buildMemoBrief** | **Hook selection, thesis, evidence spine, intervention framing, CTA, banned phrases — 321 total** |
| **V3-M4** | **writeMemo (LLM)** | **Haiku renderer, 5-section parser, banned-phrase/word-count validation, injectable client — 46 new tests** |
| **V3-M5** | **criticiseMemo (adversarial LLM)** | **4 dim scores + genericity test + founder pushback test, overall_pass, revision_instructions, injectable client — 24 new tests** |
| **V3-M6** | **runSendGate (deterministic)** | **6-criterion gate, hard/conditional failures, 0-100 quality score, GateSummary — 43 new tests** |
| **V3 Live Audit** | **Real execution on Trigger.dev + Omnea dossiers** | **M1–M3 real outputs; M4–M6 simulated; quality findings documented** |
| **V3 Revision Loop** | **Max-2-attempt write→critic loop** | **revision_instructions injected into attempt 2 brief; firstAttemptMemo/firstCriticResult in result; 5 new tests — 443 total** |
| **V3 Manual Memo QA** | **End-to-end memo quality evaluation against real artifacts** | **Omnea v3-deterministic.json used as input; full draft→critique→revision→final cycle; verdict: would send** |
| **V4 Phase 1** | **memoIntelligenceVersion flag + V4 branch scaffold** | **run-v3-pipeline.ts branched; V4 path is no-op stub — 537 tests** |
| **V4 Phase 2** | **synthesiseArgument (V4-M2a)** | **Sonnet 4.6 synthesis, 4 distinctness checks, retry/fallback, brief+prompt integration — 621 tests** |
| **V4 Phase 3** | **compare-v3-v4 eval harness** | **Mock+live modes, RunComparison, ComparisonSummary (27 fields), 3 heuristics — 671 tests** |
| **V4 Phase 3 Eval** | **Live evaluation on 3 companies** | **Synthesis fallback in all 3; V3 wins (69 vs 53 avg quality); root cause: no Tier 3 buyer evidence** |

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
  compare-v3-v4.ts                      # V4 Phase 3 eval harness (mock + live modes)
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
  pipeline.ts                           # V2 pipeline orchestrator (exports V2PipelineResult)
src/intelligence-v3/                    # V3/V4 pipeline
  types/                                # ResearchCorpus, EvidencePack, Adjudication, MemoBrief, Memo, MemoCritic, SendGate
    argument-synthesis.ts               # ArgumentSynthesis type (V4)
    acquisition-quality.ts              # AcquisitionQuality type
  acquisition/                          # V3-U1 through V3-U4 (IMPLEMENTED)
    site-corpus.ts                      # siteCorpusAcquisition() — fixture + provider mode
    external-research.ts                # externalResearchAcquisition() — fixture + provider mode
    merge-corpus.ts                     # mergeResearchCorpus() — dedup + tier distribution
    corpus-to-dossier.ts                # corpusToDossierAdapter() — ResearchCorpus → Dossier
    source-filter.ts                    # Source filtering utilities
  providers/                            # Pluggable provider interfaces (stubs for Cloudflare/Perplexity)
  memo/                                 # V3/V4 memo layer
    build-evidence-pack.ts              # IMPLEMENTED — 4-dim scoring, 6 roles, hook detection
    adjudicate-diagnosis.ts             # IMPLEMENTED — V3-M2
    build-memo-brief.ts                 # IMPLEMENTED — V3-M3 (consumes ArgumentSynthesis when present)
    write-memo.ts                       # IMPLEMENTED — V3-M4 (LLM); V4 system prompt extended
    criticise-memo.ts                   # IMPLEMENTED — V3-M5 (adversarial LLM critic)
    run-send-gate.ts                    # IMPLEMENTED — V3-M6 (deterministic send gate)
    synthesise-argument.ts              # IMPLEMENTED — V4-M2a (Sonnet 4.6 argument synthesis)
  pipeline/
    run-v3-pipeline.ts                  # IMPLEMENTED — full orchestrator M1→M6 + revision loop + V4 branch
  __tests__/
    acquisition.test.ts                 # 34 tests for V3-U1 through V3-U4
    evidence-pack.test.ts               # 50 tests for V3-M1 (buildEvidencePack)
    adjudication.test.ts                # 46 tests for V3-M2 + V3-M3
    write-memo.test.ts                  # 46 tests for V3-M4 (write-memo)
    criticise-memo.test.ts              # 24 tests for V3-M5 (criticise-memo)
    run-send-gate.test.ts               # 43 tests for V3-M6 (run-send-gate)
    run-v3-pipeline.test.ts             # 31 tests for pipeline orchestrator (M1→M6 + V4 branch + revision loop)
    synthesise-argument.test.ts         # V4-M2a tests
    compare-v3-v4.test.ts               # V4 Phase 3 eval harness tests
    external-research-queries.test.ts   # External research query tests
    source-filter.test.ts               # Source filter tests
src/scripts/                            # Utility scripts
docs/specs/Intelligence-engine-specs/   # 8 V1 upstream specs
docs/specs/report-specs/                # 9 report engine specs
docs/specs/intelligence-engine-v2/      # 6 V2 specs
docs/specs/intelligence-engine-v3/      # 7 V3 specs
  001_product_contract.md
  002_pipeline_architecture.md
  003_evidence_pack_spec.md
  004_adjudication_spec.md
  005_memo_spec.md
  006_send_gate_spec.md
  007_autocompact_checkpoint.md
docs/specs/v4-001-memo-intelligence.md  # V4 synthesis spec
docs/handoffs/current.md                # This file
.claude/skills/build-company-dossier/   # SKILL.md + 7 reference docs
eval-results/                           # V4 live eval output (Trigger.dev, Omnea, Gendo)
runs/                                   # Per-company dossier output (gitignored)
  trigger-dev/dossier.json              # Valid dossier (52 evidence records, 14 sources)
  trigger-dev/v3-deterministic.json     # M1–M3 real artifacts from live execution audit
  omnea/dossier.json                    # Valid dossier (48 evidence records, 14 sources, 1 warning)
  omnea/v3-deterministic.json           # M1–M3 real artifacts from live execution audit
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

Verified company diagnoses:

| Company | Signals | Diagnosis | Accurate? |
|---------|---------|-----------|-----------|
| Trigger.dev | 6 | `developer_adoption_without_buyer_motion` | Yes |
| Omnea | 5 | `enterprise_theatre` | Yes |
| Form3 | 4 | `narrative_distribution_mismatch` | Partially (IS enterprise but lacks ambition_vs_proof to tip ET over NDM) |

# Intelligence-V3 Upstream Layer

The acquisition layer (V3-U1 through V3-U4) is complete. It feeds the V2 reasoning spine a richer Dossier produced from structured web research rather than manual skill output.

**V3-U1: siteCorpusAcquisition** — Two modes: fixture/manual and provider (pluggable — future Cloudflare). Validates mandatory pages; ERR_CORPUS_EMPTY on missing homepage. Enforces ≤10 pages, ≤20k tokens with priority-ordered truncation.

**V3-U2: externalResearchAcquisition** — Two modes: fixture/manual and provider (pluggable — future Perplexity). Non-fatal on sparse results.

**V3-U3: mergeResearchCorpus** — URL dedup (keeps higher token-count version) + content hash dedup (SHA-256, 16 chars).

**V3-U4: corpusToDossierAdapter** — Starts from createEmptyDossier(). One SourceRecord + one EvidenceRecord per corpus item. Inline integrity check throws ERR_DOSSIER_INVALID on broken evidence/source links.

# Intelligence-V4 Synthesis Layer

**synthesiseArgument (V4-M2a):** Sonnet 4.6. Input: EvidencePack + Diagnosis + Intervention. Output: `ArgumentSynthesis` with `central_argument`, `evidence_bridge`, `counter_intuitive_angle`, `confidence`, `fit`.

**Distinctness checks (4):** ≥4 unique claims, no banned phrases, ≥2 evidence refs, ≤250 words.

**Retry protocol:** 3 attempts with distinctness feedback injected. Fallback to template on exhaustion (`confidence: 'low'`, `fit: 'strained'`).

**Pipeline integration:** When `memoIntelligenceVersion === 'v4'`, `synthesiseArgument` runs after `buildMemoBrief` and before `writeMemo`. The resulting `ArgumentSynthesis` is injected into the `MemoBrief` and the V4 system prompt. When synthesis falls back, the brief still carries synthesis fields — **this degrades writer output (V4 eval finding)**. Brief should suppress synthesis fields when fallback is active.

**V4 Eval Results (3 companies, live):**

| Company | Synthesis Confidence | Synthesis Fit | V3 Quality | V4 Quality | Winner |
|---------|---------------------|---------------|------------|------------|--------|
| Trigger.dev | low | strained | 72 | 55 | V3 |
| Omnea | low | strained | 68 | 52 | V3 |
| Gendo | low | strained | 67 | 52 | V3 |

**Root cause:** All current dossiers lack Tier 3 buyer-side evidence (review quotes, loss reasons, buyer objections). Synthesis needs this evidence to produce `confidence > low`. **Real acquisition providers (Cloudflare Browser Rendering + Perplexity) are the prerequisite.**

# V3 Live Execution Audit — Findings

**Executed prior session.** M1–M3 deterministic stages ran against real dossiers. Artifacts at `runs/*/v3-deterministic.json`.

**Blocker:** `ANTHROPIC_API_KEY` not set in environment. M4 (writeMemo) and M5 (criticiseMemo) cannot be executed programmatically. Use `claude -p` subprocess with execFileSync as workaround.

**Per-company results (V3):**

| Company | Diagnosis | Adjudication | Pack Quality | Send Gate | Quality Score |
|---------|-----------|-------------|--------------|-----------|---------------|
| Trigger.dev | DAWBM / medium | conditional / 6pts | weak | FAIL (genericity) | ~48/100 |
| Omnea | enterprise_theatre / medium | full_confidence / 8pts | strong | PASS | ~75/100 |
| Resend | DAWBM (predicted) | full_confidence (predicted) | strong (predicted) | PASS (predicted) | ~68/100 |

# Current Phase

**V4 Phase 3 complete. 671 tests pass. Live evaluation complete.**

V4 synthesis is fully implemented and evaluated. The eval verdict is clear: V4 produces worse output than V3 with current dossiers because synthesis always falls back to template (all 3 live companies: `confidence=low`, `fit=strained`). Even with fallback, V4 brief exposes synthesis fields to the writer, degrading quality. The root cause is evidence quality, not synthesis logic: current dossiers are built from site corpus + manual research and lack the Tier 3 buyer-side evidence (review quotes, objection data, loss reasons) that synthesis needs.

# Next Step

**Priority 1 — Fix V4 brief when synthesis falls back.** When `ArgumentSynthesis.confidence === 'low'` or `fit === 'strained'`, `buildMemoBrief` should suppress synthesis fields entirely rather than passing them to the writer. This would at minimum neutralise V4's quality penalty vs V3 on current dossiers.

**Priority 2 — Real acquisition providers.** Implement Cloudflare Browser Rendering provider for `siteCorpusAcquisition` and Perplexity provider for `externalResearchAcquisition`. This is the only path to dossiers with sufficient Tier 3 evidence for synthesis confidence > low. Without this, V4 remains permanently degraded.

**Priority 3 — Fix DAWBM intervention framing.** CTA text for Trigger.dev reads "pipeline that works without you in every deal" — `founder_gtm_transition` language, not `sales_motion_redesign` language. Inspect `interventionFramingLookup` in `build-memo-brief.ts` and correct.

**Priority 4 — Model upgrade test.** Run memo generation with Sonnet instead of Haiku to quantify commercial_sharpness improvement. Update `DEFAULT_MODEL` in `write-memo.ts` if quality gain justifies cost.

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
- WebSearch + WebFetch only for research. No external tools.
- Do not touch D2/D3/D8 individually — they are internally self-consistent.
- Score debug logging (`ARCHETYPE_DEBUG=true`) is diagnostic only.
- V3 acquisition must not modify any existing V2 source files.
- `CorpusToDossierAdapter` must produce a Dossier that passes existing `src/validate.ts`.
- All LLM calls isolated to V3-M4 (`writeMemo`), V3-M5 (`criticiseMemo`), V4-M2a (`synthesiseArgument`). No other stages may call an LLM.
- V3-M6 `runSendGate` is fully deterministic — no LLM call.
- Revision loop: max 2 write attempts. No further looping after attempt 2 regardless of critic result.
- V4 synthesis uses Sonnet 4.6; V3 memo writer uses Haiku. Do not change model without updating tests.
- `RevisionInstructions` is an object type: `{attempt_number, failing_dimensions, specific_issues, founder_pushback_context}`.

# Files Modified Recently

**V4 Phase 1–3 (current session):**
- `src/intelligence-v3/pipeline/run-v3-pipeline.ts` — V4 branch (memoIntelligenceVersion flag + synthesiseArgument call)
- `src/intelligence-v3/memo/synthesise-argument.ts` — NEW: V4-M2a implementation
- `src/intelligence-v3/memo/build-memo-brief.ts` — consumes ArgumentSynthesis when present
- `src/intelligence-v3/memo/write-memo.ts` — V4 system prompt additions
- `src/intelligence-v3/types/argument-synthesis.ts` — NEW: ArgumentSynthesis type
- `src/intelligence-v3/types/acquisition-quality.ts` — NEW: AcquisitionQuality type
- `src/intelligence-v3/types/memo-brief.ts` — ArgumentSynthesis fields added
- `src/intelligence-v3/types/research-corpus.ts` — updates
- `src/intelligence-v3/acquisition/corpus-to-dossier.ts` — updates
- `src/intelligence-v3/acquisition/external-research.ts` — updates
- `src/intelligence-v3/acquisition/merge-corpus.ts` — updates
- `src/intelligence-v3/acquisition/site-corpus.ts` — updates
- `src/intelligence-v3/acquisition/source-filter.ts` — NEW
- `src/intelligence-v3/providers/` — NEW: provider interface stubs
- `src/intelligence-v3/memo/build-evidence-pack.ts` — updates
- `src/intelligence-v3/__tests__/synthesise-argument.test.ts` — NEW
- `src/intelligence-v3/__tests__/compare-v3-v4.test.ts` — NEW
- `src/intelligence-v3/__tests__/external-research-queries.test.ts` — NEW
- `src/intelligence-v3/__tests__/source-filter.test.ts` — NEW
- `src/intelligence-v3/__tests__/acquisition.test.ts` — updated
- `src/intelligence-v3/__tests__/evidence-pack.test.ts` — updated
- `src/intelligence-v3/__tests__/run-v3-pipeline.test.ts` — updated (V4 branch tests added)
- `src/report/evals/compare-v3-v4.ts` — NEW: V4 eval harness
- `src/types/source.ts` — updates
- `src/validate-core.ts` — updates
- `schemas/company-dossier.schema.json` — updates
- `package.json` / `package-lock.json` — dependency updates
- `docs/specs/intelligence-engine-v3/002_pipeline_architecture.md` — V4 pipeline additions
- `docs/specs/intelligence-engine-v3/005_acquisition_providers.md` — NEW
- `docs/specs/intelligence-engine-v3/006_evidence_schema_v2.md` — NEW
- `docs/specs/intelligence-engine-v3/007_autocompact_checkpoint.md` — NEW
- `docs/specs/v4-001-memo-intelligence.md` — NEW
- `eval-results/` — NEW: V4 live eval output
- `phase3-eval-live.ts` — NEW: live eval runner script
- `src/scripts/` — NEW: utility scripts

**671 tests pass. All existing behaviour preserved.**
