# SPEC 005 — Decision Rules

This is what stops the system becoming vague.

You need deterministic rules for stage outputs.

---

## Example Decision Rules

### Rule: Founder-Led Sales

**If:**

- founder content is the dominant public demand signal
- there are weak/nonexistent sales team signals
- product requires explanation/demo

**Then:**

- classify `sales_motion.mode = founder_led`

---

### Rule: Services Disguised as SaaS

**If:**

- onboarding complexity is medium/high
- implementation/integration appears necessary
- product is marketed as software scale

**Then:**

- increase `hidden_services_risk`
- emit tension: `software_claim_vs_delivery_reality`

---

### Rule: User/Buyer Mismatch

**If:**

- evidence points to product being used by technical operators
- pricing/proof language speaks to executives or enterprise buyers

**Then:**

- set `user_buyer_mismatch = true`

---

### Rule: Distribution Fragility

**If:**

- majority of visible demand signals are founder-mediated
- there is limited evidence of repeatable channel infrastructure

**Then:**

- `fragility_score > 0.7`

---

## Design Principle

These rules should live in the spec before the code.
