# Intelligence Engine V4 — Memo Intelligence Spec

> **Status:** Approved for implementation planning
> **Version:** Revised (incorporates 10 required changes from review)
> **Preceding spec:** V3 memo layer (V3-M1 through V3-M6, 443 tests passing)

---

## 1. Current System Understanding

### Architecture (preserved, not challenged)

Three deterministic layers:

```
UPSTREAM       → siteCorpusAcquisition → externalResearchAcquisition
                 → mergeResearchCorpus → corpusToDossierAdapter

REASONING (V2) → extractSignals → analyseGtm → detectTensions
                 → detectPatterns → selectDiagnosis
                 → generateMechanisms → selectIntervention

MEMO (V3)      → buildEvidencePack (M1)
                 → adjudicateDiagnosis (M2)
                 → buildMemoBrief (M3)
                 → writeMemo (M4, LLM: Haiku 4.5)
                 → criticiseMemo (M5, LLM: Haiku 4.5)
                 → revision loop (max 2 attempts)
                 → runSendGate (M6)
```

### Where AI is used today
- **writeMemo (M4)**: Haiku 4.5, temp=0.3, max_tokens=1500 — renders brief into 5-section prose
- **criticiseMemo (M5)**: Haiku 4.5, temp=0.1, max_tokens=800 — adversarial 4-dim + 2 test evaluation

All upstream stages, the reasoning spine, adjudication, brief construction, and send gate are deterministic and auditable. This is correct and must be preserved.

### What the writer receives today

```
- Company name (+ optional founder)
- Hook: one evidence excerpt + static framing_instruction by hook_type
- Thesis: diagnosis.statement (template string, e.g. "This company has a founder-led sales ceiling")
- Evidence spine: 3–5 records, each with memo_role + static usage_instruction by role
- Intervention framing: static string from INTERVENTION_FRAMING lookup by type
- CTA: deterministic string from CTA_BY_INTERVENTION lookup
- Tone constraints / word budget / banned phrases
```

The writer must do the following reasoning from these inputs:
- Construct a coherent causal argument from raw evidence + template thesis
- Write company-specific mechanism narratives from generic template mechanism statements
- Decide which facts to foreground in each section
- Earn the diagnosis through argument structure rather than merely asserting it

This is a significant reasoning burden placed on Haiku 4.5 with 1500 tokens.

### No rollout comparability mechanism exists today

V3 has no way to run the same dossier through two pipeline configurations and compare outputs. This means any V4 improvement cannot be measured rigorously against V3 on the same input without the flag added in section 3.

---

## 2. Memo Quality Failure Modes

### FM-1: Template thesis creates a generic argument skeleton

`diagnosis.statement` is a template string: `"This company has a founder-led sales ceiling"`. This is the same sentence for every company with that diagnosis. The writer receives it as the thesis and must make it company-specific through evidence selection — but the argument starts as archetype-description, not company-diagnosis.

**Effect**: The "What this means" section often sounds like GTM textbook prose dressed with company facts. The thesis describes a category of company, not this company's specific condition and its commercial cost.

### FM-2: Mechanism narratives are template statements

`generateMechanisms` produces 2–3 mechanisms from `mechanism-map.ts` templates — correct archetypally, but not grounded in the specific company's evidence. For example: `"There is no repeatable demand-generation mechanism independent of the founder"` — true for any company with this diagnosis, not specific to this company's pricing change, hiring pattern, or customer acquisition history.

**Effect**: The "Why this is happening" section names 2 forces that could apply to any company in the archetype. This is the most common cause of genericity test failure in practice.

### FM-3: Haiku 4.5 is bearing a heavy reasoning load with thin inputs

The writer's system prompt says "You are a renderer, not a reasoner — all analysis has been completed upstream." But the brief's content requires substantial reasoning to make useful: connecting raw evidence to template mechanisms, constructing a company-specific argument, and earning the diagnosis through structure. A renderer with template inputs produces template output.

**Effect**: Memo quality plateau. Even well-constructed evidence packs produce memos that feel more like structured GTM analysis than founder-stopping diagnostic arguments.

### FM-4: Critic evaluates claims but not argument structure

The 4 dimensions (evidence_grounding, commercial_sharpness, cta_clarity, tone_compliance) assess whether claims are sourced, specific, clear, and well-toned. None asks: "Does the observation earn the diagnosis? Do the 2 causal forces follow necessarily from the observation? Does the intervention follow from the diagnosis argument, or is it merely appended?"

**Effect**: A memo can pass all 4 dimensions while having an incoherent or circular argument structure.

### FM-5: Revision instructions are diagnostic, not constructive

When the critic fails a dimension, `RevisionInstructions` contains: `specific_issues: ["evidence_grounding (score 2/5): one claim generalises beyond the evidence"]`. The writer on attempt 2 must figure out which evidence record to use and how to restructure the failing section — with only the same evidence spine available.

**Effect**: Attempt 2 produces marginal improvement because the writer doesn't know which record to use or how to rewrite the section.

### FM-6: Hook framing is static per hook_type

The framing instruction for a `customer_quote` hook is always: `"Open with this customer observation directly — no preamble. Let the customer language carry the first sentence."` This doesn't explain what kind of cognitive tension this specific hook creates for this founder, or why this particular observation is strategically significant.

**Effect**: Memos open with specific facts that don't fully exploit their founder-stopping power. The hook lands as an observation, not as the first move in an argument.

### FM-7: No side-by-side comparability infrastructure

There is no mechanism to run identical inputs through V3 and V4 configurations and compare outputs. Without this, it is impossible to rigorously evaluate whether structural improvements translate to memo quality improvement independent of model upgrades.

**Effect**: V4 changes cannot be evaluated or rolled back safely without architectural separation of version behavior.

---

## 3. Proposed V4 Memo Intelligence Design

### Design goals

1. Preserve the full V3 architecture and all contracts
2. Add AI reasoning *before* the writer sees the brief — not during or after
3. Give the writer company-specific argument inputs so it is truly a renderer, not a hidden strategist
4. Make the memo feel inevitable, not merely well-written
5. Reduce hidden reasoning burden on the writer
6. Upgrade the writer model to match the quality expectation (deferred, isolated from structural changes)
7. Strengthen the critic to catch argument-level failures, not just claim-level failures
8. Make revision instructions constructive and evidence-specific
9. Maintain deterministic fallbacks for every new AI stage
10. Preserve comparability between V3 and V4 outputs during rollout via a single rollout control

### Non-goals

- No changes to the V2 reasoning spine
- No changes to the dossier schema or evidence model
- No replacement of adjudicateDiagnosis or runSendGate with AI
- No replacement of deterministic diagnosis selection in V4
- No AI diagnosis second-guessing or override
- No AI intervention simulation
- No uncontrolled proliferation of AI stages — V4 adds exactly one new AI stage
- No changes that prevent side-by-side V3 vs V4 evaluation

### Single rollout control

Add `memoIntelligenceVersion` to `V3PipelineInput`:

```typescript
// In V3PipelineInput:
memoIntelligenceVersion?: "v3" | "v4";  // Default: "v4"
```

**Where the flag lives:** `V3PipelineInput`, passed to `runV3Pipeline`. Propagated to `V3PipelineResult.memo_intelligence_version`.

**How it affects pipeline execution:**
- `"v3"`: Skip `synthesiseArgument`; `buildMemoBrief` uses V3 logic (template thesis, static hook framing, no ArgumentSynthesis); writer and critic use their configured models (defaulting to V3 Haiku during early phases)
- `"v4"`: Run `synthesiseArgument`; `buildMemoBrief` consumes `ArgumentSynthesis`; enriched brief fields active; writer and critic use their configured models (upgraded to Sonnet in Phase 4/5)

**How it preserves comparability:** The same dossier + same V2 outputs can be run with `memoIntelligenceVersion: "v3"` and `memoIntelligenceVersion: "v4"` with the same writer model to isolate the structural improvement from the model improvement. During Phase 3 evaluation (section 7), both runs use Haiku writer and critic.

**How it supports rollback:** Set `memoIntelligenceVersion: "v3"` in the call site. No code change required. All V4 additions are additive and optional.

**V3PipelineResult addition:**
```typescript
// In V3PipelineResult:
memo_intelligence_version: "v3" | "v4";
argumentSynthesis?: ArgumentSynthesis;  // Only present when memoIntelligenceVersion = "v4"
```

### Pipeline change summary

```
V3:                         V4 (memoIntelligenceVersion: "v4"):
M1 buildEvidencePack        M1 buildEvidencePack (unchanged)
M2 adjudicateDiagnosis      M2 adjudicateDiagnosis (unchanged)
M3 buildMemoBrief           M2a synthesiseArgument (NEW, AI: Sonnet 4.6)
M4 writeMemo (Haiku)        M3 buildMemoBrief (consumes ArgumentSynthesis)
M5 criticiseMemo (Haiku)    M4 writeMemo (Haiku → Sonnet in Phase 4)
M6 runSendGate              M5 criticiseMemo (Haiku → Sonnet + 5th dim in Phase 5)
                            M6 runSendGate (formula update in Phase 7 only)
```

**Summary of changes by implementation phase (not all at once):**
- Phase 1: Rollout flag scaffolding only
- Phase 2: New stage `synthesiseArgument` (V4-M2a), brief integration — V3 models
- Phase 3: Side-by-side evaluation
- Phase 4: Writer model Haiku → Sonnet
- Phase 5: Critic model upgrade + `diagnostic_coherence` dimension
- Phase 6: Reconstruction guidance in revision instructions
- Phase 7: Send gate quality score formula update (gated on eval)

---

## 4. New AI Stages and Contracts

### V4-M2a: synthesiseArgument

**File to create:** `src/intelligence-v3/memo/synthesise-argument.ts`
**Type file to create:** `src/intelligence-v3/types/argument-synthesis.ts`

**Purpose:** Before the brief is assembled, use AI to construct company-specific diagnostic argument material from the evidence pack and V2 reasoning outputs. Produces: a company-specific thesis (GTM condition + commercial consequence), 2 mechanism narratives grounded in specific evidence, an ordered argument skeleton with step purposes, a structured hook strategy, and internal fit diagnostics. Replaces the template-based inputs that cause memos to read as archetype-description rather than company-diagnosis.

**This is a reasoning stage, not a rendering stage.** Its outputs are constraints for the brief.

**Model:** Sonnet 4.6, temp=0.2, max_tokens=1200

**Config injectable for tests:**
```typescript
export interface SynthesiseArgumentConfig {
  model?: string;       // Default: "claude-sonnet-4-6"
  max_tokens?: number;  // Default: 1200
  temperature?: number; // Default: 0.2
  timeout_ms?: number;  // Default: 20000; on timeout → fallback_to_template = true
  client?: Anthropic;
}
```

---

#### ArgumentSynthesis type

```typescript
interface ArgumentSynthesis {
  synthesis_id: string;             // "syn_<company_id>_<timestamp>"
  company_id: string;
  synthesised_at: string;

  // Replaces templated thesis in MemoBrief.
  // Must contain: (1) company-specific GTM condition (what is structurally
  // constrained or failing), (2) commercial consequence or commercial risk
  // (what this costs in deals, growth, margin, or optionality).
  // Must NOT describe the company; must diagnose it.
  company_specific_thesis: string;

  // Exactly 2 company-specific causal narratives.
  // Mechanisms must be materially distinct (different mechanism_type, low
  // evidence overlap, non-redundant causal chain).
  mechanism_narratives: MechanismNarrative[];

  // Ordered argument sequence: 3–5 evidence records forming a logical chain.
  argument_skeleton: ArgumentStep[];

  // Structured hook strategy — replaces static framing_instruction string.
  hook_strategy: HookStrategy;

  // All evidence_ids cited anywhere in this synthesis.
  evidence_refs: string[];

  // LLM's self-assessment of synthesis quality given available evidence.
  synthesis_confidence: "high" | "medium" | "low";

  // Rhetorical fit between selected diagnosis and available evidence.
  // Does NOT affect pipeline routing in V4. For diagnostics and future eval.
  diagnosis_fit: "strong" | "adequate" | "strained";

  // Optional: explains the specific gap in evidence-to-diagnosis fit.
  // Populated when diagnosis_fit is "adequate" or "strained".
  diagnosis_tension_note?: string;

  // Result of post-parse distinctness validation.
  distinctness_check: {
    passed: boolean;
    notes?: string[];  // e.g. ["evidence_overlap: 0.72", "mechanism_types identical"]
  };

  // True if LLM error, parse error, validation failure, or distinctness retry
  // exhausted. When true, buildMemoBrief falls back to full V3 logic.
  fallback_to_template: boolean;
}

interface MechanismNarrative {
  mechanism_id: string;             // From V2 Mechanism.id
  mechanism_type: string;           // From V2 Mechanism.type
  // 1–2 sentences. Must describe WHY THIS COMPANY has this problem.
  // Must cite ≥1 evidence_id in parentheses.
  // ≤60 words.
  company_specific_narrative: string;
  evidence_refs: string[];          // Subset of evidencePack.records IDs
}

interface HookStrategy {
  // Classifies what kind of tension the hook creates.
  // contradiction: company claims X, evidence shows not-X
  // commercial_cost: specific observable signal that names a revenue/growth cost
  // hidden_pattern: pattern the founder likely hasn't seen framed this way
  // customer_signal: what customers actually say vs what company says they say
  tension_type: "contradiction" | "commercial_cost" | "hidden_pattern" | "customer_signal";

  // One-sentence instruction for HOW to open (replaces static framing_instruction).
  framing: string;

  // One-sentence explanation of WHY this hook matters to THIS founder.
  // Used by writer to understand strategic intent, not just rendering instruction.
  why_it_matters: string;
}

interface ArgumentStep {
  step_order: number;               // 1-based
  evidence_id: string;              // Must exist in evidencePack.records
  logical_role: "observation" | "mechanism" | "consequence" | "contrast";
  connector?: string;               // "which means" | "because" | "while" | etc.
  // One sentence explaining what this step does logically in the argument.
  // Helps writer render the argument without needing to infer hidden structure.
  // ≤30 words.
  purpose: string;
}
```

---

#### Validation rules (deterministic, post-LLM parse)

**company_specific_thesis:**
1. Non-empty
2. ≤ 100 words
3. ≥ 20 words (too short means one required element is missing)
4. Soft check: contains consequence-language token (any of: "which means", "meaning", "costing", "limits", "prevents", "blocks", "constraining", "ceiling", "at risk", "fragility", "loss of"). If absent, lower `synthesis_confidence` to "medium" but do not fail.

**mechanism_narratives — distinctness validation (deterministic):**

Three checks, in order:

*Check 1 (primary — hard):* `mechanism_type` must be different across both narratives. If types are identical, the two mechanisms are variants of the same causal force.

*Check 2 (secondary — threshold):* Jaccard similarity of `evidence_refs` sets. Computed as `|refs_1 ∩ refs_2| / |refs_1 ∪ refs_2|`. If Jaccard > 0.60, mechanisms are drawing on the same evidence to make the same point.

*Check 3 (tertiary — soft):* Word overlap between the two `company_specific_narrative` strings after stop-word removal. If unigram overlap > 0.60, flag as potentially redundant (lower `synthesis_confidence`, populate `notes`, but do not fail if checks 1 and 2 pass).

**Retry protocol:**
- If Check 1 or Check 2 fails: re-invoke LLM once with instruction: `"Your two mechanism_narratives are too similar [reason]. Mechanism 2 must describe a materially different causal force from Mechanism 1. Provide a new Mechanism 2."`
- If second attempt also fails Check 1 or Check 2: `distinctness_check.passed = false`, `fallback_to_template = true`
- `distinctness_check.notes` records which checks failed and the computed values

**evidence_refs:**
- All cited evidence_ids must exist in `evidencePack.records`
- Every `MechanismNarrative.evidence_refs` entry must exist in pack
- Every `ArgumentStep.evidence_id` must exist in pack

**argument_skeleton:**
- Length: 3–5 steps
- All `evidence_id` values must exist in pack
- Each `purpose` field non-empty, ≤ 30 words

**hook_strategy:**
- All three fields non-empty
- `tension_type` is a valid enum value
- `framing` ≤ 50 words
- `why_it_matters` ≤ 50 words

---

#### Fallback behaviour

If `fallback_to_template = true` (any of: LLM error, parse error, timeout, evidence validation failure, distinctness retry exhausted):
- `buildMemoBrief` executes identical to V3: template thesis, static hook framing by hook_type, no mechanism_narratives or argument_skeleton
- Pipeline continues uninterrupted
- `V3PipelineResult.argumentSynthesis` contains the (partial or failed) synthesis object with `fallback_to_template: true` for diagnostics
- No hard failure thrown; V3 behaviour is the guaranteed fallback

#### Hard failures

None that abort the pipeline. This stage is additive and gracefully degrades.

---

### V4-M3 (modified): buildMemoBrief

**File to modify:** `src/intelligence-v3/memo/build-memo-brief.ts`

**New input field:**
```typescript
interface BuildMemoBriefInput {
  // ... existing fields unchanged
  argumentSynthesis?: ArgumentSynthesis;  // V4 addition; absent when v3 mode or fallback
}
```

**New fields added to MemoBrief type:**
```typescript
interface MemoBrief {
  // ... all existing fields unchanged

  // V4 additions — all optional, absent in v3 mode or on synthesis fallback:
  synthesised_thesis?: string;
    // From argumentSynthesis.company_specific_thesis when fallback_to_template = false.
    // Contains GTM condition + commercial consequence; replaces template thesis for writer.
    // MemoBrief.thesis (template string) retained alongside for diagnostics.
  mechanism_narratives?: MechanismNarrative[];
    // 2 company-specific narratives from synthesis; replaces template mechanism framing
    // in writeMemo user prompt.
  argument_skeleton?: ArgumentStep[];
    // Ordered sequence; presented as advisory in writeMemo prompt.
  hook_strategy?: HookStrategy;
    // When present, hook.framing_instruction is set from hookStrategy.framing.
    // Full HookStrategy exposed in writeMemo prompt so writer gets tension_type
    // and why_it_matters, not just the framing instruction.
}
```

**Hook framing update:**
When `argumentSynthesis.fallback_to_template === false` and `argumentSynthesis.hook_strategy` is present:
- `hook.framing_instruction` = `hookStrategy.framing` (replaces static type-based lookup)
- `brief.hook_strategy` = full `HookStrategy` object (passed to writeMemo)

Fallback: when synthesis absent or `fallback_to_template = true`, use existing V3 hook framing lookup by `hook_type`.

---

### V4-M4 (modified): writeMemo

**File to modify:** `src/intelligence-v3/memo/write-memo.ts`

**Model upgrade (Phase 4 only):**
```typescript
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";  // Phase 2–3: unchanged
// Phase 4: change to "claude-sonnet-4-6"
const DEFAULT_MAX_TOKENS = 1500;                    // Phase 2–3: unchanged
// Phase 4: change to 2000
```

**Updated user prompt** (when `synthesised_thesis`, `mechanism_narratives`, `argument_skeleton`, `hook_strategy` present in brief):

After the existing `OPENING HOOK` block:
```
HOOK STRATEGY — understand the strategic intent before rendering:
  Tension type: <hookStrategy.tension_type>
  Framing instruction: <hookStrategy.framing>
  Why this matters to the founder: <hookStrategy.why_it_matters>
```

After the existing `THESIS` block:
```
COMPANY-SPECIFIC DIAGNOSTIC STATEMENT — use this as the thesis:
  <synthesised_thesis>
  (This names the specific GTM condition and its commercial consequence.
   Use it as the basis for "what_this_means". Do not generalise it.)
```

After the existing `EVIDENCE SPINE` block:
```
CAUSAL MECHANISMS — use these company-specific narratives in "why_this_is_happening":
  Force 1 (<mechanism_type>): <mechanism_narratives[0].company_specific_narrative>
    Evidence: <evidence_refs joined with ", ">
  Force 2 (<mechanism_type>): <mechanism_narratives[1].company_specific_narrative>
    Evidence: <evidence_refs joined with ", ">

SUGGESTED ARGUMENT FLOW — structure the argument in this order (advisory):
  Step 1 [<logical_role>]: Evidence <evidence_id> — <purpose><connector>
  Step 2 [<logical_role>]: Evidence <evidence_id> — <purpose><connector>
  ...
```

**Updated system prompt additions (V4, present when synthesis active):**
```
10. The COMPANY-SPECIFIC DIAGNOSTIC STATEMENT names the GTM condition AND its commercial
    consequence. Use it as-is or paraphrase — do not generalise it back to archetype-description.
11. The CAUSAL MECHANISMS are company-specific. Render them; do not rewrite them into
    generic causal descriptions. You may adjust for prose flow.
12. The SUGGESTED ARGUMENT FLOW orders evidence into the strongest logical sequence.
    Follow it unless a strongly superior structure presents itself.
13. The HOOK STRATEGY tells you what kind of tension to create. Honor the tension_type:
    contradiction = expose gap between stated and real; commercial_cost = name the
    revenue/growth cost; hidden_pattern = reveal structure the founder hasn't seen framed
    this way; customer_signal = let customer evidence speak before analysis.
```

---

### V4-M5 (modified): criticiseMemo

**File to modify:** `src/intelligence-v3/memo/criticise-memo.ts`
**Type file to modify:** `src/intelligence-v3/types/memo-critic.ts`

**Model upgrade (Phase 5 only):** Haiku 4.5 → Sonnet 4.6, keep temp=0.1, increase max_tokens to 1000

**New 5th dimension: `diagnostic_coherence`** (Phase 5)

The dimension is named `diagnostic_coherence`, not `argument_coherence`. The goal is not generic writing logic. The goal is whether the memo earns the diagnosis, explains it causally, and makes the intervention follow logically.

```
5. diagnostic_coherence (0–5):
   5 = the observation leads necessarily to the diagnosis; both causal forces are
       distinct and traceable to specific evidence; the intervention follows from
       the diagnosis argument — it is not appended, it is earned; a skeptical
       reader could follow the logical chain from observation to recommended action
   4 = minor logical gap or slight redundancy between causal forces; intervention
       connection is slightly implicit but still coherent
   3 = one causal force is partially redundant or one step in the chain requires
       the reader to fill a gap; the diagnosis is supported but not fully earned
   2 = causal forces don't clearly follow from the observation, or the diagnosis
       is asserted rather than argued; intervention is appended rather than derived
   1 = observation and diagnosis are effectively disconnected; causal forces
       describe the problem rather than explaining it
   0 = the memo asserts a diagnosis that the opening observation does not support;
       the argument is circular (e.g., "they have founder dependency because they
       rely on the founder")
   Pass threshold: ≥ 3
```

**Updated overall_pass logic (Phase 5):**
```typescript
overall_pass =
  dimensions.evidence_grounding.pass &&
  dimensions.commercial_sharpness.pass &&
  dimensions.cta_clarity.pass &&
  dimensions.tone_compliance.pass &&
  dimensions.diagnostic_coherence.pass &&      // Added in Phase 5
  genericity_test.result === "pass"
```

**Enhanced `reconstruction_guidance` in RevisionInstructions (Phase 6):**

```typescript
interface RevisionInstructions {
  attempt_number: number;
  failing_dimensions: string[];
  specific_issues: string[];
  founder_pushback_context: string;

  // V4 Phase 6 addition:
  reconstruction_guidance?: SectionReconstruction[];
}

interface SectionReconstruction {
  section: MemoSectionName;
  issue: string;                    // Specific problem in one sentence
  suggested_evidence_ids: string[]; // Evidence_ids from spine that would fix this
  rewrite_instruction: string;      // Exact instruction: "Rewrite using [ev_003]..."
}
```

---

### V4-M6 (modified): runSendGate — quality score

**File to modify:** `src/intelligence-v3/memo/run-send-gate.ts`

**Send gate formula changes are deferred to Phase 7.** Do not update the formula when implementing Phases 1–6.

**Current formula (unchanged through Phase 6):**
```typescript
// critic_dimensions: 4 × (sum of scores) × 2 = max 40 pts
// evidence_ref_count: 0–20 pts
// word_count_target_range: 0–15 pts
// genericity_test: 0 or 15 pts
// founder_pushback_severity: 0–10 pts
// Total max: 100
```

**Temporary behavior during Phases 5–6:** `diagnostic_coherence` participates in `overall_pass` (via `criticResult.overall_pass`) and therefore affects send gate criterion 1 (`critic_overall_pass`). However, `diagnostic_coherence` does not yet contribute to the quality score. The critic's quality contribution to the score is still computed from 4 original dimensions only. This is intentional.

**Phase 7 formula (after eval gate):**
```typescript
// critic_dimensions: 5 × (sum of scores) × 1.6 = max 40 pts (cap preserved)
// evidence_ref_count: 0–20 pts (unchanged)
// word_count_target_range: 0–15 pts (unchanged)
// genericity_test: 0 or 15 pts (unchanged)
// founder_pushback_severity: 0–10 pts (unchanged)
// Total max: 100 (unchanged)
```

**Gate for Phase 7 activation:** Review diagnostic_coherence scores across ≥5 fixture company runs after Phase 5. Compute mean and standard deviation. If scores correlate meaningfully with human judgment of argument quality (measured via founder_stop_power rubric), activate the Phase 7 formula. If diagnostic_coherence is systematically miscalibrated (e.g., passes everything or fails everything), revise the rubric first.

---

## 5. Prompt Architecture

### synthesiseArgument — System Prompt

```
You are a commercial argument constructor for GTM intelligence memos.

Your job is to synthesize company-specific diagnostic argument material from
a structured evidence pack and V2 reasoning outputs. You are NOT writing the
memo. You are constructing the logical skeleton the memo writer will use.

RULES:
1. Every claim must trace to a specific evidence_id from the pack.
   Cite evidence_ids inline: claim text (ev_003).
2. Do not invent metrics, quotes, customers, pricing, or facts not in the
   evidence. If evidence supports only a weaker claim, make the weaker claim.
3. Produce exactly 2 mechanism_narratives — one per mechanism provided.
   The two mechanisms must be materially distinct: different mechanism_type,
   different evidence base, different causal chain. Do not reframe the same
   force twice.
4. company_specific_thesis must contain TWO elements:
   (a) the company-specific GTM condition — what is structurally constrained
       or failing at THIS company (not the archetype)
   (b) the commercial consequence or commercial risk — what this costs in
       deals lost, growth ceiling, margin compression, or strategic optionality
   Do not describe the company. Diagnose it. These are not the same thing.
5. mechanism_narratives must explain WHY THIS COMPANY has this problem.
   Prefer contradictions, bottlenecks, and demand-conversion failures over
   vague structural abstractions. Use evidence. Be specific.
6. hook_strategy must identify the tension type AND explain why this specific
   observation matters to this founder — not a generic framing instruction.
7. argument_skeleton orders 3–5 evidence records into a logical chain.
   Each step must include a one-sentence purpose explaining its logical role.
8. diagnosis_fit and diagnosis_tension_note reflect your honest assessment of
   how well the evidence supports the selected diagnosis rhetorically.
   These do not change the diagnosis. They are diagnostics only.

HALLUCINATION CONTROLS:
- If you cannot ground a claim in a specific evidence_id, omit it.
- If evidence is insufficient to support a company-specific claim, make the
  weaker version of the claim or mark synthesis_confidence as "low".
- Never write a mechanism_narrative longer than 2 sentences (60 words max).
- company_specific_thesis max 100 words, min 20 words.
- Every evidence_id you cite must appear in the pack provided.
- Do not use the diagnosis archetype name (e.g., founder_led_sales_ceiling)
  in the company_specific_thesis. Name the company's actual condition.

OUTPUT FORMAT: Return valid JSON only. No markdown fences. No text outside JSON.
{
  "company_specific_thesis": "...",
  "mechanism_narratives": [
    {
      "mechanism_id": "mech_XXX",
      "mechanism_type": "...",
      "company_specific_narrative": "... (ev_XXX)",
      "evidence_refs": ["ev_XXX"]
    },
    {
      "mechanism_id": "mech_YYY",
      "mechanism_type": "...",
      "company_specific_narrative": "... (ev_YYY)",
      "evidence_refs": ["ev_YYY"]
    }
  ],
  "argument_skeleton": [
    {
      "step_order": 1,
      "evidence_id": "ev_XXX",
      "logical_role": "observation",
      "connector": "which means",
      "purpose": "..."
    },
    ...
  ],
  "hook_strategy": {
    "tension_type": "contradiction | commercial_cost | hidden_pattern | customer_signal",
    "framing": "...",
    "why_it_matters": "..."
  },
  "evidence_refs": ["ev_XXX", ...],
  "synthesis_confidence": "high | medium | low",
  "diagnosis_fit": "strong | adequate | strained",
  "diagnosis_tension_note": "..."
}
```

**What the model must NOT do:**
- Invent any fact not present in the evidence pack
- Produce mechanism_narratives that could apply to a different company in the same archetype
- Use the diagnosis archetype identifier in the thesis
- Write a thesis that describes the company without diagnosing its condition and consequence
- Produce prose intended for the final memo (no section headings, no "Dear Founder" framing)
- Produce mechanism_narratives with the same mechanism_type or the same evidence base

---

### synthesiseArgument — User Prompt

```
Construct a company-specific diagnostic argument for [COMPANY].

DIAGNOSIS:
  Type: [diagnosis.type]
  Statement: [diagnosis.statement]
  Confidence: [diagnosis.confidence]
  Evidence refs: [diagnosis.evidence_refs joined with ", "]

MECHANISMS (synthesise exactly 2 company-specific narratives):
  [1] ID: [mech1.id]
      Type: [mech1.type]
      Template statement: [mech1.statement]
      Evidence refs: [mech1.evidence_refs joined with ", "]

  [2] ID: [mech2.id]
      Type: [mech2.type]
      Template statement: [mech2.statement]
      Evidence refs: [mech2.evidence_refs joined with ", "]

OPENING HOOK (grounds the opening observation):
  Evidence ID: [hook.evidence_id]
  Excerpt: "[hook.excerpt]"
  Hook type: [hook.hook_type]

EVIDENCE PACK (all facts you may use — cite by evidence_id):
[For each record in evidencePack.records, ordered by total_score desc]:
  [evidence_id] (Tier [source_tier], [evidence_type], score=[total_score]):
    "[excerpt]"
    Roles: [memo_roles joined with ", "]

---
Synthesise a company-specific argument. Return JSON only.
```

---

### criticiseMemo — Updated System Prompt (Phase 5 additions)

**New dimension 5 — added after tone_compliance:**

```
5. diagnostic_coherence (0–5):
   The goal of this dimension is not to evaluate writing quality.
   The goal is to determine whether the memo earns the diagnosis,
   explains it causally, and makes the intervention logically follow.

   5 = the opening observation leads necessarily to the diagnosis; both
       causal forces are distinct, non-redundant, and traceable to specific
       evidence; the intervention follows from the diagnosis as the logical
       next action; the full argument chain is auditable
   4 = minor gap between observation and diagnosis, or slight redundancy
       between causal forces; intervention is slightly implicit but derivable
   3 = one causal force is partially redundant or one chain step requires
       the reader to bridge a gap; diagnosis is supported but not fully earned
   2 = causal forces don't clearly follow from observation; diagnosis is
       asserted rather than argued; intervention is named rather than derived
   1 = observation and diagnosis are effectively disconnected; causal forces
       describe the problem rather than causally explain it
   0 = the memo asserts a diagnosis the observation doesn't support;
       the argument is circular
   Pass threshold: ≥ 3
```

**Updated JSON output format** (add to existing 4-dim structure):
```json
"diagnostic_coherence": { "score": 0-5, "notes": "..." }
```

**Reconstruction guidance instruction (Phase 6 addition to system prompt):**

```
When any scoring dimension fails (score < 3), include reconstruction_guidance
in your JSON response. For each failing section, provide:
  - "section": which of the 5 memo sections contains the problem
  - "issue": one sentence describing the specific problem
  - "suggested_evidence_ids": 1–2 evidence_ids from the spine that could fix it
    (these must be from the EVIDENCE SPINE you were provided)
  - "rewrite_instruction": one concrete instruction, e.g.
    "Replace the unsupported claim about enterprise sales cycles with the
     pricing observation in ev_007, which directly demonstrates the constraint"

Include reconstruction_guidance as a JSON array even if only one section fails.
Only include sections that need reconstruction.
```

---

### writeMemo — System Prompt (Phase 4+)

**No change to existing 9 rules.** Add rules 10–13 conditionally when synthesis fields are present in brief (see section 4 above). The "renderer, not a reasoner" framing is preserved and becomes more accurate once synthesis provides company-specific argument material.

---

## 6. Evaluation and Test Strategy

### Success metrics (measurable, tracked across phases)

| Metric | Measurement method | V3 baseline (establish in Phase 3) | V4 target |
|--------|-------------------|------------------------------------|-----------|
| Genericity test pass rate | Critic result | Measure | ≥ 90% fixture set |
| diagnostic_coherence avg | Critic result | N/A until Phase 5 | ≥ 3.5 avg |
| Commercial sharpness avg | Critic result | Measure | ≥ 3.5 avg |
| founder_stop_power (manual) | Human rubric (1–5) | Establish in Phase 3 | ≥ +0.5 avg delta |
| Revision loop trigger rate | Pipeline result | Measure in Phase 3 | ≤ 30% |
| Send gate pass rate | Gate result | Measure | ≥ 80% fixture set |
| synthesis_confidence | ArgumentSynthesis | N/A | ≥ 70% "high" or "medium" |
| fallback_to_template rate | ArgumentSynthesis | N/A | ≤ 10% |

### founder_stop_power — Human Evaluation Rubric

**Definition:** Does the memo opening and diagnosis create immediate, company-specific tension that would make a founder stop and keep reading? Would a founder think "how do they know this?" at any point in the first two sections?

```
5 — MUST READ: The opening names something real about this company that the founder
    recognizes but hasn't articulated. The diagnosis is specific enough that it
    could not apply to another company. The observation creates productive discomfort.
    A founder would forward this to their co-founder.

4 — KEEPS READING: The opening is specific and commercially grounded. A founder
    would read to the end. One element slightly generic but the argument is real.

3 — READS POLITELY: The opening is accurate and specific but doesn't create
    tension. A founder recognizes their situation but doesn't feel urgency.
    The diagnosis is correct but not confrontational.

2 — SKIMS: The opening could apply to most B2B SaaS companies with light edits.
    A founder reads the first paragraph without feeling it describes their
    specific company. The observation doesn't land.

1 — DISCARDS: The opening is generic and could have been written without
    researching this company. The memo feels like a template. A founder
    would not read past the first paragraph.
```

**When to apply:** Manual evaluation during Phase 3 (V3 vs V4 comparison with same Haiku models) and again after Phase 4 (Sonnet writer). Minimum 3 fixture company evaluations per phase.

**Decision gate for Phase 4:** If V4 structural improvement (V3 vs V4, same Haiku writer) produces avg `founder_stop_power` delta ≥ +0.5 on the fixture set, proceed to Phase 4 writer upgrade. If not, diagnose synthesis quality (check `fallback_to_template` rate, `synthesis_confidence` distribution, `diagnosis_fit` distribution) before proceeding.

---

### V3 vs V4 Comparison Criteria (Phase 3 evaluation)

Both runs use identical dossier, identical V2 outputs, identical Haiku writer and critic models. Only `memoIntelligenceVersion` differs.

For each fixture company, compare on:

| Criterion | V3 | V4 |
|-----------|----|----|
| Does thesis name a GTM condition + commercial consequence? | Template (no) | Synthesis (yes if not fallback) |
| Do mechanism narratives cite company-specific evidence? | No | Yes if synthesis active |
| Genericity test | Critic result | Critic result |
| Commercial sharpness score | Critic result | Critic result |
| founder_stop_power | Manual (1–5) | Manual (1–5) |
| Send gate quality score | Gate result | Gate result |
| Revision loop triggered? | Pipeline result | Pipeline result |
| synthesis_confidence | N/A | ArgumentSynthesis |
| diagnosis_fit | N/A | ArgumentSynthesis |

---

### Test plan

#### Unit tests — synthesiseArgument (new file)
`src/intelligence-v3/__tests__/synthesise-argument.test.ts`

- Output schema validation: all required fields present
- `company_specific_thesis` length check: 20–100 words
- `mechanism_narratives` count === 2 exactly
- `mechanism_narratives[i].evidence_refs` are all in evidence pack
- `argument_skeleton` length 3–5 steps
- `argument_skeleton[i].evidence_id` in pack
- `argument_skeleton[i].purpose` non-empty, ≤ 30 words
- `hook_strategy.tension_type` is valid enum value
- `evidence_refs` are all in pack (subset validation)
- **Distinctness — mechanism_type identical → Check 1 fails, retry triggered**
- **Distinctness — Jaccard > 0.60 → Check 2 fails, retry triggered**
- **Distinctness — both retry attempts fail → `fallback_to_template = true`**
- LLM error → `fallback_to_template = true`, no throw
- Parse error (invalid JSON) → `fallback_to_template = true`, no throw
- Timeout → `fallback_to_template = true`, no throw
- Evidence_id in mechanism not in pack → validation fails, `fallback_to_template = true`
- `synthesis_confidence: "low"` when fewer than 3 evidence_ids cited across synthesis
- Injectable client: mock returning valid JSON, invalid JSON, partial JSON
- `memoIntelligenceVersion: "v3"` → `synthesiseArgument` not called (checked in pipeline test)
- `memoIntelligenceVersion: "v4"` → `synthesiseArgument` called (checked in pipeline test)

Minimum: 25 unit tests.

#### Contract tests — modified stages

**buildMemoBrief:**
- When `argumentSynthesis.fallback_to_template = false`:
  - `brief.synthesised_thesis` populated
  - `brief.mechanism_narratives` populated
  - `brief.hook_strategy` populated
  - `hook.framing_instruction` equals `hookStrategy.framing`
- When `argumentSynthesis.fallback_to_template = true`: brief is identical to V3 output
- When `argumentSynthesis` absent: brief is identical to V3 output

**criticiseMemo (Phase 5):**
- Output includes `diagnostic_coherence` with `score` (0–5) and `notes`
- `overall_pass = false` when `diagnostic_coherence.score < 3`
- `overall_pass = false` when genericity fails even if all 5 dims pass
- `reconstruction_guidance` present when any dimension fails (Phase 6)
- Each `SectionReconstruction.section` is a valid `MemoSectionName`
- `suggested_evidence_ids` non-empty when evidence_grounding or diagnostic_coherence fails

**runSendGate (Phase 7 only):**
- Quality score formula: 5 dims × (sum of scores) × 1.6 capped at 40
- Test: all 5/5 → critic contribution = 40
- Test: all 3/5 → critic contribution = 24
- Total score still ≤ 100

**run-v3-pipeline:**
- `memoIntelligenceVersion: "v3"` → `argumentSynthesis` undefined in result
- `memoIntelligenceVersion: "v4"` → `argumentSynthesis` present in result
- `memo_intelligence_version` field in result matches input
- Default behavior: `"v4"` when flag absent

#### Golden tests

`src/intelligence-v3/__tests__/golden/` (created in Phase 4)

For each fixture company:
- `fallback_to_template === false` (synthesis succeeded)
- Each `mechanism_narrative` contains at least one parenthetical evidence_id citation
- `company_specific_thesis` does NOT contain archetype name verbatim
- `company_specific_thesis` contains at least one company-specific proper noun (company name, person name, or product name)
- `hook_strategy.tension_type` is consistent with evidence type (e.g., Tier 3 review → `customer_signal`)
- Snapshot of synthesis output stored; flag on change (regression)
- Manual `founder_stop_power` score ≥ 3 for V4 run (established in Phase 3 and carried forward)

#### Regression tests
- All 443 existing tests pass after each phase
- V4 changes are additive — no existing test contracts broken
- No existing mock shapes need updating until Phase 5 (when `diagnostic_coherence` is added to critic result)

---

## 7. Implementation Plan

### Principle
Separate structural quality gains from model quality gains. Evaluate structural improvement in isolation before introducing model upgrades that could mask or conflate the signal.

---

### Phase 1 — Rollout flag scaffolding (1 hr)

**Scope:** Add `memoIntelligenceVersion` to pipeline input/output. No behavior change.

**Files modified:**
- `src/intelligence-v3/pipeline/run-v3-pipeline.ts`:
  - Add `memoIntelligenceVersion?: "v3" | "v4"` to `V3PipelineInput` (default `"v4"`)
  - Add `memo_intelligence_version: "v3" | "v4"` to `V3PipelineResult`
  - Add `argumentSynthesis?: ArgumentSynthesis` to `V3PipelineResult`
  - Add branch scaffold: `if (version === "v4") { /* synthesiseArgument will go here */ }`

**Tests:**
- `run-v3-pipeline.test.ts`: verify `memo_intelligence_version` matches input; verify default is `"v4"`; verify flag passes through cleanly

**Risks:** None. Pure scaffolding.

**Acceptance criteria:** All existing tests pass. Flag present in types. Branch scaffold in place but no new behavior.

---

### Phase 2 — synthesiseArgument + brief integration (3–4 hrs)

**Scope:** Build the full `synthesiseArgument` stage. Integrate into brief and writer. Writer and critic models stay as Haiku 4.5.

**Files to create:**
- `src/intelligence-v3/memo/synthesise-argument.ts`
- `src/intelligence-v3/types/argument-synthesis.ts`
- `src/intelligence-v3/__tests__/synthesise-argument.test.ts`

**Files to modify:**
- `src/intelligence-v3/memo/build-memo-brief.ts`: Accept `argumentSynthesis?`; consume `synthesised_thesis`, `mechanism_narratives`, `argument_skeleton`, `hook_strategy` when `fallback_to_template === false`; update `hook.framing_instruction` from `hookStrategy.framing`; populate `hook_strategy`, `mechanism_narratives`, `argument_skeleton` in brief
- `src/intelligence-v3/types/memo-brief.ts`: Add `synthesised_thesis?`, `mechanism_narratives?`, `argument_skeleton?`, `hook_strategy?`
- `src/intelligence-v3/memo/write-memo.ts`: Update `buildUserPrompt` to include synthesis fields when present; add system prompt rules 10–13 conditionally
- `src/intelligence-v3/pipeline/run-v3-pipeline.ts`: Wire `synthesiseArgument` call inside `v4` branch; pass result to `buildMemoBrief`; add `synthConfig?: SynthesiseArgumentConfig` to `V3PipelineInput`

**Note:** No model changes. Writer stays Haiku 4.5. Critic stays Haiku 4.5.

**Risks:**
- Evidence_id hallucination → caught by post-parse validation, fallback_to_template = true
- Synthesis still generic for thin evidence packs → expected; adjudication gate handles this upstream
- Latency: ~3–5s additional Sonnet call

**Acceptance criteria:**
- All 443 existing tests pass
- ≥ 25 new unit tests for `synthesiseArgument` covering all validation paths
- `buildMemoBrief` contract tests pass for synthesis-present and synthesis-absent paths
- Pipeline test: `memoIntelligenceVersion: "v3"` skips synthesis, `"v4"` runs synthesis

---

### Phase 3 — Side-by-side evaluation (evaluation run, not code)

**Scope:** Run 3+ fixture companies with `"v3"` and `"v4"` flags using the same Haiku writer and critic. Score both on founder_stop_power (manual) and available critic metrics.

**Fixture companies:** At minimum, use the 3 calibration companies documented in MEMORY.md (Trigger.dev, Omnea, and the PLG signal company) plus any additional fixture dossiers in `src/report/evals/fixtures/`.

**For each company, produce:**
1. V3 pipeline run: `memoIntelligenceVersion: "v3"`
2. V4 pipeline run: `memoIntelligenceVersion: "v4"`
3. Score both on founder_stop_power rubric (1–5 scale)
4. Record genericity test pass/fail, commercial_sharpness score, revision loop triggered
5. Inspect synthesis outputs: `synthesis_confidence`, `diagnosis_fit`, `fallback_to_template`

**Decision gate:**
- If avg `founder_stop_power` delta (V4 − V3) ≥ +0.5 across fixture set: proceed to Phase 4
- If delta < +0.5: diagnose synthesis quality (high fallback rate? low confidence? strained diagnosis_fit? thin evidence pack?) before proceeding
- If `fallback_to_template` rate > 25%: investigate synthesis failure modes and fix before Phase 4

---

### Phase 4 — Writer model upgrade (30 min + eval)

**Scope:** Upgrade writer from Haiku 4.5 to Sonnet 4.6. Increase `max_tokens` to 2000.

**Files modified:**
- `src/intelligence-v3/memo/write-memo.ts`:
  - `DEFAULT_MODEL = "claude-sonnet-4-6"`
  - `DEFAULT_MAX_TOKENS = 2000`

**Tests to update:**
- `write-memo.test.ts`: Update default model and token assertions

**Post-change eval:** Re-run Phase 3 fixture set with `"v4"` + Sonnet writer. Compare `founder_stop_power` scores against Phase 3 V4 + Haiku writer baseline. This isolates model quality gain from structural gain.

**Risks:** Cost increases per writer call (~4x per token vs Haiku). This is acceptable; the memo is the product.

**Acceptance criteria:** All tests pass with updated defaults. Eval shows Sonnet writer produces measurably richer prose than Haiku writer on same brief.

---

### Phase 5 — Critic upgrade + diagnostic_coherence dimension (2 hrs)

**Scope:** Upgrade critic model. Add `diagnostic_coherence` as 5th critic dimension.

**Files modified:**
- `src/intelligence-v3/memo/criticise-memo.ts`:
  - `DEFAULT_MODEL = "claude-sonnet-4-6"`
  - `DEFAULT_MAX_TOKENS = 1000`
  - Update `buildCriticSystemPrompt`: add `diagnostic_coherence` rubric
  - Update `parseCriticResponse`: extract `diagnostic_coherence`, validate 0–5
  - Update `overall_pass` logic: AND with `diagnostic_coherence.pass`
- `src/intelligence-v3/types/memo-critic.ts`:
  - Add `diagnostic_coherence: DimensionScore` to `MemoCriticDimensions`

**Send gate formula:** NOT changed in this phase. See Phase 7.

**Tests to update:**
- `criticise-memo.test.ts`: Add `diagnostic_coherence` to all mock response shapes; test `overall_pass = false` when `diagnostic_coherence < 3`; update model assertions
- `run-send-gate.test.ts`: No formula changes yet — gate still computes from 4 original dims

**Post-change eval:** Run fixture set again. Record `diagnostic_coherence` scores. Check whether they correlate with human judgment of argument quality. Record for Phase 7 gate decision.

**Acceptance criteria:** All tests pass with updated shapes. `overall_pass` now requires 5 dims. Eval run produces reasonable `diagnostic_coherence` distribution (not all 5, not all 1).

---

### Phase 6 — Revision guidance enhancement (2 hrs)

**Scope:** Add `reconstruction_guidance` to revision instructions.

**Files modified:**
- `src/intelligence-v3/memo/criticise-memo.ts`:
  - Update `buildCriticSystemPrompt`: add reconstruction guidance instruction
  - Update `parseCriticResponse`: extract `reconstruction_guidance` array from JSON
  - Update `buildRevisionInstructions`: populate `reconstruction_guidance` from parsed response
- `src/intelligence-v3/types/memo-critic.ts`:
  - Add `reconstruction_guidance?: SectionReconstruction[]` to `RevisionInstructions`
  - Add `SectionReconstruction` interface

**Tests to update:**
- `criticise-memo.test.ts`: Add `reconstruction_guidance` assertion to failing-dimension tests; test `suggested_evidence_ids` are from the spine; test section names are valid `MemoSectionName`

**Acceptance criteria:** All tests pass. Revision instructions for Phase 4+ test companies contain specific evidence_ids and rewrite instructions.

---

### Phase 7 — Send gate formula update (1 hr, gated on eval)

**Gate condition for activation:**
1. ≥ 5 fixture company runs have completed with Phase 5 critic (with `diagnostic_coherence`)
2. Mean `diagnostic_coherence` score is between 2.0 and 4.5 (not systematically failing or passing)
3. `diagnostic_coherence` scores show positive correlation with `founder_stop_power` manual rubric (Pearson r ≥ 0.4)
4. No fixture company has `diagnostic_coherence > 4` but `founder_stop_power ≤ 2` (false pass)

**If gate passes:** Update quality score formula to 5-dim version.

**If gate fails:** Review rubric, adjust pass threshold, or adjust dimension weight before updating formula.

**Files modified:**
- `src/intelligence-v3/memo/run-send-gate.ts`: Update quality score formula

**Tests to update:**
- `run-send-gate.test.ts`: Update quality score formula tests for 5-dim

**Acceptance criteria:** Formula tests pass with 5-dim scoring. Total max score remains ≤ 100.

---

## 8. Open Risks / Decisions

### Risk 1 — synthesiseArgument latency

A Sonnet call at ~3–5s adds to pipeline runtime. If the pipeline runs interactively, this is notable.

**Mitigation:** `timeout_ms` field in `SynthesiseArgumentConfig` (default 20000ms). On timeout, `fallback_to_template = true`. Pipeline continues with V3 brief.

**Decision:** Accept latency in current usage pattern (offline batch run). If interactive use case emerges, timeout can be tightened.

---

### Risk 2 — High fallback_to_template rate

If most synthesis runs fall back due to evidence quality or LLM failures, V4 mode effectively produces V3 output for most companies.

**Mitigation:** Phase 3 evaluation explicitly tracks `fallback_to_template` rate. If > 25%, investigate before proceeding. Root cause options: evidence pack too thin (adjudication issue), synthesis model not following instructions (prompt issue), validation too strict (relax check thresholds).

---

### Risk 3 — Distinctness retry cost

One retry invocation adds another Sonnet call and ~3–5s. Worst case: 2 synthesis Sonnet calls per pipeline run.

**Mitigation:** Retry is only triggered when Check 1 or Check 2 fails. These are hard structural failures (same type or >60% evidence overlap). Well-calibrated synthesis prompts should make this rare. Monitor retry trigger rate in Phase 3 eval.

---

### Risk 4 — diagnostic_coherence miscalibration

The new 5th critic dimension is more subjective than the other 4. It may be systematically over-permissive (passes all memos) or over-strict (fails most memos), which would skew the quality score if baked into the formula prematurely.

**Mitigation:** Phase 7 is explicitly gated on calibration evidence. The dimension participates in `overall_pass` (via criterion 1) but not the quality score formula until calibrated. This is the correct isolation.

---

### Risk 5 — Model upgrades (Phase 4/5) mask structural signal

Upgrading writer and critic to Sonnet changes two variables simultaneously with the V4 structural changes.

**Mitigation:** Phase 3 evaluation runs the V4 structural changes with Haiku writer, establishing a clean V3-vs-V4-structural baseline before Sonnet is introduced. Phase 4 adds writer upgrade and re-evaluates. Each phase adds one variable.

---

### Risk 6 — Backwards compatibility of type changes

V4 adds optional fields to `MemoBrief`, `MemoCriticDimensions`, `RevisionInstructions`, and `V3PipelineResult`. Existing tests that don't include these fields must continue to work.

**Mitigation:** All new fields are `?` optional in TypeScript. No existing test mock shapes require update until Phase 5 (when `diagnostic_coherence` becomes part of `MemoCriticDimensions`, requiring all mock shapes to include it). Phase 5 acceptance criteria includes updating all affected mock shapes.

---

### Risk 7 — Rollout flag scope creep

The `memoIntelligenceVersion` flag must remain a single binary control. Risk of additional flags being added for individual sub-features (synthesis flag, model flag, coherence flag separately).

**Mitigation:** Stated explicitly as a non-goal. Model selection remains controlled by injectable `WriteMemoConfig.model` and `CriticConfig.model` (existing injectable configs, not pipeline flags). Only one pipeline-level flag: `memoIntelligenceVersion`. Any future version additions would be `"v5"`, not a new flag.

---

## 9. Recommended First Build Slice

Build in this order. Each slice is independently shippable and observable.

### Slice 1 (1 hr): Rollout flag scaffolding

Add `memoIntelligenceVersion` to `V3PipelineInput` and `V3PipelineResult`. Add `argumentSynthesis?` to result type. Wire the branch scaffold in `run-v3-pipeline.ts`. Update tests. Run test suite. Ship.

No behavior change. Establishes the comparability infrastructure needed to evaluate everything else.

### Slice 2 (3–4 hrs): synthesiseArgument stage

Build `synthesise-argument.ts` with injectable client, full validation, distinctness checks, retry protocol, and fallback. Modify `build-memo-brief.ts` to consume synthesis. Modify `write-memo.ts` user prompt. Wire into pipeline. Write ≥ 25 unit tests. Run full test suite. Ship.

**Writer remains Haiku 4.5 in this slice.** The point of this slice is to evaluate structural improvement in isolation.

### Slice 3 (evaluation, not code): Phase 3 side-by-side eval

Run 3+ fixture companies V3 vs V4, same Haiku models. Score both on `founder_stop_power` (1–5, manual). Record genericity test pass rate, commercial sharpness, revision loop trigger rate. Review `synthesis_confidence` and `diagnosis_fit` distributions. Document findings.

**Decision gate:** Proceed to Slice 4 only if V4 avg `founder_stop_power` delta ≥ +0.5.

### Slice 4 (30 min): Writer model upgrade

Change `DEFAULT_MODEL` in `write-memo.ts` to `"claude-sonnet-4-6"`. Increase `DEFAULT_MAX_TOKENS` to 2000. Update tests. Run test suite. Re-run eval. Ship.

### Slice 5 (2 hrs): Critic upgrade + diagnostic_coherence

Upgrade critic model. Add 5th dimension. Update types. Update tests. Run test suite. Collect `diagnostic_coherence` distribution data for Phase 7 gate. Ship.

### Slice 6 (2 hrs): Reconstruction guidance

Enhance revision instructions. Update types. Update tests. Run test suite. Ship.

### Slice 7 (1 hr, gated): Send gate formula

Only after Phase 7 gate passes. Update quality score formula. Update tests. Ship.

---

## 10. Change Summary from Previous Draft

### Change 1 — Rollout control added
Previous draft stated "no feature flags." Revised to add `memoIntelligenceVersion?: "v3" | "v4"` to `V3PipelineInput` with default `"v4"`. Rollout flag lives in pipeline input/result only. Explains: where it lives, how it affects execution, how it preserves comparability (same input, different flag, same models = structural comparison), and how it supports rollback (set to `"v3"`). Explicitly states no additional flags.

### Change 2 — argument_coherence renamed to diagnostic_coherence
All occurrences updated: schema type name, critic system prompt rubric text, overall_pass logic, test descriptions, evaluation plan, send gate discussion. The rubric text now explicitly frames the dimension as measuring whether the memo earns the diagnosis, explains it causally, and makes the intervention follow — not generic writing logic.

### Change 3 — company_specific_thesis contract strengthened
Schema comment now specifies two required elements: (1) company-specific GTM condition, (2) commercial consequence or commercial risk. Prompt rule 4 rewritten to state this explicitly. Soft validation added: consequence-language token check with `synthesis_confidence` reduction on failure (not hard failure). Prior contract only required "company-specific" without specifying the dual-element requirement.

### Change 4 — Mechanism distinctness validation added
New field `distinctness_check: { passed: boolean, notes?: string[] }` added to `ArgumentSynthesis`. Three deterministic checks defined: mechanism_type uniqueness (primary), Jaccard evidence overlap ≤ 0.60 (secondary), word overlap ≤ 0.60 (tertiary/soft). One-retry protocol defined: re-invoke LLM on primary or secondary failure with explicit instruction. On second failure: `distinctness_check.passed = false`, `fallback_to_template = true`. Fallback behavior clearly stated.

### Change 5 — hook_framing replaced with HookStrategy struct
`hook_framing: string` removed from `ArgumentSynthesis`. Replaced with `hook_strategy: HookStrategy` with three fields: `tension_type` enum, `framing` string, `why_it_matters` string. Tension type enum defined (`contradiction`, `commercial_cost`, `hidden_pattern`, `customer_signal`). `buildMemoBrief` integration described: `hook.framing_instruction` set from `hookStrategy.framing`; full `HookStrategy` stored in brief. `writeMemo` integration described: user prompt exposes all three fields with distinct writer purposes. Rationale: tension_type gives writer context about the KIND of tension; `why_it_matters` explains the strategic intent; together they reduce hidden reasoning burden.

### Change 6 — purpose field added to ArgumentStep
`purpose: string` added to `ArgumentStep` schema. Defined as one sentence explaining what this step does logically in the argument (≤ 30 words). Validation added. User prompt format updated to include `purpose` per step. Prompt output format updated. Rationale: helps the writer render the argument without inferring hidden structure from logical_role + evidence_id alone.

### Change 7 — Diagnosis fit diagnostics added
Two new fields added to `ArgumentSynthesis`: `diagnosis_fit: "strong" | "adequate" | "strained"` and `diagnosis_tension_note?: string`. Semantics defined for each value. Explicitly stated: these do not affect pipeline routing in V4. They appear in V3PipelineResult for evaluation, and in Phase 3 eval they are used to diagnose synthesis quality. They do not replace selectDiagnosis.

### Change 8 — Implementation sequence revised
Previous sequence: model upgrades first (Phase 1: model upgrade, Phase 2: synthesis, etc.). Revised sequence:
1. Rollout flag scaffolding (no models, no new stage)
2. synthesiseArgument + brief integration (V3 models)
3. Side-by-side evaluation (structural isolation)
4. Writer model upgrade
5. Critic upgrade + diagnostic_coherence
6. Reconstruction guidance
7. Send gate formula (gated)

Rationale: separate structural quality gains from model quality gains; evaluate whether the new synthesis structure itself improves output before models muddy the signal.

### Change 9 — founder_stop_power added to evaluation
New human-eval rubric dimension defined on a 1–5 scale. Rubric distinguishes: MUST READ (5) → KEEPS READING (4) → READS POLITELY (3) → SKIMS (2) → DISCARDS (1). Added to: evaluation plan success metrics table, V3 vs V4 comparison criteria table, decision gate criteria for Phase 3 → 4 transition, golden test assertions. Phase 3 eval explicitly uses this as the primary decision metric.

### Change 10 — Send gate formula changes deferred
Previous draft implied formula updates would happen in Phase 3. Revised so send gate formula changes happen only in Phase 7, gated on: ≥5 fixture runs, diagnostic_coherence mean 2.0–4.5, correlation with founder_stop_power rubric (r ≥ 0.4), no false-pass case. Temporary behavior explicitly defined: diagnostic_coherence participates in `overall_pass` (via criterion 1) but not quality score formula during Phases 5–6.

### Additional changes incorporated
- Design goals updated: "make the memo feel inevitable, not merely well-written", "reduce hidden reasoning burden on the writer", "preserve comparability between V3 and V4 outputs during rollout"
- Non-goals updated: "no uncontrolled proliferation of AI stages", "no replacement of deterministic diagnosis selection in V4", "no changes that prevent side-by-side V3 vs V4 evaluation"
- ArgumentSynthesis schema updated to match provided shape with `hook_strategy`, `diagnosis_fit`, `diagnosis_tension_note`, `distinctness_check`
- Synthesis prompt rules tightened: thesis must state both elements; mechanisms must be materially distinct; prefer contradictions, bottlenecks, and demand-conversion failures over vague abstractions; if evidence supports only a weaker claim, make the weaker claim
- V3 vs V4 comparison criteria table added to evaluation section
- FM-7 (no comparability infrastructure) added to failure modes section

---

## Appendix: Files Summary

### New files
| File | Purpose |
|------|---------|
| `src/intelligence-v3/memo/synthesise-argument.ts` | New AI stage (V4-M2a) |
| `src/intelligence-v3/types/argument-synthesis.ts` | ArgumentSynthesis, HookStrategy, ArgumentStep, MechanismNarrative types |
| `src/intelligence-v3/__tests__/synthesise-argument.test.ts` | Unit tests (≥ 25) |
| `src/intelligence-v3/__tests__/golden/trigger-dev-v4.test.ts` | Golden test (Phase 4) |
| `src/intelligence-v3/__tests__/golden/omnea-v4.test.ts` | Golden test (Phase 4) |
| `docs/specs/v4-001-memo-intelligence.md` | This document |

### Modified files
| File | Phase | Change |
|------|-------|--------|
| `src/intelligence-v3/pipeline/run-v3-pipeline.ts` | 1, 2 | Flag, branch, synthesis stage, result fields |
| `src/intelligence-v3/memo/build-memo-brief.ts` | 2 | Consume ArgumentSynthesis; hook_strategy integration |
| `src/intelligence-v3/types/memo-brief.ts` | 2 | Add synthesised_thesis?, mechanism_narratives?, argument_skeleton?, hook_strategy? |
| `src/intelligence-v3/memo/write-memo.ts` | 2, 4 | User prompt V4 additions; Phase 4 model upgrade |
| `src/intelligence-v3/memo/criticise-memo.ts` | 5, 6 | Phase 5 model upgrade + diagnostic_coherence; Phase 6 reconstruction_guidance |
| `src/intelligence-v3/types/memo-critic.ts` | 5, 6 | diagnostic_coherence dimension; SectionReconstruction; reconstruction_guidance? |
| `src/intelligence-v3/memo/run-send-gate.ts` | 7 | Quality score formula (5-dim, gated) |
| `src/intelligence-v3/__tests__/criticise-memo.test.ts` | 5, 6 | Updated mock shapes + new dimension tests |
| `src/intelligence-v3/__tests__/run-send-gate.test.ts` | 7 | Updated quality score formula tests |
| `src/intelligence-v3/__tests__/run-v3-pipeline.test.ts` | 1, 2 | Flag tests, synthesis injection, version field |
