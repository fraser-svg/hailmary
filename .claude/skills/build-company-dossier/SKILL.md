---
description: Researches a company using public sources and produces a structured machine-readable JSON dossier with evidence-backed claims, narrative intelligence, and confidence scoring. Use when asked to build a company dossier or research a company for the intelligence engine.
trigger: build-company-dossier
arguments: company_name domain
allowed-tools: WebSearch, WebFetch, Read, Write, Bash, Glob, Grep, Edit
---

# Build Company Dossier

You are producing a machine-readable company intelligence dossier. The output is for downstream AI, not human readers. Every claim must link to evidence. Every evidence record must link to a source. Inference must be labeled. Unknown is better than guessed.

## Input

- Company name: `$ARGUMENTS` (first argument)
- Primary domain: `$ARGUMENTS` (second argument)

Parse the arguments: the first word is the company name, everything after the first space is the domain.

## Output

Write to: `runs/<slug>/dossier.json`
Then validate: `npx tsx src/validate.ts runs/<slug>/dossier.json`

The slug is the company name lowercased, with non-alphanumeric characters replaced by hyphens.

## Critical Rules

1. **Evidence linking is mandatory.** Every major claim needs `evidence_ids`. Every evidence record needs a `source_id`.
2. **Inference must be labeled.** If you infer something, set `is_inferred: true` and include `evidence_ids` and `confidence`.
3. **Unknown is better than guessed.** If evidence is sparse, use `"confidence": "low"` and add to `missing_data`. Do not fabricate.
4. **Company copy is NOT customer truth.** Company website claims are `company_claim_record` evidence. Customer testimonials/reviews are `testimonial_record`, `review_record`, `customer_language_record`. Never mix them.
5. **Narrative gaps need evidence.** For medium/high confidence: >=1 company-side claim + >=2 customer-side signals. If you can't find enough customer evidence, say so honestly with low confidence.
6. **All 16 sections required.** Even empty sections must exist with proper shape and `"confidence": "low"`.
7. **Confidence values: only `low`, `medium`, `high`.**

## Source Trust Hierarchy

- **Tier 1** (company-controlled): official website, pricing, docs, blog, press releases — strongest for company claims
- **Tier 2** (authoritative external): investors, media, regulatory — strong for external facts
- **Tier 3** (customer/market): testimonials, reviews, case studies with customer voice — strongest for customer truth
- **Tier 4** (secondary): directories, analyst blogs — weak, for discovery only
- **Tier 5** (noisy): scraped fragments, unattributed — hypothesis generation only

## Research Steps

Follow these steps in order. Be economical with searches — aim for 8-15 total WebSearch calls and 3-8 WebFetch calls.

### Step 1: Company Basics

**Goal:** Establish identity, category, stage, HQ, leadership, founded year.

WebSearch queries (pick 2-3):
- `"<company_name>" <domain> company`
- `"<company_name>" founded headquarters CEO`
- `"<company_name>" crunchbase OR linkedin`

WebFetch: Read the company homepage.

Create source records for each page visited:
```json
{
  "source_id": "src_001",
  "url": "https://...",
  "source_type": "company_homepage",
  "title": "...",
  "publisher_or_owner": "<company_name>",
  "captured_at": "<ISO timestamp>",
  "relevance_notes": ["Primary source for company description and positioning"]
}
```

Create evidence records for findings:
- `company_description_record` for what the company does
- `founding_record` for founded year
- `leadership_record` for CEO/founders
- `location_record` for HQ

### Step 2: Product and Pricing

**Goal:** Understand what they sell, how it's packaged, pricing model.

WebFetch: Read the pricing page (if it exists).
WebSearch: `"<company_name>" pricing OR plans OR packages`

Create evidence records:
- `product_record` for each distinct product/service
- `pricing_record` for pricing model observations
- `delivery_model_record` for SaaS/on-prem/etc.

### Step 3: GTM Intelligence

**Goal:** Understand sales motion, channels, buyer journey, hiring signals.

WebSearch queries (pick 2-3):
- `"<company_name>" sales demo enterprise`
- `"<company_name>" hiring jobs sales marketing`
- `"<company_name>" customers case study`

Create evidence records:
- `sales_motion_record` for sales approach signals
- `buyer_signal_record` for buyer persona indicators
- `job_posting_record` or `hiring_signal_record` for hiring signals
- `channel_record` for distribution/acquisition channels

### Step 4: Customer Voice and Evidence

**Goal:** Find what customers actually say. This is critical for narrative intelligence.

WebSearch queries (pick 2-4):
- `"<company_name>" review testimonial`
- `"<company_name>" customer story OR case study`
- `"<company_name>" G2 OR Capterra OR TrustRadius review`
- `site:g2.com "<company_name>"`

WebFetch: Read 1-2 pages with customer testimonials or reviews.

Create evidence records:
- `testimonial_record` for direct customer quotes
- `review_record` for review site findings
- `case_study_record` for case study signals
- `customer_language_record` for patterns in how customers describe value
- `customer_value_record` for what customers say they value

**Important:** Extract actual customer language, not company summaries of customer language. Note the speaker's role and company if available.

### Step 5: Competitors

**Goal:** Identify direct competitors, adjacent alternatives, and positioning overlaps.

WebSearch queries (pick 2-3):
- `"<company_name>" competitors alternatives`
- `"<company_name>" vs OR versus OR compared`
- `<company_name> alternative <category>`

Create evidence records:
- `competitor_record` for each identified competitor
- `comparison_record` for head-to-head comparisons found
- `positioning_record` for how the company positions against competition
- `differentiation_record` for claimed differentiators

### Step 6: Company Claims (for Narrative Intelligence)

**Goal:** Extract what the company claims customers should value.

Review evidence already collected from the homepage and product pages. Look for:
- Value proposition statements
- Headlines and taglines
- "Why us" language
- Feature emphasis patterns

Create evidence records:
- `company_claim_record` for each major value claim
- `positioning_record` for positioning statements
- `content_record` for messaging patterns

### Step 7: Narrative Analysis

**Goal:** Compare company claims vs customer evidence. Identify gaps.

Do NOT search further. Use the evidence you have.

Compare:
- What themes does the company emphasize? (from `company_claim_record` evidence)
- What themes do customers mention? (from `testimonial_record`, `review_record`, `customer_language_record` evidence)
- Where do they diverge meaningfully?

Rules:
- A narrative gap is NOT just different words for the same thing
- "Saves time" vs "automation" is NOT a gap — it's adjacent language
- A real gap: company says "enterprise-grade AI orchestration" but customers repeatedly say "easy to set up" and "fast time to value"
- If customer evidence is too thin, DO NOT fabricate gaps. Set `"confidence": "low"` and note "Insufficient customer-language evidence" in `missing_data`.

### Step 8: Stub Remaining Sections

For these sections, populate if you have evidence from earlier research. Otherwise stub with empty arrays and `"confidence": "low"`:
- `market_and_macro`
- `signals` (populate funding if found during research)
- `strategic_risks`

### Step 9: Assemble Confidence and Gaps

Review all sections. For each:
- If strong direct evidence: add to `high_confidence_findings`
- If reasonable interpretation: add to `medium_confidence_findings`
- If weak/sparse: add to `low_confidence_findings`
- If data is missing: add to `missing_data`
- If sections have thin support: add to `sections_with_weak_support`

Set `overall_confidence` based on the balance.

### Step 10: Assemble Dossier JSON

Build the complete JSON object with all 16 top-level fields:

1. `schema_version`: `"1.0.0"`
2. `generated_at`: current ISO 8601 timestamp
3. `company_input`: original input + resolved identity
4. `run_metadata`: run_id (use a UUID), pipeline_version `"0.1.0"`, timing, counts
5. `company_profile`: from Step 1
6. `product_and_offer`: from Step 2
7. `gtm_model`: from Step 3
8. `customer_and_personas`: from Steps 3-4
9. `competitors`: from Step 5
10. `market_and_macro`: from Step 8 (stub if needed)
11. `signals`: from Step 8 (stub if needed)
12. `narrative_intelligence`: from Steps 6-7
13. `strategic_risks`: from Step 8 (stub if needed)
14. `confidence_and_gaps`: from Step 9
15. `sources`: all source records collected
16. `evidence`: all evidence records collected

ID formats:
- Source IDs: `src_001`, `src_002`, ...
- Evidence IDs: `ev_001`, `ev_002`, ...
- Run ID: UUID format

Write the JSON to `runs/<slug>/dossier.json`. Use `mkdir -p runs/<slug>` first.

### Step 11: Validate

Run: `npx tsx src/validate.ts runs/<slug>/dossier.json`

If validation fails:
1. Read the errors
2. Fix the dossier JSON
3. Re-write it
4. Re-validate
5. Repeat until clean

Report the validation results to the user.

## Schema Quick Reference

See `references/schema-reference.md` for the full field listing.

## Evidence Type Vocabulary

See `references/evidence-types.md` for all valid evidence types.
