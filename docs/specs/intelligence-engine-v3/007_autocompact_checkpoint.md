# Spec 007 — Autocompact Checkpoint

**Created**: 2026-03-16
**Purpose**: Preserve all planning decisions, open issues, and critical feedback from the Perplexity + Cloudflare integration design session so the next session can resume without loss.

This file is a durable checkpoint. It is not a spec for implementation — it is a record of intent, decisions, and warnings.

---

## Locked Decisions

These are final. Do not relitigate them.

| Decision | Choice | Rationale |
|---|---|---|
| External research provider | Perplexity Search API (`sonar` model) | Raw results + citations, not AI synthesis |
| Site corpus provider | Cloudflare Browser Rendering REST API | Hosted, no Workers deployment in Phase 1 |
| Latency target | 45s target, 60s hard cap | Accounts for parallel acquisition + secondary citation fetches |
| Query planning | Fixed families in Phase 1 | No AcquisitionQueryPlanner; defer domain-aware planning |
| Evidence contamination | No AI-generated text in evidence layer | Absolute rule — discard Perplexity completion text |
| Spec-first process | Write specs → verify live API docs → then spike | Never implement from draft spec alone |
| Phase 1 scope | Implement providers + tier classifier + merge enhancements + schema extensions | No query planning, no persistent cache, no multi-provider routing |

---

## Architecture Summary

```
INPUT: { company, domain }
        │
        ├────────────────────────────────────────────────┐
        │  Promise.all([                                  │
        │    V3-U1: CloudflareRenderingProvider           │  V3-U2: PerplexitySearchProvider
        │    siteCorpusAcquisition()                      │  externalResearchAcquisition()
        │    10 pages max, 20K tokens                     │  7 fixed queries, 5 results each
        │  ])                                             │
        └────────────────────────────────────────────────┘
                           │
                           ▼
        V3-U3: mergeResearchCorpus() [ENHANCED]
          - Cross-corpus dedup (same URL in Cloudflare + Perplexity → keep Cloudflare)
          - Content hash dedup (same excerpt across query families)
          - tier-classifier.ts → assign canonical source_tier
          - Set content_hash on all CorpusPage records
          - Tag "stale" items (published_at > 24mo)
          - Compute AcquisitionQualityReport
                           │
                           ▼
        V3-U4: corpusToDossierAdapter() [23 TODOs, partially resolved]
          - Set "stale" tags on evidence records
          - Set "acquisition_perplexity" / "acquisition_cloudflare" tags
                           │
                           ▼
        EARLY VALIDATION GATE (new, before V2)
          - validate-core.ts on assembled dossier
          - Throw ERR_DOSSIER_INVALID on schema errors
                           │
                           ▼
        V2 REASONING SPINE (unchanged)
                           │
                           ▼
        V3 MEMO LAYER (unchanged — M1 through M6)
```

---

## Provider Specs Summary

### Perplexity (Spec 005)

- **Endpoint**: `https://api.perplexity.ai/chat/completions` — VERIFY LIVE DOCS BEFORE CODE
- **Model**: `sonar` (not `sonar-pro`)
- **`max_tokens`**: 50 (NOT 1 — use small non-trivial budget; discard completion text anyway)
- **`return_citations: true`**
- **`temperature: 0`**
- **Queries**: 7 fixed query families per run
- **Results per query**: max 5
- **Excerpt cap**: 500 characters
- **Completion text**: ALWAYS discarded — never enters evidence layer
- **Citation format**: Handle both Format A (with excerpts) and Format B (URL-only → secondary fetch)
- **Secondary fetches**: concurrency max 3 in-flight, 150ms gap, 5s timeout per fetch
- **Env var**: `PERPLEXITY_API_KEY`

### Cloudflare (Spec 005)

- **API**: Browser Rendering REST API (not Workers bindings, not `/crawl` in Phase 1)
- **Endpoint**: VERIFY LIVE DOCS — approximate: `/accounts/${CLOUDFLARE_ACCOUNT_ID}/browser-rendering/snapshot`
- **`waitUntil`**: `"networkidle2"`, timeout 9s
- **Reject**: image, media, font, stylesheet resource types
- **Content normalization**: strip nav/script/style/cookies; PRESERVE `<header>` hero/positioning text; strip nav lists within header
- **Token cap**: 5,000 tokens per page
- **Fallback**: Cloudflare failure → plain HTTP fetch → if both fail → `{ text: '', success: false }`
- **Homepage**: fatal if both Cloudflare and plain fetch fail
- **Concurrency**: max 2 in-flight (caller-side semaphore in `site-corpus.ts`)
- **Env vars**: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`

---

## Critical Feedback That Must Not Be Lost

These are corrections from the final review pass. Each one requires a concrete change in the spec or implementation.

### 1. Perplexity `max_tokens: 1` is Wrong

**Status**: Fixed in Spec 005.
**Problem**: `max_tokens: 1` risks truncating the API response before citation metadata is attached, and may produce malformed responses.
**Resolution**: Use `max_tokens: 50`. The completion text is discarded regardless. The value of 50 ensures a valid response structure including citations.

### 2. Secondary Citation Fetches Need Concurrency Control

**Status**: Fixed in Spec 005.
**Problem**: If Perplexity returns URL-only citations (Format B), naive implementation fetches them all concurrently — which could spike latency, hit rate limits, or overload small sites.
**Resolution**: Max 3 concurrent secondary fetches, 150ms minimum gap, 5s timeout. Secondary fetches count against the 45s acquisition budget.

### 3. Cloudflare API Path Must Be Verified Before Coding

**Status**: Warning added to Spec 005 in two places.
**Problem**: The endpoint path in the draft spec was inferred from Cloudflare's API conventions, not verified from live docs.
**Resolution**: Next session must read live Cloudflare Browser Rendering API docs before writing any code. The path, auth header shape, and response format must be confirmed.
**Action for next session**: Go to https://developers.cloudflare.com/ and verify Browser Rendering REST API docs.

### 4. HTML Normalization Must Not Blindly Strip `<header>`

**Status**: Fixed in Spec 005.
**Problem**: Draft spec said "strip `<header>` elements." Many company sites put their entire value proposition, hero tagline, and primary positioning statement in `<header>`. Stripping it would lose critical intelligence.
**Resolution**: Strip navigation lists WITHIN `<header>` (e.g., `<header> > nav`, `<header> ul`). Preserve paragraph text, H1–H3, and non-nav span text within `<header>`.

### 5. Raw External Content Must Never Cross Into LLM Stages

**Status**: Explicit rule added to Spec 005 (Evidence Contamination Rule) and Spec 006.
**Problem**: The contamination rule was stated for providers, but needed to be stated explicitly as an architectural boundary.
**Resolution**: Only structured `EvidencePackRecord` objects (with traced, typed excerpts) may flow into V3-M3 through V3-M5. Raw corpus content (page text, citation excerpts) stays in the upstream layer.

### 6. Latency Budget Must Account for Secondary Citation Fetches

**Status**: Fixed in Spec 005 (Latency Contract).
**Problem**: Draft latency estimate assumed all Perplexity results would include excerpts. Format B (URL-only citations) requires secondary fetches that add significant latency.
**Resolution**: Secondary fetches (max 3 concurrent, 5s timeout each) are budgeted within the 45s target. If Perplexity consistently returns Format B, the 45s target is tight. Monitor in live spike.

### 7. Tier Classifier Has Known Gaps for Medium/Substack

**Status**: Gap documented in Spec 005 (tier classifier table) and in risks below.
**Problem**: Credible Medium publications (e.g., a well-known SaaS marketing publication) and notable Substack newsletters may deserve Tier 3, but the classifier defaults them to Tier 4.
**Resolution**: Default to Tier 4 in Phase 1. Refinement explicitly planned. Do not over-engineer now — collect data from live runs first.

---

## Rollout Phases

### Phase 0 (COMPLETE — this session)
Write specs 005, 006, 007. Update 002. Capture baseline memo quality scores on eval companies before providers go live.

### Phase 1: Implementation Spike
- Step 1: Verify live API docs (Perplexity, Cloudflare) — before any code
- Step 2: Update TypeScript types (source.ts, research-corpus.ts, new acquisition-quality.ts)
- Step 3: Update JSON Schema — verify eval dossiers still pass validator
- Step 4: Implement `tier-classifier.ts` + tests (pure lookup, no API calls)
- Step 5: Implement `perplexity-adapter.ts` + fixture tests
- Step 6: Implement `cloudflare-adapter.ts` + fixture tests
- Step 7: Enhance `mergeResearchCorpus()` (cross-corpus dedup, content hash, tier assignment, stale tags)
- Step 8: Add early validation gate in `run-v3-pipeline.ts`
- Step 9: Baseline capture + live integration spike against Trigger.dev
- Step 10: Compare acquisition quality report vs goals

### Phase 2: Evidence Architecture
- Resolve ≥ 15 of 23 `corpus-to-dossier.ts` TODOs using structured Perplexity output
- `"stale"` and `"acquisition_*"` tag enforcement in `corpusToDossierAdapter()`
- Recency scoring improvement in `buildEvidencePack()`

### Phase 3: Quality Validation
- Full V3 pipeline on Stripe, Trigger.dev, Omnea
- Compare memo_quality_score vs Phase 0 baseline
- Target: ≥ +15 points, ≥ 1 company upgrades from `conditional` → `full_confidence`

### Phase 4: Hardening
- Cost tracking per run
- Rate limiting and timeout enforcement
- AcquisitionQualityReport logging
- Update `build-company-dossier` SKILL.md to reflect new pipeline

### Deferred (Do Not Build Yet)
- AcquisitionQueryPlanner (archetype-aware query planning)
- Persistent corpus caching (Cloudflare KV)
- Multi-provider routing
- Scrapling microservice fallback (for sites that block Cloudflare)
- Background corpus pre-warming
- LinkedIn / Apollo integration

---

## Implementation Order for Next Session

See Phase 1, Steps 1–10 above.

**Critical path**: Step 1 (API verification) must happen before Step 5 or 6. Do not write adapter code before reading live docs.

---

## Known Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Perplexity returns Format B (URL-only) universally | Medium | Medium — adds latency | Secondary fetch budget built in; monitor in spike |
| Cloudflare API path/auth differs from spec | High | High — blocks Phase 1 | Verify live docs before coding (Step 1) |
| Secondary fetches push past 45s target | Medium | Low | Skip citations that time out; log count in AcquisitionQualityReport |
| HTML normalization loses hero text on some sites | Medium | Medium | Test against Trigger.dev, Stripe homepages with real fixtures |
| Tier 4 assignment for credible Medium/Substack | High | Low | Documented gap; refinement in Phase 3+ |
| corpus-to-dossier TODOs still sparse after Phase 1 | High | Medium | Phase 2 explicitly resolves them |
| Evidence count inflation (same content multiple sources) | Medium | Medium | Cross-corpus + content-hash dedup handles it |
| Perplexity API shape has changed since spec was written | Medium | High | Step 1: verify live docs |

---

## Resume From Here — Instructions for Next Session

**Read these in order:**

1. Read `docs/specs/intelligence-engine-v3/005_acquisition_providers.md` — the Perplexity and Cloudflare adapter specs
2. Read `docs/specs/intelligence-engine-v3/006_evidence_schema_v2.md` — the schema extension spec
3. Read `docs/specs/intelligence-engine-v3/002_pipeline_architecture.md` — the updated pipeline architecture (DRAFT additions at bottom)
4. Read this file (007) to understand what feedback has already been incorporated and what gaps remain

**Then, before writing any code:**

5. Open the live Perplexity API documentation and verify:
   - Endpoint URL
   - `return_citations: true` behavior (does it return URL-only or structured results with excerpts?)
   - Citation format in response (Format A vs B distinction in Spec 005)
   - Whether `max_tokens: 50` works as expected (does it suppress synthesis without breaking citation return?)

6. Open the live Cloudflare Browser Rendering API documentation and verify:
   - Exact endpoint path for the REST API (not Workers bindings)
   - Authentication header shape
   - Request body fields that are actually supported
   - Response shape (especially whether `result.content` is the field name)

7. Reconcile any differences between live docs and Spec 005 into the spec before implementation

**Only after steps 1–7 are complete**: begin the implementation spike starting with `tier-classifier.ts` (Step 4 in Phase 1 — pure lookup, no API calls, easy to test).

**Most important unresolved issue**: Cloudflare Browser Rendering REST API endpoint shape must be verified against live documentation before any code is written. The spec has a reasonable approximation but it may be wrong.
