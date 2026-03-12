# Spec 004: Source Priority and Inference Rules

## Status

Draft v1

## Purpose

Define:

* which sources the system should trust most
* how evidence from different sources should be weighted
* when the system is allowed to infer
* how inferred findings must be labeled
* how conflicting or weak evidence should be handled

This spec protects the product from becoming a confident-sounding hallucination engine.

It exists to make sure the dossier is built on **disciplined intelligence logic**, not loose synthesis.

---

## Why this spec matters

Your system will research messy public information.

Some sources are strong.
Some are noisy.
Some are outdated.
Some are useful only as weak signals.

Without source priority rules, Claude Code will blur all of that together.

Without inference rules, it will state probabilities like facts.

This spec prevents that.

---

## Core principle

The system must prefer:

**direct evidence over indirect evidence**
**recent evidence over stale evidence**
**primary sources over commentary**
**multiple supporting signals over single weak signals**
**explicit labeling of inference over hidden speculation**

---

## Product rule

A finding can only appear in the dossier as:

1. a **direct fact**
2. an **evidence-backed interpretation**
3. an **explicit inference**

It must never appear as a disguised guess.

---

## Source trust hierarchy

### Tier 1 — Primary company-controlled sources

These are the strongest sources for factual claims about the company.

Examples:

* official website
* homepage
* product pages
* pricing pages
* case studies
* docs
* careers pages
* official blog
* official press releases
* founder or executive statements on official channels

### Use for

* company description
* product and offer
* pricing visibility
* hiring signals
* stated positioning
* claimed differentiators
* company narrative

### Limitations

These sources are reliable for what the company **claims**, but not always for what customers **actually value**.

---

### Tier 2 — Primary external authoritative sources

These are strong external sources where the company is not the sole narrator.

Examples:

* investor announcements
* reputable funding databases
* reputable media interviews
* official event appearances
* public legal or regulatory disclosures
* partner pages
* authoritative industry sources

### Use for

* funding events
* stage signals
* market category context
* partnerships
* external validation
* macro and industry context

### Limitations

May still contain framing bias or incomplete context.

---

### Tier 3 — Customer and market-visible evidence

These are critical for narrative intelligence.

Examples:

* testimonials
* reviews
* case studies with customer voice
* public customer quotes
* social mentions
* community discussions
* public recommendation language

### Use for

* customer-expressed value
* customer language patterns
* pain points
* outcomes
* hidden differentiators
* narrative gap analysis

### Limitations

Can be sparse, selective, or unrepresentative. Must be handled carefully.

---

### Tier 4 — Secondary synthesis sources

Useful, but weaker than direct sources.

Examples:

* software directories
* analyst roundups
* comparison articles
* industry blogs
* summary pages
* recruiter reposts
* SEO articles

### Use for

* lead generation for deeper research
* possible competitor discovery
* weak support for market context
* hypothesis generation

### Limitations

Should rarely anchor major claims by themselves.

---

### Tier 5 — Weak or noisy sources

These are lowest trust.

Examples:

* unattributed reposts
* scraped fragments
* thin directories
* low-context mentions
* anonymous claims
* unclear summaries

### Use for

* hypothesis generation only
* directional signals only

### Limitations

Should not support important claims unless independently confirmed elsewhere.

---

## Source priority rules

### Rule 1

When multiple sources exist, prefer the highest-tier source.

### Rule 2

When a lower-tier source conflicts with a higher-tier source, default to the higher-tier source unless there is strong reason not to.

### Rule 3

A weak source can suggest where to look, but should not become the final authority.

### Rule 4

For customer truth, customer-language sources may outrank company-controlled sources for questions about **perceived value**.

This is important.

For example:

* official site is stronger for “what the company claims”
* testimonials and reviews are stronger for “what customers seem to buy for”

### Rule 5

Narrative gap findings require cross-source comparison, not a single source type.

---

## Recency rules

Public company information changes.

The system must consider recency, especially for:

* funding
* hiring
* leadership
* product launches
* stage
* pricing
* partnerships
* macro exposure

### Recency preference

Prefer more recent evidence when evaluating dynamic facts.

### Default logic

* recent evidence overrides stale evidence for dynamic claims
* older evidence can still support historical context
* stale evidence should not dominate live-state conclusions

### Examples

Good use of recency:

* recent job postings for GTM motion
* recent funding news for growth stage
* current pricing page for pricing model

Bad use of recency:

* using a two-year-old blog post to define current GTM motion without newer support

---

## Claim classification rules

Every finding must be classified into one of three categories.

### 1. Direct fact

A claim directly stated in a credible source.

Example:

* “The company offers usage-based pricing”
* “The company raised a Series A in 2025”

Requirements:

* supported by source evidence
* not labeled as inferred

---

### 2. Evidence-backed interpretation

A conclusion that stays close to the evidence but is not a verbatim fact.

Example:

* “The company appears to run a sales-led motion”
* “The site suggests enterprise buyers are a priority”

Requirements:

* multiple supporting signals preferred
* reasonable interpretation
* should remain grounded
* may be marked inferred depending on implementation detail

---

### 3. Explicit inference

A higher-level conclusion drawn from several pieces of evidence.

Example:

* “The company may struggle with positioning overlap against better-known competitors”
* “The real differentiator appears to be implementation simplicity rather than automation depth”

Requirements:

* must be marked as inferred
* must include evidence support
* confidence must usually be medium or low unless support is unusually strong

---

## Inference rules

### Rule 1

Never present inference as direct fact.

### Rule 2

Inference must always include:

* `is_inferred: true`
* supporting `evidence_ids`
* confidence value

### Rule 3

Inference should be conservative.

The system should not infer:

* exact revenue
* exact stage
* exact sales process
* exact buyer authority
  unless evidence is unusually strong

### Rule 4

Inference is strongest when supported by multiple independent signals.

Example:
Inferring enterprise sales motion from:

* no public pricing
* demo CTA
* enterprise case studies
* SDR hiring
  is reasonable.

Inferring it from one “Book a demo” button alone is weak.

### Rule 5

If evidence is too thin, the system should say:

* unknown
* unclear
* weakly supported
  rather than forcing a conclusion.

---

## Minimum support expectations for inference

### Low-risk inference

Allowed with 1 to 2 supporting signals.

Examples:

* likely ICP size
* likely buyer department
* likely category label

### Medium-risk inference

Should have at least 2 to 3 supporting signals.

Examples:

* sales motion
* core buyer persona
* competitor overlap
* implementation complexity

### High-risk inference

Should require strong multi-source support.

Examples:

* company stage
* strategic vulnerability
* narrative gap with commercial impact
* political or regulatory exposure significance

---

## Narrative intelligence inference rules

This section is core to your product, so standards should be stricter.

### Company-claimed value

Can be stated more directly when clearly present in company messaging.

### Customer-expressed value

Should only be stated when supported by genuine customer-language evidence.

### Narrative gap

A narrative gap should not be asserted unless:

* there is at least one clear company-side value claim
* there are at least two customer-side value or language signals
* the mismatch is meaningful, not semantic trivia

### Bad gap example

Company says “automation,” customers say “saves us time.”

This may not be a real gap. It may just be adjacent language.

### Strong gap example

Company emphasizes “AI workflow orchestration,” while customers repeatedly emphasize:

* ease of onboarding
* confidence in compliance
* speed to first result

That is a strategically meaningful gap.

---

## Contradiction handling rules

The system must not smooth over contradictions.

If evidence conflicts:

1. preserve both records
2. flag the contradiction
3. lower confidence where appropriate
4. avoid forced certainty

### Types of contradictions

* different founding years
* different stage descriptions
* conflicting category labels
* conflicting pricing signals
* competitor ambiguity

### Required behavior

Contradictions should surface in:
`confidence_and_gaps.conflicting_evidence`

---

## Unknowns and abstention rules

The system is allowed to not know.

That is a feature, not a weakness.

### The system should abstain when:

* evidence is too sparse
* sources conflict heavily
* only weak sources are available
* the claim would require excessive guesswork

### Preferred output language

Use:

* unknown
* unclear
* weakly supported
* insufficient evidence
* probable but unconfirmed

Do not use:

* invented certainty
* implied fact without support

---

## Cross-source corroboration rules

Some findings are stronger only when different source types agree.

### Strong corroboration examples

* pricing page + case study + job posting
* official messaging + customer reviews + founder interview
* funding announcement + hiring expansion + product launch activity

### Product rule

High-confidence strategic findings should ideally have support from more than one source type.

---

## Section-specific trust guidance

### Company profile

Prefer Tier 1 and Tier 2.

### Product and offer

Prefer Tier 1.

### GTM model

Prefer Tier 1 plus Tier 2 and hiring signals.

### Customer and personas

Prefer Tier 3 plus case studies and testimonials.

### Competitors

Use Tier 1, Tier 2, and careful secondary discovery sources.

### Market and macro

Prefer Tier 2 and reputable external sources.

### Narrative intelligence

Must compare Tier 1 company-side claims against Tier 3 customer-side evidence.

### Strategic risks

Should be based on cross-source synthesis, not single-source speculation.

---

## Confidence adjustment rules

### Increase confidence when:

* evidence is direct
* evidence is recent
* multiple source types align
* claim is narrow and specific
* interpretation is low ambiguity

### Decrease confidence when:

* evidence is stale
* evidence is indirect
* only one weak source supports claim
* source bias is high
* contradiction exists
* claim is broad or strategic

---

## Examples

### Example 1: direct fact

Claim:
“The company offers a free trial.”

Why allowed:

* clearly stated on official site
* primary source
* direct fact
* high confidence

---

### Example 2: evidence-backed interpretation

Claim:
“The company appears to prioritize mid-market and enterprise buyers.”

Why allowed:

* enterprise-style CTA
* case studies with larger firms
* pricing not public
* hiring for account executives

This is not a direct fact, but it is a reasonable interpretation.

---

### Example 3: explicit inference

Claim:
“The company may be under-positioning implementation simplicity, which customers appear to value more than advanced feature depth.”

Why allowed:

* company copy emphasizes feature power
* customer evidence repeatedly highlights ease and quick setup
* this mismatch is commercially relevant

This must be marked inferred.

---

## Validation requirements

This spec should drive these checks:

1. no major claim without evidence support
2. inferred claims must be labeled
3. low-tier-only claims should be flagged
4. contradiction handling must be visible
5. narrative gap claims must have both company-side and customer-side support
6. dynamic claims should prefer recent evidence where available

---

## Success criteria

Spec 004 is successful when:

* the system prefers strong sources over noisy ones
* weak signals do not become facts
* inference is visible and disciplined
* contradictions remain visible
* narrative intelligence findings are genuinely evidence-backed
* the dossier feels like structured intelligence, not speculative content

---

## Failure modes

This spec fails if:

* the system treats all sources equally
* company claims are mistaken for customer truth
* weak evidence drives major strategic claims
* inference is hidden inside normal prose
* contradictions disappear
* the system fills gaps with confident guesses

---

## What you should do with this spec

Save it as:

```text
/docs/specs/004-source-priority-and-inference-rules.md
```

Then turn it into implementation rules:

* build source-tier classifier
* build recency weighting rules
* build inference labeling rules
* build contradiction flagger
* build confidence adjustment logic
* build unsupported-claim validator

Then summarize the important rules into `CLAUDE.md`, especially:

* prefer primary and recent evidence
* never present inference as fact
* narrative gaps require both company and customer evidence
* unknown is better than guessed

---
