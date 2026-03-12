# Spec 007: Evaluation and Acceptance Criteria

## Status

Draft v1

## Purpose

Define how the Company Intelligence Engine will be evaluated, what “good” looks like, what counts as failure, and what standards must be met before the system is trusted for repeated use.

This spec exists to stop the project from being judged by:

* vibes
* eloquence
* isolated good runs
* cherry-picked examples

The system should be judged by **repeatable performance against explicit criteria**.

---

## Why this spec matters

Your product is not a chatbot demo.

It is a research and intelligence system that will:

* collect public evidence
* make structured claims
* surface narrative gaps
* hand results to downstream AI

That means the standard is not “does this sound smart?”

The standard is:

* is it accurate enough
* is it supported
* is it consistent
* is it useful for downstream AI
* does it degrade honestly when evidence is weak

---

## Core principle

The system should be evaluated on five things:

1. **structural correctness**
2. **evidence support**
3. **reasoning discipline**
4. **narrative intelligence quality**
5. **consistency across runs**

---

## Evaluation goals

The evaluation system should answer:

* Did the system produce a valid dossier?
* Are major claims supported by evidence?
* Did it separate fact from inference?
* Did it avoid hallucinating?
* Did it surface uncertainty honestly?
* Did it produce a genuinely useful narrative intelligence section?
* Did it remain consistent across benchmark companies?

---

## Evaluation layers

V1 should evaluate the system across six layers:

1. Schema validation
2. Evidence validation
3. Section completeness
4. Quality rubric scoring
5. Hallucination and contradiction checks
6. Regression benchmarking

---

# 1. Schema validation

## Goal

Ensure every dossier conforms to the canonical schema from Spec 002.

## Required checks

* all required top-level fields present
* all required section fields present
* field types valid
* enum values valid
* required empty sections still present
* no invalid top-level keys unless explicitly allowed
* schema version present

## Pass condition

A dossier must pass schema validation before it can be considered for deeper evaluation.

## Fail condition

Any invalid dossier shape is an automatic failure.

---

# 2. Evidence validation

## Goal

Ensure the dossier is supportable, traceable, and disciplined.

## Required checks

* every major claim has `evidence_ids`
* every `evidence_id` points to a valid evidence record
* every evidence record points to a valid source
* inferred findings are labeled
* unsupported claims are flagged
* major narrative gap findings have both company-side and customer-side support
* competitor entries have explicit rationale
* source tiers and confidence fields are present where required

## Pass condition

Critical claims are traceable and major unsupported findings are absent.

## Fail condition

The dossier contains unsupported major claims, broken evidence links, or unlabeled inference.

---

# 3. Section completeness

## Goal

Ensure the system produces a usable dossier, not a patchy one.

## Required sections

The following sections must always exist:

* company_profile
* product_and_offer
* gtm_model
* customer_and_personas
* competitors
* market_and_macro
* signals
* narrative_intelligence
* strategic_risks
* confidence_and_gaps
* sources

## Important rule

A section may be weak, sparse, or low confidence.
It may not disappear.

## Completeness checks

* section exists
* section has expected structure
* weak or missing data is explicitly surfaced
* empty arrays or blank fields are used consistently when information is unavailable

## Pass condition

All required sections exist and weak areas are visible.

## Fail condition

Sections vanish, collapse into prose, or omit uncertainty.

---

# 4. Quality rubric scoring

## Goal

Evaluate whether the dossier is actually useful.

Each dossier should be scored across core quality dimensions.

Use a simple V1 rubric:

* 0 = failed
* 1 = weak
* 2 = acceptable
* 3 = strong

---

## 4.1 Company understanding score

### Evaluate

* does the dossier explain what the company does in plain language
* is the category clear
* is the core offer understandable
* are leadership, geography, and stage treated carefully

### Strong score

The company is understandable quickly and accurately.

### Weak score

The output is vague, generic, or jargon-heavy.

---

## 4.2 GTM understanding score

### Evaluate

* does the dossier identify likely sales motion
* does it capture pricing and packaging signals
* does it identify plausible buyer roles
* does it surface growth or hiring clues

### Strong score

The dossier presents a grounded, evidence-backed view of how the company goes to market.

### Weak score

It repeats surface-level website copy or makes speculative GTM claims.

---

## 4.3 Competitive intelligence score

### Evaluate

* are named competitors plausible
* is rationale provided
* are overlaps and differentiators meaningful
* are competitors grounded in evidence rather than generic category guesses

### Strong score

The competitor landscape feels specific and useful.

### Weak score

The output is padded with generic competitors or weak alternatives lists.

---

## 4.4 Market and macro score

### Evaluate

* is category context present
* are relevant external forces captured
* is regulation or macro included only when relevant
* are risks proportionate to the evidence

### Strong score

External context adds real strategic value without overreaching.

### Weak score

The section is empty, generic, or overdramatic.

---

## 4.5 Narrative intelligence score

This is the most important rubric in the system.

### Evaluate

* does it clearly separate company-claimed value from customer-expressed value
* does it extract real customer language
* are narrative gaps meaningful rather than semantic
* are hidden differentiators plausible and supported
* does it explain why the gap matters commercially

### Strong score

The dossier reveals a believable mismatch between company narrative and customer-valued reality, backed by evidence and useful for strategy.

### Weak score

The section just paraphrases company copy or invents customer truth without support.

---

## 4.6 Evidence discipline score

### Evaluate

* are claims traceable
* are source links valid
* is inference labeled
* are conflicts surfaced
* does confidence feel honest

### Strong score

The dossier behaves like structured intelligence.

### Weak score

The dossier behaves like confident summarization.

---

## 4.7 Downstream AI usefulness score

### Evaluate

* is the structure clean enough for machine interpretation
* are fields stable across runs
* are sections semantically clear
* can another AI reason over the object without reconstructing intent

### Strong score

The dossier can be consumed directly by downstream systems.

### Weak score

The output is too prose-heavy, inconsistent, or ambiguous.

---

# 5. Hallucination and contradiction checks

## Goal

Detect false confidence, unsupported invention, and internal inconsistency.

---

## 5.1 Hallucination checks

### Check for

* invented competitors
* invented funding events
* invented pricing details
* invented customer language
* invented leadership changes
* invented narrative gaps with no supporting customer evidence

### Fail conditions

Any major invented fact is a critical failure.

### Severity guidance

* minor wording issue = warning
* invented major business fact = fail

---

## 5.2 Unsupported inference checks

### Check for

* inferred stage stated as fact
* inferred sales motion stated as fact
* strategic risks stated with no support
* customer pains asserted with no evidence
* narrative gap claims made from too-thin support

### Rule

Unsupported interpretation is not as bad as fabricated fact, but repeated unsupported interpretation should still fail acceptance.

---

## 5.3 Contradiction checks

### Check for

* conflicting founding dates
* conflicting category labels
* conflicting pricing signals
* conflicting stage labels
* conflicting competitor logic

### Required behavior

Contradictions should appear in:
`confidence_and_gaps.conflicting_evidence`

### Failure condition

If contradictions exist but are silently flattened into certainty, the dossier fails.

---

# 6. Regression benchmarking

## Goal

Ensure the system improves over time instead of drifting.

You need a stable benchmark set.

---

## Benchmark company set

Create a benchmark set of at least 10 companies.

The set should include variety across:

* SaaS vs service-heavy B2B
* simple vs complex offers
* strong vs weak public evidence
* obvious vs unclear competitors
* strong vs limited customer-language evidence
* earlier-stage vs later-stage companies

### Recommended distribution

* 3 easy cases
* 4 medium cases
* 3 hard cases

---

## Benchmark fixture contents

For each benchmark company, store:

* input company name
* input domain
* expected minimum sections
* known high-confidence facts
* expected plausible competitors
* known GTM clues
* expected narrative evidence availability
* notes on common pitfalls

Do not overfit by writing a perfect answer key.
Write a **minimum truth envelope**.

---

## Regression checks

Every major change to:

* prompts
* skills
* agent contracts
* synthesis logic
* evidence handling
* schema logic

should be tested against the benchmark set.

### Watch for regressions in

* schema validity
* evidence support rates
* hallucination rate
* missing-section rate
* narrative intelligence quality
* consistency of competitors and GTM findings

---

# Acceptance gates

A run should be considered acceptable only if it passes all critical gates.

## Gate 1: schema gate

Must pass.

## Gate 2: evidence gate

Must pass for major claims.

## Gate 3: unsupported-claim gate

No critical unsupported claims.

## Gate 4: hallucination gate

No major hallucinated facts.

## Gate 5: narrative gate

Narrative section must be present and must not fabricate customer truth.

## Gate 6: consistency gate

Output must be structurally consistent with other runs.

---

# Minimum acceptable standards for V1

These are the minimum standards I would set.

## Structural minimum

* 100% schema-valid dossiers

## Evidence minimum

* all major section-level claims linked to evidence
* no broken evidence links

## Hallucination minimum

* zero major fabricated facts in accepted runs

## Competitor minimum

* at least 2 plausible direct or adjacent competitors when sufficient evidence exists
* otherwise explicit ambiguity note

## Narrative minimum

For any claimed narrative gap:

* at least 1 company-side value claim
* at least 2 customer-side records
* commercially meaningful mismatch

## Confidence minimum

* weak areas must be labeled low confidence
* missing data must be surfaced

---

# Scoring model for V1

You can keep this simple.

For each dossier, score:

* company understanding: 0–3
* GTM understanding: 0–3
* competitive intelligence: 0–3
* market and macro: 0–3
* narrative intelligence: 0–3
* evidence discipline: 0–3
* downstream AI usefulness: 0–3

### Total possible

21

### Suggested thresholds

* 18–21 = strong
* 14–17 = acceptable
* 10–13 = weak
* under 10 = fail

This is only useful if critical gates are passed first.

A dossier with a high score but a hallucinated funding round should still fail.

---

# Narrative intelligence special rubric

Because this is your wedge, give it extra scrutiny.

Rate the narrative section on five sub-dimensions:

## 1. company-side clarity

Did the system capture how the company frames value?

## 2. customer-side authenticity

Did it extract genuine customer language rather than paraphrased assumptions?

## 3. gap significance

Is the identified gap strategically meaningful?

## 4. business relevance

Does it connect the gap to conversion, differentiation, pipeline, or positioning?

## 5. evidence depth

Does the finding rest on enough cross-source support?

Use the same 0–3 scale for each if you want a deeper internal eval.

---

# Evaluation artifact outputs

For each test run, save:

* `dossier.json`
* `validation_report.json`
* `scorecard.json`
* `trace.json`
* optional `notes.md`

Put these in:

```text
/tests/evals/runs/<company-slug>/
```

This will make comparisons far easier.

---

# Human review loop

Even though the product output is for AI, V1 still needs human review.

For benchmark runs, a reviewer should inspect:

* whether major claims feel plausible
* whether evidence links actually support claims
* whether narrative gaps feel real
* whether ambiguity is handled honestly

Human review is especially important for:

* narrative intelligence
* competitor naming
* strategic risks

---

# Evaluation cadence

Run evals:

* before merging major changes
* after changing skill descriptions
* after changing agent prompts
* after changing evidence logic
* after changing synthesis logic
* before releasing a new schema version

Do not rely on spot-checking one company.

---

# Failure triage categories

When a run fails, classify the failure.

## Type A: schema failure

Output shape broken.

## Type B: evidence failure

Claims unsupported or links broken.

## Type C: inference failure

Inference not labeled or too aggressive.

## Type D: hallucination failure

Major invented fact.

## Type E: narrative failure

Narrative section weak, fabricated, or commercially trivial.

## Type F: synthesis failure

Good upstream data merged badly.

This will help you improve the right layer.

---

# Success criteria

Spec 007 is successful when:

* the system is judged by explicit standards
* benchmark runs are repeatable
* failures are classified clearly
* narrative intelligence quality is evaluated seriously
* regressions are visible
* acceptance is based on support and consistency, not prose quality

---

# Failure modes

This spec fails if:

* there is no benchmark set
* scores are assigned without evidence review
* narrative quality is not specifically evaluated
* hallucinations are tolerated because the rest “looks good”
* schema-valid but strategically useless dossiers are accepted
* improvements cannot be measured across versions

---

# What you should do with this spec

Save it as:

```text id="2ey57g"
/docs/specs/007-evaluation-and-acceptance-criteria.md
```

Then create these files next:

```text id="zq8i6s"
/tests/evals/benchmark-companies.json
/tests/evals/scorecard-template.json
/tests/evals/review-rubric.md
/tests/evals/gates.md
```

Then create implementation tickets:

* build schema validator
* build unsupported-claim checker
* build evidence-link checker
* build contradiction checker
* build hallucination review workflow
* build benchmark runner
* build scorecard generator

---
