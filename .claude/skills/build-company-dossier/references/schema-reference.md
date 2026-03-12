# Dossier Schema Reference

Quick reference for all 16 top-level dossier fields and their required nested structures.

## Top-Level Fields (all required)

| # | Field | Type |
|---|-------|------|
| 1 | `schema_version` | `"1.0.0"` (const) |
| 2 | `generated_at` | ISO 8601 string |
| 3 | `company_input` | object |
| 4 | `run_metadata` | object |
| 5 | `company_profile` | object |
| 6 | `product_and_offer` | object |
| 7 | `gtm_model` | object |
| 8 | `customer_and_personas` | object |
| 9 | `competitors` | object |
| 10 | `market_and_macro` | object |
| 11 | `signals` | object |
| 12 | `narrative_intelligence` | object |
| 13 | `strategic_risks` | object |
| 14 | `confidence_and_gaps` | object |
| 15 | `sources` | array of SourceRecord |
| 16 | `evidence` | array of EvidenceRecord |

## company_input

```
company_name: string
primary_domain: string
resolved_company_name: string
resolved_domain: string
aliases: string[]
```

## run_metadata

```
run_id: string (UUID)
pipeline_version: string
collection_started_at: string (ISO 8601)
collection_finished_at: string (ISO 8601)
source_count: integer
evidence_record_count: integer
notes: string[]
```

## company_profile

```
plain_language_description: string
category: string
subcategories: string[]
founded_year: integer | null
company_stage: { value, is_inferred, confidence }
headquarters: string
geographic_presence: string[]
leadership: [{ name, title, evidence_ids }]
ownership_or_structure_notes: string[]
evidence_ids: string[]
confidence: "low" | "medium" | "high"
```

## product_and_offer

```
core_offer_summary: string
products_or_services: [{ name, type, description, target_user, evidence_ids }]
pricing_model: { value, details, is_public, is_inferred, evidence_ids }
pricing_signals: string[]
delivery_model: string[]
implementation_complexity: { value, is_inferred, confidence }
evidence_ids: string[]
confidence: "low" | "medium" | "high"
```

## gtm_model

```
sales_motion: { value, is_inferred, confidence }
acquisition_channels: string[]
buyer_journey_notes: string[]
distribution_model: string[]
territory_or_market_focus: string[]
growth_signals: string[]
hiring_signals: [{ role_title, department, signal, evidence_ids }]
content_and_positioning_hooks: string[]
gtm_observations: string[]
evidence_ids: string[]
confidence: "low" | "medium" | "high"
```

## customer_and_personas

```
ideal_customer_profile: { company_size[], industries[], geographies[], traits[], is_inferred, evidence_ids }
buyer_personas: [{ title, department, seniority, role_in_purchase, pain_points[], desired_outcomes[], evidence_ids, is_inferred }]
end_user_personas: [same shape as buyer_personas]
customer_pain_themes: string[]
customer_outcome_themes: string[]
case_study_signals: string[]
evidence_ids: string[]
confidence: "low" | "medium" | "high"
```

## competitors

```
direct_competitors: [{ name, domain, why_included, positioning_summary, comparison_notes[], evidence_ids }]
adjacent_competitors: [same shape]
substitutes: [same shape]
claimed_differentiators: string[]
positioning_overlaps: string[]
competitive_gaps: string[]
competitive_observations: string[]
evidence_ids: string[]
confidence: "low" | "medium" | "high"
```

## market_and_macro

```
market_category: string
market_dynamics: string[]
industry_trends: string[]
economic_sensitivity: string[]
regulatory_exposure: string[]
political_or_geopolitical_exposure: string[]
technology_shift_risks: string[]
ecosystem_dependencies: string[]
macro_observations: string[]
evidence_ids: string[]
confidence: "low" | "medium" | "high"
```

## signals

```
funding: [{ date, amount, round, investors[], evidence_ids }]
product_launches: [{ date, title, summary, evidence_ids }]
leadership_changes: [{ date, person, role, change_type, evidence_ids }]
press_and_content: [{ date, type, title, summary, evidence_ids }]
notable_hiring: string[]
signal_summary: string[]
confidence: "low" | "medium" | "high"
```

## narrative_intelligence

```
company_claimed_value: [{ theme, description, language_examples[], evidence_ids }]
customer_expressed_value: [{ theme, description, language_examples[], source_types[], evidence_ids }]
customer_language_patterns: [{ pattern, interpretation, evidence_ids }]
narrative_gaps: [{ gap_name, company_language[], customer_language[], gap_description, likely_business_impact[], suggested_repositioning_direction, evidence_ids, confidence }]
hidden_differentiators: string[]
messaging_opportunities: string[]
narrative_summary: string
confidence: "low" | "medium" | "high"
```

**Narrative gap rules:**
- Medium/high confidence requires: >=1 company_language + >=2 customer_language
- If customer evidence is thin: use `"confidence": "low"` and note in missing_data

## strategic_risks

```
positioning_risks: string[]
gtm_risks: string[]
competitive_risks: string[]
market_risks: string[]
dependency_risks: string[]
risk_observations: [{ risk, description, severity, is_inferred, evidence_ids }]
confidence: "low" | "medium" | "high"
```

## confidence_and_gaps

```
high_confidence_findings: string[]
medium_confidence_findings: string[]
low_confidence_findings: string[]
missing_data: string[]
conflicting_evidence: string[]
sections_with_weak_support: string[]
overall_confidence: "low" | "medium" | "high"
```

## Source Record Shape

```
source_id: "src_001" format
url: string
source_type: string
title: string
publisher_or_owner: string
captured_at: ISO 8601 string
relevance_notes: string[]
```

## Evidence Record Shape

```
evidence_id: "ev_001" format
source_id: "src_001" format (must resolve)
evidence_type: string (from controlled vocabulary)
captured_at: ISO 8601 string
excerpt: string
summary: string
normalized_fields: object
source_quality: "low" | "medium" | "high"
confidence: "low" | "medium" | "high"
is_inferred: boolean
supports_claims: string[]
tags: string[]
```
