# Company Intelligence Engine — Current Handover

# Project Goal

A system that accepts a company name and domain, conducts structured public research, and produces a machine-readable JSON dossier for downstream AI consumption. A report engine transforms dossiers into strategic analysis through a structured reasoning pipeline.

Core thesis: most businesses do not know what they are actually selling. The system surfaces the gap between company messaging and customer-perceived value.

# Current Architecture

Three-layer design. The dossier is the product artifact.

```
Research layer (Claude skill: /build-company-dossier)
  -> WebSearch + WebFetch only, no external APIs
  -> 12-step playbook with 6 reference documents

Intelligence object (runs/<slug>/dossier.json)
  -> 16 required top-level fields
  -> Evidence embedded inline as 16th field (locked decision)
  -> Self-contained and portable

Deterministic validation layer (TypeScript)
  -> Schema validation + evidence-link checking
  -> Errors = structural integrity (fail). Warnings = trust/quality (never fail).
```

Report engine (specs complete, evaluation fixtures started):
```
dossier.json -> extract-signals -> detect-tensions -> detect-patterns
  -> generate-hypotheses -> stress-test -> generate-implications
  -> plan-report -> write-report -> report.json + report.md
```

The report engine operates only on dossier-derived data. No fresh research. Every claim traces back through the reasoning chain to evidence and sources.

# Development Stage

**MK1 (complete):** Full vertical slice. Input to validated dossier. One production run (Vercel). 12 sources, 46 evidence records.

**MK2 Core (Phases 1-3 complete, Phase 3 validation in progress, Phase 4 planned):** Better judgment quality, not more fields. No new dossier fields. No schema expansion. Sharper intelligence from existing structure.

**Report Engine:** 9 spec documents written and audited. Phase 1 (Spec Locking) complete. Phase 2 (Evaluation Fixtures) complete — first fixture created and validated.

# Phase Status

**Intelligence Engine Phase 1 — Validator Enhancement + Test Foundation (complete)**
- Extracted `validate-core.ts` from `validate.ts` for testability
- CLI wrapper in `validate.ts` handling argv/file I/O/exit codes
- Installed vitest, 66 tests across 4 test files
- Added orphan evidence, unused sources, single-source confidence warnings

**Intelligence Engine Phase 2 — Source Tier Operationalization (complete)**
- `source_tier` (integer 1-5) added to SourceRecord type and JSON Schema
- 3 tier-aware validator warnings: tier-ceiling, customer-truth tier, source-quality consistency
- `source-tier-assignment.md` reference created
- SKILL.md and schema-reference.md updated

**Intelligence Engine Phase 3 — Skill Workflow Enhancement (complete, validation in progress)**
- Created `references/negative-signal-research.md`, `customer-voice-segmentation.md`, `competitor-depth.md`
- Added Step 4b (Negative Signal Research) to SKILL.md
- Enhanced Steps 4 and 5 with segmentation and competitor depth references
- Added Critical Rule 8: WebFetch fallback
- SKILL.md at 262 lines (under 400 limit)
- Stripe validation run: 11 sources, 52 evidence records, 0 errors, 0 warnings
- Notion validation run: 12 sources, 55 evidence records, 0 errors, 0 warnings
- HubSpot validation run pending (next)
- Phase 3 generalization verdict pending: comparing research quality across Stripe, Notion, HubSpot

**Intelligence Engine Phase 4 — Narrative Gap Traceability (planned, not started)**
- 3 new validator warnings: gap company-evidence link, gap customer-evidence link, gap language traceability

**Report Engine Phase 1 — Spec Locking (complete)**
- 9 spec documents (001-009) covering all 8 pipeline stages plus master spec
- 5 inconsistencies found during audit, all resolved (lineage propagation, weak hypothesis routing, confidence semantics, tone profile enforcement, section lineage delegation)

**Report Engine Phase 2 — Evaluation Fixtures (complete)**
- Fixture 001 (AI Services) created: fictional company marketing AI automation with service-heavy delivery
- Dossier validated against existing validator: 0 errors, 0 warnings
- 8 sources (tiers 1-3), 10 evidence records, 10/10 content sections populated
- Expected outputs for all 5 reasoning stages: signals, tensions, patterns, hypotheses, implications
- Three validation checks passed: evidence supports signals, outputs are stage-correct, expectations are semantic not literal

# Validator Architecture

**validate-core.ts** (~364 lines): Pure validation logic. 17 numbered checks. Importable, no CLI dependencies.
Exports: `validate()`, `collectValues()`, `isSectionPopulated()`, `ValidationReport`, `CONTENT_SECTIONS`

**validate.ts** (~60 lines): Thin CLI wrapper. Handles argv, file I/O, console output, exit codes. Writes `validation-report.json` alongside dossier.

**Test setup:** 4 test files under `src/__tests__/` and `src/utils/__tests__/`. 66 tests via vitest. Fixtures are programmatic via `createEmptyDossier()`.

# Source Tier System

| Tier | Category | Use |
|------|----------|-----|
| 1 | Company-controlled (website, docs, blog) | Strongest for company claims |
| 2 | Authoritative external (investors, media, regulatory) | Strong for external facts |
| 3 | Customer/market (reviews, testimonials, case studies) | Strongest for customer truth |
| 4 | Secondary synthesis (directories, analyst blogs) | Discovery only |
| 5 | Noisy (scraped fragments, unattributed) | Hypothesis generation only |

Tier-aware validator warnings:
- Tier-ceiling: confidence > "low" with all evidence from Tier 4-5 sources
- Customer-truth tier: narrative gap customer evidence only from Tier 4-5
- Source-quality consistency: evidence source_quality "high" but source is Tier 4-5
- Tier 3 strength requires pattern repetition, not single data points

# Repository Structure

```
schemas/
  company-dossier.schema.json          # JSON Schema (draft-07), 16 required fields

src/
  types/
    source.ts                          # SourceRecord with source_tier
    evidence.ts                        # EvidenceRecord type
    dossier.ts                         # Full dossier type
  utils/
    ids.ts                             # ID generators (slugify, etc.)
    empty-dossier.ts                   # Creates valid empty dossier
    enums.ts                           # Confidence enum, evidence types
    __tests__/                         # Unit tests for utils
  validate-core.ts                     # 17-check validation logic
  validate.ts                          # CLI wrapper
  __tests__/
    validate.test.ts                   # 46 validator tests
  report/
    evals/
      fixtures/
        001-ai-services/               # First eval fixture (AI automation vs services)
          dossier.json                 # Fictional company, 8 sources, 10 evidence
          expected-signals.md          # 5 must-detect, 3 nice-to-detect
          expected-tensions.md         # 3 must-detect, 2 nice-to-detect
          expected-patterns.md         # 2 must-detect, 2 nice-to-detect
          expected-hypotheses.md       # 2 must-detect, 3 acceptable alternatives
          expected-implications.md     # 4 must-detect, 2 nice-to-detect
          notes.md                     # Fixture purpose and success criteria

docs/
  specs/
    Intelligence-engine-specs/         # 8 upstream specs (001-008)
    report-specs/                      # 9 report engine specs (001-009)
  handoffs/
    current.md                         # THIS FILE — canonical rolling handover

.claude/skills/build-company-dossier/
  SKILL.md                             # 12-step research workflow (262 lines)
  references/
    evidence-types.md                  # 44 evidence types
    schema-reference.md                # Field definitions
    source-tier-assignment.md          # Tier assignment rules
    negative-signal-research.md        # Negative signal targets and tagging
    customer-voice-segmentation.md     # Customer voice tags and role inference
    competitor-depth.md                # Competitive analysis framework

runs/                                  # Per-company output (gitignored)
```

# Current Phase

Phase 3 validation in progress. Notion dossier complete (0 errors, 0 warnings). HubSpot dossier pending. Cross-company comparison (Stripe vs Notion vs HubSpot) will determine Phase 3 generalization verdict.

# Next Step

**Complete Phase 3 Validation**

1. Run `/build-company-dossier hubspot hubspot.com`
2. Analyze both dossiers for: negative signal capture, evidence tag distribution, competitor analysis depth, narrative gap quality, blocked source handling
3. Compare Stripe vs Notion vs HubSpot results
4. If quality is consistent: Phase 3 validated

**Then: Pre-Phase 4 Improvement**

Update SKILL.md to log inaccessible sources as `missing_data` entries in `run_metadata.notes` rather than silently removing them.

**Then: Intelligence Engine Phase 4 — Narrative Gap Traceability**

Add 3 validator warnings to `validate-core.ts`:
1. Gap company-evidence link: gap evidence_ids must include >=1 company_claim_record/positioning_record/content_record
2. Gap customer-evidence link: gap evidence_ids must include >=2 testimonial_record/review_record/customer_language_record/customer_value_record
3. Gap language traceability: each company_language/customer_language string should appear as case-insensitive substring in a referenced evidence excerpt

**Report Engine: Phase 3 — Evaluation Harness Skeleton** (separate track)

Build the machinery to run a fixture through the pipeline and score outputs stage by stage.

# Known Constraints

- MK2 Core must NOT add new dossier fields. Schema expansion is MK2B/MK3.
- `additionalProperties: false` on section objects — new fields require schema update first
- `$defs` (source_record, evidence_record) do NOT have `additionalProperties: false` — optional fields are backward-compatible
- Report engine must not perform fresh research — operates only on dossier-derived data
- SKILL.md must stay under ~400 lines. Reference docs handle depth.
- All 16 dossier sections must exist even when empty (downstream AI needs consistent shape)
- Errors = structural failures (block validation). Warnings = quality concerns (never block).
- Do not refactor into multi-agent architecture. Single skill works.
- WebSearch + WebFetch only. No external tools (Exa, Firecrawl, Puppeteer).
- Do not build fixture 002 until harness is working against fixture 001.

# Files Modified Recently

**Phase 3 validation (this session):**
- `runs/notion/dossier.json` — created (Notion dossier: 12 sources, 55 evidence, 0 errors, 0 warnings)
- `runs/notion/validation-report.json` — created (validation output)
- `docs/handoffs/current.md` — updated with session checkpoint

# Phase 3 Validation Results So Far

**Stripe (previous session):** 11 sources, 52 evidence records, 0 errors, 0 warnings
- 9 negative evidence records with friction/churn/negative tags
- Tags: love, friction, negative, buyer_language, user_language, trust, churn
- Narrative gap detected: "developer experience" (customer truth) vs "financial infrastructure" (company messaging)
- 6 blocked sources documented in run_metadata.notes

**Notion (this session):** 12 sources, 55 evidence records, 0 errors, 0 warnings
- 15 negative evidence records tagged with negative/friction/churn/trust
- Tags: love, friction, negative, buyer_language, user_language, churn, trust
- 3 narrative gaps: AI marketing vs flexibility loyalty, enterprise scale vs setup burden, cloud vs data ownership
- 5 blocked sources documented in run_metadata.notes (G2, Capterra, UX Planet, Notion customers page)
- Competitor depth: messaging overlap, undifferentiated positioning, accidental differentiation all captured
