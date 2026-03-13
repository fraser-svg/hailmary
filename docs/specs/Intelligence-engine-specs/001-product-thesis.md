# Spec 001: Product Thesis

## Status

Draft v1

## Working Title

**Company Intelligence Engine**

## Purpose

Build a system that accepts a company name and domain, conducts structured external research, and produces a machine-readable dossier that another AI system can interpret and act on.

This system exists to uncover a core business truth:

**Most businesses do not actually know what they are selling.**
They describe their offer in internal language, feature language, or category language. Customers often buy for different reasons and describe the value in very different terms.

The system should help surface that gap clearly and reliably.

---

## Problem Statement

Founder-led B2B companies often misunderstand the real reasons customers choose them.

They tend to frame their product around:

* features
* capabilities
* internal process
* category labels
* assumptions about buyer priorities

But customers often buy based on:

* a simpler outcome
* a more emotional driver
* an unexpected differentiator
* a practical business result
* language the company itself never uses

Because of this mismatch, companies struggle with:

* weak positioning
* ineffective messaging
* poor resonance in outbound
* lower conversion
* weak differentiation against competitors

The core problem is not just lack of research. It is lack of **true narrative intelligence**.

---

## Product Thesis

Given a company name and domain, the system will gather public evidence, structure that evidence into intelligence records, and generate a machine-readable company dossier that helps downstream AI determine:

1. what the company says it sells
2. what customers appear to buy
3. where the narrative gap exists
4. what GTM, competitor, and market context surrounds that gap
5. what strategic implications follow

---

## Primary User

The primary user is the **operator building and using the intelligence engine**.

In the current version, the direct human user is:

* you
* internal collaborators
* future analysts or operators using the system

The dossier is **not primarily written for a human reader**.
It is written for:

* downstream AI reasoning
* agent workflows
* strategy generation
* interpretation layers
* future automation

---

## Ideal Customer Profile of the End Market

The eventual end-market focus is:

* founder-led B2B companies
* companies with active GTM motion
* companies that sell software, services, or complex business solutions
* companies where positioning clarity materially affects growth

The product is especially valuable where:

* messaging is vague or over-internal
* the company is scaling
* the company is hiring in sales or marketing
* competitors sound similar
* customers may value something the company underemphasizes

---

## Core Input

The system accepts:

* `company_name`
* `primary_domain`

Future versions may also accept:

* LinkedIn URL
* product URL
* founder name
* review sources
* customer evidence files
* sales call transcripts
* internal messaging docs

But these are **out of scope for V1**.

---

## Core Output

The system outputs a **machine-readable dossier** in a structured JSON format.

The dossier should contain enough evidence and structured reasoning for downstream AI to interpret:

* company profile
* product and offer
* GTM model
* buyer roles and customer signals
* competitors and positioning
* market and macro context
* strategic risks
* narrative intelligence
* evidence quality
* confidence and data gaps
* sources

The output is not a polished human report.
It is a **canonical intelligence object**.

---

## Core Value Proposition

The system helps answer the question:

**What is this company actually selling in the eyes of the market and its customers?**

More specifically, it should help reveal:

* the difference between company-described value and customer-perceived value
* the language customers naturally use
* the strategic implications of that mismatch
* the broader commercial and market context around that narrative gap

---

## Product Principles

### 1. Evidence first

The system should be built on collected evidence, not free-form speculation.

### 2. Structured over chatty

Outputs should be normalized, machine-readable, and consistent across runs.

### 3. Inference must be explicit

If the system infers something, it must mark it as inferred and attach supporting evidence.

### 4. Narrative intelligence is central, but not alone

The product is not just a messaging audit. It must place narrative in the context of GTM, competition, and market reality.

### 5. Downstream AI is the consumer

The output should optimize for interpretation by another AI system, not for polished presentation to a human.

### 6. Reusability matters

The architecture should support repeatable runs across many companies with minimal manual intervention.

---

## What This Product Must Be Able to Answer

At a minimum, the system should support downstream AI in answering these questions:

### Company understanding

* What does the company do in plain language?
* Who does it sell to?
* How does it package and price its offer?
* What stage is the company likely at?

### Commercial understanding

* How does the company appear to go to market?
* Who likely buys?
* What pains or outcomes does the company emphasize?
* What commercial signals suggest growth, pressure, or change?

### Competitive understanding

* Who are the likely direct competitors?
* How does the company differentiate itself?
* Where does its messaging overlap with competitors?

### Narrative understanding

* What does the company claim customers value?
* What do customers appear to value in their own language?
* What is missing, obscured, or misaligned?

### Strategic understanding

* Why does the narrative gap matter?
* How might it affect pipeline, conversion, and differentiation?
* What strategic opportunities or risks emerge?

---

## In Scope for V1

V1 should include:

* input of company name and primary domain
* public-source research only
* structured evidence collection
* machine-readable dossier generation
* narrative intelligence as a dedicated section
* confidence and gap reporting
* source attribution

V1 should focus on **accuracy, structure, and repeatability**.

---

## Out of Scope for V1

The following are not part of Spec 001 for V1:

* outbound message generation
* human-facing polished reports
* CRM integration
* internal customer data ingestion
* automated enrichment from many paid data providers
* live dashboards
* autonomous decision-making
* direct recommendations written for end customers
* full workflow automation beyond dossier creation

These can be layered on later.

---

## Success Criteria

The product is successful when, for a given company, it can consistently produce a dossier that:

1. accurately describes the company in plain language
2. captures relevant GTM and competitor context
3. surfaces likely customer value signals
4. identifies plausible narrative gaps with evidence
5. distinguishes facts from inference
6. is structurally consistent enough for downstream AI use
7. clearly states confidence and missing data

---

## Failure Modes

The product fails if it:

* produces vague summaries without evidence
* hallucinates facts or competitors
* confuses company messaging with customer truth
* outputs prose that is difficult for downstream systems to parse
* mixes fact and inference without labeling
* focuses only on branding while missing strategic context
* creates inconsistent dossier structure across runs

---

## Product Positioning Statement

This product is not a generic company research tool.

It is a **company intelligence engine** designed to uncover what a business is really selling by combining:

* company research
* GTM intelligence
* competitor intelligence
* market context
* narrative gap detection

Its purpose is to turn scattered public evidence into a structured intelligence object that reveals the difference between how a company positions itself and how the market may actually value it.

---

## One-Sentence Thesis

**Input a company name and domain, collect public evidence, structure it into intelligence records, detect the gap between company messaging and customer-purchased value, and output a machine-readable dossier for downstream AI reasoning.**

---

## Open Questions

These should be resolved in later specs:

1. What exact dossier schema should be canonical?
2. What evidence types are required for minimum viable confidence?
3. How should confidence be scored?
4. What counts as an acceptable narrative gap finding?
5. How should the system handle weak or missing customer-language evidence?
6. What is the minimum useful competitor analysis for V1?
7. Which public sources are mandatory versus optional?

---
