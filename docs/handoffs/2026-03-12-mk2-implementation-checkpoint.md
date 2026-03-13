# MK2 Core — Implementation Checkpoint

Date: 2026-03-12
Status: Plan finalized after senior-engineer review. Implementation not started. Zero code changes made.

---

## 1. Project Goal

A system that accepts a company name and domain, conducts structured public research, and produces a machine-readable JSON dossier for downstream AI consumption.

Core thesis: most businesses do not know what they are actually selling. This system surfaces the gap between company messaging and customer-perceived value.

---

## 2. Architecture (unchanged from MK1)

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

Claude Code IS the orchestrator. No separate script. WebSearch + WebFetch only. No API keys, no external tools.

---

## 3. What MK1 Accomplished

- Complete vertical slice: input -> research -> evidence -> dossier -> validation
- 1 successful run (Vercel): 12 sources, 46 evidence records, all 10 content sections populated, 2 narrative gaps, 0 validation errors
- TypeScript type system matching Spec 002 + 003 (Dossier, EvidenceRecord, SourceRecord, 41 evidence types)
- JSON Schema (draft-07) with 16 required top-level fields, additionalProperties:false on section objects
- Validator with 8 check layers (schema, evidence links, source links, confidence enum, evidence type vocab, inference labeling, narrative gap requirements, section stats)
- Single playbook skill (238 lines, 11 steps) with 2 reference files
- Evidence stored inside dossier.json as 16th top-level field (locked decision encoded in 5 files)

### MK1 Weaknesses (motivating MK2)

1. Zero automated tests -- any refactor is blind
2. Confidence calibration is vibes-based (single-source claims set to medium)
3. Source trust hierarchy exists only as prose in SKILL.md, not enforced in code
4. No negative signal research (over-indexes on company-controlled and flattering sources)
5. Narrative gaps not mechanically traceable to evidence excerpts
6. Only 1 company run -- no repeatability evidence
7. Validator checks structure only, not evidence quality or trust

---

## 4. What MK2 Core Does

**Better judgments through evidence discipline, source trust, research depth, and narrative traceability.** No new dossier fields. No schema expansion. Sharper intelligence from the existing structure.

The guiding question is not "what else can we store?" but "what changes will make the dossier feel materially more correct?"

### Release Roadmap

| Release | Phases | Delivers |
|---------|--------|----------|
| **MK2 Core** (this plan) | 1-4 | Safety, trust hierarchy, better research, narrative sharpness |
| MK2B (future) | 5-6 | `negative_signals`, `value_alignment_summary`, `evidence_summary` fields |
| MK3 (future) | 7-8 | `strategic_hypotheses`, customer language segmentation |

**Gate between MK2 Core and MK2B:** Run 2-5 real companies. Manually inspect whether research quality visibly improved. Only then add schema fields to hold the richer output.

---

## 5. Error vs Warning Policy (Non-Negotiable)

Without this distinction the validator becomes ignorable.

### Errors (fail validation)

Structural and integrity issues only:
- Schema invalid
- Broken evidence links (referenced evidence_id not in evidence array)
- Broken source links (evidence source_id not in sources array)
- Invalid confidence values
- Inferred evidence record with no evidence_ids
- Required section missing or malformed
- Narrative gap at medium/high confidence without minimum evidence (existing check)

### Warnings (never fail validation)

Trust and quality concerns:
- Single-source overconfidence
- Tier 4-5 only evidence with confidence > "low"
- No Tier 3 sources for customer claims
- Orphan evidence (not referenced by any section)
- Unused sources (not referenced by any evidence)
- Narrative gap missing customer-side evidence types
- Narrative gap language not traceable to evidence excerpts

---

## 6. MK2 Core Implementation Plan (Phases 1-4)

### Phase 1: Validator Enhancement + Test Foundation

**1a. Refactor validate.ts for testability**

Problem: src/validate.ts lines 273-277 call process.exit(1) on import if no argv[2]. Blocks test imports.

Fix:
- Create `src/validate-core.ts` -- extract ValidationReport interface, collectValues(), isSectionPopulated(), validate(). Export all four.
- Modify `src/validate.ts` -- thin CLI wrapper importing from validate-core, handling argv/writeFileSync/console/process.exit.

The validate() function at line 93 is already pure: takes a file path, returns ValidationReport. Clean extraction -- move lines 1-269 to validate-core.ts, keep lines 271-314 as CLI.

**1b. Add vitest**
- Install vitest as devDependency
- Add "test": "vitest run" to package.json scripts
- No config file needed (ESM + NodeNext works out of the box)

**1c. Unit tests**

Create these test files:

| File | Tests |
|------|-------|
| src/utils/__tests__/ids.test.ts | makeSourceId, makeEvidenceId, makeRunId UUID format, slugify edge cases |
| src/utils/__tests__/enums.test.ts | isValidConfidence true/false |
| src/utils/__tests__/empty-dossier.test.ts | All 16 keys present, correct shape, all confidence "low", passes validate() |
| src/__tests__/validate.test.ts | Valid empty dossier, broken evidence/source links, invalid confidence, inference labeling, narrative gaps, collectValues, isSectionPopulated |

Test fixtures: programmatic via createEmptyDossier() then mutate. No golden file dependency.

**1d. New validator checks**

| Check | Type | Logic |
|-------|------|-------|
| Orphan evidence | warning | Evidence not referenced by any section's evidence_ids |
| Unused sources | warning | Sources not referenced by any evidence record |
| Single-source confidence ceiling | warning | Section with all evidence from 1 source, confidence > "low" |

Not adding: empty-array warnings, optional-field-missing, cosmetic completeness. Those create noise.

**Files:**
- Modify: package.json, src/validate.ts
- Create: src/validate-core.ts, 4 test files

---

### Phase 2: Source Tier (Operational)

Source tier is currently philosophy in SKILL.md. This phase makes it behavioral -- changes confidence ceilings and validation warnings.

**Schema/type changes:**
- src/types/source.ts: add `source_tier: 1 | 2 | 3 | 4 | 5` to SourceRecord
- schemas/company-dossier.schema.json: add source_tier (integer, 1-5, required) to source_record $defs
- src/utils/empty-dossier.ts: no change (empty dossier has sources: [])

**Tier-aware validator checks:**

| Check | Type | Logic |
|-------|------|-------|
| Tier-ceiling | warning | All evidence from Tier 4-5 sources + confidence > "low" |
| Customer-truth tier | warning | Narrative gap customer evidence only from Tier 4-5 |
| Source-quality consistency | warning | Evidence source_quality: "high" but source is Tier 4-5 |

**Skill updates:**
- Create references/source-tier-assignment.md (tier definitions, examples, interpretation rules)
- Add source_tier to source record template in SKILL.md Step 1
- Update references/schema-reference.md

Tier definitions: 1=company-controlled, 2=authoritative external, 3=customer/market, 4=secondary synthesis, 5=noisy.
Rule: Tier 4-5 is for discovery only -- never primary support for medium/high confidence claims.

**Files:**
- Modify: src/types/source.ts, schemas/company-dossier.schema.json, SKILL.md, references/schema-reference.md
- Create: references/source-tier-assignment.md
- Extend: src/validate-core.ts, src/__tests__/validate.test.ts

---

### Phase 3: Skill Workflow Enhancement

Improve research before adding output fields. Better inputs -> better intelligence within existing schema. No schema changes, no type changes, no validator changes. Pure research quality.

Constraint: SKILL.md at 238 lines, must stay under ~400. Depth goes into references/ files. The skill says what to do; references say how to think.

**3a. Negative signal research (new Step 4b)**

Create references/negative-signal-research.md:
- Research targets: billing complaints, support friction, migration pain, trust concerns, churn language
- Suggested queries: complaints, reddit frustrations, trustpilot, cancellation language
- Evidence types: review_record, pain_point_record, customer_language_record with tags: ["negative", "friction"]
- Add Step 4b to SKILL.md (2-3 lines pointing to reference)

**3b. Customer voice segmentation**

Create references/customer-voice-segmentation.md:
- Tags on evidence: ["love"], ["friction"], ["buyer_language"], ["user_language"], ["manager_language"]
- A company can be loved by developers and hated by finance -- that split is gold
- Enhance Step 4 to reference this file

**3c. Competitor depth**

Create references/competitor-depth.md:
- Where companies sound the same (messaging overlap)
- Where competitors claim the same value (undifferentiated positioning)
- Where competitors win the narrative (stronger customer evidence)
- Where the target has an accidental wedge (differentiation customers love but company doesn't emphasize)
- Fills existing fields: positioning_overlaps, competitive_gaps, competitive_observations
- Enhance Step 5 to reference this file

**3d. WebFetch fallback**

Add to SKILL.md Critical Rules: when 403/blocked, search for cached snippets, try alternatives, note in run_metadata.notes and missing_data. Do not silently skip.

**Files:**
- Modify: SKILL.md
- Create: references/negative-signal-research.md, references/customer-voice-segmentation.md, references/competitor-depth.md

---

### Phase 4: Narrative Gap Traceability

The narrative gap is the product's wedge. Make it mechanically verifiable.

**New validator checks:**

| Check | Type | Logic |
|-------|------|-------|
| Gap company-evidence link | warning | Gap evidence_ids must include >=1 record typed company_claim_record, positioning_record, or content_record |
| Gap customer-evidence link | warning | Gap evidence_ids must include >=2 records typed testimonial_record, review_record, customer_language_record, or customer_value_record |
| Gap language traceability | warning | Each company_language/customer_language string should appear as case-insensitive substring in a referenced evidence excerpt |

The language traceability check is the most important -- catches when the skill invents gap language not grounded in actual evidence.

**Files:**
- Extend: src/validate-core.ts, src/__tests__/validate.test.ts

---

## 7. All Files Touched (MK2 Core)

| File | Phase | Action |
|------|-------|--------|
| package.json | 1 | Modify (add vitest) |
| src/validate-core.ts | 1, 2, 4 | Create, then extend |
| src/validate.ts | 1 | Modify (thin CLI wrapper) |
| src/utils/__tests__/ids.test.ts | 1 | Create |
| src/utils/__tests__/enums.test.ts | 1 | Create |
| src/utils/__tests__/empty-dossier.test.ts | 1 | Create |
| src/__tests__/validate.test.ts | 1, 2, 4 | Create, then extend |
| src/types/source.ts | 2 | Modify (add source_tier) |
| schemas/company-dossier.schema.json | 2 | Modify (add source_tier to $defs) |
| .claude/skills/.../references/source-tier-assignment.md | 2 | Create |
| .claude/skills/.../references/schema-reference.md | 2 | Modify |
| .claude/skills/.../SKILL.md | 2, 3 | Modify |
| .claude/skills/.../references/negative-signal-research.md | 3 | Create |
| .claude/skills/.../references/customer-voice-segmentation.md | 3 | Create |
| .claude/skills/.../references/competitor-depth.md | 3 | Create |

15 files. 7 new. 8 modified. 1 new dependency (vitest). Zero code changes made yet.

---

## 8. Design Principles

1. **Evidence linking is mandatory.** Every claim -> evidence_ids -> source_id. Mechanically enforced.
2. **Company copy != customer truth.** Different evidence types, different source tiers. Never confuse them.
3. **Unknown is better than guessed.** Sparse evidence = "low" confidence, not fabricated certainty.
4. **Source tier is operational, not decorative.** It changes confidence ceilings and validator warnings.
5. **Warnings must be scarce and meaningful.** Only trust risk, evidence weakness, overstatement, broken traceability. No cosmetic warnings.
6. **The skill says what to do; references say how to think.** Keep SKILL.md under ~400 lines.
7. **Better judgments, not more fields.** MK2 Core adds zero new dossier fields. Improve intelligence quality within existing schema.
8. **All 16 top-level sections must exist.** Empty with "confidence": "low" is correct. Missing is not.
9. **Downstream AI is the consumer.** Optimize for machine parsing, not human polish.

---

## 9. Do Not Drift

1. **Do not add new dossier fields in MK2 Core.** Schema expansion is MK2B/MK3. Improve research and validation first.
2. **Do not refactor into multi-agent architecture.** Single skill works. Specs describe target state, not MK2 requirement.
3. **Do not add external tools** (Exa, Firecrawl, Puppeteer). WebSearch + WebFetch sufficient.
4. **Do not let the validator become a Christmas tree.** Every warning must be about trust, evidence, or traceability.
5. **Do not build a dashboard or human report.** Dossier is for downstream AI.
6. **Do not split the schema file.** Single company-dossier.schema.json (473 lines) is fine.
7. **Do not commit dossier outputs to git.** runs/ is gitignored.
8. **Do not let SKILL.md exceed ~400 lines.** Factor detail into references/ files.
9. **Read Spec 002, 003, and 007 before implementation.** Source of truth for schema, evidence model, evaluation criteria.
10. **Do not confuse company copy with customer truth.** Core thesis. Different evidence types, different source tiers.

---

## 10. Repo Landmarks

| Path | Purpose |
|------|---------|
| CLAUDE.md | Project constitution (non-negotiable rules) |
| docs/specs/ | 8 specs -- source of truth |
| docs/handoffs/ | Session handoff documents |
| schemas/company-dossier.schema.json | JSON Schema (draft-07), 473 lines |
| src/types/dossier.ts | Dossier interface + 17 nested types (303 lines) |
| src/types/evidence.ts | EvidenceRecord + 41 evidence types (128 lines) |
| src/types/source.ts | SourceRecord interface (13 lines) |
| src/utils/ids.ts | makeSourceId, makeEvidenceId, makeRunId, slugify (24 lines) |
| src/utils/enums.ts | CONFIDENCE_VALUES, isValidConfidence (8 lines) |
| src/utils/empty-dossier.ts | createEmptyDossier() + CLI (181 lines) |
| src/validate.ts | CLI validator, 8 checks (314 lines) -- to be split in Phase 1 |
| .claude/skills/build-company-dossier/SKILL.md | 11-step research workflow (238 lines) |
| .claude/skills/build-company-dossier/references/ | schema-reference.md, evidence-types.md |
| runs/ | Per-company output (gitignored) |
| .claude/plans/enumerated-bouncing-boole.md | Detailed plan file from planning session |

---

## 11. Architecture Decisions (Locked)

| Decision | Encoded In | Impact If Forgotten |
|----------|-----------|-------------------|
| Evidence inside dossier.json (16th field) | schema, dossier.ts:302, empty-dossier.ts:163, validate.ts:139, CLAUDE.md | 5-file coordinated change to reverse |
| Claude Code is the orchestrator | SKILL.md, CLAUDE.md | Architecture rethink |
| Single playbook skill (not 7 agents) | .claude/skills/ | Premature decomposition |
| WebSearch + WebFetch only | SKILL.md | New tools need testing + fallback |
| TypeScript for deterministic work only | src/ directory | AI logic in TS breaks two-layer model |
| Narrative gap: >=1 company + >=2 customer evidence | validate.ts lines 200-222 | Weakening undermines core thesis |
| Confidence enum: low/medium/high only | schema, evidence.ts | Other values need schema + validator change |
| runs/ gitignored | .gitignore | Committing runs pollutes repo |
| additionalProperties:false on section objects | schema | New fields must be added to properties explicitly |
| $defs do NOT have additionalProperties:false | schema | Optional fields on source/evidence records are backward-compatible |

---

## 12. Unresolved Questions (None Blocking)

1. **Negative evidence modeling:** MK2 Core uses tags on evidence records (["negative", "friction"]). Future releases may want a richer model (sentiment_polarity, experience_valence). Keep the door open.

2. **Inference warning vs error:** is_inferred: true with no evidence_ids is currently a warning. Spec 003 implies it should be stronger. Kept as warning for MK2 Core -- revisit after real run patterns.

3. **Language traceability threshold:** Phase 4 substring matching is a soft check. Exact "how close is close enough" may need tuning. Start with case-insensitive substring.

4. **Benchmark company selection:** After MK2 Core ships, need 3-5 companies for MK2B gate. Good candidates: companies with obvious messaging-vs-reality tension. Not selected yet.

---

## 13. Verification Plan

After Phase 1:
```
npx vitest run
npx tsx src/utils/empty-dossier.ts test-verify
npx tsx src/validate.ts runs/test-verify/dossier.json
rm -rf runs/test-verify
```

After Phase 2:
```
npx vitest run   # tier tests pass
```

After Phase 3:
Run /build-company-dossier for 1 company. Verify evidence tags include negative/friction/love, negative signals gathered, competitor observations use depth framework, blocked sources noted.

After Phase 4:
```
npx vitest run   # traceability tests pass
```

After all 4 phases: run 2-3 more companies. Compare MK1 Vercel output quality vs MK2 output quality. Only proceed to MK2B if research quality visibly improved.

---

## 14. Immediate Next Step

Start Phase 1: install vitest, extract validate-core.ts, write unit tests.

```
npm install -D vitest
```

---

End of checkpoint.
