# MK1 Complete / MK2 Start — Engineering Handoff

Date: 2026-03-12
Status: MK1 shipped. First real dossier validated. MK2 not started.

---

## 1. What Exists in the Repo

### File inventory (29 files committed to `main` on github.com/fraser-svg/hailmary.git)

```
CLAUDE.md                            # Project constitution (non-negotiable rules, repo landmarks, commands)
README.md                            # Public-facing project overview
package.json                         # v0.1.0, deps: ajv, ajv-formats, tsx, typescript
package-lock.json
tsconfig.json                        # ES2022, NodeNext, strict

docs/specs/
  001-product-thesis.md              # Core thesis: businesses don't know what they sell
  002-dossier-schema.md              # Canonical 15-field dossier structure (pre-evidence extension)
  003-evidence-model.md              # Three-layer model: Source → Evidence → Claim Support
  004-source-priority-and-inference-rules.md  # Five-tier source trust hierarchy
  005-agent-contracts.md             # 7 specialist agents (NOT implemented — collapsed into skill)
  006-skill-contracts.md             # 12 skills across 3 levels (NOT implemented — 1 playbook only)
  007-evaluation-and-acceptance-criteria.md   # 6 evaluation layers, acceptance gates
  008-repository-structure-and-implementation-plan.md  # 10-phase plan, target repo structure

docs/handoffs/
  2026-03-12-company-intelligence-engine-checkpoint.md  # Pre-implementation checkpoint (MK1 plan)

schemas/
  company-dossier.schema.json        # JSON Schema (draft-07) — 16 fields including evidence extension

src/types/
  dossier.ts                         # Full Dossier interface + all nested types (303 lines)
  evidence.ts                        # EvidenceRecord interface + 44-type EvidenceType union + EVIDENCE_TYPES array
  source.ts                          # SourceRecord interface
  index.ts                           # Re-export barrel

src/utils/
  ids.ts                             # makeSourceId(), makeEvidenceId(), makeRunId(), slugify()
  timestamps.ts                      # now() → ISO 8601 string
  enums.ts                           # CONFIDENCE_VALUES array
  empty-dossier.ts                   # createEmptyDossier() + CLI entrypoint
  index.ts                           # Re-export barrel

src/validate.ts                      # CLI validator: schema + evidence links + source links + narrative gaps (314 lines)

.claude/skills/build-company-dossier/
  SKILL.md                           # Playbook skill: 11-step research-to-validation workflow
  references/schema-reference.md     # Quick-reference for all 16 dossier fields
  references/evidence-types.md       # All 44 valid evidence types

.gitignore                           # node_modules/, dist/, runs/, *.tsbuildinfo, .DS_Store
```

### Not in repo (gitignored)
```
runs/vercel/dossier.json             # 1,200+ line Vercel dossier (first real output)
runs/vercel/validation-report.json   # Clean validation: 0 errors, 0 warnings
node_modules/
```

---

## 2. What Was Successfully Built in MK1

MK1 delivered a **complete vertical slice**: input a company name + domain, get a validated machine-readable JSON dossier.

### Specifically built:
- **TypeScript type system** matching Spec 002 + Spec 003 exactly — Dossier, EvidenceRecord, SourceRecord, 44 evidence types, all nested interfaces
- **JSON Schema** (`schemas/company-dossier.schema.json`) with 16 required top-level fields, `$defs` for reusable shapes (confidence, inferred_value, buyer_persona, competitor_entry, source_record, evidence_record)
- **Validator** (`src/validate.ts`) with 8 check layers: JSON parse, schema validation (ajv), evidence ID resolution, source ID resolution, confidence enum check, evidence type vocabulary check, inference labeling check, narrative gap evidence requirements
- **Empty dossier generator** (`src/utils/empty-dossier.ts`) that produces a valid skeleton for testing
- **ID generators** with proper format (`src_001`, `ev_001`, UUID for run_id)
- **Playbook skill** (`.claude/skills/build-company-dossier/SKILL.md`) — 11-step research workflow using WebSearch + WebFetch only (no API keys, no external tools)
- **Reference files** for the skill: schema quick-reference and evidence type vocabulary

### Architectural decisions that shipped:
- **Claude Code IS the orchestrator.** No separate orchestrator script. The SKILL.md guides Claude through research steps.
- **Two-layer separation**: AI (Claude Code + Skill) handles research/analysis/assembly; TypeScript handles validation/types/IDs.
- **0 agent files, 1 skill, 1 schema, 1 validator** — deliberate collapse of the spec's 7 agents / 12 skills / 12 schemas.

---

## 3. What the First Vercel Dossier Run Achieved

### Input
```
/build-company-dossier Vercel vercel.com
```

### Output: `runs/vercel/dossier.json`
- **12 sources** collected (vercel.com homepage, about, pricing, customers; Contrary Research; Trustpilot; G2 snippets; BusinessWire; comparison articles; careers page)
- **46 evidence records** across all 44 evidence type categories used
- **All 10 content sections populated** (not just stubbed — market_and_macro, signals, and strategic_risks all had real content)
- **2 narrative gaps identified** at medium confidence:
  1. "AI Cloud emphasis vs deployment simplicity reality" — company says "The AI Cloud"; customers say "easy git push deploys"
  2. "Enterprise trust claims vs operational friction" — company says "99.99% SLA"; Trustpilot shows 1.8/5 stars on billing/support
- **3 hidden differentiators surfaced**: preview URLs as collaboration tool, developer happiness as retention lever, build time compression as conversion driver
- **Revenue trajectory captured**: $1M (2019) → $200M ARR (May 2025), v0 at $180M+
- **Competitor landscape**: Netlify, Cloudflare Pages (direct), AWS Amplify, Render, Fly.io (adjacent), DigitalOcean (substitute)

### Research efficiency
- 8 WebSearch calls, 5 WebFetch calls (some failed with 403 — G2, Wikipedia)
- Total research + assembly time: ~15 minutes in a single Claude Code session

---

## 4. Validation Status — What Passed

```
Validation Report for: runs/vercel/dossier.json
──────────────────────────────────────────────────
Valid:            YES
Schema valid:     YES
Evidence links:   YES
Source links:     YES
Sources:          12
Evidence records: 46
Sections populated: 10 / 10
Evidence refs:    46/46 resolved
Source refs:      11/11 resolved
Errors:           0
Warnings:         0
```

All 8 validation layers passed clean:
1. JSON parse — valid
2. Schema validation (ajv against `schemas/company-dossier.schema.json`) — valid
3. Evidence ID resolution — all 46 referenced IDs resolve to evidence records
4. Source ID resolution — all 11 unique source_ids in evidence records resolve to source records
5. Confidence enum — all values are `low`/`medium`/`high`
6. Evidence type vocabulary — all 46 records use valid types from controlled vocabulary
7. Inference labeling — no warnings (inferred items have evidence_ids)
8. Narrative gap evidence — both gaps have >=1 company_language, >=2 customer_language, evidence_ids present

---

## 5. Key Strengths of MK1

1. **The vertical slice works end-to-end.** Input → research → evidence collection → dossier assembly → validation — the full pipeline runs in a single Claude Code session.
2. **Evidence integrity is real, not decorative.** Every claim links to evidence, every evidence record links to a source. The validator enforces this mechanically.
3. **Narrative intelligence produces actionable insights.** The Vercel run identified genuinely interesting gaps (AI positioning vs deployment simplicity; enterprise claims vs billing friction) that would be useful for positioning work.
4. **Schema + types + validator are tightly aligned.** TypeScript types, JSON Schema, and the validator all describe the same contract. Changes to one will immediately surface as failures in the others.
5. **The skill-based architecture is right for V1.** One playbook skill with reference files is dramatically simpler than 7 agents + 12 skills while producing equivalent output quality.
6. **All 10 content sections populated.** Even sections planned as stubs (market_and_macro, signals, strategic_risks) shipped with real content because the research naturally surfaced relevant data.

---

## 6. Key Weaknesses and Trust Risks

### Weaknesses
1. **No repeatability evidence.** Only 1 company run completed. Unknown whether the skill produces consistent quality across different company types (B2B SaaS, services, hardware, pre-revenue startups).
2. **No unit tests.** Zero test files exist. The validator is the only quality gate. Utility functions (IDs, slugify, empty dossier) are untested.
3. **WebFetch is unreliable.** Multiple 403s in the Vercel run (G2, Wikipedia). The skill has no fallback strategy — it just works with whatever data it gets.
4. **Confidence scoring is manual.** The skill instructions say "assess confidence" but the AI must assign values without any mechanical calibration. Confidence could vary wildly between runs.
5. **No contradiction detection.** The validator checks for structural integrity but cannot detect conflicting claims within the dossier (e.g., two evidence records making opposite assertions about the same fact).
6. **Narrative gap quality depends entirely on prompt quality.** The SKILL.md warns against fabricating gaps and requires minimum evidence thresholds, but there's no mechanical check that gaps are genuinely strategic (vs. semantic trivia).
7. **No scorecard or quality rubric.** Spec 007 defines a 21-dimension quality rubric. None of it is implemented.

### Trust risks
- **Single-source revenue claims.** v0 revenue ($100M→$180M) comes from Contrary Research only. Contrary is Tier 4 (secondary synthesis). This should be `"confidence": "low"` but was set to `"medium"`.
- **Trustpilot vs G2 contradiction.** G2 gives Vercel 4.6/5; Trustpilot gives 1.8/5. The dossier notes this in `conflicting_evidence` but doesn't resolve it mechanically.
- **Inferred personas.** All buyer/user personas are `is_inferred: true` — reasonable but noted. No direct buyer interview data exists in public sources.

---

## 7. Senior-Engineer Review Conclusions

A senior-engineer review of MK1 would conclude:

### Ship-worthy
- The type system and schema are well-designed and consistent
- The validator is serious (8 check layers, narrative gap enforcement)
- The evidence-linking discipline is the product's real moat — most competitive tools skip this entirely
- The two-layer architecture (AI does research, code does validation) is the right separation

### Not yet production-grade
- Zero automated tests — any refactor is flying blind
- No regression baseline — no way to tell if Run 2 is better or worse than Run 1
- Confidence calibration is entirely vibes-based
- The skill is a 300+ line prompt — it works but is fragile to model behavior changes
- No error recovery in the skill workflow — if WebFetch fails, the skill just skips that data

### Critical gap
- **The system cannot evaluate itself.** Spec 007 defines a comprehensive quality framework, but none of it is implemented. There is no scorecard, no benchmark suite, no regression test. MK2 must add self-evaluation before adding more intelligence.

---

## 8. Current Architecture Decision

### What shipped
```
User → /build-company-dossier <name> <domain>
  → SKILL.md loads (playbook instructions)
  → Claude Code executes research steps (WebSearch + WebFetch)
  → Claude assembles dossier JSON following schema contract
  → Claude writes runs/<slug>/dossier.json
  → Claude runs: npx tsx src/validate.ts runs/<slug>/dossier.json
  → Validation report written alongside dossier
```

### Two-layer separation
| Layer | Responsibility | Files |
|-------|---------------|-------|
| AI (Claude + Skill) | Web research, evidence extraction, narrative analysis, dossier assembly | `.claude/skills/build-company-dossier/SKILL.md` + references |
| Code (TypeScript) | Schema validation, evidence-link checking, ID generation, empty dossier templates | `src/validate.ts`, `src/utils/*.ts`, `src/types/*.ts` |

### What this means
- Claude Code IS the orchestrator. There is no `run-company-research.ts` script.
- The `src/` directory is pure deterministic tooling — validation, types, utilities.
- All intelligence (research, extraction, analysis) lives in the SKILL.md prompt.
- This is intentionally simpler than the spec's 10-phase plan. The full architecture can be factored out later.

---

## 9. The Decision to Keep Evidence Inside dossier.json

### Decision: Option A — evidence stored as top-level array inside dossier.json

This was the open technical question from the pre-implementation checkpoint. The decision was:

**Add `evidence` as the 16th top-level field in `dossier.json`.** This deviates from Spec 002 (which defines only 15 fields and never specifies where evidence records live), but:

1. Makes the dossier self-contained — one file to validate, debug, share, and feed to downstream AI
2. Follows the same pattern as the existing `sources` array (Spec 002 §15)
3. Fills an acknowledged gap in Spec 002 — `evidence_ids` are referenced throughout but no storage location was defined
4. Simplifies validation — no cross-file reference resolution needed
5. All three implementation artifacts agree: TypeScript types define it, JSON Schema requires it, validator checks it

### Files that encode this decision
- `schemas/company-dossier.schema.json` — `evidence` in `required` array and `properties`
- `src/types/dossier.ts:302` — `evidence: EvidenceRecord[]` with comment `// V1 extension — see CLAUDE.md`
- `src/utils/empty-dossier.ts:163` — `evidence: []` in skeleton
- `src/validate.ts:139` — evidence array used for ID resolution
- `CLAUDE.md` — documents V1 adds a 16th field: `evidence`

### DO NOT revisit this decision casually. All 5 files would need coordinated changes.

---

## 10. What Was Deferred

These items were explicitly cut from MK1. They are not forgotten — they are backlog.

| Item | Why deferred | MK2 priority? |
|------|-------------|---------------|
| Second company run (repeatability test) | First run was the priority | **YES — first MK2 action** |
| Unit tests for utilities | No test framework set up | **YES** |
| Benchmark suite (10 companies) | 1 company sufficient for MK1 | Medium |
| Scorecard generator | Schema validation sufficient for MK1 | Medium |
| Quality rubric (Spec 007) | Not blocking vertical slice | Medium |
| Contradiction detector | Empty array for now | Low |
| Source tier classifier code | Hardcoded in skill prompt | Low |
| Recency weighting logic | Handled by skill prompt | Low |
| Evidence deduplication | Unlikely to matter at current scale | Low |
| Separate agent `.md` files | Collapsed into skill | Not needed yet |
| Full 12-skill library | 1 playbook sufficient | Not needed yet |
| Collector modules (`collect-*.ts`) | Claude does collection directly | Not needed yet |
| Architecture docs (`/docs/architecture/`) | Not blocking | Low |
| Decision records (`/docs/decisions/`) | Can document retroactively | Low |
| Raw capture storage | Only normalized evidence kept | Low |
| Multiple tool providers (Exa, Firecrawl) | WebSearch/WebFetch sufficient | Future |
| Regression testing framework | No baseline yet | After benchmark suite |

---

## 11. Exact MK2 Priorities

### P0 — Must do (trust and repeatability)
1. **Run 2-3 more companies** to prove repeatability across company types (suggest: a services company, a pre-Series-A startup, an enterprise B2B)
2. **Add unit tests** for `src/validate.ts`, `src/utils/ids.ts`, `src/utils/empty-dossier.ts`
3. **Fix confidence calibration** — single-source claims should not be medium confidence; add a mechanical rule (single-source = low max)

### P1 — Should do (quality infrastructure)
4. **Build a scorecard generator** that evaluates a dossier against the quality rubric from Spec 007 (21 dimensions, 0-3 scoring)
5. **Create benchmark fixtures** — save 3-5 validated dossiers as golden files for regression comparison
6. **Add WebFetch fallback strategy** to the skill — when a page returns 403, search for cached/archived versions or alternative sources
7. **Improve narrative gap validation** — add a mechanical check that company_language and customer_language excerpts actually appear in the referenced evidence records

### P2 — Nice to have (capability expansion)
8. **Add contradiction detection** — flag when two evidence records make opposing claims about the same fact
9. **Improve market_and_macro section** — currently populated from general knowledge rather than Vercel-specific evidence
10. **Add source tier classification** — move trust hierarchy from skill prompt into code so it can be validated

---

## 12. Recommended Implementation Order for MK2

```
Week 1: Trust and Repeatability
  1. Run /build-company-dossier for 2-3 more companies
  2. Compare outputs: schema pass rate, evidence count, section quality
  3. Fix any skill instructions that fail on non-tech companies
  4. Save validated dossiers as golden files in tests/goldens/

Week 2: Testing Foundation
  5. Add vitest or node:test as test framework
  6. Write unit tests for: ids.ts, slugify, empty-dossier generation
  7. Write integration tests for: validate.ts (feed known-good and known-bad dossiers)
  8. Add confidence calibration rule: single-source evidence → max "low" confidence

Week 3: Quality Infrastructure
  9. Build scorecard generator (Spec 007 rubric)
  10. Add golden-file regression test: run scorecard on saved dossiers, compare to baseline
  11. Improve narrative gap mechanical validation
  12. Add WebFetch fallback strategy to SKILL.md

Week 4: Polish
  13. Add contradiction detection (warning-level, not blocking)
  14. Source tier classifier in code
  15. Update handoff document for MK2 completion
```

---

## 13. "Do Not Drift" Warnings

These are things a future Claude session might be tempted to do that would waste time or break the product:

1. **Do not refactor into multi-agent architecture yet.** The single-skill approach works. Adding 7 separate agent files before proving repeatability across 5+ companies is premature complexity. The specs describe a target state, not a requirement for MK2.

2. **Do not add external tools (Exa, Firecrawl, Puppeteer) yet.** WebSearch + WebFetch are sufficient. The limiting factor is output quality, not research breadth. Fix the skill prompt before adding tools.

3. **Do not build a dashboard or human-facing report.** The dossier is for downstream AI. Human readability is not a goal. If someone asks for "a nicer output," point them to the downstream consumption layer (which doesn't exist yet and is out of scope).

4. **Do not split the schema into 12 files.** Spec 008 suggests separate schema files per section. The single `company-dossier.schema.json` is working and validated. Split only if the file becomes unmanageable (it's 473 lines — fine).

5. **Do not treat passing validation as proof of quality.** Validation confirms structural integrity. It does NOT confirm that the narrative gaps are insightful, that the evidence excerpts are accurate, or that the confidence levels are calibrated. MK2 needs a quality rubric, not just schema checks.

6. **Do not invent new dossier fields.** The 16-field schema is stable. Any new field requires updating: JSON Schema, TypeScript types, validator, empty dossier generator, and SKILL.md references. Five-file change for every new field.

7. **Do not let the skill grow past ~400 lines.** The SKILL.md is already dense. If it needs more instructions, factor them into `references/` files that the skill can reference. The skill body should stay navigable.

8. **Do not skip reading Spec 002, 003, and 007 before any MK2 implementation session.** These are the source of truth for schema, evidence model, and evaluation criteria respectively.

9. **Do not confuse company copy with customer truth.** This is the product's core thesis. Every MK2 change must preserve the separation between company-claimed value and customer-expressed value. They are different evidence types from different source tiers.

10. **Do not commit dossier outputs to git.** `runs/` is gitignored. Dossiers contain research data that changes between runs. Golden files for testing go in `tests/goldens/` (to be created).

---

## 14. Immediate Next Step

**Run `/build-company-dossier` for a non-tech-SaaS company** (e.g., a B2B services firm or a hardware company) to test whether the skill generalizes beyond the Vercel archetype.

Suggested command:
```
/build-company-dossier Linear linear.app
```
or for a harder test:
```
/build-company-dossier Gong gong.io
```

After the second run, compare:
- Did validation pass clean?
- Were all 10 content sections populated?
- Did narrative gaps have sufficient evidence (>=1 company + >=2 customer)?
- Did the skill handle missing data gracefully (low confidence, explicit missing_data entries)?

If the second run validates clean, proceed to unit tests. If it fails, fix the skill instructions first.

---

## Key Preserved Decisions (Summary)

| Decision | Status | Impact if forgotten |
|----------|--------|-------------------|
| Evidence lives inside dossier.json as 16th field | **Shipped, locked in 5 files** | 5-file coordinated change to reverse |
| Claude Code is the orchestrator (no separate script) | **Shipped** | Architecture would need rethinking |
| Single playbook skill replaces 7 agents + 12 skills | **Shipped, working** | Premature decomposition wastes time |
| WebSearch + WebFetch only (no API keys) | **Shipped** | Adding tools requires testing + fallback logic |
| TypeScript is for deterministic work only | **Shipped** | Putting AI logic in TS breaks the two-layer model |
| Narrative gap requires >=1 company + >=2 customer evidence | **Validated mechanically** | Weakening this threshold undermines the core thesis |
| Confidence enum is low/medium/high only | **Schema-enforced** | Adding numeric scores requires schema + validator changes |
| `runs/` is gitignored; golden files go in `tests/goldens/` | **Gitignore set** | Committing runs pollutes the repo |

---

End of handoff.
