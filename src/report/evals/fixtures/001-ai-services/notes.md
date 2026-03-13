# Fixture Notes — 001: AI Services

## Purpose

This fixture tests whether the reasoning pipeline can detect the most common and strategically important pattern in AI-era companies: **an automation narrative that masks a service-dependent delivery model**.

The dossier contains a fictional company (AutoFlow AI) that markets itself as a fully autonomous AI sales automation platform. Available evidence — customer reviews, hiring patterns, case studies, pricing structure, and employee feedback — consistently reveals that human services are a critical component of value delivery.

## What the Reasoning System Should Detect

### Signal extraction

The system should extract analytical observations — not restatements — from the dossier. Key signals include the gap between automation messaging and customer-described experience, the disproportionate hiring of implementation roles, and the pricing structure that monetizes onboarding as a separate service.

### Tension detection

The system should identify structural contradictions between signals. The primary tension is between the company's automation narrative and the service-heavy reality of its delivery model. Secondary tensions include the mismatch between CEO's stated investment priorities and actual hiring patterns, and between scalability claims and linear service dependency.

### Pattern formation

The system should synthesize multiple tensions into higher-order structural patterns. The core pattern is that service-assisted delivery exists beneath the automation narrative — visible across marketing, pricing, hiring, case studies, and employee feedback.

### Hypothesis generation

The system should generate candidate explanations for the observed patterns. The primary hypothesis is that the automation narrative compensates for immature product capabilities, and that human onboarding is structurally required because the product cannot yet deliver autonomous value.

### Implication generation

The system should identify conditional consequences. If the hypotheses are true, then scaling revenue requires scaling service capacity, the company's operational leverage is overstated, and positioning risk increases with customer base growth.

## Failure Modes This Fixture Tests

### Signal restatement

If the system produces signals that merely paraphrase dossier claims ("The company offers AI sales automation"), it has failed the signal extraction stage. Signals must be analytical observations, not fact summaries.

### Premature conclusion

If the system jumps to "AutoFlow is a services company" at the signal or tension stage, it has collapsed the reasoning pipeline. Conclusions belong in the hypothesis stage at earliest.

### Missing cross-domain synthesis

If the system detects the automation-vs-service tension but fails to connect it to pricing, hiring, and internal culture evidence, it has performed shallow analysis. The fixture is designed with converging evidence across multiple domains.

### False confidence

If the system assigns high confidence to hypotheses without acknowledging alternative explanations (e.g., services-led GTM could be intentional), it has failed the stress-test stage's purpose.

### Unconditional implications

If the system states "AutoFlow will fail to scale" rather than "If the service dependency is structural, scaling may require proportional services hiring," it has violated the conditional requirement of the implication stage.

## What Counts as Success

A successful run through this fixture means:

1. Signals are analytical, not restatements. They highlight the gap between narrative and evidence.
2. Tensions identify structural contradictions across domains, not just one isolated mismatch.
3. Patterns synthesize multiple tensions into a coherent structural observation.
4. Hypotheses explain patterns without claiming certainty. Alternative explanations are acknowledged.
5. Implications remain conditional and avoid prescriptions, predictions, or moral judgments.
6. Full lineage is preserved: every implication traces back through hypotheses, patterns, tensions, and signals to evidence and sources.

## Fixture Design Choices

### Evidence density

The dossier includes 10 evidence records — enough to support multiple converging signals but sparse enough to test whether the system can work with limited data.

### Source diversity

Evidence comes from 8 sources across tiers 1-3: company website (Tier 1), job postings (Tier 1), case study (Tier 1), press coverage (Tier 2), review platforms (Tier 3), and employer reviews (Tier 3). No Tier 4 or 5 sources — this fixture tests clean signal detection, not noisy source handling.

### Intentional gaps

Some dossier sections (competitors, market_and_macro) are deliberately sparse. The system should not fabricate analysis for sections with insufficient evidence. Acknowledging gaps is part of a successful run.

### Single dominant pattern

This fixture has one primary pattern (automation narrative over service delivery). More complex fixtures will test multi-pattern detection. This first fixture validates basic reasoning chain integrity.
