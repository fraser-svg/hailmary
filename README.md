# Company Intelligence Engine

A system that accepts a company name and domain, conducts structured public research, and produces a machine-readable JSON dossier — then transforms that dossier into strategic narrative reports.

**Core thesis:** most businesses do not know what they are actually selling. This system surfaces the gap between company messaging and customer-perceived value.

## How It Works

### Dossier Generation

1. You provide a company name and domain
2. The engine researches public sources (website, reviews, press, job postings, competitor pages)
3. It produces a structured `dossier.json` with 16 sections, every claim linked to evidence, every evidence record linked to a source
4. A validator checks schema compliance, evidence integrity, and confidence scoring

The dossier is not a human report. It is a canonical intelligence object designed for downstream AI reasoning.

### Report Engine

The report engine transforms a validated dossier into a strategic narrative through an 8-stage analysis pipeline:

1. **Extract Signals** — pull raw signals from dossier evidence
2. **Detect Tensions** — identify contradictions between company claims and customer reality
3. **Detect Patterns** — find recurring themes across signal clusters
4. **Generate Hypotheses** — form strategic hypotheses from tensions and patterns
5. **Stress-Test Hypotheses** — challenge each hypothesis with counter-evidence
6. **Generate Implications** — derive actionable implications from surviving hypotheses
7. **Plan Report** — structure the narrative arc and section outline
8. **Write Report** — produce the final strategic narrative

Each stage is deterministic TypeScript with an eval harness measuring output quality. The pipeline supports batch analysis across ICP company lists.

## Dossier Sections

| Section | What It Captures |
|---------|-----------------|
| `company_profile` | Identity, stage, HQ, leadership, category |
| `product_and_offer` | Products, pricing model, delivery, complexity |
| `gtm_model` | Sales motion, channels, hiring signals, growth signals |
| `customer_and_personas` | ICP, buyer/user personas, pain and outcome themes |
| `competitors` | Direct, adjacent, substitutes, differentiators, overlaps |
| `market_and_macro` | Market dynamics, trends, regulatory, macro risks |
| `signals` | Funding, launches, leadership changes, press |
| `narrative_intelligence` | Company claims vs. customer language, narrative gaps |
| `strategic_risks` | Positioning, GTM, competitive, market, dependency risks |
| `confidence_and_gaps` | What we know, what we don't, where evidence is weak |
| `sources` | Every URL with type, publisher, relevance notes |
| `evidence` | Every extracted claim with excerpt, confidence, tags |

## Quick Start

```bash
# Install dependencies
npm install

# Build a dossier (via Claude Code skill)
/build-company-dossier Acme acme.com

# Validate a dossier
npx tsx src/validate.ts runs/acme/dossier.json

# Generate an empty dossier skeleton (for testing)
npx tsx src/utils/empty-dossier.ts acme

# Run the report pipeline on a dossier
npx tsx src/report/pipeline/<stage>.ts runs/acme/dossier.json

# Batch analyse ICP companies
npx tsx src/report/runner/batch-analyse.ts
```

## Project Structure

```
.
├── docs/specs/
│   ├── Intelligence-engine-specs/   # 8 dossier specs (source of truth)
│   └── report-specs/                # 9 report engine specs
├── schemas/
│   ├── company-dossier.schema.json  # JSON Schema for dossier validation
│   └── report/                      # Report pipeline schemas
├── src/
│   ├── types/              # TypeScript types (Dossier, Evidence, Source)
│   ├── utils/              # ID generators, empty dossier, enums
│   ├── validate.ts         # CLI validator: schema + evidence links
│   ├── validate-core.ts    # Core validation logic (testable, no I/O)
│   └── report/
│       ├── pipeline/       # 8-stage analysis pipeline
│       ├── evals/          # Eval harness with scored fixtures
│       ├── writer/         # LLM-powered report writer + skill mode
│       └── runner/         # Batch analysis runner
├── runs/                   # Per-company output (gitignored)
└── .claude/skills/         # Claude Code skill for dossier generation
```

## Architecture

- **Claude Code** is the orchestrator via the `/build-company-dossier` skill
- **Research** uses WebSearch and WebFetch only — no API keys, no external tools
- **TypeScript** handles deterministic work: validation, types, pipeline stages
- **LLM Writer** generates narrative reports from pipeline output via Claude
- **Eval Harness** scores pipeline output against fixture-based expectations
- **Output** is a `dossier.json` per company + optional strategic report

## Non-Negotiable Rules

1. **Evidence linking is mandatory.** Every major claim references `evidence_ids`. Every evidence record references a valid `source_id`.
2. **Inference must be labeled.** `is_inferred: true` + `evidence_ids` + `confidence`. Never present inference as fact.
3. **Unknown is better than guessed.** Sparse evidence = `"confidence": "low"`, not fabricated certainty.
4. **All 16 sections must exist.** Even empty sections must appear with valid shape.
5. **Company copy is not customer truth.** Different evidence types, different source tiers. Never confuse them.

## Source Trust Hierarchy

| Tier | Type | Strongest For |
|------|------|---------------|
| 1 | Company-controlled (website, docs, blog) | Company claims |
| 2 | Authoritative external (investors, media) | External facts |
| 3 | Customer/market (reviews, testimonials) | Customer truth |
| 4 | Secondary synthesis (directories, analysts) | Discovery only |
| 5 | Noisy (scraped fragments, unattributed) | Hypothesis generation only |

## Validation

The validator (`src/validate.ts`) checks:

- JSON schema compliance against `schemas/company-dossier.schema.json`
- Every `evidence_id` reference resolves to an actual evidence record
- Every evidence record's `source_id` resolves to an actual source
- Confidence values are valid (`low` | `medium` | `high`)
- Evidence types match the controlled vocabulary
- Source tier assignments are valid (1-5)
- Inferred records have supporting evidence
- Narrative gaps meet minimum evidence requirements

It writes a `validation-report.json` alongside the dossier and exits non-zero on failure.

## Tech Stack

- TypeScript (ES2022, NodeNext)
- [Ajv](https://ajv.js.org/) for JSON Schema validation
- Node.js (no framework, no build step beyond tsx)
