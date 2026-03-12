# Company Intelligence Engine

## What This Is

A system that accepts a company name and domain, conducts structured public research, and produces a machine-readable JSON dossier for downstream AI consumption.

Core thesis: most businesses do not know what they are actually selling. This system surfaces the gap between company messaging and customer-perceived value.

## Architecture (V1)

- Claude Code is the orchestrator via `/build-company-dossier` skill
- Research uses WebSearch and WebFetch only (no API keys, no external tools)
- TypeScript handles deterministic work: validation, types, ID generation
- Output is a single `dossier.json` per run with embedded evidence and source arrays

## V1 Schema Extension

The canonical schema (Spec 002) defines 15 top-level fields. V1 adds a 16th: `evidence` (array of EvidenceRecord objects). This fills an acknowledged gap — Spec 002 references `evidence_ids` throughout but never specifies where evidence records live. Storing them inline makes the dossier self-contained.

## Non-Negotiable Rules

1. **Evidence linking is mandatory.** Every major claim must reference `evidence_ids`. Every evidence record must reference a valid `source_id`.
2. **Inference must be labeled.** `is_inferred: true` + `evidence_ids` + `confidence`. Never present inference as fact.
3. **Unknown is better than guessed.** Sparse evidence = "low" confidence, not fabricated certainty.
4. **All 16 top-level sections must exist.** Even empty sections must appear with valid shape. Downstream AI needs consistent structure.
5. **Confidence enum: `low` | `medium` | `high`.** No other values.
6. **Narrative gaps require evidence.** ≥1 company-side claim + ≥2 customer-side signals. If insufficient, say so with `"confidence": "low"`.
7. **Company copy ≠ customer truth.** Different evidence types, different source tiers. Never confuse them.
8. **Downstream AI is the consumer.** Optimize for machine parsing, not human polish.

## Source Trust Hierarchy

- **Tier 1** (company-controlled): website, pricing, docs, blog, press releases — strongest for company claims
- **Tier 2** (authoritative external): investors, media, regulatory — strong for external facts
- **Tier 3** (customer/market): testimonials, reviews, case studies — strongest for customer truth
- **Tier 4** (secondary synthesis): directories, analyst blogs — weak, for discovery only
- **Tier 5** (noisy): scraped fragments, unattributed reposts — hypothesis generation only

## Repo Landmarks

| Path | Purpose |
|------|---------|
| `docs/specs/` | Source of truth (8 specs) |
| `schemas/company-dossier.schema.json` | JSON Schema for dossier validation |
| `src/types/` | TypeScript types (Dossier, Evidence, Source) |
| `src/utils/` | ID generators, empty dossier, enums |
| `src/validate.ts` | CLI validator: schema + evidence links |
| `.claude/skills/build-company-dossier/` | Playbook skill for end-to-end research |
| `runs/<slug>/` | Per-company output (gitignored) |

## Commands

```bash
# Validate a dossier
npx tsx src/validate.ts runs/<slug>/dossier.json

# Generate empty dossier (for testing)
npx tsx src/utils/empty-dossier.ts <slug>
```

## Build Workflow

1. Read relevant specs before implementation changes
2. Update spec before changing behavior
3. Run validation after every dossier output
4. Do not collapse missing sections — empty with `"confidence": "low"` is correct
5. Do not add fields not in the schema without updating the schema first
