/**
 * Adjudication Tests — V3-M2 + V3-M3
 *
 * Tests for adjudicateDiagnosis() and buildMemoBrief():
 *
 * adjudicateDiagnosis:
 *   - full_confidence case (high points, clear gap, diverse tiers)
 *   - conditional case (medium points or gap override)
 *   - exploratory case (low points, weak coverage)
 *   - abort case (insufficient coverage override)
 *   - abort case (low confidence + zero source diversity)
 *   - abort case (score-based: totalPoints ≤ 2)
 *   - blocking_reasons populated on abort
 *   - improvement_suggestions populated on abort
 *   - confidence_caveats non-empty on conditional/exploratory
 *   - source diversity check: all tier-1 → points=0
 *   - source diversity check: mixed tiers with T2/T3 → points=2
 *   - competing archetype gap override: gap ≤ 1 caps full_confidence to conditional
 *   - empty patterns list treated as gap=0
 *
 * buildMemoBrief:
 *   - throws ERR_ADJUDICATION_ABORT when mode=abort
 *   - thesis derived from diagnosis.statement
 *   - hook selected from highest-scoring hook_candidate
 *   - founder_statement hook preferred when founderContext provided
 *   - evidence_spine includes ≥1 diagnosis_support
 *   - evidence_spine includes ≥1 specificity_anchor when available
 *   - word_budget fields match spec
 *   - banned_phrases list includes V3 additions
 *   - confidence_caveats passed through from adjudication
 *   - intervention_framing derived from intervention.type
 *   - required_sections = all 5
 *
 * All tests are fully deterministic — no external API calls, no LLM calls.
 */

import { describe, it, expect } from "vitest";
import { adjudicateDiagnosis } from "../memo/adjudicate-diagnosis.js";
import type { AdjudicateDiagnosisInput } from "../memo/adjudicate-diagnosis.js";
import { buildMemoBrief, BANNED_PHRASES, INTERVENTION_FRAMING, CTA_BY_INTERVENTION } from "../memo/build-memo-brief.js";
import type { BuildMemoBriefInput } from "../memo/build-memo-brief.js";
import type { Diagnosis } from "../../intelligence-v2/types/diagnosis.js";
import type { Pattern } from "../../intelligence-v2/types/pattern.js";
import type { Mechanism } from "../../intelligence-v2/types/mechanism.js";
import type { InterventionOpportunity } from "../../intelligence-v2/types/intervention.js";
import type { EvidencePack, EvidencePackRecord, PackQuality } from "../types/evidence-pack.js";
import type { AdjudicationResult } from "../types/adjudication.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDiagnosis(overrides?: Partial<Diagnosis>): Diagnosis {
  return {
    id: "diag_001",
    company_id: "test-co",
    type: "enterprise_theatre",
    statement: "Enterprise positioning without enterprise evidence",
    confidence: "high",
    supporting_pattern_ids: [],
    counterevidence_refs: [],
    evidence_refs: ["ev_001", "ev_002"],
    ...overrides,
  };
}

function makePattern(archetype: string, weight: number): Pattern {
  return {
    id: `pat_${archetype}`,
    company_id: "test-co",
    archetype: archetype as Pattern["archetype"],
    title: `${archetype} pattern`,
    description: "test",
    tension_ids: [],
    signal_ids: [],
    evidence_refs: [],
    confidence: "medium",
    weight,
  };
}

function makePackRecord(
  id: string,
  sourceTier: 1 | 2 | 3 | 4 | 5,
  totalScore: number,
  roles: EvidencePackRecord["memo_roles"] = [],
  isHookEligible = false,
  evidenceType = "review_record"
): EvidencePackRecord {
  return {
    evidence_id: id,
    source_id: `src_${id}`,
    source_tier: sourceTier,
    evidence_type: evidenceType,
    excerpt: `"${id} excerpt — specific company-named observation with 40% metric"`,
    summary: `Summary for ${id}`,
    confidence: "medium",
    is_inferred: false,
    tags: [],
    scores: {
      commercial_salience: totalScore >= 3 ? 3 : 1,
      specificity: totalScore >= 6 ? 3 : 2,
      customer_voice: sourceTier === 3 ? 3 : sourceTier === 2 ? 2 : 0,
      recency: 1,
    },
    total_score: totalScore,
    memo_roles: roles,
    is_hook_eligible: isHookEligible,
    inclusion_reason: "test",
  };
}

function makeEvidencePack(
  records: EvidencePackRecord[],
  coverage: PackQuality["coverage_assessment"] = "adequate"
): EvidencePack {
  const hookCandidates = records.filter(r => r.is_hook_eligible);
  return {
    pack_id: "pack_test-co_001",
    company_id: "test-co",
    built_at: new Date().toISOString(),
    diagnosis_id: "diag_001",
    records,
    hook_candidates: hookCandidates,
    pack_quality: {
      total_records: records.length,
      hook_candidate_count: hookCandidates.length,
      diagnosis_support_count: records.filter(r => r.memo_roles.includes("diagnosis_support")).length,
      counter_narrative_count: records.filter(r => r.memo_roles.includes("counter_narrative")).length,
      specificity_anchor_count: records.filter(r => r.memo_roles.includes("specificity_anchor")).length,
      average_total_score: records.reduce((s, r) => s + r.total_score, 0) / (records.length || 1),
      coverage_assessment: coverage,
    },
  };
}

/** Build a pack with diverse tiers and good coverage — enough for full_confidence. */
function buildStrongPack(): EvidencePack {
  return makeEvidencePack(
    [
      makePackRecord("ev_001", 3, 10, ["diagnosis_support", "hook_anchor", "counter_narrative"], true),
      makePackRecord("ev_002", 3, 9, ["diagnosis_support", "specificity_anchor", "counter_narrative"], true),
      makePackRecord("ev_003", 2, 7, ["mechanism_illustration"], false),
      makePackRecord("ev_004", 2, 7, ["mechanism_illustration"], false),
      makePackRecord("ev_005", 1, 5, ["intervention_evidence"], false, "pricing_record"),
      makePackRecord("ev_006", 1, 5, ["counter_narrative"], false, "company_claim_record"),
      makePackRecord("ev_007", 3, 8, ["specificity_anchor", "hook_anchor"], true),
    ],
    "adequate"
  );
}

function makeMechanism(id = "mech_001"): Mechanism {
  return {
    id,
    company_id: "test-co",
    type: "investor_signalling",
    statement: "Investor signalling drives positioning",
    plausibility: "high",
    explains_diagnosis_id: "diag_001",
    evidence_refs: ["ev_003"],
  };
}

function makeIntervention(): InterventionOpportunity {
  return {
    id: "int_001",
    company_id: "test-co",
    type: "icp_redefinition",
    statement: "Redefine ICP to reflect actual buyer",
    expected_impact: "high",
    delivery_fit: "high",
    rationale: "ICP mismatch is addressable",
    mechanism_ids: ["mech_001"],
    diagnosis_id: "diag_001",
    evidence_refs: ["ev_005"],
  };
}

function makeAdjudicationResult(
  mode: AdjudicationResult["adjudication_mode"],
  framing: AdjudicationResult["recommended_memo_framing"]
): AdjudicationResult {
  return {
    result_id: "adj_test-co_001",
    company_id: "test-co",
    adjudicated_at: new Date().toISOString(),
    adjudication_mode: mode,
    diagnosis_id: "diag_001",
    checks: {
      diagnosis_confidence: { v2_confidence: "high", points: 3 },
      evidence_pack_coverage: { coverage_assessment: "adequate", points: 2 },
      source_diversity: { distinct_tiers: 3, has_tier2_or_3: true, points: 2 },
      competing_archetype_gap: { winning_score: 8, runner_up_score: 3, gap: 5, points: 2 },
      total_points: 9,
    },
    recommended_memo_framing: framing,
    confidence_caveats: mode === "conditional" || mode === "exploratory"
      ? ["Do not assert the diagnosis with certainty"]
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Tests: adjudicateDiagnosis
// ---------------------------------------------------------------------------

describe("adjudicateDiagnosis — mode determination", () => {
  it("returns full_confidence for high diagnosis confidence, strong pack, diverse tiers, clear gap", () => {
    const pack = buildStrongPack();
    // Override to 'strong' coverage for this test
    const strongPack: EvidencePack = {
      ...pack,
      pack_quality: { ...pack.pack_quality, coverage_assessment: "strong" },
    };
    const patterns = [
      makePattern("enterprise_theatre", 8),
      makePattern("narrative_distribution_mismatch", 3),
    ];
    const result = adjudicateDiagnosis({
      diagnosis: makeDiagnosis({ confidence: "high" }),
      evidencePack: strongPack,
      patterns,
    });
    // 3 (diag) + 3 (coverage=strong) + 2 (diversity: T1/T2/T3) + 2 (gap=5≥4) = 10
    expect(result.adjudication_mode).toBe("full_confidence");
    expect(result.recommended_memo_framing).toBe("assertive");
    expect(result.adjudication_report).toBeUndefined();
    expect(result.confidence_caveats).toBeUndefined();
  });

  it("returns conditional for medium diagnosis confidence with adequate coverage", () => {
    const pack = buildStrongPack();
    const patterns = [
      makePattern("enterprise_theatre", 6),
      makePattern("narrative_distribution_mismatch", 3),
    ];
    const result = adjudicateDiagnosis({
      diagnosis: makeDiagnosis({ confidence: "medium" }),
      evidencePack: pack,
      patterns,
    });
    // 2 (diag=medium) + 2 (coverage=adequate) + 2 (diversity) + 2 (gap=3≥2→points=1?wait gap=3→1 pt) = 7
    // Actually gap=6-3=3 which is 2-3 range → points=1; total= 2+2+2+1=7 → conditional
    expect(result.adjudication_mode).toBe("conditional");
    expect(result.recommended_memo_framing).toBe("indicative");
    expect(result.confidence_caveats).toBeDefined();
    expect(result.confidence_caveats!.length).toBeGreaterThan(0);
  });

  it("returns exploratory for low-medium coverage and medium confidence", () => {
    const pack = makeEvidencePack(
      [
        makePackRecord("ev_001", 1, 7, ["diagnosis_support", "hook_anchor"], true),
        makePackRecord("ev_002", 1, 6, ["hook_anchor"], true),
        makePackRecord("ev_003", 1, 5, ["specificity_anchor"], false),
        makePackRecord("ev_004", 1, 4, [], false),
        makePackRecord("ev_005", 1, 4, [], false),
      ],
      "weak" // coverage=weak → points=1
    );
    // source_diversity: only tier 1 → points=0
    // diagnosis confidence: medium → points=2
    // gap: no patterns → points=0
    // total = 2+1+0+0 = 3 → exploratory
    const result = adjudicateDiagnosis({
      diagnosis: makeDiagnosis({ confidence: "medium" }),
      evidencePack: pack,
      patterns: [], // no patterns → gap=0
    });
    expect(result.adjudication_mode).toBe("exploratory");
    expect(result.recommended_memo_framing).toBe("hypothesis");
    expect(result.confidence_caveats).toBeDefined();
    expect(result.confidence_caveats!.length).toBeGreaterThan(0);
  });

  it("returns abort when total points ≤ 2", () => {
    const pack = makeEvidencePack(
      [
        makePackRecord("ev_001", 1, 5, ["hook_anchor"], true),
        makePackRecord("ev_002", 1, 4, [], false),
        makePackRecord("ev_003", 1, 4, [], false),
        makePackRecord("ev_004", 1, 3, [], false),
        makePackRecord("ev_005", 1, 3, [], false),
      ],
      "weak" // coverage=weak → 1 pt
    );
    // low diagnosis confidence (0) + weak coverage (1) + no diversity (0) + no gap (0) = 1 → abort
    // But also: low confidence + zero diversity → force abort override anyway
    const result = adjudicateDiagnosis({
      diagnosis: makeDiagnosis({ confidence: "low" }),
      evidencePack: pack,
      patterns: [],
    });
    expect(result.adjudication_mode).toBe("abort");
    expect(result.recommended_memo_framing).toBe("blocked");
  });
});

describe("adjudicateDiagnosis — override rules", () => {
  it("forces abort when coverage_assessment = 'insufficient'", () => {
    // Even with high diagnosis confidence, insufficient coverage → abort
    const pack = makeEvidencePack(
      [
        makePackRecord("ev_001", 3, 8, ["diagnosis_support", "hook_anchor"], true),
        makePackRecord("ev_002", 2, 7, ["mechanism_illustration"], false),
        makePackRecord("ev_003", 1, 6, ["specificity_anchor"], false),
      ],
      "insufficient" // forces abort regardless of other scores
    );
    const result = adjudicateDiagnosis({
      diagnosis: makeDiagnosis({ confidence: "high" }),
      evidencePack: pack,
      patterns: [makePattern("enterprise_theatre", 10), makePattern("founder_led_sales_ceiling", 3)],
    });
    expect(result.adjudication_mode).toBe("abort");
    expect(result.adjudication_report).toBeDefined();
    expect(result.adjudication_report!.blocking_reasons.length).toBeGreaterThan(0);
    expect(result.adjudication_report!.blocking_reasons[0]).toContain("insufficient");
  });

  it("forces abort when diagnosis.confidence = 'low' AND source_diversity.points = 0", () => {
    const pack = makeEvidencePack(
      [
        // All tier 1 — source_diversity.points = 0
        makePackRecord("ev_001", 1, 7, ["diagnosis_support", "hook_anchor"], true),
        makePackRecord("ev_002", 1, 6, ["hook_anchor"], true),
        makePackRecord("ev_003", 1, 5, ["specificity_anchor"], false),
        makePackRecord("ev_004", 1, 4, [], false),
        makePackRecord("ev_005", 1, 4, [], false),
      ],
      "adequate"
    );
    const result = adjudicateDiagnosis({
      diagnosis: makeDiagnosis({ confidence: "low" }),
      evidencePack: pack,
      patterns: [],
    });
    expect(result.adjudication_mode).toBe("abort");
    expect(result.adjudication_report!.blocking_reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining("low"),
        expect.stringContaining("zero source diversity"),
      ])
    );
  });

  it("caps mode at conditional when competing_archetype_gap ≤ 1 (never full_confidence)", () => {
    // Set up for 8+ points base score (would be full_confidence)...
    const pack: EvidencePack = {
      ...buildStrongPack(),
      pack_quality: {
        ...buildStrongPack().pack_quality,
        coverage_assessment: "strong",
      },
    };
    // ...but gap = 1 → must cap at conditional
    const patterns = [
      makePattern("enterprise_theatre", 5),
      makePattern("narrative_distribution_mismatch", 5), // gap = 0
    ];
    const result = adjudicateDiagnosis({
      diagnosis: makeDiagnosis({ confidence: "high" }),
      evidencePack: pack,
      patterns,
    });
    // total would be 3+3+2+0 = 8 → full_confidence, but gap ≤ 1 override → conditional
    expect(result.adjudication_mode).toBe("conditional");
    expect(result.checks.competing_archetype_gap.gap).toBe(0);
    expect(result.recommended_memo_framing).toBe("indicative");
  });
});

describe("adjudicateDiagnosis — source diversity check", () => {
  it("points=0 when all records are tier 1", () => {
    const pack = makeEvidencePack(
      Array.from({ length: 5 }, (_, i) =>
        makePackRecord(`ev_00${i + 1}`, 1, 7, ["diagnosis_support", "hook_anchor"], true)
      ),
      "adequate"
    );
    const result = adjudicateDiagnosis({
      diagnosis: makeDiagnosis(),
      evidencePack: pack,
      patterns: [],
    });
    expect(result.checks.source_diversity.points).toBe(0);
    expect(result.checks.source_diversity.has_tier2_or_3).toBe(false);
    expect(result.checks.source_diversity.distinct_tiers).toBe(1);
  });

  it("points=2 when pack has tier 1, 2, and 3 records", () => {
    const pack = buildStrongPack(); // has tiers 1, 2, 3
    const result = adjudicateDiagnosis({
      diagnosis: makeDiagnosis(),
      evidencePack: pack,
      patterns: [],
    });
    expect(result.checks.source_diversity.points).toBe(2);
    expect(result.checks.source_diversity.has_tier2_or_3).toBe(true);
  });

  it("points=1 when pack has tier 1 and tier 4 (no tier 2/3)", () => {
    const pack = makeEvidencePack(
      [
        makePackRecord("ev_001", 1, 7, ["diagnosis_support", "hook_anchor"], true),
        makePackRecord("ev_002", 4, 6, ["mechanism_illustration"], false),
        makePackRecord("ev_003", 1, 5, ["specificity_anchor"], false),
        makePackRecord("ev_004", 4, 5, [], false),
        makePackRecord("ev_005", 1, 4, [], false),
      ],
      "adequate"
    );
    const result = adjudicateDiagnosis({
      diagnosis: makeDiagnosis(),
      evidencePack: pack,
      patterns: [],
    });
    expect(result.checks.source_diversity.points).toBe(1);
    expect(result.checks.source_diversity.has_tier2_or_3).toBe(false);
    expect(result.checks.source_diversity.distinct_tiers).toBe(2);
  });
});

describe("adjudicateDiagnosis — archetype gap check", () => {
  it("gap=0 points=0 when patterns list is empty", () => {
    const pack = buildStrongPack();
    const result = adjudicateDiagnosis({
      diagnosis: makeDiagnosis(),
      evidencePack: pack,
      patterns: [],
    });
    expect(result.checks.competing_archetype_gap.gap).toBe(0);
    expect(result.checks.competing_archetype_gap.points).toBe(0);
    expect(result.checks.competing_archetype_gap.winning_score).toBe(0);
  });

  it("points=2 when winning score is ≥4 above runner-up", () => {
    const pack = buildStrongPack();
    const patterns = [
      makePattern("enterprise_theatre", 8),
      makePattern("founder_led_sales_ceiling", 2), // gap = 6
    ];
    const result = adjudicateDiagnosis({
      diagnosis: makeDiagnosis(),
      evidencePack: pack,
      patterns,
    });
    expect(result.checks.competing_archetype_gap.gap).toBe(6);
    expect(result.checks.competing_archetype_gap.points).toBe(2);
  });

  it("points=1 when gap is 2-3", () => {
    const pack = buildStrongPack();
    const patterns = [
      makePattern("enterprise_theatre", 7),
      makePattern("distribution_fragility", 4), // gap = 3
    ];
    const result = adjudicateDiagnosis({
      diagnosis: makeDiagnosis(),
      evidencePack: pack,
      patterns,
    });
    expect(result.checks.competing_archetype_gap.gap).toBe(3);
    expect(result.checks.competing_archetype_gap.points).toBe(1);
  });

  it("sums weights per archetype across multiple patterns", () => {
    const pack = buildStrongPack();
    const patterns = [
      makePattern("enterprise_theatre", 4),
      makePattern("enterprise_theatre", 3), // same archetype, total = 7
      makePattern("distribution_fragility", 4), // gap = 3
    ];
    const result = adjudicateDiagnosis({
      diagnosis: makeDiagnosis(),
      evidencePack: pack,
      patterns,
    });
    expect(result.checks.competing_archetype_gap.winning_score).toBe(7);
    expect(result.checks.competing_archetype_gap.runner_up_score).toBe(4);
    expect(result.checks.competing_archetype_gap.gap).toBe(3);
  });
});

describe("adjudicateDiagnosis — abort report quality", () => {
  it("adjudication_report has ≥1 blocking_reason and ≥1 improvement_suggestion on abort", () => {
    const pack = makeEvidencePack(
      Array.from({ length: 5 }, (_, i) =>
        makePackRecord(`ev_00${i + 1}`, 1, 5, ["hook_anchor"], i < 2)
      ),
      "insufficient"
    );
    const result = adjudicateDiagnosis({
      diagnosis: makeDiagnosis({ confidence: "high" }),
      evidencePack: pack,
      patterns: [],
    });
    expect(result.adjudication_mode).toBe("abort");
    expect(result.adjudication_report!.blocking_reasons.length).toBeGreaterThanOrEqual(1);
    expect(result.adjudication_report!.improvement_suggestions.length).toBeGreaterThanOrEqual(1);
  });

  it("abort report improvement_suggestions mention Tier 3 sources when none present", () => {
    const pack = makeEvidencePack(
      Array.from({ length: 5 }, (_, i) =>
        makePackRecord(`ev_00${i + 1}`, 1, 5, ["hook_anchor"], i < 2)
      ),
      "insufficient"
    );
    const result = adjudicateDiagnosis({
      diagnosis: makeDiagnosis({ confidence: "high" }),
      evidencePack: pack,
      patterns: [],
    });
    const suggestions = result.adjudication_report!.improvement_suggestions;
    expect(suggestions.some(s => /tier 3|trustpilot|g2|capterra/i.test(s))).toBe(true);
  });
});

describe("adjudicateDiagnosis — confidence caveats", () => {
  it("confidence_caveats is undefined for full_confidence mode", () => {
    const pack: EvidencePack = {
      ...buildStrongPack(),
      pack_quality: { ...buildStrongPack().pack_quality, coverage_assessment: "strong" },
    };
    const patterns = [
      makePattern("enterprise_theatre", 8),
      makePattern("distribution_fragility", 2),
    ];
    const result = adjudicateDiagnosis({
      diagnosis: makeDiagnosis({ confidence: "high" }),
      evidencePack: pack,
      patterns,
    });
    expect(result.adjudication_mode).toBe("full_confidence");
    expect(result.confidence_caveats).toBeUndefined();
  });

  it("confidence_caveats is non-empty for conditional mode", () => {
    const pack = buildStrongPack();
    const result = adjudicateDiagnosis({
      diagnosis: makeDiagnosis({ confidence: "medium" }),
      evidencePack: pack,
      patterns: [],
    });
    // medium confidence + empty patterns (gap=0 → cap conditional if not full already)
    expect(["conditional", "exploratory"].includes(result.adjudication_mode)).toBe(true);
    expect(result.confidence_caveats!.length).toBeGreaterThan(0);
  });

  it("confidence_caveats mentions low confidence when v2_confidence = low", () => {
    const pack = makeEvidencePack(
      [
        makePackRecord("ev_001", 2, 8, ["diagnosis_support", "hook_anchor"], true),
        makePackRecord("ev_002", 3, 7, ["counter_narrative"], false),
        makePackRecord("ev_003", 2, 6, ["specificity_anchor"], false),
        makePackRecord("ev_004", 2, 5, [], false),
        makePackRecord("ev_005", 2, 5, [], false),
      ],
      "adequate"
    );
    const patterns = [
      makePattern("enterprise_theatre", 6),
      makePattern("distribution_fragility", 3),
    ];
    const result = adjudicateDiagnosis({
      diagnosis: makeDiagnosis({ confidence: "low" }),
      evidencePack: pack,
      patterns,
    });
    // low confidence + has tier2/3 → no abort override from that rule
    // total: 0+2+2+1=5 → conditional (or abort if override triggers... but tier2/3 present so no abort)
    if (result.adjudication_mode !== "abort") {
      expect(result.confidence_caveats!.some(c => /low/i.test(c))).toBe(true);
    }
  });
});

describe("adjudicateDiagnosis — output shape", () => {
  it("result_id follows pattern adj_<company_id>_<timestamp>", () => {
    const pack = buildStrongPack();
    const result = adjudicateDiagnosis({
      diagnosis: makeDiagnosis(),
      evidencePack: pack,
      patterns: [],
    });
    expect(result.result_id).toMatch(/^adj_test-co_\d+$/);
  });

  it("diagnosis_id matches diagnosis.id", () => {
    const pack = buildStrongPack();
    const result = adjudicateDiagnosis({
      diagnosis: makeDiagnosis({ id: "diag_xyz" }),
      evidencePack: pack,
      patterns: [],
    });
    expect(result.diagnosis_id).toBe("diag_xyz");
  });

  it("checks.total_points equals sum of all 4 check points", () => {
    const pack = buildStrongPack();
    const patterns = [
      makePattern("enterprise_theatre", 7),
      makePattern("distribution_fragility", 4),
    ];
    const result = adjudicateDiagnosis({
      diagnosis: makeDiagnosis({ confidence: "medium" }),
      evidencePack: pack,
      patterns,
    });
    const { diagnosis_confidence, evidence_pack_coverage, source_diversity, competing_archetype_gap } =
      result.checks;
    const expectedTotal =
      diagnosis_confidence.points +
      evidence_pack_coverage.points +
      source_diversity.points +
      competing_archetype_gap.points;
    expect(result.checks.total_points).toBe(expectedTotal);
  });
});

// ---------------------------------------------------------------------------
// Tests: buildMemoBrief
// ---------------------------------------------------------------------------

describe("buildMemoBrief — abort guard", () => {
  it("throws ERR_ADJUDICATION_ABORT when adjudication_mode = 'abort'", () => {
    const abortAdj: AdjudicationResult = {
      ...makeAdjudicationResult("abort", "blocked"),
      adjudication_report: {
        company_id: "test-co",
        generated_at: new Date().toISOString(),
        total_points: 1,
        mode: "abort",
        blocking_reasons: ["Insufficient evidence"],
        improvement_suggestions: ["Add Tier 3 sources"],
      },
    };
    expect(() =>
      buildMemoBrief({
        adjudication: abortAdj,
        diagnosis: makeDiagnosis(),
        mechanisms: [makeMechanism()],
        intervention: makeIntervention(),
        evidencePack: buildStrongPack(),
      })
    ).toThrow("ERR_ADJUDICATION_ABORT");
  });
});

describe("buildMemoBrief — thesis", () => {
  it("thesis is derived from diagnosis.statement for assertive framing", () => {
    const adj = makeAdjudicationResult("full_confidence", "assertive");
    const brief = buildMemoBrief({
      adjudication: adj,
      diagnosis: makeDiagnosis({ statement: "Enterprise positioning without enterprise evidence" }),
      mechanisms: [makeMechanism()],
      intervention: makeIntervention(),
      evidencePack: buildStrongPack(),
    });
    expect(brief.thesis).toBe("Enterprise positioning without enterprise evidence");
  });

  it("thesis for exploratory framing is prefixed with hypothesis marker", () => {
    const adj = makeAdjudicationResult("exploratory", "hypothesis");
    const brief = buildMemoBrief({
      adjudication: adj,
      diagnosis: makeDiagnosis({ statement: "Founder dependency blocking scale" }),
      mechanisms: [makeMechanism()],
      intervention: makeIntervention(),
      evidencePack: buildStrongPack(),
    });
    // Should contain the original statement content
    expect(brief.thesis.toLowerCase()).toContain("founder dependency blocking scale");
    // Should not just repeat the taxonomy label
    expect(brief.thesis).not.toBe("founder_led_sales_ceiling");
  });
});

describe("buildMemoBrief — hook selection", () => {
  it("selects highest-scoring hook candidate", () => {
    const adj = makeAdjudicationResult("conditional", "indicative");
    const brief = buildMemoBrief({
      adjudication: adj,
      diagnosis: makeDiagnosis(),
      mechanisms: [makeMechanism()],
      intervention: makeIntervention(),
      evidencePack: buildStrongPack(),
    });
    expect(brief.hook).toBeDefined();
    expect(brief.hook.evidence_id).toBeTruthy();
    expect(brief.hook.excerpt).toBeTruthy();
    expect(brief.hook.framing_instruction).toBeTruthy();
    // Hook must come from hook_candidates
    const pack = buildStrongPack();
    const candidateIds = pack.hook_candidates.map(c => c.evidence_id);
    expect(candidateIds).toContain(brief.hook.evidence_id);
  });

  it("prefers founder_statement hook when founderName provided and score ≥ 6", () => {
    // Build a pack with a founder_statement hook candidate
    const founderRecord = makePackRecord(
      "ev_founder",
      2,
      8,
      ["hook_anchor", "diagnosis_support"],
      true,
      "leadership_record" // maps to founder_statement hook type
    );
    const pack = makeEvidencePack(
      [
        founderRecord,
        makePackRecord("ev_001", 3, 10, ["diagnosis_support", "hook_anchor", "counter_narrative"], true),
        makePackRecord("ev_002", 3, 9, ["specificity_anchor"], false),
        makePackRecord("ev_003", 2, 7, ["mechanism_illustration"], false),
        makePackRecord("ev_004", 1, 5, [], false),
      ],
      "adequate"
    );
    const adj = makeAdjudicationResult("full_confidence", "assertive");
    const brief = buildMemoBrief({
      adjudication: adj,
      diagnosis: makeDiagnosis(),
      mechanisms: [makeMechanism()],
      intervention: makeIntervention(),
      evidencePack: pack,
      founderContext: { name: "Jane Smith" },
    });
    expect(brief.hook.evidence_id).toBe("ev_founder");
    expect(brief.hook.hook_type).toBe("founder_statement");
  });

  it("hook_type is customer_quote for review_record evidence", () => {
    const adj = makeAdjudicationResult("conditional", "indicative");
    const brief = buildMemoBrief({
      adjudication: adj,
      diagnosis: makeDiagnosis(),
      mechanisms: [makeMechanism()],
      intervention: makeIntervention(),
      evidencePack: buildStrongPack(), // first hook candidate is ev_001, review_record
    });
    // ev_001 is a review_record → customer_quote hook type
    expect(brief.hook.hook_type).toBe("customer_quote");
  });
});

describe("buildMemoBrief — evidence spine", () => {
  it("evidence_spine has ≥1 diagnosis_support record", () => {
    const adj = makeAdjudicationResult("conditional", "indicative");
    const brief = buildMemoBrief({
      adjudication: adj,
      diagnosis: makeDiagnosis(),
      mechanisms: [makeMechanism()],
      intervention: makeIntervention(),
      evidencePack: buildStrongPack(),
    });
    expect(brief.evidence_spine.some(r => r.memo_role === "diagnosis_support")).toBe(true);
  });

  it("evidence_spine has ≥1 specificity_anchor when available", () => {
    const adj = makeAdjudicationResult("conditional", "indicative");
    const brief = buildMemoBrief({
      adjudication: adj,
      diagnosis: makeDiagnosis(),
      mechanisms: [makeMechanism()],
      intervention: makeIntervention(),
      evidencePack: buildStrongPack(),
    });
    // buildStrongPack has specificity_anchor records
    expect(brief.evidence_spine.some(r => r.memo_role === "specificity_anchor")).toBe(true);
  });

  it("evidence_spine has 3–5 records", () => {
    const adj = makeAdjudicationResult("conditional", "indicative");
    const brief = buildMemoBrief({
      adjudication: adj,
      diagnosis: makeDiagnosis(),
      mechanisms: [makeMechanism()],
      intervention: makeIntervention(),
      evidencePack: buildStrongPack(),
    });
    expect(brief.evidence_spine.length).toBeGreaterThanOrEqual(3);
    expect(brief.evidence_spine.length).toBeLessThanOrEqual(5);
  });

  it("each spine record has a non-empty usage_instruction", () => {
    const adj = makeAdjudicationResult("conditional", "indicative");
    const brief = buildMemoBrief({
      adjudication: adj,
      diagnosis: makeDiagnosis(),
      mechanisms: [makeMechanism()],
      intervention: makeIntervention(),
      evidencePack: buildStrongPack(),
    });
    for (const record of brief.evidence_spine) {
      expect(record.usage_instruction.length).toBeGreaterThan(0);
    }
  });
});

describe("buildMemoBrief — word budget", () => {
  it("word_budget matches spec values", () => {
    const adj = makeAdjudicationResult("conditional", "indicative");
    const brief = buildMemoBrief({
      adjudication: adj,
      diagnosis: makeDiagnosis(),
      mechanisms: [makeMechanism()],
      intervention: makeIntervention(),
      evidencePack: buildStrongPack(),
    });
    expect(brief.word_budget.target_min).toBe(500);
    expect(brief.word_budget.target_max).toBe(700);
    expect(brief.word_budget.hard_max).toBe(850);
  });
});

describe("buildMemoBrief — banned phrases", () => {
  it("BANNED_PHRASES export includes V3 additions", () => {
    const v3Phrases = ["game-changing", "thought leader", "world-class", "reach out", "circle back"];
    for (const phrase of v3Phrases) {
      expect(BANNED_PHRASES).toContain(phrase);
    }
  });

  it("BANNED_PHRASES export includes V2 phrases", () => {
    // V2 list includes these
    const v2Phrases = ["ecosystem", "synergy", "well positioned", "actionable insights"];
    for (const phrase of v2Phrases) {
      expect(BANNED_PHRASES).toContain(phrase);
    }
  });

  it("banned_phrases field on MemoBrief is non-empty", () => {
    const adj = makeAdjudicationResult("conditional", "indicative");
    const brief = buildMemoBrief({
      adjudication: adj,
      diagnosis: makeDiagnosis(),
      mechanisms: [makeMechanism()],
      intervention: makeIntervention(),
      evidencePack: buildStrongPack(),
    });
    expect(brief.banned_phrases.length).toBeGreaterThan(10);
    expect(brief.banned_phrases).toContain("game-changing");
    expect(brief.banned_phrases).toContain("ecosystem");
  });

  it("BANNED_PHRASES has no duplicates", () => {
    const unique = new Set(BANNED_PHRASES);
    expect(unique.size).toBe(BANNED_PHRASES.length);
  });
});

describe("buildMemoBrief — confidence caveats and adjudication passthrough", () => {
  it("confidence_caveats from adjudication are passed into brief", () => {
    const adj = makeAdjudicationResult("conditional", "indicative");
    adj.confidence_caveats = ["Do not assert pricing as confirmed", "External evidence is limited"];
    const brief = buildMemoBrief({
      adjudication: adj,
      diagnosis: makeDiagnosis(),
      mechanisms: [makeMechanism()],
      intervention: makeIntervention(),
      evidencePack: buildStrongPack(),
    });
    expect(brief.confidence_caveats).toEqual(adj.confidence_caveats);
  });

  it("confidence_caveats is empty array when adjudication has no caveats", () => {
    const adj = makeAdjudicationResult("full_confidence", "assertive");
    adj.confidence_caveats = undefined;
    const brief = buildMemoBrief({
      adjudication: adj,
      diagnosis: makeDiagnosis(),
      mechanisms: [makeMechanism()],
      intervention: makeIntervention(),
      evidencePack: buildStrongPack(),
    });
    expect(brief.confidence_caveats).toEqual([]);
  });

  it("adjudication_mode is passed through to brief", () => {
    const adj = makeAdjudicationResult("conditional", "indicative");
    const brief = buildMemoBrief({
      adjudication: adj,
      diagnosis: makeDiagnosis(),
      mechanisms: [makeMechanism()],
      intervention: makeIntervention(),
      evidencePack: buildStrongPack(),
    });
    expect(brief.adjudication_mode).toBe("conditional");
    expect(brief.memo_framing).toBe("indicative");
  });
});

describe("buildMemoBrief — intervention framing and CTA", () => {
  it("intervention_framing is derived from intervention.type", () => {
    const adj = makeAdjudicationResult("conditional", "indicative");
    const brief = buildMemoBrief({
      adjudication: adj,
      diagnosis: makeDiagnosis(),
      mechanisms: [makeMechanism()],
      intervention: makeIntervention(), // type: icp_redefinition
      evidencePack: buildStrongPack(),
    });
    expect(brief.intervention_framing).toContain("buyer profile");
    expect(brief.intervention_framing).toContain("Frame as:");
  });

  it("cta is a non-question direct ask", () => {
    const adj = makeAdjudicationResult("conditional", "indicative");
    const brief = buildMemoBrief({
      adjudication: adj,
      diagnosis: makeDiagnosis(),
      mechanisms: [makeMechanism()],
      intervention: makeIntervention(),
      evidencePack: buildStrongPack(),
    });
    expect(brief.cta).toBeTruthy();
    // CTA should not end with "?" (not a question)
    expect(brief.cta.trim()).not.toMatch(/\?$/);
    // CTA should contain a single clear action
    expect(brief.cta.length).toBeGreaterThan(20);
  });

  it("all 5 required_sections are present", () => {
    const adj = makeAdjudicationResult("conditional", "indicative");
    const brief = buildMemoBrief({
      adjudication: adj,
      diagnosis: makeDiagnosis(),
      mechanisms: [makeMechanism()],
      intervention: makeIntervention(),
      evidencePack: buildStrongPack(),
    });
    expect(brief.required_sections).toContain("observation");
    expect(brief.required_sections).toContain("what_this_means");
    expect(brief.required_sections).toContain("why_this_is_happening");
    expect(brief.required_sections).toContain("what_we_would_change");
    expect(brief.required_sections).toContain("cta");
    expect(brief.required_sections.length).toBe(5);
  });
});

describe("buildMemoBrief — no invented fields", () => {
  it("all evidence_spine record excerpt fields come from the evidence pack verbatim", () => {
    const pack = buildStrongPack();
    const adj = makeAdjudicationResult("conditional", "indicative");
    const brief = buildMemoBrief({
      adjudication: adj,
      diagnosis: makeDiagnosis(),
      mechanisms: [makeMechanism()],
      intervention: makeIntervention(),
      evidencePack: pack,
    });
    const packExcerpts = new Map(pack.records.map(r => [r.evidence_id, r.excerpt]));
    for (const spine of brief.evidence_spine) {
      expect(brief.evidence_spine.every(r => packExcerpts.has(r.evidence_id))).toBe(true);
      expect(spine.excerpt).toBe(packExcerpts.get(spine.evidence_id));
    }
  });

  it("brief_id follows brief_<company_id>_<timestamp> format", () => {
    const adj = makeAdjudicationResult("conditional", "indicative");
    const brief = buildMemoBrief({
      adjudication: adj,
      diagnosis: makeDiagnosis(),
      mechanisms: [makeMechanism()],
      intervention: makeIntervention(),
      evidencePack: buildStrongPack(),
    });
    expect(brief.brief_id).toMatch(/^brief_test-co_\d+$/);
  });

  it("target_company uses provided name over company_id slug", () => {
    const adj = makeAdjudicationResult("conditional", "indicative");
    const brief = buildMemoBrief({
      adjudication: adj,
      diagnosis: makeDiagnosis(),
      mechanisms: [makeMechanism()],
      intervention: makeIntervention(),
      evidencePack: buildStrongPack(),
      target_company_name: "Acme Corp",
    });
    expect(brief.target_company).toBe("Acme Corp");
  });
});

// ---------------------------------------------------------------------------
// Regression guard: intervention framing + CTA must not drift toward
// founder-removal language for sales_motion_redesign or other archetypes
// ---------------------------------------------------------------------------

describe("INTERVENTION_FRAMING — regression guard", () => {
  it("positioning_reset references positioning or clarify", () => {
    const text = INTERVENTION_FRAMING.positioning_reset.toLowerCase();
    expect(text.includes("clarif") || text.includes("position")).toBe(true);
  });

  it("icp_redefinition references buyer profile or ICP", () => {
    const text = INTERVENTION_FRAMING.icp_redefinition.toLowerCase();
    expect(text.includes("buyer profile") || text.includes("icp") || text.includes("buyer")).toBe(true);
  });

  it("sales_motion_redesign references buyer journey or pipeline (not founder removal)", () => {
    const text = INTERVENTION_FRAMING.sales_motion_redesign.toLowerCase();
    expect(text.includes("buyer") || text.includes("pipeline")).toBe(true);
    expect(text.includes("without founder involvement")).toBe(false);
    expect(text.includes("without you")).toBe(false);
  });

  it("founder_gtm_transition references institutional credibility or closing", () => {
    const text = INTERVENTION_FRAMING.founder_gtm_transition.toLowerCase();
    expect(text.includes("institutional") || text.includes("credib") || text.includes("close")).toBe(true);
  });

  it("distribution_strategy_reset references distribution or channel", () => {
    const text = INTERVENTION_FRAMING.distribution_strategy_reset.toLowerCase();
    expect(text.includes("distribution") || text.includes("channel")).toBe(true);
  });

  it("proof_architecture_design references proof or buyer", () => {
    const text = INTERVENTION_FRAMING.proof_architecture_design.toLowerCase();
    expect(text.includes("proof") || text.includes("buyer")).toBe(true);
  });

  it("sales_motion_redesign and founder_gtm_transition are semantically distinct", () => {
    const smr = INTERVENTION_FRAMING.sales_motion_redesign.toLowerCase();
    const fgt = INTERVENTION_FRAMING.founder_gtm_transition.toLowerCase();
    expect(smr.includes("institutional") && fgt.includes("institutional")).toBe(false);
  });
});

describe("CTA_BY_INTERVENTION — regression guard", () => {
  it("sales_motion_redesign CTA does not use founder-removal language", () => {
    const text = CTA_BY_INTERVENTION.sales_motion_redesign.toLowerCase();
    expect(text.includes("without you in every deal")).toBe(false);
    expect(text.includes("without you in the room")).toBe(false);
  });

  it("founder_gtm_transition CTA retains closing/credibility language", () => {
    const text = CTA_BY_INTERVENTION.founder_gtm_transition.toLowerCase();
    expect(text.includes("close") || text.includes("room") || text.includes("credib")).toBe(true);
  });

  it("all 6 CTA entries are non-empty strings", () => {
    const types: Array<keyof typeof CTA_BY_INTERVENTION> = [
      "positioning_reset",
      "icp_redefinition",
      "sales_motion_redesign",
      "founder_gtm_transition",
      "distribution_strategy_reset",
      "proof_architecture_design",
    ];
    for (const t of types) {
      expect(typeof CTA_BY_INTERVENTION[t]).toBe("string");
      expect(CTA_BY_INTERVENTION[t].length).toBeGreaterThan(20);
    }
  });
});
