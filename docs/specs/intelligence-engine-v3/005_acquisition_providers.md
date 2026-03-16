# Spec 005 — Acquisition Providers

**Status**: DRAFT — reviewed, critical feedback incorporated. Verify live API docs before implementation.

## Purpose

Define the implementation contracts for the two live acquisition providers introduced in V3:

1. **PerplexitySearchProvider** — implements `ExternalResearchProvider` using the Perplexity Search API
2. **CloudflareRenderingProvider** — implements `SiteCorpusProvider` using the Cloudflare Browser Rendering REST API

These providers plug into the existing V3-U1 and V3-U2 provider interfaces defined in:
- `src/intelligence-v3/acquisition/site-corpus.ts` (`SiteCorpusProvider`)
- `src/intelligence-v3/acquisition/external-research.ts` (`ExternalResearchProvider`)

No changes to those interfaces. No changes to V3-U3, V3-U4, V2 reasoning, or the memo layer.

---

## Core Evidence Contamination Rule

**No AI-generated text may enter the evidence layer. Ever.**

This rule is absolute and applies to both providers.

- Cloudflare returns rendered HTML → strip and normalize → store verbatim page text only
- Perplexity returns a response that includes both AI-synthesized answer text AND citations with source excerpts. **Discard the synthesis text entirely.** Store only raw citation data (URL, title, excerpt from the source page).

Any function that passes AI-generated synthesis text into an `ExternalSource.excerpt` or `CorpusPage.raw_text` field is a defect.

**Corollary — LLM isolation boundary**: Raw corpus content (site page text, citation excerpts) must never be passed directly to any LLM stage. The only content that crosses into V3-M3 through V3-M5 is structured `EvidencePackRecord` objects whose excerpts originate from real sources and are traceable to `source_id` records. This boundary is enforced by the existing EvidencePack architecture; providers must not subvert it.

---

## Latency Contract

- **Target**: full acquisition (Cloudflare + Perplexity, including any secondary citation fetches) completes in ≤ 45 seconds
- **Hard cap**: 60 seconds — abort with `ERR_ACQUISITION_TIMEOUT` if exceeded
- **Parallelism**: V3-U1 (Cloudflare) and V3-U2 (Perplexity) launch concurrently via `Promise.all`
- **Per-provider timeouts**: Cloudflare per-page timeout = 10 seconds; Perplexity per-query timeout = 8 seconds
- **Secondary fetch budget**: If Perplexity returns URL-only citations requiring secondary plain-HTTP fetches for excerpts, those fetches count against the 45s target. Secondary fetches must be concurrency-limited (max 3 in-flight) and rate-limited (150ms minimum gap between requests). See Perplexity section.
- Timeouts are non-fatal at the item level (skip + log). Fatal only if homepage fails (Cloudflare) or all queries fail (Perplexity, warning only).

---

## Provider 1: PerplexitySearchProvider

### What It Is

A provider that calls the **Perplexity Search API** to retrieve ranked external search results for a given company. It operates as the Mode B implementation for `ExternalResearchProvider`.

**API endpoint**: `https://api.perplexity.ai/chat/completions`
**Authentication**: `Authorization: Bearer ${PERPLEXITY_API_KEY}` (env var, never hardcoded)
**Model**: `sonar` (not `sonar-pro`; we need search results, not deep synthesis)

> **Verify before implementation**: Perplexity's API surface and citation return format have evolved. Before writing any code, read the live Perplexity API documentation at https://docs.perplexity.ai to confirm the current endpoint, citation format, and `return_citations` field behavior. Do not implement from this spec alone.

### Why Search API, Not Sonar Pro

Sonar Pro performs grounded AI synthesis — it generates a written answer incorporating search results. We do not want AI-written text in the evidence layer. The `sonar` model at low temperature with a constrained system prompt acts as a search results extractor: it returns citations referencing the source pages. We extract those citations; we discard the model's completion text.

### Request Shape

```typescript
interface PerplexityRequestBody {
  model: "sonar";
  temperature: 0;
  // Do NOT use max_tokens: 1. Use a small but non-trivial budget (e.g., 50–100 tokens)
  // so the API returns a valid response structure including citations.
  // The completion text is discarded regardless — we only use the citations array.
  max_tokens: 50;
  search_recency_filter?: "month" | "year";
  messages: [
    { role: "system"; content: string },   // PERPLEXITY_SYSTEM_PROMPT constant
    { role: "user"; content: string }      // The search query
  ];
  return_citations: true;
  return_images: false;
}
```

**System prompt** (verbatim constant in the adapter):
```
You are a search index. Return citations for the query. Do not write analysis or commentary.
```

**Why not `max_tokens: 1`**: Setting `max_tokens: 1` risks truncating the response before the API attaches citation metadata, or producing malformed responses on some API versions. Use `max_tokens: 50` to guarantee a valid response shape while keeping synthesis text minimal. The completion text is discarded in all cases.

### Citation Extraction and Secondary Fetches

Perplexity's `return_citations: true` response format has varied across API versions:

**Format A** (preferred): Response includes structured result objects with `url`, `title`, and `snippet`/`excerpt` fields. Use these directly — no secondary fetch needed.

**Format B** (fallback): Response includes only `citations: string[]` (URL list). In this case, perform a secondary plain HTTP fetch for each URL to retrieve an excerpt.

```
Secondary fetch rules (Format B only):
- Max 3 concurrent secondary fetches at any time (semaphore)
- 150ms minimum gap between starting each secondary fetch
- Timeout: 5s per secondary fetch
- On failure or timeout: skip that citation (non-fatal)
- Extract: first 500 characters of text content after stripping HTML tags
- These secondary fetches count against the 45s acquisition budget
```

Detect which format is present: if `citations` is an array of strings, use Format B. If the response contains structured result objects with excerpt data, use Format A.

### Output: ExternalSource[]

The adapter converts each citation into an `ExternalSource` (existing type in `research-corpus.ts`):

```typescript
// Maps to existing ExternalSource — no new types
{
  url: string;           // Citation URL
  source_type: ExternalSourceType;  // Classified by caller (mergeResearchCorpus via tier-classifier)
  gathered_at: string;  // ISO 8601 — time of this API call
  published_at?: string; // From citation metadata if available
  excerpt: string;      // Verbatim text from the source page (NOT AI completion text)
  token_count: number;  // estimateTokenCount(excerpt)
  source_tier: SourceTier;  // Assigned by tier-classifier.ts in mergeResearchCorpus
}
```

**Critical**: The `excerpt` field must contain text extracted from the cited source page, not from `response.choices[0].message.content`. These are different things. If in doubt, log both and compare — the synthesis text will reference multiple sources; the citation excerpt will be page-specific.

### Fixed Query Families (Phase 1)

Phase 1 uses fixed query families. No archetype-based query planning.

| Family | `ExternalSourceType` | Query Template | `search_recency_filter` |
|---|---|---|---|
| Trustpilot reviews | `review_trustpilot` | `"${company} site:trustpilot.com"` | `"year"` |
| G2 reviews | `review_g2_snippet` | `"${company} reviews site:g2.com"` | `"year"` |
| Press mentions | `press_mention` | `"${company} ${domain} announcement OR funding OR launch"` | `"year"` |
| Competitor alternatives | `competitor_search_snippet` | `"${company} alternatives -site:${domain}"` | none |
| Funding/investors | `funding_announcement` | `"${company} funding investors"` | none |
| Job signals | `linkedin_snippet` | `"${company} jobs hiring site:linkedin.com OR site:greenhouse.io"` | `"month"` |
| Community discussions | `investor_mention` | `"${company} site:reddit.com OR site:news.ycombinator.com"` | `"year"` |

**Total**: 7 queries per run (fixed in Phase 1)
**Max citations per query**: 5 (take first 5; ignore remainder)
**Max excerpt length**: 500 characters. Truncate at word boundary if longer.

### Token Budgets

- Max 500 characters per excerpt (≈ 125 tokens)
- Max 5 citations × 7 queries = 35 external sources pre-dedup
- After deduplication in V3-U3, expect 18–28 unique sources

### Error Handling

| Error | Action |
|---|---|
| `PERPLEXITY_API_KEY` not set | Throw `ERR_MISSING_CREDENTIAL: PERPLEXITY_API_KEY`. Fatal — abort acquisition. |
| HTTP 401 | Throw `ERR_PERPLEXITY_AUTH_FAILED`. Fatal. |
| HTTP 429 | Log `WARN_PERPLEXITY_RATE_LIMIT: ${sourceType}`. Skip query. Non-fatal. |
| HTTP 500/503 | Log `WARN_PERPLEXITY_SERVER_ERROR: ${sourceType}`. Skip query. Non-fatal. |
| Fetch timeout (> 8s) | Log `WARN_PERPLEXITY_TIMEOUT: ${sourceType}`. Skip query. Non-fatal. |
| Empty citations array | Log `WARN_PERPLEXITY_NO_RESULTS: ${sourceType}`. Continue. |
| Secondary fetch fails | Log `WARN_CITATION_FETCH_FAILED: ${url}`. Skip citation. Non-fatal. |
| All 7 queries return 0 results | Log `WARN_EXTERNAL_RESEARCH_SPARSE`. Return empty ExternalCorpus. Pipeline continues. |

### What the Provider Must NOT Do

- Pass `response.choices[0].message.content` (AI synthesis) into any `ExternalSource.excerpt`
- Synthesize, summarize, or rewrite citation text
- Follow pagination beyond the first results page
- Make more than 7 queries per run
- Start secondary fetches without the concurrency semaphore
- Ignore the evidence contamination rule for "convenience"

---

## Provider 2: CloudflareRenderingProvider

### What It Is

A provider that calls the **Cloudflare Browser Rendering REST API** to fetch and JS-render pages from the target company's domain. It operates as the Mode B implementation for `SiteCorpusProvider`.

**API**: Cloudflare Browser Rendering REST API — direct REST calls from Node.js. No Workers bindings. No `/crawl` endpoint in Phase 1.
**Authentication**: `Authorization: Bearer ${CLOUDFLARE_API_TOKEN}` with `X-Auth-Email` or token-only (verify in live docs)

> **Verify before implementation**: The Cloudflare Browser Rendering API endpoint path, authentication headers, and request/response shape must be verified from live Cloudflare documentation before any code is written. The endpoint path used in this spec (`/accounts/${accountId}/browser-rendering/snapshot`) is a reasonable approximation based on Cloudflare's API conventions but must be confirmed. Do not implement from this spec alone.

**Credentials required**:
```
CLOUDFLARE_ACCOUNT_ID   — Cloudflare account identifier
CLOUDFLARE_API_TOKEN    — API token scoped to Browser Rendering
```

### Request Shape (verify against live docs)

```typescript
// POST to: https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/browser-rendering/snapshot
// NOTE: Verify this path against live API docs before implementation
interface CloudflareSnapshotRequest {
  url: string;
  gotoOptions?: {
    waitUntil: "networkidle2";  // Wait for JS rendering to complete
    timeout: 9000;              // 9s — 1s buffer under our 10s hard cap
  };
  rejectResourceTypes?: ["image", "media", "font", "stylesheet"];
}
```

### Response Shape (verify against live docs)

```typescript
interface CloudflareSnapshotResponse {
  result: {
    content: string;    // Full rendered HTML
  };
  success: boolean;
  errors: { code: number; message: string }[];
}
```

### Content Normalization

The adapter extracts clean text from rendered HTML. This is deterministic TypeScript — no LLM.

**Parsing**: Use `node-html-parser` if available, or equivalent lightweight HTML parser. Regex stripping (`<[^>]+>`) is a last resort for environments with no parser (lower fidelity, acceptable for MVP).

**Strip these elements and their children:**
- `<nav>`, `<footer>`, `<noscript>` elements
- `<script>`, `<style>` blocks
- `<iframe>` elements
- Cookie/consent banners (elements with class names matching: `cookie`, `banner`, `consent`, `gdpr`, `intercom`, `drift`, `crisp`, `chatbot`)
- Modal and popup overlays (class names matching: `popup`, `modal`, `overlay`)
- Elements with `role="navigation"` or `role="complementary"`

**DO NOT blindly strip `<header>` elements.** Many site headers contain the hero tagline, value proposition, and primary positioning statement — critical intelligence. Instead:
- Strip navigation lists within `<header>` (i.e., `<header> > nav`, `<header> ul.nav`, etc.)
- Keep paragraph text, H1–H3, and span text within `<header>` if it does not appear to be a nav menu

**Keep:**
- `<main>`, `<article>`, `<section>` and their children
- Headings `<h1>` through `<h4>`
- `<p>` paragraphs and `<li>` list items
- Pricing table cells and visible text content
- Testimonial and customer quote blocks
- `<header>` non-navigation text (value proposition, hero copy)

**Post-strip normalization:**
1. Collapse consecutive whitespace (spaces, tabs) to single space
2. Collapse 3+ consecutive newlines to 2 newlines
3. Remove lines shorter than 20 characters (likely nav remnants; do not apply to numeric lines like prices)
4. Trim leading/trailing whitespace from the full output

**Token cap**: 5,000 tokens (≈ 20,000 characters) per page. Hard-truncate at word boundary. Record actual token count in `CorpusPage.token_count`.

### Fallback Policy

| Scenario | Action |
|---|---|
| Cloudflare returns `success: false` | Attempt plain HTTP `fetch()` for same URL. Return that text (after HTML stripping). Set `fetch_success: true` if content retrieved. |
| Cloudflare returns empty `content` after normalization (< 100 chars) | Attempt plain HTTP fetch. |
| Plain HTTP fetch also fails | Return `{ text: '', success: false }`. |
| Homepage `success: false` AND plain fetch fails | `siteCorpusAcquisition()` throws `ERR_CORPUS_EMPTY` (existing behavior). |
| Render timeout (> 10s) | Return `{ text: '', success: false }`. Log `WARN_CLOUDFLARE_TIMEOUT: ${url}`. |
| HTTP 403 on non-homepage | Return `{ text: '', success: false }`. Log `WARN_CLOUDFLARE_BLOCKED: ${url}`. Non-fatal. |

### Rate Limiting

The **caller** (`site-corpus.ts`) controls concurrency and pacing. The provider itself is stateless.

- Maximum 2 concurrent Cloudflare requests (caller enforces with a semaphore)
- 300ms minimum delay between initiating sequential requests
- The caller's existing loop in `fetchFromProvider()` should be updated to respect these limits

### Error Handling

| Error | Action |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` or `CLOUDFLARE_API_TOKEN` missing | Throw `ERR_MISSING_CREDENTIAL`. Fatal. |
| HTTP 401 | Throw `ERR_CLOUDFLARE_AUTH_FAILED`. Fatal. |
| HTTP 429 | Wait 2s. Retry once. If still 429, return `{ text: '', success: false }`. Non-fatal (non-homepage). |
| Network error | Return `{ text: '', success: false }`. Log `WARN_CLOUDFLARE_NETWORK: ${url}`. Non-fatal. |

---

## Tier Classifier

The tier classifier is a deterministic lookup called by `mergeResearchCorpus()`. Providers do NOT call it.

**Module**: `src/intelligence-v3/providers/tier-classifier.ts`

```typescript
export function classifySourceTier(url: string, targetDomain: string): SourceTier
```

**Classification rules** (evaluated in order — first match wins):

| Pattern | Tier | Notes |
|---|---|---|
| Hostname matches `targetDomain` (normalize: strip `www.`, trailing slash) | 1 | Company's own site |
| `linkedin.com/company/*` | 2 | Company profile only (not individual posts) |
| `techcrunch.com`, `venturebeat.com`, `businesswire.com`, `prnewswire.com` | 2 | |
| `crunchbase.com`, `pitchbook.com` | 2 | |
| `reuters.com`, `bloomberg.com`, `forbes.com`, `wsj.com`, `ft.com` | 2 | |
| `sec.gov`, `gov.uk`, regulatory TLDs | 2 | |
| `trustpilot.com` | 3 | |
| `g2.com`, `capterra.com`, `getapp.com`, `softwareadvice.com` | 3 | |
| `reddit.com`, `news.ycombinator.com` | 3 | |
| `producthunt.com`, `appsumo.com` | 3 | |
| `glassdoor.com`, `comparably.com`, `indeed.com` | 4 | |
| `greenhouse.io`, `lever.co`, `ashbyhq.com`, `workday.com` | 4 | Job boards |
| `medium.com` with a **known reputable publication domain** (e.g., `bettermarketing.pub`, verified tech publications) | 4 | Default to 4; may be upgraded in a future refinement pass |
| `medium.com` (generic user posts) | 4 | |
| `substack.com` (any) | 4 | Notable authors may warrant Tier 3 in a future refinement; default to 4 for now |
| No match / unknown | 4 | Default — never 5 from classifier |

> **Known gap**: Credible Medium publications and notable Substack authors may deserve Tier 3. The classifier defaults them to Tier 4 in Phase 1. A refinement pass is explicitly planned (see Spec 007 risks). Do not over-engineer this now.

Tier 5 is not assigned by the classifier. It is reserved for manually-flagged records with no traceable URL.

---

## Module Structure

```
src/intelligence-v3/providers/
  perplexity-adapter.ts              — PerplexitySearchProvider class
  perplexity-types.ts                — Internal API types (not exported from index)
  cloudflare-adapter.ts              — CloudflareRenderingProvider class
  cloudflare-types.ts                — Internal API types (not exported from index)
  tier-classifier.ts                 — classifySourceTier() — deterministic lookup
  __tests__/
    perplexity-adapter.test.ts       — Fixture-based unit tests (zero API calls)
    cloudflare-adapter.test.ts       — Fixture-based unit tests (zero API calls)
    tier-classifier.test.ts          — ≥ 30 URL pattern test cases
    __fixtures__/
      perplexity/                    — Mock Perplexity API response JSON
      cloudflare/                    — Mock Cloudflare snapshot response HTML
```

**No modifications** to existing files in `src/intelligence-v3/acquisition/`.

---

## Test Strategy

### Unit Tests (zero API calls — all fixture-based)

**`perplexity-adapter.test.ts`**:
- Mock `fetch()` globally. Supply fixture Perplexity API response JSON from `__fixtures__/perplexity/`.
- Assert: `choices[0].message.content` (AI synthesis) does NOT appear in any `ExternalSource.excerpt`
- Assert: returns `ExternalSource[]` matching existing type contract
- Assert: `max_tokens: 50` (not 1) is in every request body
- Assert: `return_citations: true` is in every request body
- Assert: citation count capped at 5 per query
- Assert: excerpt truncated at 500 characters
- Assert: HTTP 429 → skip query (no throw), continue to next
- Assert: fetch timeout → skip query (no throw), continue to next
- Assert: secondary fetch concurrency semaphore (mock 5 concurrent citations; assert max 3 in-flight)
- Fixture coverage: Format A response (citations with excerpts), Format B response (URL-only citations)

**`cloudflare-adapter.test.ts`**:
- Mock `fetch()` globally. Supply fixture Cloudflare snapshot responses.
- Assert: nav elements stripped from `raw_text`
- Assert: hero text in `<header>` IS preserved (not stripped)
- Assert: `<script>` and `<style>` content absent from output
- Assert: cookie banner text absent from output
- Assert: token cap enforced (output ≤ 5,000 tokens)
- Assert: fallback to plain fetch when `success: false`
- Assert: homepage fatal (`ERR_CORPUS_EMPTY` thrown on both Cloudflare and plain fetch failure)
- Assert: non-homepage failure returns `{ text: '', success: false }` without throwing
- Fixture: homepage with nav + hero + main content; pricing page with JS-rendered table

**`tier-classifier.test.ts`**:
- One test case per table row above (≥ 30 cases)
- Edge cases: `www.trustpilot.com` vs `trustpilot.com`, subdomain of target domain, empty URL, malformed URL, `medium.com` (generic), `medium.com/publication/article`

### Integration Tests (live API — explicit only, not in `npm test`)

```
src/intelligence-v3/providers/__tests__/perplexity-live.test.ts
src/intelligence-v3/providers/__tests__/cloudflare-live.test.ts
```

Excluded from default Vitest run. Run manually or in a dedicated CI job. Test against Trigger.dev.

---

## Dependencies

- No new npm packages required for core logic: native `fetch` (Node 18+), `node:crypto` (already used in `merge-corpus.ts`)
- HTML parsing: evaluate `node-html-parser` (zero native deps). Add only if no existing HTML parser is present in the project. Regex fallback is acceptable for MVP.

---

## Acceptance Criteria

1. All unit tests pass with zero API calls
2. `tsc --noEmit` passes (no TypeScript errors)
3. Existing 443 tests continue to pass (no regressions)
4. End-to-end live spike: `runV3Pipeline({ company: "Trigger.dev", domain: "trigger.dev" })` with real providers completes in < 60s
5. Zero AI-generated text in any `ExternalSource.excerpt` or `CorpusPage.raw_text` field (verified by log inspection)
6. `AcquisitionQualityReport` logged to stdout on every run

---

## Constraints

1. No new npm dependencies without justification. Prefer native Node APIs.
2. Providers are stateless classes. No instance-level cache. No mutable state beyond constructor config.
3. Providers do NOT assign `source_id`, `evidence_id`, or `source_tier`. Those are assigned downstream.
4. All credentials are environment variables. Never hardcoded, never logged.
5. Verify Cloudflare and Perplexity API shapes from live docs before writing any code.
