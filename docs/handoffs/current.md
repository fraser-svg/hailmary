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

Phase 8 changed the reasoning pipeline from a filtering pipeline to a scoring pipeline:
```
BEFORE: signals -> tensions -> patterns (gate) -> hypotheses -> stress-test (binary) -> implications
AFTER:  signals -> tensions -> hypotheses (from tensions directly) -> scoring + ranking -> implications
```

Phase 9B made all hypothesis/implication text company-specific via structured context interpolation.

Patterns are now confidence multipliers, not gates. Hypotheses are ranked by score; top 3 survive.

Writer modes: `template` (deterministic, default) | `skill` (Claude Code prose) | `llm` (runtime API, placeholder)

Errors = structural integrity (fail validation). Warnings = trust/quality (never fail).

# Development Stage

**MK1 (complete):** Full vertical slice. Company input to validated dossier.

**MK2 Core (complete, Phases 1-4):** Better judgment quality, not more fields. Validator enhancement, source tiers, skill workflow, narrative gap traceability.

**MK2B (complete, Phases 5-6):** Schema expansion for narrative intelligence (`negative_signals`, `value_alignment_summary`) and research depth metadata (`evidence_summary`).

**MK3 (complete, Phase 7 + 7b):** Strategic hypotheses in dossier schema. SKILL.md refined for hypothesis quality (specificity, falsifiability, counter-signals).

**Report Engine (complete, Phases 5-19 + Phase 8 Reasoning + Phase 9B Specificity):** Eval harness + 8 pipeline stages + writer layer with 3 modes + skill prompt system + batch analysis runner + reasoning engine improvement + template inflation fix.

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
| 16 (RE) | Writer layer refactor | Extracted writer into `src/report/writer/` |
| 17 (RE) | Skill writer mode | Skill bundle export, response import, validation, assembly |
| 18 (RE) | Skill prompt system | Master prompt module with 5-layer architecture |
| 19 (RE) | Batch analysis runner | ICP company orchestration, per-company output |
| 8 (Reasoning) | Reasoning Engine Improvement | Scoring pipeline, tension-driven hypotheses, 10/10 report completion |
| **9B (Reasoning)** | **Template Inflation Fix** | **Company-specific hypothesis/implication text via CompanyContext interpolation** |

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
  generate-hypotheses.ts                # Stage 4: Tension[] + Pattern[] + Signal[] -> Hypothesis[]
  stress-test-hypotheses.ts             # Stage 5: Hypothesis[] + upstream -> Hypothesis[] (scored + ranked)
  generate-implications.ts              # Stage 6: Hypothesis[] (top-ranked) -> Implication[]
  plan-report.ts                        # Stage 7: upstream objects -> ReportPlan
  write-report.ts                       # Stage 8: ReportPlan + upstream -> Report + markdown
  company-context.ts                    # Helper: extracts CompanyContext from upstream pipeline objects
src/report/writer/                      # Writer layer (3 modes)
src/report/runner/                      # Batch analysis runner
  batch-analyse.ts                      # CLI entry: orchestrates full pipeline per company
  company-list.ts                       # 8 ICP companies (UK B2B SaaS, messy growth stage)
  output-manager.ts                     # Slugify, directory creation, JSON/markdown writers
src/report/evals/                       # Evaluation harness
docs/specs/Intelligence-engine-specs/   # 8 upstream specs (001-008)
docs/specs/report-specs/                # 9 report engine specs (001-009)
docs/handoffs/current.md               # This file
.claude/skills/build-company-dossier/   # SKILL.md + 7 reference docs
runs/                                   # Per-company dossier output (gitignored)
reports/                                # Per-company analysis output (gitignored)
```

# Current Phase

Phase 9B (Template Inflation Fix) complete.

**Problem:** Quality audit found 7/10 companies sharing nearly identical hypothesis titles and 8-9/10 sharing identical implication titles. Templates used hardcoded generic prose with no company-specific context.

**Solution:** Company-specific text interpolation via structured context extraction:

1. **CompanyContext helper** (`company-context.ts`): Deterministic extraction of company name, product domain, narrative claim, customer reality, customer segment, positioned capability, buyer scrutiny area, and growth constraint from upstream Signal/Tension/Pattern objects. No LLM calls.

2. **Hypothesis templates updated** (`generate-hypotheses.ts`): All 17 templates now accept `CompanyContext` and interpolate company name + domain-specific nouns into titles/statements/assumptions.

3. **Implication templates updated** (`generate-implications.ts`): All 23 templates now accept `CompanyContext`. Template dispatch uses closures to pass context.

4. **Deduplication improved:** Both stages now include normalised title word overlap check at 0.65 threshold (stop-word removal, lowercase, sorted word comparison).

**Results:**

| Metric | Phase 8 | Phase 9B |
|--------|---------|----------|
| Companies with implications | 10/10 | 10/10 |
| Total surviving hypotheses | 28 | 28 |
| Total implications | 71 | 69 |
| Identical titles across companies | 7/10 shared | 0/10 shared |
| Company-specific nouns in titles | 0% | 100% |

Every hypothesis/implication title now contains the company name and domain-specific terms (e.g., "Trigger.dev's ai agent platform credibility" vs "Form3's architecture claims credibility").

# Next Step

Possible next directions:
- **Stress-test recalibration:** Survival rate is ~93% (28/30). Consider raising MIN_SURVIVE_SCORE from 2.0 to 2.5, or adding a novelty penalty for hypotheses sharing >60% normalised words
- Signal extraction expansion (more extraction passes for broader tension variety)
- Report quality scoring in eval harness
- Cross-company comparison / portfolio analysis
- Report export formats (PDF, HTML)

# Known Constraints

- MK2 Core must NOT add new dossier fields. Schema expansion is MK2B/MK3 only.
- `additionalProperties: false` on section objects -- new fields require schema update first.
- `$defs` (source_record, evidence_record) do NOT have `additionalProperties: false`.
- Report engine must not perform fresh research -- operates only on dossier-derived data.
- Pipeline stages downstream of extract-signals must not inspect dossier directly (signals-only).
- Stress-test scoring: top 3 by score survive (MIN_SURVIVE_SCORE = 2.0, DISCARD_SCORE = 1.0).
- Hypotheses need sufficient unique tension IDs to avoid >70% overlap deduplication.
- Deduplication also checks normalised title word overlap at 0.65 threshold.
- SKILL.md must stay under ~400 lines. Reference docs handle depth.
- All 16 dossier sections must exist even when empty.
- Errors = structural failures (block validation). Warnings = quality concerns (never block).
- Single skill architecture. No multi-agent refactor.
- WebSearch + WebFetch only. No external tools (Exa, Firecrawl, Puppeteer).
- Skill mode: TypeScript controls section assembly, lineage, validation. Claude controls prose only.
- Batch runner only orchestrates existing pipeline. No new LLM calls, no reasoning modifications.

# Files Modified Recently

**Phase 9B Template Inflation Fix (this session):**
- `src/report/pipeline/company-context.ts` -- NEW: CompanyContext interface + extraction from upstream pipeline objects + normalise() for dedup
- `src/report/pipeline/generate-hypotheses.ts` -- all 17 templates accept CompanyContext, interpolate company-specific text, enhanced dedup with 0.65 normalised overlap
- `src/report/pipeline/generate-implications.ts` -- all 23 templates accept CompanyContext, closure-based dispatch, enhanced dedup with 0.65 normalised overlap
- `docs/handoffs/current.md` -- updated with Phase 9B
