# Spec 005: Agent Contracts

## Status

Draft v1

## Purpose

Define the specialist agents in the Company Intelligence Engine and the contract each one must obey.

This spec exists to prevent the system from becoming one oversized, inconsistent research agent.

Each agent should have:

* a narrow responsibility
* clear inputs
* a defined output shape
* rules for evidence use
* handoff expectations
* failure behavior

This keeps the pipeline modular, testable, and easier to improve.

---

## Why this spec matters

Without agent contracts, the system will drift into:

* overlapping responsibilities
* duplicated work
* inconsistent reasoning
* weak provenance
* unstable output structure

With agent contracts, each stage becomes legible:

* what this agent is responsible for
* what it is not allowed to do
* what evidence it consumes
* what object it returns

---

## Core principle

Agents do not own the product.

The **schema** owns the product.
The **evidence model** owns support.
The **source priority rules** govern trust.
Agents are workers that transform inputs into structured outputs.

Each agent must be replaceable without changing the overall dossier contract.

---

## Agent design principles

### 1. Narrow responsibility

Each agent should do one domain well.

### 2. Structured output

Each agent must return structured data, not open-ended prose.

### 3. Evidence-linked findings

Each important claim must include `evidence_ids`.

### 4. No hidden synthesis

If an agent infers, it must label the inference.

### 5. Graceful failure

If the agent cannot determine something, it should return uncertainty, not improvise.

### 6. Handoff discipline

Each agent should return an output that the synthesizer can merge without ambiguity.

---

## V1 agent set

V1 should use six core agents:

1. **Identity Resolution Agent**
2. **Company Profile Agent**
3. **GTM Intelligence Agent**
4. **Competitor Intelligence Agent**
5. **Narrative Intelligence Agent**
6. **Market and Risk Agent**
7. **Dossier Synthesizer Agent**

If you want to keep V1 tighter, you can merge Identity Resolution into Company Profile, but this spec treats it as separate because identity mistakes poison the whole run.

---

# Global contract for all agents

Every agent must follow this base contract.

## Base input contract

Each agent receives some combination of:

```json
{
  "company_input": {
    "company_name": "",
    "primary_domain": ""
  },
  "resolved_identity": {},
  "source_records": [],
  "evidence_records": [],
  "upstream_outputs": {}
}
```

## Base output contract

Each agent returns:

```json
{
  "agent_name": "",
  "status": "success",
  "summary": "",
  "findings": {},
  "new_evidence_records": [],
  "warnings": [],
  "missing_data": [],
  "confidence": "low"
}
```

## Allowed `status` values

* `success`
* `partial`
* `failed`

## Base rules

* return structured findings only
* do not invent missing data
* create evidence records for meaningful new findings
* attach `evidence_ids` to important claims
* surface missing data explicitly
* downgrade confidence when evidence is sparse or conflicting

---

# Agent 1: Identity Resolution Agent

## Purpose

Resolve the correct company identity before deeper research begins.

## Why it exists

Many companies have:

* ambiguous names
* multiple domains
* parent/sub-brand confusion
* product-brand mismatch

This agent reduces false research.

## Responsibilities

* confirm canonical company name
* confirm canonical domain
* identify aliases, product names, and sub-brands if relevant
* identify likely category label at a very high level
* flag ambiguity

## Inputs

* `company_input`

## Outputs

```json
{
  "resolved_company_name": "",
  "resolved_domain": "",
  "aliases": [],
  "product_names": [],
  "brand_relationship_notes": [],
  "category_hint": "",
  "ambiguity_flags": [],
  "evidence_ids": [],
  "confidence": "low"
}
```

## Evidence types commonly created

* `company_description_record`
* `product_record`
* `location_record`

## Allowed behaviors

* use high-confidence public signals to resolve identity
* flag unresolved ambiguity

## Disallowed behaviors

* do not perform deep GTM or competitor analysis
* do not infer stage
* do not speculate about parent-company relationships without support

## Failure behavior

If ambiguity remains, return:

* `status: partial`
* ambiguity flags
* low confidence

The pipeline may continue, but the final dossier must surface the ambiguity.

---

# Agent 2: Company Profile Agent

## Purpose

Describe the company clearly in plain language.

## Responsibilities

* identify what the company does
* define category and subcategory
* identify founding year if available
* identify likely stage if sufficiently supported
* identify HQ and geography
* identify leadership basics
* summarize product and offer at a high level

## Inputs

* `company_input`
* `resolved_identity`
* relevant source records
* relevant evidence records

## Outputs

```json
{
  "company_profile": {
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
    "leadership": [],
    "ownership_or_structure_notes": [],
    "evidence_ids": [],
    "confidence": "low"
  },
  "product_and_offer": {
    "core_offer_summary": "",
    "products_or_services": [],
    "pricing_model": {},
    "pricing_signals": [],
    "delivery_model": [],
    "implementation_complexity": {},
    "evidence_ids": [],
    "confidence": "low"
  }
}
```

## Evidence types commonly created

* `company_description_record`
* `founding_record`
* `leadership_record`
* `product_record`
* `service_record`
* `pricing_record`
* `delivery_model_record`
* `implementation_record`

## Allowed behaviors

* produce evidence-backed plain-language summaries
* infer stage only when support is strong and labeled

## Disallowed behaviors

* do not name competitors
* do not generate narrative gap findings
* do not infer buyer persona beyond broad hints

## Failure behavior

If company basics are incomplete, return partial structure with:

* missing fields left blank
* low confidence
* explicit missing-data notes

---

# Agent 3: GTM Intelligence Agent

## Purpose

Determine how the company appears to go to market.

## Responsibilities

* infer sales motion
* identify pricing and packaging signals
* identify acquisition channel clues
* identify buyer journey clues
* identify hiring signals related to GTM
* identify growth signals relevant to commercial motion
* identify likely buyer roles and departments

## Inputs

* `company_input`
* `resolved_identity`
* source records
* evidence records
* company profile output

## Outputs

```json
{
  "gtm_model": {
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
    "hiring_signals": [],
    "content_and_positioning_hooks": [],
    "gtm_observations": [],
    "evidence_ids": [],
    "confidence": "low"
  },
  "customer_and_personas": {
    "ideal_customer_profile": {},
    "buyer_personas": [],
    "end_user_personas": [],
    "customer_pain_themes": [],
    "customer_outcome_themes": [],
    "case_study_signals": [],
    "evidence_ids": [],
    "confidence": "low"
  }
}
```

## Evidence types commonly created

* `sales_motion_record`
* `pricing_record`
* `channel_record`
* `job_posting_record`
* `buyer_signal_record`
* `persona_signal_record`
* `pain_point_record`
* `outcome_record`

## Allowed behaviors

* infer GTM motion using multiple signals
* identify likely buyer personas when supported by case studies, messaging, or hiring

## Disallowed behaviors

* do not guess exact funnel performance
* do not guess exact company revenue
* do not convert weak CTA signals into high-confidence sales-motion claims

## Failure behavior

If GTM motion is unclear:

* return unknown or low-confidence interpretation
* record the ambiguity in warnings and missing data

---

# Agent 4: Competitor Intelligence Agent

## Purpose

Build the competitive landscape around the company.

## Responsibilities

* identify direct competitors
* identify adjacent competitors
* identify substitutes where relevant
* summarize competitor positioning
* identify overlap and differentiation
* identify likely competitive gaps or sameness

## Inputs

* `company_input`
* `resolved_identity`
* company profile output
* GTM output
* relevant source and evidence records

## Outputs

```json
{
  "competitors": {
    "direct_competitors": [],
    "adjacent_competitors": [],
    "substitutes": [],
    "claimed_differentiators": [],
    "positioning_overlaps": [],
    "competitive_gaps": [],
    "competitive_observations": [],
    "evidence_ids": [],
    "confidence": "low"
  }
}
```

## Evidence types commonly created

* `competitor_record`
* `positioning_record`
* `comparison_record`
* `differentiation_record`

## Allowed behaviors

* include competitors only with explicit rationale
* use secondary sources for discovery, but seek stronger confirmation where possible
* identify overlap in company messaging

## Disallowed behaviors

* do not create competitor lists based on vague category assumptions alone
* do not treat all “alternatives” pages as authoritative truth
* do not infer market share unless supported

## Failure behavior

If competitor clarity is weak:

* return fewer competitors rather than speculative ones
* lower confidence
* log competitor ambiguity

---

# Agent 5: Narrative Intelligence Agent

## Purpose

Identify the gap between what the company says it sells and what customers appear to buy.

## Responsibilities

* extract company-claimed value themes
* extract customer-expressed value themes
* extract customer language patterns
* identify meaningful narrative gaps
* surface hidden differentiators
* identify messaging opportunities

## Inputs

* `company_input`
* `resolved_identity`
* company profile output
* GTM output
* source records
* evidence records, especially customer-side and company-side records

## Outputs

```json
{
  "narrative_intelligence": {
    "company_claimed_value": [],
    "customer_expressed_value": [],
    "customer_language_patterns": [],
    "narrative_gaps": [],
    "hidden_differentiators": [],
    "messaging_opportunities": [],
    "narrative_summary": "",
    "confidence": "low"
  }
}
```

## Evidence types commonly created

* `company_claim_record`
* `customer_value_record`
* `customer_language_record`
* `testimonial_record`
* `review_record`
* `narrative_gap_support_record`
* `hidden_differentiator_record`

## Allowed behaviors

* compare company-side and customer-side evidence directly
* identify narrative gaps only when support threshold is met
* highlight repeated customer language

## Disallowed behaviors

* do not use company copy as a substitute for customer truth
* do not assert a narrative gap from one customer quote alone
* do not confuse language variation with strategic mismatch

## Minimum standard

Any narrative gap should usually have:

* at least one company-side value claim
* at least two customer-side signals
* a commercially meaningful mismatch

## Failure behavior

If customer-language evidence is sparse:

* do not force narrative gaps
* return weak support warnings
* keep section present with low confidence

---

# Agent 6: Market and Risk Agent

## Purpose

Place the company inside its wider market, macro, regulatory, and risk environment.

## Responsibilities

* identify market category context
* identify industry trends
* identify economic sensitivity
* identify regulatory exposure
* identify political or geopolitical exposure if relevant
* identify technology shift risks
* identify ecosystem dependencies
* identify strategic vulnerabilities visible from evidence

## Inputs

* `company_input`
* `resolved_identity`
* company profile output
* GTM output
* competitors output
* source records
* evidence records

## Outputs

```json
{
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
  },
  "strategic_risks": {
    "positioning_risks": [],
    "gtm_risks": [],
    "competitive_risks": [],
    "market_risks": [],
    "dependency_risks": [],
    "risk_observations": [],
    "confidence": "low"
  }
}
```

## Evidence types commonly created

* `market_trend_record`
* `regulatory_record`
* `economic_exposure_record`
* `political_exposure_record`
* `technology_shift_record`
* `ecosystem_dependency_record`
* `strategic_risk_record`
* `dependency_risk_record`
* `positioning_risk_record`

## Allowed behaviors

* synthesize macro and market context conservatively
* identify strategic risks when supported by multiple signals

## Disallowed behaviors

* do not produce grand strategic speculation from weak market commentary
* do not force geopolitical relevance when none exists
* do not overstate regulatory exposure without evidence

## Failure behavior

If external context is weak:

* return only what is supported
* leave uncertain fields sparse
* record missing-data notes

---

# Agent 7: Dossier Synthesizer Agent

## Purpose

Merge all agent outputs into the canonical dossier schema.

## Responsibilities

* assemble top-level dossier object
* merge section outputs
* ensure schema consistency
* preserve evidence links
* preserve missing-data and warning signals
* populate confidence-and-gaps section
* prepare output for validation

## Inputs

* all upstream agent outputs
* source records
* evidence records
* run metadata

## Outputs

Canonical dossier object matching Spec 002.

## Additional responsibilities

* create `confidence_and_gaps`
* merge warnings and missing data from upstream agents
* include source references
* ensure required empty sections still exist

## Allowed behaviors

* merge and normalize
* resolve minor formatting inconsistencies
* surface contradictions

## Disallowed behaviors

* do not invent new business findings not present upstream
* do not silently discard conflicts
* do not rewrite low-confidence findings into high-confidence language

## Failure behavior

If required sections are missing:

* return `status: failed` or `partial`
* list the missing sections explicitly
* hand off to validation with errors visible

---

# Agent handoff rules

## Rule 1

Upstream agents pass structured objects, not prose paragraphs.

## Rule 2

An agent may consume upstream findings, but should prefer raw evidence where possible.

## Rule 3

An agent should not overwrite another agent’s domain unless explicitly allowed.

## Rule 4

All cross-domain synthesis should be finalized by the Dossier Synthesizer Agent.

## Rule 5

Warnings and missing-data signals must survive handoff.

---

# Recommended execution order

## Step 1

Identity Resolution Agent

## Step 2

Company Profile Agent

## Step 3

GTM Intelligence Agent

## Step 4

Competitor Intelligence Agent

## Step 5

Narrative Intelligence Agent

## Step 6

Market and Risk Agent

## Step 7

Dossier Synthesizer Agent

This order is recommended because:

* identity errors corrupt everything
* profile context helps GTM
* GTM helps competitor and narrative analysis
* narrative analysis benefits from company and GTM context
* strategic risk is stronger once the rest is visible

---

# Agent confidence rules

Each agent must return a section-level confidence score:

* `low`
* `medium`
* `high`

Agents should lower confidence when:

* evidence is sparse
* evidence is stale
* evidence conflicts
* the section depends heavily on inference
* identity ambiguity exists

Agents should not inflate confidence based on eloquence.

---

# Agent warnings contract

Each agent should be allowed to return warnings like:

```json
[
  "Pricing model unclear due to lack of public pricing page",
  "Customer-language evidence limited to two testimonials",
  "Competitor list may be incomplete due to category ambiguity"
]
```

Warnings are important. They should not be treated as failures.

---

# Agent missing-data contract

Each agent should be allowed to return missing-data entries like:

```json
[
  "No public pricing information found",
  "No recent leadership changes found",
  "Insufficient customer review evidence for strong narrative-gap claims"
]
```

These should feed directly into `confidence_and_gaps.missing_data`.

---

# Tool and permission guidance

This spec is product-level, not tool-runtime-level, but the build should still enforce tool discipline.

## General guidance

* agents should have the minimum tools needed
* specialist agents should work in narrow contexts
* validation should be separate from research
* synthesis should not perform fresh discovery unless explicitly allowed

## Strong practical rule

Do not give every agent permission to do everything.

That defeats the point of agent contracts.

---

# Validation requirements for agent outputs

Each agent output should be checked for:

1. valid output shape
2. allowed fields only
3. required fields present
4. evidence IDs attached to meaningful claims
5. confidence value in enum
6. unsupported claims flagged
7. warnings and missing data preserved

---

# Success criteria

Spec 005 is successful when:

* each agent has a clear job
* agent outputs are mergeable
* evidence remains traceable
* missing data stays visible
* domain overlap is reduced
* the system can improve one agent without rewriting the whole pipeline

---

# Failure modes

This spec fails if:

* agents perform overlapping analysis with different logic
* findings are passed as prose instead of structured objects
* synthesizer invents missing conclusions
* narrative agent acts like the GTM agent
* competitor agent names companies without rationale
* warnings and uncertainty disappear during merge

---

# What you should do with this spec

Save it as:

```text
/docs/specs/005-agent-contracts.md
```

Then create implementation tasks:

* define base agent contract types
* define agent-specific output schemas
* define handoff objects
* define agent execution order
* define validation rules per agent
* define failure and partial-return behavior

Then create a `/docs/architecture/agent-map.md` file that shows:

* each agent
* its inputs
* its outputs
* what spec governs it

---
