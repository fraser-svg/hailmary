/**
 * Evidence Pack Types — V3 Memo Layer
 * Spec: docs/specs/intelligence-engine-v3/003_evidence_pack_spec.md
 *
 * The EvidencePack is the curated, memo-ready evidence layer.
 * Built after V2 reasoning (stage V3-M1). Selects 8–15 highest-salience
 * evidence records from the Dossier and assigns each a memo role.
 *
 * The memo stages (V3-M3 through V3-M5) may ONLY use evidence from this pack.
 */

import type { SourceTier } from "./research-corpus";

/**
 * The function a piece of evidence serves in the memo argument.
 * A record may hold multiple roles simultaneously.
 */
export type MemoRole =
  | "hook_anchor"            // Used in Observation section; must be specific and striking
  | "diagnosis_support"      // Supports the primary diagnosis statement
  | "mechanism_illustration" // Illustrates a specific causal mechanism
  | "counter_narrative"      // Shows gap between company claim and customer/market reality
  | "specificity_anchor"     // Makes a memo section non-generic (company-specific fact)
  | "intervention_evidence"; // Supports the intervention recommendation

/** Scores assigned to each evidence record during pack construction */
export interface PackScore {
  commercial_salience: 0 | 1 | 2 | 3;   // How relevant to the diagnosis (0–3)
  specificity: 0 | 1 | 2 | 3;           // How company-specific vs generic (0–3)
  customer_voice: 0 | 1 | 2 | 3;        // Customer/market vs company-controlled (0–3)
  recency: 0 | 1;                        // ≤18 months old = 1, older = 0
}

/** A single scored, annotated evidence record selected for the memo */
export interface EvidencePackRecord {
  // Passthrough from Dossier evidence record
  evidence_id: string;
  source_id: string;
  source_tier: SourceTier;
  evidence_type: string;
  excerpt: string;              // Verbatim — must be exact substring of source
  summary: string;
  confidence: "low" | "medium" | "high";
  is_inferred: boolean;
  tags: string[];

  // V3 scoring (added during EvidencePack build)
  scores: PackScore;
  total_score: number;          // Sum of all score dimensions (max: 10)
  memo_roles: MemoRole[];
  is_hook_eligible: boolean;
  inclusion_reason: string;     // Why this record was selected
}

/** Pack-level quality assessment */
export interface PackQuality {
  total_records: number;
  hook_candidate_count: number;
  diagnosis_support_count: number;
  counter_narrative_count: number;
  specificity_anchor_count: number;
  average_total_score: number;
  coverage_assessment: "strong" | "adequate" | "weak" | "insufficient";
}

/**
 * EvidencePack — the curated evidence artifact for memo generation.
 * Produced by buildEvidencePack(). Consumed by adjudicateDiagnosis() and buildMemoBrief().
 */
export interface EvidencePack {
  pack_id: string;              // "pack_<company_id>_<timestamp>"
  company_id: string;
  built_at: string;
  diagnosis_id: string;         // Links to the V2 Diagnosis this pack was built for

  records: EvidencePackRecord[];
  hook_candidates: EvidencePackRecord[];   // Subset of records where is_hook_eligible = true

  pack_quality: PackQuality;
}
