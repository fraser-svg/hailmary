Great. This stage is where the system moves from **local contradictions** to **structural understanding**.

Signals → observations
Tensions → misalignments
**Patterns → underlying structure**

Patterns are the first place where the system starts seeing the company as a **system rather than a set of facts**.

---

# `docs/specs/stages/detect-patterns.md`

```md
# Stage Spec: Detect Patterns

## Stage Name

detect-patterns

---

# Purpose

The pattern detection stage identifies **structural themes** that emerge from groups of signals and tensions.

Patterns represent recurring structures in how the company operates, positions itself, grows, or communicates.

Patterns compress many observations into a smaller number of meaningful strategic structures.

If signals are the atoms and tensions are the stress points, patterns are the **structural forms** that shape the company’s behavior.

Patterns are the primary inputs for hypothesis generation.

---

# Inputs

tensions.json  
signals.json

The pattern stage uses tensions as its primary signal of structural misalignment.

Signals may be used to enrich or support pattern articulation.

The stage must not inspect the dossier directly.

---

# Outputs

patterns.json

An array of Pattern objects.

Each pattern must include:

- pattern_id
- title
- summary
- pattern_type
- tension_ids
- signal_ids
- evidence_ids
- source_ids
- importance
- confidence
- strategic_weight

Patterns must preserve traceability through tensions and signals.

---

# Definition of a Pattern

A pattern is:

> a recurring structural form that emerges from multiple tensions and signals.

Patterns represent **how the company behaves structurally**.

Patterns describe **forms**, not causes.

They are descriptive but higher-level than tensions.

---

# Example

### Inputs

Tensions:

```

AI automation narrative vs human-supported delivery

```
```

Enterprise positioning vs SMB customer base

```

Signals:

```

Hiring implementation specialists

```
```

Customer reviews emphasize onboarding support

```

---

### Pattern

Title:

```

Service-assisted delivery beneath automation narrative

```

Summary:

```

Multiple tensions and signals indicate that the company’s
delivery model may rely heavily on human support despite
an automation-focused narrative.

```

This pattern identifies structure without explaining the cause.

---

# What Patterns Are Not

Patterns are not:

- hypotheses
- causal explanations
- judgments
- predictions
- recommendations

They are structural observations.

---

# Pattern Types

Allowed pattern types:

```

contradiction
gap
dependency
concentration
fragility
overextension
misalignment
drift
consistency
trajectory

```

Examples:

### contradiction

Two systems moving in opposite directions.

Example:

```

Premium positioning vs low authority signals

```

---

### gap

Capability or credibility gap.

Example:

```

Enterprise ambition vs enterprise readiness

```

---

### dependency

Overreliance on a single component.

Example:

```

Founder-driven narrative concentration

```

---

### fragility

Structural weakness that may break under growth.

Example:

```

High-touch onboarding in a growth-focused product model

```

---

### overextension

Company expanding narrative faster than operational capability.

Example:

```

Broad market positioning vs narrow customer proof

```

---

### trajectory

Directional change visible in signals.

Example:

```

Shift from SMB messaging toward enterprise language

```

---

# Pattern Formation Strategy

Pattern detection should involve:

### Tension clustering

Grouping related tensions into larger structures.

### Signal reinforcement

Using signals to confirm structural patterns.

### Cross-domain analysis

Patterns often emerge across domains.

Example:

```

marketing narrative
vs
customer experience
vs
hiring signals

```

### Structural compression

Reducing many tensions into a few important structures.

---

# Pattern Ranking

Patterns should be scored across three dimensions.

### importance

How central the pattern is to the company’s strategy.

### confidence

How well supported the pattern is by tensions and signals.

### strategic_weight

How consequential the pattern may be if it continues.

---

# Expected Volume

Typical output:

```

3–7 patterns

```

Pattern count should remain small.

Too many patterns dilute strategic clarity.

---

# Pattern Structure

Every pattern must contain:

### Title

Short description of the structural form.

Example:

```

Narrative-operating model mismatch

```

---

### Summary

Clear explanation of the structural observation.

The summary may integrate signals and tensions.

However, it must avoid causal claims.

---

# Deduplication Rules

Patterns must not overlap significantly.

Two patterns should not exist if:

- they describe the same structural form
- they rely on identical tensions
- they differ only in wording

The system should merge similar patterns.

---

# Failure Modes

The stage fails if patterns are:

### Restatements

Example:

```

The company sells AI software.

```

---

### Overly specific

Patterns should generalize multiple tensions.

---

### Hypothesis-like

Example:

```

The company relies on services because its product is immature.

```

This is a hypothesis.

---

### Cosmetic

Patterns must matter strategically.

---

# Acceptance Tests

The stage passes if:

- each pattern references multiple tensions or signals
- patterns preserve lineage
- patterns compress observations meaningfully
- patterns remain non-causal
- patterns reduce system complexity

---

# Output Constraints

Every pattern must include:

```

pattern_id
company_id
pattern_type
title
summary
tension_ids
signal_ids
evidence_ids
source_ids
importance
confidence
strategic_weight

```

Patterns failing schema validation must be rejected.

---

# Non-Goals

The pattern stage must not:

- explain root causes
- predict company outcomes
- propose strategic actions
- write narrative report text

Those responsibilities belong to later stages.

---

# Design Principle

Companies rarely fail because of individual mistakes.

They fail because of **structural patterns** that shape decisions and capabilities.

The goal of this stage is to surface those structures.

Good patterns make the next stage — hypothesis generation — possible.
```

---
