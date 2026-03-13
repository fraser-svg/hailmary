# Customer Voice Segmentation

This reference guides evidence tagging during Step 4 (Customer Voice and Evidence). The goal is to segment customer language by signal type and speaker role so downstream reasoning can detect patterns invisible in flat evidence lists.

## Signal Tags

Apply these tags to the `tags` field on evidence records. Tags can be combined when appropriate (e.g., `["friction", "buyer_language"]`).

| Tag | Meaning | Example |
|-----|---------|---------|
| `love` | Positive enthusiasm, advocacy, delight | "This tool changed how our team works" |
| `friction` | Difficulty, frustration, workaround | "Setup took way longer than expected" |
| `buyer_language` | Language from the person who chose/purchased | "ROI was clear within the first quarter" |
| `user_language` | Language from the person who uses it daily | "The API is clean and well-documented" |
| `manager_language` | Language from someone overseeing usage | "My team adopted it without training" |

## Why Segmentation Matters

A company can be loved by developers and hated by finance. A product can delight users and frustrate buyers. These splits are gold for narrative intelligence.

Without segmentation, the dossier treats all customer evidence as one voice. With segmentation, downstream reasoning can detect:

- **Value perception gaps** — buyers value ROI, users value UX, the company markets neither
- **Adoption friction** — users love it, but managers can't justify the cost
- **Hidden differentiators** — users praise something the company never mentions in marketing
- **Churn risk patterns** — buyers are satisfied, but users are frustrated enough to push for alternatives

## How to Identify Speaker Role

Assign role tags based on contextual signals:

- **Job title mentioned** — "As a VP of Engineering..." = `manager_language`
- **Purchase context** — "We evaluated three tools and chose..." = `buyer_language`
- **Daily usage context** — "I use this every day for..." = `user_language`
- **Review site role field** — G2 and similar sites often show title and role

**Do not infer speaker role unless the context supports it.** If the speaker's role is ambiguous, use only signal tags (`love`, `friction`) without role tags. Over-tagging with guessed roles degrades intelligence quality.

## Tagging Rules

1. **Every customer evidence record should have at least one tag.** If nothing applies, the evidence may not be genuinely customer-sourced.
2. **Tags can be combined.** A frustrated buyer is `["friction", "buyer_language"]`. A delighted user is `["love", "user_language"]`.
3. **Do not force tags.** If the signal is ambiguous, use fewer tags rather than speculative ones.
4. **Negative signals from Step 4b also get segmented.** A Reddit complaint from a developer is `["friction", "user_language"]`.

## Connection to Downstream Sections

| Tag | Feeds into |
|-----|-----------|
| `love` | `narrative_intelligence.customer_expressed_value`, `hidden_differentiators` |
| `friction` | `customer_and_personas.customer_pain_themes`, `strategic_risks`, `narrative_intelligence.narrative_gaps` |
| `buyer_language` | `customer_and_personas.buyer_personas`, `gtm_model.buyer_journey_notes` |
| `user_language` | `customer_and_personas.end_user_personas`, `product_and_offer` |
| `manager_language` | `customer_and_personas.buyer_personas`, `gtm_model.sales_motion` |
