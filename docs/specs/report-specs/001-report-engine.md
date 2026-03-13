# Report Engine Spec

## Purpose

The Report Engine transforms a validated `dossier.json` into a human-readable strategic report for founders, executives, investors, and other decision-makers.

Its purpose is not to summarize the dossier.

Its purpose is to:
- extract meaningful signals
- detect tensions and contradictions
- form and stress-test hypotheses
- derive implications
- produce a report that is perceptive, evidence-backed, and strategically useful

The Report Engine is a judgment system with a rendering layer attached.

---

## Inputs

### Primary input
- `dossier.json`

### Assumptions about input
- The dossier has already passed schema validation.
- The dossier is the canonical intelligence object.
- Claims in the dossier are linked to `evidence_ids`.
- Evidence records are linked to `source_id`.
- Inference is labeled where applicable.
- Unknowns are represented explicitly rather than guessed.

### Input boundary
The Report Engine must operate only on dossier-derived data in v1.

It must not perform fresh research.

---

## Outputs

### Machine-readable outputs
- `signals.json`
- `tensions.json`
- `patterns.json`
- `hypotheses.json`
- `implications.json`
- `report-plan.json`
- `report.json`

### Human-readable outputs
- `report.md`
- optional `report.html`

---

## Pipeline Stages

### 1. Load dossier
Load and validate the dossier for use by downstream stages.

### 2. Extract signals
Transform dossier facts into normalized analytical observations.

### 3. Detect tensions
Identify contradictions, asymmetries, absences, mismatches, and strategic strain between signals.

### 4. Detect patterns
Group related signals and tensions into higher-level strategic structures.

### 5. Generate hypotheses
Form candidate explanations for what may really be happening.

### 6. Stress-test hypotheses
Challenge each hypothesis with counter-evidence, alternative explanations, and uncertainty checks.

### 7. Generate implications
Translate surviving hypotheses into strategic consequences.

### 8. Plan report
Select the core thesis, main supporting arguments, and section order.

### 9. Write report
Produce constrained prose from approved analytical objects only.

### 10. Render report
Render report artifacts into markdown and optional HTML.

---

## Global Invariants

The following invariants are mandatory for all versions of the Report Engine.

### Traceability invariants
- Every report claim must trace to at least one hypothesis or implication.
- Every hypothesis must trace to at least one pattern or tension.
- Every pattern must trace to at least one signal or tension.
- Every signal must trace to dossier claims, evidence, and sources.
- No rendered section may contain unsupported claims.

### Evidence discipline invariants
- The Report Engine must not invent facts.
- The Report Engine must not introduce new sources.
- The Report Engine must not perform fresh web research in v1.
- Unknown is preferable to unsupported inference.

### Reasoning invariants
- Observations, inferences, and hypotheses must remain distinct.
- Inference strength must be explicit on analytical objects.
- Discarded hypotheses must never appear in final report prose.
- Confidence and wording must remain aligned.

### Output quality invariants
- The report must be specific to the company.
- The report must prioritize tensions over generic summary.
- The report must avoid generic MBA language and filler.
- The report must surface uncertainty where evidence is sparse.

---

## Lineage Propagation Rules

Lineage must propagate upward through the report engine.

For every stage after signal extraction:

- `evidence_ids` must be the union of `evidence_ids` from the referenced upstream objects
- `source_ids` must be the union of `source_ids` from the referenced upstream objects
- No stage may invent new `evidence_ids`
- No stage may invent new `source_ids`

Examples:

- A tension aggregates lineage from its referenced signals
- A pattern aggregates lineage from its referenced tensions and signals
- A hypothesis aggregates lineage from its referenced patterns, tensions, and signals
- An implication aggregates lineage from its originating hypothesis
- A report section aggregates lineage from the analytical objects referenced in that section

If an upstream lineage chain is broken, downstream objects depending on it must be rejected.

---

## Stage Responsibilities

### Load dossier
Responsible for:
- loading the dossier
- validating schema compatibility
- resolving references needed downstream

Not responsible for:
- any analytical judgment

### Extract signals
Responsible for:
- creating strategically relevant observations from dossier material
- normalizing signal format
- attaching lineage

Not responsible for:
- explaining why a pattern exists
- writing narrative report text

### Detect tensions
Responsible for:
- identifying contradictions and mismatches between signals
- ranking tensions by severity and relevance

Not responsible for:
- causal explanation beyond structured tension statement

### Detect patterns
Responsible for:
- compressing signals and tensions into higher-level structures
- surfacing recurring strategic forms

Not responsible for:
- speculative conclusions beyond pattern description

### Generate hypotheses
Responsible for:
- proposing explanations for patterns and tensions
- making assumptions explicit

Not responsible for:
- presenting tentative explanations as settled truth

### Stress-test hypotheses
Responsible for:
- identifying alternative explanations
- checking counter-evidence
- lowering confidence or discarding weak hypotheses

Not responsible for:
- preserving weak hypotheses for narrative convenience

### Generate implications
Responsible for:
- translating surviving hypotheses into strategic consequences
- framing consequences by audience and time horizon

Not responsible for:
- proposing unsupported actions

### Plan report
Responsible for:
- selecting the report’s main argument
- sequencing the strongest supported insights
- choosing section structure

Not responsible for:
- introducing new analytical content

### Write report
Responsible for:
- expressing approved analytical objects clearly and sharply
- matching wording to confidence
- preserving traceability

Not responsible for:
- discovering new meaning
- adding new facts
- improving weak evidence through rhetoric

### Render report
Responsible for:
- output formatting
- artifact generation
- preserving machine-readable lineage references

Not responsible for:
- changing analytical content

---

## Forbidden Behaviors

The following behaviors are forbidden.

### Research violations
- fetching new sources
- browsing the web
- using external APIs to enrich the report
- adding facts not present in dossier-derived objects

### Reasoning violations
- collapsing observation and hypothesis into one object
- presenting tentative hypotheses as certain
- generating implications from discarded hypotheses
- using confidence language stronger than the evidence allows

### Writing violations
- generic startup analysis that could fit any company
- performatively clever or smug language
- filler strategy phrases without specific meaning
- unsupported causal claims
- elegant paraphrase mistaken for insight

### Traceability violations
- missing lineage
- dangling `evidence_ids`
- dangling `source_ids`
- report claims with no upstream support

---

## Confidence Policy

The Report Engine must use explicit confidence bands.

### High confidence
Use when:
- multiple reinforcing signals exist
- tension or pattern is clearly supported
- little direct contradiction exists
- lineage is strong and direct

Allowed phrasing:
- "The evidence strongly suggests..."
- "This appears to be a structural pattern..."
- "The company is consistently showing signs of..."

### Medium confidence
Use when:
- support is meaningful but incomplete
- alternative explanations remain plausible
- some ambiguity remains unresolved

Allowed phrasing:
- "There are signs that..."
- "One plausible reading is..."
- "The available evidence suggests..."

### Low confidence
Use when:
- evidence is sparse
- support is suggestive rather than strong
- critical gaps remain unresolved

Allowed phrasing:
- "This may indicate..."
- "The evidence is suggestive but incomplete..."
- "It is possible that..."

### Confidence constraints
- Low-confidence hypotheses must not be written as conclusions.
- Confidence may be downgraded during stress testing.
- Any hypothesis with insufficient support after stress testing must be discarded.
- Final prose must not exceed the confidence of the underlying analytical object.

---

## Acceptance Criteria

The Report Engine is acceptable in v1 if it satisfies the following.

### Structural acceptance criteria
- all stage outputs validate against schema
- all output objects have complete lineage
- no report section contains unsupported claims
- no fresh research occurs
- discarded hypotheses do not appear in report prose

### Analytical acceptance criteria
- report identifies at least one meaningful strategic tension when present in the dossier
- report surfaces company-specific insight rather than generic summary
- report distinguishes between what is observed and what is inferred
- report includes uncertainty where evidence is limited

### Writing acceptance criteria
- report is clear, compact, and evidence-disciplined
- report avoids banned filler phrases
- report feels specific and strategically useful
- report is sharp without becoming unfair or theatrical

---

## Non-Goals for V1

The following are explicitly out of scope for v1.

- fresh research during report generation
- autonomous follow-up investigation
- action plan generation beyond evidence-backed implications
- interactive report personalization
- benchmarking against private internal data
- multi-company comparison reports
- polished design-first output formatting
- fully automated truth scoring of prose semantics

---

## Failure Modes

The following outcomes are considered failures.

### Analytical failures
- report summarizes facts without surfacing tension
- hypotheses are generic and reusable across unrelated companies
- important contradictions are missed
- weak evidence is overinterpreted

### Structural failures
- missing lineage
- invalid intermediate objects
- unsupported statements in final prose
- contradictions between analytical objects and report text

### Writing failures
- generic MBA language
- overconfident wording
- vague, inflated, or ornamental prose
- tone that feels smug, theatrical, or performatively sharp

---

## Design Principle

The Report Engine must be designed as a structured reasoning system over a fixed intelligence object.

The writing layer is downstream of judgment.

The report must emerge from:
- signals
- tensions
- patterns
- hypotheses
- implications

Not directly from dossier facts.

---

## V1 North Star

Given the same dossier, the Report Engine should produce output that is:
- structured
- traceable
- evidence-backed
- strategically perceptive
- specific to the company
- improvable through better upstream reasoning rather than looser prose generation