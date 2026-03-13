Excellent. This is the stage where the system starts becoming **strategically perceptive** rather than merely analytical.

Signals describe the landscape.
**Tensions reveal the strain in the landscape.**

---

# `docs/specs/stages/detect-tensions.md`

```md
# Stage Spec: Detect Tensions

## Stage Name

detect-tensions

---

# Purpose

The tension detection stage identifies **structural contradictions, asymmetries, and mismatches** between signals.

Tensions represent the **points of strategic strain** inside the company’s narrative, operations, positioning, or market behavior.

These tensions are often where:

- risk emerges
- strategy breaks
- competitors attack
- companies misread themselves

Tensions are the most important precursor to meaningful hypotheses.

---

# Inputs

signals.json

Signals contain structured analytical observations derived from the dossier.

Signals include:

- analytical statement
- signal category
- evidence lineage
- inference strength
- strategic relevance

The tension stage must operate **only on signals**.

It must not inspect the dossier directly.

---

# Outputs

tensions.json

An array of Tension objects.

Each tension must include:

- tension_id
- title
- statement
- tension_type
- signal_ids
- evidence_ids
- source_ids
- confidence
- severity
- strategic_relevance

Tensions must preserve traceability to evidence through signals.

---

# Definition of a Tension

A tension is:

> a structured contradiction, asymmetry, or misalignment between two or more signals.

Tensions capture **strain**, not explanation.

They should describe **what appears to conflict**, not why.

---

# Examples

### Example 1 — Claim vs Reality

Signals:

```

Signal A:
Company narrative emphasizes AI automation.

```
```

Signal B:
Customer feedback highlights manual support and onboarding.

```

Tension:

```

AI automation narrative vs human-supported delivery

```

Statement:

```

The company's automation narrative appears stronger than the
customer evidence of automated delivery.

```

---

### Example 2 — Ambition vs Proof

Signals:

```

Signal A:
Company positions itself as an enterprise platform.

```
```

Signal B:
Customer references appear primarily small business.

```

Tension:

```

Enterprise positioning vs SMB proof base

```

---

# What Tensions Are Not

Tensions are not:

- explanations
- accusations
- conclusions
- hypotheses
- opinions

They are structured observations of **misalignment**.

---

# Types of Tension

Allowed categories:

```

claim_vs_reality
ambition_vs_proof
positioning_vs_delivery
growth_vs_readiness
breadth_vs_focus
brand_vs_customer_language
speed_vs_trust
automation_vs_service
vision_vs_execution
credibility_vs_claim
other

```

These types help downstream pattern formation.

---

# Sources of Tension

Tensions often arise between signals in different domains.

Examples:

| Domain A | Domain B |
|--------|--------|
marketing narrative | customer feedback |
product claims | hiring signals |
positioning | customer profile |
growth ambition | operational maturity |
automation promise | services reality |
brand voice | customer language |

The engine should preferentially detect **cross-domain tensions**.

---

# Tension Structure

A tension should include:

### Title

Short description of the misalignment.

Example:

```

Automation narrative vs service-heavy delivery

```

### Statement

Concise articulation of the tension.

Example:

```

The company's narrative emphasizes automation,
but multiple signals indicate significant human
involvement in onboarding and delivery.

```

---

# Tension Detection Strategy

Tension detection should involve:

### Signal comparison

Comparing signals across categories.

### Narrative mismatch detection

Comparing company claims vs customer language.

### Capability mismatch detection

Comparing ambition signals vs operational signals.

### Proof density analysis

Comparing marketing statements vs evidence volume.

---

# Tension Ranking

Tensions should be scored across three dimensions.

### Severity

How structurally important the contradiction is.

### Strategic relevance

How likely the tension affects company performance.

### Confidence

How strongly the signals support the tension.

---

# Expected Volume

Typical output:

```

5–15 tensions

```

Not every signal produces a tension.

The system should prefer **fewer, stronger tensions**.

---

# Deduplication Rules

Multiple tensions should not exist if:

- they describe the same misalignment
- they rely on the same signal pair
- they differ only in wording

The system should collapse overlapping tensions.

---

# Failure Modes

The stage fails if tensions are:

### Invented

Tensions must derive from signals.

### Trivial

Example:

```

Company focuses on product and customers.

```

### Explanatory

Example:

```

The company struggles to deliver enterprise features.

```

This is a hypothesis, not a tension.

### Cosmetic

Example:

```

Brand tone is slightly informal.

```

Unless tied to strategic misalignment.

---

# Acceptance Tests

The stage passes if:

- tensions reference multiple signals
- tensions preserve evidence lineage
- tensions articulate misalignment clearly
- tensions do not explain causes
- tensions avoid speculation

---

# Output Constraints

Every tension must include:

```

tension_id
company_id
type
title
statement
signal_ids
evidence_ids
source_ids
confidence
severity
strategic_relevance

```

Tensions failing schema validation must be rejected.

---

# Non-Goals

The tension stage must not:

- form hypotheses
- assign strategic blame
- determine root causes
- write narrative report text
- propose actions

It only identifies **where strain exists**.

---

# Design Principle

Strategy often fails at points of tension.

Companies frequently overlook their own contradictions.

This stage should expose those contradictions clearly and objectively.

The goal is not to criticize.

The goal is to **reveal structural strain that may shape the company’s trajectory.**
```

---
