# Strategic Hypothesis Quality Guide

## Derivation Rule

Every hypothesis must trace back to specific dossier evidence. Before writing a hypothesis, identify its source:

| Source Type | How to Derive |
|-------------|---------------|
| Narrative gap | The gap reveals a tension between company positioning and customer reality. The hypothesis predicts what happens if the gap persists or widens. |
| Value alignment divergence | A `company_only` or `divergent` alignment entry shows the company investing in messaging that customers don't echo. The hypothesis predicts the business consequence. |
| Negative signal cluster | Multiple negative signals in the same category (e.g., 3+ billing complaints) suggest a systemic issue. The hypothesis predicts whether it worsens, triggers competitive response, or forces a company reaction. |
| Strategic risk pattern | When multiple risk types (positioning + competitive, or gtm + market) point to the same vulnerability, the hypothesis synthesizes them into a testable prediction. |

If you cannot trace a hypothesis to one of these four sources, do not include it.

## Anti-Patterns (Banned Unless Company-Specific)

These generic framings are banned as standalone hypotheses. They may only appear if tied to a named company-specific mechanism and grounded in dossier evidence:

| Generic Framing | Why It Fails | When It's Acceptable |
|----------------|-------------|---------------------|
| "Competitive moat will erode" | True of every company. Provides no actionable signal. | Acceptable if you name WHICH moat, WHO is eroding it, and cite evidence (e.g., "Stripe's developer documentation advantage will narrow as Adyen's new developer portal [ev_016] matches Stripe's API design patterns [ev_012]"). |
| "PLG will hit a ceiling in enterprise" | Every PLG company faces this. It's a structural observation, not a hypothesis. | Acceptable if you cite specific evidence of enterprise deal failures, missing enterprise features, or hiring patterns that reveal the gap (e.g., "Notion's hiring of 3 solutions engineers [ev_014] signals recognition that PLG cannot close deals requiring custom SSO integration [ev_041]"). |
| "AI features may cannibalize core product" | Trendy concern applicable to any product adding AI. No company-specific mechanism. | Acceptable if you cite evidence of specific user behavior changes or product usage conflicts (e.g., "Notion's AI agent automates workspace organization [ev_038], which is the primary activity driving daily active usage [ev_010]"). |
| "Competition intensifies" | Always true. Not falsifiable. | Acceptable only if naming a specific competitive move with evidence and a predicted outcome. |
| "Bad reviews will hurt growth" | Obvious. Provides no analytical value. | Acceptable only if you identify a specific mechanism (e.g., "AI-powered procurement tools will surface Trustpilot's 1.9/5 rating [ev_024] alongside G2's 4.4/5 [ev_042], creating a negative-first impression in the 40% of enterprise procurement cycles that start with automated vendor research"). |

## Good vs Bad Examples

### Example 1: Positioning Hypothesis

**Bad:**
```json
{
  "hypothesis": "The company's competitive moat will narrow as the market matures",
  "category": "competitive",
  "falsification_criteria": "Market share remains stable",
  "time_horizon": "long-term",
  "assumptions": ["Competition increases over time"],
  "evidence_ids": ["ev_001"],
  "confidence": "medium"
}
```
Problems: Generic framing. Unfalsifiable ("market share remains stable" -- how would you check?). Unbounded time horizon. One evidence record. No counter-signals. Single obvious assumption.

**Good:**
```json
{
  "hypothesis": "Stripe's account risk management practices will attract regulatory scrutiny in the EU within 18 months, as the volume of fund-hold complaints exceeds the threshold that triggered PSD2 enforcement actions against other payment processors",
  "category": "market",
  "falsification_criteria": "No EU regulatory inquiry, enforcement action, or public complaint filing against Stripe's fund-holding practices appears in EUR-Lex, FCA register, or BaFin announcements within 18 months",
  "time_horizon": "12-18 months",
  "assumptions": [
    "EU regulators monitor Trustpilot complaint patterns for payment processors",
    "Fund-hold durations described in reviews (7+ months) exceed PSD2 safeguarding timelines",
    "Stripe has not already addressed this through internal compliance changes"
  ],
  "counter_signals": [
    "Stripe operates under e-money licenses in the EU which may already satisfy regulatory requirements",
    "Account closures may be driven by legitimate AML/KYC obligations that regulators would support"
  ],
  "evidence_ids": ["ev_019", "ev_020", "ev_021"],
  "confidence": "low"
}
```
Why it works: Names a specific mechanism (fund-hold complaint volume vs PSD2 thresholds). Falsification criteria reference specific public registers. Counter-signals are substantive. Assumptions surface non-obvious premises.

### Example 2: GTM Hypothesis

**Bad:**
```json
{
  "hypothesis": "Bottom-up PLG adoption will hit a ceiling in enterprise",
  "category": "gtm",
  "falsification_criteria": "Enterprise revenue continues to grow",
  "time_horizon": "12-24 months",
  "assumptions": ["Enterprise needs differ from SMB"],
  "evidence_ids": ["ev_012"],
  "confidence": "medium"
}
```
Problems: Generic PLG criticism. Revenue growth doesn't falsify (could grow slower). One evidence record. One obvious assumption.

**Good:**
```json
{
  "hypothesis": "HubSpot's enterprise push will stall at the ~2000-employee threshold because its data model lacks the multi-entity hierarchy that Salesforce customers above that size require for territory management and revenue attribution",
  "category": "positioning",
  "falsification_criteria": "HubSpot publicly announces 3+ customer wins at 2000+ employees with multi-entity deployments, or ships a multi-entity data model visible on their product changelog within 18 months",
  "time_horizon": "12-18 months",
  "assumptions": [
    "Multi-entity hierarchy is a hard requirement above ~2000 employees, not a preference",
    "HubSpot's current data model cannot be extended to support this without architectural changes"
  ],
  "counter_signals": [
    "Motorola Solutions case study suggests some large-enterprise traction despite data model limitations"
  ],
  "evidence_ids": ["ev_028", "ev_029", "ev_040"],
  "confidence": "medium"
}
```
Why it works: Names the specific mechanism (multi-entity data model). Defines a precise threshold (2000 employees). Falsification criteria are publicly observable (product changelog, customer announcements). Assumptions surface non-obvious architectural claim.

### Example 3: Product Hypothesis

**Bad:**
```json
{
  "hypothesis": "AI features will not become a real differentiator",
  "category": "product",
  "falsification_criteria": "AI features drive growth",
  "time_horizon": "18 months",
  "assumptions": ["AI is commoditized"],
  "evidence_ids": ["ev_019"],
  "confidence": "medium"
}
```
Problems: No company-specific mechanism. "AI is commoditized" is an industry opinion, not an evidence-backed assumption.

**Good:**
```json
{
  "hypothesis": "HubSpot's Breeze AI will remain a marketing-led initiative rather than a product differentiator because customer language consistently emphasizes 'ease of use' and 'all-in-one' as purchase drivers while zero G2 reviews mention AI capabilities as a buying factor",
  "category": "product",
  "falsification_criteria": "More than 15% of new G2 reviews in the next 12 months specifically cite Breeze AI or AI-powered features as a primary reason for choosing HubSpot",
  "time_horizon": "12 months",
  "assumptions": [
    "Current customer language patterns reflect actual purchase decision factors",
    "G2 review patterns are a reliable proxy for feature importance in buying decisions"
  ],
  "counter_signals": [
    "Aerotech case study attributes a 66% win rate improvement to AI-powered deal prioritization, suggesting real product value in specific use cases"
  ],
  "evidence_ids": ["ev_036", "ev_037", "ev_019"],
  "confidence": "medium"
}
```
Why it works: Grounds the claim in specific customer language evidence. Uses a measurable public proxy (G2 review content). Counter-signal cites a specific case study that challenges the hypothesis.
