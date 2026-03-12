# Company Intelligence Engine

A system that accepts a company name and domain, conducts structured public research, and produces a machine-readable JSON dossier for downstream AI consumption.

**Core thesis:** most businesses do not know what they are actually selling. This system surfaces the gap between company messaging and customer-perceived value.

## How It Works

1. You provide a company name and domain
2. The engine researches public sources (website, reviews, press, job postings, competitor pages)
3. It produces a structured `dossier.json` with 16 sections, every claim linked to evidence, every evidence record linked to a source
4. A validator checks schema compliance, evidence integrity, and confidence scoring

The output is not a human report. It is a canonical intelligence object designed for downstream AI reasoning.

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
```

## Project Structure

```
.
├── docs/specs/           # 8 specification documents (source of truth)
│   ├── 001-product-thesis.md
│   ├── 002-dossier-schema.md
│   ├── 003-evidence-model.md
│   ├── 004-source-priority-and-inference-rules.md
│   ├── 005-agent-contracts.md
│   ├── 006-skill-contracts.md
│   ├── 007-evaluation-and-acceptance-criteria.md
│   └── 008-repository-structure-and-implementation-plan.md
├── schemas/
│   └── company-dossier.schema.json   # JSON Schema for validation
├── src/
│   ├── types/            # TypeScript types (Dossier, Evidence, Source)
│   ├── utils/            # ID generators, empty dossier, enums
│   └── validate.ts       # CLI validator: schema + evidence links
├── runs/                 # Per-company output (gitignored)
└── .claude/skills/       # Claude Code skill for dossier generation
```

## Architecture

- **Claude Code** is the orchestrator via the `/build-company-dossier` skill
- **Research** uses WebSearch and WebFetch only -- no API keys, no external tools
- **TypeScript** handles deterministic work: validation, types, ID generation
- **Output** is a single `dossier.json` per run with embedded evidence and source arrays

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
- Inferred records have supporting evidence
- Narrative gaps meet minimum evidence requirements

It writes a `validation-report.json` alongside the dossier and exits non-zero on failure.

## Tech Stack

- TypeScript (ES2022, NodeNext)
- [Ajv](https://ajv.js.org/) for JSON Schema validation
- Node.js (no framework, no build step beyond tsx)
