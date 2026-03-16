# Spec 008 — Counter-Narrative Acquisition

**Status:** DRAFT — reviewed and approved via plan-ceo-review (2026-03-16)

---

## 1. Purpose

The V4 synthesis layer requires counter-narrative evidence to construct credible,
tension-driven arguments. Phase 3 evals showed `counter_narrative = 0` across all
three live company runs (Trigger.dev, Omnea, Gendo), causing V4 to fall back to the
V3 template in every case.

**Root cause:** The existing 8 Perplexity query families (`buildQueryMap()`) target
reviews, press, competitors, funding, LinkedIn, and community discussions using
funding-focused query strings. None explicitly surface complaints, friction, or
contradictions between a company's marketing narrative and real-world user experience.

The `counter_narrative` role assignment in `build-evidence-pack.ts` already works
correctly — it fires whenever Tier-1 company-claim evidence AND Tier-3
customer-signal evidence coexist in the evidence pack. The problem is purely an
absence of Tier-3 negative evidence entering the dossier.

**This spec extends the acquisition layer to intentionally retrieve counter-narrative
evidence.** No new pipeline stages. No redesign. Additive only.

---

## 2. Scope

### In scope

- 5 new counter-narrative query families added to `buildQueryMap()` in `external-research.ts`
- 5 new `ExternalSourceType` values in `research-corpus.ts`
- Corresponding entries in `EXTERNAL_SOURCE_EVIDENCE_TYPE` map in `corpus-to-dossier.ts`
- `tagFrictionSignals()` pure function exported from `corpus-to-dossier.ts`
- Evidence records tagged with `friction`, `complaint`, `contradiction` tags from CN sources
- `negative_signal_depth` calculation fixed in `computeEvidenceSummary()` (was hardcoded `'none'`)
- 20-second best-effort budget for CN query batch with `WARN_COUNTER_NARRATIVE_TIMEOUT`
- `WARN_COUNTER_NARRATIVE_SPARSE` warning when all 5 CN source types return 0 accepted sources
- `counter_narrative` sub-block added to `AcquisitionQualityReport.perplexity`
- Unit and integration tests for all new codepaths

### Non-goals

- Routing Reddit/HN sources to `community_mentions[]` (deferred — see TODOS.md P3)
- Populating `narrative_intelligence.negative_signals[]` (deferred — see TODOS.md P2)
- `AcquisitionQueryPlanner` / archetype-aware query selection (deferred per Spec 005)
- ML/LLM classifier replacing keyword tagger (future milestone)
- GitHub Issues direct API (search snippets via Perplexity are sufficient)
- Any change to V2 reasoning spine, memo layer, or evidence pack scoring logic

---

## 3. Pipeline Insertion Point

Counter-narrative queries are added as new entries in the **existing** `buildQueryMap()`
function in `external-research.ts`. They flow through the identical path as all current
external sources:

```
buildQueryMap() [EXTENDED: +5 CN query families]
        │
        ▼
ExternalResearchProvider.search()  [unchanged]
        │
        ▼
filterExternalSources()            [unchanged — company-match filter applies]
        │
        ▼
ExternalCorpus.sources[]           [CN sources live here, not community_mentions[]]
        │
        ▼
mergeResearchCorpus() → tier-classify → dedup  [unchanged]
        │
        ▼
corpusToDossierAdapter()           [EXTENDED: new source types + tagFrictionSignals()]
        │
        ▼
EvidenceRecord[] with friction/complaint/contradiction tags
        │
        ▼
buildEvidencePack() → counter_narrative role fires  [unchanged — already correct]
```

**Why `external_sources[]`, not `community_mentions[]`:** `corpusToDossierAdapter()`
iterates only `corpus.site_pages[]` and `corpus.external_sources[]` when assembling
`EvidenceRecord[]`. The `community_mentions[]` bucket is declared in `ResearchCorpus`
but is never processed by the adapter. Routing CN sources there would silently orphan
them before they reach `dossier.evidence[]`. The P3 TODO in `TODOS.md` tracks the
follow-up migration.

---

## 4. Integration with Existing Acquisition Stages

### V3-U1 (siteCorpusAcquisition)
No changes.

### V3-U2 (externalResearchAcquisition) — MODIFIED
`buildQueryMap()` extended with 5 CN query families (see Section 6).
`fetchFromProvider()` gains a wall-clock budget check for the CN batch (see Section 12).
`WARN_COUNTER_NARRATIVE_TIMEOUT` emitted when budget exceeded.
`WARN_COUNTER_NARRATIVE_SPARSE` emitted when all CN source types return 0 accepted sources.

### V3-U3 (mergeResearchCorpus)
No changes. CN sources are `ExternalSource` objects — dedup and tier classification
apply identically to existing external sources.

### V3-U4 (corpusToDossierAdapter) — MODIFIED
`EXTERNAL_SOURCE_EVIDENCE_TYPE` map extended with 5 new source type entries.
`tagFrictionSignals()` called from `externalSourceEvidenceRecord()` to append
friction/complaint/contradiction tags.
`negative_signal_depth` in `computeEvidenceSummary()` computed from evidence records
rather than hardcoded to `'none'`.

### V3-M1 (buildEvidencePack)
No changes. The `counter_narrative` role assignment at lines 369–384 already fires
correctly when Tier-3 customer-signal evidence is present alongside Tier-1 company
claims. This plan supplies the missing Tier-3 evidence.

---

## 5. Query Strategy Changes

### New query families in `buildQueryMap()`

Counter-narrative queries use the domain as primary anchor (same disambiguation
strategy as existing review queries — domain is a unique identifier, preventing
generic keyword collisions).

The CN query batch runs within the same `for` loop as standard queries, with a
dedicated wall-clock budget (see Section 12). Queries are appended after all
standard queries in `buildQueryMap()`, so standard acquisition is not affected
if the CN budget is exceeded.

**Existing queries (unchanged, 8 families):**

| ExternalSourceType | Query template |
|---|---|
| `review_trustpilot` | `"${domain}" reviews site:trustpilot.com` |
| `review_g2_snippet` | `"${domain}" reviews site:g2.com` |
| `review_capterra_snippet` | `"${domain}" reviews site:capterra.com` |
| `press_mention` | `"${company}" "${domain}" news announcement` |
| `competitor_search_snippet` | `"${company}" "${domain}" competitors alternatives vs` |
| `funding_announcement` | `"${company}" "${domain}" funding investment round` |
| `linkedin_snippet` | `"${company}" "${domain}" linkedin` |
| `investor_mention` | `"${company}" "${domain}" investors ycombinator crunchbase` |

**New counter-narrative queries (5 families, appended last):**

| ExternalSourceType | Query template | `search_recency_filter` |
|---|---|---|
| `reddit_thread` | `"${domain}" (complaints OR problems OR issues OR disappointed) site:reddit.com` | `"year"` |
| `hackernews_thread` | `"${domain}" site:news.ycombinator.com` | `"year"` |
| `github_issues_snippet` | `"${domain}" (issues OR bugs OR broken) site:github.com` | none |
| `comparison_article` | `"${company}" "${domain}" vs alternatives -site:${domain}` | none |
| `critical_review` | `"${domain}" (disappointed OR "doesn't work" OR avoid OR broken) review` | `"year"` |

**Total queries per run: 13** (up from 8).

**Disambiguation notes:**
- All CN queries use `"${domain}"` as primary anchor. Domain strings like `"trigger.dev"`
  are globally unique and prevent false positives from generic company name keywords.
- `reddit_thread` and `critical_review` queries use `OR`-grouped complaint signals so the
  query is broad enough to find real friction without over-constraining on one term.
- `hackernews_thread` intentionally omits complaint signals — HN discussions mix praise
  and criticism; all HN results are valuable and the tagger will classify sentiment.
- `comparison_article` uses `-site:${domain}` to exclude the company's own comparison pages.
- `github_issues_snippet` targets the company's own issues or third-party integration problems.

---

## 6. New Source Types

Add to `ExternalSourceType` union in `research-corpus.ts`:

```typescript
export type ExternalSourceType =
  | "review_trustpilot"
  | "review_g2_snippet"
  | "review_capterra_snippet"
  | "press_mention"
  | "competitor_search_snippet"
  | "funding_announcement"
  | "linkedin_snippet"
  | "investor_mention"
  // Counter-narrative sources (Spec 008)
  | "reddit_thread"
  | "hackernews_thread"
  | "github_issues_snippet"
  | "comparison_article"
  | "critical_review";
```

**Source tier assignment** (via existing `tier-classifier.ts`, unchanged):

| ExternalSourceType | Hostname | Tier assigned |
|---|---|---|
| `reddit_thread` | `reddit.com` | 3 |
| `hackernews_thread` | `news.ycombinator.com` | 3 |
| `github_issues_snippet` | `github.com` | 4 (no classifier rule exists; defaults to 4) |
| `comparison_article` | varies | 3–4 (depends on publisher) |
| `critical_review` | varies | 3–4 (depends on publisher) |

Note: `github.com` is Tier 4 per the classifier's default (no explicit rule). GitHub
issues are still valuable for friction signals — `scoreCustomerVoice(4) = 1` in the
evidence pack scorer, which is sufficient to contribute to the `counter_narrative` role
when combined with Tier-3 sources.

**Evidence type mapping** — add to `EXTERNAL_SOURCE_EVIDENCE_TYPE` in `corpus-to-dossier.ts`:

```typescript
const EXTERNAL_SOURCE_EVIDENCE_TYPE: Record<ExternalSourceType, EvidenceType> = {
  // ... existing entries ...
  reddit_thread:           "pain_point_record",
  hackernews_thread:       "customer_language_record",
  github_issues_snippet:   "pain_point_record",
  comparison_article:      "comparison_record",
  critical_review:         "review_record",
};
```

`Record<ExternalSourceType, EvidenceType>` — TypeScript will produce a compile error
if any new source type is missing from this map. This is the enforcement mechanism.

---

## 7. Evidence Tagging Rules

### `tagFrictionSignals(excerpt, sourceType)` — new exported pure function

```typescript
/**
 * Classify an evidence excerpt for friction/complaint/contradiction signals.
 * Returns zero or more tag strings to append to the evidence record's tags array.
 *
 * Rules:
 *   - Case-insensitive substring matching on excerpt
 *   - Multiple tags may be returned (e.g. friction + complaint)
 *   - Returns [] on empty excerpt (safe, no throw)
 *   - Pure function — deterministic, no LLM, no side effects
 *   - NEVER modifies the excerpt itself (AI contamination rule)
 */
export function tagFrictionSignals(
  excerpt: string,
  sourceType: ExternalSourceType,
): string[];
```

**Tag: `friction`** — product limitations, deployment pain, usability issues

Trigger keywords (case-insensitive, any one match):
```
"slow", "broken", "doesn't work", "hard to", "difficult", "painful", "janky",
"fails", "error", "bug", "crashes", "unstable", "unreliable", "confusing",
"clunky", "cumbersome", "frustrating to use", "poor documentation",
"steep learning curve", "setup is", "hard to set up", "complex to"
```

**Tag: `complaint`** — buyer disappointment, unmet expectations

Trigger keywords:
```
"disappointed", "frustrated", "waste", "regret", "avoid", "terrible", "awful",
"worst", "not worth", "switched away", "cancelled", "churned", "left for",
"moved to", "went back to", "not recommended", "stay away", "overpriced",
"poor support", "no support", "ignored our"
```

**Tag: `contradiction`** — gap between marketing claims and reality

Trigger keywords:
```
"claims", "but actually", "marketed as", "vs reality", "in practice",
"supposed to", "advertised as", "promised", "reality is", "truth is",
"misleading", "overstated", "doesn't actually", "in theory", "on paper"
```

**Tag: `buyer_disappointment`** — combination signal; applied when BOTH `complaint`
AND `friction` tags are present on the same record (computed after tagging, no
additional keyword scan needed).

**Source-type-based base tags** (appended regardless of keyword matches):

| ExternalSourceType | Base tag(s) |
|---|---|
| `reddit_thread` | `"community_voice"`, `"buyer_language"` |
| `hackernews_thread` | `"community_voice"`, `"developer_voice"` |
| `github_issues_snippet` | `"developer_voice"`, `"product_friction"` |
| `comparison_article` | `"competitor_positioning"`, `"buyer_language"` |
| `critical_review` | `"customer_voice"`, `"buyer_language"` |

These base tags are additive with friction/complaint/contradiction tags.
A Reddit thread about product friction would have tags:
`["reddit_thread", "community_voice", "buyer_language", "friction"]`

---

## 8. Memo Role Assignment for counter_narrative

**No changes to `build-evidence-pack.ts`.** The existing `assignRoles()` logic at
lines 369–384 already assigns `counter_narrative` when:

```typescript
const hasCompanyClaim = selected.some(
  sr => COMPANY_CLAIM_TYPES.has(sr.ev.evidence_type) && sr.sourceTier === 1
);
const hasCustomerSignal = selected.some(
  sr => CUSTOMER_SIGNAL_TYPES.has(sr.ev.evidence_type) || sr.sourceTier === 3
);
if (hasCompanyClaim && hasCustomerSignal) { /* assign counter_narrative */ }
```

New `reddit_thread` and `hackernews_thread` sources receive `sourceTier === 3` from
the tier classifier, satisfying `hasCustomerSignal`. Site pages are already Tier-1
company claims, satisfying `hasCompanyClaim`. The role fires automatically.

New `pain_point_record` and `customer_language_record` evidence types are in
`CUSTOMER_SIGNAL_TYPES` (already includes `pain_point_record`). Add
`customer_language_record` to `CUSTOMER_SIGNAL_TYPES` if not already present
(verify at implementation time).

---

## 9. TypeScript Interface Contracts

### `research-corpus.ts`

```typescript
// ExternalSourceType union — add 5 new values (see Section 6)
export type ExternalSourceType = /* ... existing ... */
  | "reddit_thread"
  | "hackernews_thread"
  | "github_issues_snippet"
  | "comparison_article"
  | "critical_review";

// No other type changes required.
// ExternalSource, CorpusPage, ResearchCorpus — unchanged.
```

### `acquisition-quality.ts`

```typescript
export interface AcquisitionQualityReport {
  // ... existing fields unchanged ...

  perplexity: {
    queries_attempted: number;
    queries_success: number;
    results_raw: number;
    results_after_dedup: number;
    secondary_fetches_attempted: number;
    secondary_fetches_success: number;
    duration_ms: number;

    // NEW (Spec 008): counter-narrative acquisition metrics
    counter_narrative: {
      queries_attempted: number;    // Always 5 when CN queries are run
      queries_success: number;      // CN queries returning ≥ 1 accepted source
      sources_acquired: number;     // Total CN sources after company-match filter
      budget_exceeded: boolean;     // true if WARN_COUNTER_NARRATIVE_TIMEOUT fired
    };
  };
}
```

### `corpus-to-dossier.ts`

```typescript
// New exported function:
export function tagFrictionSignals(
  excerpt: string,
  sourceType: ExternalSourceType,
): string[];

// Updated map (must cover all 13 ExternalSourceType values):
const EXTERNAL_SOURCE_EVIDENCE_TYPE: Record<ExternalSourceType, EvidenceType>;

// Updated calculation (no longer 'none' as const):
negative_signal_depth: computeNegativeSignalDepth(evidence),
// where computeNegativeSignalDepth counts records with friction/complaint tags
// and maps count → 'none' | 'thin' | 'moderate' | 'rich' (same pattern as
// customer_voice_depth)
```

### `external-research.ts`

```typescript
// Updated pure function — 13 entries instead of 8:
export function buildQueryMap(
  company: string,
  domain: string,
): Array<[ExternalSourceType, string]>;

// Updated SOURCE_TYPE_PRIORITY — new CN types appended:
const SOURCE_TYPE_PRIORITY: ExternalSourceType[] = [
  // ... existing 8 ...
  'reddit_thread',
  'hackernews_thread',
  'github_issues_snippet',
  'comparison_article',
  'critical_review',
];
```

---

## 10. Schema Changes

**No JSON schema changes required.** `ExternalSourceType` is a TypeScript-level
type, not part of the `company-dossier.schema.json` JSON Schema. The new source types
produce `EvidenceRecord` and `SourceRecord` objects that conform to the existing schema.

The only observable schema-adjacent change: `EvidenceRecord.tags[]` will contain new
string values (`friction`, `complaint`, `contradiction`, `buyer_disappointment`,
`community_voice`, `developer_voice`, `product_friction`). Tags are untyped
`string[]` in the schema — no schema update needed.

---

## 11. Test Plan

### Unit tests

**`external-research-queries.test.ts`** (extend existing file):
- `buildQueryMap("Trigger.dev", "trigger.dev")` returns 13 entries
- All 5 CN source types present in returned array
- CN query for `reddit_thread` contains `site:reddit.com` and `"trigger.dev"`
- CN query for `comparison_article` contains `-site:trigger.dev`
- `hackernews_thread` query contains `site:news.ycombinator.com`

**`tag-friction-signals.test.ts`** (new file):
- Empty excerpt → `[]` (no throw)
- Excerpt `"this product is broken and frustrating"` → `["friction"]`
- Excerpt `"I'm so disappointed, I regret buying this"` → `["complaint"]`
- Excerpt `"they claim X but actually Y"` → `["contradiction"]`
- Excerpt `"broken and disappointed"` → `["friction", "complaint", "buyer_disappointment"]`
- Multi-tag: `"slow, broken, disappointed"` → includes `friction`, `complaint`, `buyer_disappointment`
- No false positive: `"fast, reliable, works great"` → `[]`
- Case insensitive: `"BROKEN API"` → `["friction"]`
- Excerpt containing only whitespace → `[]`

**`corpus-to-dossier.test.ts`** (extend existing, or `acquisition.test.ts`):
- `reddit_thread` ExternalSource → `EvidenceRecord` with `evidence_type: "pain_point_record"`
- `hackernews_thread` ExternalSource → `evidence_type: "customer_language_record"`
- `comparison_article` ExternalSource → `evidence_type: "comparison_record"`
- `critical_review` ExternalSource → `evidence_type: "review_record"`
- `reddit_thread` source with friction keyword in excerpt → tags include `"friction"`
- `reddit_thread` source with no friction keywords → tags include base tags only
- `negative_signal_depth` = `"none"` when 0 friction-tagged records
- `negative_signal_depth` = `"thin"` when 1–2 friction-tagged records
- `negative_signal_depth` = `"moderate"` when 3–5 friction-tagged records
- `negative_signal_depth` = `"rich"` when ≥ 6 friction-tagged records

**`acquisition.test.ts`** (extend existing):
- `WARN_COUNTER_NARRATIVE_TIMEOUT` emitted when CN batch wall-clock > 20s (mock slow provider)
- `WARN_COUNTER_NARRATIVE_SPARSE` emitted when all 5 CN queries return 0 accepted sources
- CN budget check: remaining CN queries skipped after timeout; standard query results unaffected
- `AcquisitionQualityReport.perplexity.counter_narrative.budget_exceeded = true` when timeout fires
- `AcquisitionQualityReport.perplexity.counter_narrative.sources_acquired = N` matches actual CN sources

### Integration test (new)

**`counter-narrative-integration.test.ts`** (new file):

```typescript
/**
 * End-to-end regression guard: counter-narrative source in corpus
 * → counter_narrative_count >= 1 in EvidencePack.
 *
 * This test is the canonical signal that the counter-narrative feature works.
 * If counter_narrative_count drops to 0, this test will fail before it ships.
 */
it("counter_narrative_count >= 1 when reddit_thread source present in corpus", async () => {
  // 1. Build minimal ResearchCorpus with:
  //    - one homepage CorpusPage (Tier 1, company claim)
  //    - one reddit_thread ExternalSource with friction keyword in excerpt (Tier 3)
  // 2. corpusToDossierAdapter() → Dossier
  // 3. buildEvidencePack() with stub V2 result (diagnosis referencing both evidence IDs)
  // 4. Assert: pack.pack_quality.counter_narrative_count >= 1
  // 5. Assert: at least one PackRecord has memo_roles including "counter_narrative"
});
```

### TypeScript compile check

No additional test needed. `Record<ExternalSourceType, EvidenceType>` on
`EXTERNAL_SOURCE_EVIDENCE_TYPE` ensures missing entries are caught at `tsc --noEmit`.

---

## 12. Failure Modes and Fallback Behaviour

### Wall-clock budget for CN query batch

CN queries are appended last in `buildQueryMap()`. In `fetchFromProvider()`:

```typescript
const CN_SOURCE_TYPES = new Set<ExternalSourceType>([
  'reddit_thread', 'hackernews_thread', 'github_issues_snippet',
  'comparison_article', 'critical_review',
]);
const CN_BUDGET_MS = 20_000;

let cnBatchStart: number | null = null;

for (const [sourceType, query] of queryMap) {
  // Start tracking when first CN query begins
  if (CN_SOURCE_TYPES.has(sourceType) && cnBatchStart === null) {
    cnBatchStart = Date.now();
  }

  // Budget check before each CN query
  if (CN_SOURCE_TYPES.has(sourceType) && cnBatchStart !== null) {
    if (Date.now() - cnBatchStart > CN_BUDGET_MS) {
      console.warn('WARN_COUNTER_NARRATIVE_TIMEOUT: CN query budget (20s) exceeded, skipping remaining CN queries');
      break;
    }
  }

  // ... existing per-query try/catch (unchanged) ...
}
```

After the loop, check if all 5 CN types returned 0 accepted sources:

```typescript
const cnTypesSuccessful = sourceTypesSuccessful.filter(t => CN_SOURCE_TYPES.has(t));
if (cnTypesSuccessful.length === 0) {
  console.warn('WARN_COUNTER_NARRATIVE_SPARSE: all counter-narrative query types returned 0 accepted sources');
}
```

### Failure mode registry

| Codepath | Failure | Rescued? | Logged? | Pipeline aborts? |
|---|---|---|---|---|
| CN query → provider timeout | Y | WARN_EXTERNAL_RESEARCH_SPARSE | No |
| CN query → HTTP 429 | Y | WARN_PERPLEXITY_RATE_LIMIT | No |
| CN batch → 20s budget exceeded | Y | WARN_COUNTER_NARRATIVE_TIMEOUT | No |
| All CN types → 0 results | Y | WARN_COUNTER_NARRATIVE_SPARSE | No |
| tagFrictionSignals → empty excerpt | Y (returns []) | No | No |
| ev.tags undefined in depth calc | Y (guard: `ev.tags ?? []`) | No | No |
| New source type missing from map | Y (TypeScript compile error) | Build fails | Yes (correct) |

**No CRITICAL GAPS.** All failure modes are non-fatal and logged.

---

## 13. Cost and Latency Limits

### Latency

| Scenario | Latency impact |
|---|---|
| All CN queries return results quickly | +~5s to Perplexity phase (5 queries × 1s avg) |
| Typical (mixed success) | +~10–15s |
| Worst case (all CN queries hit 8s timeout) | Capped at 20s by CN budget |
| CN budget exceeded | Remaining CN queries skipped; total latency ≤ (prev + 20s) |

Standard queries (8) complete first. CN queries then run within their 20s budget.
Since V3-U1 (Cloudflare) and V3-U2 (Perplexity) run in parallel (`Promise.all`),
and Cloudflare typically takes 10–30s for 10 pages, the CN query overhead is
largely absorbed by the parallel window.

**Total acquisition budget:** unchanged at 45s target / 60s hard cap.

### Cost

Perplexity `sonar` model, estimated $0.001–0.005 per query:

| Queries | Estimated cost per run |
|---|---|
| 8 (before) | ~$0.008–0.040 |
| 13 (after) | ~$0.013–0.065 |
| Delta | +$0.005–0.025 per run |

At 100 runs/day: +$0.50–$2.50/day. Acceptable.

---

## 14. Logging and Observability

### New warning codes

| Code | When emitted | Location |
|---|---|---|
| `WARN_COUNTER_NARRATIVE_TIMEOUT` | CN batch wall-clock > 20s | `fetchFromProvider()` in `external-research.ts` |
| `WARN_COUNTER_NARRATIVE_SPARSE` | All 5 CN types return 0 accepted sources | `fetchFromProvider()` after CN loop |

### AcquisitionQualityReport extension

`AcquisitionQualityReport.perplexity.counter_narrative` block (see Section 9):
- `queries_attempted`: always 5 when CN queries run
- `queries_success`: CN queries returning ≥ 1 accepted source
- `sources_acquired`: total CN sources after `filterExternalSources()`
- `budget_exceeded`: `true` if `WARN_COUNTER_NARRATIVE_TIMEOUT` fired

### Existing observability unaffected

- `source_metadata.source_types_attempted` in `ExternalCorpus` automatically includes
  new CN source types (they're added to `SOURCE_TYPE_PRIORITY`)
- `source_metadata.source_types_successful` tracks which CN types returned results
- `PackQuality.counter_narrative_count` is already logged with every evidence pack

### Debuggability

To diagnose "why is counter_narrative still 0?" after this ships:

1. Check `AcquisitionQualityReport.perplexity.counter_narrative.sources_acquired`
   — if 0, the CN queries are returning nothing
2. Check `...counter_narrative.budget_exceeded` — if true, queries are timing out
3. Check `WARN_COUNTER_NARRATIVE_SPARSE` in logs — confirms 0 CN sources accepted
4. Inspect `ExternalCorpus.source_metadata.source_types_successful` — shows which
   CN types returned results before filtering
5. Check `PackQuality.coverage_assessment` — if `insufficient`, evidence pack
   doesn't have enough qualifying records regardless of CN status

---

## 15. Implementation Order

1. **`research-corpus.ts`** — Add 5 new `ExternalSourceType` values. Compile and verify.
2. **`external-research.ts`** — Extend `buildQueryMap()` with 5 CN entries. Add
   `SOURCE_TYPE_PRIORITY` entries. Add CN budget check in `fetchFromProvider()`.
   Add `WARN_COUNTER_NARRATIVE_SPARSE`. Unit test `buildQueryMap()`.
3. **`corpus-to-dossier.ts`** — Add `tagFrictionSignals()` exported function.
   Add CN source types to `EXTERNAL_SOURCE_EVIDENCE_TYPE`. Call `tagFrictionSignals()`
   from `externalSourceEvidenceRecord()`. Fix `negative_signal_depth` calculation.
   Unit test all three.
4. **`acquisition-quality.ts`** — Add `counter_narrative` sub-block to
   `AcquisitionQualityReport.perplexity`.
5. **Integration test** — `counter-narrative-integration.test.ts`.
6. **Run full test suite.** Baseline: 671 tests pass. After this spec: 671 + new tests pass.

---

## 16. Rollout Plan

1. **Merge PR** — all tests green, `tsc --noEmit` passes
2. **Smoke test live** — run `runV3Pipeline()` against Trigger.dev with real
   `PERPLEXITY_API_KEY`. Verify `AcquisitionQualityReport.perplexity.counter_narrative.sources_acquired > 0`
3. **Check PackQuality** — verify `counter_narrative_count >= 1` in evidence pack output
4. **Run live eval** on Trigger.dev, Omnea, Gendo — capture new CN sources (see TODOS.md P1)
5. **Rollback** if needed: `git revert` of 4 files. No DB migrations, no state to unwind.

---

## 17. Success Criteria

1. All existing 671 tests continue to pass (no regressions)
2. `tsc --noEmit` passes (TypeScript exhaustiveness on `EXTERNAL_SOURCE_EVIDENCE_TYPE` enforces this)
3. New unit tests for `tagFrictionSignals()` pass with the canonical keyword lists
4. Integration test `counter_narrative_count >= 1` passes with fixture corpus
5. Live smoke test: `AcquisitionQualityReport.perplexity.counter_narrative.sources_acquired >= 2`
   for at least 2 of the 3 reference companies (Trigger.dev, Omnea, Gendo)
6. `negative_signal_depth` reports `"thin"` or higher on at least one live run
7. V4 synthesis `fallback_to_template = false` fires on at least 1 of 3 reference companies
   after eval fixtures are rebuilt (TODOS.md P1)

---

## Files Changed

| File | Change type | Description |
|---|---|---|
| `src/intelligence-v3/types/research-corpus.ts` | Extend | Add 5 CN `ExternalSourceType` values |
| `src/intelligence-v3/acquisition/external-research.ts` | Extend | `buildQueryMap()` +5 entries, CN budget check, 2 new warnings |
| `src/intelligence-v3/acquisition/corpus-to-dossier.ts` | Extend | `tagFrictionSignals()`, map entries, `negative_signal_depth` fix |
| `src/intelligence-v3/types/acquisition-quality.ts` | Extend | `counter_narrative` sub-block |
| `src/intelligence-v3/__tests__/external-research-queries.test.ts` | Extend | CN query family tests |
| `src/intelligence-v3/__tests__/tag-friction-signals.test.ts` | New | Keyword tagger unit tests |
| `src/intelligence-v3/__tests__/counter-narrative-integration.test.ts` | New | End-to-end regression guard |
| `src/intelligence-v3/__tests__/acquisition.test.ts` | Extend | Budget timeout + sparse warning tests |

**Total: 4 source files, 4 test files. No new abstractions. No pipeline stages added.**
