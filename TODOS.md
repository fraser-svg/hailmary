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

## P2 — Acquisition quality scorecard

**What:** After acquisition completes, produce a structured one-line summary of corpus
quality: source count by tier, customer voice depth, negative signal density, stale
item ratio, and enrichment field coverage.

**Why:** Currently you need to inspect the full dossier to know if acquisition was
"good enough." A single scorecard log line enables fast triage and comparison across
companies.

**Where:** `src/intelligence-v3/pipeline/run-v3-pipeline.ts` — after
`corpusToDossierAdapter()` returns, compute and `console.log()` a structured JSON
summary.

**Effort:** S | **Depends on:** nothing

---

## P2 — Evidence excerpt highlighting in enriched fields

**What:** When enrichment extracts fields (e.g. competitors, leadership), the
`EnrichmentResult.fields.competitors` entries should include `evidence_id` references
back to the specific corpus items they were extracted from.

**Why:** Without this, enriched fields have no evidence trail. Downstream consumers
can't verify claims or trace back to source text.

**Where:** `src/intelligence-v3/acquisition/enrich-corpus.ts` — update prompt to
request `evidence_id` per extracted item, validate references in provenance checking.

**Effort:** M | **Depends on:** enrichment (V3-U3.5) shipped

---

## P2 — AcquisitionQualityReport.perplexity.counter_narrative sub-block

**What:** Spec 008 s9 calls for a `counter_narrative` sub-block in the acquisition
quality report tracking CN query success rates, source type distribution, and friction
signal density.

**Why:** Currently the AcquisitionQualityReport has no visibility into CN-specific
acquisition quality. This makes it impossible to tell if CN queries are working or
silently failing.

**Where:** `src/intelligence-v3/types/acquisition-quality.ts` (add type) +
`src/intelligence-v3/pipeline/run-v3-pipeline.ts` (populate after merge).

**Effort:** S | **Depends on:** nothing

---

## P3 — Enrichment tier 2: remaining 11 TODO fields

**What:** `corpus-to-dossier.ts` still has 11 TODO comments for fields not covered by
the current enrichment (funding dates/amounts, press dates, GTM observations, product
names, competitor domains, headquarters, geographic presence, etc.).

**Why:** These fields remain empty even with enrichment, limiting downstream signal
density for less-common analysis paths.

**Where:** `src/intelligence-v3/acquisition/enrich-corpus.ts` (expand prompt and
`EnrichmentResult.fields`) + `src/intelligence-v3/acquisition/corpus-to-dossier.ts`
(consume new fields).

**Effort:** L | **Depends on:** enrichment V3-U3.5 proven in eval

---

## P3 — Adaptive query hints from site corpus

**What:** After site corpus acquisition, scan homepage/about text for keywords (e.g.
industry terms, product categories, competitor mentions) and use them to weight or
supplement the 13 external research queries.

**Why:** Current queries are generic. Company-specific keywords would improve hit rate
for niche companies where generic queries return irrelevant results.

**Where:** New function in `src/intelligence-v3/acquisition/` + wire into
`run-v3-pipeline.ts` between V3-U1 completion and V3-U2 start.

**Effort:** M | **Depends on:** nothing (but evaluate after enrichment ships)

---

## P3 — Acquisition quality sparkline dashboard

**What:** Build a small CLI tool that reads multiple `enrichment.json` files from
`runs/*/` and prints a sparkline summary: fields populated per company, enrichment
fallback rate, provenance rejection rate, customer voice depth distribution.

**Why:** After running acquisition across many companies, you need a birds-eye view
of quality trends without opening each file individually.

**Where:** New file `src/tools/acquisition-dashboard.ts` reading from `runs/*/`.

**Effort:** S | **Depends on:** enrichment (V3-U3.5) shipped + multiple runs

---

## P2 — Enrichment diff view

**What:** When enrichment runs, log a structured diff showing which dossier fields
were empty before enrichment and what values enrichment provided (fields_before/after).

**Why:** Makes it easy to see enrichment's incremental value without comparing full
dossier JSON. Critical for evaluating whether enrichment is worth the LLM call cost.

**Where:** `src/intelligence-v3/pipeline/run-v3-pipeline.ts` — after adapter returns,
compare key fields against what they would be without enrichment.

**Effort:** S | **Depends on:** enrichment (V3-U3.5) shipped
