This stage is what separates **a reasoning system from a storytelling system**.

Most AI analysis pipelines stop at:

```
patterns → hypotheses → report
```

Your system adds a crucial step:

```
patterns → hypotheses → stress test → report
```

This stage **tries to break the hypotheses** before they influence the report.

That is exactly how good strategists think.

---

# `docs/specs/stages/stress-test-hypotheses.md`

```md
# Stage Spec: Stress Test Hypotheses

## Stage Name

stress-test-hypotheses

---

# Purpose

The stress testing stage evaluates candidate hypotheses to determine whether they should:

- survive
- weaken
- be discarded

This stage attempts to **disprove or weaken hypotheses** using available signals, tensions, and patterns.

The goal is not to confirm hypotheses.

The goal is to **challenge them**.

Only hypotheses that survive this stage should influence the report.

---

# Inputs

hypotheses.json  
patterns.json  
tensions.json  
signals.json

Hypotheses arrive with status:

```

candidate

```

---

# Outputs

updated hypotheses.json

Each hypothesis must receive:

```

status: survives | weak | discarded

```

Additional fields must be added:

- strongest_support
- strongest_objections
- residual_uncertainty
- confidence (updated in place — supersedes the candidate-stage value)
- initial_confidence (optional — original value preserved for audit)

---

# Definition of Stress Testing

Stress testing means actively searching for:

- contradictory signals
- alternative explanations
- missing evidence
- weak assumptions
- plausible non-causal interpretations

The system must assume the hypothesis may be wrong.

---

# Stress Testing Strategy

The system should evaluate hypotheses through multiple checks.

### 1. Counter-evidence check

Look for signals that contradict the hypothesis.

Example:

Hypothesis:

```

Product automation is immature.

```

Counter evidence:

```

Evidence of automated deployments.

```

If strong counter evidence exists, confidence must drop.

---

### 2. Alternative explanation test

Evaluate whether alternative explanations listed in the hypothesis could explain the pattern equally well.

Example:

Original hypothesis:

```

Automation narrative compensates for product immaturity.

```

Alternative explanation:

```

Customers prefer human onboarding.

```

If alternatives remain equally plausible, confidence should remain moderate.

---

### 3. Evidence sufficiency test

Check whether the evidence volume supporting the hypothesis is adequate.

Indicators of weak support include:

- single signal explanations
- weak inference signals
- indirect evidence chains

Hypotheses supported by sparse evidence should be downgraded.

---

### 4. Assumption fragility test

Evaluate whether the hypothesis depends on assumptions that may not hold.

Example assumption:

```

Enterprise customers expect full automation.

```

If the assumption is weak, confidence should decrease.

---

### 5. Structural consistency test

Check whether the hypothesis explains **all relevant patterns**.

Hypotheses that explain only part of the structure may remain weak.

---

# Status Assignment

After testing, hypotheses receive one of three statuses.

### survives

The hypothesis remains plausible and reasonably supported.

Confidence may remain high or medium.

These hypotheses may influence the report.

---

### weak

The hypothesis remains possible but poorly supported.

Confidence should be downgraded.

Weak hypotheses may appear in uncertainty sections but not as core arguments.

---

### discarded

The hypothesis fails stress testing.

Reasons may include:

- strong counter evidence
- stronger alternative explanation
- insufficient evidence
- weak assumptions

Discarded hypotheses must not appear in the report.

---

# Confidence Revision

Confidence may be adjusted during stress testing.

Example:

```

candidate: medium
→ survives: medium

```
```

candidate: medium
→ weak: low

```
```

candidate: medium
→ discarded

```

Confidence must reflect the remaining strength of the hypothesis.

For all downstream stages, the stress-tested `confidence` value is authoritative.

Implementations may preserve the pre-stress-test value as `initial_confidence` for audit purposes, but all downstream reasoning must use the updated `confidence`.

---

# Residual Uncertainty

Surviving hypotheses must include an explicit description of remaining uncertainty.

Example:

```

Residual uncertainty:

The degree of automation achieved in production
environments cannot be determined from available evidence.

```

This ensures the report acknowledges limitations.

---

# Deduplication

Stress testing may reveal overlapping hypotheses.

If two hypotheses explain the same pattern:

- retain the stronger one
- discard or merge the weaker one

The system should prefer **clear explanations over multiple similar ones**.

---

# Failure Modes

The stage fails if:

### Confirmation bias occurs

The system only looks for evidence supporting the hypothesis.

### Weak hypotheses survive

Hypotheses with insufficient support remain marked as "survives".

### Contradictions are ignored

Strong counter signals are overlooked.

### Confidence inflation occurs

Confidence increases without new supporting evidence.

---

# Acceptance Tests

The stage passes if:

- hypotheses are evaluated against counter evidence
- alternative explanations remain considered
- confidence reflects evidence strength
- weak hypotheses are downgraded
- discarded hypotheses are removed from downstream reasoning

---

# Output Constraints

Each hypothesis must include the following additional fields after stress testing:

```

status
strongest_support
strongest_objections
residual_uncertainty
confidence (updated — supersedes the candidate-stage value)
initial_confidence (optional — preserved for audit trail only)

```

Only hypotheses with status:

```

survives

```

may be used by downstream report stages.

---

# Non-Goals

This stage must not:

- generate new hypotheses
- produce narrative explanations
- propose strategic actions
- modify evidence lineage

Its role is strictly to **test and filter explanations**.

---

# Design Principle

Strategic insight often emerges from eliminating weak explanations.

This stage ensures that the report is shaped by hypotheses that have **survived challenge**, not merely those that sound convincing.
```

---

