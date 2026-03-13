Good.
This stage is where the system moves from **analysis to consequence**.

Up to this point:

```
signals      → observations
tensions     → contradictions
patterns     → structures
hypotheses   → explanations
stress test  → filtering
```

Now the system asks:

> **If these explanations are true, what follows?**

This is the first stage where the system produces **decision-relevant insight**.

---

# `docs/specs/stages/generate-implications.md`

```md
# Stage Spec: Generate Implications

## Stage Name

generate-implications

---

# Purpose

The implication generation stage translates surviving hypotheses into **strategic consequences**.

Implications describe what may follow if a hypothesis is true.

They identify:

- risks
- constraints
- opportunities
- tradeoffs
- structural watchpoints

Implications are the bridge between analysis and decision-making.

They are not recommendations.

They are **logical consequences**.

---

# Inputs

hypotheses.json  
patterns.json  
tensions.json  
signals.json

Only hypotheses with status:

```

survives

```

may generate implications.

Weak or discarded hypotheses must not influence this stage.

---

# Outputs

implications.json

An array of Implication objects.

Each implication must include:

- implication_id
- hypothesis_id
- title
- statement
- implication_type
- audience
- horizon
- confidence
- urgency
- impact
- evidence_ids
- source_ids
- key_questions

Implications must preserve evidence lineage through the originating hypothesis.

---

# Definition of an Implication

An implication is:

> a consequence that may follow if a surviving hypothesis is correct.

Implications translate explanation into **strategic significance**.

They should help decision-makers understand:

- where risk may appear
- where growth may be constrained
- where competitors may exploit weakness
- where hidden opportunity may exist

---

# What Implications Are Not

Implications are not:

- recommendations
- instructions
- strategies
- solutions
- opinions

They describe **consequences**, not actions.

---

# Example

### Hypothesis

```

Automation narrative may be compensating for immature product capabilities

```

### Implication

Title:

```

Scaling revenue may require increasing human delivery capacity

```

Statement:

```

If automation capabilities remain limited,
revenue growth may require scaling human
implementation and support capacity,
which could constrain margins and scalability.

```

This implication follows logically from the hypothesis.

---

# Implication Types

Allowed categories:

```

risk
opportunity
constraint
tradeoff
watchpoint
structural

```

Examples:

| Type | Example |
|-----|-----|
risk | service delivery limiting product margins |
opportunity | under-communicated customer value |
constraint | founder-led sales limiting scale |
tradeoff | high-touch onboarding vs rapid growth |
watchpoint | enterprise push before product readiness |

---

# Audience

Each implication must specify the relevant audience.

Allowed audiences:

```

founder
executive
investor
operator
candidate

```

Different audiences care about different consequences.

---

# Horizon

Implications must specify a time horizon.

Allowed horizons:

```

immediate
near_term
mid_term
structural

```

Examples:

| Horizon | Meaning |
|------|------|
immediate | current operational impact |
near_term | next 6–12 months |
mid_term | next 1–3 years |
structural | long-term company trajectory |

---

# Implication Structure

Each implication must contain:

### Title

Short description of the consequence.

Example:

```

Enterprise credibility may lag enterprise ambition

```

---

### Statement

Clear articulation of the consequence.

Statements must:

- remain conditional
- reference the underlying hypothesis
- avoid certainty beyond confidence

---

### Key Questions

Implications must include questions decision-makers should consider.

Example:

```

Key questions:

• How much of product delivery currently requires human intervention?
• Can the product roadmap eliminate onboarding dependencies?
• Are margins dependent on service-heavy implementation?

```

Questions help readers explore the implication.

---

# Implication Generation Strategy

Implications may be derived using several reasoning approaches.

### Consequence reasoning

What happens if the hypothesis is correct?

### Scaling reasoning

How does the hypothesis affect growth or scale?

### Competitive reasoning

How might competitors exploit this structure?

### Operational reasoning

What operational constraints emerge?

### Narrative reasoning

How might the company’s story conflict with reality?

---

# Implication Ranking

Implications should be scored across three dimensions.

### impact

Magnitude of potential consequence.

### urgency

How soon the consequence may emerge.

### confidence

Confidence inherited from the hypothesis.

Implications derived from weaker hypotheses must carry lower confidence.

---

# Expected Volume

Typical output:

```

5–12 implications

```

The system should prefer **fewer high-impact implications** over many minor ones.

---

# Deduplication Rules

Implications must not overlap.

Two implications should not exist if:

- they describe the same consequence
- they rely on the same hypothesis
- they differ only in wording

The system should merge similar implications.

---

# Failure Modes

The stage fails if implications are:

### Recommendations

Example:

```

The company should invest in better automation.

```

This is advice, not implication.

---

### Generic

Example:

```

Competition may increase in the market.

```

Unless supported by hypothesis.

---

### Detached

Implications must derive directly from hypotheses.

---

### Certain

Implications must remain conditional.

---

# Acceptance Tests

The stage passes if:

- each implication references a surviving hypothesis
- implications remain conditional
- implications preserve lineage
- implications highlight real consequences
- implications avoid recommendations

---

# Output Constraints

Every implication must include:

```

implication_id
company_id
hypothesis_id
title
statement
implication_type
audience
horizon
confidence
urgency
impact
evidence_ids
source_ids
key_questions

```

Implications failing schema validation must be rejected.

---

# Non-Goals

This stage must not:

- recommend strategies
- write narrative report text
- introduce new hypotheses
- reinterpret evidence

Its role is strictly to describe **consequences of surviving explanations**.

---

# Design Principle

Strategic insight becomes useful when it reveals consequences.

Decision-makers do not only need to know what may be happening.

They need to understand **what it means for the future of the company**.
```

---
