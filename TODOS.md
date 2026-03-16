# TODOS

## P2 — Structured log on send gate genericity failure

**What:** When `runSendGate` fails with `genericity` reason, emit a structured log
with evidence spine records (ev_IDs, roles, scores) that triggered the failure.

**Why:** Currently you know the gate failed but not which spine records caused it.
Triage requires re-running the full pipeline. One log line makes it instant.

**Where:** `src/intelligence-v3/memo/run-send-gate.ts` — add to gate failure branch.
`MemoBrief` (passed to gate) already contains `evidence_spine`.

**Effort:** S | **Depends on:** nothing

---

## P1 — Rebuild eval fixtures with counter-narrative sources

**What:** Run `runV3Pipeline()` live against Trigger.dev, Omnea, and Gendo after the
counter-narrative acquisition PR ships. Serialize the resulting counter-narrative
`ExternalSource` records into the eval fixture files.

**Why:** All three existing eval fixtures were created before counter-narrative queries
existed — they contain zero CN sources. Evals run against old fixtures will show
`counter_narrative_count = 0` even after the feature ships, creating a false signal
that the acquisition isn't working.

**Where:** `src/intelligence-v3/__tests__/` fixture data. Run `phase3-eval-live.ts` (or
equivalent) with real providers, capture CN sources from `ExternalCorpus.sources[]`
where `source_type` is one of the new CN types, append to each company's fixture.

**Effort:** S | **Depends on:** counter-narrative acquisition PR + `PERPLEXITY_API_KEY`

---

## P2 — Populate narrative_intelligence.negative_signals[] from friction-tagged evidence

**What:** `corpus-to-dossier.ts:658` has a `TODO` for `negative_signals[]` population.
After the counter-narrative acquisition PR ships, friction-tagged `EvidenceRecord`s
will exist in the dossier. A follow-up should extract negative signal summaries from
those records and populate `narrative_intelligence.negative_signals[]`.

**Why:** This array is consumed by `extractSignals()` in V2-R1. Populating it increases
signal density available to diagnosis selection and tension detection — the signals
that ultimately drive counter-narrative memo quality.

**Where:** `src/intelligence-v3/acquisition/corpus-to-dossier.ts` — implement keyword-
based extractor using the friction/complaint keyword lists from `tagFrictionSignals()`.
Write unit tests alongside.

**Effort:** M | **Depends on:** counter-narrative acquisition PR (friction-tagged evidence
must exist first)

---

## P3 — Route Reddit/HN sources to community_mentions[] bucket

**What:** Once `corpusToDossierAdapter()` is updated to iterate `community_mentions[]`
and produce `EvidenceRecord`s from it, migrate `reddit_thread` and `hackernews_thread`
`ExternalSource`s out of `external_sources[]` and into `community_mentions[]` in
`mergeResearchCorpus()`.

**Why:** Semantic separation of community voice vs formal reviews enables different
memo-layer treatment. `CommunityMention.author_type` (customer / developer / unknown)
is a richer signal than `source_type` alone. The bucket was designed for this use case.

**Where:** `src/intelligence-v3/acquisition/merge-corpus.ts` (routing logic) +
`src/intelligence-v3/acquisition/corpus-to-dossier.ts` (adapter must process
`community_mentions[]`). Update `research-corpus.ts` types if needed.

**Effort:** M | **Depends on:** counter-narrative acquisition PR
