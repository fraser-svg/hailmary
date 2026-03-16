# Spec 006 — Evidence Schema V2

**Status**: DRAFT — reviewed, critical feedback incorporated. Verify backward-compatibility against all three eval dossiers after schema changes.

## Purpose

Document additive, backward-compatible extensions to the evidence and source schemas introduced by the Perplexity + Cloudflare acquisition layer.

Existing dossiers remain valid. The JSON Schema must be updated to allow new optional fields. Validation behavior is unchanged.

---

## What Changes

### 1. SourceRecord — new optional fields

**File**: `src/types/source.ts`

```typescript
// BEFORE (current — do not remove any existing field)
export interface SourceRecord {
  source_id: string;
  url: string;
  source_type: string;
  title: string;
  publisher_or_owner: string;
  captured_at: string;          // ISO 8601
  relevance_notes: string[];
  source_tier: 1 | 2 | 3 | 4 | 5;
}

// AFTER — append optional fields only; do not change existing fields
export interface SourceRecord {
  source_id: string;
  url: string;
  source_type: string;
  title: string;
  publisher_or_owner: string;

  // Real fetch timestamp (not defaulted to current time).
  // For Perplexity: time of the API call that returned this citation.
  // For Cloudflare: time the page was rendered.
  captured_at: string;          // ISO 8601

  // Original publication date if known (from Perplexity citation metadata or HTTP headers).
  // Absent for pages where no publication date is available.
  published_at?: string;        // ISO 8601 — optional

  relevance_notes: string[];
  source_tier: 1 | 2 | 3 | 4 | 5;

  // Which acquisition method produced this source record.
  acquisition_method?: 'cloudflare' | 'perplexity' | 'websearch' | 'webfetch' | 'fixture';

  // SHA-256(content).slice(0, 16) — used for cross-corpus deduplication.
  // Set by mergeResearchCorpus(). Not set by acquisition providers.
  content_hash?: string;

  // Token count (estimated: characters / 4). Set by mergeResearchCorpus().
  token_count?: number;
}
```

All new fields are optional (`?`). No existing field changes. No type renames.

---

### 2. ExternalSource — published_at field

**File**: `src/intelligence-v3/types/research-corpus.ts`

```typescript
// BEFORE
export interface ExternalSource {
  url: string;
  source_type: ExternalSourceType;
  gathered_at: string;
  excerpt: string;
  token_count: number;
  source_tier: SourceTier;
}

// AFTER — add one optional field
export interface ExternalSource {
  url: string;
  source_type: ExternalSourceType;
  gathered_at: string;            // When HailMary fetched/queried this source
  published_at?: string;          // When the source was originally published (from Perplexity metadata)
  excerpt: string;                // Verbatim text from the source page — NEVER AI-generated text
  token_count: number;
  source_tier: SourceTier;
}
```

---

### 3. CorpusPage — content_hash field

**File**: `src/intelligence-v3/types/research-corpus.ts`

```typescript
// BEFORE
export interface CorpusPage {
  url: string;
  page_type: SitePageType;
  fetched_at: string;
  raw_text: string;
  token_count: number;
  fetch_success: boolean;
  source_tier: 1;
}

// AFTER — add one optional field
export interface CorpusPage {
  url: string;
  page_type: SitePageType;
  fetched_at: string;
  raw_text: string;               // Verbatim normalized page text — NEVER AI-generated text
  token_count: number;
  fetch_success: boolean;
  source_tier: 1;
  content_hash?: string;          // SHA-256(raw_text).slice(0, 16) — set by mergeResearchCorpus()
}
```

---

### 4. EvidenceRecord — tag additions only

No new fields on `EvidenceRecord`. Two new tag values added to the tags vocabulary:

| Tag | Meaning | Who Sets It |
|---|---|---|
| `"stale"` | `published_at` > 24 months before run date, OR `captured_at` > 24 months and no `published_at` | `corpusToDossierAdapter()` |
| `"acquisition_perplexity"` | Source acquired via PerplexitySearchProvider | `mergeResearchCorpus()` |
| `"acquisition_cloudflare"` | Source acquired via CloudflareRenderingProvider | `mergeResearchCorpus()` |

These tags are informational and do not affect validation. The `"stale"` tag feeds into `buildEvidencePack()` recency scoring.

---

### 5. ResearchCorpus — merge_metadata extension

**File**: `src/intelligence-v3/types/research-corpus.ts`

```typescript
// BEFORE
merge_metadata: {
  total_items: number;
  deduplicated_count: number;
  tier_distribution: Partial<Record<SourceTier, number>>;
};

// AFTER
merge_metadata: {
  total_items: number;
  deduplicated_count: number;
  cross_corpus_deduplicated: number;  // Items removed because same URL appeared in both Cloudflare and Perplexity
  tier_distribution: Partial<Record<SourceTier, number>>;
  stale_item_count: number;           // Items tagged "stale" across all buckets
};
```

---

### 6. AcquisitionQualityReport — new type

**New file**: `src/intelligence-v3/types/acquisition-quality.ts`

```typescript
import type { SourceTier } from '../../types/source.js';

export interface AcquisitionQualityReport {
  run_id: string;
  company: string;
  domain: string;
  acquired_at: string;          // ISO 8601

  cloudflare: {
    pages_attempted: number;
    pages_success: number;
    pages_failed: string[];     // URLs of pages that failed
    total_tokens: number;
    duration_ms: number;
  };

  perplexity: {
    queries_attempted: number;
    queries_success: number;    // Queries returning ≥ 1 result
    results_raw: number;        // Total citations before dedup
    results_after_dedup: number;
    secondary_fetches_attempted: number;  // Format B only
    secondary_fetches_success: number;
    duration_ms: number;
  };

  corpus: {
    total_sources: number;      // After merge + dedup
    tier_distribution: Partial<Record<SourceTier, number>>;
    stale_source_count: number;
  };

  total_acquisition_duration_ms: number;
}
```

This report is logged (structured JSON to stdout) at the end of the upstream acquisition layer. It is NOT stored in the dossier. It IS attached to `V3PipelineResult` as `acquisitionQuality?: AcquisitionQualityReport`.

---

## Source Tier Assignment

### Timing

Tier is assigned by `mergeResearchCorpus()` via `tier-classifier.ts` (Spec 005). The tier that acquisition providers set provisionally on `ExternalSource.source_tier` is **overridden** by the classifier output during merge.

CorpusPages are always Tier 1 (company-controlled). This does not change.

### Canonical Rules

See `tier-classifier.ts` specification in Spec 005. The classifier is a deterministic function — no LLM judgment.

---

## Deduplication Rules

All deduplication happens in `mergeResearchCorpus()`, before `corpusToDossierAdapter()` runs.

### CorpusPage Deduplication (existing behavior, no change)

Same URL → keep higher `token_count` version.

**Addition**: compute and store `content_hash` on each page after deduplication.

### ExternalSource Deduplication (existing behavior, enhanced)

1. **URL dedup**: same URL → keep higher `token_count` version (existing)
2. **Content hash dedup**: compute `SHA256(excerpt).slice(0, 16)`. If two sources share the same content hash → keep the one with higher `token_count`. This catches Perplexity returning the same review text across two query families.

### Cross-Corpus Deduplication (new)

If a Perplexity citation URL exactly matches a Cloudflare-fetched CorpusPage URL (after normalization: strip protocol, trailing slash, `www.`):
- The Cloudflare CorpusPage takes precedence (longer text, better provenance)
- The Perplexity ExternalSource for that URL is discarded
- Increment `merge_metadata.cross_corpus_deduplicated`

---

## Freshness Rules

### Staleness Definition

An evidence record is stale if:
- `published_at` is set AND is > 24 months before the current run date
- OR `published_at` is absent AND `captured_at` is > 24 months before the current run date

`corpusToDossierAdapter()` sets the `"stale"` tag on evidence records meeting this condition.

### Recency Scoring in EvidencePack (V3-M1)

`buildEvidencePack()` already has a `recency` dimension (0–1 pts). Current behavior defaults to 1 point for undated evidence from current-state pages. After this spec:

| Condition | recency score |
|---|---|
| `tags` contains `"stale"` | 0 |
| `published_at` known AND within 18 months | 1 |
| `captured_at` within 18 months AND no `published_at` | 1 |
| `page_type` is `homepage` or `pricing` AND undated | 1 (assumed current-state) |
| All other cases | 0 |

No changes to `buildEvidencePack()` scoring structure. Only the recency input is now more accurate.

---

## Contradiction Handling

No change to existing behavior (Spec 003-V1):
- Both contradicting records are kept
- Both appear in `dossier.confidence_and_gaps.conflicting_evidence[]`
- Validation emits WARNING, not error

Richer Perplexity evidence will surface more contradictions (company claims "self-serve" but reviews describe lengthy onboarding). This is the desired outcome — more tensions → better diagnosis.

---

## JSON Schema Updates

**File**: `schemas/company-dossier.schema.json`

Add the following optional properties to the `sources` array item definition. All are optional (not added to `required` array). The `additionalProperties: false` constraint must remain.

```json
"published_at": {
  "type": "string",
  "format": "date-time",
  "description": "Original publication date of the source, if known"
},
"acquisition_method": {
  "type": "string",
  "enum": ["cloudflare", "perplexity", "websearch", "webfetch", "fixture"],
  "description": "Which acquisition method produced this source record"
},
"content_hash": {
  "type": "string",
  "description": "SHA-256 content hash (16 hex chars) for deduplication"
},
"token_count": {
  "type": "number",
  "minimum": 0,
  "description": "Estimated token count for this source"
}
```

**Validation after change**: Run `npx tsx src/validate.ts` against all three eval company dossiers (Stripe, Trigger.dev, Omnea). All three must still report `valid: true`. No errors should be introduced.

---

## V3PipelineResult Update

```typescript
// BEFORE
interface V3PipelineResult {
  pipeline_version: "v3";
  company_id: string;
  run_id: string;
  generated_at: string;
  corpus: ResearchCorpus;
  dossier: Dossier;
  v2Result: V2PipelineResult;
  evidencePack: EvidencePack;
  adjudication: AdjudicationResult;
  memoBrief: MemoBrief;
  memo: MarkdownMemo;
  criticResult: MemoCriticResult;
  sendGate: SendGateResult;
}

// AFTER — add acquisitionQuality; make optional fields reflect reality
interface V3PipelineResult {
  pipeline_version: "v3";
  company_id: string;
  run_id: string;
  generated_at: string;

  corpus: ResearchCorpus;
  dossier: Dossier;
  acquisitionQuality?: AcquisitionQualityReport;   // NEW

  v2Result: V2PipelineResult;

  evidencePack: EvidencePack;
  adjudication: AdjudicationResult;
  memoBrief?: MemoBrief;          // Absent if adjudication_mode = "abort"
  memo?: MarkdownMemo;
  criticResult?: MemoCriticResult;
  sendGate?: SendGateResult;

  firstAttemptMemo?: MarkdownMemo;       // Populated only if revision loop ran
  firstCriticResult?: MemoCriticResult;
}
```

---

## Acceptance Criteria

1. `src/types/source.ts` updated — `tsc --noEmit` passes
2. `src/intelligence-v3/types/research-corpus.ts` updated — `tsc --noEmit` passes
3. `src/intelligence-v3/types/acquisition-quality.ts` created
4. `schemas/company-dossier.schema.json` updated — all three eval dossiers pass `src/validate.ts`
5. `mergeResearchCorpus()` sets `content_hash` on all CorpusPage records after dedup
6. `corpusToDossierAdapter()` sets `"stale"` tag on applicable evidence records
7. `buildEvidencePack()` recency scoring correctly uses `"stale"` tag — test coverage added
8. All 443 existing tests pass

---

## Constraints

1. All new fields are optional — no breaking changes to existing dossier format
2. Existing dossiers without new fields remain schema-valid
3. `additionalProperties: false` in JSON Schema is preserved — only specified fields are allowed
4. Evidence records must not contain AI-generated text. The `excerpt` field in `EvidenceRecord` must always trace to a real source page via `source_id → ExternalSource.excerpt` or `source_id → CorpusPage.raw_text`
5. ID assignment (`ev_XXX`, `src_XXX`) remains sequential and deterministic, happening post-merge in `corpusToDossierAdapter()`
