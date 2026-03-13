# MK2 Core — Phases 1-2 Complete, Phase 3 Next

Date: 2026-03-12
Status: Phases 1-2 implemented and tested. Phase 3 not started. 66 tests passing.

---

## 1. Project Goal

System accepts company name + domain, conducts structured public research via Claude Code skill, produces machine-readable JSON dossier for downstream AI. Core thesis: most businesses do not know what they are actually selling.

Architecture: Claude Code is the orchestrator. WebSearch + WebFetch only. TypeScript handles deterministic validation/schema enforcement. No external APIs.

---

## 2. What MK1 Shipped

- Complete vertical slice: input → research → evidence → dossier → validation
- 1 successful run (Vercel): 12 sources, 46 evidence records, 10 content sections
- TypeScript types matching Spec 002 + 003
- JSON Schema (draft-07) with 16 required top-level fields
- Validator with 8 check layers
- Single playbook skill (238 lines, 11 steps) with 2 reference files

---

## 3. What MK2 Core Includes (Phases 1-4)

Better judgments through evidence discipline, source trust, research depth, narrative traceability. **No new dossier fields. No schema expansion.**

| Phase | Delivers | Status |
|-------|----------|--------|
| 1 | Validator refactor + test foundation + new warnings | **Complete** |
| 2 | Source tier operationalization | **Complete** |
| 3 | Skill workflow enhancement (research quality) | **Not started** |
| 4 | Narrative gap traceability | **Not started** |

Gate after Phase 4: Run 2-5 real companies before proceeding to MK2B (schema expansion).

---

## 4. Phase 1 — What Was Done

### 1a. Validator extraction
- Created `src/validate-core.ts` — all validation logic, fully importable
- Reduced `src/validate.ts` to thin CLI wrapper (~60 lines)
- Exported: `validate()`, `collectValues()`, `isSectionPopulated()`, `ValidationReport`, `CONTENT_SECTIONS`
- Added validation summary output to CLI

### 1b. Test infrastructure
- Installed vitest as devDependency
- Added `"test": "vitest run"` to package.json

### 1c. Unit tests (4 test files, 50 initial tests)
- `src/utils/__tests__/ids.test.ts` — makeSourceId, makeEvidenceId, makeRunId, slugify
- `src/utils/__tests__/enums.test.ts` — isValidConfidence, CONFIDENCE_VALUES
- `src/utils/__tests__/empty-dossier.test.ts` — 16 keys, shape, confidence values, passes validate()
- `src/__tests__/validate.test.ts` — all existing checks + helpers

### 1d. New validator warnings (3 checks)
- Orphan evidence: evidence not referenced by any section
- Unused sources: source not referenced by any evidence
- Single-source confidence ceiling: section with all evidence from 1 source + confidence > "low"

---

## 5. Phase 2 — What Was Done

### 2a. Schema + type changes
- `src/types/source.ts`: added `source_tier: 1 | 2 | 3 | 4 | 5` to SourceRecord
- `schemas/company-dossier.schema.json`: added `source_tier` (integer 1-5, required) to source_record $defs

### 2b. Tier-aware validator warnings (3 checks)
- Tier-ceiling: all evidence from Tier 4-5 + confidence > "low" → warning
- Customer-truth tier: narrative gap customer evidence only from Tier 4-5 → warning
- Source-quality consistency: evidence source_quality "high" but source is Tier 4-5 → warning

### 2c. Skill updates
- Created `references/source-tier-assignment.md` — tier definitions, assignment rules, interpretation rules
- Updated `references/schema-reference.md` — added source_tier to Source Record Shape
- Updated `SKILL.md` — tier enforcement note + source_tier in source record template

### 2d. Tests
- 9 new tests for tier-aware checks (schema validation, tier-ceiling, customer-truth tier, source-quality consistency)

---

## 6. All Files Changed (Phases 1-2)

| File | Phase | Action |
|------|-------|--------|
| `package.json` | 1 | Modified (vitest, test script) |
| `src/validate-core.ts` | 1, 2 | Created, then extended |
| `src/validate.ts` | 1 | Rewritten as CLI wrapper |
| `src/utils/__tests__/ids.test.ts` | 1 | Created |
| `src/utils/__tests__/enums.test.ts` | 1 | Created |
| `src/utils/__tests__/empty-dossier.test.ts` | 1 | Created |
| `src/__tests__/validate.test.ts` | 1, 2 | Created, then extended |
| `src/types/source.ts` | 2 | Modified (source_tier) |
| `schemas/company-dossier.schema.json` | 2 | Modified (source_tier) |
| `.claude/skills/.../references/source-tier-assignment.md` | 2 | Created |
| `.claude/skills/.../references/schema-reference.md` | 2 | Modified |
| `.claude/skills/.../SKILL.md` | 2 | Modified |

---

## 7. Current Validator Architecture

`src/validate-core.ts` exports `validate(dossierPath: string): ValidationReport`.

17 numbered checks:

| # | Check | Type |
|---|-------|------|
| 1 | JSON parse | error (early return) |
| 2 | Schema validation (AJV) | error |
| 3-4 | Build lookup sets + collect refs | setup |
| 5 | Evidence ID resolution | error |
| 6 | Source ID resolution | error |
| 7 | Confidence enum validity | error |
| 8 | Evidence type vocabulary | warning |
| 9 | Inference labeling | warning |
| 10 | Narrative gap evidence requirements | error |
| 11 | Orphan evidence | warning |
| 12 | Unused sources | warning |
| 13 | Single-source confidence ceiling | warning |
| 14 | Tier-ceiling | warning |
| 15 | Customer-truth tier | warning |
| 16 | Source-quality consistency | warning |
| 17 | Section stats | stats only |

Error/warning policy: errors fail validation (`valid: false`), warnings never fail.

Key data structures built during validation:
- `sourceIdSet`, `evidenceIdSet` — for link resolution
- `referencedEvidenceIds` — all evidence_ids referenced by sections
- `evidenceById` — Map for evidence lookup by ID
- `sourceTierById` — Map for tier lookup by source_id
- `CONTENT_SECTIONS` — 10 content sections (excludes company_input, run_metadata, sources, evidence)

---

## 8. Current Source Tier Behavior

`source_tier` is required on every source record (integer 1-5, enforced by JSON Schema).

Tier definitions:
- 1: company-controlled (website, docs, blog)
- 2: authoritative external (investors, media, regulatory)
- 3: customer/market (reviews, testimonials, case studies)
- 4: secondary synthesis (directories, analyst blogs)
- 5: noisy (scraped fragments, unattributed)

Validator enforces:
- Tier 4-5 only evidence + confidence > low → warning
- Customer gap evidence only from Tier 4-5 → warning
- source_quality "high" on Tier 4-5 source → warning

SKILL.md references `source-tier-assignment.md` for assignment rules.

---

## 9. Phase 3 Scope — Skill Workflow Enhancement

**No schema changes. No type changes. No validator changes. Pure research quality improvement.**

Constraint: SKILL.md currently ~240 lines, must stay under ~400. Depth goes into references/.

### 3a. Negative signal research
- Create `references/negative-signal-research.md`
- Research targets: billing complaints, support friction, migration pain, trust concerns, churn language
- Evidence types: `review_record`, `pain_point_record`, `customer_language_record` with tags `["negative", "friction"]`
- Add Step 4b to SKILL.md (2-3 lines referencing the new file)

### 3b. Customer voice segmentation
- Create `references/customer-voice-segmentation.md`
- Tags: `["love"]`, `["friction"]`, `["buyer_language"]`, `["user_language"]`, `["manager_language"]`
- Enhance Step 4 to reference this file

### 3c. Competitor depth
- Create `references/competitor-depth.md`
- Messaging overlap, undifferentiated positioning, narrative wins, accidental wedges
- Maps to existing fields: `positioning_overlaps`, `competitive_gaps`, `competitive_observations`
- Enhance Step 5 to reference this file

### 3d. WebFetch fallback rule
- Add to SKILL.md Critical Rules: when 403/blocked, search for cached snippets, try alternatives, note in `run_metadata.notes` and `missing_data`

### Files for Phase 3
- Create: `references/negative-signal-research.md`
- Create: `references/customer-voice-segmentation.md`
- Create: `references/competitor-depth.md`
- Modify: `SKILL.md`

### Phase 3 Verification
Run `/build-company-dossier` for 1 company. Verify negative signals gathered, evidence tags include negative/friction/love, competitor observations use depth framework, blocked sources noted.

---

## 10. Phase 4 Scope — Narrative Gap Traceability (after Phase 3)

3 new validator warnings in `validate-core.ts`:

| Check | Type | Logic |
|-------|------|-------|
| Gap company-evidence link | warning | Gap evidence_ids must include >=1 `company_claim_record`, `positioning_record`, or `content_record` |
| Gap customer-evidence link | warning | Gap evidence_ids must include >=2 `testimonial_record`, `review_record`, `customer_language_record`, or `customer_value_record` |
| Gap language traceability | warning | Each company_language/customer_language string should appear as case-insensitive substring in a referenced evidence excerpt |

Text normalization for substring matching: lowercase, collapse whitespace, strip leading/trailing punctuation.

Tests required for each check (positive and negative cases).

---

## 11. Things to Watch

1. **SKILL.md line budget:** Currently ~240 lines. Phase 3 adds Step 4b + enhances Steps 4 and 5 + adds Critical Rule 8. Keep under ~400 by putting detail in references/.

2. **Test helper `makeSource` now requires `source_tier`:** Default is tier 1. All existing tests updated. New tests must use `makeSource(id, tier)`.

3. **`CUSTOMER_EVIDENCE_TYPES` set** defined inline in validate-core.ts (check 15). Phase 4 will need a similar set for company-side and customer-side evidence types. Consider whether to extract these as constants.

4. **`evidenceById` map** is built at check 13 and reused by checks 14-16. Phase 4 checks will also need it. No action needed — it's already available in scope.

5. **Empty dossier has `sources: []`** — no source_tier impact. But any real run now requires source_tier on every source. The MK1 Vercel run output is incompatible (no source_tier). This is expected — MK1 runs are not forward-compatible.

6. **`overall_confidence` vs `confidence`:** `isSectionPopulated` skips the key `confidence` but not `overall_confidence`. This causes `confidence_and_gaps` to report as populated even when empty. Existing behavior, documented in test comment. Not a bug — just a quirk to be aware of.

---

## 12. Repo Landmarks (Updated)

| Path | Purpose |
|------|---------|
| `CLAUDE.md` | Project constitution |
| `docs/specs/` | 8 specs — source of truth |
| `docs/handoffs/` | Session handoff documents |
| `schemas/company-dossier.schema.json` | JSON Schema with source_tier |
| `src/validate-core.ts` | Core validation logic (17 checks) |
| `src/validate.ts` | CLI wrapper |
| `src/types/source.ts` | SourceRecord with source_tier |
| `src/types/evidence.ts` | EvidenceRecord + 41 evidence types |
| `src/types/dossier.ts` | Dossier interface + nested types |
| `src/utils/` | ids, enums, timestamps, empty-dossier |
| `src/__tests__/validate.test.ts` | Validator tests (46 tests) |
| `src/utils/__tests__/` | Utility tests (20 tests) |
| `.claude/skills/build-company-dossier/SKILL.md` | 11-step research workflow (~240 lines) |
| `.claude/skills/build-company-dossier/references/` | 3 reference files (schema, evidence-types, source-tier) |
| `runs/` | Per-company output (gitignored) |

---

## 13. Immediate Next Step

Start Phase 3: create the three reference documents, update SKILL.md.

No code changes. No tests. Pure skill/reference authoring.

---

End of handoff.
