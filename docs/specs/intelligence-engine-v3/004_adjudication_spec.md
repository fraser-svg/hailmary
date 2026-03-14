# Spec 004 — Diagnosis Adjudication Spec

## Purpose

Apply a confidence threshold before the pipeline commits to a specific diagnosis framing in the memo. Adjudication prevents the system from writing a confident, assertive memo on a weak or marginally-supported diagnosis. It also produces the epistemic framing instruction that the MemoBrief builder must use.

---

## Scope

Adjudication is stage V3-M2. It runs after `buildEvidencePack` and before `buildMemoBrief`. It is deterministic — no LLM call.

Adjudication does not change the diagnosis. It assesses how confidently the memo may assert that diagnosis and provides a recommended framing mode for the memo writer.

---

## Inputs

```typescript
interface AdjudicateDiagnosisInput {
  diagnosis: Diagnosis;                  // From V2-R5
  evidencePack: EvidencePack;            // From V3-M1
  patterns: Pattern[];                   // All V2 patterns (including competing archetypes)
  gtmAnalysis: GTMAnalysis;              // From V2-R2
}
```

---

## Output

```typescript
interface AdjudicationResult {
  result_id: string;                        // "adj_<company_id>_<timestamp>"
  company_id: string;
  adjudicated_at: string;

  adjudication_mode: AdjudicationMode;      // The key output
  diagnosis_id: string;                     // The diagnosis being adjudicated

  checks: AdjudicationChecks;              // The 4 check results
  recommended_memo_framing: MemoFraming;    // Passed directly to MemoBrief

  // Only populated when mode = "abort"
  adjudication_report?: AdjudicationReport;

  // Only populated when mode = "conditional" or "exploratory"
  confidence_caveats?: string[];            // Statements the memo may not assert as fact
}
```

---

## Adjudication Modes

```typescript
type AdjudicationMode =
  | "full_confidence"  // Proceed with assertive memo framing
  | "conditional"      // Proceed with hedged framing; some claims softened
  | "exploratory"      // Proceed with hypothesis-led framing; nothing asserted
  | "abort";           // Stop. Evidence is insufficient for any credible memo.
```

---

## The Four Checks

```typescript
interface AdjudicationChecks {
  diagnosis_confidence: DiagnosisConfidenceCheck;
  evidence_pack_coverage: EvidenceCoverageCheck;
  source_diversity: SourceDiversityCheck;
  competing_archetype_gap: ArchetypeGapCheck;
}
```

### Check 1 — Diagnosis Confidence

Reads `diagnosis.confidence` (from V2 scoring).

| V2 confidence | Points |
|---------------|--------|
| `"high"` | 3 |
| `"medium"` | 2 |
| `"low"` | 0 |

```typescript
interface DiagnosisConfidenceCheck {
  v2_confidence: "low" | "medium" | "high";
  points: number;
}
```

### Check 2 — Evidence Pack Coverage

Reads `evidencePack.pack_quality.coverage_assessment`.

| Coverage | Points |
|----------|--------|
| `"strong"` | 3 |
| `"adequate"` | 2 |
| `"weak"` | 1 |
| `"insufficient"` | 0 |

```typescript
interface EvidenceCoverageCheck {
  coverage_assessment: "strong" | "adequate" | "weak" | "insufficient";
  points: number;
}
```

### Check 3 — Source Diversity

Counts distinct `source_tier` values across EvidencePack records.
A pack sourced entirely from Tier 1 (company-controlled) cannot support confident diagnosis.

| Tier distribution | Points |
|-------------------|--------|
| ≥ 2 distinct tiers including at least one Tier 2 or Tier 3 | 2 |
| ≥ 2 distinct tiers, Tier 1 only + one other tier | 1 |
| Only Tier 1 sources | 0 |

```typescript
interface SourceDiversityCheck {
  distinct_tiers: number;
  has_tier2_or_3: boolean;
  points: number;
}
```

### Check 4 — Competing Archetype Gap

Measures margin between the winning diagnosis archetype score and the runner-up, using V2 pattern scoring data.

| Score gap | Points | Interpretation |
|-----------|--------|----------------|
| ≥ 4 points | 2 | Diagnosis is clear winner |
| 2–3 points | 1 | Probable diagnosis |
| ≤ 1 point | 0 | Contested — diagnosis could change with one more signal |

```typescript
interface ArchetypeGapCheck {
  winning_score: number;
  runner_up_score: number;
  gap: number;
  points: number;
}
```

---

## Mode Determination

Sum all 4 check points (max: 10). Map to adjudication mode:

| Total points | Mode |
|--------------|------|
| 8–10 | `full_confidence` |
| 5–7 | `conditional` |
| 3–4 | `exploratory` |
| 0–2 | `abort` |

**Override rules (applied after scoring):**
- If `evidence_pack_coverage = "insufficient"` → force `abort`, regardless of total points
- If `diagnosis.confidence = "low"` AND `source_diversity.points = 0` → force `abort`
- If `competing_archetype_gap.gap ≤ 1` → cap mode at `conditional` (never `full_confidence` on a contested diagnosis)

---

## Recommended Memo Framing

Based on adjudication mode, `buildMemoBrief` receives framing instructions:

```typescript
type MemoFraming =
  | "assertive"       // "This company has X problem" — used for full_confidence
  | "indicative"      // "The evidence points to X" — used for conditional
  | "hypothesis"      // "There are signs that X may be happening" — used for exploratory
  | "blocked";        // No memo — used for abort
```

| Mode | MemoFraming | What memo writer must do |
|------|-------------|--------------------------|
| `full_confidence` | `assertive` | State diagnosis as fact, grounded in evidence |
| `conditional` | `indicative` | Present diagnosis as strongly supported but not certain |
| `exploratory` | `hypothesis` | Frame as a hypothesis — memo must include what would confirm or deny it |
| `abort` | `blocked` | Do not build memo; surface AdjudicationReport instead |

---

## Confidence Caveats

When mode is `conditional` or `exploratory`, the adjudication result includes `confidence_caveats[]` — statements the memo writer must NOT assert as definitive fact. These are derived from the weakest-scoring checks.

Examples:
- `"Do not assert that pricing is directly causing churn — evidence is from company sources only"`
- `"The services-vs-SaaS distinction is plausible but not confirmed by customer voice"`

---

## AdjudicationReport (Abort Mode)

When mode = `abort`, the pipeline surfaces an `AdjudicationReport` instead of proceeding to memo generation. This is useful for diagnosing upstream research gaps.

```typescript
interface AdjudicationReport {
  company_id: string;
  generated_at: string;
  total_points: number;
  mode: "abort";
  blocking_reasons: string[];
  improvement_suggestions: string[];   // What additional research might unlock a viable memo
}
```

Example improvement suggestions:
- `"Fetch Trustpilot reviews to add Tier 3 customer voice evidence"`
- `"Resolve competing archetypes: services_disguised_as_saas vs narrative_distribution_mismatch are within 1 point"`
- `"Diagnosis confidence is 'low' — the evidence pool may not contain enough signals for V2 scoring"`

---

## Constraints

1. Adjudication is fully deterministic — no LLM call
2. The mode determination formula is fixed; it cannot be overridden by any downstream stage
3. The `confidence_caveats` list is binding — the memo critic must check compliance
4. If mode = `abort`, the pipeline must not proceed to `buildMemoBrief` under any condition

---

## Acceptance Criteria

1. Stripe (strong corpus, high-confidence V2 diagnosis) → `full_confidence`
2. A company with a manually degraded corpus (< 5 scoreable evidence records) → `abort`
3. A company with a contested diagnosis (archetype gap ≤ 1) → mode capped at `conditional`
4. AdjudicationReport is populated when mode = `abort`, with ≥ 1 improvement suggestion
5. `confidence_caveats` is non-empty for all `conditional` and `exploratory` runs

---

## Hard Failure Conditions

| Condition | Error |
|-----------|-------|
| `evidence_pack_coverage = "insufficient"` | Forces `abort` mode |
| `diagnosis.confidence = "low"` + `source_diversity.points = 0` | Forces `abort` mode |
| Mode = `abort` and pipeline attempts to proceed to `buildMemoBrief` | `ERR_ADJUDICATION_ABORT` |
