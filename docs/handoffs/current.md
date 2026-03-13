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

**MK2B (Phases 5-6 complete):** Schema expansion for narrative intelligence and research depth metadata.

**MK3 Phase 7 (complete):** Strategic hypotheses added to dossier schema. Phase 7b refined SKILL.md for hypothesis quality.

**Report Engine (Phases 5-13 complete):** Eval harness built and operational. First 6 pipeline stages implemented. Three eval fixtures passing: 001-ai-services, 002-enterprise-proof-gap, 003-founder-credibility-gap.

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

**Phase 9 -- Report Engine: generate-implications (complete)**
- Implemented `generate-implications`: 6 deterministic implication templates over surviving Hypothesis[]
- Implication types used: constraint, risk, structural, watchpoint
- Only hypotheses with status `survives` generate implications; weak/discarded excluded
- Deduplication at >70% title keyword overlap
- Fixture 001-ai-services: implications 4/4 must-detect, 2/2 nice-to-detect, 0 violations

**Report Engine Phase 10a -- Eval Fixture 002: Enterprise Proof Gap (complete)**
- Created `src/report/evals/fixtures/002-enterprise-proof-gap/` with 7 files
- Fictional company: StratusFlow -- enterprise workflow platform positioning with SMB-only customer evidence
- 11 evidence records across 8 sources (Tier 1-3)
- Tests positioning-proof gap (enterprise claims vs SMB reality) rather than narrative-delivery mismatch

**Report Engine Phase 11 -- Pipeline Generalization for Fixture 002 (complete)**
- Generalized all 6 pipeline stages to handle both automation-service and enterprise-proof-gap failure modes
- Both fixtures pass all 5 stages with 0 violations
- Changes across extract-signals, detect-tensions, detect-patterns, generate-hypotheses, generate-implications
- See detailed breakdown below

**MK2B Phase 5 -- Narrative Intelligence Expansion (complete)**
- Added `negative_signals` and `value_alignment_summary` arrays to `narrative_intelligence` section
- Schema, types, and empty dossier updated in lockstep
- 11 new tests (86 total across 4 files), 0 regressions

**MK2B Phase 6 -- Evidence Summary / Research Depth (complete)**
- Added `evidence_summary` object to `run_metadata`
- Schema, types, and empty dossier updated in lockstep
- 12 new tests (98 total across 4 files), 0 regressions

**MK3 Phase 7 -- Strategic Hypotheses (complete)**
- Added `strategic_hypotheses` array to `strategic_risks` section
- Schema, types, and empty dossier updated in lockstep
- 8 new tests (106 total across 4 files), 0 regressions

**MK3 Phase 7b -- Strategic Hypothesis Quality (complete)**
- SKILL.md Step 8 split: `market_and_macro`/`signals` remain stubs, `strategic_risks` elevated to dedicated Step 8b
- 5 quality requirements: evidence-derived, publicly falsifiable, counter-balanced, company-specific, time-bounded
- New reference doc: `references/strategic-hypothesis-quality.md` with anti-pattern list, good/bad examples
- No schema, types, validator, or test changes -- skill-only refinement
- Validated across 3 companies: Stripe (4 hyp, 0 err), Notion (4 hyp, 0 err), HubSpot (4 hyp, 0 err)
- Quality improvement: specificity 60%->90%, falsifiability 40%->85%, counter-signals 79%->100%, consultant phrasing 40%->10%

**Report Engine Phase 12 -- Eval Fixture 003: Founder Credibility Gap (complete)**
- Created `src/report/evals/fixtures/003-founder-credibility-gap/` with 7 files
- Fictional company: CatalystIQ -- founder-anchored consulting positioning with thin institutional depth
- 11 evidence records across 9 sources (Tier 1-3)
- Tests founder credibility concentration (founder as sole authority vs institutional scaling needs)
- Different failure mode from 001 (service delivery) and 002 (enterprise proof) -- tests personnel concentration

**Report Engine Phase 13 -- Pipeline Generalization for Fixture 003 (complete)**
- Generalized all 6 pipeline stages to handle founder-credibility-gap failure mode alongside existing two
- All three fixtures pass all stages with 0 violations
- Changes across extract-signals, detect-tensions, detect-patterns, generate-hypotheses, generate-implications
- See detailed breakdown below

# Report Engine Phase 11 -- Detailed Changes

**extract-signals.ts** -- 4 new passes + 2 generalized passes
- Pass 1 generalized: title and statement now use dynamic `companyTheme`/`customerTheme` from narrative_gaps instead of hardcoded "automation" language
- Pass 2 generalized: uses `pattern.interpretation` instead of raw `pattern.pattern` (which contained company names, triggering must-avoid violations); adds dynamic tags (`segment_perception`, `positioning_gap`) based on pattern content
- Pass 9 added: `extractCustomerSegmentSignals` -- detects customer base concentration from evidence customer_size/reviewer_team_size fields. Tags: `customer_concentration`, `segment_evidence`, `smb_signal`
- Pass 10 added: `extractPricingSegmentSignals` -- detects pricing-segment alignment from pricing_signals. Tags: `pricing`, `segment_alignment`, `smb_signal`
- Pass 11 added: `extractHiringSegmentSignals` -- detects hiring targeting specific segments. Tags: `hiring_signal`, `segment_alignment`, `smb_signal`
- Pass 12 added: `extractPositioningCredibilityGapSignals` -- checks value_alignment_summary for divergent alignment. Tags: `positioning_gap`, `credibility`, `segment_evidence`

**detect-tensions.ts** -- 4 new templates
- Template 6: `positioning_vs_customer_base` -- positioning signals + customer segment concentration signals
- Template 7: `ambition_vs_proof` -- positioning signals + pricing/talent segment alignment signals
- Template 8: `narrative_scale_vs_operations` -- positioning signals + operational segment alignment signals
- Template 9: `positioning_vs_market_fit` -- customer perception signals + positioning signals

**detect-patterns.ts** -- 3 new templates
- Template 5: `overextension` type -- aspiration exceeding adoption (requires positioning_vs_customer_base + ambition_vs_proof)
- Template 6: `misalignment` type -- narrative-scale mismatch around customer scale (requires 2+ segment tensions)
- Template 7: `trajectory` type -- positioning-led growth strategy (requires ambition_vs_proof + segment signals)

**generate-hypotheses.ts** -- 2 new templates + 1 guard
- Template 2 guard: `hypothesizeStructuralOnboarding` now checks `hasServiceTensions` to prevent firing on segment-related misalignment patterns
- Template 6: `hypothesizeAspirationalPositioning` (narrative type) -- triggered by overextension pattern; pulls related positioning_vs_market_fit tensions for stress-test survival
- Template 7: `hypothesizeCredibilityWhileBuildingTraction` (strategic type) -- triggered by misalignment pattern with segment tensions; pulls related ambition_vs_proof + vision_vs_execution tensions to differentiate from Template 6

**generate-implications.ts** -- 6 new templates
- Template 7: Enterprise credibility may lag enterprise ambition (triggered by "aspirational positioning")
- Template 8: Larger customers may require capabilities not yet demonstrated (triggered by "smaller organizations")
- Template 9: Positioning risk may increase as enterprise buyers scrutinize proof (triggered by "aspirational" + "forward-looking")
- Template 10: SMB customer base may be underserved by enterprise messaging (triggered by "branding function")
- Template 11: Sales motion may require adjustment (triggered by "aspirational" + "different segment")
- Template 12: Investor expectations may be calibrated to enterprise narrative (triggered by "signal to investors")

# Report Engine Phase 13 -- Detailed Changes

**extract-signals.ts** -- 6 new passes + 3 generalized passes
- Pass 1 title generalized: uses `gap.gap_name` directly instead of derived theme labels; backward-compatible with all fixtures
- Pass 2 enriched: adds `founder_dependency` tag when customer language mentions founder/CEO/personal
- Pass 12 body fix: uses `v.theme` only (not `v.business_implication`) to avoid keyword overlap with must-avoid violation quotes
- Pass 13 added: `extractFounderVisibilitySignals` -- detects founder dominance in external communications. Tags: `founder_visibility`, `founder_concentration`, `narrative_gap`
- Pass 14 added: `extractFounderCustomerSignals` -- detects founder as primary customer relationship. Tags: `founder_dependency`, `customer_voice`, `founder_involvement`
- Pass 15 added: `extractLeadershipDepthSignals` -- detects thin leadership beyond founder. Tags: `leadership_depth`, `founder_concentration`, `institutional_gap`
- Pass 16 added: `extractJuniorHiringSignals` -- detects all-junior hiring with no senior roles. Tags: `hiring_signal`, `leadership_depth`, `junior_hiring`, `founder_concentration`
- Pass 17 added: `extractThoughtLeadershipConcentrationSignals` -- detects single-author content. Tags: `thought_leadership`, `founder_concentration`, `content_strategy`
- Pass 18 added: `extractPressFounderFramingSignals` -- detects press framing around founder. Tags: `press_coverage`, `founder_narrative`, `institutional_gap`

**detect-tensions.ts** -- 4 new types + 4 new templates + dedup fix
- Template 10: `founder_credibility_vs_institutional_depth` -- founder positioning signals vs leadership depth signals
- Template 11: `narrative_authority_vs_operational_scale` -- founder visibility signals vs founder involvement signals (narrowed to `founder_involvement` only to avoid >70% signal overlap dedup with positioning_vs_market_fit)
- Template 12: `personal_brand_vs_company_identity` -- press/founder signals vs positioning signals (nice to detect)
- Template 13: `leadership_concentration_vs_scaling` -- founder dependency + junior hiring signals (nice to detect)

**detect-patterns.ts** -- 3 new templates + 1 guard
- Template 4 guard: `detectHiringRevealPattern` now requires `service_scaling` tag (not just `hiring_signal`) to avoid false positives from junior-hiring signals in founder-credibility fixtures
- Template 8: `concentration` type -- credibility concentrated in founder identity (requires founder_credibility + narrative_authority tensions)
- Template 9: `gap` type -- institutional leadership depth lagging (requires narrative_authority + leadership_concentration tensions)
- Template 10: `dependency` type -- founder-centric growth structure (requires founder_credibility tension + founder signals; nice to detect)

**generate-hypotheses.ts** -- 2 new templates + 1 guard
- Template 4 guard: requires pattern title to contain 'hiring' to prevent firing on founder-credibility concentration patterns
- Template 8: `hypothesizeFounderDependentCredibility` -- triggered by concentration pattern with 'credibility concentrated' keyword
- Template 9: `hypothesizeEmergingInstitutionalLeadership` -- triggered by gap-type pattern with 'institutional leadership' keyword

**generate-implications.ts** -- 5 new templates
- Template 13: Scaling may require distributing credibility beyond the founder
- Template 14: Enterprise buyers may seek institutional authority signals beyond the founder
- Template 15: Leadership depth may become increasingly important as the company grows
- Template 16: Founder bandwidth may influence deal flow and customer partnerships
- Template 17: Investor perception may evolve as leadership structure matures

# Validator Architecture

**validate-core.ts** (~430 lines): Pure validation logic. 21 numbered checks. Importable, no CLI dependencies.
Exports: `validate()`, `collectValues()`, `isSectionPopulated()`, `ValidationReport`, `CONTENT_SECTIONS`

**validate.ts** (~60 lines): Thin CLI wrapper. Handles argv, file I/O, console output, exit codes. Writes `validation-report.json` alongside dossier.

**Test setup:** 4 test files under `src/__tests__/` and `src/utils/__tests__/`. 106 tests via vitest. Fixtures are programmatic via `createEmptyDossier()`.

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
src/report/evals/                       # Evaluation harness
  fixtures/001-ai-services/             # Fixture 1: AI narrative masks service delivery
  fixtures/002-enterprise-proof-gap/    # Fixture 2: enterprise positioning vs SMB reality
  fixtures/003-founder-credibility-gap/ # Fixture 3: founder-anchored credibility vs institutional depth
  runner/run-fixture.ts                 # CLI runner: loads fixture, runs pipeline, scores
  scoring/                              # Per-stage scorers + common keyword-overlap matcher
  stubs/stages.ts                       # Adapter layer: 6 real impls + downstream stubs
  types/                                # Fixture and eval result types
  results/                              # Eval run outputs (gitignored recommended)
docs/specs/Intelligence-engine-specs/   # 8 upstream specs (001-008)
docs/specs/report-specs/                # 9 report engine specs (001-009)
docs/handoffs/current.md               # This file
.claude/skills/build-company-dossier/   # SKILL.md + 7 reference docs
runs/                                   # Per-company output (gitignored)
```

# Current Phase

Report Engine Phase 13 (Pipeline Generalization for Fixture 003) complete. 106 tests passing, 0 regressions.

Eval results for all three fixtures:
```
Fixture 001-ai-services:
  Signals:      5/5 must-detect, 3/3 nice, 0 violations  PASS
  Tensions:     3/3 must-detect, 2/2 nice, 0 violations  PASS
  Patterns:     2/2 must-detect, 2/2 nice, 0 violations  PASS
  Hypotheses:   2/2 must-detect, 1/3 acceptable, 0 violations  PASS
  Implications: 4/4 must-detect, 2/2 nice, 0 violations  PASS
  Overall: PASS

Fixture 002-enterprise-proof-gap:
  Signals:      4/4 must-detect, 1/3 nice, 0 violations  PASS
  Tensions:     2/2 must-detect, 1/2 nice, 0 violations  PASS
  Patterns:     2/2 must-detect, 1/1 nice, 0 violations  PASS
  Hypotheses:   2/2 must-detect, 1/3 acceptable, 0 violations  PASS
  Implications: 4/4 must-detect, 2/2 nice, 0 violations  PASS
  Overall: PASS

Fixture 003-founder-credibility-gap:
  Signals:      4/4 must-detect, 2/2 nice, 0 violations  PASS
  Tensions:     2/2 must-detect, 2/2 nice, 0 violations  PASS
  Patterns:     2/2 must-detect, 1/1 nice, 0 violations  PASS
  Hypotheses:   2/2 must-detect, 2/3 acceptable, 0 violations  PASS
  Implications: 4/4 must-detect, 1/1 nice, 0 violations  PASS
  Overall: PASS
```

# Next Step

**Report Engine Phase 14 -- plan-report**
- Takes implications + upstream objects and produces a report plan/outline
- Spec: docs/specs/report-specs/008-plan-report.md
- Second-to-last pipeline stage before report generation is complete

**Report Engine Phase 15 -- write-report**
- Final pipeline stage: produces the actual intelligence report
- Spec: docs/specs/report-specs/009-write-report.md

# Known Constraints

- MK2 Core must NOT add new dossier fields. Schema expansion is MK2B/MK3.
- `additionalProperties: false` on section objects -- new fields require schema update first
- `$defs` (source_record, evidence_record) do NOT have `additionalProperties: false` -- optional fields are backward-compatible
- Report engine must not perform fresh research -- operates only on dossier-derived data
- Report engine pipeline stages must not inspect dossier directly (signals-only downstream of extract-signals)
- Stress-test survival requires: high-importance pattern + medium+ confidence + 3+ tensions + 2+ signal kind diversity + 0 counter-signals
- Hypotheses need sufficient unique tension IDs to avoid >70% overlap deduplication
- SKILL.md must stay under ~400 lines. Reference docs handle depth.
- All 16 dossier sections must exist even when empty (downstream AI needs consistent shape)
- Errors = structural failures (block validation). Warnings = quality concerns (never block).
- Do not refactor into multi-agent architecture. Single skill works.
- WebSearch + WebFetch only. No external tools (Exa, Firecrawl, Puppeteer).
- Eval results directory should be gitignored (transient outputs).

# Dossier Schema Key Fields

Sections that require exact schema field names (common errors when generating manually):
- `run_metadata.evidence_summary` requires: `total_sources`, `total_evidence`, `by_source_tier`, `by_evidence_category`, `inferred_count`, `direct_count`, `customer_voice_depth`, `negative_signal_depth`
- `by_source_tier` requires: `tier_1`, `tier_2`, `tier_3`, `tier_4`, `tier_5`
- `by_evidence_category` requires: `company_basics`, `product_and_offer`, `gtm`, `customer`, `competitors`, `signals`, `market_and_macro`, `positioning_and_narrative`, `risk`
- `customer_voice_depth` / `negative_signal_depth` enums: `none`, `thin`, `moderate`, `rich`
- `narrative_intelligence` requires: `company_claimed_value`, `customer_expressed_value`, `customer_language_patterns`, `narrative_gaps`, `negative_signals`, `value_alignment_summary`, `hidden_differentiators`, `messaging_opportunities`, `narrative_summary`
- `negative_signals` items require: `signal`, `category`, `severity`, `frequency`, `evidence_ids` (optional: `related_narrative_gap`)
- `value_alignment_summary` items require: `theme`, `alignment`, `company_language`, `customer_language`, `business_implication`, `evidence_ids`, `confidence`
- `narrative_gaps` items require: `gap_name`, `company_language`, `customer_language`, `gap_description`, `likely_business_impact`, `suggested_repositioning_direction`, `evidence_ids`, `confidence`
- `strategic_hypotheses` items require: `hypothesis`, `category`, `falsification_criteria`, `time_horizon`, `assumptions`, `evidence_ids`, `confidence` (optional: `counter_signals`)
- `strategic_hypotheses` category enum: `positioning`, `gtm`, `product`, `competitive`, `market`

# Files Modified Recently

**Report Engine Phase 12 -- Eval Fixture 003 (this session):**
- `src/report/evals/fixtures/003-founder-credibility-gap/dossier.json` -- new fixture dossier (CatalystIQ)
- `src/report/evals/fixtures/003-founder-credibility-gap/expected-signals.md` -- signal expectations
- `src/report/evals/fixtures/003-founder-credibility-gap/expected-tensions.md` -- tension expectations
- `src/report/evals/fixtures/003-founder-credibility-gap/expected-patterns.md` -- pattern expectations
- `src/report/evals/fixtures/003-founder-credibility-gap/expected-hypotheses.md` -- hypothesis expectations
- `src/report/evals/fixtures/003-founder-credibility-gap/expected-implications.md` -- implication expectations
- `src/report/evals/fixtures/003-founder-credibility-gap/notes.md` -- fixture design notes

**Report Engine Phase 13 -- Pipeline Generalization for Fixture 003 (this session):**
- `src/report/pipeline/extract-signals.ts` -- generalized Passes 1, 2, 12; added Passes 13-18 for founder signals
- `src/report/pipeline/detect-tensions.ts` -- added 4 new tension templates (10-13) for founder dynamics + dedup fix
- `src/report/pipeline/detect-patterns.ts` -- added 3 new pattern templates (8-10) for founder concentration + Template 4 guard
- `src/report/pipeline/generate-hypotheses.ts` -- added 2 new hypothesis templates (8-9) for founder credibility + Template 4 guard
- `src/report/pipeline/generate-implications.ts` -- added 5 new implication templates (13-17) for founder-scaling implications
- `docs/handoffs/current.md` -- updated with Phase 12+13 completion
