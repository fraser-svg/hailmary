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
```

Report Engine pipeline (complete):
```
extract-signals -> detect-tensions -> detect-patterns -> generate-hypotheses
  -> stress-test-hypotheses -> generate-implications -> plan-report -> write-report
```

Errors = structural integrity (fail validation). Warnings = trust/quality (never fail).

# Development Stage

**MK1 (complete):** Full vertical slice. Company input to validated dossier.

**MK2 Core (complete, Phases 1-4):** Better judgment quality, not more fields. Validator enhancement, source tiers, skill workflow, narrative gap traceability.

**MK2B (complete, Phases 5-6):** Schema expansion for narrative intelligence (`negative_signals`, `value_alignment_summary`) and research depth metadata (`evidence_summary`).

**MK3 (complete, Phase 7 + 7b):** Strategic hypotheses in dossier schema. SKILL.md refined for hypothesis quality (specificity, falsifiability, counter-signals).

**Report Engine (complete, Phases 5-15):** Eval harness + 8 pipeline stages implemented. Three eval fixtures passing. Full pipeline operational.

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
| 15 (RE) | write-report | Hybrid deterministic + LLM adapter: report generation with validation |

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
src/report/pipeline/                    # Stage implementations
  extract-signals.ts                    # Stage 1: dossier -> Signal[] (18 passes)
  detect-tensions.ts                    # Stage 2: Signal[] -> Tension[] (13 templates)
  detect-patterns.ts                    # Stage 3: Tension[] + Signal[] -> Pattern[] (10 templates)
  generate-hypotheses.ts                # Stage 4: Pattern[] + Tension[] + Signal[] -> Hypothesis[] (9 templates)
  stress-test-hypotheses.ts             # Stage 5: Hypothesis[] + upstream -> Hypothesis[] (tested)
  generate-implications.ts              # Stage 6: Hypothesis[] (survives) -> Implication[] (17 templates)
  plan-report.ts                        # Stage 7: upstream objects -> ReportPlan (deterministic)
  write-report.ts                       # Stage 8: ReportPlan + upstream -> Report + markdown
src/report/evals/                       # Evaluation harness
  fixtures/001-ai-services/             # Fixture 1: AI narrative masks service delivery
  fixtures/002-enterprise-proof-gap/    # Fixture 2: enterprise positioning vs SMB reality
  fixtures/003-founder-credibility-gap/ # Fixture 3: founder-anchored credibility vs institutional depth
  runner/run-fixture.ts                 # CLI runner: loads fixture, runs pipeline, scores
  scoring/                              # Per-stage scorers + keyword-overlap matcher
  stubs/stages.ts                       # Adapter: 8 real impls wired through full pipeline
  types/                                # Fixture and eval result types
docs/specs/Intelligence-engine-specs/   # 8 upstream specs (001-008)
docs/specs/report-specs/                # 9 report engine specs (001-009)
docs/handoffs/current.md               # This file
.claude/skills/build-company-dossier/   # SKILL.md + 7 reference docs
runs/                                   # Per-company output (gitignored)
```

# Current Phase

Report Engine Phase 15 (write-report) complete. All eight pipeline stages operational. All three eval fixtures pass:

```
Fixture 001-ai-services:       scored stages PASS, write-report generates (6 sections, 15648 chars)
Fixture 002-enterprise-proof:  scored stages PASS, write-report generates (6 sections, 14125 chars)
Fixture 003-founder-credibility: scored stages PASS, write-report generates (6 sections, 20077 chars)
```

Write-report stage architecture:
- **Deterministic layer**: section input assembly, lineage resolution, post-generation validation (7 checks)
- **Writer adapter**: V1 uses template-based prose generation (placeholder for future LLM integration)
- **Validation checks**: required sections, no discarded hypotheses, weak-only-in-uncertainty, no em dashes, no banned phrases, non-empty sections, lineage populated
- **Text sanitisation**: em dashes from upstream objects replaced before validation

Full pipeline is now: extract-signals -> detect-tensions -> detect-patterns -> generate-hypotheses -> stress-test-hypotheses -> generate-implications -> plan-report -> write-report.

# Next Step

The report engine pipeline is complete. Possible next directions:
- LLM adapter integration (replace template prose with Claude-generated sections)
- Report quality scoring in eval harness
- End-to-end CLI command for report generation from dossier
- Report export formats (PDF, HTML)

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
- Eval fixture 001 dossier predates MK2B schema additions (`evidence_summary`, `negative_signals`, `value_alignment_summary`) -- needs backfill to pass schema validation. Eval harness tests pipeline stages independently and is unaffected.

# Files Modified Recently

**Report Engine Phase 15 (this session):**
- `src/report/pipeline/write-report.ts` -- new stage: hybrid report writer (480 lines)
- `src/report/evals/stubs/stages.ts` -- added `writeReport` adapter wiring
- `src/report/evals/runner/run-fixture.ts` -- calls write-report after plan-report, prints section summary
- `docs/handoffs/current.md` -- updated with Phase 15 completion
