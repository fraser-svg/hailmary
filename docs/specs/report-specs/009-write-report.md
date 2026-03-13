Perfect. This is the **final stage spec**, and it is the most dangerous one if poorly designed.

Why?

Because writing is where AI systems typically:

* introduce **unsupported synthesis**
* inflate **confidence**
* drift into **generic business language**
* break **traceability**

So the spec must make the writer behave more like a **disciplined editor** than an analyst.

The writer should **express judgment already produced**, not invent new judgment.

---

# `docs/specs/stages/write-report.md`

```md
# Stage Spec: Write Report

## Stage Name

write-report

---

# Purpose

The write-report stage converts the structured report plan into a **human-readable strategic report**.

The writer's role is to **express existing analytical insights clearly and precisely**.

The writer must not generate new insights.

All reasoning must already exist in:

- hypotheses
- patterns
- tensions
- signals
- implications

The writing stage is a **rendering step**, not a reasoning step.

---

# Inputs

report-plan.json  
implications.json  
hypotheses.json  
patterns.json  
tensions.json  
signals.json

The writer must operate only on these objects.

The writer must not inspect the dossier directly.

---

# Outputs

report.json  
report.md

The report contains:

- metadata
- sections
- executive summary
- appendix (optional)

Every section must maintain traceability to upstream analytical objects.

---

# Definition of the Report

A report is:

> a structured narrative that communicates the system's analytical conclusions to human readers.

The report should feel:

- perceptive
- disciplined
- evidence-backed
- strategically relevant
- uncomfortable in a constructive way

The report should not feel:

- generic
- speculative
- performatively clever
- inflated

---

# Section Structure

The report should typically include the following sections.

```

1. Executive Overview
2. What the Evidence Shows
3. Where the Tensions Are
4. What May Really Be Happening
5. Strategic Implications
6. What Remains Uncertain

```

Section names may vary slightly, but the structure must follow the reasoning chain.

---

# Section Responsibilities

### Executive Overview

Summarizes the core thesis and key findings.

Typical length:

```

150–300 words

```

Must remain evidence-backed.

---

### What the Evidence Shows

Describes key signals and patterns observed.

This section should focus on **observation rather than interpretation**.

---

### Where the Tensions Are

Explains major contradictions identified by the system.

This section should articulate structural misalignments.

---

### What May Really Be Happening

Presents surviving hypotheses.

Hypotheses must remain tentative and clearly framed.

---

### Strategic Implications

Describes the consequences derived from the hypotheses.

Implications should be framed for decision-makers.

---

### What Remains Uncertain

Acknowledges limits of available evidence.

This section increases credibility by identifying unanswered questions.

This section may reference weak hypotheses, but only as unresolved possibilities.

Weak hypotheses must never be presented as core findings or conclusions.

---

# Writing Constraints

The writer must follow strict constraints.

The writer must conform to the `tone_profile` defined in `report-plan.json`.

---

## No New Insights

The writer must not generate new interpretations.

Every claim must reference existing analytical objects.

---

## Traceability

Each section must include references to:

- hypothesis_ids
- pattern_ids
- tension_ids
- signal_ids
- evidence_ids
- source_ids

Traceability must remain intact.

The writer is responsible for resolving full lineage references for each section from the report plan's referenced hypotheses and implications.

---

## Confidence Alignment

Language must match confidence level.

### High confidence

Allowed phrases:

```

The evidence strongly suggests
The pattern consistently indicates

```


### Medium confidence

Allowed phrases:

```

There are signs that
One plausible explanation is

```


### Low confidence

Allowed phrases:

```

This may indicate
The available evidence is suggestive but incomplete

```

Wording must not exceed confidence level.

---

## Conditional Framing

Implications must remain conditional.

Example:

```

If the current delivery model remains service-heavy,
scaling margins may become difficult.

```

The writer must avoid deterministic language.

---

# Style Rules

The report should use:

- clear language
- short paragraphs
- precise wording
- restrained tone

The report should avoid:

- dramatic rhetoric
- exaggerated claims
- vague abstractions

---

# Banned Phrases

The writer must not use generic strategy filler.

Examples:

```

well positioned
robust value proposition
dynamic market landscape
innovative solution
leveraging synergies
industry leading
strong traction

```

Unless supported by explicit evidence.

---

# Sentence Discipline

Each paragraph should express **one core idea**.

Long speculative passages must be avoided.

---

# Evidence Anchoring

Claims should remain grounded in observable evidence.

Example:

```

Customer feedback repeatedly references onboarding support,
suggesting that automation may not yet cover the full workflow.

```

The writer should avoid unsupported interpretation.

---

# Expected Length

Typical report length:

```

1500–3000 words

```

Reports should remain concise.

More words do not equal better analysis.

---

# Failure Modes

The stage fails if the report:

### Introduces new reasoning

Insights not present in upstream objects.

---

### Overstates confidence

Medium-confidence hypotheses written as certainty.

---

### Becomes generic

The report could plausibly apply to many companies.

---

### Breaks traceability

Claims cannot be linked to upstream objects.

---

### Becomes theatrical

Language feels clever rather than disciplined.

---

# Acceptance Tests

The stage passes if:

- every section references upstream objects
- the report follows the reasoning chain
- no unsupported claims appear
- confidence language matches evidence
- the tone remains disciplined

---

# Output Constraints

Every report must include:

```

report_id
company_id
generated_at
sections
summary
lineage_references

```

Each section must include:

```

section_id
title
markdown
hypothesis_ids
pattern_ids
tension_ids
signal_ids
evidence_ids
source_ids

```

Reports failing schema validation must be rejected.

---

# Non-Goals

This stage must not:

- generate new hypotheses
- reinterpret evidence
- produce recommendations
- conduct fresh research

The writer's role is to **communicate analysis**, not create it.

---

# Design Principle

The credibility of the report depends on restraint.

A report that is slightly less dramatic but fully evidence-backed
is far more valuable than one that sounds impressive but drifts
beyond what the evidence supports.
```

---

## What you now have

You now have a **complete spec-driven architecture** for the report engine.

Your stage specs now exist for:

```
extract-signals.md
detect-tensions.md
detect-patterns.md
generate-hypotheses.md
stress-test-hypotheses.md
generate-implications.md
plan-report.md
write-report.md
```

This is **exactly how high-quality reasoning systems are built**.

You have defined:

* the reasoning pipeline
* stage contracts
* failure modes
* acceptance tests
* guardrails against hallucination
* traceability requirements

---
