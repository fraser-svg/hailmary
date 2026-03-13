“MEXT” is commonly used to refer to Japan’s Ministry of Education, Culture, Sports, Science and Technology, so I’m treating your message as “next” in this context and continuing with the next spec. ([日本留学情報サイト Study in Japan][1])

# Spec 003: Evidence Model

## Status

Draft v1

## Purpose

Define how raw research is captured, normalized, linked, and traced into the dossier.

This spec is the bridge between:

* source collection
* agent analysis
* dossier generation
* validation

Without this layer, the system becomes a summary engine. With it, the system becomes an intelligence engine.

---

## Why this spec matters

Your product cannot rely on free-floating observations.

It must be able to say:

* what was found
* where it was found
* how it was normalized
* what claims it supports
* how trustworthy it is
* whether it is fact or inference support

The evidence model is what makes the dossier auditable, testable, and reusable.

---

## Core requirement

Every meaningful claim in the dossier must be traceable to one or more evidence records.

Every evidence record must have:

* a stable ID
* a source
* a type
* a captured excerpt or normalized finding
* timestamps
* confidence metadata
* linkability to dossier claims

---

## Design goals

The evidence model should:

1. preserve provenance
2. support many source types
3. allow structured normalization
4. support confidence and source quality
5. separate raw capture from interpreted finding
6. support downstream validation
7. make inference support visible

---

## Evidence model layers

### Layer 1: Source

A source is the original location the information came from.

Examples:

* company homepage
* pricing page
* case study page
* job posting
* funding announcement
* podcast transcript
* review page
* blog post
* founder interview
* competitor website

### Layer 2: Evidence record

An evidence record is a normalized unit extracted from a source.

Examples:

* one pricing detail
* one testimonial statement
* one hiring signal
* one product claim
* one funding event
* one competitor positioning claim

### Layer 3: Claim support

A dossier claim references one or more evidence records through `evidence_ids`.

---

## Core entities

### 1. Source record

A source record describes the origin.

```json
{
  "source_id": "src_001",
  "url": "https://example.com/pricing",
  "source_type": "pricing_page",
  "title": "Pricing",
  "publisher_or_owner": "Example Co",
  "captured_at": "2026-03-12T14:10:00Z",
  "language": "en",
  "access_type": "public_web",
  "relevance_notes": [
    "Primary source for pricing model"
  ]
}
```

### 2. Evidence record

An evidence record is the main atomic object in this spec.

```json
{
  "evidence_id": "ev_001",
  "source_id": "src_001",
  "evidence_type": "pricing_record",
  "captured_at": "2026-03-12T14:11:00Z",
  "excerpt": "Contact sales for enterprise pricing",
  "summary": "Pricing is not public and appears sales-led",
  "normalized_fields": {
    "pricing_visibility": "not_public",
    "pricing_model_signal": "enterprise_sales_led"
  },
  "source_quality": "high",
  "confidence": "high",
  "is_inferred": false,
  "supports_claims": [
    "product_and_offer.pricing_model",
    "gtm_model.sales_motion"
  ],
  "tags": [
    "pricing",
    "sales_motion"
  ]
}
```

---

## Canonical evidence schema

Every evidence record should follow this base shape:

```json
{
  "evidence_id": "",
  "source_id": "",
  "evidence_type": "",
  "captured_at": "",
  "excerpt": "",
  "summary": "",
  "normalized_fields": {},
  "source_quality": "low",
  "confidence": "low",
  "is_inferred": false,
  "supports_claims": [],
  "tags": []
}
```

---

## Field definitions

### `evidence_id`

Type: `string`

Unique stable identifier for the evidence record.

Rule:

* unique within a run
* deterministic IDs are preferred if feasible later
* required

---

### `source_id`

Type: `string`

Links evidence back to a source record.

Rule:

* every evidence record must point to a valid source

---

### `evidence_type`

Type: `string`

Defines what kind of evidence this is.

Allowed values in V1 should come from a controlled vocabulary.

---

### `captured_at`

Type: `string` in ISO 8601 format

When the evidence record was created.

---

### `excerpt`

Type: `string`

A short direct capture from the source.

Purpose:

* auditability
* validation
* downstream inspection

Rule:

* should be concise
* should not be empty unless the source is purely structured metadata

---

### `summary`

Type: `string`

A clean normalized statement of what the evidence means.

Rule:

* should stay close to source meaning
* should not include unsupported analysis

---

### `normalized_fields`

Type: `object`

Holds structured fields relevant to the evidence type.

This is where type-specific detail lives.

---

### `source_quality`

Type: enum

Allowed values:

* `low`
* `medium`
* `high`

Purpose:
Represents trustworthiness of the source itself.

Example logic:

* company pricing page = high
* third-party summary blog = medium
* weak directory listing = low

---

### `confidence`

Type: enum

Allowed values:

* `low`
* `medium`
* `high`

Purpose:
Represents confidence in the normalized evidence interpretation.

Important:
`source_quality` and `confidence` are not the same.

---

### `is_inferred`

Type: `boolean`

Indicates whether the evidence record is directly extracted or partly inferred.

Rule:

* direct source extraction = `false`
* synthesis/inference evidence = `true`

---

### `supports_claims`

Type: `array[string]`

Lists which dossier fields or claim paths this evidence supports.

Example:

* `company_profile.company_stage`
* `narrative_intelligence.customer_expressed_value`
* `competitors.direct_competitors`

---

### `tags`

Type: `array[string]`

Simple search and grouping helpers.

Examples:

* `pricing`
* `testimonial`
* `funding`
* `customer_language`
* `competitor`
* `macro`

---

## Controlled vocabulary for `evidence_type`

V1 should use a fixed set.

### Company basics

* `company_description_record`
* `founding_record`
* `leadership_record`
* `location_record`
* `ownership_record`

### Product and offer

* `product_record`
* `service_record`
* `pricing_record`
* `delivery_model_record`
* `implementation_record`

### GTM

* `sales_motion_record`
* `channel_record`
* `content_record`
* `buyer_signal_record`
* `job_posting_record`

### Customer

* `testimonial_record`
* `review_record`
* `case_study_record`
* `persona_signal_record`
* `pain_point_record`
* `outcome_record`
* `customer_language_record`

### Competitors

* `competitor_record`
* `positioning_record`
* `comparison_record`
* `differentiation_record`

### Signals

* `funding_record`
* `product_launch_record`
* `leadership_change_record`
* `press_record`
* `hiring_signal_record`

### Market and macro

* `market_trend_record`
* `regulatory_record`
* `economic_exposure_record`
* `political_exposure_record`
* `technology_shift_record`
* `ecosystem_dependency_record`

### Narrative intelligence

* `company_claim_record`
* `customer_value_record`
* `narrative_gap_support_record`
* `hidden_differentiator_record`

### Risk

* `strategic_risk_record`
* `dependency_risk_record`
* `positioning_risk_record`

---

## Type-specific normalized fields

Each evidence type can extend `normalized_fields`.

### Example: `testimonial_record`

```json
{
  "normalized_fields": {
    "speaker_name": "",
    "speaker_role": "",
    "speaker_company": "",
    "value_theme": "",
    "customer_language_phrases": [],
    "mentioned_outcomes": [],
    "emotional_signals": []
  }
}
```

### Example: `pricing_record`

```json
{
  "normalized_fields": {
    "pricing_visibility": "public",
    "pricing_model": "per_seat",
    "starting_price": "",
    "billing_terms": "",
    "enterprise_signal": false
  }
}
```

### Example: `job_posting_record`

```json
{
  "normalized_fields": {
    "role_title": "",
    "department": "",
    "location": "",
    "seniority": "",
    "signal_interpretation": ""
  }
}
```

### Example: `funding_record`

```json
{
  "normalized_fields": {
    "round": "",
    "amount": "",
    "currency": "",
    "date": "",
    "investors": []
  }
}
```

### Example: `competitor_record`

```json
{
  "normalized_fields": {
    "competitor_name": "",
    "competitor_domain": "",
    "relationship_type": "direct",
    "why_included": "",
    "positioning_summary": ""
  }
}
```

### Example: `customer_language_record`

```json
{
  "normalized_fields": {
    "phrase": "",
    "theme": "",
    "source_context": "",
    "interpretation": ""
  }
}
```

---

## Source quality rules

Use a simple V1 hierarchy.

### High quality

Primary sources or highly authoritative sources.

Examples:

* company website
* pricing page
* official press release
* founder interview on official channels
* investor announcement
* original case study
* product documentation

### Medium quality

Reasonably trustworthy secondary sources.

Examples:

* reputable industry media
* job boards
* review aggregators
* independent podcasts
* software directories

### Low quality

Weak, noisy, or hard-to-verify sources.

Examples:

* scraped directory fragments
* unattributed reposts
* weak SEO pages
* low-context mentions

Rule:
Low-quality sources can support hypotheses, but should rarely anchor major claims alone.

---

## Confidence rules for evidence

Confidence reflects how sure the system is that the evidence has been interpreted correctly.

### High confidence

* clear direct statement
* low ambiguity
* source strongly matches the interpretation

### Medium confidence

* useful signal but partial ambiguity
* some inference required

### Low confidence

* weak signal
* ambiguous wording
* indirect support only

---

## Raw capture vs normalized evidence

The system should preserve both, conceptually.

### Raw capture

What was collected from the source.

Examples:

* page text
* extracted snippet
* parsed metadata
* scraped heading

### Normalized evidence

A structured intelligence unit derived from that raw capture.

Spec 003 governs the normalized evidence layer.

Raw storage can live separately in files or run artifacts.

---

## Evidence creation rules

### Rule 1

Create one evidence record per meaningful atomic finding.

Do not pack five separate facts into one record unless they are inseparable.

### Rule 2

Evidence records should be reusable across sections.

A pricing record might support:

* `product_and_offer`
* `gtm_model`

### Rule 3

Do not convert broad speculation into evidence.

Evidence must remain close to the source.

### Rule 4

Inference support records are allowed, but must be labeled.

Example:
A `narrative_gap_support_record` may synthesize multiple testimonial and company-claim records.

### Rule 5

Evidence records should be concise and typed.

This is not the place for essay-style reasoning.

---

## Claim support model

A dossier claim may be supported by:

* one direct evidence record
* multiple evidence records
* a synthesis evidence record built from multiple evidence records

### Example

Claim:
`gtm_model.sales_motion.value = "sales_led"`

Support:

* `ev_010` pricing record
* `ev_021` demo CTA record
* `ev_034` SDR hiring record

This makes the claim inspectable and testable.

---

## Narrative intelligence evidence rules

Because your product is built around narrative truth, this area needs special handling.

### Company-claimed value evidence

Use:

* homepage headlines
* product copy
* category language
* value proposition statements
* founder messaging

Relevant evidence types:

* `company_claim_record`
* `positioning_record`
* `content_record`

### Customer-expressed value evidence

Use:

* testimonials
* case studies
* reviews
* recommendation-style language
* social proof where available

Relevant evidence types:

* `testimonial_record`
* `review_record`
* `customer_value_record`
* `customer_language_record`

### Narrative gap support evidence

A gap should usually be supported by:

* at least one company-side claim record
* at least two customer-side value or language records

This is a recommended V1 threshold.

---

## Minimum evidence thresholds for major dossier sections

These are product rules, not absolute truth rules.

### Company profile

At least 2 evidence records

### Product and offer

At least 2 evidence records

### GTM model

At least 2 evidence records, with at least 1 commercial signal if possible

### Competitors

At least 1 evidence record per named competitor

### Narrative intelligence

At least:

* 1 company-claim record
* 2 customer-side records
  for any asserted narrative gap

If threshold is not met, the section should still appear, but confidence should remain low and missing data should be flagged.

---

## Evidence deduplication rules

The system should deduplicate near-identical findings from the same source.

Do not create multiple records for the same exact pricing statement unless:

* the page changed over time
* multiple distinct normalized meanings are needed

Preferred behavior:

* one evidence record
* multiple tags or supported claims

---

## Evidence conflict handling

Conflicts must not be hidden.

If two evidence records conflict:

* both records remain
* the contradiction is surfaced in `confidence_and_gaps.conflicting_evidence`
* section confidence may be lowered

Example conflicts:

* two different founded years
* unclear pricing model
* conflicting category labels

---

## Relationship between `sources` and `evidence`

Keep them separate in V1.

### `sources`

Describe origin.

### `evidence`

Describe extracted intelligence units.

One source can produce many evidence records.

This separation is cleaner and makes reuse easier.

---

## Validation requirements

Spec 003 should drive these validations:

1. every evidence record has a valid `source_id`
2. every `supports_claims` path references a valid dossier field
3. every major dossier claim links to evidence
4. every inferred record is marked `is_inferred: true`
5. every confidence value is in enum
6. every source referenced by evidence exists
7. no orphan evidence records without source linkage
8. evidence IDs are unique

---

## Success criteria

Spec 003 is successful when:

* the system can trace major claims back to evidence
* evidence is typed and reusable
* downstream AI can inspect support quality
* facts and synthesis remain distinguishable
* narrative gap findings are supportable rather than hand-wavy
* validation can catch missing provenance

---

## Failure modes

The evidence model fails if:

* evidence is just loose notes
* records do not point to sources
* one record contains too many unrelated facts
* inference is mixed with extraction without labels
* major claims appear with no support
* narrative gap findings are asserted without customer-language support

---

## What you should do with this spec

Put it in:

```text
/docs/specs/003-evidence-model.md
```

Then create implementation tasks from it:

* define `source` type
* define `evidence` type
* define controlled vocabulary for `evidence_type`
* build evidence ID generator
* build claim-path validator
* build source-to-evidence linker
* build contradiction detector stub
* build minimum-threshold checks

Then update your repo rules so Claude Code knows:

* no unsupported claims
* all evidence must link to a source
* all major findings must carry evidence IDs
* narrative gaps require both company-side and customer-side support

