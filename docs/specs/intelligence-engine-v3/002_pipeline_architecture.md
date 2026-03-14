# Spec 002 — V3 Pipeline Architecture

## Purpose

Document the full V3 pipeline: all 17 stages across three layers, data flow contracts, acquisition depth rules, and backward-compatibility with the V2 reasoning spine.

---

## Three-Layer Architecture

```
┌─────────────────────────────────────────────────────┐
│  UPSTREAM LAYER  (V3-U1 – V3-U4)                    │
│  Research ingestion → normalized Dossier             │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│  REASONING LAYER  (V2-R1 – V2-R7)                   │
│  V2 pipeline spine (unchanged)                       │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│  MEMO LAYER  (V3-M1 – V3-M6)                        │
│  Evidence curation → adjudication → memo → gate     │
└─────────────────────────────────────────────────────┘
```

---

## Stage Contracts

### V3-U1 — siteCorpusAcquisition

**Purpose:** Crawl the company's own web presence and extract structured content.

**Input:**
```typescript
{ domain: string; crawl_config?: CrawlConfig }
```

**Output:** `SiteCorpus`

**Crawl rules:**

Mandatory pages (always fetched):
- `homepage` (`https://<domain>/`)
- `pricing` (`/pricing`)
- `about` (`/about` or `/about-us`)

Optional pages (select up to 5 from this list, in priority order):
1. `customers` or `case-studies` (`/customers`, `/case-studies`)
2. `blog` (most recent 2 posts, not the index)
3. `docs` (top-level overview only, not full docs tree)
4. `integrations` (`/integrations`)
5. `security` (`/security`)

Hard limits:
- ≤ 10 pages total
- ≤ 20,000 tokens of fetched content in aggregate

Failure behavior:
- If homepage is unreachable: raise `ERR_CORPUS_EMPTY`
- If pricing page is unreachable: log `WARN_PRICING_UNAVAILABLE`, continue
- If optional pages fail: skip silently, record in `corpus.fetch_metadata.failed_pages[]`

**SiteCorpus shape:**
```typescript
interface SiteCorpus {
  domain: string;
  fetched_at: string;
  pages: CorpusPage[];
  fetch_metadata: {
    attempted_pages: string[];
    failed_pages: string[];
    total_tokens: number;
  };
}
```

---

### V3-U2 — externalResearchAcquisition

**Purpose:** Gather third-party evidence: reviews, press, competitor positioning, investor mentions.

**Input:**
```typescript
{ company: string; domain: string }
```

**Output:** `ExternalCorpus`

**Sources (in priority order):**
1. Review snippets — Trustpilot (fetchable), G2/Capterra (search snippets only — always 403 on direct fetch)
2. Press mentions — news search, last 24 months
3. Competitor positioning — 2-3 direct competitors, search snippets
4. Investor/funding mentions — Crunchbase search snippets, funding announcements
5. LinkedIn company page — search snippet only (not fetched directly)

**ExternalCorpus shape:**
```typescript
interface ExternalCorpus {
  company: string;
  gathered_at: string;
  sources: ExternalSource[];
  source_metadata: {
    source_types_attempted: ExternalSourceType[];
    source_types_successful: ExternalSourceType[];
    search_queries_used: string[];
  };
}
```

**Failure behavior:**
- If no external sources return results: log `WARN_EXTERNAL_RESEARCH_SPARSE`; continue with site corpus only
- Do not abort pipeline for sparse external research — a site-only corpus may still support a valid diagnosis

---

### V3-U3 — mergeResearchCorpus

**Purpose:** Deduplicate, tier-assign, and normalize SiteCorpus + ExternalCorpus into a unified ResearchCorpus.

**Input:** `SiteCorpus`, `ExternalCorpus`

**Output:** `ResearchCorpus`

**ResearchCorpus must support four buckets:**
```typescript
interface ResearchCorpus {
  company_id: string;
  domain: string;
  merged_at: string;

  site_pages: CorpusPage[];           // Required — from SiteCorpus
  external_sources: ExternalSource[]; // Required — from ExternalCorpus

  // Optional buckets — empty arrays initially, structure must be present
  community_mentions: CommunityMention[];   // Reddit, HN, Slack leaks, Discord
  founder_statements: FounderStatement[];   // LinkedIn posts, podcasts, talks, interviews

  merge_metadata: {
    total_items: number;
    deduplicated_count: number;
    tier_distribution: Record<SourceTier, number>;
  };
}
```

**Deduplication rules:**
- Same URL fetched twice → keep higher token count version
- Same snippet from two search queries → deduplicate by content hash
- Source tier assigned during merge per Spec 004 (V1) tier rules

---

### V3-U4 — corpusToDossierAdapter

**Purpose:** Transform ResearchCorpus into a standard `Dossier` (V2-compatible type). No new types created.

**Input:** `ResearchCorpus`

**Output:** `Dossier` (the canonical 16-section type from `src/types/dossier.ts`)

**Behavior:**
- Extracts evidence records from corpus items and assigns `ev_XXX` IDs
- Populates all 16 required top-level dossier sections (empty sections get valid empty shapes)
- Assigns `source_tier` to all source records
- Sets `is_inferred: true` on any claim not directly quoted from a source
- Sets `confidence: "low"` on any section with < 2 evidence records
- Runs schema validation after assembly; raises `ERR_DOSSIER_INVALID` on failure

**Constraints:**
- Must not create any new TypeScript types — only use types from `src/types/`
- The output Dossier must pass `src/validate.ts` validation

---

### V2-R1 through V2-R7 — V2 Reasoning Spine

These stages run unchanged. V3 feeds them a richer Dossier; their internal logic is unmodified.

| Stage | Function | Output |
|-------|----------|--------|
| V2-R1 | `extractSignals(dossier)` | `Signal[]` |
| V2-R2 | `analyseGtm(signals)` | `GTMAnalysis` |
| V2-R3 | `detectTensions(signals)` | `Tension[]` |
| V2-R4 | `detectPatterns(tensions, signals)` | `Pattern[]` |
| V2-R5 | `selectDiagnosis(patterns, tensions)` | `Diagnosis` |
| V2-R6 | `generateMechanisms(diagnosis, patterns, tensions)` | `Mechanism[]` |
| V2-R7 | `selectIntervention(diagnosis, mechanisms)` | `InterventionOpportunity` |

See V2 specs (`docs/specs/intelligence-engine-v2/`) for full stage contracts.

**Note:** A richer evidence corpus may produce more signals and higher-confidence diagnoses. The V2 logic is unchanged; richer input naturally improves output quality.

---

### V3-M1 — buildEvidencePack

Spec: [003_evidence_pack_spec.md](./003_evidence_pack_spec.md)

**Input:** `Dossier`, `V2PipelineResult` (diagnosis, mechanisms, intervention)
**Output:** `EvidencePack`

---

### V3-M2 — adjudicateDiagnosis

Spec: [004_adjudication_spec.md](./004_adjudication_spec.md)

**Input:** `Diagnosis`, `EvidencePack`
**Output:** `AdjudicationResult`

---

### V3-M3 — buildMemoBrief

Spec: [005_memo_spec.md](./005_memo_spec.md)

**Input:** `AdjudicationResult`, `Diagnosis`, `Mechanism[]`, `InterventionOpportunity`, `EvidencePack`, `founderContext?`
**Output:** `MemoBrief`

---

### V3-M4 — writeMemo

Spec: [005_memo_spec.md](./005_memo_spec.md)

**Input:** `MemoBrief`
**Output:** `MarkdownMemo`

LLM call. Model: `claude-haiku-4-5-20251001`. Max tokens: 1500.

---

### V3-M5 — criticiseMemo

Spec: [005_memo_spec.md](./005_memo_spec.md)

**Input:** `MarkdownMemo`, `MemoBrief`
**Output:** `MemoCriticResult`

LLM call. Model: `claude-haiku-4-5-20251001`. Max tokens: 800.

Revision loop: if any critic dimension fails and attempts < 2, append `revision_instructions` to brief and re-run writeMemo.

---

### V3-M6 — runSendGate

Spec: [006_send_gate_spec.md](./006_send_gate_spec.md)

**Input:** `MarkdownMemo`, `MemoCriticResult`, `AdjudicationResult`, `EvidencePack`
**Output:** `SendGateResult`

---

## Full V3PipelineResult

```typescript
interface V3PipelineResult {
  pipeline_version: "v3";
  company_id: string;
  run_id: string;
  generated_at: string;

  // Upstream layer
  corpus: ResearchCorpus;
  dossier: Dossier;

  // V2 reasoning layer
  v2Result: V2PipelineResult;

  // Memo layer
  evidencePack: EvidencePack;
  adjudication: AdjudicationResult;
  memoBrief: MemoBrief;
  memo: MarkdownMemo;
  criticResult: MemoCriticResult;
  sendGate: SendGateResult;
}
```

---

## Backward Compatibility

**V2-only mode** remains fully supported. The V3 pipeline is a superset, not a replacement.

```typescript
// V2 mode (unchanged)
const v2Result = await runV2Pipeline(companyId, dossier);

// V3 mode (new)
const v3Result = await runV3Pipeline({ company, domain, founderContext });
```

V3 can also be initialized from an existing Dossier (skipping upstream acquisition):
```typescript
const v3Result = await runV3Pipeline({ dossier: existingDossier });
// Skips V3-U1 through V3-U4; runs V2 spine + memo layer only
```

---

## Constraints

1. No V2 source files may be modified
2. V3 stages must import from `src/intelligence-v2/` but not modify anything there
3. The CorpusToDossierAdapter must produce a Dossier that passes existing validation (`src/validate.ts`)
4. All LLM calls are isolated to V3-M4 and V3-M5; no other stages may call an LLM

---

## Acceptance Criteria

- Running `runV3Pipeline({ company: "Stripe", domain: "stripe.com" })` completes without error
- V3PipelineResult contains non-empty values for all required fields
- `dossier` passes `src/validate.ts`
- `sendGate.result` is deterministically reproducible from the same corpus
- V2-only mode still passes all existing tests

---

## Hard Failure Conditions

| Stage | Condition | Error |
|-------|-----------|-------|
| V3-U1 | Homepage unreachable | `ERR_CORPUS_EMPTY` |
| V3-U4 | Adapter output fails schema validation | `ERR_DOSSIER_INVALID` |
| V2-R5 | No diagnosis produced | `ERR_V2_NO_DIAGNOSIS` |
| V3-M2 | Adjudication = abort | `ERR_ADJUDICATION_ABORT` |
| V3-M5 | Critic fails after 2 revisions | `ERR_MEMO_CRITIC_FAIL` |
