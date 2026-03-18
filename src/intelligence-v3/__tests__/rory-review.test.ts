/**
 * Rory Review Tests — V3-M5b
 *
 * Tests for roryReview() and its sub-functions:
 *
 * buildRorySystemPrompt:
 *   - contains all 4 dimension names
 *   - contains pub test description
 *   - mentions Rory's persona/framework
 *
 * buildRoryUserPrompt:
 *   - includes memo markdown
 *   - includes evidence spine excerpts
 *
 * parseRoryResponse:
 *   - valid JSON → returns all dimensions + pub test + revision notes
 *   - JSON wrapped in code fences → strips and parses
 *   - invalid JSON → throws ERR_RORY_PARSE
 *   - missing dimension → throws ERR_RORY_PARSE
 *   - missing pub_test → throws ERR_RORY_PARSE
 *   - scores are clamped to 0–5
 *   - specific_suggestions clamped to max 3 items
 *
 * roryReview (mocked client):
 *   - approve case: all dimensions >= 3 + pub pass → verdict "approve"
 *   - revise case: one dimension < 3 → verdict "revise" with revision_notes
 *   - revise case: pub test fails → verdict "revise"
 *   - revise case: all dims fail → verdict "revise" with comprehensive notes
 *   - revision_notes undefined when verdict is "approve"
 *   - revision_notes.what_is_boring populated when reframe_quality fails
 *   - revision_notes.specific_suggestions is array of 2-3 items
 *   - LLM returns no text → ERR_RORY_PARSE
 *   - default model is claude-opus-4-6
 *   - review_id format: "rory_<company_id>_<timestamp>"
 *   - attempt_number is passed through
 *
 * All tests are fully deterministic — no external API calls.
 */

import { describe, it, expect, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import {
  roryReview,
  buildRorySystemPrompt,
  buildRoryUserPrompt,
  parseRoryResponse,
} from "../memo/rory-review.js";
import type { RoryReviewConfig } from "../memo/rory-review.js";
import type { MarkdownMemo } from "../types/memo.js";
import type { MemoBrief, EvidenceSpineRecord } from "../types/memo-brief.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockRoryClient(responseText: string): Anthropic {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: responseText }],
        id: "msg_rory_test",
        model: "claude-opus-4-6",
        role: "assistant",
        stop_reason: "end_turn",
        type: "message",
        usage: { input_tokens: 500, output_tokens: 800 },
      }),
    },
  } as unknown as Anthropic;
}

function makeApproveRoryJson(): string {
  return JSON.stringify({
    reframe_quality: { score: 4, notes: "Genuinely new angle on their pricing mismatch." },
    behavioural_insight: { score: 4, notes: "Names the anchoring effect in procurement." },
    asymmetric_opportunity: { score: 3, notes: "Reframing is cheap but the return is clear." },
    memorability: { score: 4, notes: "The pricing paradox is quotable." },
    pub_test: {
      result: "pass",
      reasoning: "You'd mention this pricing paradox to anyone in B2B SaaS.",
    },
    revision_notes: {
      what_is_boring: "Nothing — the observation is genuinely interesting.",
      what_would_be_interesting: "Could push the behavioural layer harder.",
      missing_behavioural_layer: "The anchoring effect could be named more explicitly.",
      specific_suggestions: [
        "Name the cognitive bias by name in The Pattern section",
        "Add a concrete £ figure for the asymmetric opportunity",
      ],
    },
  });
}

function makeReviseRoryJson(): string {
  return JSON.stringify({
    reframe_quality: { score: 2, notes: "This is mostly restating their own positioning." },
    behavioural_insight: { score: 1, notes: "Purely functional analysis — no behavioural layer." },
    asymmetric_opportunity: { score: 3, notes: "The lever is real but obvious." },
    memorability: { score: 2, notes: "Forgettable. Reads like a strategy document." },
    pub_test: {
      result: "fail",
      reasoning: "Nothing here you'd mention to anyone. Generic GTM analysis.",
    },
    revision_notes: {
      what_is_boring: "The memo describes what the company does, not why their customers behave unexpectedly.",
      what_would_be_interesting: "Focus on why mid-market buyers use enterprise tools differently — there's a behavioural story here about perceived risk and social proof.",
      missing_behavioural_layer: "No mention of why buyers choose this product despite the pricing mismatch. The answer is probably status signalling or risk aversion.",
      specific_suggestions: [
        "Lead with the most surprising customer behaviour, not the company's positioning",
        "Name the specific cognitive bias driving the purchasing pattern",
        "Find the asymmetry: what small perception change would unlock the mid-market?",
      ],
    },
  });
}

function makeAllFailRoryJson(): string {
  return JSON.stringify({
    reframe_quality: { score: 0, notes: "No reframe. Just describing the company." },
    behavioural_insight: { score: 0, notes: "Zero behavioural content." },
    asymmetric_opportunity: { score: 1, notes: "No lever identified." },
    memorability: { score: 0, notes: "Actively boring." },
    pub_test: {
      result: "fail",
      reasoning: "Would not bring this up anywhere.",
    },
    revision_notes: {
      what_is_boring: "Everything. This reads like a company Wikipedia entry.",
      what_would_be_interesting: "Start from scratch. What is the most surprising thing about how their customers actually use the product?",
      missing_behavioural_layer: "There is no psychological insight anywhere in this memo.",
      specific_suggestions: [
        "Interview data or review language would reveal the real story",
        "Find one genuinely surprising customer behaviour",
        "Name one thing the founder doesn't know about their own customers",
      ],
    },
  });
}

function makeSpineRecord(id: string): EvidenceSpineRecord {
  return {
    evidence_id: id,
    excerpt: `Evidence excerpt for ${id} — company-specific observation.`,
    memo_role: "diagnosis_support",
    usage_instruction: "Use in observation section",
  };
}

function makeBrief(overrides: Partial<MemoBrief> = {}): MemoBrief {
  return {
    brief_id: "brief_acme_001",
    company_id: "acme",
    created_at: new Date().toISOString(),
    target_company: "Acme",
    adjudication_mode: "full_confidence",
    memo_framing: "assertive",
    diagnosis_id: "diag_001",
    intervention_id: "int_001",
    hook: {
      evidence_id: "ev_001",
      excerpt: "Acme customers report 40% cost savings.",
      hook_type: "customer_quote",
      framing_instruction: "Open with this directly.",
    },
    thesis: "Acme is priced for enterprise but deployed to mid-market.",
    evidence_spine: [
      makeSpineRecord("ev_001"),
      makeSpineRecord("ev_002"),
      makeSpineRecord("ev_003"),
    ],
    intervention_framing: "Clarify what you're actually selling.",
    tone_constraints: {
      register: "direct",
      perspective: "strategic_analyst",
      avoid: ["generic_advice", "jargon", "hedging_language", "feature_selling", "unsolicited_praise"],
    },
    banned_phrases: ["game-changing", "thought leader", "world-class"],
    confidence_caveats: [],
    cta: "If the diagnosis is wrong, it would be useful to know.",
    word_budget: { target_min: 900, target_max: 1100, hard_max: 1400 },
    required_sections: ["title_block", "executive_thesis", "what_we_observed", "the_pattern", "what_this_means", "what_this_changes", "cta"],
    ...overrides,
  };
}

function makeMemo(overrides: Partial<MarkdownMemo> = {}): MarkdownMemo {
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
      { name: "executive_thesis", markdown: "Acme's procurement platform saw 40% cost savings.", word_count: 8 },
      { name: "what_we_observed", markdown: "The deal size creates a buyer mismatch.", word_count: 7 },
      { name: "the_pattern", markdown: "Enterprise pricing and mid-market reality diverge.", word_count: 7 },
      { name: "what_this_means", markdown: "The deal size creates a buyer mismatch.", word_count: 7 },
      { name: "what_this_changes", markdown: "We would reframe the ICP.", word_count: 6 },
      { name: "cta", markdown: "Reply to this letter to explore further.", word_count: 7 },
    ],
    markdown: "Acme\nStrategic Diagnostic\n\n## Executive Thesis\n\nAcme's procurement platform saw 40% cost savings.",
    generated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildRorySystemPrompt
// ---------------------------------------------------------------------------

describe("buildRorySystemPrompt", () => {
  it("contains all 4 dimension names", () => {
    const prompt = buildRorySystemPrompt();
    expect(prompt).toContain("reframe_quality");
    expect(prompt).toContain("behavioural_insight");
    expect(prompt).toContain("asymmetric_opportunity");
    expect(prompt).toContain("memorability");
  });

  it("contains pub test description", () => {
    const prompt = buildRorySystemPrompt();
    expect(prompt.toLowerCase()).toContain("pub test");
    expect(prompt).toContain("pub_test");
  });

  it("mentions Rory's persona and framework", () => {
    const prompt = buildRorySystemPrompt();
    expect(prompt).toContain("Rory Sutherland");
    expect(prompt.toLowerCase()).toContain("behavioural economics");
    expect(prompt.toLowerCase()).toContain("reframing");
    expect(prompt.toLowerCase()).toContain("asymmetric");
  });
});

// ---------------------------------------------------------------------------
// buildRoryUserPrompt
// ---------------------------------------------------------------------------

describe("buildRoryUserPrompt", () => {
  it("includes memo markdown", () => {
    const memo = makeMemo();
    const brief = makeBrief();
    const prompt = buildRoryUserPrompt(memo, brief);
    expect(prompt).toContain(memo.markdown);
  });

  it("includes evidence spine excerpts", () => {
    const brief = makeBrief();
    const memo = makeMemo();
    const prompt = buildRoryUserPrompt(memo, brief);
    for (const record of brief.evidence_spine) {
      expect(prompt).toContain(record.excerpt);
    }
  });
});

// ---------------------------------------------------------------------------
// parseRoryResponse
// ---------------------------------------------------------------------------

describe("parseRoryResponse", () => {
  it("valid JSON → parsed correctly", () => {
    const json = makeApproveRoryJson();
    const result = parseRoryResponse(json);
    expect(result.reframe_quality.score).toBe(4);
    expect(result.behavioural_insight.score).toBe(4);
    expect(result.asymmetric_opportunity.score).toBe(3);
    expect(result.memorability.score).toBe(4);
    expect(result.pub_test.result).toBe("pass");
    expect(result.revision_notes.what_is_boring).toBeTruthy();
  });

  it("scores clamped to 0-5 range", () => {
    const json = JSON.stringify({
      reframe_quality: { score: 7, notes: "Over max" },
      behavioural_insight: { score: -2, notes: "Under min" },
      asymmetric_opportunity: { score: 3, notes: "Normal" },
      memorability: { score: 5, notes: "Max" },
      pub_test: { result: "pass", reasoning: "Fine" },
      revision_notes: {
        what_is_boring: "",
        what_would_be_interesting: "",
        missing_behavioural_layer: "",
        specific_suggestions: [],
      },
    });
    // parseRoryResponse itself doesn't clamp — clamping happens in toDimensionScore.
    // But it should still parse without error.
    const result = parseRoryResponse(json);
    expect(result.reframe_quality.score).toBe(7); // raw parse, clamping is in assembly
    expect(result.behavioural_insight.score).toBe(-2);
  });

  it("missing dimension → ERR_RORY_PARSE", () => {
    const json = JSON.stringify({
      reframe_quality: { score: 4, notes: "Fine" },
      // missing behavioural_insight
      asymmetric_opportunity: { score: 3, notes: "Fine" },
      memorability: { score: 4, notes: "Fine" },
      pub_test: { result: "pass", reasoning: "Fine" },
      revision_notes: {
        what_is_boring: "",
        what_would_be_interesting: "",
        missing_behavioural_layer: "",
        specific_suggestions: [],
      },
    });
    expect(() => parseRoryResponse(json)).toThrow("ERR_RORY_PARSE");
    expect(() => parseRoryResponse(json)).toThrow("behavioural_insight");
  });

  it("missing pub_test → ERR_RORY_PARSE", () => {
    const json = JSON.stringify({
      reframe_quality: { score: 4, notes: "Fine" },
      behavioural_insight: { score: 4, notes: "Fine" },
      asymmetric_opportunity: { score: 3, notes: "Fine" },
      memorability: { score: 4, notes: "Fine" },
      // missing pub_test
      revision_notes: {
        what_is_boring: "",
        what_would_be_interesting: "",
        missing_behavioural_layer: "",
        specific_suggestions: [],
      },
    });
    expect(() => parseRoryResponse(json)).toThrow("ERR_RORY_PARSE");
    expect(() => parseRoryResponse(json)).toThrow("pub_test");
  });

  it("non-JSON → ERR_RORY_PARSE", () => {
    expect(() => parseRoryResponse("This is not JSON")).toThrow("ERR_RORY_PARSE");
  });

  it("markdown-wrapped JSON → cleaned and parsed", () => {
    const json = makeApproveRoryJson();
    const wrapped = "```json\n" + json + "\n```";
    const result = parseRoryResponse(wrapped);
    expect(result.reframe_quality.score).toBe(4);
  });

  it("specific_suggestions clamped to max 3 items", () => {
    const json = JSON.stringify({
      reframe_quality: { score: 4, notes: "Fine" },
      behavioural_insight: { score: 4, notes: "Fine" },
      asymmetric_opportunity: { score: 3, notes: "Fine" },
      memorability: { score: 4, notes: "Fine" },
      pub_test: { result: "pass", reasoning: "Fine" },
      revision_notes: {
        what_is_boring: "Nothing",
        what_would_be_interesting: "More",
        missing_behavioural_layer: "None",
        specific_suggestions: ["one", "two", "three", "four", "five"],
      },
    });
    const result = parseRoryResponse(json);
    expect(result.revision_notes.specific_suggestions).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// roryReview (mocked client)
// ---------------------------------------------------------------------------

describe("roryReview", () => {
  it("approve: all dims >= 3 + pub pass → verdict 'approve'", async () => {
    const client = makeMockRoryClient(makeApproveRoryJson());
    const result = await roryReview(makeMemo(), makeBrief(), 1, { client });
    expect(result.verdict).toBe("approve");
    expect(result.dimensions.reframe_quality.pass).toBe(true);
    expect(result.dimensions.behavioural_insight.pass).toBe(true);
    expect(result.dimensions.asymmetric_opportunity.pass).toBe(true);
    expect(result.dimensions.memorability.pass).toBe(true);
    expect(result.pub_test.result).toBe("pass");
  });

  it("revise: one dim fails → verdict 'revise' with revision_notes", async () => {
    const client = makeMockRoryClient(makeReviseRoryJson());
    const result = await roryReview(makeMemo(), makeBrief(), 1, { client });
    expect(result.verdict).toBe("revise");
    expect(result.revision_notes).toBeDefined();
    expect(result.dimensions.reframe_quality.pass).toBe(false);
  });

  it("revise: pub test fails → verdict 'revise'", async () => {
    // Use revise JSON which has pub test fail
    const client = makeMockRoryClient(makeReviseRoryJson());
    const result = await roryReview(makeMemo(), makeBrief(), 1, { client });
    expect(result.verdict).toBe("revise");
    expect(result.pub_test.result).toBe("fail");
  });

  it("revise: all dims fail → verdict 'revise' with comprehensive notes", async () => {
    const client = makeMockRoryClient(makeAllFailRoryJson());
    const result = await roryReview(makeMemo(), makeBrief(), 1, { client });
    expect(result.verdict).toBe("revise");
    expect(result.revision_notes).toBeDefined();
    expect(result.revision_notes!.what_is_boring).toBeTruthy();
    expect(result.revision_notes!.what_would_be_interesting).toBeTruthy();
    expect(result.revision_notes!.missing_behavioural_layer).toBeTruthy();
    expect(result.revision_notes!.specific_suggestions.length).toBeGreaterThan(0);
  });

  it("revision_notes undefined when verdict is 'approve'", async () => {
    const client = makeMockRoryClient(makeApproveRoryJson());
    const result = await roryReview(makeMemo(), makeBrief(), 1, { client });
    expect(result.verdict).toBe("approve");
    expect(result.revision_notes).toBeUndefined();
  });

  it("revision_notes.what_is_boring populated when reframe_quality fails", async () => {
    const client = makeMockRoryClient(makeReviseRoryJson());
    const result = await roryReview(makeMemo(), makeBrief(), 1, { client });
    expect(result.dimensions.reframe_quality.pass).toBe(false);
    expect(result.revision_notes!.what_is_boring).toBeTruthy();
  });

  it("revision_notes.specific_suggestions is array of 2-3 items", async () => {
    const client = makeMockRoryClient(makeReviseRoryJson());
    const result = await roryReview(makeMemo(), makeBrief(), 1, { client });
    expect(Array.isArray(result.revision_notes!.specific_suggestions)).toBe(true);
    expect(result.revision_notes!.specific_suggestions.length).toBeGreaterThanOrEqual(2);
    expect(result.revision_notes!.specific_suggestions.length).toBeLessThanOrEqual(3);
  });

  it("LLM returns no text → ERR_RORY_PARSE", async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [],
          id: "msg_empty",
          model: "claude-opus-4-6",
          role: "assistant",
          stop_reason: "end_turn",
          type: "message",
          usage: { input_tokens: 100, output_tokens: 0 },
        }),
      },
    } as unknown as Anthropic;

    await expect(roryReview(makeMemo(), makeBrief(), 1, { client })).rejects.toThrow(
      "ERR_RORY_PARSE"
    );
  });

  it("default model is claude-opus-4-6", async () => {
    const client = makeMockRoryClient(makeApproveRoryJson());
    await roryReview(makeMemo(), makeBrief(), 1, { client });
    const createCall = (client.messages.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.model).toBe("claude-opus-4-6");
  });

  it("review_id format: 'rory_<company_id>_<timestamp>'", async () => {
    const client = makeMockRoryClient(makeApproveRoryJson());
    const result = await roryReview(makeMemo(), makeBrief(), 1, { client });
    expect(result.review_id).toMatch(/^rory_acme_\d+$/);
  });

  it("attempt_number is passed through", async () => {
    const client = makeMockRoryClient(makeApproveRoryJson());
    const result = await roryReview(makeMemo(), makeBrief(), 2, { client });
    expect(result.attempt_number).toBe(2);
  });

  it("company_id is populated from memo", async () => {
    const client = makeMockRoryClient(makeApproveRoryJson());
    const result = await roryReview(makeMemo(), makeBrief(), 1, { client });
    expect(result.company_id).toBe("acme");
  });

  it("scores are clamped to 0-5 in the final result", async () => {
    const json = JSON.stringify({
      reframe_quality: { score: 7, notes: "Over max" },
      behavioural_insight: { score: -2, notes: "Under min" },
      asymmetric_opportunity: { score: 3, notes: "Normal" },
      memorability: { score: 5, notes: "Max" },
      pub_test: { result: "pass", reasoning: "Fine" },
      revision_notes: {
        what_is_boring: "",
        what_would_be_interesting: "",
        missing_behavioural_layer: "",
        specific_suggestions: [],
      },
    });
    const client = makeMockRoryClient(json);
    const result = await roryReview(makeMemo(), makeBrief(), 1, { client });
    expect(result.dimensions.reframe_quality.score).toBe(5); // clamped from 7
    expect(result.dimensions.behavioural_insight.score).toBe(0); // clamped from -2
  });
});
