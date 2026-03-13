# Spec 002: Dossier Schema

## Status

Draft v1

## Purpose

Define the canonical machine-readable output for the Company Intelligence Engine.

This schema is the **contract** between:

* the research pipeline
* the specialist agents
* the synthesis layer
* the downstream AI that will interpret the result

The dossier schema must be:

* consistent across runs
* easy to validate
* easy for AI to parse
* explicit about evidence, confidence, and inference

This is **not** a presentation format.
It is the product’s core intelligence object.

---

## Design Goals

The dossier schema should:

1. represent the company clearly and in plain language
2. preserve source-backed evidence
3. separate facts from inference
4. expose uncertainty and missing data
5. make narrative intelligence a first-class section
6. support future extensions without breaking the core contract

---

## Schema Principles

### 1. Canonical shape

Every dossier should follow the same top-level structure.

### 2. Evidence-backed claims

Important claims should be traceable to one or more evidence records.

### 3. Explicit inference

Any inferred finding must be marked as inferred.

### 4. Confidence is mandatory

Every major section should include confidence information.

### 5. Missing data should be visible

The system should state what it could not determine.

### 6. AI-first readability

Field names and structures should optimize for downstream interpretation, not human polish.

---

## Top-Level Schema

Every dossier should contain the following top-level fields:

```json
{
  "schema_version": "1.0.0",
  "generated_at": "",
  "company_input": {},
  "run_metadata": {},
  "company_profile": {},
  "product_and_offer": {},
  "gtm_model": {},
  "customer_and_personas": {},
  "competitors": {},
  "market_and_macro": {},
  "signals": {},
  "narrative_intelligence": {},
  "strategic_risks": {},
  "confidence_and_gaps": {},
  "sources": []
}
```

---

## 1. `schema_version`

### Type

`string`

### Purpose

Identifies the version of the dossier contract.

### Example

```json
"schema_version": "1.0.0"
```

---

## 2. `generated_at`

### Type

`string` in ISO 8601 format

### Purpose

Timestamp of dossier generation.

### Example

```json
"generated_at": "2026-03-12T14:05:00Z"
```

---

## 3. `company_input`

### Type

`object`

### Purpose

Stores the original user input and resolved identity.

### Fields

```json
{
  "company_name": "",
  "primary_domain": "",
  "resolved_company_name": "",
  "resolved_domain": "",
  "aliases": []
}
```

### Notes

This allows the system to distinguish between what was entered and what was resolved during research.

---

## 4. `run_metadata`

### Type

`object`

### Purpose

Tracks run context for debugging, reproducibility, and evaluation.

### Fields

```json
{
  "run_id": "",
  "pipeline_version": "",
  "collection_started_at": "",
  "collection_finished_at": "",
  "source_count": 0,
  "evidence_record_count": 0,
  "notes": []
}
```

---

## 5. `company_profile`

### Type

`object`

### Purpose

Stores core company identity.

### Fields

```json
{
  "plain_language_description": "",
  "category": "",
  "subcategories": [],
  "founded_year": null,
  "company_stage": {
    "value": "",
    "is_inferred": false,
    "confidence": "low"
  },
  "headquarters": "",
  "geographic_presence": [],
  "leadership": [
    {
      "name": "",
      "title": "",
      "evidence_ids": []
    }
  ],
  "ownership_or_structure_notes": [],
  "evidence_ids": [],
  "confidence": "low"
}
```

---

## 6. `product_and_offer`

### Type

`object`

### Purpose

Describes what the company sells and how it packages the offer.

### Fields

```json
{
  "core_offer_summary": "",
  "products_or_services": [
    {
      "name": "",
      "type": "",
      "description": "",
      "target_user": "",
      "evidence_ids": []
    }
  ],
  "pricing_model": {
    "value": "",
    "details": "",
    "is_public": false,
    "is_inferred": false,
    "evidence_ids": []
  },
  "pricing_signals": [],
  "delivery_model": [],
  "implementation_complexity": {
    "value": "",
    "is_inferred": false,
    "evidence_ids": []
  },
  "evidence_ids": [],
  "confidence": "low"
}
```

---

## 7. `gtm_model`

### Type

`object`

### Purpose

Captures how the company appears to go to market.

### Fields

```json
{
  "sales_motion": {
    "value": "",
    "is_inferred": false,
    "evidence_ids": []
  },
  "acquisition_channels": [],
  "buyer_journey_notes": [],
  "distribution_model": [],
  "territory_or_market_focus": [],
  "growth_signals": [],
  "hiring_signals": [
    {
      "role_title": "",
      "department": "",
      "signal": "",
      "evidence_ids": []
    }
  ],
  "content_and_positioning_hooks": [],
  "gtm_observations": [],
  "evidence_ids": [],
  "confidence": "low"
}
```

---

## 8. `customer_and_personas`

### Type

`object`

### Purpose

Defines likely buyers, users, and pains.

### Fields

```json
{
  "ideal_customer_profile": {
    "company_size": [],
    "industries": [],
    "geographies": [],
    "traits": [],
    "is_inferred": false,
    "evidence_ids": []
  },
  "buyer_personas": [
    {
      "title": "",
      "department": "",
      "seniority": "",
      "role_in_purchase": "",
      "pain_points": [],
      "desired_outcomes": [],
      "evidence_ids": [],
      "is_inferred": false
    }
  ],
  "end_user_personas": [],
  "customer_pain_themes": [],
  "customer_outcome_themes": [],
  "case_study_signals": [],
  "evidence_ids": [],
  "confidence": "low"
}
```

---

## 9. `competitors`

### Type

`object`

### Purpose

Stores the competitive landscape and positioning context.

### Fields

```json
{
  "direct_competitors": [
    {
      "name": "",
      "domain": "",
      "why_included": "",
      "positioning_summary": "",
      "comparison_notes": [],
      "evidence_ids": []
    }
  ],
  "adjacent_competitors": [],
  "substitutes": [],
  "claimed_differentiators": [],
  "positioning_overlaps": [],
  "competitive_gaps": [],
  "competitive_observations": [],
  "evidence_ids": [],
  "confidence": "low"
}
```

---

## 10. `market_and_macro`

### Type

`object`

### Purpose

Describes the external environment around the company.

### Fields

```json
{
  "market_category": "",
  "market_dynamics": [],
  "industry_trends": [],
  "economic_sensitivity": [],
  "regulatory_exposure": [],
  "political_or_geopolitical_exposure": [],
  "technology_shift_risks": [],
  "ecosystem_dependencies": [],
  "macro_observations": [],
  "evidence_ids": [],
  "confidence": "low"
}
```

---

## 11. `signals`

### Type

`object`

### Purpose

Captures recent visible signals of change, growth, or pressure.

### Fields

```json
{
  "funding": [
    {
      "date": "",
      "amount": "",
      "round": "",
      "investors": [],
      "evidence_ids": []
    }
  ],
  "product_launches": [
    {
      "date": "",
      "title": "",
      "summary": "",
      "evidence_ids": []
    }
  ],
  "leadership_changes": [
    {
      "date": "",
      "person": "",
      "role": "",
      "change_type": "",
      "evidence_ids": []
    }
  ],
  "press_and_content": [
    {
      "date": "",
      "type": "",
      "title": "",
      "summary": "",
      "evidence_ids": []
    }
  ],
  "notable_hiring": [],
  "signal_summary": [],
  "confidence": "low"
}
```

---

## 12. `narrative_intelligence`

### Type

`object`

### Purpose

This is the core differentiator of the system.

It captures:

* what the company says customers buy
* what customers appear to say they buy
* where the mismatch exists
* what that mismatch may mean strategically

### Fields

```json
{
  "company_claimed_value": [
    {
      "theme": "",
      "description": "",
      "language_examples": [],
      "evidence_ids": []
    }
  ],
  "customer_expressed_value": [
    {
      "theme": "",
      "description": "",
      "language_examples": [],
      "source_types": [],
      "evidence_ids": []
    }
  ],
  "customer_language_patterns": [
    {
      "pattern": "",
      "interpretation": "",
      "evidence_ids": []
    }
  ],
  "narrative_gaps": [
    {
      "gap_name": "",
      "company_language": [],
      "customer_language": [],
      "gap_description": "",
      "likely_business_impact": [],
      "suggested_repositioning_direction": "",
      "evidence_ids": [],
      "confidence": "low"
    }
  ],
  "hidden_differentiators": [],
  "messaging_opportunities": [],
  "narrative_summary": "",
  "confidence": "low"
}
```

---

## 13. `strategic_risks`

### Type

`object`

### Purpose

Surfaces strategic vulnerabilities visible from the evidence.

### Fields

```json
{
  "positioning_risks": [],
  "gtm_risks": [],
  "competitive_risks": [],
  "market_risks": [],
  "dependency_risks": [],
  "risk_observations": [
    {
      "risk": "",
      "description": "",
      "severity": "low",
      "is_inferred": false,
      "evidence_ids": []
    }
  ],
  "confidence": "low"
}
```

---

## 14. `confidence_and_gaps`

### Type

`object`

### Purpose

Makes uncertainty visible.

### Fields

```json
{
  "high_confidence_findings": [],
  "medium_confidence_findings": [],
  "low_confidence_findings": [],
  "missing_data": [],
  "conflicting_evidence": [],
  "sections_with_weak_support": [],
  "overall_confidence": "low"
}
```

---

## 15. `sources`

### Type

`array`

### Purpose

Stores normalized source references for auditability and downstream tracing.

### Fields per source

```json
{
  "source_id": "",
  "url": "",
  "source_type": "",
  "title": "",
  "publisher_or_owner": "",
  "captured_at": "",
  "relevance_notes": []
}
```

---

## Evidence Linking Rules

### Rule 1

Every major claim should reference one or more `evidence_ids`.

### Rule 2

Every `evidence_id` must map back to a normalized evidence record defined in Spec 003.

### Rule 3

If a finding has no supporting evidence, it must not be stated as fact.

### Rule 4

If something is inferred, it must include:

* `is_inferred: true`
* supporting `evidence_ids`
* confidence value

---

## Confidence Rules

Use a simple enum in V1:

```json
"confidence": "low"
```

Allowed values:

* `low`
* `medium`
* `high`

Later versions can add numeric scoring, but this is enough for V1.

---

## Required vs Optional Fields

### Required top-level fields

All top-level fields listed in this spec are required.

### Required section behavior

A section can be present even if data is weak, but it must still appear.

Example:

```json
"market_and_macro": {
  "market_category": "",
  "market_dynamics": [],
  "industry_trends": [],
  "economic_sensitivity": [],
  "regulatory_exposure": [],
  "political_or_geopolitical_exposure": [],
  "technology_shift_risks": [],
  "ecosystem_dependencies": [],
  "macro_observations": [],
  "evidence_ids": [],
  "confidence": "low"
}
```

This matters because downstream AI needs **consistent shape**, even when evidence is sparse.

---

## Non-Goals of the Schema

This schema is not designed to:

* be elegant for a human reader
* replace raw evidence storage
* encode every possible future enrichment field
* provide final recommendations in prose-heavy form

It is designed to be a **stable intelligence contract**.

---

## Success Criteria

Spec 002 is successful when:

1. every run produces the same top-level structure
2. downstream AI can reliably parse all core sections
3. claims can be traced back to evidence
4. inference is clearly labeled
5. narrative intelligence is represented as a first-class output
6. empty or weakly supported sections remain visible instead of disappearing

---

## Open Questions

These move to later specs:

1. What exact evidence record schema should support `evidence_ids`?
2. Should `sources` and `evidence` remain separate or merge later?
3. Should confidence scoring become numeric?
4. What is the minimum evidence threshold for a narrative gap claim?
5. How should contradictions between sources be represented?

---