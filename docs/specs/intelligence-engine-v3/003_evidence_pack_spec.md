# Spec 003 — Evidence Pack Spec

## Purpose

Define how evidence records from the Dossier are selected, scored, ranked, and annotated for use in memo generation. The EvidencePack is the curated, memo-ready evidence layer — the only evidence source the memo stages may draw from.

---

## Scope

The Dossier produced by CorpusToDossierAdapter may contain 20–60 evidence records. Most are not suitable for a founder-facing memo. The EvidencePack selects the 8–15 highest-salience records, scores each on four dimensions, and assigns each a **memo role** that tells the memo writer what function this piece of evidence serves in the argument.

The EvidencePack is built **after V2 reasoning** (stage V3-M1), because memo roles are assigned relative to the V2 diagnosis, mechanisms, and intervention. Evidence that supports the winning diagnosis receives different roles than evidence from competing archetypes.

---

## Inputs

```typescript
interface BuildEvidencePackInput {
  dossier: Dossier;
  diagnosis: Diagnosis;
  mechanisms: Mechanism[];
  intervention: InterventionOpportunity;
}
```

---

## Output

```typescript
interface EvidencePack {
  pack_id: string;              // "pack_<company_id>_<timestamp>"
  company_id: string;
  built_at: string;
  diagnosis_id: string;         // Links to Diagnosis

  records: EvidencePackRecord[];
  hook_candidates: EvidencePackRecord[];   // Records eligible to be the memo opening hook

  pack_quality: PackQuality;
}
```

---

## EvidencePackRecord

```typescript
interface EvidencePackRecord {
  // From dossier evidence record (passthrough)
  evidence_id: string;
  source_id: string;
  source_tier: SourceTier;      // 1–5 from V1 source tier system
  evidence_type: string;
  excerpt: string;              // Original text — must be an exact substring of source
  summary: string;
  confidence: "low" | "medium" | "high";
  is_inferred: boolean;
  tags: string[];

  // V3 scoring (added during EvidencePack build)
  scores: PackScore;
  total_score: number;          // Sum of all score dimensions (max: 10)
  memo_roles: MemoRole[];       // One or more roles this record can serve in the memo
  is_hook_eligible: boolean;    // True if record meets hook criteria (see below)
  inclusion_reason: string;     // Human-readable explanation of why this record was selected
}
```

---

## Scoring Dimensions

Each record is scored on four dimensions. Scores are integers; total_score = sum (max 10).

### 1. commercial_salience (0–3)
How directly relevant is this evidence to the diagnosis?

| Score | Meaning |
|-------|---------|
| 3 | Directly supports or illustrates the primary diagnosis |
| 2 | Relevant to a mechanism or the intervention |
| 1 | Related to the commercial picture but not central |
| 0 | Not commercially relevant to this diagnosis |

### 2. specificity (0–3)
Is this evidence company-specific or could it describe any SaaS company?

| Score | Meaning |
|-------|---------|
| 3 | Highly specific — contains a named product, metric, customer quote, or price |
| 2 | Specific to this company's category or model |
| 1 | Somewhat generic — describes a common pattern |
| 0 | Fully generic — could describe any company |

### 3. customer_voice (0–3)
Does this come from customers/market, or from the company itself?

| Score | Meaning |
|-------|---------|
| 3 | Direct customer quote, review, or case study (Tier 3 source) |
| 2 | Third-party analysis or press mention (Tier 2 source) |
| 1 | Company-stated with some external validation |
| 0 | Company-controlled source only (Tier 1) |

### 4. recency (0–1)
Is this evidence recent (≤ 18 months)?

| Score | Meaning |
|-------|---------|
| 1 | Evidence is ≤ 18 months old, or undated but from a current-state page (pricing, homepage) |
| 0 | Evidence is > 18 months old |

---

## Memo Role Taxonomy

Each selected record is assigned one or more memo roles that constrain how the memo writer may use it.

```typescript
type MemoRole =
  | "hook_anchor"            // Used in the Observation section opening; must be specific and striking
  | "diagnosis_support"      // Supports the primary diagnosis statement
  | "mechanism_illustration" // Illustrates a specific causal mechanism
  | "counter_narrative"      // Shows gap between company claim and customer/market reality
  | "specificity_anchor"     // Makes a memo section non-generic (a company-specific fact)
  | "intervention_evidence"; // Supports the intervention recommendation
```

Role assignment rules:
- A record may hold multiple roles simultaneously
- `hook_anchor`: requires `is_inferred: false`, `specificity ≥ 2`, `total_score ≥ 6`
- `counter_narrative`: requires a company-claim evidence record AND a customer-signal evidence record covering the same topic
- `diagnosis_support`: assigned to all records in `diagnosis.evidence_refs`
- `mechanism_illustration`: assigned to records in `mechanism.evidence_refs` for each mechanism
- `intervention_evidence`: assigned to records in `intervention.evidence_refs`
- `specificity_anchor`: assigned to any record with `specificity = 3`

---

## Selection Algorithm

1. Start with all evidence records from `dossier.evidence[]`
2. Score each record on all four dimensions
3. Filter out records with `total_score < 3` (too low signal for memo use)
4. Assign memo roles to remaining records
5. Rank by `total_score` descending
6. Select top 15 records (or all if < 15 remain after filtering)
7. Enforce minimum coverage requirements (see Acceptance Criteria)
8. Build `hook_candidates` from records where `is_hook_eligible = true`

---

## Hook Eligibility

A record is `hook_eligible` when all of the following are true:
- `is_inferred: false` (must be a real observation, not an inference)
- `specificity ≥ 2` (company-specific)
- `customer_voice ≥ 1` (not purely company-controlled)
- `total_score ≥ 6`
- `excerpt` contains a quotable phrase (at least one noun phrase that names the company, a product, a price, or a customer outcome)

---

## PackQuality

```typescript
interface PackQuality {
  total_records: number;
  hook_candidate_count: number;
  diagnosis_support_count: number;
  counter_narrative_count: number;
  specificity_anchor_count: number;
  average_total_score: number;         // Mean total_score across all records
  coverage_assessment: "strong" | "adequate" | "weak" | "insufficient";
}
```

Coverage assessment rules:
- `strong`: ≥ 3 hook candidates, ≥ 5 diagnosis_support, ≥ 2 counter_narrative
- `adequate`: ≥ 2 hook candidates, ≥ 3 diagnosis_support, ≥ 1 counter_narrative
- `weak`: ≥ 1 hook candidate, ≥ 2 diagnosis_support, 0 counter_narrative
- `insufficient`: < 5 total records, or 0 hook candidates

---

## Constraints

1. The memo stages (V3-M3 through V3-M5) may only reference evidence from the EvidencePack — not directly from the dossier
2. No evidence record with `confidence: "low"` and `is_inferred: true` may be assigned `hook_anchor` role
3. The EvidencePack must preserve the original `excerpt` text verbatim — no summarization
4. Counter-narrative pairs must reference both the company claim and the customer signal as separate records
5. `hook_candidates` is a strict subset of `records` (not a separate data pull)

---

## Acceptance Criteria

1. EvidencePack is produced for all V2 eval companies (Stripe, Trigger.dev, Omnea)
2. Each pack contains ≥ 5 records with `total_score ≥ 5`
3. Each pack contains ≥ 1 `hook_eligible` record
4. Memo roles are assigned consistently: every `diagnosis.evidence_ref` maps to at least one record with `diagnosis_support` role
5. `coverage_assessment` is not `insufficient` for any eval company with a full corpus
6. All `excerpt` values are exact substrings of their source record's content

---

## Hard Failure Conditions

| Condition | Error |
|-----------|-------|
| Total scoreable records (score ≥ 3) < 5 after scoring | `ERR_EVIDENCE_PACK_INSUFFICIENT` |
| Zero hook-eligible records | `ERR_NO_HOOK_CANDIDATES` |
| Any record in pack references a non-existent `evidence_id` from dossier | `ERR_EVIDENCE_ORPHAN` |
