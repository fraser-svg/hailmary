# Company Intelligence Engine - Engineering Checkpoint

Date: 2026-03-12
Status: Pre-implementation. All 8 specs written. Zero code exists.

---

# 1. Product Summary

The Company Intelligence Engine accepts a company name and primary domain, conducts structured public research, and produces a machine-readable JSON dossier designed for downstream AI consumption.

The core thesis: **Most businesses do not actually know what they are selling.** They describe their offer in feature language, category language, or internal process language. Customers buy for different reasons and describe the value in completely different terms. This system finds that gap.

The dossier is NOT a human-facing report. It is a canonical intelligence object that another AI system can parse, reason over, and act on. It contains structured evidence, explicit confidence levels, labeled inference, and a dedicated narrative intelligence section that surfaces the mismatch between company messaging and customer-perceived value.

The target market is founder-led B2B companies where positioning clarity materially affects growth. The product is especially valuable when messaging is vague, competitors sound similar, and customers may value something the company underemphasizes.

V1 accepts only `company_name` and `primary_domain`. Future versions may accept LinkedIn URLs, review sources, sales call transcripts, and internal messaging docs, but these are explicitly out of scope.

---

# 2. Core Runtime Decision

The current runtime decision for tonight's build:

- **No API keys.** The user has a MAX subscription, not Anthropic API access.
- **Engine runs as a Claude Code skill** invoked via `/build-company-dossier <company> <domain>`.
- **Research uses Claude Code's built-in WebSearch and WebFetch tools** for all public-source data collection.
- **Deterministic work is done in TypeScript** (Node.js + tsx): schema validation, evidence-link validation, ID generation, empty dossier generation, output file writing.
- **This is intentionally simpler than a multi-tool backend.** No Exa, no Firecrawl, no Puppeteer, no SerpAPI, no MCP servers tonight.
- **Claude Code IS the orchestrator.** The skill's SKILL.md guides Claude through the research steps. There is no separate orchestrator script that calls the Anthropic API.

This means the "agent" layer from Spec 005 is collapsed into a single Claude Code skill workflow. The 7 agents described in the spec are not implemented as separate entities tonight. Claude Code follows the skill instructions to research each domain area sequentially.

---

# 3. Canonical Spec Set

All specs live in `/docs/specs/`. They are the source of truth. Code must not contradict them.

| Spec | File | Governs |
|------|------|---------|
| 001 | `001-product-thesis.md` | Product vision, core input/output contract, V1 scope boundaries, success criteria, failure modes. Defines the narrative intelligence thesis. |
| 002 | `002-dossier-schema.md` | The canonical JSON dossier structure. All 15 top-level fields defined with exact nested shapes. Every section is required even if sparse. Confidence enum: low/medium/high. Evidence linking rules. This is THE output contract. |
| 003 | `003-evidence-model.md` | Three-layer model: Source -> Evidence Record -> Claim Support. Defines SourceRecord and EvidenceRecord schemas. Controlled vocabulary of 35+ evidence types. Minimum evidence thresholds per dossier section. Rules for deduplication, conflict handling, narrative gap support requirements. |
| 004 | `004-source-priority-and-inference-rules.md` | Five-tier source trust hierarchy (Tier 1: company-controlled, Tier 2: authoritative external, Tier 3: customer/market-visible, Tier 4: secondary synthesis, Tier 5: weak/noisy). Three claim classifications (direct fact, evidence-backed interpretation, explicit inference). Rules for when inference is allowed, minimum support expectations, recency preferences, contradiction handling. |
| 005 | `005-agent-contracts.md` | Defines 7 specialist agents (Identity Resolution, Company Profile, GTM Intelligence, Competitor Intelligence, Narrative Intelligence, Market and Risk, Dossier Synthesizer). Base input/output contract for all agents. Recommended execution order. Per-agent responsibilities, allowed/disallowed behaviors, failure modes. Note: says "six" but lists 7. |
| 006 | `006-skill-contracts.md` | Defines 12 skills across 3 levels (8 capability, 3 composite, 1 playbook). Skill contract template with 11 required sections. SKILL.md frontmatter format. Skill vs agent vs code decision rules. Skill testing requirements (trigger, functional, value tests). Skill file structure (.claude/skills/<name>/SKILL.md + references/ + scripts/). |
| 007 | `007-evaluation-and-acceptance-criteria.md` | Six evaluation layers: schema validation, evidence validation, section completeness, quality rubric (0-3 per dimension, 21 total), hallucination/contradiction checks, regression benchmarking. Six acceptance gates. Minimum standards for V1. Narrative intelligence special rubric (5 sub-dimensions). Failure triage categories (A through F). Benchmark company set requirements (10 companies, 3 easy / 4 medium / 3 hard). |
| 008 | `008-repository-structure-and-implementation-plan.md` | Full target repo structure. File and folder responsibilities. What goes in CLAUDE.md. Code vs skills vs agents vs specs boundaries. 10-phase implementation sequence. First 20 implementation tickets. Definition of done for foundation phase. Rules for future changes. |

---

# 4. Non-Negotiable Product Rules

These rules must not be broken in any version of the implementation:

1. **Evidence linking is mandatory.** Every major claim in the dossier must reference one or more `evidence_ids`. Every evidence record must reference a valid `source_id`.
2. **Inference must be labeled.** Any inferred finding must include `is_inferred: true`, supporting `evidence_ids`, and a confidence value. Never present inference as direct fact.
3. **Unknown is better than guessed.** If evidence is too sparse, the system must say "unknown", "unclear", or "weakly supported" rather than fabricating certainty.
4. **All 15 required dossier sections must exist.** Even if a section has no data, it must appear with empty arrays, blank strings, and `"confidence": "low"`. Downstream AI needs consistent shape.
5. **Confidence enum is `low` | `medium` | `high`.** No other values. No numeric scores in V1.
6. **Narrative gaps require both sides.** A narrative gap must have at least 1 company-side value claim AND at least 2 customer-side signals (testimonials, reviews, case studies). Gaps from thin semantic differences are not acceptable.
7. **Downstream AI is the primary consumer.** The dossier is not a human report. Field names and structure optimize for machine interpretation, not polish.
8. **Company copy is not customer truth.** The system must not confuse what the company says customers value with what customers actually say. These are separate evidence types with different source tiers.
9. **Sources have trust tiers.** Tier 1 (company-controlled) is strongest for company claims. Tier 3 (customer/market evidence) is strongest for customer truth. Lower tiers should rarely anchor major claims alone.

---

# 5. Current MVP / Tonight Ship Plan

### Must Build
1. `package.json` + `tsconfig.json` + `.gitignore` + project setup
2. `CLAUDE.md` with operational rules and repo landmarks
3. TypeScript types: `Dossier`, `EvidenceRecord`, `SourceRecord` matching Spec 002/003 exactly
4. Single unified JSON schema: `schemas/company-dossier.schema.json`
5. Schema validator using `ajv`
6. ID generators (source IDs: `src_001`, evidence IDs: `ev_001`, run IDs: UUID)
7. Empty dossier generator (valid skeleton with all sections)
8. Evidence link validator (every `evidence_id` resolves, every `source_id` resolves)
9. Validation CLI script: `npx tsx src/validate.ts runs/<slug>/dossier.json`
10. `build-company-dossier` SKILL.md (the playbook skill that drives the full pipeline)
11. SKILL.md references: schema excerpt, evidence type vocabulary
12. One successful run against a real company (Vercel recommended)

### Should Build (if time permits)
- Market/macro context as an additional research step in the skill
- Signal detection (funding, hiring, launches)
- Confidence scoring logic (beyond defaulting everything to "low")
- Additional capability skills (`company-basics-research`, `customer-language-extraction`)
- Second company run to confirm repeatability

### Cut for Tonight
- Separate agent `.md` files in `.claude/agents/`
- Full 8-skill library in `.claude/skills/`
- Architecture docs, decision records, pipeline diagrams
- Benchmark suite of 10 companies
- Scorecard generator
- Regression testing framework
- Skill trigger tests and eval fixtures
- Contradiction detector code
- Source tier classifier code (hardcoded in skill prompt tonight)
- Recency weighting logic
- Evidence deduplication logic
- Raw capture storage (only keep normalized evidence tonight)
- Collector modules (`collect-company-pages.ts`, etc.)

### Stub for Tonight
- `market_and_macro` section: present with empty arrays + `"confidence": "low"`
- `signals` section: present with empty arrays + `"confidence": "low"`
- `strategic_risks` section: present with empty arrays + `"confidence": "low"`
- `confidence_and_gaps.conflicting_evidence`: always empty array
- Contradiction detection: not implemented, returns nothing

---

# 6. Architecture Decision

### Current Implementation Architecture

```
User invokes: /build-company-dossier Vercel vercel.com
         |
         v
   SKILL.md loads (playbook instructions)
         |
         v
   Claude Code follows research steps:
   1. WebSearch for company basics, product, pricing, leadership
   2. WebFetch to read key pages (homepage, pricing, case studies)
   3. WebSearch for GTM signals, hiring, buyer evidence
   4. WebSearch for competitors and alternatives
   5. WebSearch for customer reviews, testimonials, case studies
   6. WebFetch to read customer evidence pages
         |
         v
   Claude assembles dossier JSON following schema contract
   Claude writes to runs/<slug>/dossier.json
         |
         v
   Claude runs: npx tsx src/validate.ts runs/<slug>/dossier.json
         |
         v
   Validation report written to runs/<slug>/validation-report.json
   Claude reports results
```

### Two-Layer Separation

| Layer | Responsibility | Implementation |
|-------|---------------|----------------|
| AI (Claude Code + Skill) | Web research, evidence extraction, narrative analysis, dossier assembly | SKILL.md with step-by-step instructions |
| Code (TypeScript) | Schema validation, evidence-link checking, ID generation, empty dossier templates | `src/validate.ts`, `src/utils/*.ts`, `src/types/*.ts` |

### Key Simplification

The specs describe 7 agents, 12 skills, 12 schema files, and a 10-phase implementation plan. Tonight's build collapses this to:
- **0 separate agent files** (the skill handles orchestration)
- **1 playbook skill** (replaces 12 skills)
- **1 schema file** (replaces 12)
- **1 validation script** (replaces 5 separate validators)

This is a deliberate and justified reduction. The full architecture can be factored out later once the vertical slice works.

---

# 7. Open Technical Decision That Must Be Resolved Early

**Where do evidence records and source records live?**

### Option A: Inside dossier.json (recommended for tonight)
Add a top-level `evidence` array to `dossier.json` alongside the existing `sources` array. The dossier becomes fully self-contained.

```json
{
  "schema_version": "1.0.0",
  "sources": [...],
  "evidence": [...],
  "company_profile": { ... "evidence_ids": ["ev_001"] },
  ...
}
```

**Pros:** Single file to validate, debug, and share. Evidence links can be checked without cross-file references. Simpler for downstream AI consumption.

**Cons:** File gets large. Not how Spec 002 currently defines it (sources array exists, evidence array does not).

### Option B: Separate evidence.json file
Write `runs/<slug>/evidence.json` alongside `dossier.json`.

**Pros:** Cleaner separation. Matches the spec's conceptual model more closely.

**Cons:** Cross-file validation is harder. More files to manage. Downstream consumer needs both files.

### Current Recommendation
**Use Option A for tonight.** Add `evidence` as a top-level array in the dossier. This is a minor deviation from Spec 002 (which does not include a top-level evidence array), but it dramatically simplifies validation and debugging. The spec already includes `sources` at top level, so adding `evidence` follows the same pattern.

Note: Spec 002's `sources` array stores source records. The evidence records are referenced by `evidence_ids` throughout the dossier but the spec never defines where the actual evidence record objects live. This is an omission in the spec that must be resolved.

---

# 8. Dossier Contract Summary

### Shape
Machine-readable JSON following Spec 002. All fields are required.

### Top-Level Sections (15 total)
1. `schema_version` - string, always "1.0.0"
2. `generated_at` - ISO 8601 timestamp
3. `company_input` - original input + resolved identity
4. `run_metadata` - run_id, pipeline_version, timing, counts
5. `company_profile` - plain-language description, category, stage, HQ, leadership
6. `product_and_offer` - core offer, products/services, pricing, delivery model
7. `gtm_model` - sales motion, channels, buyer journey, hiring signals
8. `customer_and_personas` - ICP, buyer personas, pain themes, outcome themes
9. `competitors` - direct/adjacent/substitutes, differentiators, overlaps
10. `market_and_macro` - market category, trends, regulatory, economic, technology shifts
11. `signals` - funding, product launches, leadership changes, press
12. `narrative_intelligence` - company-claimed value, customer-expressed value, language patterns, narrative gaps, hidden differentiators
13. `strategic_risks` - positioning, GTM, competitive, market, dependency risks
14. `confidence_and_gaps` - high/medium/low confidence findings, missing data, conflicts
15. `sources` - normalized source records array

### Evidence Storage
Still to be finalized (see section 7), but current plan: add a 16th top-level field `evidence` containing all evidence record objects. Every `evidence_id` referenced throughout the dossier resolves to an object in this array.

### Key Nested Structures
- Confidence is always `"low" | "medium" | "high"`
- Inferred fields carry `is_inferred: boolean` + `confidence` + `evidence_ids`
- Narrative gaps carry: `gap_name`, `company_language[]`, `customer_language[]`, `gap_description`, `likely_business_impact[]`, `suggested_repositioning_direction`, `evidence_ids[]`, `confidence`
- Source records carry: `source_id`, `url`, `source_type`, `title`, `publisher_or_owner`, `captured_at`, `relevance_notes[]`
- Evidence records carry: `evidence_id`, `source_id`, `evidence_type`, `captured_at`, `excerpt`, `summary`, `normalized_fields{}`, `source_quality`, `confidence`, `is_inferred`, `supports_claims[]`, `tags[]`

---

# 9. Validation Requirements

The validation script (`src/validate.ts`) must check these things tonight:

1. **JSON parse.** The file must be valid JSON.
2. **Schema validation.** The dossier must match `schemas/company-dossier.schema.json` (using ajv).
3. **Required sections.** All 15 (or 16 with evidence) top-level fields must exist.
4. **Evidence ID resolution.** Every `evidence_id` string found anywhere in the dossier must correspond to an actual evidence record object.
5. **Source ID resolution.** Every `source_id` in every evidence record must correspond to an actual source record in the `sources` array.
6. **Confidence enum validity.** Every `confidence` field must be one of: `"low"`, `"medium"`, `"high"`.
7. **Evidence type vocabulary.** Every `evidence_type` must come from the controlled vocabulary defined in Spec 003 (35+ types).
8. **Inference labeling.** Where `is_inferred: true` exists, `evidence_ids` should also be present. (Warning-level, not blocking.)

### Output
The validation script writes `validation-report.json` with:
```json
{
  "valid": true,
  "schema_valid": true,
  "evidence_links_valid": true,
  "errors": [],
  "warnings": [],
  "stats": {
    "source_count": 0,
    "evidence_count": 0,
    "sections_populated": 0,
    "sections_empty": 0
  }
}
```

---

# 10. Narrative Intelligence Rules

This is the product's core differentiator. It requires special care.

### What narrative intelligence captures
- **Company-claimed value:** What the company says customers should care about. Extracted from homepage headlines, product copy, value propositions, founder messaging, official content. Evidence types: `company_claim_record`, `positioning_record`, `content_record`.
- **Customer-expressed value:** What customers actually say they value. Extracted from testimonials, reviews, case studies, public customer quotes. Evidence types: `testimonial_record`, `review_record`, `customer_language_record`, `customer_value_record`.
- **Narrative gaps:** Where company claims and customer evidence meaningfully diverge. Not semantic trivia (e.g., "automation" vs "saves time") but strategically significant mismatches (e.g., company emphasizes "AI workflow orchestration" while customers repeatedly value "ease of onboarding" and "speed to first result").

### Hard rules
- Do NOT use company copy as customer evidence. These are different evidence types from different source tiers.
- Do NOT assert a narrative gap from a single customer quote.
- Do NOT confuse language variation with strategic mismatch. "Saves time" and "automation" may describe the same value.
- Narrative gaps must have: >= 1 company-side value claim + >= 2 customer-side signals + a commercially meaningful mismatch.
- If customer-language evidence is insufficient, do NOT fabricate gaps. Return the section with `"confidence": "low"` and add an entry to `missing_data`: "Insufficient customer-language evidence for strong narrative-gap claims."

### Acceptable tonight
- A low-confidence narrative section with 1 supported gap is acceptable.
- An honest "insufficient evidence" result is acceptable.
- What is NOT acceptable: fabricated customer language, hallucinated gaps, or company copy disguised as customer truth.

---

# 11. What Was Deliberately Deferred

These items are explicitly pushed out of tonight's build. They are not forgotten; they are deferred.

| Item | Why deferred |
|------|-------------|
| Full 8-skill library (`.claude/skills/`) | Only 1 playbook skill needed tonight |
| 7 separate agent definition files (`.claude/agents/`) | Collapsed into skill workflow |
| Architecture docs (`/docs/architecture/`) | Not blocking implementation |
| Decision records (`/docs/decisions/`) | Can document after shipping |
| Benchmark suite of 10 companies | 1-2 companies sufficient to validate |
| Scorecard generator | Schema validation is enough for tonight |
| Regression testing framework | No baseline to regress against yet |
| Skill trigger tests and eval fixtures | No skill library to test yet |
| Contradiction detector | Stubbed empty; add when evidence volume warrants it |
| Source tier classifier code | Hardcoded in skill prompt instructions |
| Recency weighting logic | Handled by skill prompt, not code |
| Evidence deduplication logic | Unlikely to matter with manual research |
| Raw capture storage | Only normalized evidence tonight |
| Collector modules (`collect-*.ts`) | Claude Code does collection directly |
| Multiple tool providers (Exa, Firecrawl, etc.) | WebSearch/WebFetch sufficient tonight |
| Unit tests for utilities | Can add after vertical slice works |

---

# 12. Search / Research Decision History

### Concern
The specs describe a "collector" layer (`collect-company-pages.ts`, `collect-signals.ts`, etc.) but never specify how web research actually happens. Multiple tool options were considered.

### Options evaluated
1. **Anthropic API + `web_search` tool** - Originally recommended. Requires API key. Programmatic, repeatable, unattended.
2. **MCP tools (Firecrawl, Exa, etc.)** - More powerful web scraping and search. Requires additional API keys and setup.
3. **Claude Code WebSearch/WebFetch** - Uses MAX subscription. No additional cost. Research happens within Claude Code session.
4. **External APIs (Tavily, SerpAPI, etc.)** - Requires additional API keys. More complexity.

### Decision
**Claude Code with built-in WebSearch/WebFetch** for tonight. The user has a MAX subscription and does not want to use API keys. This is the simplest path that works.

### Future path
If the engine later becomes a real backend service:
- Exa for semantic search (finds relevant content, not just keyword matches)
- Firecrawl for structured web scraping (reads full pages, extracts structured data)
- These would replace WebSearch/WebFetch in a programmatic pipeline
- SearXNG, Perplexity, Cloudflare crawl, and Playwright are NOT part of the current or near-term plan

---

# 13. First Vertical Slice

### Input
```
/build-company-dossier Vercel vercel.com
```

### Flow
1. Research company basics via WebSearch (company description, category, HQ, leadership, founded year)
2. Read company website pages via WebFetch (homepage, pricing page, case studies)
3. Build source records for each page visited
4. Extract evidence records from each source (typed, with excerpts and summaries)
5. Research GTM signals (sales motion, pricing model, hiring signals, buyer personas)
6. Research competitors (direct, adjacent, substitutes with rationale)
7. Research customer voice (testimonials, reviews, case study quotes)
8. Analyze narrative gap (company claims vs customer evidence)
9. Assemble complete dossier JSON following Spec 002 schema
10. Stub empty sections (market_and_macro, signals, strategic_risks)
11. Write `runs/vercel/dossier.json`
12. Run `npx tsx src/validate.ts runs/vercel/dossier.json`
13. Fix any validation errors
14. Write `runs/vercel/validation-report.json`

### Expected output files
```
runs/vercel/
  dossier.json            (~300-600 lines of structured JSON)
  validation-report.json   (schema: pass, evidence: pass, warnings: [...])
```

### What this slice covers
- Identity resolution (canonical name, aliases)
- Company profile (description, category, stage, HQ, leadership)
- Product and offer (products, pricing model, delivery model)
- GTM model (sales motion, channels, buyer personas)
- Competitors (direct and adjacent with rationale)
- Narrative intelligence (company claims vs customer evidence, gaps)
- Evidence records (15-30 typed records)
- Source records (5-15 records)

### What this slice does NOT cover
- Market/macro context (stubbed)
- Signal detection (stubbed)
- Strategic risks (stubbed)
- Contradiction detection (not implemented)
- Scorecard / quality scoring
- Benchmark comparison

---

# 14. Definition of Done for Tonight

### Must pass (non-negotiable)
- [ ] `/build-company-dossier Vercel vercel.com` produces output without crashing
- [ ] `runs/vercel/dossier.json` exists and is valid JSON
- [ ] Schema validation passes (`npx tsx src/validate.ts`)
- [ ] All 15+ top-level dossier sections exist
- [ ] `company_profile.plain_language_description` is non-empty and accurate
- [ ] `product_and_offer` has at least 1 product with `evidence_ids`
- [ ] `narrative_intelligence` section is populated (not all-empty arrays)
- [ ] At least 1 narrative gap finding OR an explicit low-confidence note explaining insufficient evidence
- [ ] Every `evidence_id` referenced in dossier resolves to an evidence record
- [ ] Every `source_id` in evidence resolves to a source record
- [ ] Evidence records have proper `evidence_type` from controlled vocabulary
- [ ] Inferred findings have `is_inferred: true`
- [ ] Stubbed sections (market_and_macro, signals, strategic_risks) exist with `"confidence": "low"`

### Can be low-quality
- Market/macro (empty but structurally valid)
- Signals (empty but structurally valid)
- Strategic risks (empty but structurally valid)
- Source quality assessment (can default to `"medium"`)
- Confidence scoring (can default to `"low"` or `"medium"`)
- Contradiction detection (empty array)

### Not ready if
- Schema validation fails
- Any top-level section is missing
- Evidence IDs don't resolve
- Narrative intelligence section is completely empty with no explanation
- Company description is factually wrong or hallucinated
- Skill doesn't trigger or crashes mid-run

---

# 15. Immediate Next Actions

1. **Resolve evidence storage decision** - confirm: add top-level `evidence` array to dossier.json (Option A)
2. **Create project foundation** - `package.json`, `tsconfig.json`, `.gitignore`
3. **Write CLAUDE.md** - product rules, repo landmarks, validation commands
4. **Define TypeScript types** - `Dossier`, `EvidenceRecord`, `SourceRecord` matching specs exactly
5. **Build utilities** - ID generators (`src_001`, `ev_001`), timestamps, slugify, evidence type enum
6. **Build JSON schema** - single `schemas/company-dossier.schema.json`
7. **Build empty dossier generator** - valid skeleton for testing
8. **Build validation script** - `src/validate.ts` (schema + evidence links)
9. **Test validation** - generate empty dossier, validate it, confirm passes
10. **Write `build-company-dossier` SKILL.md** - the playbook with step-by-step research instructions
11. **Write skill references** - schema excerpt, evidence type vocabulary
12. **First real run** - `/build-company-dossier Vercel vercel.com`
13. **Debug and fix** - inspect output, fix validation errors, tighten skill instructions
14. **Optionally: second company** - `/build-company-dossier Linear linear.app` to confirm repeatability

---

# 16. Repo/File Plan

### Files to create (in order)

```
/Users/foxy/HailMary/
  package.json
  tsconfig.json
  .gitignore
  CLAUDE.md
  schemas/
    company-dossier.schema.json
  src/
    types/
      dossier.ts
      evidence.ts
      source.ts
      index.ts
    utils/
      ids.ts
      timestamps.ts
      enums.ts
      empty-dossier.ts
      index.ts
    validate.ts
  .claude/
    skills/
      build-company-dossier/
        SKILL.md
        references/
          schema-reference.md
          evidence-types.md
  runs/                    (gitignored, created at runtime)
    <company-slug>/
      dossier.json
      validation-report.json
```

### Files that already exist (do not recreate)
```
docs/specs/001-product-thesis.md
docs/specs/002-dossier-schema.md
docs/specs/003-evidence-model.md
docs/specs/004-source-priority-and-inference-rules.md
docs/specs/005-agent-contracts.md
docs/specs/006-skill-contracts.md
docs/specs/007-evaluation-and-acceptance-criteria.md
docs/specs/008-repository-structure-and-implementation-plan.md
```

---

# 17. Warnings for Future Claude Sessions

## Do Not Drift

- **Do not add extra tools casually.** WebSearch and WebFetch are sufficient tonight. Do not introduce Exa, Firecrawl, Puppeteer, or other tools without explicit need.
- **Do not invent agents or skills unless needed.** The specs describe 7 agents and 12 skills. Tonight we need 1 skill. Do not create agent files or additional skills unless the vertical slice demands it.
- **Do not let prose replace validation.** A dossier that "sounds good" but fails schema validation is not acceptable. Run `npx tsx src/validate.ts` on every output.
- **Do not let missing evidence become confident claims.** If customer evidence is sparse, say so. Do not fabricate narrative gaps. Low confidence with honest missing-data notes is a feature, not a failure.
- **Do not remove required dossier sections.** Even empty sections must exist. Downstream AI needs consistent shape.
- **Do not confuse company copy with customer truth.** These are different source tiers and different evidence types. The narrative intelligence section depends entirely on keeping them separate.
- **Do not add fields not in the spec.** The sole exception is the `evidence` top-level array, which fills an acknowledged gap in Spec 002.
- **Do not over-engineer tonight.** The goal is one valid dossier from one real company. Not a scalable platform. Not a benchmark suite. Not a dashboard.
- **Do not forget the product is AI-first.** The dossier is for downstream AI, not human readers. Optimize for machine parseability, not prose quality.
- **Do not skip reading the specs before modifying code.** The specs are the source of truth. Read Spec 002 (schema), 003 (evidence), and 005 (agents) before any implementation session.

---

# External Resources Studied

Three external resources were thoroughly studied during this session:

1. **Claude Code documentation** (code.claude.com/docs/en/overview) - Skills format, SKILL.md frontmatter, agent definitions, .claude directory structure, progressive disclosure, trigger descriptions, allowed-tools, context forking.
2. **Agent Skills open standard** (agentskills.io via github.com/athina-ai/goose-skills) - Portable skill format across 30+ tools, three-tier disclosure (discovery/activation/resources), specification constraints.
3. **Anthropic's Complete Guide to Building Skills** (PDF) - Evaluation-driven development, two-Claude testing loop, trigger description best practices, anti-patterns, production skill architecture.

Key takeaways applied:
- SKILL.md description must be third-person, specific, include "when to use"
- Keep SKILL.md body < 500 lines; use references/ for detail
- `disable-model-invocation: true` for skills with side effects (not needed for our research skill)
- Test on Haiku to verify skill provides sufficient guidance
- File references should be one level deep from SKILL.md
- `$ARGUMENTS` substitution for passing company name and domain

---

End of checkpoint.
