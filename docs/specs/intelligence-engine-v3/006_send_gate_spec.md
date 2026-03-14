# Spec 006 — Send Gate Spec

## Purpose

Define the final binary gate that determines whether a memo is marked `ready_to_send`. The send gate is the last line of quality enforcement before a memo can be used for outreach.

---

## Scope

The send gate (V3-M6) runs after `criticiseMemo` completes and its output is final — no downstream stage can override it. The gate is fully deterministic; no LLM call.

The gate produces two outputs:
1. `result: "pass" | "fail"` — binary
2. `memo_quality_score: number (0–100)` — a continuous quality score used for ranking and logging

A `pass` result marks the memo as `ready_to_send`. A `fail` result produces a structured list of blocking reasons and classifies each as a hard failure (never overridable) or a conditional failure (human-review path defined).

---

## Inputs

```typescript
interface RunSendGateInput {
  memo: MarkdownMemo;
  criticResult: MemoCriticResult;
  adjudication: AdjudicationResult;
  evidencePack: EvidencePack;
}
```

---

## Output

```typescript
interface SendGateResult {
  gate_id: string;                    // "gate_<company_id>_<timestamp>"
  company_id: string;
  memo_id: string;
  evaluated_at: string;

  result: "pass" | "fail";
  memo_quality_score: number;         // 0–100 (see derivation below)

  // Populated on pass
  passed_at?: string;                 // ISO 8601 timestamp
  ready_to_send?: boolean;            // Always true if result = "pass"

  // Populated on fail
  blocking_reasons?: BlockingReason[];
  has_hard_failures: boolean;         // true if any blocking reason is a hard failure

  // Always present
  gate_summary: GateSummary;
  criteria_results: GateCriteriaResult[];
}
```

---

## Gate Criteria (All 6 Must Pass)

```typescript
interface GateCriteriaResult {
  criterion_id: GateCriterion;
  pass: boolean;
  failure_type?: "hard" | "conditional";
  observed_value: string | number | boolean;
  threshold: string;
  notes?: string;
}
```

### Criterion 1 — Critic Overall Pass

```
criterion_id: "critic_overall_pass"
threshold: criticResult.overall_pass = true
failure_type: "hard" if genericity_test failed; "conditional" if only dimension score failures
```

The memo must have passed all 4 critic dimensions (≥ 3 each) AND the genericity test. A genericity test failure is always a hard failure. Dimension-only failures (e.g., CTA clarity = 2) are conditional — a human reviewer may override.

### Criterion 2 — Evidence Reference Count

```
criterion_id: "evidence_ref_count"
threshold: memo.evidence_ids.length >= 3
failure_type: "hard" if < 2; "conditional" if = 2
```

The memo must reference ≥ 3 evidence records from the EvidencePack. If < 2 evidence records are referenced, it is a hard failure (memo is essentially ungrounded). If exactly 2, it is conditional.

### Criterion 3 — Adjudication Not Aborted

```
criterion_id: "adjudication_not_aborted"
threshold: adjudication.adjudication_mode !== "abort"
failure_type: "hard"
```

An aborted adjudication must never reach the send gate. If one does, it is always a hard failure.

### Criterion 4 — No Banned Phrases

```
criterion_id: "no_banned_phrases"
threshold: zero banned phrases detected in memo.markdown
failure_type: "hard"
```

The gate runs its own banned phrase scan (not relying solely on critic Dimension 4). Pattern match against the full banned phrase list from Spec 005. Any match = hard failure.

### Criterion 5 — CTA Present and Singular

```
criterion_id: "cta_present_singular"
threshold: exactly one CTA section present; section word_count <= 50 words
failure_type: "conditional"
```

The `cta` section must exist in `memo.sections` and must not exceed 50 words (a CTA longer than 50 words is not a CTA — it is a paragraph with an embedded ask).

### Criterion 6 — Word Count in Range

```
criterion_id: "word_count_in_range"
threshold: memo.word_count >= 300 AND memo.word_count <= 850
failure_type: "hard" if > 850 or < 200; "conditional" if 200–299 or (700–850)
```

Hard limits (enforced at spec level):
- < 200 words: hard failure (not a memo — a paragraph)
- > 850 words: hard failure (exceeds hard max from Spec 005)

Conditional range:
- 200–299 words: conditional (short but may be acceptable for certain audiences)
- 700–850 words: conditional (above target but within hard max)

Target range: 500–700 words.

---

## Hard Failures (Never Overridable)

These conditions always result in `result: "fail"` with no human override path:

| Criterion | Hard Failure Condition |
|-----------|------------------------|
| `critic_overall_pass` | Genericity test failed |
| `evidence_ref_count` | `memo.evidence_ids.length < 2` |
| `adjudication_not_aborted` | `adjudication.adjudication_mode === "abort"` |
| `no_banned_phrases` | Any banned phrase detected |
| `word_count_in_range` | `word_count > 850` or `word_count < 200` |

---

## Conditional Failures (Human Override Path)

These conditions result in `result: "fail"` but a human reviewer may mark the memo `ready_to_send` manually:

| Criterion | Conditional Failure Condition |
|-----------|-------------------------------|
| `critic_overall_pass` | Dimension score(s) < 3 but genericity test passed |
| `evidence_ref_count` | Exactly 2 evidence references |
| `cta_present_singular` | CTA section > 50 words |
| `word_count_in_range` | 200–299 words or 700–850 words |

Human override implementation is out of scope for V3. The path is defined; the tooling is deferred.

---

## Memo Quality Score (0–100)

The `memo_quality_score` is a continuous measure used for logging, ranking, and future calibration. It does not determine `result` — a memo can score 65/100 and still fail the gate on a hard failure.

Score derivation:

```
Component weights:
  critic_dimensions    (4 × 5 points each)  = 40 points max
  evidence_ref_count                         = 20 points max
  word_count_target_range                    = 15 points max
  genericity_test                            = 15 points max
  founder_pushback_severity                  = 10 points max
  ─────────────────────────────────────────────────────────
  Total                                      = 100 points max
```

Detailed scoring:

**critic_dimensions (40 pts):**
Each dimension score (0–5) × 2 points = 0–10 per dimension × 4 = 0–40

**evidence_ref_count (20 pts):**
- ≥ 5 references: 20 pts
- 4 references: 15 pts
- 3 references: 10 pts
- 2 references: 5 pts
- < 2 references: 0 pts

**word_count_target_range (15 pts):**
- 500–700 words (target range): 15 pts
- 400–499 or 701–750 words: 10 pts
- 300–399 or 751–850 words: 5 pts
- Outside these ranges: 0 pts

**genericity_test (15 pts):**
- Pass: 15 pts
- Fail: 0 pts

**founder_pushback_severity (10 pts):**
- `severity = "low"`: 10 pts
- `severity = "medium"`: 5 pts
- `severity = "high"`: 0 pts

---

## GateSummary

```typescript
interface GateSummary {
  total_criteria: 6;
  criteria_passed: number;
  criteria_failed: number;
  hard_failures: number;
  conditional_failures: number;
  memo_quality_score: number;
  recommendation: string;   // Human-readable summary of gate outcome
}
```

Example recommendation strings:
- "Memo passed all 6 criteria with quality score 82/100. Ready to send."
- "Memo failed 1 criterion (evidence_ref_count: 2 references). Conditional failure — human review path available."
- "Memo failed hard criterion: genericity test. The memo's argument would apply to most SaaS companies. Revision required."

---

## Constraints

1. The gate is fully deterministic — no LLM call
2. `result = "pass"` requires all 6 criteria to pass; no partial pass
3. Hard failures cannot be overridden by any downstream system component
4. The `memo_quality_score` must be computed even when `result = "fail"` — it is useful for diagnostics
5. The gate must log all `blocking_reasons` with their `failure_type` for every failed run

---

## Acceptance Criteria

1. A memo that passes all 4 critic dimensions, genericity test, has ≥ 3 evidence references, no banned phrases, and is 500–700 words → `result: "pass"`, `memo_quality_score ≥ 70`
2. A memo containing the phrase "game-changing" → `result: "fail"`, hard failure on `no_banned_phrases`
3. A memo where genericity test failed → `result: "fail"`, hard failure, `has_hard_failures: true`
4. A memo with `adjudication.adjudication_mode = "abort"` that somehow reaches the gate → `result: "fail"`, hard failure on `adjudication_not_aborted`
5. A memo with exactly 2 evidence references → `result: "fail"`, conditional failure, `has_hard_failures: false`
6. `memo_quality_score` is always between 0 and 100 inclusive

---

## Hard Failure Conditions

| Condition | Error |
|-----------|-------|
| Adjudication mode = abort reaches send gate | `ERR_ADJUDICATION_ABORT_AT_GATE` |
| Any banned phrase in final memo | Hard failure; `result: "fail"` |
| Genericity test failed | Hard failure; `result: "fail"` |
| `word_count > 850` | Hard failure; `result: "fail"` |
| `evidence_ids.length < 2` | Hard failure; `result: "fail"` |
