# Report Engine — Spec Creation Checkpoint

Date: 2026-03-13
Status: Phase 1 (Spec Locking) complete. All report engine specs written and audited. Ready for Phase 2 (Evaluation Fixtures).

---

## 1. Project Goal

A system that accepts a company name and domain, conducts structured public research, produces a machine-readable JSON dossier, and transforms that dossier into a strategic report through a structured reasoning pipeline.

Core thesis: most businesses do not know what they are actually selling. The intelligence engine surfaces the gap between company messaging and customer-perceived value. The report engine translates that intelligence into perceptive, evidence-backed strategic analysis.

---

## 2. Current Architecture

### Intelligence Engine (MK1 complete, MK2 in progress)

```
User -> /build-company-dossier <name> <domain>
  -> SKILL.md loads (playbook instructions)
  -> Claude Code executes research steps (WebSearch + WebFetch)
  -> Claude assembles dossier JSON following schema contract
  -> Claude writes runs/<slug>/dossier.json
  -> Claude runs: npx tsx src/validate.ts runs/<slug>/dossier.json
  -> Validation report written alongside dossier
```

Two-layer separation:
- **AI layer** (Claude Code + SKILL.md): web research, evidence extraction, narrative analysis, dossier assembly
- **Code layer** (TypeScript): schema validation, evidence-link checking, ID generation, types

### Report Engine (specs complete, implementation not started)

```
dossier.json
  -> extract-signals    (observations)
  -> detect-tensions    (contradictions)
  -> detect-patterns    (structural forms)
  -> generate-hypotheses (explanations)
  -> stress-test        (filtering)
  -> generate-implications (consequences)
  -> plan-report        (argument design)
  -> write-report       (rendering)
  -> report.json + report.md
```

The report engine operates only on dossier-derived data. No fresh research. Every claim traces back through the reasoning chain to evidence and sources.

---

## 3. Development Stage

### MK1 (complete)
- Full vertical slice: skill, schema, types, validator, one successful production run
- 12 sources, 46 evidence records in test run

### MK2 Core (Phases 1-2 complete)
- Phase 1: Validator refactored into `validate-core.ts` (importable) + `validate.ts` (CLI wrapper). 50+ tests added via vitest.
- Phase 2: `source_tier` (1-5) operationalized in types, schema, validator, and skill. 3 tier-aware warnings added. 66 total tests passing.
- Phase 3 (next for intelligence engine): Skill workflow enhancement — negative signal research, customer voice segmentation, competitor depth. No code changes.
- Phase 4 (planned): Narrative gap traceability — 3 new warnings.

### Report Engine (specs complete, implementation not started)
- 9 spec documents written and audited
- Phase 1 (Spec Locking) complete with all inconsistencies resolved
- Phase 2 (Evaluation Fixtures) is the next step

---

## 4. Report Engine Spec Status

### Specs created in this session

| File | Purpose |
|------|---------|
| `docs/specs/report-specs/001-report-engine.md` | Master spec: pipeline, invariants, lineage rules, forbidden behaviors |
| `docs/specs/report-specs/002-extract-signals.md` | Stage 1: dossier facts -> analytical observations |
| `docs/specs/report-specs/003-detect-tensions.md` | Stage 2: signals -> structural contradictions |
| `docs/specs/report-specs/004-detect-patterns.md` | Stage 3: tensions + signals -> higher-level structures |
| `docs/specs/report-specs/005-generate-hypotheses.md` | Stage 4: patterns -> candidate explanations |
| `docs/specs/report-specs/006-stress-test-hypotheses.md` | Stage 5: challenge and filter hypotheses |
| `docs/specs/report-specs/007-generate-implications.md` | Stage 6: surviving hypotheses -> strategic consequences |
| `docs/specs/report-specs/008-plan-report.md` | Stage 7: select thesis, structure argument |
| `docs/specs/report-specs/009-write-report.md` | Stage 8: render prose from analytical objects |

### Spec audit findings (all resolved)

5 inconsistencies found during Phase 1 audit, all fixed:

1. **Lineage propagation rules** — Added to 001. `evidence_ids` and `source_ids` aggregate upward from constituent objects. No stage invents new lineage.
2. **Weak hypothesis routing** — Clarified across 006/008/009. `survives` = core argument, `weak` = uncertainty section only, `discarded` = never appears.
3. **Confidence semantics** — `revised_confidence` eliminated. Stress-test updates `confidence` in place. Optional `initial_confidence` for audit trail.
4. **Tone profile enforcement** — Write-report now references `tone_profile` from report-plan.json.
5. **Section lineage delegation** — Write-report explicitly responsible for resolving full lineage from plan references.

---

## 5. Current Validator Architecture

### validate-core.ts (364 lines)
Pure validation logic with 17 numbered checks. Importable, no CLI dependencies.

Exports: `validate()`, `collectValues()`, `isSectionPopulated()`, `ValidationReport`, `CONTENT_SECTIONS`

Key distinction:
- **Errors** = structural integrity failures (fail validation)
- **Warnings** = trust/quality concerns (never fail validation)

### validate.ts (60 lines)
Thin CLI wrapper. Handles argv, file I/O, console output, exit codes. Writes `validation-report.json` alongside dossier.

### Test setup
4 test files under `src/__tests__/` and `src/utils/__tests__/`, 66 tests total via vitest. Fixtures are programmatic via `createEmptyDossier()`.

---

## 6. Source Tier System

| Tier | Category | Use |
|------|----------|-----|
| 1 | Company-controlled (website, docs, blog) | Strongest for company claims |
| 2 | Authoritative external (investors, media, regulatory) | Strong for external facts |
| 3 | Customer/market (reviews, testimonials, case studies) | Strongest for customer truth |
| 4 | Secondary synthesis (directories, analyst blogs) | Discovery only |
| 5 | Noisy (scraped fragments, unattributed) | Hypothesis generation only |

Tier-aware validator warnings:
- Tier-ceiling: high-confidence claims cannot rest primarily on Tier 4-5 sources
- Customer-truth tier: Tier 3 strength requires pattern repetition, not single data points
- Source-quality consistency: source_quality should align with source_tier

---

## 7. Repository Structure

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

docs/
  specs/
    Intelligence-engine-specs/         # 8 upstream specs (001-008)
    report-specs/                      # 9 report engine specs (001-009)
  handoffs/                            # Session handover documents

.claude/skills/build-company-dossier/
  SKILL.md                             # 11-step research workflow
  references/
    evidence-types.md                  # 41 evidence types
    schema-reference.md                # Field definitions
    source-tier-assignment.md          # Tier rules
    negative-signal-research.md        # Phase 3 research targets
    customer-voice-segmentation.md     # Phase 3 evidence tagging
    competitor-depth.md                # Phase 3 competitive analysis

runs/                                  # Per-company output (gitignored)
```

---

## 8. Current Next Step

**Report Engine Phase 2: Evaluation Fixtures**

Design test fixtures that exercise the reasoning pipeline. Fixtures should include dossiers with:
- Rich evidence (many signals, clear tensions)
- Sparse evidence (few sources, low confidence)
- Conflicting evidence (contradictions that must surface)
- Missing sections (graceful degradation)

The specs are locked and provide sufficient contract detail to design these fixtures.

For the intelligence engine separately, MK2 Phase 3 (skill workflow enhancement) is next.

---

## 9. Known Constraints

- No schema changes without updating `schemas/company-dossier.schema.json` first
- `additionalProperties: false` on root dossier object — no new top-level fields without schema update
- `$defs` (source_record, evidence_record) do NOT have `additionalProperties: false` — backward-compatible for optional fields
- Report engine must not perform fresh research — operates only on dossier-derived data
- Errors = structural failures (block validation). Warnings = quality concerns (never block).
- SKILL.md target: under 400 lines. Reference docs handle depth.
- All 16 dossier sections must exist even when empty (downstream AI needs consistent shape)

---

## 10. Files Modified in This Session

### Report engine specs (created/modified)
- `docs/specs/report-specs/001-report-engine.md` — added lineage propagation rules section
- `docs/specs/report-specs/006-stress-test-hypotheses.md` — replaced `revised_confidence` with single `confidence` field, added `initial_confidence` for audit
- `docs/specs/report-specs/008-plan-report.md` — explicit weak/survives/discarded hypothesis routing
- `docs/specs/report-specs/009-write-report.md` — weak hypothesis in uncertainty section, tone_profile enforcement, section lineage delegation

### Report engine specs (created, not modified during audit)
- `docs/specs/report-specs/002-extract-signals.md`
- `docs/specs/report-specs/003-detect-tensions.md`
- `docs/specs/report-specs/004-detect-patterns.md`
- `docs/specs/report-specs/005-generate-hypotheses.md`
- `docs/specs/report-specs/007-generate-implications.md`

### Handover
- `docs/handoffs/2026-03-12-report-spec-creation-checkpoint.md` (this file)
