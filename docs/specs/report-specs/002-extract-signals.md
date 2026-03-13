Perfect. We’ll do this **proper spec-driven style**: one stage at a time, behavior first, no code yet.

Below is the first stage spec.

---

# `docs/specs/stages/extract-signals.md`

```md
# Stage Spec: Extract Signals

## Stage Name

extract-signals

---

# Purpose

The signal extraction stage converts raw dossier claims into **analytical observations** that can be used for higher-order reasoning.

Signals are the smallest unit of strategic meaning in the report engine.

They are **not facts** and **not explanations**.

They are structured observations that highlight something notable about the company.

Signals should capture:

- patterns in company behavior
- narrative characteristics
- operational indicators
- market positioning clues
- credibility signals
- structural risk indicators

Signals form the raw material for detecting tensions and patterns.

All downstream reasoning depends on signal quality.

---

# Inputs

```

dossier.json

```

The dossier contains structured intelligence including:

- company claims
- evidence records
- sources
- product descriptions
- GTM signals
- customer language
- hiring signals
- market context
- narrative statements

The signal stage must only use information present in the dossier.

---

# Outputs

```

signals.json

```

An array of normalized Signal objects.

Each signal must include:

- a unique id
- a short title
- an analytical statement
- lineage to claims
- lineage to evidence
- lineage to sources
- inference level
- confidence
- relevance

Signals must be **traceable**.

---

# Definition of a Signal

A signal is:

> an analytical observation derived from multiple pieces of evidence that highlights something strategically meaningful about the company.

Signals must remain **observational**.

Signals must not attempt to fully explain why something is happening.

That is the job of hypotheses.

---

# What Signals Are Not

Signals are not:

- raw facts
- paraphrased claims
- narrative summaries
- strategic conclusions
- hypotheses
- implications

Signals sit **between facts and explanation**.

---

# Example

### Dossier facts

Company website:

> “Our AI automates sales outreach.”

Customer review:

> “Support team helped us manually build all sequences.”

Job posting:

> “Hiring onboarding specialists to configure campaigns.”

---

### Signal

```

title:
Automation narrative coexists with human-assisted delivery

statement:
The company's marketing emphasizes automated AI outreach,
but customer feedback and hiring signals suggest significant
human involvement in implementation and setup.

```

This signal is observational.

It highlights tension without explaining it.

---

# Signal Quality Criteria

A good signal should satisfy the following.

### Evidence grounded

It must trace back to dossier evidence.

### Analytical

It must go beyond restating claims.

### Strategically relevant

It should matter for how the company operates or competes.

### Concise

Signals should express one observation clearly.

### Non-explanatory

Signals should avoid causal explanations.

---

# Signal Categories

Signals should be categorized by domain.

Allowed categories:

```

positioning
product
gtm
customer
leadership
talent
pricing
market
credibility
operations
risk
other

```

These categories support downstream pattern detection.

---

# Signal Sources

Signals may be derived from:

- company messaging
- customer language
- hiring signals
- product descriptions
- pricing structures
- founder communication
- customer proof density
- competitive positioning
- operational signals
- narrative tone

Signals should frequently combine multiple evidence types.

---

# Inference Levels

Signals must declare inference strength.

### direct

Purely descriptive observation.

Example:

```

Most testimonials reference implementation support.

```

### light_inference

Mild interpretation of evidence.

Example:

```

Customer language emphasizes service support rather than automation.

```

### strong_inference

Significant interpretation across signals.

Example:

```

The company may rely heavily on services during onboarding.

```

Strong inference signals should be used sparingly.

---

# Signal Ranking

Signals should be scored across three dimensions.

### relevance

Strategic importance.

### novelty

How non-obvious the observation is.

### confidence

How well supported the signal is.

Signals may be ranked downstream for pattern formation.

---

# Extraction Strategy

Signal extraction should combine:

- deterministic grouping of related claims
- model-assisted interpretation
- deduplication of overlapping observations

Signals should prefer **multi-evidence synthesis** over single fact commentary.

---

# Deduplication Rules

Signals should not repeat the same observation.

Two signals should not exist if:

- they rely on identical evidence
- they express the same observation
- they differ only stylistically

The system should prefer **fewer, stronger signals**.

---

# Expected Volume

Typical output per company:

```

20–40 signals

```

Fewer signals may occur if evidence is sparse.

---

# Failure Modes

The stage fails if it produces signals that are:

### Restatements

Example:

```

The company offers AI tools for sales.

```

### Strategic conclusions

Example:

```

The company is actually a services firm.

```

### Unsupported interpretations

Signals must trace to evidence.

### Cosmetic observations

Example:

```

The company website uses modern design.

```

Unless strategically relevant.

---

# Acceptance Tests

The stage passes if:

- all signals have evidence lineage
- signals differ from raw claims
- signals are concise
- signals avoid explanation
- signals are categorized
- signals can support downstream reasoning

---

# Output Constraints

Every signal must include:

```

signal_id
company_id
kind
title
statement
claim_ids
evidence_ids
source_ids
inference_label
confidence
relevance
novelty
polarity
tags

```

Signals failing schema validation must be rejected.

---

# Non-Goals

The signal stage must not:

- detect tensions
- form hypotheses
- explain strategy
- propose implications
- produce narrative report text

Its role is strictly observational.

---

# Design Principle

If signals are weak, the entire reasoning pipeline collapses.

The goal of this stage is not volume.

The goal is **clear analytical building blocks** for deeper reasoning.
```

---
