# Spec 005 — Memo Spec

## Purpose

Define the three-stage memo generation process: MemoBrief construction, MemoWriter (LLM), and MemoCritic (adversarial LLM). This is the primary value-delivery spec in V3. Everything upstream exists to make what is described here possible.

---

## Scope

Three sequential sub-stages:

1. **V3-M3 buildMemoBrief** — deterministic; produces a fully-constraining brief from V2 outputs + EvidencePack + AdjudicationResult
2. **V3-M4 writeMemo** — LLM; produces the memo from the brief
3. **V3-M5 criticiseMemo** — adversarial LLM; evaluates the memo on 4 dimensions + 2 explicit tests; may trigger a revision loop (max 2 attempts)

---

## Sub-Stage A: buildMemoBrief

### Purpose

Produce a `MemoBrief` that fully constrains the memo writer. The writer must not invent facts, choose a different framing, or select evidence outside the brief. The brief is a contract between the deterministic pipeline and the LLM writer.

### Inputs

```typescript
interface BuildMemoBriefInput {
  adjudication: AdjudicationResult;
  diagnosis: Diagnosis;
  mechanisms: Mechanism[];
  intervention: InterventionOpportunity;
  evidencePack: EvidencePack;
  founderContext?: FounderContext;
}
```

### Output

```typescript
interface MemoBrief {
  brief_id: string;                      // "brief_<company_id>_<timestamp>"
  company_id: string;
  created_at: string;

  // Reader context
  target_company: string;
  founder_name?: string;                 // From founderContext if provided
  founder_title?: string;               // e.g. "CEO"

  // Epistemic framing — from adjudication
  adjudication_mode: AdjudicationMode;
  memo_framing: MemoFraming;            // "assertive" | "indicative" | "hypothesis"

  // Argument structure
  hook: MemoHook;                       // The opening observation
  thesis: string;                       // Single sentence — derived from diagnosis.statement
  evidence_spine: EvidenceSpineRecord[]; // 3–5 records from EvidencePack
  intervention_framing: string;          // How to position the intervention

  // Constraints
  tone_constraints: ToneConstraints;
  banned_phrases: string[];             // See banned phrase list below
  confidence_caveats: string[];         // From adjudication — must not assert these as fact

  // Output spec
  cta: string;                          // One clear ask — drafted by brief builder, not LLM
  word_budget: WordBudget;
  required_sections: MemoSectionName[]; // ["observation", "what_this_means", "why_this_is_happening", "what_we_would_change", "cta"]
}
```

### Hook Selection

The `hook` is the single most important element of the brief. It must earn the founder's attention in the first two sentences.

```typescript
interface MemoHook {
  evidence_id: string;          // From evidencePack.hook_candidates
  excerpt: string;              // Exact excerpt from the evidence record (verbatim)
  hook_type: HookType;
  framing_instruction: string;  // How the writer should use this in the opening
}

type HookType =
  | "customer_quote"       // A verbatim customer phrase
  | "pricing_signal"       // A specific pricing or packaging observation
  | "product_gap"          // A gap between what product claims and what it delivers
  | "competitive_signal"   // A specific competitor comparison signal
  | "founder_statement"    // A founder's own words creating tension with reality
  | "metric_observation";  // A funding, hiring, or growth metric with commercial implication
```

Selection rule: choose the hook candidate with `total_score` highest among `hook_candidates` from EvidencePack. If founder_name is provided and a `founder_statement` hook candidate exists with score ≥ 6, prefer it.

### Evidence Spine

```typescript
interface EvidenceSpineRecord {
  evidence_id: string;           // From EvidencePack
  excerpt: string;               // Verbatim excerpt
  memo_role: MemoRole;           // Primary role this record plays in the spine
  usage_instruction: string;     // Which memo section to use this in, and how
}
```

Selection rules:
- Must include ≥ 1 record with `diagnosis_support` role
- Must include ≥ 1 record with `counter_narrative` role (if available)
- Must include ≥ 1 record with `specificity_anchor` role
- All 3–5 records must have `total_score ≥ 5`
- No record with `is_inferred: true` may appear in the spine without a `confidence_caveats` note

### Intervention Framing

Derived from `intervention.type`. Framed as value delivery, not a product pitch.

| InterventionType | Framing instruction |
|------------------|---------------------|
| `positioning_reset` | "Frame as: we would help you clarify what you're actually selling, to whom, and why that earns the deal" |
| `icp_redefinition` | "Frame as: we would help you identify the buyer profile where you actually win, and retool outreach around it" |
| `sales_motion_redesign` | "Frame as: we would help you build a pipeline motion that works without founder involvement" |
| `founder_gtm_transition` | "Frame as: we would help you build the institutional credibility to close without you in the room" |
| `distribution_strategy_reset` | "Frame as: we would help you find a distribution path that doesn't depend on one channel or relationship" |
| `proof_architecture_design` | "Frame as: we would help you build the proof assets that let buyers say yes without needing to talk to you" |

### Tone Constraints

```typescript
interface ToneConstraints {
  register: "direct";                  // Always direct — not academic, not consulting
  perspective: "commercial_advisor";   // We understand your commercial reality
  avoid: [
    "generic_advice",       // Don't give advice that applies to any company
    "jargon",               // No "leverage", "synergies", "ecosystem", "value proposition"
    "hedging_language",     // Unless adjudication_mode = "exploratory" — then hedge appropriately
    "feature_selling",      // This memo is not a pitch deck
    "unsolicited_praise",   // Don't open with compliments about the company
  ];
}
```

### Banned Phrases (inherits V2 list + V3 additions)

V2 banned phrases (45 items) plus:
- "I wanted to reach out"
- "just wanted to"
- "hope this finds you well"
- "excited to share"
- "game-changing"
- "thought leader"
- "world-class"
- "best-in-class"
- "cutting-edge"
- "paradigm shift"
- "move the needle"
- "low-hanging fruit"
- "circle back"
- "reach out"
- "at the end of the day"

### Word Budget

```typescript
interface WordBudget {
  target_min: 500;
  target_max: 700;
  hard_max: 850;
}
```

---

## Sub-Stage B: writeMemo (LLM)

### Purpose

Generate the founder-facing strategic memo. The LLM is a writer, not a reasoner. All reasoning has been done upstream; the LLM renders it into specific, commercially grounded prose.

### LLM Contract

- **Model:** `claude-haiku-4-5-20251001`
- **Max tokens:** 1500
- **Temperature:** 0.3 (low — we want precision, not creativity)
- **System prompt:** Constrains the LLM to the brief contract (no invention, no reasoning, exact section structure)

### Memo Structure (5 sections, fixed order)

```typescript
type MemoSectionName =
  | "observation"
  | "what_this_means"
  | "why_this_is_happening"
  | "what_we_would_change"
  | "cta";
```

**Section 1 — Observation** (1–2 paragraphs)

The specific commercial signal that earns the founder's attention. Must:
- Open with the hook excerpt from the brief (paraphrased or direct quote — not invented)
- Make one specific, named observation about this company
- Not introduce the company to itself — assume the founder knows their business
- Not open with a compliment or a question

**Section 2 — What this means** (1 paragraph)

The structural diagnosis and why it matters commercially. Must:
- Use `memo_framing` to determine assertiveness (assertive / indicative / hypothesis)
- Name the structural consequence (what is this costing them — growth ceiling, margin compression, deal fragility, etc.)
- Not use the word "diagnosis" or any meta-analytical language
- Contain exactly one commercial consequence statement

**Section 3 — Why this is happening** (1–2 paragraphs)

The causal mechanisms behind the diagnosis. Must:
- Draw from `evidence_spine` records with `mechanism_illustration` role
- Name 2 forces — not 1, not 3
- Each force must be traceable to a named evidence record (not referenced explicitly in the memo text, but the writer must only use facts from the spine)
- No management theory; only observable, specific explanations

**Section 4 — What we would change** (1 paragraph)

The intervention, framed as value delivery. Must:
- Use the `intervention_framing` instruction from the brief
- Describe one concrete change — not a menu of options
- Not name a product, service tier, or price
- End with a statement of the commercial outcome that would result

**Section 5 — CTA** (1–2 sentences)

One clear ask. Must:
- Use the `cta` from the brief verbatim (or paraphrase without changing the ask)
- Contain exactly one action for the founder to take
- Not be a question
- Not be more than 2 sentences

### MarkdownMemo

```typescript
interface MarkdownMemo {
  memo_id: string;                   // "memo_<company_id>_<timestamp>"
  company_id: string;
  brief_id: string;
  adjudication_mode: AdjudicationMode;
  diagnosis_id: string;
  intervention_id: string;
  evidence_ids: string[];            // All evidence records referenced in the brief's evidence_spine
  word_count: number;
  attempt_number: number;            // 1 or 2 (revision attempts)
  sections: MemoSection[];
  markdown: string;                  // Full assembled memo as markdown string
  generated_at: string;
}

interface MemoSection {
  name: MemoSectionName;
  markdown: string;
  word_count: number;
}
```

---

## Sub-Stage C: criticiseMemo (Adversarial LLM)

### Purpose

Evaluate the generated memo against quality standards before it proceeds to the send gate. The critic is explicitly adversarial — its default posture is to find problems.

### LLM Contract

- **Model:** `claude-haiku-4-5-20251001`
- **Max tokens:** 800
- **Temperature:** 0.1 (nearly deterministic)
- **System prompt:** "You are a rigorous commercial writing critic. Your job is to find weaknesses. Default to finding problems. Only pass a dimension if you are confident it meets the standard."

### Evaluation: 4 Scoring Dimensions + 2 Named Tests

#### Dimension 1 — Evidence Grounding (0–5)
Does every factual claim in the memo trace to a real observation? No invented statistics, no generalised claims presented as company-specific facts.

Scoring guide:
- 5: Every factual claim is directly traceable to the evidence spine; no invented content
- 4: One minor claim that generalises slightly beyond the evidence
- 3: One moderate unsupported claim or generalisation
- 2: Two unsupported claims, or one significant invention
- 1: Multiple unsupported claims
- 0: Evidence is largely invented or conflated with generic patterns

Pass threshold: ≥ 3

#### Dimension 2 — Commercial Sharpness (0–5)
Does this read like commercial intelligence written about a specific company, or generic GTM advice?

Scoring guide:
- 5: Every paragraph contains company-specific observations; reads like the writer has done real research
- 4: Mostly specific with one generic paragraph
- 3: Half specific, half generic
- 2: More generic than specific
- 1: Could be sent to any SaaS company with minor edits
- 0: Fully generic

Pass threshold: ≥ 3

#### Dimension 3 — CTA Clarity (0–5)
Is there exactly one clear ask? Is it specific and actionable?

Scoring guide:
- 5: One unambiguous ask; the reader knows exactly what action to take
- 4: One ask, but slightly vague on the action
- 3: One ask, weakened by hedging language
- 2: Two asks, or the ask is implicit
- 1: No clear ask, or the memo ends without direction
- 0: Multiple competing asks or no ask

Pass threshold: ≥ 3

#### Dimension 4 — Tone Compliance (0–5)
Are there any banned phrases, unsolicited praise, jargon, or feature-selling language?

Scoring guide:
- 5: No compliance violations; direct, precise, commercial register throughout
- 4: Minor register issue (one slightly corporate phrase)
- 3: One non-critical tone violation
- 2: One banned phrase or one jargon phrase
- 1: Multiple tone violations
- 0: Banned phrase in opening or closing; or memo is clearly a product pitch

Pass threshold: ≥ 3

---

### Named Test 1 — Genericity Test

**Question:** "Could this memo plausibly be sent to another SaaS company?"

This is a binary test (pass/fail), not scored.

Evaluation instructions to the LLM:
> "Read the memo. Remove the company name from every occurrence. Does the memo still make specific, accurate claims about a real business, or does it become generically true of any SaaS company? If removing the company name leaves the argument substantially intact, this memo fails the genericity test."

Result:
```typescript
interface GenericityTest {
  result: "pass" | "fail";
  reasoning: string;    // 1–2 sentence explanation
}
```

Pass condition: the memo contains ≥ 3 claims that are uniquely specific to this company.
Fail condition: the memo's core argument could describe another SaaS company after a find-and-replace.

---

### Named Test 2 — Founder Pushback Test

**Question:** "What would the founder say is wrong here?"

This is an adversarial simulation, not scored. It is used to identify the memo's weakest claim.

Evaluation instructions to the LLM:
> "Imagine you are the CEO of this company. You have just read this memo. What is the single most credible objection you would raise? Where is the memo's argument most vulnerable to being dismissed? Identify the claim most likely to cause the founder to stop reading."

Result:
```typescript
interface FounderPushbackTest {
  most_vulnerable_claim: string;   // The specific sentence or claim
  likely_objection: string;        // The founder's probable response
  severity: "low" | "medium" | "high";
  revision_suggestion?: string;    // How to strengthen this claim
}
```

This test does not directly gate the memo, but its output is:
1. Included in `MemoCriticResult` for human review
2. Included in `revision_instructions` if the memo fails another dimension and a revision loop is triggered

---

### MemoCriticResult

```typescript
interface MemoCriticResult {
  critic_id: string;
  memo_id: string;
  evaluated_at: string;
  attempt_number: number;

  dimensions: {
    evidence_grounding: DimensionScore;
    commercial_sharpness: DimensionScore;
    cta_clarity: DimensionScore;
    tone_compliance: DimensionScore;
  };

  genericity_test: GenericityTest;
  founder_pushback_test: FounderPushbackTest;

  overall_pass: boolean;   // True only if all 4 dimensions ≥ 3 AND genericity_test = "pass"
  revision_instructions?: RevisionInstructions;
}

interface DimensionScore {
  score: number;        // 0–5
  pass: boolean;        // score >= 3
  notes: string;        // Critic's brief explanation
}

interface RevisionInstructions {
  failing_dimensions: string[];
  specific_issues: string[];       // Line-level problems to fix
  founder_pushback_context: string; // From founder_pushback_test
}
```

---

## Revision Loop

If `criticResult.overall_pass = false` and `memo.attempt_number < 2`:

1. Append `revision_instructions` to `memoBrief` as an additional constraint field
2. Re-run `writeMemo` with `attempt_number = 2`
3. Re-run `criticiseMemo`
4. If still failing after attempt 2 → raise `ERR_MEMO_CRITIC_FAIL`

The revision loop runs at most once (max 2 total writeMemo attempts).

---

## Constraints

1. The memo writer may only use facts from `brief.evidence_spine` — no web search, no inference
2. The memo writer must use `brief.memo_framing` to determine epistemic assertiveness
3. The memo writer must not name specific pricing, product tiers, or implementation costs
4. The critic runs independently with no memory of the writer's reasoning
5. `genericity_test` failure always contributes to `overall_pass = false`, regardless of dimension scores
6. The founder's name (if provided in brief) must appear ≤ 1 time in the memo

---

## Acceptance Criteria

1. A memo for Stripe (full corpus, high confidence) passes all 4 critic dimensions and the genericity test on the first attempt
2. A memo generated from an evidence spine with no customer voice evidence fails `commercial_sharpness` ≤ 3
3. A memo containing the phrase "game-changing" fails `tone_compliance` with score ≤ 2
4. `founder_pushback_test` always returns a non-empty `most_vulnerable_claim`
5. The revision loop runs exactly once on a memo with a single dimension failure
6. A memo that fails the genericity test is not marked `overall_pass = true`

---

## Hard Failure Conditions

| Condition | Error |
|-----------|-------|
| `memo.word_count > 850` | `ERR_MEMO_TOO_LONG` |
| `memo.word_count < 300` | `ERR_MEMO_TOO_SHORT` |
| `evidence_ids` in memo is empty (LLM referenced no evidence) | `ERR_MEMO_EVIDENCE_EMPTY` |
| Banned phrase detected in final memo after revision | `ERR_BANNED_PHRASE` |
| 2 revision attempts exhausted; `overall_pass` still false | `ERR_MEMO_CRITIC_FAIL` |
