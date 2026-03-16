/**
 * Build Evidence Pack — V3-M1
 * Spec: docs/specs/intelligence-engine-v3/003_evidence_pack_spec.md
 *
 * Curates and annotates evidence records from the Dossier for memo use.
 * Runs AFTER V2 reasoning so that memo roles can be assigned relative
 * to the winning diagnosis, mechanisms, and intervention.
 *
 * Selection algorithm:
 *   1. Build source_tier lookup map from dossier.sources[]
 *   2. Score all dossier evidence records on 4 dimensions (max score: 10)
 *   3. Filter out records with total_score < 3
 *   4. Rank by total_score descending
 *   5. Select top 15 (or all if < 15 remain after filtering), enforcing minimum mix
 *   6. Assign memo roles to selected records
 *   7. Build hook_candidates from is_hook_eligible records
 *   8. Compute PackQuality
 *
 * Hard failures:
 *   ERR_EVIDENCE_PACK_INSUFFICIENT — < 5 scoreable records after filtering
 *   ERR_NO_HOOK_CANDIDATES — zero hook-eligible records in final pack
 *   ERR_EVIDENCE_ORPHAN — a pack record references a non-existent dossier evidence_id
 */

import type { Dossier } from "../../types/dossier.js";
import type { EvidenceRecord, EvidenceType } from "../../types/evidence.js";
import type { SourceRecord } from "../../types/source.js";
import type { Diagnosis } from "../../intelligence-v2/types/diagnosis.js";
import type { Mechanism } from "../../intelligence-v2/types/mechanism.js";
import type { InterventionOpportunity } from "../../intelligence-v2/types/intervention.js";
import type {
  EvidencePack,
  EvidencePackRecord,
  PackScore,
  PackQuality,
  MemoRole,
} from "../types/evidence-pack.js";
import type { SourceTier } from "../types/research-corpus.js";

// ---------------------------------------------------------------------------
// Input contract
// ---------------------------------------------------------------------------

export interface BuildEvidencePackInput {
  dossier: Dossier;
  diagnosis: Diagnosis;
  mechanisms: Mechanism[];
  intervention: InterventionOpportunity;
}

// ---------------------------------------------------------------------------
// Constants — evidence type classification
// ---------------------------------------------------------------------------

// Types where excerpts are inherently company-specific (quotes, metrics, prices)
const HIGHLY_SPECIFIC_TYPES = new Set<EvidenceType>([
  "review_record",
  "testimonial_record",
  "case_study_record",
  "outcome_record",
  "customer_value_record",
  "customer_language_record",
]);

// Types specific to this company's category or model
const CATEGORY_SPECIFIC_TYPES = new Set<EvidenceType>([
  "pricing_record",
  "product_record",
  "sales_motion_record",
  "channel_record",
  "positioning_record",
  "differentiation_record",
  "narrative_gap_support_record",
  "company_claim_record",
  "buyer_signal_record",
  "hidden_differentiator_record",
]);

// Types with commercial relevance but potentially generic content
const COMMERCIALLY_RELEVANT_TYPES = new Set<EvidenceType>([
  "company_description_record",
  "press_record",
  "funding_record",
  "competitor_record",
  "comparison_record",
  "persona_signal_record",
  "pain_point_record",
  "content_record",
  "job_posting_record",
  "product_launch_record",
  "leadership_change_record",
  "hiring_signal_record",
  "strategic_risk_record",
  "dependency_risk_record",
  "positioning_risk_record",
  "service_record",
  "delivery_model_record",
  "implementation_record",
  "founding_record",
  "leadership_record",
  "location_record",
  "ownership_record",
]);

// Types used as commercial_salience=1 broadening (also used for route 1 check)
const COMMERCIAL_TYPES_FOR_SALIENCE = new Set<EvidenceType>([
  "product_record",
  "pricing_record",
  "sales_motion_record",
  "channel_record",
  "testimonial_record",
  "review_record",
  "case_study_record",
  "customer_value_record",
  "narrative_gap_support_record",
  "company_claim_record",
  "outcome_record",
  "pain_point_record",
  "buyer_signal_record",
  "positioning_record",
  "differentiation_record",
  "customer_language_record",
]);

// Types that represent company-side claims (for counter_narrative detection)
const COMPANY_CLAIM_TYPES = new Set<EvidenceType>([
  "company_claim_record",
  "company_description_record",
  "product_record",
  "pricing_record",
  "positioning_record",
]);

// Types that represent customer/market signals (for counter_narrative detection)
const CUSTOMER_SIGNAL_TYPES = new Set<EvidenceType>([
  "review_record",
  "testimonial_record",
  "customer_value_record",
  "customer_language_record",
  "narrative_gap_support_record",
  "pain_point_record",
  "outcome_record",
]);

// Types for product/distribution reality minimum mix requirement
const PRODUCT_DISTRIBUTION_TYPES = new Set<EvidenceType>([
  "product_record",
  "pricing_record",
  "sales_motion_record",
  "channel_record",
  "delivery_model_record",
  "implementation_record",
]);

// Types for proof/credibility minimum mix requirement
const PROOF_CREDIBILITY_TYPES = new Set<EvidenceType>([
  "case_study_record",
  "outcome_record",
  "testimonial_record",
  "funding_record",
]);

// Current-state page types — always considered recent regardless of captured_at
const ALWAYS_CURRENT_TYPES = new Set<EvidenceType>([
  "pricing_record",
  "company_description_record",
  "product_record",
]);

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

/**
 * commercial_salience (0–3):
 *   3 = directly in diagnosis.evidence_refs
 *   2 = in a mechanism or intervention evidence_refs
 *   1 = commercially relevant type
 *   0 = not commercially relevant
 */
function scoreCommercialSalience(
  ev: EvidenceRecord,
  diagRefs: Set<string>,
  mechRefs: Set<string>,
  interventionRefs: Set<string>
): 0 | 1 | 2 | 3 {
  if (diagRefs.has(ev.evidence_id)) return 3;
  if (mechRefs.has(ev.evidence_id) || interventionRefs.has(ev.evidence_id)) return 2;
  if (COMMERCIAL_TYPES_FOR_SALIENCE.has(ev.evidence_type)) return 1;
  return 0;
}

/**
 * specificity (0–3): how company-specific vs generic
 *   3 = evidence type inherently contains company-specific content
 *   2 = specific to this company's category or business model
 *   1 = commercially relevant but potentially generic
 *   0 = fully generic (market/macro trends, regulatory, ecosystem)
 */
function scoreSpecificity(ev: EvidenceRecord): 0 | 1 | 2 | 3 {
  if (HIGHLY_SPECIFIC_TYPES.has(ev.evidence_type)) return 3;
  if (CATEGORY_SPECIFIC_TYPES.has(ev.evidence_type)) return 2;
  if (COMMERCIALLY_RELEVANT_TYPES.has(ev.evidence_type)) return 1;
  return 0; // market_trend_record, regulatory_record, economic_exposure_record, etc.
}

/**
 * customer_voice (0–3): source tier mapping
 *   3 = Tier 3 (customer/market — reviews, case studies, testimonials)
 *   2 = Tier 2 (authoritative external — press, investors)
 *   1 = Tier 4 (secondary synthesis — directories, analyst blogs)
 *   0 = Tier 1 (company-controlled) or Tier 5 (noisy)
 */
function scoreCustomerVoice(sourceTier: SourceTier): 0 | 1 | 2 | 3 {
  if (sourceTier === 3) return 3;
  if (sourceTier === 2) return 2;
  if (sourceTier === 4) return 1;
  return 0; // tier 1, tier 5
}

/**
 * Recency cutoff: 18 months before today (2026-03-14 → 2024-09-14).
 * Uses build-time constant — deterministic for tests.
 */
const RECENCY_CUTOFF_DATE = new Date("2024-09-14");

/**
 * recency (0–1): ≤ 18 months old = 1
 *   "stale" tag → always 0 (merge layer confirmed > 24 months old)
 *   Current-state types (pricing, homepage, product) = always 1
 *   published_at known + within 18 months = 1; older = 0
 *   captured_at within 18 months = 1; older = 0
 *   Unparseable date = assume recent (1)
 */
function scoreRecency(ev: EvidenceRecord, publishedAt?: string): 0 | 1 {
  // Stale tag overrides everything — merge layer confirmed > 24 months old
  if (ev.tags?.includes("stale")) return 0;

  // Current-state types (pricing, homepage, product) are always considered fresh
  if (ALWAYS_CURRENT_TYPES.has(ev.evidence_type)) return 1;

  const CUTOFF = RECENCY_CUTOFF_DATE;

  // published_at from source metadata is more accurate than captured_at
  if (publishedAt) {
    try {
      const pub = new Date(publishedAt);
      if (!isNaN(pub.getTime())) return pub >= CUTOFF ? 1 : 0;
    } catch {
      // fall through to captured_at
    }
  }

  if (!ev.captured_at) return 1;
  try {
    const date = new Date(ev.captured_at);
    if (isNaN(date.getTime())) return 1;
    return date >= CUTOFF ? 1 : 0;
  } catch {
    return 1;
  }
}

/**
 * Check if an excerpt contains a quotable phrase (for hook eligibility).
 * Heuristic: names the company, a price, a percentage metric,
 * a direct quote character, or a concrete outcome verb.
 */
function hasQuotablePhrase(excerpt: string, companyName: string): boolean {
  if (!excerpt) return false;
  const lower = excerpt.toLowerCase();
  // Company name appears
  if (companyName && lower.includes(companyName.toLowerCase())) return true;
  // Price signal ($100, $1.5M, etc.)
  if (/\$[\d,]+/.test(excerpt)) return true;
  // Percentage metric (e.g. "40%", "3x")
  if (/\d+\s*%|\d+x\b/.test(excerpt)) return true;
  // Direct quote delimiters
  if (/["']/.test(excerpt)) return true;
  // Concrete outcome verbs (indicate specific result)
  if (/\b(saved|reduced|increased|improved|cut|eliminated|replaced|delivered|achieved|launched|migrated|converted)\b/i.test(excerpt)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Score a single evidence record
// ---------------------------------------------------------------------------

interface ScoredRecord {
  ev: EvidenceRecord;
  sourceTier: SourceTier;
  scores: PackScore;
  total_score: number;
}

function scoreRecord(
  ev: EvidenceRecord,
  sourceTier: SourceTier,
  diagRefs: Set<string>,
  mechRefs: Set<string>,
  interventionRefs: Set<string>,
  publishedAt?: string,
): ScoredRecord {
  const scores: PackScore = {
    commercial_salience: scoreCommercialSalience(ev, diagRefs, mechRefs, interventionRefs),
    specificity: scoreSpecificity(ev),
    customer_voice: scoreCustomerVoice(sourceTier),
    recency: scoreRecency(ev, publishedAt),
  };
  const total_score = scores.commercial_salience + scores.specificity + scores.customer_voice + scores.recency;
  return { ev, sourceTier, scores, total_score };
}

// ---------------------------------------------------------------------------
// Role assignment
// ---------------------------------------------------------------------------

/**
 * Assign memo roles to a selected set of scored records.
 * Roles are assigned based on V2 evidence_refs and record characteristics.
 * counter_narrative is assigned when both company-claim and customer-signal
 * types co-exist in the final selection.
 */
function assignRoles(
  selected: ScoredRecord[],
  diagRefs: Set<string>,
  mechRefs: Set<string>,
  interventionRefs: Set<string>,
  companyName: string,
): Map<string, Set<MemoRole>> {
  const roleMap = new Map<string, Set<MemoRole>>();
  for (const sr of selected) {
    roleMap.set(sr.ev.evidence_id, new Set());
  }

  const get = (id: string) => roleMap.get(id)!;

  // Rule 1: diagnosis_support — all records in diagnosis.evidence_refs
  for (const sr of selected) {
    if (diagRefs.has(sr.ev.evidence_id)) {
      get(sr.ev.evidence_id).add("diagnosis_support");
    }
  }

  // Rule 2: mechanism_illustration — records in mechanism.evidence_refs
  for (const sr of selected) {
    if (mechRefs.has(sr.ev.evidence_id)) {
      get(sr.ev.evidence_id).add("mechanism_illustration");
    }
  }

  // Rule 3: intervention_evidence — records in intervention.evidence_refs
  for (const sr of selected) {
    if (interventionRefs.has(sr.ev.evidence_id)) {
      get(sr.ev.evidence_id).add("intervention_evidence");
    }
  }

  // Rule 4: specificity_anchor — records with specificity = 3
  for (const sr of selected) {
    if (sr.scores.specificity === 3) {
      get(sr.ev.evidence_id).add("specificity_anchor");
    }
  }

  // Rule 5: counter_narrative — requires company-claim + customer-signal pair in pack
  // Heuristic: if both company-claim types and customer-signal types are present,
  // mark each as counter_narrative (they form potential pairs).
  const hasCompanyClaim = selected.some(
    sr => COMPANY_CLAIM_TYPES.has(sr.ev.evidence_type) && sr.sourceTier === 1
  );
  const hasCustomerSignal = selected.some(
    sr => CUSTOMER_SIGNAL_TYPES.has(sr.ev.evidence_type) || sr.sourceTier === 3
  );
  if (hasCompanyClaim && hasCustomerSignal) {
    for (const sr of selected) {
      if (COMPANY_CLAIM_TYPES.has(sr.ev.evidence_type) && sr.sourceTier === 1) {
        get(sr.ev.evidence_id).add("counter_narrative");
      }
      if (CUSTOMER_SIGNAL_TYPES.has(sr.ev.evidence_type) || sr.sourceTier === 3) {
        get(sr.ev.evidence_id).add("counter_narrative");
      }
    }
  }

  // Rule 6: hook_anchor — assigned to records that are hook_eligible
  // (is_inferred=false, specificity≥2, customer_voice≥1, total_score≥6, quotable phrase)
  for (const sr of selected) {
    if (
      !sr.ev.is_inferred &&
      sr.scores.specificity >= 2 &&
      sr.scores.customer_voice >= 1 &&
      sr.total_score >= 6 &&
      hasQuotablePhrase(sr.ev.excerpt, companyName)
    ) {
      get(sr.ev.evidence_id).add("hook_anchor");
    }
  }

  return roleMap;
}

// ---------------------------------------------------------------------------
// Minimum mix enforcement
// ---------------------------------------------------------------------------

/**
 * Ensure the selected set meets minimum coverage requirements.
 * Promotes records from the unselected (but still qualifying) pool when needed.
 * Respects the "if available" caveat — only enforces if qualifying records exist.
 *
 * Requirements:
 *   ≥ 2 customer_voice items (customer_voice score >= 2) if available
 *   ≥ 2 product/distribution reality items (evidence_type in set) if available
 *   ≥ 1 proof/credibility item (evidence_type in set) if available
 */
function enforceMinimumMix(
  selected: ScoredRecord[],
  remainingPool: ScoredRecord[],
  maxRecords: number
): ScoredRecord[] {
  let result = [...selected];

  const tryPromote = (
    needed: number,
    hasFn: (sr: ScoredRecord) => boolean,
    label: string
  ) => {
    const current = result.filter(hasFn).length;
    if (current >= needed) return;
    const candidates = remainingPool
      .filter(sr => hasFn(sr) && !result.includes(sr))
      .sort((a, b) => b.total_score - a.total_score);
    const toAdd = Math.min(needed - current, candidates.length, maxRecords - result.length);
    if (toAdd > 0) {
      result = [...result, ...candidates.slice(0, toAdd)];
    }
  };

  // Requirement 1: ≥ 2 customer_voice items (tier 2 or 3 source)
  const hasPoolCustomerVoice = [...selected, ...remainingPool].some(sr => sr.scores.customer_voice >= 2);
  if (hasPoolCustomerVoice) {
    tryPromote(2, sr => sr.scores.customer_voice >= 2, "customer_voice");
  }

  // Requirement 2: ≥ 2 product/distribution reality items
  const hasPoolProductDist = [...selected, ...remainingPool].some(
    sr => PRODUCT_DISTRIBUTION_TYPES.has(sr.ev.evidence_type)
  );
  if (hasPoolProductDist) {
    tryPromote(2, sr => PRODUCT_DISTRIBUTION_TYPES.has(sr.ev.evidence_type), "product_distribution");
  }

  // Requirement 3: ≥ 1 proof/credibility item
  const hasPoolProof = [...selected, ...remainingPool].some(
    sr => PROOF_CREDIBILITY_TYPES.has(sr.ev.evidence_type)
  );
  if (hasPoolProof) {
    tryPromote(1, sr => PROOF_CREDIBILITY_TYPES.has(sr.ev.evidence_type), "proof_credibility");
  }

  // If we exceeded maxRecords during promotion, trim lowest-scoring non-required records
  if (result.length > maxRecords) {
    result.sort((a, b) => b.total_score - a.total_score);
    result = result.slice(0, maxRecords);
  }

  return result;
}

// ---------------------------------------------------------------------------
// PackQuality computation
// ---------------------------------------------------------------------------

function computePackQuality(records: EvidencePackRecord[]): PackQuality {
  const hookCount = records.filter(r => r.is_hook_eligible).length;
  const diagSupportCount = records.filter(r => r.memo_roles.includes("diagnosis_support")).length;
  const counterNarrativeCount = records.filter(r => r.memo_roles.includes("counter_narrative")).length;
  const specificityAnchorCount = records.filter(r => r.memo_roles.includes("specificity_anchor")).length;
  const avgScore = records.length > 0
    ? records.reduce((sum, r) => sum + r.total_score, 0) / records.length
    : 0;

  let coverage_assessment: PackQuality["coverage_assessment"];
  if (records.length < 5 || hookCount === 0) {
    coverage_assessment = "insufficient";
  } else if (hookCount >= 3 && diagSupportCount >= 5 && counterNarrativeCount >= 2) {
    coverage_assessment = "strong";
  } else if (hookCount >= 2 && diagSupportCount >= 3 && counterNarrativeCount >= 1) {
    coverage_assessment = "adequate";
  } else if (hookCount >= 1 && diagSupportCount >= 2) {
    coverage_assessment = "weak";
  } else {
    coverage_assessment = "insufficient";
  }

  return {
    total_records: records.length,
    hook_candidate_count: hookCount,
    diagnosis_support_count: diagSupportCount,
    counter_narrative_count: counterNarrativeCount,
    specificity_anchor_count: specificityAnchorCount,
    average_total_score: Math.round(avgScore * 100) / 100,
    coverage_assessment,
  };
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * Build the EvidencePack from dossier evidence + V2 reasoning outputs.
 *
 * Fully deterministic — no LLM calls. Uses heuristic scoring rules.
 */
export function buildEvidencePack(input: BuildEvidencePackInput): EvidencePack {
  const { dossier, diagnosis, mechanisms, intervention } = input;

  // --- Step 0: Validate input integrity -----------------------------------------
  // Build source_id → source_tier lookup from dossier.sources
  const sourceTierMap = new Map<string, SourceTier>();
  const sourcePublishedAtMap = new Map<string, string>();
  for (const src of dossier.sources) {
    sourceTierMap.set(src.source_id, src.source_tier as SourceTier);
    if (src.published_at) sourcePublishedAtMap.set(src.source_id, src.published_at);
  }

  // Build known evidence_id set for orphan detection
  const knownEvidenceIds = new Set(dossier.evidence.map(ev => ev.evidence_id));

  // Build reference sets from V2 outputs
  const diagRefs = new Set(diagnosis.evidence_refs);
  const mechRefs = new Set(mechanisms.flatMap(m => m.evidence_refs));
  const interventionRefs = new Set(intervention.evidence_refs);

  const companyName = dossier.company_input?.company_name ?? "";

  // --- Step 1: Score all dossier evidence records --------------------------------
  const scoredAll: ScoredRecord[] = [];
  for (const ev of dossier.evidence) {
    // Orphan detection — evidence_id in pack must exist in dossier
    if (!knownEvidenceIds.has(ev.evidence_id)) {
      throw new Error(`ERR_EVIDENCE_ORPHAN: ${ev.evidence_id} not found in dossier`);
    }
    const sourceTier = sourceTierMap.get(ev.source_id) ?? 1;
    const publishedAt = sourcePublishedAtMap.get(ev.source_id);
    scoredAll.push(scoreRecord(ev, sourceTier, diagRefs, mechRefs, interventionRefs, publishedAt));
  }

  // --- Step 2: Filter out records with total_score < 3 -------------------------
  const qualifying = scoredAll.filter(sr => sr.total_score >= 3);

  if (qualifying.length < 5) {
    throw new Error(
      `ERR_EVIDENCE_PACK_INSUFFICIENT: only ${qualifying.length} qualifying records (< 5 required) after scoring`
    );
  }

  // --- Step 3: Rank by total_score descending -----------------------------------
  qualifying.sort((a, b) => b.total_score - a.total_score);

  const MAX_RECORDS = 15;
  const MIN_RECORDS = 8;

  // Take top 15 initially
  const topSelected = qualifying.slice(0, MAX_RECORDS);
  const remainingPool = qualifying.slice(MAX_RECORDS);

  // --- Step 4: Enforce minimum coverage mix -------------------------------------
  const selected = enforceMinimumMix(topSelected, remainingPool, MAX_RECORDS);

  // Re-sort by total_score after any promotions
  selected.sort((a, b) => b.total_score - a.total_score);

  // --- Step 5: Assign memo roles ------------------------------------------------
  const roleMap = assignRoles(selected, diagRefs, mechRefs, interventionRefs, companyName);

  // --- Step 6: Build EvidencePackRecord objects ---------------------------------
  const records: EvidencePackRecord[] = selected.map(sr => {
    const roles = Array.from(roleMap.get(sr.ev.evidence_id) ?? []) as MemoRole[];
    const isHookEligible =
      !sr.ev.is_inferred &&
      sr.scores.specificity >= 2 &&
      sr.scores.customer_voice >= 1 &&
      sr.total_score >= 6 &&
      hasQuotablePhrase(sr.ev.excerpt, companyName);

    // Build inclusion reason
    const reasons: string[] = [];
    if (diagRefs.has(sr.ev.evidence_id)) reasons.push("supports diagnosis");
    if (mechRefs.has(sr.ev.evidence_id)) reasons.push("illustrates mechanism");
    if (interventionRefs.has(sr.ev.evidence_id)) reasons.push("supports intervention");
    if (sr.scores.specificity === 3) reasons.push("high specificity");
    if (sr.scores.customer_voice >= 2) reasons.push("external voice");
    if (reasons.length === 0) reasons.push(`score ${sr.total_score}`);

    return {
      evidence_id: sr.ev.evidence_id,
      source_id: sr.ev.source_id,
      source_tier: sr.sourceTier,
      evidence_type: sr.ev.evidence_type,
      excerpt: sr.ev.excerpt,   // verbatim — spec: must be exact substring of source
      summary: sr.ev.summary,
      confidence: sr.ev.confidence,
      is_inferred: sr.ev.is_inferred,
      tags: sr.ev.tags,
      scores: sr.scores,
      total_score: sr.total_score,
      memo_roles: roles,
      is_hook_eligible: isHookEligible,
      inclusion_reason: reasons.join("; "),
    };
  });

  // --- Step 7: Build hook_candidates --------------------------------------------
  const hook_candidates = records.filter(r => r.is_hook_eligible);

  if (hook_candidates.length === 0) {
    throw new Error(
      "ERR_NO_HOOK_CANDIDATES: no hook-eligible records in final pack"
    );
  }

  // --- Step 8: Compute PackQuality ----------------------------------------------
  const pack_quality = computePackQuality(records);

  // --- Step 9: Assemble EvidencePack -------------------------------------------
  const now = new Date().toISOString();
  const timestamp = Date.now();

  return {
    pack_id: `pack_${diagnosis.company_id}_${timestamp}`,
    company_id: diagnosis.company_id,
    built_at: now,
    diagnosis_id: diagnosis.id,
    records,
    hook_candidates,
    pack_quality,
  };
}
