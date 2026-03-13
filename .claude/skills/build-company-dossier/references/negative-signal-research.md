# Negative Signal Research

This reference guides Step 4b of the research workflow. The goal is to deliberately surface complaints, friction, and churn signals that balance the naturally positive bias of company-controlled sources.

**Core principle: absence of negative evidence is acceptable. Failure to search is not.**

## Research Targets

### Billing and Pricing Complaints
- Unexpected charges, pricing opacity, plan downgrades blocked
- "Too expensive for what you get" patterns
- Hidden costs surfaced post-purchase

### Support and Reliability Friction
- Slow support response, unresolved tickets, downtime complaints
- "Works great until something breaks" patterns
- Documentation gaps causing user frustration

### Migration and Switching Pain
- Difficulty exporting data, vendor lock-in complaints
- "Switching from <company>" search patterns reveal why people leave
- Onboarding friction for new customers

### Trust and Transparency Concerns
- Privacy practices, data handling, security incidents
- Broken promises or feature removals
- Pricing changes without notice

### Churn Signals
- "Cancelled my subscription" language
- "Moved to <competitor>" patterns
- "Used to love but now..." sentiment shifts

## Suggested Search Queries

Pick 1-2 targeted searches unless evidence is thin:

- `"<company_name>" complaints OR frustrations OR problems`
- `"<company_name>" site:reddit.com OR site:trustpilot.com`
- `"<company_name>" cancellation OR churn OR "switched to"`
- `"<company_name>" billing issues OR pricing complaints`
- `"<company_name>" downtime OR outage OR reliability`

If initial searches return nothing, that is a valid finding. Note "No significant negative signals found in public sources" in `missing_data` and move on. Do not force negative evidence into existence.

## Evidence Typing

Use these evidence types for negative signals:

| Finding | Evidence Type | Tags |
|---------|--------------|------|
| Review site complaint | `review_record` | `["negative"]` or `["negative", "friction"]` |
| Specific pain point | `pain_point_record` | `["negative", "friction"]` |
| Customer language about frustration | `customer_language_record` | `["friction"]` |
| Churn or switching signal | `customer_language_record` | `["negative", "churn"]` |
| Trust/reliability concern | `review_record` | `["negative", "trust"]` |

## Tag Definitions

- `negative` — the evidence describes a problem, complaint, or dissatisfaction
- `friction` — the evidence describes difficulty using or working with the product/company
- `churn` — the evidence describes leaving, cancelling, or switching away
- `trust` — the evidence describes concerns about reliability, transparency, or data handling

Tags describe the signal, not the severity. A mild complaint is still `["negative"]`.

## How Negative Signals Feed Intelligence

Negative evidence is critical input to:

- **narrative_intelligence.narrative_gaps** — company claims "enterprise reliability" but customers report outages
- **customer_and_personas.customer_pain_themes** — real pain vs marketed pain
- **strategic_risks.positioning_risks** — claims that evidence contradicts
- **confidence_and_gaps** — negative signals may lower confidence in company claims

Without negative signal research, the dossier over-indexes on company-controlled narratives and produces artificially optimistic intelligence.
