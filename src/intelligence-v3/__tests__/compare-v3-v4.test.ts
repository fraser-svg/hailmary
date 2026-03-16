/**
 * Compare V3 vs V4 Harness — Unit Tests
 *
 * Tests the deterministic logic in compare-v3-v4.ts:
 *   - buildComparisonSummary correctness
 *   - Heuristic functions (hasConsequenceLanguage, hasCompanyProperNoun, mechanismsAppearDistinct)
 *   - RunComparison serialisation / deserialisation roundtrip
 *   - Mock client factory
 *   - MOCK_WRITER_JSON and MOCK_CRITIC_JSON parse as valid JSON
 *   - FIXTURE_SYNTH_MOCKS coverage check
 */

import { describe, it, expect } from "vitest";

import {
  buildComparisonSummary,
  hasConsequenceLanguage,
  hasCompanyProperNoun,
  mechanismsAppearDistinct,
  makeMockAnthropicClient,
  MOCK_WRITER_JSON,
  MOCK_CRITIC_JSON,
  FIXTURE_SYNTH_MOCKS,
  makeMockWriterConfig,
  makeMockCriticConfig,
  makeMockSynthConfig,
} from "../../report/evals/compare-v3-v4.js";
import type { ComparisonSummary, RunComparison } from "../../report/evals/compare-v3-v4.js";
import type { ArgumentSynthesis } from "../types/argument-synthesis.js";
import type { V3PipelineResult } from "../pipeline/run-v3-pipeline.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalSynthesis(overrides: Partial<ArgumentSynthesis> = {}): ArgumentSynthesis {
  return {
    synthesis_id: "syn_test_001",
    company_id: "test-co",
    synthesised_at: new Date().toISOString(),
    company_specific_thesis:
      "TestCo's $5,000 mandatory onboarding fee (ev_001) and 8 open implementation " +
      "roles at 50 headcount signal a services business operating under a SaaS brand, " +
      "meaning gross margin cannot improve without a repositioning decision.",
    mechanism_narratives: [
      {
        mechanism_id: "mech_001",
        mechanism_type: "investor_signalling",
        company_specific_narrative:
          "TestCo's investor deck frames it as a software company (ev_001) but the " +
          "pricing page charges separately for onboarding — revealing that delivery " +
          "is human-mediated.",
        evidence_refs: ["ev_001", "ev_002"],
      },
      {
        mechanism_id: "mech_002",
        mechanism_type: "category_gravity",
        company_specific_narrative:
          "Customers credit the implementation team rather than the product (ev_003), " +
          "which means retention depends on service continuity, not product stickiness.",
        evidence_refs: ["ev_003", "ev_004"],
      },
    ],
    argument_skeleton: [
      {
        step_order: 1,
        evidence_id: "ev_001",
        logical_role: "observation",
        connector: "which means",
        purpose: "Shows onboarding fee as observable signal of service-heavy delivery.",
      },
      {
        step_order: 2,
        evidence_id: "ev_002",
        logical_role: "mechanism",
        connector: "because",
        purpose: "Investor signalling explains why SaaS framing was adopted over services framing.",
      },
      {
        step_order: 3,
        evidence_id: "ev_003",
        logical_role: "diagnosis",
        connector: "meaning",
        purpose:
          "Connects the delivery model gap to the commercial consequence: margins depend on headcount.",
      },
    ],
    hook_strategy: {
      evidence_id: "ev_003",
      tension_type: "customer_signal",
      framing: "Open with the customer review that credits the specialist, not the product.",
      why_it_matters:
        "This founder sells a SaaS platform; customers crediting the human team signals the product " +
        "is not yet self-sufficient.",
    },
    evidence_refs: ["ev_001", "ev_002", "ev_003", "ev_004"],
    synthesis_confidence: "high",
    diagnosis_fit: "strong",
    distinctness_check: { passed: true },
    fallback_to_template: false,
    ...overrides,
  };
}

function makeMinimalV3PipelineResult(overrides: Partial<V3PipelineResult> = {}): V3PipelineResult {
  return {
    pipeline_version: "v3",
    company_id: "test-co",
    run_id: "run_001",
    generated_at: new Date().toISOString(),
    dossier: {} as V3PipelineResult["dossier"],
    v2Result: {} as V3PipelineResult["v2Result"],
    evidencePack: {} as V3PipelineResult["evidencePack"],
    adjudication: {
      adjudication_id: "adj_001",
      diagnosis_id: "diag_001",
      company_id: "test-co",
      adjudicated_at: new Date().toISOString(),
      adjudication_mode: "full_confidence",
      recommended_memo_framing: "assertive",
      confidence_caveats: [],
      adjudication_report: {
        overall_quality: "strong",
        hook_candidate_count: 2,
        diagnosis_support_count: 3,
        counter_narrative_count: 1,
        coverage_assessment: "strong",
        blocking_reasons: [],
        improvement_suggestions: [],
      },
    },
    memoBrief: {
      brief_id: "brief_001",
      company_id: "test-co",
      created_at: new Date().toISOString(),
      target_company: "TestCo",
      adjudication_mode: "full_confidence",
      memo_framing: "assertive",
      diagnosis_id: "diag_001",
      intervention_id: "int_001",
      hook: {
        evidence_id: "ev_001",
        excerpt: "TestCo claims zero-touch automation.",
        hook_type: "product_gap",
        framing_instruction: "Open with the product gap directly.",
      },
      thesis: "This company has a founder-led sales ceiling",
      evidence_spine: [],
      intervention_framing: "Reposition as a consulting-led platform.",
      tone_constraints: {
        register: "direct",
        perspective: "commercial_advisor",
        avoid: ["generic_advice", "jargon", "hedging_language", "feature_selling", "unsolicited_praise"],
      },
      banned_phrases: [],
      confidence_caveats: [],
      cta: "Reply with a 20-minute window.",
      word_budget: { target_min: 500, target_max: 700, hard_max: 850 },
      required_sections: ["observation", "what_this_means", "why_this_is_happening", "what_we_would_change", "cta"],
    },
    memo: {
      memo_id: "memo_001",
      company_id: "test-co",
      brief_id: "brief_001",
      adjudication_mode: "full_confidence",
      diagnosis_id: "diag_001",
      intervention_id: "int_001",
      evidence_ids: ["ev_001", "ev_002"],
      word_count: 520,
      attempt_number: 1,
      sections: [],
      markdown: "## Observation\n\nV3 memo content.",
      generated_at: new Date().toISOString(),
    },
    criticResult: {
      critic_id: "critic_001",
      memo_id: "memo_001",
      evaluated_at: new Date().toISOString(),
      attempt_number: 1,
      dimensions: {
        evidence_grounding: { score: 4, pass: true, notes: "Good." },
        commercial_sharpness: { score: 3, pass: true, notes: "Adequate." },
        cta_clarity: { score: 5, pass: true, notes: "Clear." },
        tone_compliance: { score: 5, pass: true, notes: "Clean." },
      },
      genericity_test: { result: "pass", reasoning: "Company-specific." },
      founder_pushback_test: {
        most_vulnerable_claim: "A claim.",
        likely_objection: "An objection.",
        severity: "low",
      },
      overall_pass: true,
    },
    sendGate: {
      gate_id: "gate_001",
      company_id: "test-co",
      memo_id: "memo_001",
      evaluated_at: new Date().toISOString(),
      result: "pass",
      memo_quality_score: 78,
      ready_to_send: true,
      has_hard_failures: false,
      gate_summary: {
        total_criteria: 6,
        criteria_passed: 6,
        criteria_failed: 0,
        hard_failures: 0,
        conditional_failures: 0,
        memo_quality_score: 78,
        recommendation: "Pass.",
      },
      criteria_results: [],
    },
    memo_intelligence_version: "v3",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildComparisonSummary
// ---------------------------------------------------------------------------

describe("buildComparisonSummary", () => {
  it("v4_synthesis_active = false when argumentSynthesis is undefined", () => {
    const v3 = makeMinimalV3PipelineResult({ memo_intelligence_version: "v3" });
    const v4 = makeMinimalV3PipelineResult({
      memo_intelligence_version: "v4",
      argumentSynthesis: undefined,
    });

    const summary = buildComparisonSummary(v3, v4);
    expect(summary.v4_synthesis_active).toBe(false);
    expect(summary.v4_fallback_to_template).toBe(false);
  });

  it("v4_synthesis_active = false when fallback_to_template = true", () => {
    const v3 = makeMinimalV3PipelineResult({ memo_intelligence_version: "v3" });
    const synthesis = makeMinimalSynthesis({ fallback_to_template: true });
    const v4 = makeMinimalV3PipelineResult({
      memo_intelligence_version: "v4",
      argumentSynthesis: synthesis,
    });

    const summary = buildComparisonSummary(v3, v4);
    expect(summary.v4_synthesis_active).toBe(false);
    expect(summary.v4_fallback_to_template).toBe(true);
  });

  it("when synthesis is active: v4_thesis = company_specific_thesis", () => {
    const v3 = makeMinimalV3PipelineResult({ memo_intelligence_version: "v3" });
    const synthesis = makeMinimalSynthesis();
    const v4 = makeMinimalV3PipelineResult({
      memo_intelligence_version: "v4",
      argumentSynthesis: synthesis,
    });

    const summary = buildComparisonSummary(v3, v4);
    expect(summary.v4_thesis).toBe(synthesis.company_specific_thesis);
    expect(summary.v3_thesis).toBe("This company has a founder-led sales ceiling");
    expect(summary.v4_thesis).not.toBe(summary.v3_thesis);
  });

  it("when synthesis is active: structure fields populated correctly", () => {
    const v3 = makeMinimalV3PipelineResult({ memo_intelligence_version: "v3" });
    const synthesis = makeMinimalSynthesis();
    const v4 = makeMinimalV3PipelineResult({
      memo_intelligence_version: "v4",
      argumentSynthesis: synthesis,
    });

    const summary = buildComparisonSummary(v3, v4);
    expect(summary.v4_mechanism_count).toBe(2);
    expect(summary.v4_argument_skeleton_length).toBe(3);
    expect(summary.v4_hook_framing_source).toBe("synthesis");
  });

  it("v3 critic/gate fields come from v3 pipeline result", () => {
    const v3 = makeMinimalV3PipelineResult({ memo_intelligence_version: "v3" });
    const v4 = makeMinimalV3PipelineResult({ memo_intelligence_version: "v4" });

    const summary = buildComparisonSummary(v3, v4);
    expect(summary.v3_genericity_result).toBe("pass");
    expect(summary.v3_commercial_sharpness).toBe(3);
    expect(summary.v3_critic_overall_pass).toBe(true);
    expect(summary.v3_send_gate_result).toBe("pass");
    expect(summary.v3_quality_score).toBe(78);
    expect(summary.v3_word_count).toBe(520);
  });

  it("heuristics are false when synthesis is inactive", () => {
    const v3 = makeMinimalV3PipelineResult();
    const v4 = makeMinimalV3PipelineResult({ argumentSynthesis: undefined });

    const summary = buildComparisonSummary(v3, v4);
    expect(summary.v4_thesis_has_company_proper_noun).toBe(false);
    expect(summary.v4_thesis_has_consequence_language).toBe(false);
    expect(summary.v4_mechanisms_appear_distinct).toBe(false);
  });

  it("heuristics are computed from synthesis when active", () => {
    const v3 = makeMinimalV3PipelineResult();
    const synthesis = makeMinimalSynthesis();
    const v4 = makeMinimalV3PipelineResult({ argumentSynthesis: synthesis });

    const summary = buildComparisonSummary(v3, v4);
    // Synthesis thesis has consequence language ("meaning gross margin cannot improve")
    expect(summary.v4_thesis_has_consequence_language).toBe(true);
    // Mechanism types are different
    expect(summary.v4_mechanisms_appear_distinct).toBe(true);
  });

  it("distinctness_check fields populated from synthesis", () => {
    const v3 = makeMinimalV3PipelineResult();
    const synthesis = makeMinimalSynthesis({
      distinctness_check: {
        passed: false,
        notes: ["mechanism_types identical", "evidence_overlap: 0.80"],
      },
    });
    const v4 = makeMinimalV3PipelineResult({ argumentSynthesis: synthesis });

    const summary = buildComparisonSummary(v3, v4);
    expect(summary.v4_distinctness_check_passed).toBe(false);
    expect(summary.v4_distinctness_notes).toEqual(["mechanism_types identical", "evidence_overlap: 0.80"]);
  });

  it("no brief case — adjudication abort produces placeholder thesis strings", () => {
    const v3 = makeMinimalV3PipelineResult({ memoBrief: undefined });
    const v4 = makeMinimalV3PipelineResult({ memoBrief: undefined });

    const summary = buildComparisonSummary(v3, v4);
    expect(summary.v3_thesis).toBe("(no brief — adjudication aborted)");
    expect(summary.v4_thesis).toBe("(no brief — adjudication aborted)");
  });
});

// ---------------------------------------------------------------------------
// hasConsequenceLanguage
// ---------------------------------------------------------------------------

describe("hasConsequenceLanguage", () => {
  it("detects 'which means'", () => {
    expect(hasConsequenceLanguage("The product has a gap which means revenue is at risk.")).toBe(true);
  });
  it("detects 'limits'", () => {
    expect(hasConsequenceLanguage("This limits growth to the services headcount ceiling.")).toBe(true);
  });
  it("detects 'cannot scale'", () => {
    expect(hasConsequenceLanguage("The model cannot scale past 50 customers.")).toBe(true);
  });
  it("detects 'bottleneck'", () => {
    expect(hasConsequenceLanguage("Hiring is the bottleneck, not compute.")).toBe(true);
  });
  it("returns false for neutral thesis without consequence language", () => {
    expect(hasConsequenceLanguage("The company sells enterprise software to mid-market buyers.")).toBe(false);
  });
  it("case-insensitive", () => {
    expect(hasConsequenceLanguage("This PREVENTS the team from scaling outbound.")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hasCompanyProperNoun
// ---------------------------------------------------------------------------

describe("hasCompanyProperNoun", () => {
  it("detects company name mid-sentence", () => {
    expect(hasCompanyProperNoun("AutoFlow's pricing page charges $10,000 for onboarding.")).toBe(true);
  });
  it("returns false when all non-initial caps are stop words", () => {
    expect(hasCompanyProperNoun("The company has a high-touch sales model.")).toBe(false);
  });
  it("detects person name mid-sentence", () => {
    expect(hasCompanyProperNoun("Maya Chen leads a company that markets autonomous AI.")).toBe(true);
  });
  it("returns false for fully generic text", () => {
    expect(
      hasCompanyProperNoun("this company has a founder-led sales ceiling that prevents growth.")
    ).toBe(false);
  });
  it("common sentence-starter words at position 0 are filtered by stop-word list", () => {
    // "The", "A", "This" etc. are in the stop-word list — no proper noun detected
    expect(hasCompanyProperNoun("The sales model relies on founder-led prospecting.")).toBe(false);
  });

  it("company name at position 0 is detected (thesis paragraphs often start with the company name)", () => {
    expect(hasCompanyProperNoun("AutoFlow AI's pricing page charges $10,000.")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// mechanismsAppearDistinct
// ---------------------------------------------------------------------------

describe("mechanismsAppearDistinct", () => {
  it("returns true when types differ and evidence sets differ", () => {
    const synthesis = makeMinimalSynthesis();
    // makeMinimalSynthesis has mech types: "investor_signalling" and "category_gravity"
    // evidence refs: [ev_001, ev_002] and [ev_003, ev_004] — no overlap
    expect(mechanismsAppearDistinct(synthesis)).toBe(true);
  });

  it("returns false when mechanism_type is identical", () => {
    const synthesis = makeMinimalSynthesis({
      mechanism_narratives: [
        {
          mechanism_id: "mech_001",
          mechanism_type: "investor_signalling",
          company_specific_narrative: "First narrative.",
          evidence_refs: ["ev_001"],
        },
        {
          mechanism_id: "mech_002",
          mechanism_type: "investor_signalling", // same type
          company_specific_narrative: "Second narrative.",
          evidence_refs: ["ev_005"],
        },
      ],
    });
    expect(mechanismsAppearDistinct(synthesis)).toBe(false);
  });

  it("returns false when Jaccard overlap > 0.60", () => {
    const synthesis = makeMinimalSynthesis({
      mechanism_narratives: [
        {
          mechanism_id: "mech_001",
          mechanism_type: "investor_signalling",
          company_specific_narrative: "First.",
          evidence_refs: ["ev_001", "ev_002", "ev_003"],
        },
        {
          mechanism_id: "mech_002",
          mechanism_type: "category_gravity",
          company_specific_narrative: "Second.",
          evidence_refs: ["ev_001", "ev_002", "ev_003", "ev_004"],
          // intersection = {ev_001, ev_002, ev_003} = 3
          // union = {ev_001, ev_002, ev_003, ev_004} = 4
          // jaccard = 3/4 = 0.75 > 0.60 → not distinct
        },
      ],
    });
    expect(mechanismsAppearDistinct(synthesis)).toBe(false);
  });

  it("returns true when types differ and Jaccard = 0.50 (boundary case)", () => {
    const synthesis = makeMinimalSynthesis({
      mechanism_narratives: [
        {
          mechanism_id: "mech_001",
          mechanism_type: "investor_signalling",
          company_specific_narrative: "First.",
          evidence_refs: ["ev_001", "ev_002"],
        },
        {
          mechanism_id: "mech_002",
          mechanism_type: "category_gravity",
          company_specific_narrative: "Second.",
          evidence_refs: ["ev_001", "ev_003"],
          // intersection = {ev_001} = 1, union = {ev_001, ev_002, ev_003} = 3, Jaccard = 1/3 ≈ 0.33
        },
      ],
    });
    expect(mechanismsAppearDistinct(synthesis)).toBe(true);
  });

  it("returns false when fewer than 2 narratives", () => {
    const synthesis = makeMinimalSynthesis({
      mechanism_narratives: [
        {
          mechanism_id: "mech_001",
          mechanism_type: "investor_signalling",
          company_specific_narrative: "Only narrative.",
          evidence_refs: ["ev_001"],
        },
      ],
    });
    expect(mechanismsAppearDistinct(synthesis)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// makeMockAnthropicClient
// ---------------------------------------------------------------------------

describe("makeMockAnthropicClient", () => {
  it("returns object with messages.create that resolves with expected content", async () => {
    const client = makeMockAnthropicClient('{"key": "value"}');
    const result = await (client as any).messages.create({});
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe('{"key": "value"}');
  });

  it("always returns the same response regardless of params", async () => {
    const client = makeMockAnthropicClient("fixed");
    const r1 = await (client as any).messages.create({ a: 1 });
    const r2 = await (client as any).messages.create({ b: 2 });
    expect(r1.content[0].text).toBe("fixed");
    expect(r2.content[0].text).toBe("fixed");
  });
});

// ---------------------------------------------------------------------------
// MOCK_WRITER_JSON / MOCK_CRITIC_JSON — parse validation
// ---------------------------------------------------------------------------

describe("MOCK_WRITER_JSON", () => {
  it("parses as valid JSON", () => {
    expect(() => JSON.parse(MOCK_WRITER_JSON)).not.toThrow();
  });

  it("contains all 5 required memo section keys", () => {
    const parsed = JSON.parse(MOCK_WRITER_JSON);
    expect(parsed).toHaveProperty("observation");
    expect(parsed).toHaveProperty("what_this_means");
    expect(parsed).toHaveProperty("why_this_is_happening");
    expect(parsed).toHaveProperty("what_we_would_change");
    expect(parsed).toHaveProperty("cta");
  });

  it("all section values are non-empty strings", () => {
    const parsed = JSON.parse(MOCK_WRITER_JSON);
    for (const key of ["observation", "what_this_means", "why_this_is_happening", "what_we_would_change", "cta"]) {
      expect(typeof parsed[key]).toBe("string");
      expect(parsed[key].length).toBeGreaterThan(20);
    }
  });

  it("total word count is ≥ 300 (passes writeMemo minimum)", () => {
    const parsed = JSON.parse(MOCK_WRITER_JSON);
    const totalText = Object.values(parsed).join(" ");
    const wordCount = (totalText as string).trim().split(/\s+/).length;
    expect(wordCount).toBeGreaterThanOrEqual(300);
  });
});

describe("MOCK_CRITIC_JSON", () => {
  it("parses as valid JSON", () => {
    expect(() => JSON.parse(MOCK_CRITIC_JSON)).not.toThrow();
  });

  it("contains all 4 dimension keys", () => {
    const parsed = JSON.parse(MOCK_CRITIC_JSON);
    expect(parsed).toHaveProperty("evidence_grounding");
    expect(parsed).toHaveProperty("commercial_sharpness");
    expect(parsed).toHaveProperty("cta_clarity");
    expect(parsed).toHaveProperty("tone_compliance");
  });

  it("contains genericity_test and founder_pushback_test", () => {
    const parsed = JSON.parse(MOCK_CRITIC_JSON);
    expect(parsed).toHaveProperty("genericity_test");
    expect(parsed).toHaveProperty("founder_pushback_test");
  });

  it("genericity_test.result is 'pass' (mock always passes)", () => {
    const parsed = JSON.parse(MOCK_CRITIC_JSON);
    expect(parsed.genericity_test.result).toBe("pass");
  });

  it("all 4 dimensions have score ≥ 3 (mock passes all)", () => {
    const parsed = JSON.parse(MOCK_CRITIC_JSON);
    expect(parsed.evidence_grounding.score).toBeGreaterThanOrEqual(3);
    expect(parsed.commercial_sharpness.score).toBeGreaterThanOrEqual(3);
    expect(parsed.cta_clarity.score).toBeGreaterThanOrEqual(3);
    expect(parsed.tone_compliance.score).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// FIXTURE_SYNTH_MOCKS
// ---------------------------------------------------------------------------

describe("FIXTURE_SYNTH_MOCKS", () => {
  it("contains an entry for 001-ai-services", () => {
    expect(FIXTURE_SYNTH_MOCKS).toHaveProperty("001-ai-services");
  });

  it("001-ai-services mock has required synthesis fields", () => {
    const mock = FIXTURE_SYNTH_MOCKS["001-ai-services"] as Record<string, unknown>;
    expect(mock).toHaveProperty("company_specific_thesis");
    expect(mock).toHaveProperty("mechanism_narratives");
    expect(mock).toHaveProperty("argument_skeleton");
    expect(mock).toHaveProperty("hook_strategy");
    expect(mock).toHaveProperty("evidence_refs");
    expect(mock).toHaveProperty("synthesis_confidence");
    expect(mock).toHaveProperty("diagnosis_fit");
  });

  it("001-ai-services mock has exactly 2 mechanism_narratives", () => {
    const mock = FIXTURE_SYNTH_MOCKS["001-ai-services"] as Record<string, unknown[]>;
    expect(Array.isArray(mock.mechanism_narratives)).toBe(true);
    expect(mock.mechanism_narratives).toHaveLength(2);
  });

  it("001-ai-services mock argument_skeleton has exactly one diagnosis step", () => {
    const mock = FIXTURE_SYNTH_MOCKS["001-ai-services"] as Record<string, Array<{ logical_role: string }>>;
    const diagnosisSteps = mock.argument_skeleton.filter(s => s.logical_role === "diagnosis");
    expect(diagnosisSteps).toHaveLength(1);
  });

  it("001-ai-services hook_strategy.evidence_id is in the mock's evidence_refs", () => {
    const mock = FIXTURE_SYNTH_MOCKS["001-ai-services"] as Record<string, unknown>;
    const hs = mock.hook_strategy as { evidence_id: string };
    const refs = mock.evidence_refs as string[];
    expect(refs).toContain(hs.evidence_id);
  });
});

// ---------------------------------------------------------------------------
// Config factory helpers
// ---------------------------------------------------------------------------

describe("makeMockWriterConfig", () => {
  it("returns a WriteMemoConfig with a client property", () => {
    const cfg = makeMockWriterConfig();
    expect(cfg).toHaveProperty("client");
    expect(cfg.client).toBeDefined();
  });
});

describe("makeMockCriticConfig", () => {
  it("returns a CriticConfig with a client property", () => {
    const cfg = makeMockCriticConfig();
    expect(cfg).toHaveProperty("client");
    expect(cfg.client).toBeDefined();
  });
});

describe("makeMockSynthConfig", () => {
  it("returns SynthesiseArgumentConfig for known fixture slug", () => {
    const cfg = makeMockSynthConfig("001-ai-services");
    expect(cfg).toBeDefined();
    expect(cfg).toHaveProperty("client");
  });

  it("returns undefined for unknown fixture slug", () => {
    const cfg = makeMockSynthConfig("999-unknown-fixture");
    expect(cfg).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// RunComparison serialisation roundtrip
// ---------------------------------------------------------------------------

describe("RunComparison serialisation", () => {
  it("serialises to JSON and deserialises back without data loss", () => {
    const v3 = makeMinimalV3PipelineResult({ memo_intelligence_version: "v3" });
    const synthesis = makeMinimalSynthesis();
    const v4 = makeMinimalV3PipelineResult({
      memo_intelligence_version: "v4",
      argumentSynthesis: synthesis,
    });

    const comparison = buildComparisonSummary(v3, v4);

    const runComparison: RunComparison = {
      slug: "001-ai-services",
      timestamp: "2026-03-16T10:00:00.000Z",
      mode: "mock",
      v3,
      v4,
      comparison,
    };

    const serialised = JSON.stringify(runComparison, null, 2);
    const deserialised: RunComparison = JSON.parse(serialised);

    // Top-level fields
    expect(deserialised.slug).toBe("001-ai-services");
    expect(deserialised.mode).toBe("mock");
    expect(deserialised.timestamp).toBe("2026-03-16T10:00:00.000Z");

    // Comparison fields round-trip correctly
    const c: ComparisonSummary = deserialised.comparison;
    expect(c.v3_thesis).toBe("This company has a founder-led sales ceiling");
    expect(c.v4_thesis).toBe(synthesis.company_specific_thesis);
    expect(c.v4_synthesis_active).toBe(true);
    expect(c.v4_mechanism_count).toBe(2);
    expect(c.v4_argument_skeleton_length).toBe(3);
    expect(c.v4_hook_framing_source).toBe("synthesis");
    expect(c.v3_genericity_result).toBe("pass");
    expect(c.v4_genericity_result).toBe("pass");
    expect(c.v3_quality_score).toBe(78);
    expect(c.v4_quality_score).toBe(78);
    expect(c.v4_thesis_has_consequence_language).toBe(true);
    expect(c.v4_mechanisms_appear_distinct).toBe(true);
    expect(c.v4_distinctness_check_passed).toBe(true);
  });

  it("all ComparisonSummary fields are present in serialised output", () => {
    const v3 = makeMinimalV3PipelineResult();
    const v4 = makeMinimalV3PipelineResult({ argumentSynthesis: makeMinimalSynthesis() });
    const comparison = buildComparisonSummary(v3, v4);
    const serialised = JSON.parse(JSON.stringify(comparison)) as Record<string, unknown>;

    const expectedKeys: Array<keyof ComparisonSummary> = [
      "v3_thesis", "v4_thesis", "v4_synthesis_active", "v4_fallback_to_template",
      "v4_synthesis_confidence", "v4_diagnosis_fit",
      "v4_mechanism_count", "v4_argument_skeleton_length",
      "v4_hook_framing_source", "v4_hook_framing",
      "v3_genericity_result", "v4_genericity_result",
      "v3_commercial_sharpness", "v4_commercial_sharpness",
      "v3_critic_overall_pass", "v4_critic_overall_pass",
      "v3_send_gate_result", "v4_send_gate_result",
      "v3_quality_score", "v4_quality_score",
      "v3_word_count", "v4_word_count",
      "v4_thesis_has_company_proper_noun", "v4_thesis_has_consequence_language",
      "v4_mechanisms_appear_distinct", "v4_distinctness_check_passed",
      "v4_distinctness_notes",
    ];

    for (const key of expectedKeys) {
      expect(serialised).toHaveProperty(key);
    }
  });
});
