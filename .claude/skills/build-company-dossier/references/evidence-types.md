# Evidence Type Vocabulary

All valid values for `evidence_type` in evidence records. Using types outside this list will produce a validation warning.

## Company Basics
- `company_description_record` — what the company does
- `founding_record` — founded year, origin story
- `leadership_record` — CEO, founders, key executives
- `location_record` — HQ, offices, geographic presence
- `ownership_record` — ownership structure, investors

## Product and Offer
- `product_record` — individual product or service
- `service_record` — service offering
- `pricing_record` — pricing model, plans, tiers
- `delivery_model_record` — SaaS, on-prem, hybrid
- `implementation_record` — implementation complexity, onboarding

## GTM
- `sales_motion_record` — sales-led, PLG, hybrid signals
- `channel_record` — acquisition/distribution channels
- `content_record` — content marketing, positioning hooks
- `buyer_signal_record` — buyer persona indicators
- `job_posting_record` — job listings as GTM signals

## Customer
- `testimonial_record` — direct customer testimonial quotes
- `review_record` — review site findings (G2, Capterra, etc.)
- `case_study_record` — case study signals and outcomes
- `persona_signal_record` — ICP and persona indicators
- `pain_point_record` — customer pain points
- `outcome_record` — customer outcomes and results
- `customer_language_record` — how customers describe value in their own words

## Competitors
- `competitor_record` — identified competitor
- `positioning_record` — positioning statement or claim
- `comparison_record` — head-to-head comparison
- `differentiation_record` — claimed or observed differentiator

## Signals
- `funding_record` — funding rounds, amounts, investors
- `product_launch_record` — product launches, major updates
- `leadership_change_record` — leadership changes
- `press_record` — press coverage, media mentions
- `hiring_signal_record` — hiring patterns as business signals

## Market and Macro
- `market_trend_record` — market category trends
- `regulatory_record` — regulatory exposure
- `economic_exposure_record` — economic sensitivity
- `political_exposure_record` — political/geopolitical exposure
- `technology_shift_record` — technology shift risks
- `ecosystem_dependency_record` — ecosystem dependencies

## Narrative Intelligence
- `company_claim_record` — what the company claims customers value (from company-controlled sources)
- `customer_value_record` — what customers say they value (from customer sources)
- `narrative_gap_support_record` — synthesis evidence supporting a narrative gap finding
- `hidden_differentiator_record` — differentiator customers mention that the company doesn't emphasize

## Risk
- `strategic_risk_record` — strategic vulnerability
- `dependency_risk_record` — dependency risk
- `positioning_risk_record` — positioning risk

---

**Total: 44 types**

When creating evidence records, always use the most specific type available. If nothing fits, use the closest match and note the limitation in the `tags` field.
