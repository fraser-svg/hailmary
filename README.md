# Company Intelligence Engine

A system that accepts a company name and domain, conducts structured public research, and produces a machine-readable JSON dossier — then transforms that dossier into a founder-facing strategic memo ready for physical outreach.

**Core thesis:** most businesses do not know what they are actually selling. This system surfaces the gap between company messaging and customer-perceived value, diagnoses the GTM archetype, and produces a targeted intervention narrative.

---

## How It Works

### Three-layer architecture

```
Company name + domain
  └── [Acquisition]  siteCorpusAcquisition + externalResearchAcquisition
  └── [Dossier]      mergeResearchCorpus → corpusToDossierAdapter → dossier.json (16 sections)
  └── [Reasoning]    V2 pipeline → GTM diagnosis → mechanisms → intervention
  └── [Memo]         buildEvidencePack → adjudicateDiagnosis → buildMemoBrief
                      → writeMemo (LLM) → criticiseMemo (adversarial LLM)
                      → [revision if fail] → runSendGate
                      → MarkdownMemo + SendGateResult
```

**Acquisition layer** scrapes and structures public evidence. **Dossier layer** normalises it into a canonical 16-section JSON intelligence object. **Reasoning layer** runs a deterministic 9-stage pipeline to classify the company's GTM archetype and causal failure. **Memo layer** scores the evidence, adjudicates confidence, drafts a strategic memo, critiques it adversarially, and gates send quality.

### Legacy path (still supported)

```
/build-company-dossier skill → Claude WebSearch + WebFetch → dossier.json → V2 reasoning
```

---

## Pipelines

### V3 (current)

```
siteCorpusAcquisition → externalResearchAcquisition → mergeResearchCorpus
  → corpusToDossierAdapter → [V2 reasoning spine]
  → buildEvidencePack → adjudicateDiagnosis → buildMemoBrief
  → writeMemo(1) → criticiseMemo(1)
  → [revision loop if !overall_pass] → writeMemo(2) → criticiseMemo(2)
  → runSendGate(final)
```

### V2 (feature-flagged via `USE_INTELLIGENCE_V2=true`)

```
extract-signals → gtm-analysis → detect-tensions → detect-patterns
  → adapter (archetype classification) → diagnosis → mechanisms → intervention → report-v2
```

### Legacy (8 stages)

```
extract-signals → detect-tensions → detect-patterns → generate-hypotheses
  → stress-test-hypotheses → generate-implications → plan-report → write-report
```

---

## Dossier Sections

| Section | What It Captures |
|---------|-----------------|
| `company_profile` | Identity, stage, HQ, leadership, category |
| `product_and_offer` | Products, pricing model, delivery, complexity |
| `gtm_model` | Sales motion, channels, hiring signals, growth signals |
| `customer_and_personas` | ICP, buyer/user personas, pain and outcome themes |
| `competitors` | Direct, adjacent, substitutes, differentiators |
| `market_and_macro` | Market dynamics, trends, regulatory, macro risks |
| `signals` | Funding, launches, leadership changes, press |
| `narrative_intelligence` | Company claims vs. customer language, narrative gaps |
| `strategic_risks` | Positioning, GTM, competitive, market, dependency risks |
| `confidence_and_gaps` | What we know, what we don't, where evidence is weak |
| `sources` | Every URL with type, publisher, tier, relevance notes |
| `evidence` | Every extracted claim with excerpt, confidence, tags |

---

## Setup

```bash
npm install
```

Create a `.env` file:

```bash
PERPLEXITY_API_KEY=your_key_here
```

---

## Commands

```bash
# Run all tests
npx vitest run

# Validate a dossier
npx tsx src/validate.ts runs/<slug>/dossier.json

# Generate empty dossier skeleton (for testing)
npx tsx src/utils/empty-dossier.ts <slug>

# Build a dossier via Claude Code skill (legacy)
/build-company-dossier Acme acme.com

# Batch analyse ICP companies
npx tsx src/report/runner/batch-analyse.ts
```

---

## Project Structure

```
.
├── docs/
│   ├── specs/
│   │   ├── Intelligence-engine-specs/   # Dossier specs (source of truth)
│   │   ├── report-specs/                # Report engine specs
│   │   └── intelligence-engine-v3/      # V3 memo layer specs (001–006)
│   └── handoffs/current.md              # Full development history + phase status
├── schemas/
│   ├── company-dossier.schema.json      # JSON Schema for dossier validation
│   └── report/                          # Report pipeline schemas
├── src/
│   ├── types/                           # TypeScript types (Dossier, Evidence, Source)
│   ├── utils/                           # ID generators, empty dossier, enums
│   ├── validate.ts                      # CLI validator (thin wrapper)
│   ├── validate-core.ts                 # Core validation logic (21 checks, testable)
│   ├── intelligence-v3/
│   │   ├── acquisition/                 # Site corpus, external research, merge, adapter
│   │   ├── memo/                        # buildEvidencePack, adjudicateDiagnosis,
│   │   │                                #   buildMemoBrief, writeMemo, criticiseMemo,
│   │   │                                #   runSendGate
│   │   ├── pipeline/                    # runV3Pipeline (wires M1–M6 + revision loop)
│   │   ├── types/                       # V3 type definitions
│   │   └── __tests__/                   # 443 tests
│   └── report/
│       ├── pipeline/                    # 8-stage legacy analysis pipeline
│       ├── evals/                       # Eval harness with scored fixtures
│       ├── writer/                      # LLM report writer + skill mode
│       └── runner/                      # Batch analysis runner
├── runs/                                # Per-company output (gitignored)
└── .claude/skills/                      # Claude Code skills
```

---

## Source Trust Hierarchy

| Tier | Type | Used For |
|------|------|----------|
| 1 | Company-controlled (website, docs, blog) | Company claims |
| 2 | Authoritative external (investors, media) | External facts |
| 3 | Customer/market (reviews, testimonials) | Customer truth |
| 4 | Secondary synthesis (directories, analysts) | Discovery only |
| 5 | Noisy (scraped fragments, unattributed) | Hypothesis generation only |

Tier 3 strength requires pattern repetition, not a single data point. Tier 4–5 can never primarily support medium/high confidence claims.

---

## Invariants

1. **Evidence linking is mandatory.** Every major claim references `evidence_ids`. Every evidence record references a valid `source_id`.
2. **Inference must be labeled.** `is_inferred: true` + `evidence_ids` + `confidence`.
3. **Unknown is better than guessed.** Sparse evidence = `"confidence": "low"`, not fabricated certainty.
4. **All 16 sections must exist.** Even empty sections appear with valid shape.
5. **Company copy is not customer truth.** Different evidence types, different source tiers.
6. **Downstream AI is the consumer.** Optimise for machine parsing, not human polish.

---

## Validation

`src/validate.ts` checks:

- JSON schema compliance
- Every `evidence_id` reference resolves to an actual evidence record
- Every evidence record's `source_id` resolves to an actual source
- Confidence values are valid (`low` | `medium` | `high`)
- Evidence types match controlled vocabulary
- Source tier assignments are valid (1–5)
- Inferred records have supporting evidence
- Narrative gaps meet minimum evidence requirements (≥1 company claim + ≥2 customer signals)

Exits non-zero on failure. Writes `validation-report.json` alongside the dossier.

---

## Tech Stack

- TypeScript (ES2022, NodeNext)
- [Anthropic SDK](https://github.com/anthropic-ai/anthropic-sdk-typescript) — LLM stages (Haiku 4.5 for memo writing/criticism)
- [Ajv](https://ajv.js.org/) — JSON Schema validation
- [Vitest](https://vitest.dev/) — 443 tests
- Node.js, no framework, no build step beyond `tsx`
