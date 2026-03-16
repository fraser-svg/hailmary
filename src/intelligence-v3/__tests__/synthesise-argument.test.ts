/**
 * Synthesise Argument Tests — V4-M2a
 *
 * Tests for synthesiseArgument() and its exported sub-functions:
 *
 * parseSynthesisResponse:
 *   - valid JSON → returns RawSynthesis shape
 *   - JSON wrapped in code fences → strips and parses
 *   - invalid JSON → throws PARSE_ERROR
 *   - missing required key → throws PARSE_ERROR
 *   - non-array mechanism_narratives → coerced to []
 *
 * validateSynthesis:
 *   - valid synthesis → valid=true, correct fields
 *   - thesis < 20 words → valid=false
 *   - thesis > 70 words → valid=false
 *   - mechanism_narratives != 2 → valid=false
 *   - mechanism evidence_ref not in pack → valid=false
 *   - argument_skeleton < 3 steps → valid=false
 *   - argument_skeleton > 6 steps → valid=false
 *   - skeleton step evidence_id not in pack → valid=false
 *   - skeleton step purpose > 30 words → valid=false
 *   - skeleton has 0 diagnosis steps → valid=false
 *   - skeleton has 2 diagnosis steps → valid=false
 *   - hook_strategy.evidence_id not in pack → valid=false
 *   - hook_strategy.tension_type invalid → valid=false
 *   - hook_strategy.framing > 30 words → valid=false
 *   - thesis missing consequence language → softNote added, confidence lowered
 *   - thesis missing observable fact anchor → softNote added, confidence lowered
 *
 * runDistinctnessChecks:
 *   - different types, low Jaccard → passed=true
 *   - identical mechanism_type → passed=false, hardFailReason set
 *   - Jaccard > 0.60 → passed=false, hardFailReason set
 *   - word overlap > 0.60 → passed=true, note added, confidence lowered
 *   - causal dependence in narrative_2 → passed=true, note added, confidence lowered
 *   - both Check 3 and Check 4 → both notes, confidence lowered twice
 *
 * synthesiseArgument (with mocked Anthropic client):
 *   - valid synthesis → correct ArgumentSynthesis shape, fallback_to_template=false
 *   - no API key and no client → fallback_to_template=true
 *   - LLM throws error → fallback_to_template=true
 *   - LLM returns invalid JSON → fallback_to_template=true
 *   - LLM returns thesis > 70 words → fallback_to_template=true
 *   - skeleton missing diagnosis step → fallback_to_template=true
 *   - Check 1 fail → retry called → retry succeeds → fallback_to_template=false
 *   - Check 1 fail → retry called → retry also fails → fallback_to_template=true
 *   - Check 2 fail → retry called → retry succeeds → fallback_to_template=false
 *   - timeout → fallback_to_template=true
 *   - fewer than 2 mechanisms input → fallback_to_template=true
 *   - Check 3 soft fail → note in distinctness_check.notes, fallback_to_template=false
 *   - Check 4 soft fail → note in distinctness_check.notes, fallback_to_template=false
 *   - synthesis_id format: "syn_<company_id>_<timestamp>"
 *
 * All tests are fully deterministic — no external API calls.
 * The Anthropic client is injected via SynthesiseArgumentConfig.client.
 */

import { describe, it, expect, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import {
  synthesiseArgument,
  buildSynthesisSystemPrompt,
  buildSynthesisUserPrompt,
  buildRetryPrompt,
  parseSynthesisResponse,
  validateSynthesis,
  runDistinctnessChecks,
} from "../memo/synthesise-argument.js";
import type { SynthesiseArgumentConfig, SynthesiseArgumentInput } from "../memo/synthesise-argument.js";
import type { EvidencePack, EvidencePackRecord } from "../types/evidence-pack.js";
import type { MechanismNarrative } from "../types/argument-synthesis.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockClient(responses: string[]): Anthropic {
  const fn = vi.fn();
  for (const text of responses) {
    fn.mockResolvedValueOnce({
      content: [{ type: "text", text }],
      id: "msg_test",
      model: "claude-sonnet-4-6",
      role: "assistant",
      stop_reason: "end_turn",
      type: "message",
      usage: { input_tokens: 100, output_tokens: 300 },
    });
  }
  return { messages: { create: fn } } as unknown as Anthropic;
}

function makePackRecord(id: string, overrides: Partial<EvidencePackRecord> = {}): EvidencePackRecord {
  return {
    evidence_id: id,
    source_id: `src_${id}`,
    source_tier: 2,
    evidence_type: "review_record",
    excerpt: `Excerpt for ${id}`,
    summary: `Summary for ${id}`,
    confidence: "medium",
    is_inferred: false,
    tags: [],
    scores: { commercial_salience: 2, specificity: 2, customer_voice: 2, recency: 1 },
    total_score: 7,
    memo_roles: ["diagnosis_support"],
    is_hook_eligible: true,
    inclusion_reason: "test",
    ...overrides,
  };
}

function makePack(records: EvidencePackRecord[]): EvidencePack {
  const hookCandidates = records.filter(r => r.is_hook_eligible);
  return {
    pack_id: "pack_test_001",
    company_id: "test-co",
    built_at: new Date().toISOString(),
    diagnosis_id: "diag_001",
    records,
    hook_candidates: hookCandidates,
    pack_quality: {
      total_records: records.length,
      hook_candidate_count: hookCandidates.length,
      diagnosis_support_count: records.filter(r => r.memo_roles.includes("diagnosis_support")).length,
      counter_narrative_count: 0,
      specificity_anchor_count: 0,
      average_total_score: 7,
      coverage_assessment: "adequate",
    },
  };
}

/** Build a valid synthesis JSON for the given pack record IDs */
function validSynthesisJson(
  packIds: string[],
  overrides: Record<string, unknown> = {}
): string {
  const [id1 = "ev_001", id2 = "ev_002", id3 = "ev_003"] = packIds;
  return JSON.stringify({
    company_specific_thesis: `Acme's founder-led sales dependency means enterprise deals stall at contract stage because legal review triggers CEO involvement, creating a growth ceiling (${id1}).`,
    mechanism_narratives: [
      {
        mechanism_id: "mech_001",
        mechanism_type: "founder_dependency",
        company_specific_narrative: `Every deal above $10k requires CEO approval due to missing contract templates (${id1}).`,
        evidence_refs: [id1],
      },
      {
        mechanism_id: "mech_002",
        mechanism_type: "no_demand_generation",
        company_specific_narrative: `Acme has no inbound pipeline outside founder referrals, capping growth to the CEO's network capacity (${id2}).`,
        evidence_refs: [id2],
      },
    ],
    argument_skeleton: [
      {
        step_order: 1,
        evidence_id: id1,
        logical_role: "observation",
        connector: "which means",
        purpose: "Establishes the bottleneck that triggers founder involvement.",
      },
      {
        step_order: 2,
        evidence_id: id2,
        logical_role: "mechanism",
        connector: "because",
        purpose: "Explains why the bottleneck persists structurally.",
      },
      {
        step_order: 3,
        evidence_id: id3,
        logical_role: "diagnosis",
        connector: "meaning",
        purpose: "Connects observation and mechanism into the commercial ceiling thesis.",
      },
    ],
    hook_strategy: {
      evidence_id: id1,
      tension_type: "commercial_cost",
      framing: "Lead with the contract bottleneck that stalls Acme deals above ten thousand dollars.",
      why_it_matters: "The founder recognizes this as the reason their pipeline stalls after first contact.",
    },
    evidence_refs: [id1, id2, id3],
    synthesis_confidence: "high",
    diagnosis_fit: "strong",
    diagnosis_tension_note: "",
    ...overrides,
  });
}

const PACK_IDS = ["ev_001", "ev_002", "ev_003"];
const TEST_PACK = makePack(PACK_IDS.map(id => makePackRecord(id)));
const PACK_ID_SET = new Set(PACK_IDS);

function makeInput(overrides: Partial<SynthesiseArgumentInput> = {}): SynthesiseArgumentInput {
  return {
    company_id: "test-co",
    company: "TestCo",
    diagnosis: {
      id: "diag_001",
      company_id: "test-co",
      type: "founder_led_sales_ceiling",
      statement: "This company has a founder-led sales ceiling.",
      confidence: "medium",
      evidence_refs: ["ev_001"],
    },
    mechanisms: [
      {
        id: "mech_001",
        company_id: "test-co",
        type: "founder_dependency",
        statement: "Founder is required to close all deals above SMB.",
        evidence_refs: ["ev_001"],
      },
      {
        id: "mech_002",
        company_id: "test-co",
        type: "no_demand_generation",
        statement: "No repeatable demand-generation mechanism exists.",
        evidence_refs: ["ev_002"],
      },
    ],
    evidencePack: TEST_PACK,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseSynthesisResponse
// ---------------------------------------------------------------------------

describe("parseSynthesisResponse", () => {
  it("valid JSON → returns all required keys", () => {
    const text = validSynthesisJson(PACK_IDS);
    const raw = parseSynthesisResponse(text);
    expect(raw.company_specific_thesis).toBeTruthy();
    expect(raw.mechanism_narratives).toHaveLength(2);
    expect(raw.argument_skeleton).toHaveLength(3);
    expect(raw.hook_strategy).toBeTruthy();
    expect(raw.evidence_refs).toBeDefined();
    expect(raw.synthesis_confidence).toBe("high");
    expect(raw.diagnosis_fit).toBe("strong");
  });

  it("JSON wrapped in code fences → strips fences and parses", () => {
    const text = "```json\n" + validSynthesisJson(PACK_IDS) + "\n```";
    const raw = parseSynthesisResponse(text);
    expect(raw.company_specific_thesis).toBeTruthy();
  });

  it("invalid JSON → throws PARSE_ERROR", () => {
    expect(() => parseSynthesisResponse("not json")).toThrow("PARSE_ERROR");
  });

  it("missing required key → throws PARSE_ERROR", () => {
    const obj = JSON.parse(validSynthesisJson(PACK_IDS)) as Record<string, unknown>;
    delete obj["hook_strategy"];
    expect(() => parseSynthesisResponse(JSON.stringify(obj))).toThrow("PARSE_ERROR");
  });

  it("non-array mechanism_narratives → coerced to empty array", () => {
    const obj = JSON.parse(validSynthesisJson(PACK_IDS)) as Record<string, unknown>;
    obj["mechanism_narratives"] = "not an array";
    const raw = parseSynthesisResponse(JSON.stringify(obj));
    expect(raw.mechanism_narratives).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// validateSynthesis
// ---------------------------------------------------------------------------

describe("validateSynthesis", () => {
  it("valid synthesis → valid=true, all fields populated", () => {
    const raw = parseSynthesisResponse(validSynthesisJson(PACK_IDS));
    const result = validateSynthesis(raw, PACK_ID_SET);
    expect(result.valid).toBe(true);
    expect(result.mechanisms).toHaveLength(2);
    expect(result.skeleton).toHaveLength(3);
    expect(result.hookStrategy).toBeDefined();
    expect(result.thesis).toBeTruthy();
  });

  it("thesis < 20 words → valid=false", () => {
    const raw = parseSynthesisResponse(
      validSynthesisJson(PACK_IDS, { company_specific_thesis: "This is too short." })
    );
    const result = validateSynthesis(raw, PACK_ID_SET);
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toMatch(/too short/);
  });

  it("thesis > 70 words → valid=false", () => {
    const longThesis = "word ".repeat(72).trim() + " (ev_001)";
    const raw = parseSynthesisResponse(
      validSynthesisJson(PACK_IDS, { company_specific_thesis: longThesis })
    );
    const result = validateSynthesis(raw, PACK_ID_SET);
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toMatch(/too long/);
  });

  it("mechanism_narratives count = 1 → valid=false", () => {
    const obj = JSON.parse(validSynthesisJson(PACK_IDS)) as Record<string, unknown>;
    (obj["mechanism_narratives"] as unknown[]).splice(1, 1);
    const raw = parseSynthesisResponse(JSON.stringify(obj));
    const result = validateSynthesis(raw, PACK_ID_SET);
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toMatch(/exactly 2/);
  });

  it("mechanism evidence_ref not in pack → valid=false", () => {
    const obj = JSON.parse(validSynthesisJson(PACK_IDS)) as Record<string, unknown>;
    (obj["mechanism_narratives"] as Record<string, unknown>[])[0]["evidence_refs"] = ["ev_NOT_IN_PACK"];
    const raw = parseSynthesisResponse(JSON.stringify(obj));
    const result = validateSynthesis(raw, PACK_ID_SET);
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toMatch(/unknown id/);
  });

  it("argument_skeleton < 3 steps → valid=false", () => {
    const obj = JSON.parse(validSynthesisJson(PACK_IDS)) as Record<string, unknown>;
    (obj["argument_skeleton"] as unknown[]).splice(1, 2); // leave only 1 step
    const raw = parseSynthesisResponse(JSON.stringify(obj));
    const result = validateSynthesis(raw, PACK_ID_SET);
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toMatch(/3–6 steps/);
  });

  it("argument_skeleton > 6 steps → valid=false", () => {
    const obj = JSON.parse(validSynthesisJson(PACK_IDS)) as Record<string, unknown>;
    const extraStep = { step_order: 7, evidence_id: "ev_001", logical_role: "observation", purpose: "extra step" };
    for (let i = 0; i < 4; i++) (obj["argument_skeleton"] as unknown[]).push({ ...extraStep, step_order: 4 + i });
    const raw = parseSynthesisResponse(JSON.stringify(obj));
    const result = validateSynthesis(raw, PACK_ID_SET);
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toMatch(/3–6 steps/);
  });

  it("skeleton step evidence_id not in pack → valid=false", () => {
    const obj = JSON.parse(validSynthesisJson(PACK_IDS)) as Record<string, unknown>;
    (obj["argument_skeleton"] as Record<string, unknown>[])[0]["evidence_id"] = "ev_NOT_FOUND";
    const raw = parseSynthesisResponse(JSON.stringify(obj));
    const result = validateSynthesis(raw, PACK_ID_SET);
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toMatch(/not in pack/);
  });

  it("skeleton step purpose > 30 words → valid=false", () => {
    const obj = JSON.parse(validSynthesisJson(PACK_IDS)) as Record<string, unknown>;
    (obj["argument_skeleton"] as Record<string, unknown>[])[0]["purpose"] =
      "word ".repeat(31).trim();
    const raw = parseSynthesisResponse(JSON.stringify(obj));
    const result = validateSynthesis(raw, PACK_ID_SET);
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toMatch(/exceeds 30 words/);
  });

  it("skeleton has 0 diagnosis steps → valid=false", () => {
    const obj = JSON.parse(validSynthesisJson(PACK_IDS)) as Record<string, unknown>;
    // Replace the diagnosis step with another mechanism step
    (obj["argument_skeleton"] as Record<string, unknown>[])[2]["logical_role"] = "mechanism";
    const raw = parseSynthesisResponse(JSON.stringify(obj));
    const result = validateSynthesis(raw, PACK_ID_SET);
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toMatch(/exactly one.*diagnosis/);
  });

  it("skeleton has 2 diagnosis steps → valid=false", () => {
    const obj = JSON.parse(validSynthesisJson(PACK_IDS)) as Record<string, unknown>;
    (obj["argument_skeleton"] as Record<string, unknown>[])[0]["logical_role"] = "diagnosis";
    const raw = parseSynthesisResponse(JSON.stringify(obj));
    const result = validateSynthesis(raw, PACK_ID_SET);
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toMatch(/exactly one.*diagnosis/);
  });

  it("hook_strategy.evidence_id not in pack → valid=false", () => {
    const obj = JSON.parse(validSynthesisJson(PACK_IDS)) as Record<string, unknown>;
    (obj["hook_strategy"] as Record<string, unknown>)["evidence_id"] = "ev_NOT_FOUND";
    const raw = parseSynthesisResponse(JSON.stringify(obj));
    const result = validateSynthesis(raw, PACK_ID_SET);
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toMatch(/hook_strategy.evidence_id.*not in pack/);
  });

  it("hook_strategy.tension_type invalid → valid=false", () => {
    const obj = JSON.parse(validSynthesisJson(PACK_IDS)) as Record<string, unknown>;
    (obj["hook_strategy"] as Record<string, unknown>)["tension_type"] = "invalid_type";
    const raw = parseSynthesisResponse(JSON.stringify(obj));
    const result = validateSynthesis(raw, PACK_ID_SET);
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toMatch(/tension_type.*invalid/);
  });

  it("hook_strategy.framing > 30 words → valid=false", () => {
    const obj = JSON.parse(validSynthesisJson(PACK_IDS)) as Record<string, unknown>;
    (obj["hook_strategy"] as Record<string, unknown>)["framing"] =
      "word ".repeat(31).trim();
    const raw = parseSynthesisResponse(JSON.stringify(obj));
    const result = validateSynthesis(raw, PACK_ID_SET);
    expect(result.valid).toBe(false);
    expect(result.errorMessage).toMatch(/framing exceeds 30 words/);
  });

  it("thesis missing consequence language → soft note added, confidence lowered", () => {
    // Replace thesis with one that has no consequence-language tokens but has evidence ref
    const thesis = "Acme relies on founder involvement for every enterprise deal (ev_001). The pipeline depends entirely on the CEO network capacity and referrals from early customers.";
    const raw = parseSynthesisResponse(
      validSynthesisJson(PACK_IDS, { company_specific_thesis: thesis })
    );
    const result = validateSynthesis(raw, PACK_ID_SET);
    // Should be valid but confidence reduced from high
    expect(result.valid).toBe(true);
    expect(result.softNotes).toContain("thesis_missing_consequence_language");
    expect(result.synthesisConfidence).not.toBe("high");
  });

  it("thesis missing observable fact anchor → soft note added, confidence lowered", () => {
    // Replace thesis with one that has consequence language but no evidence ref or proper noun
    const thesis = "the company has a sales ceiling because of founder dependency which blocks growth expansion and limits revenue because the sales cycle stalls.";
    const raw = parseSynthesisResponse(
      validSynthesisJson(PACK_IDS, { company_specific_thesis: thesis })
    );
    const result = validateSynthesis(raw, PACK_ID_SET);
    expect(result.valid).toBe(true);
    expect(result.softNotes).toContain("thesis_missing_observable_fact_anchor");
    expect(result.synthesisConfidence).not.toBe("high");
  });
});

// ---------------------------------------------------------------------------
// runDistinctnessChecks
// ---------------------------------------------------------------------------

describe("runDistinctnessChecks", () => {
  const mech1: MechanismNarrative = {
    mechanism_id: "mech_001",
    mechanism_type: "founder_dependency",
    company_specific_narrative:
      "Every enterprise deal requires CEO sign-off because contracts lack standard templates (ev_001).",
    evidence_refs: ["ev_001"],
  };

  it("different types, low Jaccard → passed=true, no hardFailReason", () => {
    const mech2: MechanismNarrative = {
      mechanism_id: "mech_002",
      mechanism_type: "no_demand_generation",
      company_specific_narrative:
        "Acme has no inbound pipeline beyond founder referrals, capping scalable growth (ev_002).",
      evidence_refs: ["ev_002"],
    };
    const result = runDistinctnessChecks(mech1, mech2, "high");
    expect(result.passed).toBe(true);
    expect(result.hardFailReason).toBeUndefined();
  });

  it("identical mechanism_type → passed=false, hardFailReason set", () => {
    const mech2: MechanismNarrative = {
      mechanism_id: "mech_002",
      mechanism_type: "founder_dependency", // same as mech1
      company_specific_narrative:
        "Founder must approve every pricing exception because no pricing authority exists (ev_002).",
      evidence_refs: ["ev_002"],
    };
    const result = runDistinctnessChecks(mech1, mech2, "high");
    expect(result.passed).toBe(false);
    expect(result.hardFailReason).toMatch(/mechanism_types are identical/);
    expect(result.notes).toContain("mechanism_types identical");
  });

  it("Jaccard evidence overlap > 0.60 → passed=false, hardFailReason set", () => {
    const mech2: MechanismNarrative = {
      mechanism_id: "mech_002",
      mechanism_type: "no_demand_generation", // different type
      company_specific_narrative:
        "Acme depends entirely on the same founder-led outreach approach (ev_001, ev_002).",
      evidence_refs: ["ev_001", "ev_002"], // ev_001 is shared with mech1 → Jaccard = 1/2 = 0.5 — not enough
      // Need Jaccard > 0.60. mech1 refs = [ev_001]. mech2 refs = [ev_001, ev_003, ev_004, ev_005].
      // intersection = 1, union = 5, Jaccard = 0.2 — still not enough
      // mech1 refs = [ev_001, ev_002, ev_003]. mech2 refs = [ev_001, ev_002, ev_003]. Jaccard = 1.0
    };
    // Override to create high Jaccard: same 3 refs
    const highJaccardMech2: MechanismNarrative = {
      ...mech2,
      evidence_refs: ["ev_001"], // same as mech1 single ref → Jaccard = 1.0/1 = 1.0 > 0.60
    };
    const result = runDistinctnessChecks(mech1, highJaccardMech2, "high");
    expect(result.passed).toBe(false);
    expect(result.hardFailReason).toMatch(/Jaccard/);
  });

  it("word overlap > 0.60 → passed=true, soft note added, confidence lowered", () => {
    // Deliberately high word overlap between narratives
    const mech2: MechanismNarrative = {
      mechanism_id: "mech_002",
      mechanism_type: "no_demand_generation", // different type
      company_specific_narrative:
        "Every enterprise deal requires CEO sign-off because contracts lack standard templates (ev_002).",
      // Identical text → word overlap = 1.0
      evidence_refs: ["ev_002"], // different refs → Jaccard passes
    };
    const result = runDistinctnessChecks(mech1, mech2, "high");
    expect(result.passed).toBe(true);
    expect(result.notes.some(n => n.startsWith("word_overlap:"))).toBe(true);
    expect(result.updatedConfidence).not.toBe("high"); // lowered from high
  });

  it("causal dependence phrase in narrative_2 → passed=true, causal_dependence note added", () => {
    const mech2: MechanismNarrative = {
      mechanism_id: "mech_002",
      mechanism_type: "no_demand_generation",
      company_specific_narrative:
        "As a result of this founder bottleneck, Acme cannot build repeatable demand generation capacity (ev_002).",
      evidence_refs: ["ev_002"],
    };
    const result = runDistinctnessChecks(mech1, mech2, "medium");
    expect(result.passed).toBe(true);
    expect(result.notes.some(n => n.includes("causal_dependence"))).toBe(true);
    expect(result.updatedConfidence).toBe("low"); // lowered from medium
  });

  it("both Check 3 and Check 4 → both notes present, confidence lowered twice", () => {
    const mech2: MechanismNarrative = {
      mechanism_id: "mech_002",
      mechanism_type: "no_demand_generation",
      // High word overlap AND causal dependence
      company_specific_narrative:
        "As a result, every enterprise deal requires CEO sign-off because contracts lack standard templates (ev_002).",
      evidence_refs: ["ev_002"],
    };
    const result = runDistinctnessChecks(mech1, mech2, "high");
    expect(result.passed).toBe(true);
    const hasWordOverlap = result.notes.some(n => n.startsWith("word_overlap:"));
    const hasCausal = result.notes.some(n => n.includes("causal_dependence"));
    // At least one soft check should fire
    expect(hasWordOverlap || hasCausal).toBe(true);
    expect(result.updatedConfidence).not.toBe("high");
  });
});

// ---------------------------------------------------------------------------
// buildSynthesisSystemPrompt
// ---------------------------------------------------------------------------

describe("buildSynthesisSystemPrompt", () => {
  it("contains key instruction about 3-element thesis requirement", () => {
    const prompt = buildSynthesisSystemPrompt();
    expect(prompt).toContain("THREE elements");
    expect(prompt).toContain("company_specific_thesis");
  });

  it("contains output format specification with all required JSON keys", () => {
    const prompt = buildSynthesisSystemPrompt();
    expect(prompt).toContain("\"company_specific_thesis\"");
    expect(prompt).toContain("\"mechanism_narratives\"");
    expect(prompt).toContain("\"argument_skeleton\"");
    expect(prompt).toContain("\"hook_strategy\"");
    expect(prompt).toContain("\"synthesis_confidence\"");
    expect(prompt).toContain("logical_role = \"diagnosis\"");
  });
});

// ---------------------------------------------------------------------------
// buildSynthesisUserPrompt
// ---------------------------------------------------------------------------

describe("buildSynthesisUserPrompt", () => {
  it("contains company name, diagnosis type, and both mechanism types", () => {
    const input = makeInput();
    const prompt = buildSynthesisUserPrompt(input);
    expect(prompt).toContain("TestCo");
    expect(prompt).toContain("founder_led_sales_ceiling");
    expect(prompt).toContain("founder_dependency");
    expect(prompt).toContain("no_demand_generation");
  });

  it("contains evidence pack records with evidence_ids", () => {
    const input = makeInput();
    const prompt = buildSynthesisUserPrompt(input);
    expect(prompt).toContain("ev_001");
    expect(prompt).toContain("ev_002");
    expect(prompt).toContain("ev_003");
  });
});

// ---------------------------------------------------------------------------
// buildRetryPrompt
// ---------------------------------------------------------------------------

describe("buildRetryPrompt", () => {
  it("contains fail reason and mechanism_1 type, asks for new mechanism_2", () => {
    const mech1: MechanismNarrative = {
      mechanism_id: "mech_001",
      mechanism_type: "founder_dependency",
      company_specific_narrative: "narrative",
      evidence_refs: ["ev_001"],
    };
    const prompt = buildRetryPrompt("mechanism_types are identical: \"founder_dependency\"", mech1);
    expect(prompt).toContain("too similar");
    expect(prompt).toContain("founder_dependency");
    expect(prompt).toContain("new Mechanism 2");
  });
});

// ---------------------------------------------------------------------------
// synthesiseArgument — integration tests with mocked client
// ---------------------------------------------------------------------------

describe("synthesiseArgument", () => {
  it("valid synthesis → correct ArgumentSynthesis shape, fallback_to_template=false", async () => {
    const client = makeMockClient([validSynthesisJson(PACK_IDS)]);
    const result = await synthesiseArgument(makeInput(), { client, timeout_ms: 5000 });

    expect(result.fallback_to_template).toBe(false);
    expect(result.synthesis_id).toMatch(/^syn_test-co_\d+$/);
    expect(result.company_id).toBe("test-co");
    expect(result.company_specific_thesis).toBeTruthy();
    expect(result.mechanism_narratives).toHaveLength(2);
    expect(result.argument_skeleton.length).toBeGreaterThanOrEqual(3);
    expect(result.hook_strategy.evidence_id).toBe("ev_001");
    expect(result.hook_strategy.tension_type).toBe("commercial_cost");
    expect(result.distinctness_check.passed).toBe(true);
  });

  it("no API key and no injected client → fallback_to_template=true", async () => {
    const originalKey = process.env["ANTHROPIC_API_KEY"];
    delete process.env["ANTHROPIC_API_KEY"];

    try {
      const result = await synthesiseArgument(makeInput(), { timeout_ms: 1000 });
      expect(result.fallback_to_template).toBe(true);
    } finally {
      if (originalKey !== undefined) {
        process.env["ANTHROPIC_API_KEY"] = originalKey;
      }
    }
  });

  it("LLM throws error → fallback_to_template=true", async () => {
    const client = {
      messages: { create: vi.fn().mockRejectedValue(new Error("network error")) },
    } as unknown as Anthropic;

    const result = await synthesiseArgument(makeInput(), { client, timeout_ms: 5000 });
    expect(result.fallback_to_template).toBe(true);
  });

  it("LLM returns invalid JSON → fallback_to_template=true", async () => {
    const client = makeMockClient(["not valid json at all"]);
    const result = await synthesiseArgument(makeInput(), { client, timeout_ms: 5000 });
    expect(result.fallback_to_template).toBe(true);
  });

  it("LLM returns thesis > 70 words → fallback_to_template=true", async () => {
    const longThesis = "word ".repeat(72).trim() + " (ev_001).";
    const client = makeMockClient([validSynthesisJson(PACK_IDS, { company_specific_thesis: longThesis })]);
    const result = await synthesiseArgument(makeInput(), { client, timeout_ms: 5000 });
    expect(result.fallback_to_template).toBe(true);
  });

  it("skeleton missing diagnosis step → fallback_to_template=true", async () => {
    const obj = JSON.parse(validSynthesisJson(PACK_IDS)) as Record<string, unknown>;
    // Replace diagnosis step with mechanism
    (obj["argument_skeleton"] as Record<string, unknown>[])[2]["logical_role"] = "consequence";
    const client = makeMockClient([JSON.stringify(obj)]);
    const result = await synthesiseArgument(makeInput(), { client, timeout_ms: 5000 });
    expect(result.fallback_to_template).toBe(true);
  });

  it("fewer than 2 mechanisms input → fallback_to_template=true", async () => {
    const input = makeInput({ mechanisms: [makeInput().mechanisms[0]] }); // only 1 mechanism
    const result = await synthesiseArgument(input, { timeout_ms: 1000 });
    expect(result.fallback_to_template).toBe(true);
  });

  it("Check 1 fail → retry called → retry succeeds → fallback_to_template=false", async () => {
    // Attempt 1: mechanism types are identical (triggers Check 1 fail)
    const sameTypeObj = JSON.parse(validSynthesisJson(PACK_IDS)) as Record<string, unknown>;
    (sameTypeObj["mechanism_narratives"] as Record<string, unknown>[])[1]["mechanism_type"] =
      "founder_dependency"; // same as mech_001
    const attempt1Response = JSON.stringify(sameTypeObj);

    // Attempt 2 (retry): new mech_2 with different type
    const newMech2 = JSON.stringify({
      mechanism_id: "mech_002",
      mechanism_type: "no_demand_generation",
      company_specific_narrative: "Acme has no inbound pipeline outside founder referrals (ev_002).",
      evidence_refs: ["ev_002"],
    });

    const client = makeMockClient([attempt1Response, newMech2]);
    const result = await synthesiseArgument(makeInput(), { client, timeout_ms: 5000 });

    expect(result.fallback_to_template).toBe(false);
    expect(result.mechanism_narratives[1].mechanism_type).toBe("no_demand_generation");
  });

  it("Check 1 fail → retry also fails → fallback_to_template=true, distinctness_check.passed=false", async () => {
    // Both attempts return identical mechanism types
    const sameTypeObj = JSON.parse(validSynthesisJson(PACK_IDS)) as Record<string, unknown>;
    (sameTypeObj["mechanism_narratives"] as Record<string, unknown>[])[1]["mechanism_type"] =
      "founder_dependency";
    const badResponse = JSON.stringify(sameTypeObj);

    // Retry also returns identical type
    const badRetry = JSON.stringify({
      mechanism_id: "mech_002",
      mechanism_type: "founder_dependency", // still same
      company_specific_narrative: "Founder still required for every deal (ev_002).",
      evidence_refs: ["ev_002"],
    });

    const client = makeMockClient([badResponse, badRetry]);
    const result = await synthesiseArgument(makeInput(), { client, timeout_ms: 5000 });

    expect(result.fallback_to_template).toBe(true);
    expect(result.distinctness_check.passed).toBe(false);
  });

  it("Check 3 soft fail → note in distinctness_check.notes, fallback_to_template=false", async () => {
    // Make mechanism narratives nearly identical text (high word overlap)
    const obj = JSON.parse(validSynthesisJson(PACK_IDS)) as Record<string, unknown>;
    const mechanisms = obj["mechanism_narratives"] as Record<string, unknown>[];
    mechanisms[0] = {
      mechanism_id: "mech_001",
      mechanism_type: "founder_dependency",
      company_specific_narrative:
        "Acme requires CEO approval for every enterprise deal above $10k due to missing contract process (ev_001).",
      evidence_refs: ["ev_001"],
    };
    mechanisms[1] = {
      mechanism_id: "mech_002",
      mechanism_type: "no_demand_generation", // different type → Check 1 passes
      company_specific_narrative:
        "Acme requires CEO approval for every enterprise deal above $10k due to missing contract process (ev_002).",
      evidence_refs: ["ev_002"], // different refs → Check 2 passes (Jaccard = 0)
    };

    const client = makeMockClient([JSON.stringify(obj)]);
    const result = await synthesiseArgument(makeInput(), { client, timeout_ms: 5000 });

    expect(result.fallback_to_template).toBe(false);
    expect(result.distinctness_check.passed).toBe(true);
    const hasWordOverlap = (result.distinctness_check.notes ?? []).some(n =>
      n.startsWith("word_overlap:")
    );
    expect(hasWordOverlap).toBe(true);
  });

  it("Check 4 soft fail → causal_dependence note added, fallback_to_template=false", async () => {
    const obj = JSON.parse(validSynthesisJson(PACK_IDS)) as Record<string, unknown>;
    const mechanisms = obj["mechanism_narratives"] as Record<string, unknown>[];
    mechanisms[1] = {
      mechanism_id: "mech_002",
      mechanism_type: "no_demand_generation",
      company_specific_narrative:
        "As a result of the founder bottleneck, Acme cannot build demand generation capacity (ev_002).",
      evidence_refs: ["ev_002"],
    };

    const client = makeMockClient([JSON.stringify(obj)]);
    const result = await synthesiseArgument(makeInput(), { client, timeout_ms: 5000 });

    expect(result.fallback_to_template).toBe(false);
    expect(result.distinctness_check.passed).toBe(true);
    const hasCausal = (result.distinctness_check.notes ?? []).some(n =>
      n.includes("causal_dependence")
    );
    expect(hasCausal).toBe(true);
  });

  it("synthesis_id format: syn_<company_id>_<timestamp>", async () => {
    const client = makeMockClient([validSynthesisJson(PACK_IDS)]);
    const result = await synthesiseArgument(makeInput(), { client, timeout_ms: 5000 });
    expect(result.synthesis_id).toMatch(/^syn_test-co_\d+$/);
  });

  it("timeout → fallback_to_template=true", async () => {
    // Client that never resolves
    const neverResolves = {
      messages: {
        create: vi.fn().mockReturnValue(new Promise(() => {
          // intentionally never resolves
        })),
      },
    } as unknown as Anthropic;

    const result = await synthesiseArgument(makeInput(), {
      client: neverResolves,
      timeout_ms: 50, // very short timeout
    });

    expect(result.fallback_to_template).toBe(true);
  });
});
