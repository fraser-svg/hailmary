# SPEC 002 — Reasoning Ontology

This is the most important spec.

Your existing ontology is too section-shaped.
You now need a commercial reasoning ontology.

---

## Core Entities

- Company
- Product
- User
- EconomicBuyer
- SalesMotion
- DistributionChannel
- FounderRole
- ServiceLayer
- NarrativeFrame
- ProofAsset
- Constraint
- Diagnosis
- Mechanism
- InterventionOpportunity

---

## Core Relationships

- `product_is_experienced_by` → User
- `product_is_bought_by` → EconomicBuyer
- `growth_depends_on` → DistributionChannel
- `distribution_depends_on` → FounderRole
- `delivery_requires` → ServiceLayer
- `narrative_supports` → SalesMotion
- `narrative_distorts` → BuyingMotion
- `diagnosis_is_explained_by` → Mechanism
- `mechanism_implies` → InterventionOpportunity

---

## Design Rule

Every new reasoning object must map back to evidence IDs.

---

## Acceptance Criteria

You can represent:

- founder-led sales bottleneck
- services disguised as SaaS
- user/buyer mismatch
- narrative as investor signalling
- distribution fragility

If the ontology cannot represent those cleanly, it is wrong.
