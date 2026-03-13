# Company Intelligence Engine -- Current Handover

# Project Goal

A system that accepts a company name and domain, conducts structured public research, and produces a machine-readable JSON dossier for downstream AI consumption. The dossier is the product artifact -- optimized for machine parsing, not human polish.

# Current Architecture

```
Company name + domain
  -> Claude research skill (/build-company-dossier)
  -> WebSearch + WebFetch (no external APIs)
  -> Evidence extraction with source tier tagging
  -> runs/<slug>/dossier.json (16 required top-level fields, evidence inline)
  -> TypeScript validator (schema + evidence-link checking)
  -> Report Engine pipeline (8-stage reasoning chain over dossier)
```

Errors = structural integrity (fail validation). Warnings = trust/quality (never fail).

Report Engine pipeline:
```
extract-signals -> detect-tensions -> detect-patterns -> generate-hypotheses
  -> stress-test-hypotheses -> generate-implications -> plan-report -> write-report
```

# Development Stage

**MK1 (complete):** Full vertical slice. Company input to validated dossier. One production run (Vercel).

**MK2 Core (complete, Phases 1-4):** Better judgment quality, not more fields. No new dossier fields. No schema expansion. Sharper intelligence from existing structure.

**Report Engine (Phases 5-8 complete, Phase 9+ pending):** Eval harness built and operational. First 5 pipeline stages implemented and passing fixture 001-ai-services.

# Phase Status

**Phase 1 -- Validator Enhancement + Test Foundation (complete)**
- Extracted `validate-core.ts` from `validate.ts` for testability
- CLI wrapper in `validate.ts` handling argv/file I/O/exit codes
- 66 tests across 4 test files via vitest
- Added orphan evidence, unused sources, single-source confidence warnings

**Phase 2 -- Source Tier Operationalization (complete)**
- `source_tier` (integer 1-5) added to SourceRecord type and JSON Schema
- 3 tier-aware validator warnings: tier-ceiling, customer-truth tier, source-quality consistency
- `source-tier-assignment.md` reference created

**Phase 3 -- Skill Workflow Enhancement (complete, validated)**
- Created 3 reference docs: `negative-signal-research.md`, `customer-voice-segmentation.md`, `competitor-depth.md`
- Added Step 4b (Negative Signal Research) and Critical Rule 8 (WebFetch fallback) to SKILL.md
- Enhanced Steps 4 and 5 with segmentation and competitor depth references
- Validated across 3 companies: Stripe (52ev), Notion (55ev), HubSpot (54ev) -- all 0 errors 0 warnings

**Phase 4 -- Narrative Gap Traceability (complete, validated)**
- 4 new validator warnings (checks 18-21) in `validate-core.ts`
- 5 new tests added (75 total across 4 test files)
- All warnings only -- never fail validation

**Phase 5 -- Report Engine: extract-signals + detect-tensions + eval harness (complete)**
- Built eval harness: fixture loader, markdown expectation parser, keyword-overlap scorer (60% threshold)
- Implemented `extract-signals`: 8 deterministic extraction passes over dossier sections
- Implemented `detect-tensions`: 5 template-based tension detectors over Signal[]
- Fixture 001-ai-services: signals 5/5 must-detect, 3/3 nice; tensions 3/3 must-detect, 2/2 nice; 0 violations

**Phase 6 -- Report Engine: detect-patterns (complete)**
- Implemented `detect-patterns`: 4 template-based pattern detectors over Tension[] + Signal[]
- Pattern types used: dependency, misalignment, consistency, concentration
- Fixture 001-ai-services: patterns 2/2 must-detect, 2/2 nice-to-detect, 0 violations

**Phase 7 -- Report Engine: generate-hypotheses (complete)**
- Implemented `generate-hypotheses`: 5 template-based hypothesis generators over Pattern[] + Tension[] + Signal[]
- Hypothesis types: product, operational, gtm, strategic, narrative
- All hypotheses start as `candidate` with assumptions, alternatives, and missing evidence
- Deduplication at >70% pattern+tension ID overlap
- Fixture 001-ai-services: hypotheses 2/2 must-detect, 1/3 acceptable alternatives, 0 violations

**Phase 8 -- Report Engine: stress-test-hypotheses (complete)**
- Implemented `stress-test-hypotheses`: 5 deterministic checks over Hypothesis[] + upstream objects
- Checks: support strength, alternative explanation pressure, assumption fragility, structural coverage, counter-signal detection
- Status assignment: survives (high-importance pattern + medium+ confidence + 3+ tensions + 2+ signal kinds), weak (limited support or low confidence), discarded (zero support)
- Post-stress-test deduplication retains stronger hypotheses when >70% overlap detected
- Hypothesis interface extended with: `strongest_support`, `strongest_objections`, `residual_uncertainty`, `initial_confidence`
- Fixture 001-ai-services results:
  - Automation compensation hypothesis: **survives** (medium confidence, 3 tensions, 6 signal kinds)
  - Structural onboarding hypothesis: **survives** (medium confidence, 3 tensions, 3 signal kinds)
  - Services-led GTM hypothesis: **weak** (low confidence -- started low, medium-importance pattern)
  - Hiring reveals strategy: **weak** (medium -> low confidence, 2/3 assumptions ungrounded)
  - Widening gap hypothesis: **weak** (low confidence -- speculative despite broad coverage)

# Validator Architecture

**validate-core.ts** (~430 lines): Pure validation logic. 21 numbered checks. Importable, no CLI dependencies.
Exports: `validate()`, `collectValues()`, `isSectionPopulated()`, `ValidationReport`, `CONTENT_SECTIONS`

**validate.ts** (~60 lines): Thin CLI wrapper. Handles argv, file I/O, console output, exit codes. Writes `validation-report.json` alongside dossier.

**Test setup:** 4 test files under `src/__tests__/` and `src/utils/__tests__/`. 75 tests via vitest. Fixtures are programmatic via `createEmptyDossier()`.

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
src/__tests__/                          # 55 validator tests
src/utils/__tests__/                    # 20 utility tests
src/report/pipeline/                    # Stage implementations
  extract-signals.ts                    # Stage 1: dossier -> Signal[]
  detect-tensions.ts                    # Stage 2: Signal[] -> Tension[]
  detect-patterns.ts                    # Stage 3: Tension[] + Signal[] -> Pattern[]
  generate-hypotheses.ts                # Stage 4: Pattern[] + Tension[] + Signal[] -> Hypothesis[]
  stress-test-hypotheses.ts             # Stage 5: Hypothesis[] + upstream -> Hypothesis[] (tested)
src/report/evals/                       # Evaluation harness
  fixtures/001-ai-services/             # First eval fixture (dossier + expected-*.md)
  runner/run-fixture.ts                 # CLI runner: loads fixture, runs pipeline, scores
  scoring/                              # Per-stage scorers + common keyword-overlap matcher
  stubs/stages.ts                       # Adapter layer: 5 real impls + downstream stubs
  types/                                # Fixture and eval result types
  results/                              # Eval run outputs (gitignored recommended)
docs/specs/Intelligence-engine-specs/   # 8 upstream specs (001-008)
docs/specs/report-specs/                # 9 report engine specs (001-009)
docs/handoffs/current.md               # This file
.claude/skills/build-company-dossier/   # SKILL.md + 6 reference docs
runs/                                   # Per-company output (gitignored)
```

# Current Phase

Phase 8 complete. First 5 report engine pipeline stages implemented and passing all eval checks.

Current eval results for fixture 001-ai-services:
```
Signals:      5/5 must-detect, 3/3 nice, 0 violations  PASS
Tensions:     3/3 must-detect, 2/2 nice, 0 violations  PASS
Patterns:     2/2 must-detect, 2/2 nice, 0 violations  PASS
Hypotheses:   2/2 must-detect, 1/3 acceptable, 0 violations  PASS
Implications: 0/4 must-detect (stub)
```

# Next Step

**Phase 9 -- Report Engine: generate-implications**

Implement the implications generation stage. Takes stress-tested hypotheses (status: survives only) and produces strategic implications for the report.

Key constraints from spec (docs/specs/report-specs/007-generate-implications.md):
- Only surviving hypotheses feed implications
- Implications must be actionable and evidence-grounded
- Must not introduce new hypotheses or revisit discarded ones

Expected fixture targets: 4 must-detect implications, 2 nice-to-detect.

# Known Constraints

- MK2 Core must NOT add new dossier fields. Schema expansion is MK2B/MK3.
- `additionalProperties: false` on section objects -- new fields require schema update first
- `$defs` (source_record, evidence_record) do NOT have `additionalProperties: false` -- optional fields are backward-compatible
- Report engine must not perform fresh research -- operates only on dossier-derived data
- Report engine pipeline stages must not inspect dossier directly (signals-only downstream of extract-signals)
- SKILL.md must stay under ~400 lines. Reference docs handle depth.
- All 16 dossier sections must exist even when empty (downstream AI needs consistent shape)
- Errors = structural failures (block validation). Warnings = quality concerns (never block).
- Do not refactor into multi-agent architecture. Single skill works.
- WebSearch + WebFetch only. No external tools (Exa, Firecrawl, Puppeteer).
- Do not build fixture 002 until harness is fully working against fixture 001.
- Eval results directory should be gitignored (transient outputs).

# Files Modified Recently

**Phase 7+8 -- generate-hypotheses + stress-test-hypotheses (this session):**
- `src/report/pipeline/generate-hypotheses.ts` -- new: 5 hypothesis templates, Hypothesis type with stress-test fields
- `src/report/pipeline/stress-test-hypotheses.ts` -- new: 5 deterministic checks, status assignment, dedup
- `src/report/evals/stubs/stages.ts` -- updated: wired generate-hypotheses + stress-test-hypotheses
- `docs/handoffs/current.md` -- updated with Phase 7+8 completion
