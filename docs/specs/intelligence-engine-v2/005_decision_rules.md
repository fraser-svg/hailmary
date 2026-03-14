# SPEC 005 — Decision Rules

Deterministic rules for every stage output. These rules live in the spec before the code.
If a rule is not here, it is not allowed in the implementation.

No LLM may apply these rules. Only TypeScript.

---

## GTM Analysis Rules

### Rule: Sales Motion Classification

**Mode: founder_led**

ALL of the following must be true:
- At least one signal with category `founder_content` or `founder_led_sales` exists
- No signals indicate a sales team of more than 2 people
- Product signals suggest demo/explanation required (e.g., custom pricing, discovery call, request-a-demo CTA)

**Mode: plg**

ALL of the following must be true:
- Product signup signals exist (self-serve, freemium, free trial)
- No signals suggest mandatory sales calls for initial adoption
- Pricing page shows transparent, self-selectable tiers

**Mode: sales_led**

ALL of the following must be true:
- Signals indicate a defined sales team (AE, SDR, VP Sales, etc.)
- No evidence of self-serve product adoption
- Deal complexity signals present (enterprise procurement, contract negotiation, etc.)

**Mode: community_led**

ALL of the following must be true:
- Signals of community infrastructure (Discord, Slack, forum, open-source contributions)
- Product adoption is mediated by community participation
- No dominant founder content demand signal

**Mode: hybrid**

Default when:
- Signals match more than one mode at roughly equal weight
- OR signal evidence is insufficient to classify with confidence

**Confidence:**
- `"high"` when 3+ strong signals align to a single mode
- `"medium"` when 2 signals align or signals are mixed with one dominant
- `"low"` when fewer than 2 signals or strong contradictions exist

---

### Rule: Buyer Structure — User/Buyer Mismatch

`user_buyer_mismatch = true` when ALL:
1. User-side signals (testimonials, case studies, usage language) reference technical roles
   (developer, engineer, ops, analyst, etc.)
2. Buyer-side signals (pricing, sales copy, enterprise language) reference business/exec roles
   (CEO, COO, CFO, VP, Director, etc.)
3. No evidence of a champion path bridging the two

`user_buyer_mismatch = false` when:
- Both user and buyer appear to be the same role (SMB founder buys and uses), OR
- Evidence explicitly describes a champion path or expansion motion

---

### Rule: Distribution Fragility Scoring

`fragility_score` is a float in [0.0, 1.0] computed as:

```
score = 0.0
```

Add to score:
- `+0.4` if primary channel is `founder_content` (single person = fragility)
- `+0.2` if no secondary channels are identified
- `+0.2` if `founder_dependency.demand_dependency = true`
- `+0.1` if no evidence of any repeatable channel mechanism (no email sequences, no paid, no SEO)
- `+0.1` if all visible demand signals are from the last 12 months only

Subtract from score:
- `-0.2` if evidence of established partnership or reseller channels
- `-0.1` if strong SEO signal exists (organic demand independent of founder)

`fragility_score = min(1.0, max(0.0, score))`

**Confidence:**
- `"high"` when 4+ distribution signals exist (in any direction)
- `"medium"` when 2–3 signals
- `"low"` when fewer than 2 distribution signals

---

### Rule: Founder Dependency Scoring

**`narrative_dependency = true`** when:
- Founder name appears in 3+ company-controlled content signals
- OR founder is explicitly listed as thought leader, author of content, etc.

**`demand_dependency = true`** when:
- Founder LinkedIn/Twitter/content is a primary inbound signal
- OR founder speaking events are primary demand generation evidence

**`sales_dependency = true`** when:
- Founder appears in case studies as the relationship owner
- OR founder content explicitly discusses their sales involvement
- OR company size signals suggest no dedicated sales function

**`risk_score` computation:**
```
score = 0.0
if narrative_dependency: score += 0.3
if demand_dependency:   score += 0.4
if sales_dependency:    score += 0.3
```

---

### Rule: Service Dependency Assessment

**`onboarding_complexity = "high"`** when ANY:
- Signals mention implementation, onboarding call, setup assistance, migration
- Time-to-value signals suggest weeks/months (not minutes/hours)
- "White glove", "concierge", "dedicated" onboarding language present

**`onboarding_complexity = "medium"`** when:
- Onboarding exists but appears configurable rather than custom
- Integration required but standard connectors available

**`onboarding_complexity = "low"`** when:
- Self-serve setup signals present
- Trial/freemium suggests immediate value

**`implementation_required = true`** when:
- API/SDK integration signals without UI-only alternative
- OR enterprise signals mention "implementation" as a phase

**`hidden_services_risk` computation:**
```
score = 0.0
if onboarding_complexity === "high":    score += 0.4
if onboarding_complexity === "medium":  score += 0.2
if implementation_required:             score += 0.3
if product marketed as SaaS but delivery evidence suggests custom work: score += 0.3
hidden_services_risk = min(1.0, score)
```

---

### Rule: Services Disguised as SaaS Detection

Emit tension `software_claim_vs_delivery_reality` when ALL:
1. Company narrative claims SaaS scale (self-serve, scalable, automated)
2. `service_dependency.onboarding_complexity` is `"medium"` or `"high"`
3. `service_dependency.hidden_services_risk >= 0.4`

Increase `hidden_services_risk` by an additional `+0.1` when the primary channel is
`founder_content` (founder selling complex product personally compounds service risk).

---

### Rule: Pricing/Delivery Fit Tension

`delivery_fit_tension = true` when ANY:
- `pricing_model = "seat"` AND `onboarding_complexity = "high"` (seat pricing implies scale,
  high onboarding complexity implies custom — contradiction)
- `pricing_model = "usage"` AND `implementation_required = true` (usage pricing implies
  self-serve, implementation requirement implies service overhead)
- `roi_clarity = "low"` AND `pricing_model` is not `"custom"` (price without clear ROI
  signal means buyer cannot justify internally)

---

## Adapter Rules: Archetype Classification

The adapter maps report pattern types to v2 archetypes using weighted tension analysis.

### Archetype Scoring Table

For each v2 tension in the company's tension list, add the following to each archetype's score:

| Tension Type | Archetype Boosted | Score Added |
|---|---|---|
| `enterprise_narrative_vs_founder_distribution` | `founder_led_sales_ceiling` | +3 |
| `enterprise_narrative_vs_founder_distribution` | `enterprise_theatre` | +2 |
| `software_claim_vs_delivery_reality` | `services_disguised_as_saas` | +3 |
| `product_led_claim_vs_service_onboarding` | `services_disguised_as_saas` | +2 |
| `growth_ambition_vs_distribution_fragility` | `distribution_fragility` | +3 |
| `growth_ambition_vs_distribution_fragility` | `founder_led_sales_ceiling` | +1 |
| `narrative_vs_distribution` | `narrative_distribution_mismatch` | +3 |
| `pricing_model_vs_delivery_reality` | `services_disguised_as_saas` | +1 |

### GTM Signal Boosts (applied after tension scoring)

| GTM Condition | Archetype Boosted | Score Added |
|---|---|---|
| `sales_motion.mode === "founder_led"` | `founder_led_sales_ceiling` | +2 |
| `founder_dependency.risk_score >= 0.6` | `founder_led_sales_ceiling` | +2 |
| `distribution_architecture.fragility_score >= 0.7` | `distribution_fragility` | +2 |
| `service_dependency.hidden_services_risk >= 0.5` | `services_disguised_as_saas` | +2 |
| `buyer_structure.user_buyer_mismatch === true` | `developer_adoption_without_buyer_motion` | +2 |
| `pricing_delivery_fit.delivery_fit_tension === true` | `services_disguised_as_saas` | +1 |

### Confidence Assignment from Archetype Score

| Score | Strength |
|---|---|
| ≥ 6 | `"high"` |
| 3–5 | `"medium"` |
| 1–2 | `"low"` |
| 0 | Archetype is not generated as a pattern |

---

## Diagnosis Selection Rules

### Candidate Generation

A candidate is generated for each archetype that has at least one V2 pattern with `strength`
≥ `"low"`. Archetypes with no patterns are not candidates.

### Winner Selection

1. Score each candidate by: `sum of (pattern.strength as numeric: low=1, medium=2, high=3)`
2. Apply tiebreakers:
   - Higher maximum individual pattern strength wins
   - If still tied: `founder_led_sales_ceiling` > `distribution_fragility` > others
     (these are more actionable for the agency)
3. The candidate with the highest score is the winner.

### Confidence on Diagnosis

| Scoring Margin (winner - second place) | Confidence |
|---|---|
| ≥ 4 | `"high"` |
| 2–3 | `"medium"` |
| 0–1 | `"low"` |

When there is only one candidate (no competing patterns), confidence is `"medium"` by default.

---

## Mechanism Generation Rules

### Template Selection

Each diagnosis type has exactly 3 pre-defined mechanism templates in `mechanism-map.ts`.
Templates are ordered by plausibility: [0] = highest, [2] = lowest.

### Mechanism Count Rules

- Default output: all 3 mechanisms.
- Drop mechanism[2] (lowest plausibility) when: `total evidence pool < 2 refs`.
- Never produce fewer than 2 mechanisms.
- Never produce more than 3 mechanisms.

### Evidence Distribution

All mechanisms within a diagnosis draw from the same evidence pool:
```
pool = union(
  diagnosis.evidence_refs,
  supporting_patterns[].evidence_refs,
  supporting_tensions[].evidence_refs
)
```

---

## Intervention Selection Rules

One intervention template per diagnosis type, defined in `intervention-map.ts`.

### Template Matching

`intervention.type` is determined solely by `diagnosis.type`:

| Diagnosis Type | Intervention Type |
|---|---|
| `founder_led_sales_ceiling` | `founder_gtm_transition` |
| `services_disguised_as_saas` | `positioning_reset` |
| `developer_adoption_without_buyer_motion` | `sales_motion_redesign` |
| `enterprise_theatre` | `icp_redefinition` |
| `distribution_fragility` | `distribution_strategy_reset` |
| `narrative_distribution_mismatch` | `positioning_reset` |

### Evidence on Intervention

```
intervention.evidence_refs = union(
  diagnosis.evidence_refs,
  mechanisms[].evidence_refs
)
```

---

## Report Budget Rules

The report validation enforces the following hard limits:

| Check | Limit | Rationale |
|---|---|---|
| Total words | ≤ 900 | ≤3 pages at business letter format (300 words/page) |
| Words per section | ≤ 350 | Leaves room for headers, whitespace, letterhead |
| Sections | exactly 3 | The Diagnosis, Why This Happens, The Opportunity |
| Em dashes | 0 | Physical mail requires clean typesetting |
| Banned phrases | 0 | Zero tolerance for consulting clichés |

These are **hard errors**, not warnings. A report exceeding these limits is null in the
`WriteReportResult`. The pipeline runner must not deliver a null report — it must log the error
and mark the company as failed.
