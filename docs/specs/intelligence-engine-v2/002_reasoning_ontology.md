# SPEC 002 — Reasoning Ontology

The ontology defines the concepts the system reasons about. Every reasoning object must map
back to evidence IDs. If it cannot, it should not be produced.

This is a commercial reasoning ontology. It is not a product taxonomy or a market research
framework. It exists to answer one question: **why is this company not growing the way it
should be?**

---

## Primary Lens

The system diagnoses **distribution architecture failures**, not product failures.

The assumption: most founders building B2B companies between £500k–£10m ARR have built
something that works. The constraint is rarely the product. It is how the company reaches,
sells to, and retains buyers.

---

## Core Entities

### Company
The entity being analysed. Defined by `company_name` and `domain`. All reasoning is
scoped to this entity. The system never compares companies in v1.

### Product
What the company sells. May be software, services, or a hybrid. The system is specifically
interested in whether the product is sold the way it is experienced — that mismatch is often
the root cause of distribution failure.

### User
The person who uses the product day-to-day. May or may not be the buyer. Identified from
case studies, job titles in testimonials, integration patterns, and usage language.

### EconomicBuyer
The person or committee who authorises spend. May be the same as the User (SMB) or different
(enterprise). Identified from pricing page language, contract complexity signals, and approval
workflow mentions.

### SalesMotion
How the company currently reaches and closes buyers. Not how they say they do — how the
evidence shows they do. Classified as: `founder_led`, `sales_led`, `plg`, `community_led`,
or `hybrid`.

### DistributionChannel
The specific mechanism through which demand currently flows. Examples: founder LinkedIn content,
podcast appearances, word-of-mouth, outbound SDR sequence, product self-signup, partnership
referral, paid search. The system is interested in channel concentration and fragility.

### FounderRole
The degree to which the founder is personally the distribution mechanism. High founder
dependency means the company's growth is structurally contingent on the founder's personal
brand, relationships, or presence in sales. This is a risk condition, not a compliment.

### ServiceLayer
The hidden delivery work required to make the product work for customers. High service dependency
means the product is not as scalable as its pricing or narrative implies. Indicators: onboarding
complexity, implementation requirements, CSM-heavy retention, custom work in deals.

### NarrativeFrame
The story the company uses publicly to describe itself and its value. May be accurate or
distorted. The system is specifically interested in mismatches between the narrative and the
actual sales motion — e.g., claiming product-led growth when distribution is founder-dependent.

### ProofAsset
Evidence the company uses to support buyer decisions. Case studies, testimonials, logos,
published metrics. The system assesses whether proof assets are calibrated to the actual
buyer (not the user), and whether they support the narrative claim.

### Constraint
A structural condition that limits growth. The system identifies constraints that are
distribution-architecture related, not product-architecture related.

### Diagnosis
The single primary commercial finding. One per report. Chosen from six archetypes (see SPEC 004).
Must be supported by patterns, which are supported by tensions, which are supported by evidence.

### Mechanism
A structural force that explains why the diagnosis exists. 2–3 per diagnosis. Mechanisms are
causal — they explain the persistence of the condition, not just its presence.

### InterventionOpportunity
The single most agency-deliverable lever. Tied to the diagnosis. Must be a change the sending
agency could credibly deliver or facilitate.

---

## Core Relationships

| Relationship | From | To | Meaning |
|---|---|---|---|
| `product_is_experienced_by` | Product | User | Who uses it |
| `product_is_bought_by` | Product | EconomicBuyer | Who pays |
| `growth_depends_on` | Company | DistributionChannel | Current demand source |
| `distribution_depends_on` | DistributionChannel | FounderRole | Fragility test |
| `delivery_requires` | Product | ServiceLayer | Hidden delivery cost |
| `narrative_supports` | NarrativeFrame | SalesMotion | Aligned claim |
| `narrative_distorts` | NarrativeFrame | BuyingMotion | Misaligned claim (key tension source) |
| `diagnosis_is_explained_by` | Diagnosis | Mechanism | Causal chain |
| `mechanism_implies` | Mechanism | InterventionOpportunity | Intervention logic |

---

## Representability Test

The ontology must be able to cleanly represent the six diagnosis archetypes:

1. **founder_led_sales_ceiling** — FounderRole.sales_dependency = true, DistributionChannel
   fragility_score high, no evidence of independent channel infrastructure.

2. **services_disguised_as_saas** — ServiceLayer.hidden_services_risk high, NarrativeFrame
   claims software scale, Product requires custom delivery. Pricing/narrative distorts buying motion.

3. **developer_adoption_without_buyer_motion** — User is technical/developer, EconomicBuyer
   is executive. SalesMotion has no executive engagement signals. ProofAssets written for users,
   not buyers.

4. **enterprise_theatre** — NarrativeFrame uses enterprise language, ProofAssets include
   logos/enterprises, but DistributionChannel is still founder-led and deal structure is SMB.

5. **distribution_fragility** — DistributionChannel concentrated in single mechanism, no
   evidence of channel diversification, FounderRole.demand_dependency = true.

6. **narrative_distribution_mismatch** — NarrativeFrame claims one motion (PLG, community,
   enterprise), DistributionChannel evidence shows a different motion. Narrative and distribution
   are structurally inconsistent.

If the ontology cannot represent any of these six cleanly, it is wrong.

---

## Implementation Rules

1. Every reasoning object must include `evidence_refs: string[]` linking to dossier evidence IDs.
2. Derived fields (not directly evidenced) must be marked `is_inferred: true`.
3. When evidence is absent or weak, use `confidence: "low"` — never fabricate certainty.
4. The ontology is implemented in TypeScript interfaces (see SPEC 004).
5. No reasoning object is created by LLM inference — all are produced by deterministic rules
   (see SPEC 005) from dossier evidence. The LLM only renders approved objects into prose.
