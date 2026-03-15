/**
 * Diagnosis Adjudication — V3-M2
 * Spec: docs/specs/intelligence-engine-v3/004_adjudication_spec.md
 *
 * Confidence gate before memo commitment. Fully deterministic — no LLM call.
 *
 * Four checks (max 10 points total):
 *   Check 1 — Diagnosis confidence        (0/2/3 pts)
 *   Check 2 — Evidence pack coverage      (0/1/2/3 pts)
 *   Check 3 — Source diversity            (0/1/2 pts)
 *   Check 4 — Competing archetype gap     (0/1/2 pts)
 *
 * Mode determination:
 *   8–10 pts → full_confidence
 *   5–7 pts  → conditional
 *   3–4 pts  → exploratory
 *   0–2 pts  → abort
 *
 * Override rules (applied after scoring):
 *   - evidence_pack_coverage = "insufficient" → force abort
 *   - diagnosis.confidence = "low" AND source_diversity.points = 0 → force abort
 *   - competing_archetype_gap.gap ≤ 1 AND mode = "full_confidence" → cap at conditional
 *
 * Errors:
 *   ERR_ADJUDICATION_ABORT — mode = abort; pipeline must not proceed to buildMemoBrief
 */

import type { Diagnosis } from "../../intelligence-v2/types/diagnosis.js";
import type { Pattern } from "../../intelligence-v2/types/pattern.js";
import type { EvidencePack } from "../types/evidence-pack.js";
import type {
  AdjudicationResult,
  AdjudicationChecks,
  DiagnosisConfidenceCheck,
  EvidenceCoverageCheck,
  SourceDiversityCheck,
  ArchetypeGapCheck,
  AdjudicationMode,
  MemoFraming,
  AdjudicationReport,
} from "../types/adjudication.js";

// ---------------------------------------------------------------------------
// Input contract
// ---------------------------------------------------------------------------

export interface AdjudicateDiagnosisInput {
  diagnosis: Diagnosis;
  evidencePack: EvidencePack;
  /**
   * All V2 patterns. Used to measure the gap between the winning archetype
   * score and the runner-up. Empty list → gap = 0 (maximally contested).
   * Note: spec also lists gtmAnalysis but all 4 checks can be resolved from
   * diagnosis + evidencePack + patterns alone.
   */
  patterns: Pattern[];
}

// ---------------------------------------------------------------------------
// Check 1 — Diagnosis confidence
// ---------------------------------------------------------------------------

function checkDiagnosisConfidence(diagnosis: Diagnosis): DiagnosisConfidenceCheck {
  const c = diagnosis.confidence;
  // high=3, medium=2, low=0 (not 1 — low confidence is a near-abort signal)
  const points: 0 | 2 | 3 = c === "high" ? 3 : c === "medium" ? 2 : 0;
  return { v2_confidence: c, points };
}

// ---------------------------------------------------------------------------
// Check 2 — Evidence pack coverage
// ---------------------------------------------------------------------------

function checkEvidenceCoverage(evidencePack: EvidencePack): EvidenceCoverageCheck {
  const ca = evidencePack.pack_quality.coverage_assessment;
  const pointsMap: Record<string, 0 | 1 | 2 | 3> = {
    strong: 3,
    adequate: 2,
    weak: 1,
    insufficient: 0,
  };
  const points = (pointsMap[ca] ?? 0) as 0 | 1 | 2 | 3;
  return { coverage_assessment: ca, points };
}

// ---------------------------------------------------------------------------
// Check 3 — Source diversity
// ---------------------------------------------------------------------------

/**
 * Counts distinct source_tier values across all pack records.
 * A pack sourced entirely from Tier 1 (company-controlled) cannot support
 * confident diagnosis — there is no independent corroboration.
 */
function checkSourceDiversity(evidencePack: EvidencePack): SourceDiversityCheck {
  const tiers = new Set(evidencePack.records.map(r => r.source_tier));
  const distinctTiers = tiers.size;
  const hasTier2Or3 = tiers.has(2) || tiers.has(3);

  let points: 0 | 1 | 2;
  if (distinctTiers >= 2 && hasTier2Or3) {
    // ≥2 distinct tiers including at least one authoritative external source
    points = 2;
  } else if (distinctTiers >= 2) {
    // ≥2 distinct tiers, but only Tier 1 + Tier 4/5 (weak external)
    points = 1;
  } else {
    // Single tier — almost certainly all company-controlled
    points = 0;
  }

  return { distinct_tiers: distinctTiers, has_tier2_or_3: hasTier2Or3, points };
}

// ---------------------------------------------------------------------------
// Check 4 — Competing archetype gap
// ---------------------------------------------------------------------------

/**
 * Measures margin between the winning archetype and the runner-up.
 * Uses pattern.weight as the score proxy per archetype.
 * Empty patterns list → gap = 0 (contested — no data to differentiate).
 */
function checkArchetypeGap(patterns: Pattern[]): ArchetypeGapCheck {
  if (patterns.length === 0) {
    // No pattern data means we cannot measure the gap.
    // Treat as maximally contested (gap = 0, points = 0).
    return { winning_score: 0, runner_up_score: 0, gap: 0, points: 0 };
  }

  // Group patterns by archetype, sum weights within each archetype
  const archetypeScores = new Map<string, number>();
  for (const p of patterns) {
    archetypeScores.set(p.archetype, (archetypeScores.get(p.archetype) ?? 0) + p.weight);
  }

  const sorted = Array.from(archetypeScores.values()).sort((a, b) => b - a);
  const winningScore = sorted[0] ?? 0;
  const runnerUpScore = sorted[1] ?? 0;
  const gap = winningScore - runnerUpScore;

  let points: 0 | 1 | 2;
  if (gap >= 4) {
    points = 2; // Clear winner — diagnosis unlikely to change with one more signal
  } else if (gap >= 2) {
    points = 1; // Probable diagnosis — strong but not definitive
  } else {
    points = 0; // Contested — one additional signal could flip the diagnosis
  }

  return { winning_score: winningScore, runner_up_score: runnerUpScore, gap, points };
}

// ---------------------------------------------------------------------------
// Mode determination
// ---------------------------------------------------------------------------

function pointsToMode(totalPoints: number): AdjudicationMode {
  if (totalPoints >= 8) return "full_confidence";
  if (totalPoints >= 5) return "conditional";
  if (totalPoints >= 3) return "exploratory";
  return "abort";
}

function modeToFraming(mode: AdjudicationMode): MemoFraming {
  const map: Record<AdjudicationMode, MemoFraming> = {
    full_confidence: "assertive",
    conditional: "indicative",
    exploratory: "hypothesis",
    abort: "blocked",
  };
  return map[mode];
}

// ---------------------------------------------------------------------------
// Confidence caveats (conditional / exploratory only)
// ---------------------------------------------------------------------------

/**
 * Derives binding statements the memo writer must NOT assert as definitive fact.
 * Generated from the weakest-scoring checks.
 */
function buildCaveats(checks: AdjudicationChecks): string[] {
  const caveats: string[] = [];

  // Weak diagnosis confidence
  if (checks.diagnosis_confidence.v2_confidence === "low") {
    caveats.push(
      "Do not assert the diagnosis as established fact — V2 confidence is 'low'; present it as a supported hypothesis based on the available signals"
    );
  } else if (checks.diagnosis_confidence.v2_confidence === "medium") {
    caveats.push(
      "Do not assert the diagnosis with certainty — V2 confidence is 'medium'; frame conclusions as well-supported but open to revision with additional research"
    );
  }

  // Weak or absent external source evidence
  if (checks.source_diversity.points === 0) {
    caveats.push(
      "All evidence is from company-controlled sources (Tier 1) — do not assert pricing, product claims, or positioning as independently verified; these are stated, not confirmed"
    );
  } else if (!checks.source_diversity.has_tier2_or_3) {
    caveats.push(
      "No Tier 2 or Tier 3 evidence present — claims about customer experience or market perception are not independently corroborated"
    );
  }

  // Weak evidence coverage
  if (checks.evidence_pack_coverage.points <= 1) {
    caveats.push(
      `Evidence pack coverage is '${checks.evidence_pack_coverage.coverage_assessment}' — anchor every factual claim to a specific evidence excerpt; do not generalise beyond what the evidence directly shows`
    );
  }

  // Contested archetype diagnosis
  if (checks.competing_archetype_gap.points === 0 && checks.competing_archetype_gap.winning_score > 0) {
    caveats.push(
      "Competing diagnosis archetypes score within 1 point of each other — do not assert this is the only plausible structural explanation; acknowledge that alternative interpretations are plausible given the current evidence set"
    );
  } else if (checks.competing_archetype_gap.points === 1) {
    caveats.push(
      "Runner-up archetype is within 3 points of the winning diagnosis — frame the conclusion as the most probable interpretation, not a certainty"
    );
  }

  return caveats;
}

// ---------------------------------------------------------------------------
// Blocking reasons and improvement suggestions (abort only)
// ---------------------------------------------------------------------------

function buildBlockingReasons(checks: AdjudicationChecks, totalPoints: number): string[] {
  const reasons: string[] = [];

  if (checks.evidence_pack_coverage.coverage_assessment === "insufficient") {
    reasons.push(
      "Evidence pack coverage is 'insufficient' — fewer than 5 qualifying records after scoring; the pack cannot support a credible memo argument"
    );
  }

  if (checks.diagnosis_confidence.v2_confidence === "low" && checks.source_diversity.points === 0) {
    reasons.push(
      "Diagnosis confidence is 'low' combined with zero source diversity — no external validation exists to support a credible diagnosis assertion"
    );
  }

  // Fallback: total_points so low it hit abort by score alone
  if (reasons.length === 0 && totalPoints <= 2) {
    reasons.push(
      `Total adjudication score is ${totalPoints}/10 — insufficient combined confidence across all 4 checks to support any memo framing`
    );
  }

  return reasons;
}

function buildImprovementSuggestions(checks: AdjudicationChecks): string[] {
  const suggestions: string[] = [];

  if (!checks.source_diversity.has_tier2_or_3) {
    suggestions.push(
      "Fetch Trustpilot, G2, or Capterra reviews to add Tier 3 customer voice evidence — this is the single highest-leverage research addition for unlocking memo confidence"
    );
  }

  if (checks.evidence_pack_coverage.coverage_assessment === "insufficient") {
    suggestions.push(
      "Expand research to include product pages, case studies, and press coverage — the current evidence pool is too sparse to produce a qualifying pack"
    );
  }

  if (checks.diagnosis_confidence.v2_confidence === "low") {
    suggestions.push(
      "Diagnosis confidence is 'low' — add pricing, sales motion, and buyer persona evidence to strengthen the V2 signal set before re-running"
    );
  }

  const gap = checks.competing_archetype_gap;
  if (gap.winning_score > 0 && gap.gap <= 1) {
    suggestions.push(
      `Resolve competing archetypes: winning archetype score ${gap.winning_score} vs runner-up ${gap.runner_up_score} (gap = ${gap.gap}) — add signals that distinguish the primary diagnosis from its closest alternative archetype`
    );
  }

  if (suggestions.length === 0) {
    suggestions.push(
      "No single critical gap identified — review the full evidence set for completeness, source tier distribution, and V2 signal coverage"
    );
  }

  return suggestions;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * Adjudicate the V2 diagnosis against the evidence pack and pattern scores.
 * Returns an AdjudicationResult that determines the epistemic framing for
 * the memo and whether memo generation may proceed.
 *
 * Fully deterministic — no LLM calls. Pure function (timestamp aside).
 */
export function adjudicateDiagnosis(input: AdjudicateDiagnosisInput): AdjudicationResult {
  const { diagnosis, evidencePack, patterns } = input;
  const companyId = evidencePack.company_id;
  const timestamp = Date.now();
  const now = new Date().toISOString();

  // ── Run all 4 checks ──────────────────────────────────────────────────────
  const diagCheck = checkDiagnosisConfidence(diagnosis);
  const coverageCheck = checkEvidenceCoverage(evidencePack);
  const diversityCheck = checkSourceDiversity(evidencePack);
  const gapCheck = checkArchetypeGap(patterns);

  const totalPoints =
    diagCheck.points + coverageCheck.points + diversityCheck.points + gapCheck.points;

  const checks: AdjudicationChecks = {
    diagnosis_confidence: diagCheck,
    evidence_pack_coverage: coverageCheck,
    source_diversity: diversityCheck,
    competing_archetype_gap: gapCheck,
    total_points: totalPoints,
  };

  // ── Determine base mode from total points ────────────────────────────────
  let mode: AdjudicationMode = pointsToMode(totalPoints);

  // ── Apply override rules (in priority order) ─────────────────────────────

  // Override 1: Insufficient coverage always forces abort, regardless of total points
  if (coverageCheck.coverage_assessment === "insufficient") {
    mode = "abort";
  }
  // Override 2: Low confidence + zero source diversity → no basis for any memo
  else if (diagCheck.v2_confidence === "low" && diversityCheck.points === 0) {
    mode = "abort";
  }
  // Override 3: Contested diagnosis (gap ≤ 1) → cannot assert full_confidence
  // Cap at conditional — we will not write an assertive memo on a coin-flip diagnosis
  else if (gapCheck.gap <= 1 && mode === "full_confidence") {
    mode = "conditional";
  }

  const recommendedFraming = modeToFraming(mode);

  // ── Build AdjudicationReport (abort mode only) ───────────────────────────
  let adjudicationReport: AdjudicationReport | undefined;
  if (mode === "abort") {
    adjudicationReport = {
      company_id: companyId,
      generated_at: now,
      total_points: totalPoints,
      mode: "abort",
      blocking_reasons: buildBlockingReasons(checks, totalPoints),
      improvement_suggestions: buildImprovementSuggestions(checks),
    };
  }

  // ── Build confidence caveats (conditional / exploratory modes only) ──────
  let confidenceCaveats: string[] | undefined;
  if (mode === "conditional" || mode === "exploratory") {
    confidenceCaveats = buildCaveats(checks);
  }

  return {
    result_id: `adj_${companyId}_${timestamp}`,
    company_id: companyId,
    adjudicated_at: now,
    adjudication_mode: mode,
    diagnosis_id: diagnosis.id,
    checks,
    recommended_memo_framing: recommendedFraming,
    adjudication_report: adjudicationReport,
    confidence_caveats: confidenceCaveats,
  };
}
