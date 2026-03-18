/**
 * Run Send Gate — V3-M6
 * Spec: docs/specs/intelligence-engine-v3/006_send_gate_spec.md
 *
 * Final binary gate. Fully deterministic — no LLM call.
 * Produces: result ("pass" | "fail") + memo_quality_score (0–100).
 *
 * Seven criteria (all must pass):
 *   1. critic_overall_pass    — criticResult.overall_pass = true
 *   2. evidence_ref_count     — memo.evidence_ids.length >= 3
 *   3. adjudication_not_aborted — adjudication.adjudication_mode !== "abort"
 *   4. no_banned_phrases      — independent banned phrase scan on memo.markdown
 *   5. cta_present_singular   — cta section present, ≤50 words
 *   6. word_count_in_range    — 400 ≤ word_count ≤ 1400
 *   7. rory_approval          — roryResult.verdict = "approve" (when present)
 *
 * Hard failures (never overridable):
 *   - Genericity test failed
 *   - evidence_ids.length < 2
 *   - adjudication mode = abort
 *   - Banned phrase detected
 *   - word_count > 1400 or < 300
 *   - Rory verdict = "revise"
 *
 * Quality score derivation (0–100 base + 0–10 Rory bonus, capped at 100):
 *   critic_dimensions        40 pts (6 dims scaled: sum/30 × 40)
 *   evidence_ref_count       20 pts
 *   word_count_target_range  15 pts
 *   genericity_test          15 pts
 *   founder_pushback_severity 10 pts
 *   rory_bonus               0–10 pts (additive when roryResult present)
 */

import type { MarkdownMemo } from "../types/memo.js";
import type { MemoCriticResult } from "../types/memo-critic.js";
import type { AdjudicationResult } from "../types/adjudication.js";
import type { EvidencePack } from "../types/evidence-pack.js";
import type { RoryReviewResult } from "../types/rory-review.js";
import type {
  SendGateResult,
  GateCriteriaResult,
  GateCriterion,
  BlockingReason,
  GateSummary,
} from "../types/send-gate.js";
import { BANNED_PHRASES } from "./build-memo-brief.js";
import { countWords } from "./utils.js";

export interface RunSendGateInput {
  memo: MarkdownMemo;
  criticResult: MemoCriticResult;
  adjudication: AdjudicationResult;
  evidencePack: EvidencePack;
  roryResult?: RoryReviewResult;
}

function detectBannedPhrase(markdown: string): string | null {
  const lower = markdown.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) {
      return phrase;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Criterion evaluators
// ---------------------------------------------------------------------------

function evalCriticOverallPass(
  criticResult: MemoCriticResult
): GateCriteriaResult {
  const pass = criticResult.overall_pass;
  if (pass) {
    return {
      criterion_id: "critic_overall_pass",
      pass: true,
      observed_value: true,
      threshold: "criticResult.overall_pass = true",
    };
  }

  // Determine failure type: genericity test failure = hard; dimension-only = conditional
  const genericityFailed = criticResult.genericity_test.result === "fail";
  const failure_type: "hard" | "conditional" = genericityFailed ? "hard" : "conditional";

  const notes = genericityFailed
    ? `Genericity test failed: ${criticResult.genericity_test.reasoning}`
    : `Dimension(s) below threshold: ${Object.entries(criticResult.dimensions)
        .filter(([, v]) => !v.pass)
        .map(([k]) => k)
        .join(", ")}`;

  return {
    criterion_id: "critic_overall_pass",
    pass: false,
    failure_type,
    observed_value: false,
    threshold: "criticResult.overall_pass = true",
    notes,
  };
}

function evalEvidenceRefCount(memo: MarkdownMemo): GateCriteriaResult {
  const count = memo.evidence_ids.length;
  const pass = count >= 3;

  if (pass) {
    return {
      criterion_id: "evidence_ref_count",
      pass: true,
      observed_value: count,
      threshold: "memo.evidence_ids.length >= 3",
    };
  }

  // < 2 = hard; == 2 = conditional
  const failure_type: "hard" | "conditional" = count < 2 ? "hard" : "conditional";
  return {
    criterion_id: "evidence_ref_count",
    pass: false,
    failure_type,
    observed_value: count,
    threshold: "memo.evidence_ids.length >= 3",
    notes:
      count < 2
        ? `Only ${count} evidence reference(s) — memo is essentially ungrounded`
        : "Only 2 evidence references — conditional failure",
  };
}

function evalAdjudicationNotAborted(
  adjudication: AdjudicationResult
): GateCriteriaResult {
  const pass = adjudication.adjudication_mode !== "abort";
  if (pass) {
    return {
      criterion_id: "adjudication_not_aborted",
      pass: true,
      observed_value: adjudication.adjudication_mode,
      threshold: "adjudication.adjudication_mode !== 'abort'",
    };
  }
  return {
    criterion_id: "adjudication_not_aborted",
    pass: false,
    failure_type: "hard",
    observed_value: "abort",
    threshold: "adjudication.adjudication_mode !== 'abort'",
    notes: "Aborted adjudication must never reach the send gate",
  };
}

function evalNoBannedPhrases(memo: MarkdownMemo): GateCriteriaResult {
  const hit = detectBannedPhrase(memo.markdown);
  const pass = hit === null;
  if (pass) {
    return {
      criterion_id: "no_banned_phrases",
      pass: true,
      observed_value: "none detected",
      threshold: "zero banned phrases in memo.markdown",
    };
  }
  return {
    criterion_id: "no_banned_phrases",
    pass: false,
    failure_type: "hard",
    observed_value: `"${hit}"`,
    threshold: "zero banned phrases in memo.markdown",
    notes: `Banned phrase detected: "${hit}"`,
  };
}

function evalCtaPresentSingular(memo: MarkdownMemo): GateCriteriaResult {
  const ctaSection = memo.sections.find(s => s.name === "cta");
  if (!ctaSection) {
    return {
      criterion_id: "cta_present_singular",
      pass: false,
      failure_type: "conditional",
      observed_value: "absent",
      threshold: "exactly one cta section present, ≤50 words",
      notes: "No CTA section found in memo",
    };
  }

  const wc = countWords(ctaSection.markdown);
  const pass = wc <= 50;
  if (pass) {
    return {
      criterion_id: "cta_present_singular",
      pass: true,
      observed_value: wc,
      threshold: "exactly one cta section present, ≤50 words",
    };
  }
  return {
    criterion_id: "cta_present_singular",
    pass: false,
    failure_type: "conditional",
    observed_value: wc,
    threshold: "exactly one cta section present, ≤50 words",
    notes: `CTA section has ${wc} words (exceeds 50-word limit)`,
  };
}

function evalWordCountInRange(memo: MarkdownMemo): GateCriteriaResult {
  const wc = memo.word_count;
  const pass = wc >= 400 && wc <= 1400;

  if (pass) {
    return {
      criterion_id: "word_count_in_range",
      pass: true,
      observed_value: wc,
      threshold: "400 ≤ word_count ≤ 1400",
    };
  }

  // Hard: < 300 or > 1400
  // Conditional: 300–399
  const failure_type: "hard" | "conditional" =
    wc > 1400 || wc < 300 ? "hard" : "conditional";
  return {
    criterion_id: "word_count_in_range",
    pass: false,
    failure_type,
    observed_value: wc,
    threshold: "400 ≤ word_count ≤ 1400",
    notes:
      wc > 1400
        ? `Word count ${wc} exceeds hard max (1400)`
        : wc < 300
        ? `Word count ${wc} is below minimum (300 — not a memo)`
        : `Word count ${wc} is in conditional range (300–399)`,
  };
}

function evalRoryApproval(
  roryResult?: RoryReviewResult
): GateCriteriaResult {
  // When no Rory review ran, criterion passes (backward compat)
  if (!roryResult) {
    return {
      criterion_id: "rory_approval",
      pass: true,
      observed_value: "not_evaluated",
      threshold: "roryResult.verdict = 'approve' (or not present)",
    };
  }

  const pass = roryResult.verdict === "approve";
  if (pass) {
    return {
      criterion_id: "rory_approval",
      pass: true,
      observed_value: "approve",
      threshold: "roryResult.verdict = 'approve'",
    };
  }

  return {
    criterion_id: "rory_approval",
    pass: false,
    failure_type: "hard",
    observed_value: "revise",
    threshold: "roryResult.verdict = 'approve'",
    notes: "Rory Sutherland review did not approve — memo lacks strategic interestingness",
  };
}

// ---------------------------------------------------------------------------
// Quality score computation
// ---------------------------------------------------------------------------

function computeQualityScore(
  criticResult: MemoCriticResult,
  memo: MarkdownMemo
): number {
  // critic_dimensions: 6 dims, max 40 pts (scaled: sum / 30 * 40)
  const { evidence_grounding, commercial_sharpness, pattern_clarity, signal_density, cta_clarity, tone_compliance } =
    criticResult.dimensions;
  const rawDimSum = evidence_grounding.score + commercial_sharpness.score +
    pattern_clarity.score + signal_density.score + cta_clarity.score + tone_compliance.score;
  const dimScore = Math.round((rawDimSum / 30) * 40);

  // evidence_ref_count: 0–20
  const evCount = memo.evidence_ids.length;
  let evScore: number;
  if (evCount >= 5) evScore = 20;
  else if (evCount === 4) evScore = 15;
  else if (evCount === 3) evScore = 10;
  else if (evCount === 2) evScore = 5;
  else evScore = 0;

  // word_count_target_range: 0–15
  const wc = memo.word_count;
  let wcScore: number;
  if (wc >= 900 && wc <= 1100) wcScore = 15;
  else if ((wc >= 750 && wc < 900) || (wc > 1100 && wc <= 1200)) wcScore = 10;
  else if ((wc >= 500 && wc < 750) || (wc > 1200 && wc <= 1400)) wcScore = 5;
  else wcScore = 0;

  // genericity_test: 0 or 15
  const genScore = criticResult.genericity_test.result === "pass" ? 15 : 0;

  // founder_pushback_severity: low=10, medium=5, high=0
  const severityMap: Record<string, number> = { low: 10, medium: 5, high: 0 };
  const pushScore = severityMap[criticResult.founder_pushback_test.severity] ?? 5;

  return Math.min(100, Math.max(0, dimScore + evScore + wcScore + genScore + pushScore));
}

/**
 * Additive Rory bonus: 0–10 points from Rory's 4 dimensions.
 * When roryResult is undefined, returns 0 (existing scores unchanged).
 */
function computeRoryBonus(roryResult?: RoryReviewResult): number {
  if (!roryResult) return 0;
  const { reframe_quality, behavioural_insight, asymmetric_opportunity, memorability } =
    roryResult.dimensions;
  const rawSum = reframe_quality.score + behavioural_insight.score +
    asymmetric_opportunity.score + memorability.score;
  return Math.round((rawSum / 20) * 10);
}

// ---------------------------------------------------------------------------
// Gate summary builder
// ---------------------------------------------------------------------------

function buildGateSummary(
  criteriaResults: GateCriteriaResult[],
  qualityScore: number,
  result: "pass" | "fail",
  blockingReasons: BlockingReason[]
): GateSummary {
  const passed = criteriaResults.filter(c => c.pass).length;
  const failed = criteriaResults.filter(c => !c.pass).length;
  const hard = blockingReasons.filter(r => r.failure_type === "hard").length;
  const conditional = blockingReasons.filter(r => r.failure_type === "conditional").length;

  let recommendation: string;
  if (result === "pass") {
    recommendation = `Memo passed all ${criteriaResults.length} criteria with quality score ${qualityScore}/100. Ready to send.`;
  } else if (hard > 0) {
    const firstHard = blockingReasons.find(r => r.failure_type === "hard");
    recommendation = `Memo failed hard criterion: ${firstHard?.criterion_id ?? "unknown"}. ${firstHard?.description ?? "Revision required."}`;
  } else {
    const firstCond = blockingReasons[0];
    recommendation = `Memo failed ${failed} criterion${failed !== 1 ? "a" : "on"} (${firstCond?.criterion_id}). Conditional failure — human review path available.`;
  }

  return {
    total_criteria: criteriaResults.length as 6 | 7,
    criteria_passed: passed,
    criteria_failed: failed,
    hard_failures: hard,
    conditional_failures: conditional,
    memo_quality_score: qualityScore,
    recommendation,
  };
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * Evaluate the memo against all 7 gate criteria and compute quality score.
 * Fully deterministic — no LLM call.
 *
 * @param input - RunSendGateInput with memo, criticResult, adjudication, evidencePack
 * @returns SendGateResult — pass/fail with quality score, blocking reasons, and summary
 */
export function runSendGate(input: RunSendGateInput): SendGateResult {
  const { memo, criticResult, adjudication, roryResult } = input;

  // Evaluate all 7 criteria
  const criteriaResults: GateCriteriaResult[] = [
    evalCriticOverallPass(criticResult),
    evalEvidenceRefCount(memo),
    evalAdjudicationNotAborted(adjudication),
    evalNoBannedPhrases(memo),
    evalCtaPresentSingular(memo),
    evalWordCountInRange(memo),
    evalRoryApproval(roryResult),
  ];

  // Collect blocking reasons
  const blockingReasons: BlockingReason[] = criteriaResults
    .filter(c => !c.pass)
    .map(c => ({
      criterion_id: c.criterion_id,
      failure_type: c.failure_type!,
      description: c.notes ?? `${c.criterion_id} failed (observed: ${c.observed_value}, threshold: ${c.threshold})`,
    }));

  const hasHardFailures = blockingReasons.some(r => r.failure_type === "hard");
  const allPass = criteriaResults.every(c => c.pass);
  const result: "pass" | "fail" = allPass ? "pass" : "fail";

  const baseScore = computeQualityScore(criticResult, memo);
  const qualityScore = Math.min(100, baseScore + computeRoryBonus(roryResult));

  // Extract company_id from memo
  const company_id = memo.company_id;

  const timestamp = Date.now();
  const gate_id = `gate_${company_id}_${timestamp}`;
  const evaluated_at = new Date().toISOString();

  const gateSummary = buildGateSummary(criteriaResults, qualityScore, result, blockingReasons);

  if (result === "pass") {
    return {
      gate_id,
      company_id,
      memo_id: memo.memo_id,
      evaluated_at,
      result: "pass",
      memo_quality_score: qualityScore,
      passed_at: evaluated_at,
      ready_to_send: true,
      has_hard_failures: false,
      gate_summary: gateSummary,
      criteria_results: criteriaResults,
    };
  }

  return {
    gate_id,
    company_id,
    memo_id: memo.memo_id,
    evaluated_at,
    result: "fail",
    memo_quality_score: qualityScore,
    blocking_reasons: blockingReasons,
    has_hard_failures: hasHardFailures,
    gate_summary: gateSummary,
    criteria_results: criteriaResults,
  };
}
