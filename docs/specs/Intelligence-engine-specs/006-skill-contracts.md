# Spec 006: Skill Contracts

## Status

Draft v1

## Purpose

Define which parts of the Company Intelligence Engine should be implemented as Claude skills, what each skill is responsible for, how skills are triggered, what they accept, what they return, and how they are tested.

This spec exists to stop the project from turning into:

* one giant overloaded skill
* duplicated logic across agents and skills
* vague trigger behavior
* brittle workflows hidden inside prompts

The goal is to make skills a **reusable execution layer**, not the product itself.

---

## Why this spec matters

In your system:

* the **schema** defines the product contract
* the **evidence model** defines support and traceability
* the **agents** define domain responsibilities
* the **skills** define reusable workflows Claude can invoke reliably

Skills should package repeatable operating knowledge.

They should help Claude Code:

* choose the right workflow
* gather the right evidence
* follow the right rules
* return output in the right format

---

## Core principle

A skill is not the business logic of the system.

A skill is a **reusable operational recipe** that helps an agent or operator perform a recurring task correctly.

That means:

* product truth lives in specs and schemas
* implementation logic lives in code
* repeatable AI workflows live in skills

---

## What should become a skill

A workflow should become a skill when it is:

1. reused across many company runs
2. narrow enough to describe clearly
3. valuable as a repeatable operating procedure
4. likely to benefit from domain-specific instructions, references, or scripts
5. distinct from general coding or orchestration logic

---

## What should not become a skill

Do **not** make something a skill if it is:

* a core schema definition
* a pure code concern
* a one-off experimental workflow
* too broad to trigger reliably
* just “analyze the whole company”
* better handled by the orchestrator or validation code

---

## Decision rule: skill vs agent vs code

### Use a skill when

You need a reusable workflow or research procedure.

Example:

* extracting customer language from testimonials
* validating a dossier against support rules
* mapping competitors from public signals

### Use an agent when

You need a specialist worker with a narrow domain responsibility inside the pipeline.

Example:

* narrative intelligence agent
* GTM intelligence agent
* competitor intelligence agent

### Use code when

You need deterministic behavior, validation, transformation, storage, orchestration, or schema enforcement.

Example:

* generating IDs
* validating JSON schema
* deduplicating evidence
* merging outputs
* saving artifacts

---

## Skill design principles

### 1. One job per skill

A skill should have a narrow purpose.

### 2. Clear trigger language

The description must make invocation reliable.

### 3. Structured inputs and outputs

A skill should know exactly what it expects and what it returns.

### 4. Minimal domain overlap

Avoid multiple skills doing basically the same thing.

### 5. Skill body should contain operational guidance

Not vague philosophy. Real instructions.

### 6. Skill output must fit the pipeline

Skills should return output that agents or code can consume directly.

### 7. Skills must be testable

Triggering, execution quality, and failure behavior should all be testable.

---

## V1 skill taxonomy

V1 should use three levels:

### 1. Capability skills

Small, focused workflows.

### 2. Composite skills

Combine several capabilities for one domain.

### 3. Playbook skill

Runs an end-to-end research workflow at a high level.

---

# V1 recommended skills

## Capability skills

### 1. `company-basics-research`

Purpose:
Collect and normalize company identity, description, category, leadership, HQ, and product basics.

Used by:

* Identity Resolution Agent
* Company Profile Agent

---

### 2. `pricing-and-sales-motion-signals`

Purpose:
Detect pricing visibility, pricing model signals, demo-led flows, enterprise cues, and sales-motion evidence.

Used by:

* Company Profile Agent
* GTM Intelligence Agent

---

### 3. `customer-language-extraction`

Purpose:
Extract customer phrases, value themes, outcomes, and emotional signals from testimonials, reviews, and case studies.

Used by:

* Narrative Intelligence Agent

---

### 4. `competitor-mapping`

Purpose:
Identify direct competitors, adjacent competitors, substitutes, and positioning overlap with rationale.

Used by:

* Competitor Intelligence Agent

---

### 5. `market-macro-scan`

Purpose:
Collect category, trend, regulatory, economic, political, and ecosystem context.

Used by:

* Market and Risk Agent

---

### 6. `signal-detection`

Purpose:
Collect recent funding, hiring, product, leadership, and press signals.

Used by:

* GTM Intelligence Agent
* Market and Risk Agent

---

### 7. `narrative-gap-analysis`

Purpose:
Compare company-claimed value with customer-expressed value and identify evidence-backed narrative gaps.

Used by:

* Narrative Intelligence Agent

---

### 8. `dossier-validation`

Purpose:
Check dossier shape, evidence links, inference labels, missing sections, contradiction visibility, and minimum support rules.

Used by:

* Dossier Synthesizer Agent
* validation pipeline

---

## Composite skills

### 9. `gtm-research`

Combines:

* company basics
* pricing and sales-motion signals
* signal detection
* basic buyer-persona extraction

Used by:

* GTM Intelligence Agent

---

### 10. `narrative-intelligence-research`

Combines:

* customer-language extraction
* company-claimed value extraction
* narrative-gap analysis

Used by:

* Narrative Intelligence Agent

---

### 11. `company-dossier-research`

Combines:

* company basics
* GTM
* competitors
* market/macro
* narrative layer

Used by:

* operator workflows
* high-level orchestration
* maybe later playbook runs

---

## Playbook skill

### 12. `build-company-dossier`

Purpose:
Guide Claude through the full end-to-end dossier production workflow for a single company.

Important:
This should be a playbook skill, not the core implementation engine.

It should orchestrate and guide, but the deterministic pieces should still live in code.

---

# Skill contract template

Every skill should be specified using this contract.

## 1. Skill name

Stable, action-oriented, specific.

Example:
`customer-language-extraction`

---

## 2. Purpose

One sentence.

Example:
Extract customer language, value themes, and outcome phrases from public customer-facing evidence.

---

## 3. Trigger description

A concise description of when Claude should use the skill.

This is one of the most important fields.

Bad:
“Use for company analysis.”

Good:
“Use when you need to extract repeated customer phrases, value themes, outcomes, or emotional signals from testimonials, reviews, or case studies.”

---

## 4. Inputs

Define expected inputs clearly.

Example:

```json id="2zavd5"
{
  "company_name": "",
  "primary_domain": "",
  "source_records": [],
  "evidence_records": []
}
```

Some skills may also accept:

* specific URLs
* source subsets
* upstream outputs
* evidence-type filters

---

## 5. Output contract

Each skill must define a structured output shape.

Example:

```json id="hhjlvr"
{
  "status": "success",
  "findings": [],
  "new_evidence_records": [],
  "warnings": [],
  "missing_data": [],
  "confidence": "low"
}
```

No skill should default to open-ended essay output unless it is explicitly a playbook summary skill.

---

## 6. Allowed tools

Specify the minimum necessary tools.

Examples:

* read files
* use scripts
* inspect references
* run validation commands
* query configured sources

Do not grant broad tools by default.

---

## 7. Disallowed behavior

Each skill must say what it must not do.

Example:
`customer-language-extraction` must not:

* use company copy as customer evidence
* invent customer language
* assert narrative gaps by itself

---

## 8. Evidence rules

Define what evidence types the skill may create or rely on.

Example:

* `testimonial_record`
* `review_record`
* `customer_language_record`
* `customer_value_record`

---

## 9. Confidence rules

Define how the skill assigns low, medium, or high confidence.

---

## 10. Failure behavior

Each skill should define what happens when evidence is weak.

Allowed outcomes:

* `success`
* `partial`
* `failed`

A good skill should degrade gracefully.

---

## 11. Handoff rules

Define where the output goes next.

Example:

* returned to Narrative Intelligence Agent
* merged into evidence store
* passed to validation step

---

# Detailed V1 skill contracts

## Skill: `company-basics-research`

### Purpose

Research and normalize core company identity and product basics.

### Trigger

Use when you need to determine what a company does, its canonical identity, category, leadership basics, HQ, and high-level product or service offering.

### Inputs

* company name
* primary domain
* optionally prior resolved identity

### Outputs

* company basics findings
* product basics findings
* evidence records
* ambiguity flags
* warnings
* missing data

### Creates evidence types

* `company_description_record`
* `founding_record`
* `leadership_record`
* `product_record`
* `service_record`
* `location_record`

### Must not

* perform full competitor mapping
* infer narrative gaps
* guess company stage from weak clues

---

## Skill: `pricing-and-sales-motion-signals`

### Purpose

Detect packaging, pricing visibility, and signs of sales-led, PLG, or hybrid GTM motion.

### Trigger

Use when you need to understand how a company monetizes and how its sales process likely works from public clues.

### Inputs

* resolved identity
* relevant source records or site pages

### Outputs

* pricing findings
* sales-motion findings
* evidence records
* warnings
* missing data

### Creates evidence types

* `pricing_record`
* `sales_motion_record`
* `channel_record`
* `buyer_signal_record`

### Must not

* present GTM interpretation as direct fact when it is inferred
* guess exact revenue or deal size

---

## Skill: `customer-language-extraction`

### Purpose

Extract customer-side language about value, outcomes, pains, and emotional signals.

### Trigger

Use when you need to analyze testimonials, reviews, case studies, or customer quotes to understand how customers describe value in their own words.

### Inputs

* source records containing customer evidence
* optionally pre-existing evidence records

### Outputs

* customer language findings
* value themes
* phrases
* normalized customer evidence records
* warnings
* missing data

### Creates evidence types

* `testimonial_record`
* `review_record`
* `customer_language_record`
* `customer_value_record`
* `pain_point_record`
* `outcome_record`

### Must not

* infer company positioning
* assert narrative gaps by itself
* use generic marketing copy as customer language

---

## Skill: `competitor-mapping`

### Purpose

Identify and justify direct competitors, adjacent competitors, substitutes, and positioning overlap.

### Trigger

Use when you need to build a grounded competitor set around a company and compare how they position themselves.

### Inputs

* resolved identity
* company profile output
* category hints
* source records

### Outputs

* competitor set
* comparison notes
* overlaps
* gaps
* new evidence records
* warnings
* missing data

### Creates evidence types

* `competitor_record`
* `positioning_record`
* `comparison_record`
* `differentiation_record`

### Must not

* dump generic category lists without rationale
* use one weak source to justify named competitors

---

## Skill: `market-macro-scan`

### Purpose

Collect market, trend, regulatory, economic, political, and ecosystem context relevant to the company.

### Trigger

Use when you need to understand the external environment shaping the company’s strategy, risks, and category dynamics.

### Inputs

* resolved identity
* category
* company profile and GTM outputs

### Outputs

* market context
* macro findings
* risk-related findings
* evidence records
* warnings
* missing data

### Creates evidence types

* `market_trend_record`
* `regulatory_record`
* `economic_exposure_record`
* `political_exposure_record`
* `technology_shift_record`
* `ecosystem_dependency_record`

### Must not

* force geopolitical analysis where irrelevant
* overstate regulatory exposure with weak support

---

## Skill: `signal-detection`

### Purpose

Capture recent visible business signals such as funding, hiring, launches, leadership changes, and press.

### Trigger

Use when you need recent evidence of growth, pressure, change, or strategic movement.

### Inputs

* resolved identity
* recent source records

### Outputs

* structured signals
* evidence records
* recency notes
* warnings
* missing data

### Creates evidence types

* `funding_record`
* `product_launch_record`
* `leadership_change_record`
* `press_record`
* `hiring_signal_record`

### Must not

* treat old signals as current state without labeling
* infer broad strategy from a single weak signal

---

## Skill: `narrative-gap-analysis`

### Purpose

Compare company-side value claims with customer-side expressed value and identify meaningful mismatches.

### Trigger

Use when both company messaging evidence and customer-language evidence are available and you need to determine whether a narrative gap exists.

### Inputs

* company-side evidence
* customer-side evidence
* optionally GTM context

### Outputs

* company claimed value themes
* customer expressed value themes
* customer language patterns
* narrative gap findings
* hidden differentiators
* messaging opportunities
* support evidence
* warnings
* missing data

### Creates evidence types

* `company_claim_record`
* `narrative_gap_support_record`
* `hidden_differentiator_record`

### Must not

* run without real customer evidence
* assert a gap from thin semantic differences
* confuse company aspiration with customer truth

---

## Skill: `dossier-validation`

### Purpose

Validate that the dossier is structurally correct and supportable.

### Trigger

Use when a dossier or major section output has been assembled and needs schema, support, and consistency checks.

### Inputs

* dossier object
* sources
* evidence records

### Outputs

* validation status
* errors
* warnings
* unsupported-claim list
* contradiction list
* missing-section list

### Creates evidence types

Usually none, unless validation emits structured contradiction support records later.

### Must not

* invent business findings
* silently fix unsupported claims
* upgrade confidence on its own

---

# Skill file requirements

Each project skill folder should contain:

```text id="ut3vyr"
.claude/skills/<skill-name>/
  SKILL.md
  references/
  scripts/
```

### `SKILL.md` should contain

* frontmatter
* description
* when to use
* when not to use
* expected inputs
* expected outputs
* workflow steps
* evidence rules
* confidence rules
* failure behavior
* examples if needed

### `references/`

Use for:

* schema excerpts
* examples
* decision rules
* small domain references

### `scripts/`

Use for:

* deterministic helpers
* validators
* extractors
* formatters

---

# Frontmatter rules for project skills

Each `SKILL.md` should use precise frontmatter.

Recommended fields:

```yaml id="m5dmxg"
---
name: customer-language-extraction
description: Extract repeated customer phrases, value themes, outcomes, and emotional signals from testimonials, reviews, and case studies.
allowed-tools: Read, Grep, Glob, Bash
---
```

Add stricter fields where appropriate, such as:

* tool limits
* model restrictions
* isolated context if useful
* manual invocation rules if needed

---

# Skill triggering rules

## Rule 1

Descriptions should be specific enough to avoid accidental over-triggering.

## Rule 2

A skill should describe the job, not just the domain.

Bad:
“Use for narrative.”

Good:
“Use when you need to compare repeated customer language against company messaging to determine whether a meaningful narrative gap exists.”

## Rule 3

Avoid overlapping trigger descriptions across multiple skills.

## Rule 4

Composite and playbook skills should not crowd out capability skills unless the task truly needs the bigger workflow.

---

# Skill output rules

All V1 skills should prefer structured output with:

* status
* findings
* new evidence
* warnings
* missing data
* confidence

This matters because skill output should flow cleanly into agents and validators.

---

# Skill testing requirements

Every skill needs three forms of testing.

## 1. Trigger tests

Questions:

* does the skill trigger when it should?
* does it stay dormant when it should not?
* does it collide with another skill?

Example:

* `customer-language-extraction` should trigger on testimonial analysis
* it should not trigger on general company basics research

---

## 2. Functional tests

Questions:

* does the skill produce the expected output shape?
* does it follow evidence rules?
* does it avoid forbidden behavior?
* does it degrade gracefully on weak data?

---

## 3. Value tests

Questions:

* does this skill materially improve output quality over no skill?
* is the output more consistent?
* more accurate?
* better supported?

If not, the skill may not deserve to exist.

---

# Skill evaluation fixtures

Create a small skill test set in:

```text id="cgmz1k"
/tests/evals/skills/
```

Recommended:

* 3 trigger-positive cases per skill
* 3 trigger-negative cases per skill
* 3 weak-data cases per skill
* 3 strong-data cases per skill

This will save you a lot of pain later.

---

# Skill success criteria

Spec 006 is successful when:

* each skill has a narrow, useful job
* trigger behavior is understandable
* skill outputs are structured and reusable
* skill overlap is low
* weak evidence leads to graceful degradation
* the skill library helps the pipeline rather than confusing it

---

# Failure modes

This spec fails if:

* skills are too broad
* descriptions are vague
* multiple skills trigger for the same task with no clear separation
* skills return essay-like output instead of structured objects
* skills duplicate code logic or schema logic
* one “mega skill” tries to own the whole product

---

# What you should do with this spec

Save it as:

```text id="lbofc3"
/docs/specs/006-skill-contracts.md
```

Then create:

* `/docs/architecture/skill-map.md`
* `.claude/skills/` folder skeleton
* one spec checklist per skill
* a small trigger/eval harness

Then create implementation tickets like:

* define skill naming convention
* write first 4 capability skills
* write one composite skill
* define skill frontmatter standard
* create skill trigger tests
* create skill output validator

---
