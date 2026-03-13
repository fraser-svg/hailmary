# Company Intelligence Engine -- Current Handover

# Project Goal

A system that accepts a company name and domain, conducts structured public research, and produces a machine-readable JSON dossier for downstream AI consumption. The dossier surfaces the gap between company messaging and customer-perceived value.

# Current Architecture

```
Company name + domain
  -> Claude research skill (/build-company-dossier)
  -> WebSearch + WebFetch (no external APIs)
  -> Evidence extraction with source tier tagging
  -> runs/<slug>/dossier.json (16 required top-level fields, evidence inline)
  -> TypeScript validator (schema + evidence-link checking)
  -> Report Engine pipeline (8 stages: 7 deterministic + 1 hybrid writer)
  -> Batch analysis runner (orchestrates pipeline across ICP companies)
```

Report Engine pipeline (complete):
```
extract-signals -> detect-tensions -> detect-patterns -> generate-hypotheses
  -> stress-test-hypotheses -> generate-implications -> plan-report -> write-report
```

Writer modes: `template` (deterministic, default) | `skill` (Claude Code prose) | `llm` (runtime API, placeholder)

Errors = structural integrity (fail validation). Warnings = trust/quality (never fail).

# Development Stage

**MK1 (complete):** Full vertical slice. Company input to validated dossier.

**MK2 Core (complete, Phases 1-4):** Better judgment quality, not more fields. Validator enhancement, source tiers, skill workflow, narrative gap traceability.

**MK2B (complete, Phases 5-6):** Schema expansion for narrative intelligence (`negative_signals`, `value_alignment_summary`) and research depth metadata (`evidence_summary`).

**MK3 (complete, Phase 7 + 7b):** Strategic hypotheses in dossier schema. SKILL.md refined for hypothesis quality (specificity, falsifiability, counter-signals).

**Report Engine (complete, Phases 5-19):** Eval harness + 8 pipeline stages + writer layer with 3 modes + skill prompt system + batch analysis runner.

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
| 14 (RE) | plan-report | Deterministic report planning: thesis, findings, section structure |
| 15 (RE) | write-report | Hybrid deterministic + writer adapter: template + LLM modes |
| 16 (RE) | Writer layer refactor | Extracted writer into `src/report/writer/` (types, template, LLM, prompt-builder, adapter) |
| 17 (RE) | Skill writer mode | `skill` mode: bundle export, response import, validation, assembly |
| 18 (RE) | Skill prompt system | Master prompt module with 5-layer architecture for report prose |
| 19 (RE) | Batch analysis runner | ICP company orchestration, per-company output, insight summaries |

106 tests across 4 test files via vitest. 0 regressions.

# Validator Architecture

**validate-core.ts** (~430 lines): Pure validation logic. 21 numbered checks. Importable, no CLI dependencies.
Exports: `validate()`, `collectValues()`, `isSectionPopulated()`, `ValidationReport`, `CONTENT_SECTIONS`.

**validate.ts** (~60 lines): Thin CLI wrapper. Handles argv, file I/O, console output, exit codes. Writes `validation-report.json` alongside dossier.

**Tests:** 4 files under `src/__tests__/` and `src/utils/__tests__/`. Fixtures are programmatic via `createEmptyDossier()`.

# Source Tier System

| Tier | Category | Use |
|------|----------|-----|
| 1 | Company-controlled (website, docs, blog) | Strongest for company claims |
| 2 | Authoritative external (investors, media, regulatory) | Strong for external facts |
| 3 | Customer/market (reviews, testimonials, case studies) | Strongest for customer truth |
| 4 | Secondary synthesis (directories, analyst blogs) | Discovery only |
| 5 | Noisy (scraped fragments, unattributed) | Hypothesis generation only |

Tier-aware validator warnings: tier-ceiling, customer-truth tier, source-quality consistency.

# Repository Structure

```
schemas/company-dossier.schema.json     # JSON Schema (draft-07), 16 required fields
src/types/                              # SourceRecord, EvidenceRecord, Dossier types
src/utils/                              # ID generators, empty dossier, enums
src/validate-core.ts                    # 21-check validation logic
src/validate.ts                         # CLI wrapper
src/__tests__/                          # 86 validator tests
src/utils/__tests__/                    # 20 utility tests
src/report/pipeline/                    # Stage implementations (8 stages)
  extract-signals.ts                    # Stage 1: dossier -> Signal[]
  detect-tensions.ts                    # Stage 2: Signal[] -> Tension[]
  detect-patterns.ts                    # Stage 3: Tension[] + Signal[] -> Pattern[]
  generate-hypotheses.ts                # Stage 4: Pattern[] + Tension[] + Signal[] -> Hypothesis[]
  stress-test-hypotheses.ts             # Stage 5: Hypothesis[] + upstream -> Hypothesis[] (tested)
  generate-implications.ts              # Stage 6: Hypothesis[] (survives) -> Implication[]
  plan-report.ts                        # Stage 7: upstream objects -> ReportPlan
  write-report.ts                       # Stage 8: ReportPlan + upstream -> Report + markdown
src/report/writer/                      # Writer layer (3 modes)
  types.ts                              # WriterMode, SectionWriter, Skill* contracts
  template-writer.ts                    # Deterministic template prose
  llm-writer.ts                         # LLM-backed prose (placeholder)
  skill-writer.ts                       # Skill bundle builder, response assembler
  skill-prompts.ts                      # Master prompt system (5-layer architecture)
  prompt-builder.ts                     # LLM prompt builder
  writer-adapter.ts                     # Factory + sanitisation wrapper
src/report/runner/                      # Batch analysis runner
  batch-analyse.ts                      # CLI entry: orchestrates full pipeline per company
  company-list.ts                       # 8 ICP companies (UK B2B SaaS, messy growth stage)
  output-manager.ts                     # Slugify, directory creation, JSON/markdown writers
src/report/evals/                       # Evaluation harness
  fixtures/001-ai-services/             # Fixture 1: AI narrative masks service delivery
  fixtures/002-enterprise-proof-gap/    # Fixture 2: enterprise positioning vs SMB reality
  fixtures/003-founder-credibility-gap/ # Fixture 3: founder-anchored credibility vs institutional depth
  runner/run-fixture.ts                 # CLI runner: loads fixture, runs pipeline, scores
  runner/run-skill-mode.ts              # Skill mode verification: bundle, mock, assemble
  scoring/                              # Per-stage scorers + keyword-overlap matcher
  stubs/stages.ts                       # Adapter: 8 real impls + skill bundle export
  types/                                # Fixture and eval result types
docs/specs/Intelligence-engine-specs/   # 8 upstream specs (001-008)
docs/specs/report-specs/                # 9 report engine specs (001-009)
docs/handoffs/current.md               # This file
.claude/skills/build-company-dossier/   # SKILL.md + 7 reference docs
runs/                                   # Per-company dossier output (gitignored)
reports/                                # Per-company analysis output (gitignored)
```

# Current Phase

Report Engine Phase 19 complete. Batch analysis runner operational.

**Phase 19 (batch analysis runner):**
- `company-list.ts`: 8 ICP companies matching target profile (UK B2B SaaS, seed-to-Series B, messy growth stage)
- `output-manager.ts`: slugify, directory creation, JSON and markdown file writers
- `batch-analyse.ts`: CLI orchestrator that runs the full deterministic pipeline per company
- Per-company output: dossier, signals, tensions, patterns, hypotheses, implications, report plan, template report, skill bundle, insight summary
- Insight summary: 4-line quick-scan (core tension, dominant pattern, most plausible hypothesis, highest-impact implication)
- Error isolation: one company failure does not stop the batch
- Accepts arbitrary slugs for dossiers outside the ICP list
- `npm run analyse-batch` script added
- Verified against Stripe and Notion dossiers, all 106 tests pass

# Next Step

Possible next directions:
- Build dossiers for ICP companies (run /build-company-dossier for each)
- End-to-end skill workflow integration (Claude Code writes sections from bundle)
- Report quality scoring in eval harness
- Report export formats (PDF, HTML)
- Cross-company comparison / portfolio analysis

# Known Constraints

- MK2 Core must NOT add new dossier fields. Schema expansion is MK2B/MK3 only.
- `additionalProperties: false` on section objects -- new fields require schema update first.
- `$defs` (source_record, evidence_record) do NOT have `additionalProperties: false`.
- Report engine must not perform fresh research -- operates only on dossier-derived data.
- Pipeline stages downstream of extract-signals must not inspect dossier directly (signals-only).
- Stress-test survival: high-importance pattern + medium+ confidence + 3+ tensions + 2+ signal kind diversity + 0 counter-signals.
- Hypotheses need sufficient unique tension IDs to avoid >70% overlap deduplication.
- SKILL.md must stay under ~400 lines. Reference docs handle depth.
- All 16 dossier sections must exist even when empty.
- Errors = structural failures (block validation). Warnings = quality concerns (never block).
- Single skill architecture. No multi-agent refactor.
- WebSearch + WebFetch only. No external tools (Exa, Firecrawl, Puppeteer).
- Skill mode: TypeScript controls section assembly, lineage, validation. Claude controls prose only.
- Batch runner only orchestrates existing pipeline. No new LLM calls, no reasoning modifications.

# Files Modified Recently

**Report Engine Phase 19 (this session):**
- `src/report/runner/batch-analyse.ts` -- new: CLI batch orchestrator for ICP company analysis
- `src/report/runner/company-list.ts` -- new: 8 ICP companies with name + domain
- `src/report/runner/output-manager.ts` -- new: slugify, ensureDir, writeJson, writeMarkdown
- `package.json` -- added `analyse-batch` script
- `.gitignore` -- added `reports/` directory
- `docs/handoffs/current.md` -- updated with Phase 19
