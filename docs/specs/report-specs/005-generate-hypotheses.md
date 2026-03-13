Excellent.
This is the **core reasoning stage** of the entire system.

Up to now the system has only **observed structure**:

```
signals → observations
tensions → contradictions
patterns → structural forms
```

Now the system attempts to answer:

> **What might actually be going on?**

This is where the system begins acting like a strategist.

But the spec must **prevent overconfidence**, because this is also where hallucinations usually appear.

---

# `docs/specs/stages/generate-hypotheses.md`

```md
# Stage Spec: Generate Hypotheses

## Stage Name

generate-hypotheses

---

# Purpose

The hypothesis generation stage proposes **possible explanations** for the structural patterns observed in the company.

Hypotheses attempt to answer:

> What underlying forces might explain these patterns?

Hypotheses are **tentative strategic explanations**, not conclusions.

They represent candidate interpretations that must be tested in the next stage.

---

# Inputs

patterns.json  
tensions.json  
signals.json

Patterns are the primary input.

Tensions and signals may be referenced to support the reasoning chain.

The stage must not inspect the dossier directly.

---

# Outputs

hypotheses.json

An array of Hypothesis objects.

Each hypothesis must include:

- hypothesis_id
- title
- statement
- hypothesis_type
- pattern_ids
- tension_ids
- signal_ids
- evidence_ids
- source_ids
- assumptions
- alternative_explanations
- missing_evidence
- confidence
- novelty
- severity
- actionability
- status

---

# Definition of a Hypothesis

A hypothesis is:

> a plausible explanation for one or more structural patterns.

Hypotheses should attempt to explain **why the patterns may exist**.

However, they must remain **tentative and falsifiable**.

---

# Hypothesis Characteristics

Good hypotheses are:

### Pattern-rooted

They must originate from observed patterns.

### Plausible

They must logically explain the patterns.

### Falsifiable

There must be potential evidence that could disprove them.

### Strategically meaningful

They should matter for the company’s trajectory.

---

# Example

### Pattern

```

Service-assisted delivery beneath automation narrative

```

### Hypothesis

Title:

```

Automation narrative may be compensating for immature product capabilities

```

Statement:

```

The company's automation-focused positioning may be masking
a delivery model that still depends heavily on human support
because product capabilities are not yet sufficient to automate
the workflow fully.

```

This explains the pattern but does not claim certainty.

---

# Hypothesis Types

Allowed categories:

```

strategic
product
gtm
operational
leadership
market
organizational
narrative

```

Examples:

| Type | Example |
|-----|-----|
product | product capability lag |
gtm | enterprise narrative preceding enterprise readiness |
operational | human-heavy onboarding compensating for product gaps |
leadership | founder-driven credibility bottleneck |
market | positioning ahead of market maturity |

---

# Hypothesis Structure

Each hypothesis must contain:

### Title

Short description of the explanation.

### Statement

Clear articulation of the explanation.

### Assumptions

Explicit assumptions the hypothesis relies on.

Example:

```

Assumption: customers expect automated delivery.

```

### Alternative explanations

Possible alternative interpretations.

Example:

```

Customers may prefer high-touch onboarding.

```

### Missing evidence

Information that would confirm or refute the hypothesis.

Example:

```

Evidence of fully automated deployments.

```

---

# Hypothesis Generation Strategy

The stage should use patterns as prompts for explanation.

Possible reasoning methods include:

### Structural explanation

Explaining the structural form observed.

### Capability gap reasoning

Identifying capability gaps implied by patterns.

### Incentive reasoning

Considering incentives shaping company behavior.

### Narrative analysis

Examining why a narrative may diverge from reality.

### Competitive pressure reasoning

Considering how competitors or markets shape behavior.

---

# Hypothesis Ranking

Hypotheses should be scored across four dimensions.

### confidence

How plausible the hypothesis is given the evidence.

### novelty

How non-obvious the explanation is.

### severity

How consequential the hypothesis would be if true.

### actionability

Whether the insight matters for decision-makers.

---

# Expected Volume

Typical output:

```

5–10 hypotheses

```

However, only a subset will survive stress testing.

---

# Hypothesis Status

Each hypothesis begins with:

```

status: candidate

```

The next stage may change status to:

```

survives
weak
discarded

```

Discarded hypotheses must not appear in the report.

---

# Deduplication Rules

Two hypotheses should not exist if:

- they explain the same pattern identically
- they differ only in wording
- they share the same assumptions and implications

The system should prefer **distinct explanations**.

---

# Failure Modes

The stage fails if hypotheses are:

### Generic

Example:

```

The company needs better strategy.

```

### Unsupported

Hypotheses must trace to patterns and tensions.

### Certain

Hypotheses must not be written as conclusions.

### Cosmetic

Hypotheses must address structural patterns.

---

# Acceptance Tests

The stage passes if:

- each hypothesis references at least one pattern
- hypotheses remain falsifiable
- hypotheses articulate assumptions
- alternative explanations are listed
- missing evidence is identified
- hypotheses remain tentative

---

# Output Constraints

Every hypothesis must include:

```

hypothesis_id
company_id
title
statement
hypothesis_type
pattern_ids
tension_ids
signal_ids
evidence_ids
source_ids
assumptions
alternative_explanations
missing_evidence
confidence
novelty
severity
actionability
status

```

Hypotheses failing schema validation must be rejected.

---

# Non-Goals

The hypothesis stage must not:

- treat explanations as confirmed truths
- produce final conclusions
- propose actions
- write narrative report text

Its role is to produce **candidate explanations**.

---

# Design Principle

The goal is not to be right immediately.

The goal is to produce **good explanations that can survive stress testing**.

Weak hypotheses should fail in the next stage.

Strong hypotheses should remain.
```

---
