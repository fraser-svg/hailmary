/**
 * Send Gate Tests — V3-M6
 *
 * Tests for runSendGate():
 *
 * Hard fail cases:
 *   - adjudication mode = abort → hard failure on adjudication_not_aborted
 *   - genericity test failed → hard failure on critic_overall_pass
 *   - banned phrase in memo → hard failure on no_banned_phrases
 *   - word_count > 1100 → hard failure on word_count_in_range
 *   - evidence_ids.length < 2 → hard failure on evidence_ref_count
 *   - has_hard_failures = true when any hard failure present
 *
 * Conditional fail cases:
 *   - critic overall pass = false (dimensions only, genericity pass) → conditional
 *   - evidence_ids.length == 2 → conditional failure
 *   - CTA section > 50 words → conditional failure
 *   - word_count 200–299 → conditional failure
 *   - has_hard_failures = false when only conditional failures
 *
 * Score computation:
 *   - all dims 5 + 5+ evidence + 500-700 words + gen pass + low severity → high score
 *   - dims 3 each + 3 evidence + 600 words + gen pass + low severity → moderate score
 *   - failed dims → reduced score
 *   - score is always 0–100
 *
 * Pass case:
 *   - all 6 criteria pass → result = "pass", ready_to_send = true, passed_at set
 *
 * Required section enforcement:
 *   - missing CTA section → conditional failure on cta_present_singular
 *   - CTA section present and ≤ 50 words → cta_present_singular passes
 *
 * Banned phrase detection:
 *   - "game-changing" in memo.markdown → hard failure
 *   - "world-class" in memo.markdown → hard failure
 *   - no banned phrase → no_banned_phrases passes
 *
 * Evidence ref count handling:
 *   - 0 evidence refs → hard failure (< 2)
 *   - 1 evidence ref → hard failure (< 2)
 *   - 2 evidence refs → conditional failure
 *   - 3 evidence refs → passes criterion
 *   - 5 evidence refs → passes with max evidence score
 *
 * Gate summary:
 *   - total_criteria always 6
 *   - recommendation is a non-empty string
 *   - criteria_passed + criteria_failed = 6
 */

import { describe, it, expect } from "vitest";
import { runSendGate } from "../memo/run-send-gate.js";
import type { RunSendGateInput } from "../memo/run-send-gate.js";
import type { MarkdownMemo, MemoSection } from "../types/memo.js";
import type { MemoCriticResult } from "../types/memo-critic.js";
import type { AdjudicationResult } from "../types/adjudication.js";
import type { EvidencePack } from "../types/evidence-pack.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMemo(overrides: Partial<MarkdownMemo> = {}): MarkdownMemo {
  const ctaSection: MemoSection = {
    name: "cta",
    markdown: "Reply to this letter to explore further.",
    word_count: 7,
  };
  return {
    memo_id: "memo_acme_123456",
    company_id: "acme",
    brief_id: "brief_acme_001",
    adjudication_mode: "full_confidence",
    diagnosis_id: "diag_001",
    intervention_id: "int_001",
    evidence_ids: ["ev_001", "ev_002", "ev_003"],
    word_count: 550,
    attempt_number: 1,
    sections: [
      { name: "title_block", markdown: "Acme\nStrategic Diagnostic\nMarch 2026 | Confidential", word_count: 6 },
      { name: "executive_thesis", markdown: "Acme procurement saves 40%.", word_count: 5 },
      { name: "what_we_observed", markdown: "Buyer mismatch creates ceiling.", word_count: 5 },
      { name: "the_pattern", markdown: "Pricing diverges from reality.", word_count: 5 },
      { name: "what_this_means", markdown: "Buyer mismatch creates ceiling.", word_count: 5 },
      { name: "what_this_changes", markdown: "Reframe the ICP entirely.", word_count: 5 },
      ctaSection,
    ],
    markdown: "Acme\nStrategic Diagnostic\nMarch 2026 | Confidential\n\n## Executive Thesis\n\nAcme procurement saves 40%.\n\n## What We Observed\n\nBuyer mismatch creates ceiling.",
    generated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makePassCriticResult(overrides: Partial<MemoCriticResult> = {}): MemoCriticResult {
  return {
    critic_id: "critic_acme_123",
    memo_id: "memo_acme_123456",
    evaluated_at: new Date().toISOString(),
    attempt_number: 1,
    dimensions: {
      evidence_grounding: { score: 4, pass: true, notes: "Solid grounding." },
      commercial_sharpness: { score: 4, pass: true, notes: "Company-specific." },
      pattern_clarity: { score: 4, pass: true, notes: "Gap clearly stated." },
      signal_density: { score: 4, pass: true, notes: "4 concrete signals." },
      cta_clarity: { score: 5, pass: true, notes: "One clear ask." },
      tone_compliance: { score: 5, pass: true, notes: "No violations." },
    },
    genericity_test: { result: "pass", reasoning: "4 company-specific claims." },
    founder_pushback_test: {
      most_vulnerable_claim: "Acme loses on cycle length.",
      likely_objection: "Win rate is fine.",
      severity: "low",
    },
    overall_pass: true,
    ...overrides,
  };
}

function makeFailCriticResult(overrides: Partial<MemoCriticResult> = {}): MemoCriticResult {
  return {
    critic_id: "critic_acme_456",
    memo_id: "memo_acme_123456",
    evaluated_at: new Date().toISOString(),
    attempt_number: 1,
    dimensions: {
      evidence_grounding: { score: 3, pass: true, notes: "Mostly grounded." },
      commercial_sharpness: { score: 1, pass: false, notes: "Generic." },
      pattern_clarity: { score: 2, pass: false, notes: "Gap not named." },
      signal_density: { score: 1, pass: false, notes: "No concrete signals." },
      cta_clarity: { score: 2, pass: false, notes: "Two asks." },
      tone_compliance: { score: 3, pass: true, notes: "Minor issues." },
    },
    genericity_test: { result: "fail", reasoning: "Removing company name leaves argument intact." },
    founder_pushback_test: {
      most_vulnerable_claim: "Pricing discourages trial.",
      likely_objection: "We have a free tier.",
      severity: "high",
    },
    overall_pass: false,
    revision_instructions: {
      attempt_number: 1,
      failing_dimensions: ["commercial_sharpness", "pattern_clarity", "signal_density", "cta_clarity", "genericity_test"],
      specific_issues: ["commercial_sharpness: Generic."],
      founder_pushback_context: "Severity: high.",
    },
    ...overrides,
  };
}

function makeAdjudication(mode: AdjudicationResult["adjudication_mode"] = "full_confidence"): AdjudicationResult {
  return {
    adjudication_id: "adj_001",
    diagnosis_id: "diag_001",
    company_id: "acme",
    adjudicated_at: new Date().toISOString(),
    adjudication_mode: mode,
    recommended_memo_framing: mode === "abort" ? "blocked" : "assertive",
    confidence_score: 0.8,
    confidence_caveats: [],
    criteria: {
      diagnosis_confidence: { score: 4, pass: true, notes: "High confidence" },
      evidence_coverage: { score: 4, pass: true, notes: "Good coverage" },
      source_diversity: { score: 3, pass: true, notes: "Diverse sources" },
      archetype_gap: { score: 4, pass: true, notes: "Clear archetype" },
    },
  } as AdjudicationResult;
}

function makeEvidencePack(): EvidencePack {
  return {
    pack_id: "pack_001",
    company_id: "acme",
    diagnosis_id: "diag_001",
    built_at: new Date().toISOString(),
    records: [],
    hook_candidates: [],
    pack_quality: { total_records: 0, hook_eligible: 0, qualifying_records: 0, mix_warnings: [] },
  } as unknown as EvidencePack;
}

function makeInput(overrides: Partial<RunSendGateInput> = {}): RunSendGateInput {
  return {
    memo: makeMemo(),
    criticResult: makePassCriticResult(),
    adjudication: makeAdjudication(),
    evidencePack: makeEvidencePack(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pass case
// ---------------------------------------------------------------------------

describe("runSendGate — pass case", () => {
  it("returns result = pass when all 6 criteria pass", () => {
    const result = runSendGate(makeInput());
    expect(result.result).toBe("pass");
  });

  it("sets ready_to_send = true on pass", () => {
    const result = runSendGate(makeInput());
    expect(result.ready_to_send).toBe(true);
  });

  it("sets passed_at on pass", () => {
    const result = runSendGate(makeInput());
    expect(result.passed_at).toBeTruthy();
  });

  it("has_hard_failures = false on pass", () => {
    const result = runSendGate(makeInput());
    expect(result.has_hard_failures).toBe(false);
  });

  it("no blocking_reasons on pass", () => {
    const result = runSendGate(makeInput());
    expect(result.blocking_reasons).toBeUndefined();
  });

  it("gate_id has correct format", () => {
    const result = runSendGate(makeInput());
    expect(result.gate_id).toMatch(/^gate_acme_\d+$/);
  });

  it("memo_id matches input memo", () => {
    const result = runSendGate(makeInput());
    expect(result.memo_id).toBe("memo_acme_123456");
  });
});

// ---------------------------------------------------------------------------
// Hard fail cases
// ---------------------------------------------------------------------------

describe("runSendGate — hard fail cases", () => {
  it("adjudication mode = abort → hard failure", () => {
    const input = makeInput({ adjudication: makeAdjudication("abort") });
    const result = runSendGate(input);
    expect(result.result).toBe("fail");
    expect(result.has_hard_failures).toBe(true);
    const abort = result.criteria_results.find(c => c.criterion_id === "adjudication_not_aborted");
    expect(abort?.pass).toBe(false);
    expect(abort?.failure_type).toBe("hard");
  });

  it("genericity test failed → hard failure on critic_overall_pass", () => {
    const criticWithGenFail = makePassCriticResult({
      overall_pass: false,
      genericity_test: { result: "fail", reasoning: "Too generic." },
    });
    const input = makeInput({ criticResult: criticWithGenFail });
    const result = runSendGate(input);
    expect(result.result).toBe("fail");
    expect(result.has_hard_failures).toBe(true);
    const critCrit = result.criteria_results.find(c => c.criterion_id === "critic_overall_pass");
    expect(critCrit?.failure_type).toBe("hard");
  });

  it("banned phrase in memo → hard failure on no_banned_phrases", () => {
    const bannedMemo = makeMemo({
      markdown: "## Observation\n\nThis is game-changing technology for Acme.",
    });
    const input = makeInput({ memo: bannedMemo });
    const result = runSendGate(input);
    expect(result.result).toBe("fail");
    expect(result.has_hard_failures).toBe(true);
    const noBanned = result.criteria_results.find(c => c.criterion_id === "no_banned_phrases");
    expect(noBanned?.pass).toBe(false);
    expect(noBanned?.failure_type).toBe("hard");
  });

  it("word_count > 1400 → hard failure on word_count_in_range", () => {
    const longMemo = makeMemo({ word_count: 1500 });
    const input = makeInput({ memo: longMemo });
    const result = runSendGate(input);
    expect(result.result).toBe("fail");
    expect(result.has_hard_failures).toBe(true);
    const wc = result.criteria_results.find(c => c.criterion_id === "word_count_in_range");
    expect(wc?.failure_type).toBe("hard");
    expect(wc?.observed_value).toBe(1500);
  });

  it("word_count < 300 → hard failure", () => {
    const shortMemo = makeMemo({ word_count: 250 });
    const input = makeInput({ memo: shortMemo });
    const result = runSendGate(input);
    expect(result.has_hard_failures).toBe(true);
    const wc = result.criteria_results.find(c => c.criterion_id === "word_count_in_range");
    expect(wc?.failure_type).toBe("hard");
  });

  it("evidence_ids.length < 2 → hard failure", () => {
    const noEvMemo = makeMemo({ evidence_ids: ["ev_001"] });
    const input = makeInput({ memo: noEvMemo });
    const result = runSendGate(input);
    expect(result.has_hard_failures).toBe(true);
    const ev = result.criteria_results.find(c => c.criterion_id === "evidence_ref_count");
    expect(ev?.failure_type).toBe("hard");
  });

  it("0 evidence refs → hard failure", () => {
    const noEvMemo = makeMemo({ evidence_ids: [] });
    const input = makeInput({ memo: noEvMemo });
    const result = runSendGate(input);
    expect(result.has_hard_failures).toBe(true);
    const ev = result.criteria_results.find(c => c.criterion_id === "evidence_ref_count");
    expect(ev?.failure_type).toBe("hard");
  });

  it("'world-class' triggers banned phrase hard failure", () => {
    const bannedMemo = makeMemo({
      markdown: "## Observation\n\nAcme is world-class in procurement.",
    });
    const input = makeInput({ memo: bannedMemo });
    const result = runSendGate(input);
    expect(result.has_hard_failures).toBe(true);
    const noBanned = result.criteria_results.find(c => c.criterion_id === "no_banned_phrases");
    expect(noBanned?.pass).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Conditional fail cases
// ---------------------------------------------------------------------------

describe("runSendGate — conditional fail cases", () => {
  it("critic dims fail but genericity pass → conditional failure, no hard failures", () => {
    const dimOnlyFail = makeFailCriticResult({
      genericity_test: { result: "pass", reasoning: "Still specific." },
      overall_pass: false,
    });
    const input = makeInput({ criticResult: dimOnlyFail });
    const result = runSendGate(input);
    expect(result.result).toBe("fail");
    expect(result.has_hard_failures).toBe(false);
    const critCrit = result.criteria_results.find(c => c.criterion_id === "critic_overall_pass");
    expect(critCrit?.failure_type).toBe("conditional");
  });

  it("exactly 2 evidence refs → conditional failure", () => {
    const twoEvMemo = makeMemo({ evidence_ids: ["ev_001", "ev_002"] });
    const input = makeInput({ memo: twoEvMemo });
    const result = runSendGate(input);
    expect(result.result).toBe("fail");
    const ev = result.criteria_results.find(c => c.criterion_id === "evidence_ref_count");
    expect(ev?.failure_type).toBe("conditional");
    expect(result.has_hard_failures).toBe(false);
  });

  it("CTA section > 50 words → conditional failure", () => {
    const longCta = Array(15).fill("Reply to this letter for more information on our services.").join(" ");
    const longCtaMemo = makeMemo({
      sections: [
        { name: "title_block", markdown: "Acme\nStrategic Diagnostic", word_count: 3 },
        { name: "executive_thesis", markdown: "Acme.", word_count: 1 },
        { name: "what_we_observed", markdown: "Obs.", word_count: 1 },
        { name: "the_pattern", markdown: "Pattern.", word_count: 1 },
        { name: "what_this_means", markdown: "Means.", word_count: 1 },
        { name: "what_this_changes", markdown: "Change.", word_count: 1 },
        { name: "cta", markdown: longCta, word_count: 100 },
      ],
    });
    const input = makeInput({ memo: longCtaMemo });
    const result = runSendGate(input);
    expect(result.result).toBe("fail");
    const cta = result.criteria_results.find(c => c.criterion_id === "cta_present_singular");
    expect(cta?.failure_type).toBe("conditional");
    expect(result.has_hard_failures).toBe(false);
  });

  it("word_count 300–399 → conditional failure", () => {
    const shortMemo = makeMemo({ word_count: 350 });
    const input = makeInput({ memo: shortMemo });
    const result = runSendGate(input);
    expect(result.result).toBe("fail");
    const wc = result.criteria_results.find(c => c.criterion_id === "word_count_in_range");
    expect(wc?.failure_type).toBe("conditional");
    expect(result.has_hard_failures).toBe(false);
  });

  it("missing CTA section → conditional failure on cta_present_singular", () => {
    const noCtaMemo = makeMemo({
      sections: [
        { name: "title_block", markdown: "Acme\nStrategic Diagnostic", word_count: 3 },
        { name: "executive_thesis", markdown: "Obs.", word_count: 1 },
        { name: "what_we_observed", markdown: "Obs.", word_count: 1 },
        { name: "the_pattern", markdown: "Pattern.", word_count: 1 },
        { name: "what_this_means", markdown: "Means.", word_count: 1 },
        { name: "what_this_changes", markdown: "Change.", word_count: 1 },
        // no cta section
      ],
    });
    const input = makeInput({ memo: noCtaMemo });
    const result = runSendGate(input);
    const cta = result.criteria_results.find(c => c.criterion_id === "cta_present_singular");
    expect(cta?.pass).toBe(false);
    expect(cta?.failure_type).toBe("conditional");
  });
});

// ---------------------------------------------------------------------------
// Score computation
// ---------------------------------------------------------------------------

describe("runSendGate — score computation", () => {
  it("score is always between 0 and 100 inclusive", () => {
    const pass = runSendGate(makeInput());
    expect(pass.memo_quality_score).toBeGreaterThanOrEqual(0);
    expect(pass.memo_quality_score).toBeLessThanOrEqual(100);

    const fail = runSendGate(makeInput({ criticResult: makeFailCriticResult() }));
    expect(fail.memo_quality_score).toBeGreaterThanOrEqual(0);
    expect(fail.memo_quality_score).toBeLessThanOrEqual(100);
  });

  it("all dims 5 + 5 evidence + 1000 words + gen pass + low severity → max score", () => {
    const allFiveCritic = makePassCriticResult({
      dimensions: {
        evidence_grounding: { score: 5, pass: true, notes: "" },
        commercial_sharpness: { score: 5, pass: true, notes: "" },
        pattern_clarity: { score: 5, pass: true, notes: "" },
        signal_density: { score: 5, pass: true, notes: "" },
        cta_clarity: { score: 5, pass: true, notes: "" },
        tone_compliance: { score: 5, pass: true, notes: "" },
      },
    });
    const fiveEvMemo = makeMemo({ evidence_ids: ["ev_001", "ev_002", "ev_003", "ev_004", "ev_005"], word_count: 1000 });
    const input = makeInput({ criticResult: allFiveCritic, memo: fiveEvMemo });
    const result = runSendGate(input);
    // 6×5/30×40=40 + 20 + 15 + 15 + 10 = 100
    expect(result.memo_quality_score).toBe(100);
  });

  it("dims all 3 + 3 evidence + 1000 words + gen pass + low severity → moderate score", () => {
    const allThreeCritic = makePassCriticResult({
      dimensions: {
        evidence_grounding: { score: 3, pass: true, notes: "" },
        commercial_sharpness: { score: 3, pass: true, notes: "" },
        pattern_clarity: { score: 3, pass: true, notes: "" },
        signal_density: { score: 3, pass: true, notes: "" },
        cta_clarity: { score: 3, pass: true, notes: "" },
        tone_compliance: { score: 3, pass: true, notes: "" },
      },
    });
    const threeEvMemo = makeMemo({ evidence_ids: ["ev_001", "ev_002", "ev_003"], word_count: 1000 });
    const input = makeInput({ criticResult: allThreeCritic, memo: threeEvMemo });
    const result = runSendGate(input);
    // 6×3/30×40=24 + 10 + 15 + 15 + 10 = 74
    expect(result.memo_quality_score).toBe(74);
  });

  it("genericity fail reduces score by 15 pts", () => {
    const withGen = makePassCriticResult({
      genericity_test: { result: "pass", reasoning: "" },
    });
    const withoutGen = makePassCriticResult({
      overall_pass: false,
      genericity_test: { result: "fail", reasoning: "" },
    });
    const memo = makeMemo({ word_count: 600 });
    const scoreWith = runSendGate(makeInput({ criticResult: withGen, memo })).memo_quality_score;
    const scoreWithout = runSendGate(makeInput({ criticResult: withoutGen, memo })).memo_quality_score;
    expect(scoreWith - scoreWithout).toBe(15);
  });

  it("high founder pushback severity reduces score", () => {
    const lowSev = makePassCriticResult({
      founder_pushback_test: { most_vulnerable_claim: "x", likely_objection: "y", severity: "low" },
    });
    const highSev = makePassCriticResult({
      founder_pushback_test: { most_vulnerable_claim: "x", likely_objection: "y", severity: "high" },
    });
    const memo = makeMemo({ word_count: 600 });
    const scoreLow = runSendGate(makeInput({ criticResult: lowSev, memo })).memo_quality_score;
    const scoreHigh = runSendGate(makeInput({ criticResult: highSev, memo })).memo_quality_score;
    expect(scoreLow - scoreHigh).toBe(10);
  });

  it("quality score is computed even when result = fail", () => {
    const input = makeInput({ criticResult: makeFailCriticResult() });
    const result = runSendGate(input);
    expect(result.result).toBe("fail");
    expect(typeof result.memo_quality_score).toBe("number");
    expect(result.memo_quality_score).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Gate summary
// ---------------------------------------------------------------------------

describe("runSendGate — gate summary", () => {
  it("total_criteria is always 7", () => {
    const result = runSendGate(makeInput());
    expect(result.gate_summary.total_criteria).toBe(7);
  });

  it("criteria_passed + criteria_failed = 7", () => {
    const pass = runSendGate(makeInput());
    expect(pass.gate_summary.criteria_passed + pass.gate_summary.criteria_failed).toBe(7);

    const fail = runSendGate(makeInput({ criticResult: makeFailCriticResult() }));
    expect(fail.gate_summary.criteria_passed + fail.gate_summary.criteria_failed).toBe(7);
  });

  it("recommendation is non-empty string on pass", () => {
    const result = runSendGate(makeInput());
    expect(result.gate_summary.recommendation.length).toBeGreaterThan(5);
    expect(result.gate_summary.recommendation.toLowerCase()).toContain("pass");
  });

  it("recommendation is non-empty string on fail", () => {
    const input = makeInput({ criticResult: makeFailCriticResult() });
    const result = runSendGate(input);
    expect(result.gate_summary.recommendation.length).toBeGreaterThan(5);
  });

  it("criteria_results has exactly 7 entries", () => {
    const result = runSendGate(makeInput());
    expect(result.criteria_results.length).toBe(7);
  });

  it("each criterion_id is unique in criteria_results", () => {
    const result = runSendGate(makeInput());
    const ids = result.criteria_results.map(c => c.criterion_id);
    const unique = new Set(ids);
    expect(unique.size).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Evidence ref count thresholds
// ---------------------------------------------------------------------------

describe("runSendGate — evidence ref count handling", () => {
  it("3 evidence refs → passes criterion", () => {
    const input = makeInput({ memo: makeMemo({ evidence_ids: ["a", "b", "c"] }) });
    const result = runSendGate(input);
    const ev = result.criteria_results.find(c => c.criterion_id === "evidence_ref_count");
    expect(ev?.pass).toBe(true);
  });

  it("5 evidence refs → passes criterion", () => {
    const input = makeInput({ memo: makeMemo({ evidence_ids: ["a", "b", "c", "d", "e"] }) });
    const result = runSendGate(input);
    const ev = result.criteria_results.find(c => c.criterion_id === "evidence_ref_count");
    expect(ev?.pass).toBe(true);
  });

  it("2 evidence refs → conditional failure", () => {
    const input = makeInput({ memo: makeMemo({ evidence_ids: ["a", "b"] }) });
    const result = runSendGate(input);
    const ev = result.criteria_results.find(c => c.criterion_id === "evidence_ref_count");
    expect(ev?.pass).toBe(false);
    expect(ev?.failure_type).toBe("conditional");
  });

  it("1 evidence ref → hard failure", () => {
    const input = makeInput({ memo: makeMemo({ evidence_ids: ["a"] }) });
    const result = runSendGate(input);
    const ev = result.criteria_results.find(c => c.criterion_id === "evidence_ref_count");
    expect(ev?.pass).toBe(false);
    expect(ev?.failure_type).toBe("hard");
  });
});

// ---------------------------------------------------------------------------
// Rory approval criterion (V3-M5b)
// ---------------------------------------------------------------------------

import type { RoryReviewResult } from "../types/rory-review.js";

function makeApproveRoryResult(): RoryReviewResult {
  return {
    review_id: "rory_acme_123456",
    company_id: "acme",
    memo_id: "memo_acme_123456",
    reviewed_at: new Date().toISOString(),
    attempt_number: 1,
    dimensions: {
      reframe_quality: { score: 4, pass: true, notes: "Genuine reframe." },
      behavioural_insight: { score: 4, pass: true, notes: "Names anchoring." },
      asymmetric_opportunity: { score: 3, pass: true, notes: "Real lever." },
      memorability: { score: 4, pass: true, notes: "Quotable." },
    },
    pub_test: { result: "pass", reasoning: "Would discuss at the pub." },
    verdict: "approve",
  };
}

function makeReviseRoryResult(): RoryReviewResult {
  return {
    review_id: "rory_acme_654321",
    company_id: "acme",
    memo_id: "memo_acme_123456",
    reviewed_at: new Date().toISOString(),
    attempt_number: 2,
    dimensions: {
      reframe_quality: { score: 2, pass: false, notes: "Restatement, not reframe." },
      behavioural_insight: { score: 1, pass: false, notes: "No behavioural layer." },
      asymmetric_opportunity: { score: 3, pass: true, notes: "Lever is real." },
      memorability: { score: 2, pass: false, notes: "Forgettable." },
    },
    pub_test: { result: "fail", reasoning: "Would not mention at the pub." },
    verdict: "revise",
    revision_notes: {
      what_is_boring: "It restates what the founder already knows.",
      what_would_be_interesting: "Name the cognitive bias driving buyer behaviour.",
      missing_behavioural_layer: "No anchoring or loss aversion mechanism identified.",
      specific_suggestions: ["Reframe around sunk cost fallacy", "Add buyer psychology angle"],
    },
  };
}

describe("runSendGate — rory_approval criterion", () => {
  it("rory_approval passes when roryResult is undefined (backward compat)", () => {
    const input = makeInput(); // no roryResult
    const result = runSendGate(input);
    const rory = result.criteria_results.find(c => c.criterion_id === "rory_approval");
    expect(rory?.pass).toBe(true);
    expect(rory?.observed_value).toBe("not_evaluated");
  });

  it("rory_approval passes when verdict is 'approve'", () => {
    const input = makeInput({ roryResult: makeApproveRoryResult() });
    const result = runSendGate(input);
    const rory = result.criteria_results.find(c => c.criterion_id === "rory_approval");
    expect(rory?.pass).toBe(true);
    expect(rory?.observed_value).toBe("approve");
  });

  it("rory_approval is hard failure when verdict is 'revise'", () => {
    const input = makeInput({ roryResult: makeReviseRoryResult() });
    const result = runSendGate(input);
    const rory = result.criteria_results.find(c => c.criterion_id === "rory_approval");
    expect(rory?.pass).toBe(false);
    expect(rory?.failure_type).toBe("hard");
    expect(result.has_hard_failures).toBe(true);
    expect(result.result).toBe("fail");
  });

  it("gate still passes when roryResult approves and all other criteria pass", () => {
    const input = makeInput({ roryResult: makeApproveRoryResult() });
    const result = runSendGate(input);
    expect(result.result).toBe("pass");
    expect(result.ready_to_send).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Quality score with Rory bonus
// ---------------------------------------------------------------------------

describe("runSendGate — Rory quality score bonus", () => {
  it("quality score is unchanged when roryResult is undefined", () => {
    const withoutRory = runSendGate(makeInput());
    const withRoryUndefined = runSendGate(makeInput({ roryResult: undefined }));
    expect(withoutRory.memo_quality_score).toBe(withRoryUndefined.memo_quality_score);
  });

  it("quality score increases when roryResult is present with high dim scores", () => {
    const withoutRory = runSendGate(makeInput()).memo_quality_score;
    const withRory = runSendGate(makeInput({ roryResult: makeApproveRoryResult() })).memo_quality_score;
    expect(withRory).toBeGreaterThan(withoutRory);
  });

  it("Rory bonus is additive: sum of 4 dims / 20 * 10, rounded", () => {
    const rory = makeApproveRoryResult();
    // dims: 4+4+3+4 = 15 → 15/20*10 = 7.5 → rounds to 8
    const withoutRory = runSendGate(makeInput()).memo_quality_score;
    const withRory = runSendGate(makeInput({ roryResult: rory })).memo_quality_score;
    expect(withRory - withoutRory).toBe(8);
  });

  it("quality score is capped at 100 even with Rory bonus", () => {
    // Max out everything to push score above 100
    const allFiveCritic = makePassCriticResult({
      dimensions: {
        evidence_grounding: { score: 5, pass: true, notes: "" },
        commercial_sharpness: { score: 5, pass: true, notes: "" },
        pattern_clarity: { score: 5, pass: true, notes: "" },
        signal_density: { score: 5, pass: true, notes: "" },
        cta_clarity: { score: 5, pass: true, notes: "" },
        tone_compliance: { score: 5, pass: true, notes: "" },
      },
    });
    const maxMemo = makeMemo({
      evidence_ids: ["a", "b", "c", "d", "e"],
      word_count: 1000,
    });
    const maxRory = makeApproveRoryResult();
    // Base score = 100, Rory bonus = 8 → should cap at 100
    const result = runSendGate({
      memo: maxMemo,
      criticResult: allFiveCritic,
      adjudication: makeAdjudication(),
      evidencePack: makeEvidencePack(),
      roryResult: maxRory,
    });
    expect(result.memo_quality_score).toBe(100);
  });
});
