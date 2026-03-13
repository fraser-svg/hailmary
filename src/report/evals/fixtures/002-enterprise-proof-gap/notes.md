# Fixture Notes — 002: Enterprise Proof Gap

## Purpose

This fixture tests whether the reasoning pipeline can detect a **positioning-proof gap**: a company that claims enterprise identity without demonstrating enterprise adoption. Unlike fixture 001 (which tests narrative vs delivery model), this fixture tests **narrative vs observable evidence of market segment fit**.

The dossier contains a fictional company (StratusFlow) that positions itself as "the enterprise workflow automation platform for modern organizations." Available evidence — customer case studies, reviews, pricing structure, hiring patterns, and press coverage — consistently indicates the company serves small organizations (5-15 employees) with no observable enterprise deployments.

## What the Reasoning System Should Detect

### Signal extraction

The system should observe the structural gap between enterprise positioning language and SMB-scale customer evidence. Key signals include: the concentration of "enterprise" in marketing without enterprise customer proof, the pricing structure designed for small teams, hiring explicitly targeting SMB deal sizes and high-volume CS portfolios, and customers framing the product in SMB competitive terms.

### Tension detection

The system should identify structural contradictions between what the company claims (enterprise) and what evidence shows (SMB). The primary tension is between enterprise positioning and customer reality. Secondary tensions include ambition vs proof and narrative scale vs operational evidence.

### Pattern formation

The system should synthesize multiple tensions into a higher-order observation: the enterprise narrative systematically exceeds enterprise evidence across all observable dimensions — marketing, pricing, hiring, customers, and case studies. This is not one mismatch; it is a structural pattern.

### Hypothesis generation

The system should generate explanatory candidates. The primary hypothesis is that enterprise positioning is aspirational rather than descriptive. Alternative hypotheses (beachhead strategy, early adoption, enterprise features for mid-market procurement) should be acknowledged.

### Implication generation

The system should identify conditional consequences. If the positioning is aspirational, then enterprise credibility may lag, larger customers may require unproven capabilities, and the SMB base may be underserved by enterprise messaging.

## Reasoning Behaviors This Fixture Tests

### Distinguishing aspiration from evidence

The core test: can the engine tell the difference between what a company *says it is* and what the evidence *shows it is*? This is subtler than fixture 001's narrative-vs-delivery gap, because StratusFlow's product *could* serve enterprise — it simply hasn't demonstrated that it does.

### Handling absence of evidence

Several critical observations depend on noticing what is *missing*: no enterprise logos, no large-scale case studies, no enterprise sales roles. The engine must treat absence as a signal, not ignore it.

### Avoiding premature judgment

The engine must resist concluding that StratusFlow "is not an enterprise company" or "cannot serve enterprise." The evidence shows a positioning-proof gap — the absence of enterprise proof does not prove enterprise incapability.

### Maintaining observational discipline in signals

Signals should describe what is observable (customer base is small, pricing aligns with SMB) without jumping to conclusions about why. Causal explanations belong in later pipeline stages.

## Expected Failure Modes

### Conflating aspiration with deception

If the engine accuses the company of dishonesty or misleading positioning, it has failed to maintain analytical neutrality. Enterprise aspirational positioning is common and may be strategic.

### Ignoring absence signals

If the engine only processes what is present and fails to note the absence of enterprise proof (no enterprise logos, no large-scale deployments), it will miss the core observation.

### Premature enterprise verdict

If the engine concludes "StratusFlow is an SMB company" at the signal stage rather than building toward this as a hypothesis through tensions and patterns, the reasoning chain has collapsed.

### Over-indexing on enterprise features

If the engine treats SOC 2, SSO, and RBAC as proof of enterprise readiness rather than as standard SaaS features, it has confused product checkboxes with market evidence.

### Missing the customer language contrast

If the engine does not notice that customers compare StratusFlow to Zapier and Make (SMB tools) and explicitly contrast it with ServiceNow (enterprise), it has missed a critical signal about perceived market position.

## What Counts as Success

A successful run through this fixture means:

1. Signals observe the positioning-proof gap without concluding it. Enterprise narrative strength and SMB customer concentration are both extracted.
2. Tensions identify structural contradictions between positioning and evidence across multiple dimensions (customers, pricing, hiring).
3. Patterns synthesize tensions into a coherent observation: enterprise aspiration systematically exceeds enterprise proof.
4. Hypotheses explain the pattern without certainty. Aspirational positioning is the primary hypothesis, with beachhead strategy and early adoption as legitimate alternatives.
5. Implications remain conditional. Enterprise credibility risk, capability gaps for larger customers, and SMB messaging mismatch are identified as consequences, not predictions.
6. Full lineage is preserved: every implication traces back through hypotheses, patterns, tensions, and signals to evidence and sources.

## Fixture Design Choices

### Evidence density

The dossier includes 11 evidence records across 8 sources — enough to establish a clear pattern but sparse enough to test whether the engine can work with limited data.

### Source diversity

Evidence spans Tier 1 (company website, pricing, case studies, job postings), Tier 2 (press), and Tier 3 (G2, Trustpilot reviews). The mix tests whether the engine weighs customer voice evidence appropriately against company claims.

### Intentional gaps

Competitors and market_and_macro sections are deliberately sparse. The engine should not fabricate enterprise capability assessments from insufficient evidence.

### Distinct failure mode from fixture 001

Fixture 001 tests narrative vs delivery model (AI positioning over service delivery). Fixture 002 tests narrative vs market segment evidence (enterprise positioning over SMB reality). The structural form is different: fixture 001 is about *how* value is delivered; fixture 002 is about *who* the customers are.

### No enterprise counter-evidence

The dossier deliberately includes no enterprise signals at all — no large customer reference, no enterprise deal size, no enterprise sales role. This is a clean test: if the engine fails to detect the gap, the fixture design is not ambiguous.
