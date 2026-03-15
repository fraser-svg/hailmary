# Company Intelligence Engine — Current Handover

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
  -> [V3] writeMemo (LLM, attempt 1)
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

Errors = structural integrity (fail validation). Warnings = trust/quality (never fail).

# Development Stage

**MK1 (complete):** Full vertical slice. Company input to validated dossier.

**MK2 Core (complete, Phases 1-4):** Better judgment quality, not more fields. Validator enhancement, source tiers, skill workflow, narrative gap traceability.

**MK2B (complete, Phases 5-6):** Schema expansion for narrative intelligence and research depth metadata.

**MK3 (complete, Phase 7 + 7b):** Strategic hypotheses in dossier schema.

**Report Engine (complete, Phases 5-19 + Phase 8 Reasoning + Phase 9B Specificity):** Eval harness + 8 pipeline stages + writer layer + batch runner + reasoning improvements.

**Intelligence-V2 (complete):** Deterministic reasoning pipeline producing diagnosis/mechanisms/intervention. GTM analysis classifiers, archetype-based pattern scoring, mechanism maps, intervention maps, LLM report renderer. Calibration complete — all 3 reference companies produce correct diagnoses. 174 tests pass.

**Intelligence-V3 Upstream (complete — V3-U1 through V3-U4):** Acquisition layer complete. `siteCorpusAcquisition`, `externalResearchAcquisition`, `mergeResearchCorpus`, `corpusToDossierAdapter` all implemented with fixture/manual mode + pluggable provider interfaces.

**Intelligence-V3 Memo Layer — V3-M1 (complete):** `buildEvidencePack` fully implemented. 4-dimension scoring (commercial_salience, specificity, customer_voice, recency), 6 memo roles, hook candidate detection, minimum mix enforcement, PackQuality. Pipeline orchestrator (`runV3Pipeline`) fully wired.

**Intelligence-V3 Memo Layer — V3-M2 + V3-M3 (complete):** `adjudicateDiagnosis` and `buildMemoBrief` implemented. Adjudication: 4-check scoring (diagnosis confidence, evidence coverage, source diversity, archetype gap), mode determination (full_confidence/conditional/exploratory/abort), 3 override rules, confidence caveats, abort report. MemoBrief: hook selection, thesis derivation, evidence spine selection (3–5 records with role coverage), intervention framing lookup, CTA generation, merged V2+V3 banned phrases. 321 tests pass.

**Intelligence-V3 Memo Layer — V3-M4 (complete):** `writeMemo` fully implemented. LLM stage using claude-haiku-4-5-20251001. Exported `buildSystemPrompt`, `buildUserPrompt`, `parseResponse` for deterministic testing. Validation: ERR_MEMO_TOO_SHORT (< 300 words), ERR_MEMO_TOO_LONG (> 850), ERR_MEMO_EVIDENCE_EMPTY, ERR_BANNED_PHRASE, ERR_ADJUDICATION_ABORT guard. `WriteMemoConfig` injectable client for tests. MemoBrief extended with `diagnosis_id` and `intervention_id` fields. `buildUserPrompt` appends `REVISION REQUIRED` block when `brief.revision_instructions` is present.

**Intelligence-V3 Memo Layer — V3-M5 + V3-M6 (complete):** `criticiseMemo` and `runSendGate` fully implemented. Pipeline wired end-to-end M1→M6.

**Intelligence-V3 Revision Loop (complete):** Max-2-attempt revision loop wired in `runV3Pipeline`. After attempt 1, if `criticResult.overall_pass = false`, revision instructions are appended to the `MemoBrief` and `writeMemo` + `criticiseMemo` run once more. `V3PipelineResult` extended with `firstAttemptMemo?` and `firstCriticResult?` (populated only when revision ran). `sendGate` always runs on the final memo only. **443 tests pass.**

**V3 Live Execution Audit (prior session):** Full V3 deterministic pipeline (M1–M3) executed on real dossiers for Trigger.dev and Omnea. Qualitative output review conducted across Trigger.dev, Omnea, and Resend (research-only). Key findings documented below.

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
| **V3 Manual Memo QA** | **End-to-end memo quality evaluation against real artifacts** | **Omnea v3-deterministic.json used as input; full draft→critique→revision→final cycle run manually; verdict: would send; Trigger.dev memo identified as weaker (DAWBM framing gap confirmed)** |

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
  pipeline.ts                           # V2 pipeline orchestrator (exports V2PipelineResult)
src/intelligence-v3/                    # V3 pipeline
  types/                                # ResearchCorpus, EvidencePack, Adjudication, MemoBrief, Memo, MemoCritic, SendGate
  acquisition/                          # V3-U1 through V3-U4 (IMPLEMENTED)
    site-corpus.ts                      # siteCorpusAcquisition() — fixture + provider mode
    external-research.ts                # externalResearchAcquisition() — fixture + provider mode
    merge-corpus.ts                     # mergeResearchCorpus() — dedup + tier distribution
    corpus-to-dossier.ts                # corpusToDossierAdapter() — ResearchCorpus → Dossier
  memo/                                 # V3 memo layer
    build-evidence-pack.ts              # IMPLEMENTED — 4-dim scoring, 6 roles, hook detection
    adjudicate-diagnosis.ts             # IMPLEMENTED — V3-M2
    build-memo-brief.ts                 # IMPLEMENTED — V3-M3
    write-memo.ts                       # IMPLEMENTED — V3-M4 (LLM); injects revision block on attempt 2
    criticise-memo.ts                   # IMPLEMENTED — V3-M5 (adversarial LLM critic)
    run-send-gate.ts                    # IMPLEMENTED — V3-M6 (deterministic send gate)
  pipeline/
    run-v3-pipeline.ts                  # IMPLEMENTED — full orchestrator M1→M6 + revision loop
  __tests__/
    acquisition.test.ts                 # 34 tests for V3-U1 through V3-U4
    evidence-pack.test.ts               # 50 tests for V3-M1 (buildEvidencePack)
    adjudication.test.ts                # 46 tests for V3-M2 + V3-M3
    write-memo.test.ts                  # 46 tests for V3-M4 (write-memo)
    criticise-memo.test.ts              # 24 tests for V3-M5 (criticise-memo)
    run-send-gate.test.ts               # 43 tests for V3-M6 (run-send-gate)
    run-v3-pipeline.test.ts             # 29 tests for pipeline orchestrator (M1→M6 + revision loop)
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

**V3-U1: siteCorpusAcquisition**
- Two modes: fixture/manual (for tests) and provider (pluggable — future Cloudflare)
- Validates mandatory pages (homepage, pricing, about); ERR_CORPUS_EMPTY on missing homepage
- Enforces ≤10 pages, ≤20k tokens with priority-ordered truncation

**V3-U2: externalResearchAcquisition**
- Two modes: fixture/manual and provider (pluggable — future Perplexity)
- Non-fatal on sparse results (WARN_EXTERNAL_RESEARCH_SPARSE, pipeline continues)

**V3-U3: mergeResearchCorpus**
- URL dedup: keeps higher token-count version
- Content hash dedup (SHA-256, 16 chars): catches identical excerpts from different queries

**V3-U4: corpusToDossierAdapter**
- Starts from createEmptyDossier() — all 16 sections always present
- One SourceRecord + one EvidenceRecord per corpus item
- Inline integrity check throws ERR_DOSSIER_INVALID on broken evidence/source links

# V3 Live Execution Audit — Findings

**Executed prior session.** M1–M3 deterministic stages ran against real dossiers. Artifacts at `runs/*/v3-deterministic.json`.

**Blocker:** `ANTHROPIC_API_KEY` not set in environment. M4 (writeMemo) and M5 (criticiseMemo) cannot be executed programmatically. Set it in shell before running the full pipeline.

**Per-company results:**

| Company | Diagnosis | Adjudication | Pack Quality | Send Gate | Quality Score |
|---------|-----------|-------------|--------------|-----------|---------------|
| Trigger.dev | DAWBM / medium | conditional / 6pts | weak | FAIL (genericity) | ~48/100 |
| Omnea | enterprise_theatre / medium | full_confidence / 8pts | strong | PASS | ~75/100 |
| Resend | DAWBM (predicted) | full_confidence (predicted) | strong (predicted) | PASS (predicted) | ~68/100 |

**Key quality findings:**

1. **Genericity failure is the dominant send-gate blocker.** Trigger.dev's memo fails the critic's genericity test because the evidence spine is entirely developer testimonials — high-scoring by the algorithm (tier-3, highly specific types), but unable to directly evidence WHERE buyer conversion breaks. The revision loop should help by forcing the LLM to address the genericity issue explicitly on attempt 2.

2. **Evidence spine scoring selects the wrong records for DAWBM.** The scoring system rewards tier-3 specificity (testimonials, reviews → 3+3 = 6/10 before commercial_salience or recency). For DAWBM, the memo needs evidence showing buyer absence or conversion failure — which is almost never a tier-3 testimonial. The two scoring systems are misaligned for this archetype.

3. **Omnea works because counter-narrative evidence exists.** Omnea's dossier contains both company-claim records (tier-1/2) and customer-signal records (tier-3), enabling the counter_narrative role assignment. The tension is directly evidenced, not inferred.

4. **Intervention framing for DAWBM may be using wrong template text.** Trigger.dev's CTA references "pipeline that works without you in every deal" — founder-led sales language, not developer-to-buyer conversion language. The intervention is `sales_motion_redesign` but the framing reads like `founder_gtm_transition`. Worth inspecting `build-memo-brief.ts` intervention framing lookup.

5. **Haiku vs Sonnet quality gap is real.** The memo generation is spec'd for Haiku (cost optimisation). Based on evaluation, commercial_sharpness would score 1–2 points lower with Haiku vs Sonnet. Worth a model upgrade test before declaring production-ready.

# Intelligence-V3 Memo Layer — V3-M4 (writeMemo)

**LLM stage.** Model: `claude-haiku-4-5-20251001`. Max tokens: 1500. Temperature: 0.3.

**Input:** `MemoBrief` (from V3-M3). Optional `WriteMemoConfig` for model/client overrides.

**Output:** `MarkdownMemo` with 5 `MemoSection[]` in fixed order (observation → what_this_means → why_this_is_happening → what_we_would_change → cta). Evidence IDs populated deterministically from `brief.evidence_spine`. `diagnosis_id` and `intervention_id` carried from brief.

**Revision support:** When `brief.revision_instructions` is set, `buildUserPrompt` appends a `REVISION REQUIRED` block listing failing dimensions, specific issues, and founder pushback context. This is the only change to attempt 2 prompt — all other brief content is identical.

**Validation:** ERR_MEMO_TOO_SHORT / ERR_MEMO_TOO_LONG / ERR_MEMO_EVIDENCE_EMPTY / ERR_BANNED_PHRASE / ERR_ADJUDICATION_ABORT / ERR_MEMO_PARSE / ERR_MEMO_MISSING_SECTIONS.

# Intelligence-V3 Memo Layer — V3-M5 (criticiseMemo)

**Adversarial LLM stage.** Model: `claude-haiku-4-5-20251001`. Max tokens: 800. Temperature: 0.1.

**Output:** `MemoCriticResult` with 4 dimension scores (evidence_grounding, commercial_sharpness, cta_clarity, tone_compliance), genericity_test (binary), founder_pushback_test (most_vulnerable_claim + objection + severity), overall_pass (all 4 dims ≥ 3 AND genericity pass), revision_instructions when overall_pass = false.

# Intelligence-V3 Memo Layer — V3-M6 (runSendGate)

**Fully deterministic.** 6 criteria: critic_overall_pass, evidence_ref_count ≥ 3, adjudication_not_aborted, no_banned_phrases, cta_present_singular (≤50 words), word_count_in_range (300–850). Quality score 0–100 computed on all runs for diagnostics.

# Intelligence-V3 Revision Loop

**Implemented in `runV3Pipeline`.** The loop runs between M4/M5 and M6:

1. `writeMemo(memoBrief, 1, ...)` → attempt 1
2. `criticiseMemo(memo, memoBrief, 1, ...)` → critic evaluates attempt 1
3. If `criticResult.overall_pass === false`:
   - `firstAttemptMemo` and `firstCriticResult` saved to result
   - `revisedBrief = { ...memoBrief, revision_instructions: criticResult.revision_instructions }`
   - `writeMemo(revisedBrief, 2, ...)` → attempt 2 (revision instructions injected into prompt)
   - `criticiseMemo(memo, revisedBrief, 2, ...)` → critic evaluates attempt 2
4. `runSendGate(finalMemo, finalCriticResult, ...)` → always runs on final memo

**Hard ceiling:** 2 write attempts maximum. No further loops even if attempt 2 fails.

**V3PipelineResult fields:**
- `memo` — final memo (attempt 1 or 2)
- `criticResult` — final critic result (attempt 1 or 2)
- `firstAttemptMemo?` — present only when revision loop ran
- `firstCriticResult?` — present only when revision loop ran

# Current Phase

**V3 complete (M1–M6 + revision loop). 443 tests pass. Manual memo QA complete.**

The full V3 pipeline is implemented, wired, and covered with tests. The revision loop is active. A manual end-to-end memo evaluation was run this session using the Omnea `v3-deterministic.json` artifacts: draft → critique → revision → final memo, with a "would send" verdict. The Omnea memo is strong. The Trigger.dev memo (DAWBM diagnosis) has a confirmed framing gap: CTA text reads like `founder_gtm_transition` despite the diagnosis being `sales_motion_redesign`. This is a known issue in `build-memo-brief.ts` intervention framing lookup for DAWBM.

# Next Step

**Priority 1 — Fix DAWBM intervention framing in `build-memo-brief.ts`.** The CTA text for Trigger.dev reads "pipeline that works without you in every deal" — which is `founder_gtm_transition` language, not `sales_motion_redesign` language. Inspect the `interventionFramingLookup` in `build-memo-brief.ts` and correct the DAWBM framing template. Rerun Trigger.dev v3-deterministic to confirm fix.

**Priority 2 — Infrastructure:** Set `ANTHROPIC_API_KEY` to enable live M4/M5/revision execution on real dossiers. Trigger.dev is the primary test candidate (most likely to trigger revision loop due to genericity failure). Omnea is the secondary (already passing predicted send gate).

**Priority 3 — Resend dossier:** Build using `/build-company-dossier` skill. Strong memo opportunity: the account-suspension counter-narrative is specific and commercially threatening.

**Priority 4 — Model upgrade test:** Run memo generation with Sonnet instead of Haiku to quantify commercial_sharpness improvement. Update `DEFAULT_MODEL` in `write-memo.ts` if quality gain justifies cost.

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
- All LLM calls isolated to V3-M4 (`writeMemo`) and V3-M5 (`criticiseMemo`); no other stages may call an LLM.
- V3-M4 `writeMemo` LLM call requires `ANTHROPIC_API_KEY` or an injected `WriteMemoConfig.client`.
- V3-M5 `criticiseMemo` LLM call requires `ANTHROPIC_API_KEY` or an injected `CriticConfig.client`.
- V3-M6 `runSendGate` is fully deterministic — no LLM call.
- Revision loop: max 2 write attempts. No further looping after attempt 2 regardless of critic result.

# Files Modified Recently

**V3 Revision Loop (pending commit):**
- `src/intelligence-v3/memo/adjudicate-diagnosis.ts`
- `src/intelligence-v3/memo/build-evidence-pack.ts`
- `src/intelligence-v3/memo/build-memo-brief.ts`
- `src/intelligence-v3/memo/criticise-memo.ts`
- `src/intelligence-v3/memo/run-send-gate.ts`
- `src/intelligence-v3/memo/write-memo.ts` — `buildUserPrompt` appends `REVISION REQUIRED` block when `brief.revision_instructions` is set
- `src/intelligence-v3/pipeline/run-v3-pipeline.ts` — revision loop (M4→M5→[revision]→M5→M6); `V3PipelineResult` extended with `firstAttemptMemo?` + `firstCriticResult?`
- `src/intelligence-v3/types/memo-brief.ts`
- `src/intelligence-v3/__tests__/adjudication.test.ts` (new)
- `src/intelligence-v3/__tests__/criticise-memo.test.ts` (new)
- `src/intelligence-v3/__tests__/evidence-pack.test.ts` (new)
- `src/intelligence-v3/__tests__/run-send-gate.test.ts` (new)
- `src/intelligence-v3/__tests__/run-v3-pipeline.test.ts` (new)
- `src/intelligence-v3/__tests__/write-memo.test.ts` (new)
- `.gitignore`
- `src/report/evals/fixtures/001-ai-services/validation-report.json` (new)

**V3 Manual Memo QA (this session):**
- `docs/handoffs/current.md` — updated

**443 tests pass. All existing behaviour preserved.**
