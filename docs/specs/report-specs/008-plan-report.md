Excellent.
This stage determines whether the final output feels like **a structured strategic document** or **a pile of insights**.

Up to now the system has produced **analytical objects**:

```
signals
tensions
patterns
hypotheses
implications
```

But a good report needs **structure and narrative spine**.

This stage chooses:

* what matters most
* what the report is actually saying
* what order reveals insight best

Importantly, **this stage does not write prose**.

It designs the **argument structure**.

---

# `docs/specs/stages/plan-report.md`

```md
# Stage Spec: Plan Report

## Stage Name

plan-report

---

# Purpose

The report planning stage constructs the **narrative structure** of the report.

It selects the most important analytical insights and organizes them into a coherent argument.

The plan defines:

- the core thesis
- the key supporting insights
- the section structure
- the order in which insights appear

This stage transforms analytical output into **a strategic narrative outline**.

The actual writing happens in the next stage.

---

# Inputs

implications.json  
hypotheses.json  
patterns.json  
tensions.json  
signals.json

Hypotheses with status `survives` may shape the core report argument.

Hypotheses with status `weak` may be referenced only in uncertainty-oriented sections.

Hypotheses with status `discarded` must not influence the report plan.

---

# Outputs

report-plan.json

The report plan contains:

- report_id
- company_id
- core_thesis
- key_findings
- primary_hypothesis_ids
- supporting_hypothesis_ids
- implication_ids
- section_plan
- tone_profile

The plan must reference analytical objects by id.

---

# Definition of a Report Plan

A report plan is:

> a structured blueprint for how analytical insights will be communicated in the final report.

The plan determines:

- what the report is fundamentally arguing
- which insights support that argument
- how readers should encounter those insights

---

# Core Thesis

The report must contain a **core thesis**.

The thesis summarizes the most important strategic insight revealed by the system.

Example:

```

The company’s automation narrative appears ahead of its
current product capabilities, which may create tension
between growth ambitions and operational scalability.

```

The thesis must be supported by:

- patterns
- tensions
- hypotheses
- implications

---

# Key Findings

The report plan must identify **3–5 key findings**.

These represent the most important insights in the system.

Findings should be derived from:

- surviving hypotheses
- high-impact implications
- high-weight patterns

Example:

```

• Automation narrative exceeds observable automation delivery.
• Enterprise positioning appears ahead of enterprise readiness.
• Delivery model may depend heavily on human implementation.

```

Findings guide section design.

---

# Hypothesis Selection

The report plan must classify hypotheses into two groups.

### Primary hypotheses

These form the backbone of the report.

Typical count:

```

2–4

```

### Supporting hypotheses

These add depth but are not central.

Typical count:

```

2–5

```

Hypotheses must be selected based on:

- confidence
- severity
- strategic weight
- novelty

---

# Implication Selection

The report should highlight the **most consequential implications**.

Typical count:

```

5–8 implications

```

Implications must be prioritized by:

- impact
- urgency
- relevance to decision-makers

---

# Section Plan

The report plan must define the structure of the report.

Example structure:

```

1. Executive Overview
2. What the Evidence Shows
3. Where the Tensions Are
4. What May Really Be Happening
5. Strategic Implications
6. What Remains Uncertain

```

Each section must include:

- section_id
- title
- purpose
- hypothesis_ids
- implication_ids

---

# Narrative Flow

The report should follow a logical progression:

```

observation
→ tension
→ explanation
→ consequence

```

Sections should mirror this reasoning chain.

The plan should ensure that readers encounter insights in an order that:

- builds understanding
- reveals tension gradually
- culminates in implications

---

# Tone Profile

The report plan must specify tone parameters.

Example:

```

style: forensic
directness: medium
skepticism: medium
warmth: low

```

Tone must ensure the report feels:

- sharp
- disciplined
- evidence-backed

But not:

- sarcastic
- theatrical
- smug

---

# Ranking Strategy

The report plan should prioritize insights using:

### strategic importance

Does this insight materially affect company trajectory?

### evidence strength

Is the insight well supported?

### novelty

Is the insight non-obvious?

---

# Expected Volume

Typical plan output:

```

core thesis: 1
key findings: 3–5
primary hypotheses: 2–4
supporting hypotheses: 2–5
implications: 5–8
sections: 5–7

```

---

# Deduplication Rules

Insights must not repeat across sections.

If two sections contain similar insight:

- merge them
- prioritize the stronger argument

The report should maintain **clarity and focus**.

---

# Failure Modes

The stage fails if:

### No clear thesis emerges

The report must have a central argument.

### Too many insights appear

Reports overloaded with insights become unreadable.

### Sections lack purpose

Each section must contribute to the thesis.

### Weak hypotheses dominate

Low-confidence hypotheses should not anchor the report.

---

# Acceptance Tests

The stage passes if:

- the report has a clear thesis
- the plan references surviving hypotheses
- implications are prioritized
- sections form a coherent narrative
- insights remain traceable

---

# Output Constraints

Every report plan must include:

```

report_id
company_id
core_thesis
key_findings
primary_hypothesis_ids
supporting_hypothesis_ids
implication_ids
section_plan
tone_profile

```

Report plans failing schema validation must be rejected.

---

# Non-Goals

This stage must not:

- write narrative report text
- introduce new analytical insights
- reinterpret evidence
- generate new hypotheses

Its role is strictly to **structure the argument**.

---

# Design Principle

Great analysis can be lost in poor structure.

The goal of this stage is to ensure that the final report reads like a **coherent strategic argument**, not a list of observations.
```

---

