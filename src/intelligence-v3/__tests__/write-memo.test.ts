/**
 * Write Memo Tests — V3-M4 (Dean & Wiseman execution spec)
 *
 * Tests for writeMemo() and its sub-functions:
 *
 * buildSystemPrompt:
 *   - contains hard-rule constraints (no invention, no banned phrases)
 *   - contains framing instruction for each adjudication_mode
 *   - contains word budget
 *   - includes confidence_caveats when non-empty
 *   - does not include caveats when empty
 *
 * buildUserPrompt:
 *   - contains company name and hook excerpt
 *   - contains thesis
 *   - contains all evidence spine excerpts
 *   - contains intervention framing and CTA
 *   - includes founder name and title when provided
 *
 * parseResponse:
 *   - valid JSON → returns all 6 LLM sections
 *   - JSON wrapped in code fences → strips and parses
 *   - invalid JSON → throws ERR_MEMO_PARSE
 *   - missing required section → throws ERR_MEMO_MISSING_SECTIONS
 *   - empty section string → throws ERR_MEMO_MISSING_SECTIONS
 *
 * writeMemo (with mocked Anthropic client):
 *   - abort guard: adjudication_mode = "abort" throws ERR_ADJUDICATION_ABORT
 *   - valid response → correct MarkdownMemo shape
 *   - evidence_ids populated from evidence_spine (not from LLM output)
 *   - sections appear in SECTION_ORDER order (7 sections, title_block first)
 *   - memo_id format: "memo_<company_id>_<timestamp>"
 *   - diagnosis_id and intervention_id come from brief
 *   - attempt_number is passed through
 *   - word_count < 400 → ERR_MEMO_TOO_SHORT
 *   - word_count > 1400 → ERR_MEMO_TOO_LONG
 *   - banned phrase in output → ERR_BANNED_PHRASE
 *   - evidence_ids empty (empty spine) → ERR_MEMO_EVIDENCE_EMPTY
 *
 * All tests are fully deterministic — no external API calls.
 * The Anthropic client is injected via WriteMemoConfig.client.
 */

import { describe, it, expect, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import {
  writeMemo,
  buildSystemPrompt,
  buildUserPrompt,
  parseResponse,
} from "../memo/write-memo.js";
import type { WriteMemoConfig } from "../memo/write-memo.js";
import type { MemoBrief, EvidenceSpineRecord } from "../types/memo-brief.js";
import { buildCriticSystemPrompt } from "../memo/criticise-memo.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock Anthropic client that returns a fixed response string. */
function makeMockClient(responseText: string): Anthropic {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: responseText }],
        id: "msg_test",
        model: "claude-opus-4-6",
        role: "assistant",
        stop_reason: "end_turn",
        type: "message",
        usage: { input_tokens: 100, output_tokens: 200 },
      }),
    },
  } as unknown as Anthropic;
}

/** Repeat a phrase N times joined by spaces to produce a body with predictable word count. */
function words(n: number, filler = "Acme delivers measurable procurement savings"): string {
  // filler = 5 words
  const repeats = Math.ceil(n / 5);
  return Array(repeats).fill(filler).join(" ");
}

/** Build a JSON string representing valid 6-section LLM output with target word count. */
function validSectionsJson(wordsPerSection = 80): string {
  // title_block is code-generated (not in LLM output).
  // Default 80 x 6 + heading words = ~502 content + ~5 title_block words — within 400-1400.
  const body = words(wordsPerSection);
  return JSON.stringify({
    executive_thesis: body,
    what_we_observed: body,
    the_pattern: body,
    what_this_means: body,
    what_this_changes: body,
    cta: body,
  });
}

/** Build a JSON string with 6-section content AND company-specific _header fields. */
function validSectionsJsonWithHeaders(wordsPerSection = 80): string {
  const body = words(wordsPerSection);
  return JSON.stringify({
    executive_thesis_header: "Where Acme's customers land versus where Acme's pricing points",
    executive_thesis: body,
    what_we_observed_header: "Five signals from Acme's public record",
    what_we_observed: body,
    the_pattern_header: "The gap that compounds",
    the_pattern: body,
    what_this_means_header: "What this costs in real terms",
    what_this_means: body,
    what_this_changes_header: "The structural move",
    what_this_changes: body,
    cta_header: "", // empty string → sanitized to undefined → no ## line
    cta: body,
  });
}

function makeSpineRecord(id: string, excerpt = "Customer reported 40% cost reduction at Acme"): EvidenceSpineRecord {
  return {
    evidence_id: id,
    excerpt,
    memo_role: "diagnosis_support",
    usage_instruction: "Use in 'what_this_means' section to ground the diagnosis",
  };
}

function makeBrief(overrides: Partial<MemoBrief> = {}): MemoBrief {
  return {
    brief_id: "brief_test-co_001",
    company_id: "test-co",
    created_at: new Date().toISOString(),

    target_company: "TestCo",
    founder_name: undefined,
    founder_title: undefined,

    adjudication_mode: "full_confidence",
    memo_framing: "assertive",

    diagnosis_id: "diag_001",
    intervention_id: "int_001",

    hook: {
      evidence_id: "ev_001",
      excerpt: "TestCo customers report 40% cost reduction in procurement cycles.",
      hook_type: "customer_quote",
      framing_instruction:
        "Open with this customer observation directly — no preamble.",
    },

    thesis: "TestCo is selling enterprise software to buyers who cannot afford enterprise procurement cycles.",

    evidence_spine: [
      makeSpineRecord("ev_001", "TestCo customers report 40% cost reduction in procurement cycles."),
      makeSpineRecord("ev_002", "TestCo pricing starts at $2,000/month — mid-market competitors charge $500."),
      makeSpineRecord("ev_003", "TestCo founder LinkedIn: 'Built for the Fortune 500.'"),
    ],

    intervention_framing:
      "Identify the buyer profile where you actually win, and retool outreach around it",

    tone_constraints: {
      register: "direct",
      perspective: "strategic_analyst",
      avoid: ["generic_advice", "jargon", "hedging_language", "feature_selling", "unsolicited_praise"],
    },

    banned_phrases: [
      "game-changing",
      "thought leader",
      "world-class",
      "best-in-class",
      "cutting-edge",
      "low-hanging fruit",
      "reach out",
    ],

    confidence_caveats: [],

    cta: "If the diagnosis is wrong, it would be useful to know. If it is right, there is a specific way companies resolve it. Twenty minutes is enough to test which it is.",
    word_budget: { target_min: 650, target_max: 1000, hard_max: 1400 },
    required_sections: ["title_block", "executive_thesis", "what_we_observed", "the_pattern", "what_this_means", "what_this_changes", "cta"],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildSystemPrompt
// ---------------------------------------------------------------------------

describe("buildSystemPrompt", () => {
  it("contains the no-invention hard rule", () => {
    const brief = makeBrief();
    const prompt = buildSystemPrompt(brief);
    expect(prompt).toContain("Do not invent any facts");
  });

  it("contains banned phrase sample in prompt", () => {
    const brief = makeBrief();
    const prompt = buildSystemPrompt(brief);
    expect(prompt).toContain("game-changing");
  });

  it("contains word budget target range", () => {
    const brief = makeBrief();
    const prompt = buildSystemPrompt(brief);
    expect(prompt).toContain("650");
    expect(prompt).toContain("1000");
    expect(prompt).toContain("1400");
  });

  it("full_confidence framing is direct — no hedging language", () => {
    const brief = makeBrief({ adjudication_mode: "full_confidence" });
    const prompt = buildSystemPrompt(brief);
    expect(prompt.toLowerCase()).toContain("direct");
    expect(prompt.toLowerCase()).toContain("established fact");
  });

  it("conditional framing uses 'confidence' qualifier language", () => {
    const brief = makeBrief({ adjudication_mode: "conditional", memo_framing: "indicative" });
    const prompt = buildSystemPrompt(brief);
    expect(prompt.toLowerCase()).toContain("confidence");
  });

  it("exploratory framing includes hypothesis language instruction", () => {
    const brief = makeBrief({ adjudication_mode: "exploratory", memo_framing: "hypothesis" });
    const prompt = buildSystemPrompt(brief);
    expect(prompt.toLowerCase()).toContain("hypothesis");
    expect(prompt).toContain("the evidence suggests");
  });

  it("includes confidence_caveats when non-empty", () => {
    const brief = makeBrief({
      confidence_caveats: ["Pricing data is inferred from job posting language"],
    });
    const prompt = buildSystemPrompt(brief);
    expect(prompt).toContain("Pricing data is inferred from job posting language");
    expect(prompt).toContain("Do not assert the following as established fact");
  });

  it("does not include caveat instruction when confidence_caveats is empty", () => {
    const brief = makeBrief({ confidence_caveats: [] });
    const prompt = buildSystemPrompt(brief);
    expect(prompt).not.toContain("Do not assert the following as established fact");
  });

  it("requires 12 JSON keys in output format (6 content + 6 header)", () => {
    const brief = makeBrief();
    const prompt = buildSystemPrompt(brief);
    // Content keys
    expect(prompt).toContain('"executive_thesis"');
    expect(prompt).toContain('"what_we_observed"');
    expect(prompt).toContain('"the_pattern"');
    expect(prompt).toContain('"what_this_means"');
    expect(prompt).toContain('"what_this_changes"');
    expect(prompt).toContain('"cta"');
    // Header keys
    expect(prompt).toContain('"executive_thesis_header"');
    expect(prompt).toContain('"what_we_observed_header"');
    expect(prompt).toContain('"the_pattern_header"');
    expect(prompt).toContain('"what_this_means_header"');
    expect(prompt).toContain('"what_this_changes_header"');
    expect(prompt).toContain('"cta_header"');
  });

  it("instructs: show mechanism before naming it in the_pattern", () => {
    const brief = makeBrief();
    const prompt = buildSystemPrompt(brief);
    expect(prompt).toContain("Show the mechanism before naming it");
  });

  it("instructs: every section must contain company-specific facts", () => {
    const brief = makeBrief();
    const prompt = buildSystemPrompt(brief);
    expect(prompt.toLowerCase()).toContain("company-specific");
  });

  it("contains section-by-section guidance", () => {
    const brief = makeBrief();
    const prompt = buildSystemPrompt(brief);
    expect(prompt).toContain("executive_thesis (80-130w)");
    expect(prompt).toContain("what_we_observed (180-260w)");
    expect(prompt).toContain("the_pattern (130-200w)");
    expect(prompt).toContain("what_this_means (140-200w)");
    expect(prompt).toContain("what_this_changes (140-200w)");
    expect(prompt).toContain("cta (40-70w)");
  });

  it("contains the 20 Laws heading", () => {
    const brief = makeBrief();
    const prompt = buildSystemPrompt(brief);
    expect(prompt).toContain("THE LAWS:");
  });

  it("contains evidence texture instruction", () => {
    const brief = makeBrief();
    const prompt = buildSystemPrompt(brief);
    expect(prompt).toContain("EVIDENCE TEXTURE");
    expect(prompt).toContain("Weave specific language from evidence");
  });

  it("contains sentence length variance instruction (Law 15)", () => {
    const brief = makeBrief();
    const prompt = buildSystemPrompt(brief);
    expect(prompt).toContain("consecutive sentences");
    expect(prompt).toContain("three words");
  });

  // ── New tests for 20 Golden Rules implementation ──────────────────────────

  it("Law 1: contains first sentence earns the second instruction", () => {
    const brief = makeBrief();
    const prompt = buildSystemPrompt(brief);
    expect(prompt).toContain("FIRST SENTENCE EARNS THE SECOND");
  });

  it("Law 12/13: contains em dash ban", () => {
    const brief = makeBrief();
    const prompt = buildSystemPrompt(brief);
    expect(prompt).toContain("No em dashes");
    expect(prompt).toContain("em dash");
  });

  it("Law 13: contains contractions instruction", () => {
    const brief = makeBrief();
    const prompt = buildSystemPrompt(brief);
    expect(prompt).toContain("contractions");
    expect(prompt).toContain("It's");
    expect(prompt).toContain("Don't");
  });

  it("Law 14: contains slippery slide / curiosity seeds guidance", () => {
    const brief = makeBrief();
    const prompt = buildSystemPrompt(brief);
    expect(prompt.toLowerCase()).toContain("curiosity");
    expect(prompt.toLowerCase()).toContain("slippery slide");
  });

  it("Law 17: contains honesty as persuasion instruction", () => {
    const brief = makeBrief();
    const prompt = buildSystemPrompt(brief);
    expect(prompt).toContain("HONESTY AS PERSUASION");
    expect(prompt).toContain("working well");
  });

  it("Law 18: contains tricolon ban", () => {
    const brief = makeBrief();
    const prompt = buildSystemPrompt(brief);
    expect(prompt.toLowerCase()).toContain("tricolon");
    expect(prompt).toContain("three-part rhythm");
  });

  it("Law 20: contains physical object rule", () => {
    const brief = makeBrief();
    const prompt = buildSystemPrompt(brief);
    expect(prompt).toContain("PHYSICAL OBJECT");
    expect(prompt.toLowerCase()).toContain("printed");
  });

  it("system prompt itself contains no em dashes", () => {
    const brief = makeBrief();
    const prompt = buildSystemPrompt(brief);
    expect(prompt).not.toContain("\u2014");
  });

  it("WRITING ANTI-PATTERNS section lists dead vocabulary words", () => {
    const brief = makeBrief();
    const prompt = buildSystemPrompt(brief);
    expect(prompt).toContain("WRITING ANTI-PATTERNS");
    expect(prompt).toContain("delve");
    expect(prompt).toContain("synergy");
    expect(prompt).toContain("bolster");
  });
});

// ---------------------------------------------------------------------------
// buildUserPrompt
// ---------------------------------------------------------------------------

describe("buildUserPrompt", () => {
  it("contains the company name", () => {
    const brief = makeBrief();
    const prompt = buildUserPrompt(brief);
    expect(prompt).toContain("TestCo");
  });

  it("contains the hook excerpt verbatim", () => {
    const brief = makeBrief();
    const prompt = buildUserPrompt(brief);
    expect(prompt).toContain("TestCo customers report 40% cost reduction in procurement cycles.");
  });

  it("contains the hook framing instruction", () => {
    const brief = makeBrief();
    const prompt = buildUserPrompt(brief);
    expect(prompt).toContain("Open with this customer observation directly");
  });

  it("contains the thesis", () => {
    const brief = makeBrief();
    const prompt = buildUserPrompt(brief);
    expect(prompt).toContain("TestCo is selling enterprise software to buyers who cannot afford enterprise procurement cycles.");
  });

  it("contains all evidence spine excerpts", () => {
    const brief = makeBrief();
    const prompt = buildUserPrompt(brief);
    expect(prompt).toContain("TestCo customers report 40% cost reduction");
    expect(prompt).toContain("TestCo pricing starts at $2,000/month");
    expect(prompt).toContain("TestCo founder LinkedIn");
  });

  it("contains the intervention framing", () => {
    const brief = makeBrief();
    const prompt = buildUserPrompt(brief);
    expect(prompt).toContain("Identify the buyer profile where you actually win");
  });

  it("contains the CTA", () => {
    const brief = makeBrief();
    const prompt = buildUserPrompt(brief);
    expect(prompt).toContain("If the diagnosis is wrong");
  });

  it("includes founder name when provided", () => {
    const brief = makeBrief({ founder_name: "Alice Chen", founder_title: "CEO" });
    const prompt = buildUserPrompt(brief);
    expect(prompt).toContain("Alice Chen");
    expect(prompt).toContain("CEO");
  });

  it("omits founder line when founder_name is undefined", () => {
    const brief = makeBrief({ founder_name: undefined });
    const prompt = buildUserPrompt(brief);
    expect(prompt).not.toContain("Founder:");
  });

  it("references 6-section in the opening line", () => {
    const brief = makeBrief();
    const prompt = buildUserPrompt(brief);
    expect(prompt).toContain("6-section");
  });
});

// ---------------------------------------------------------------------------
// parseResponse
// ---------------------------------------------------------------------------

describe("parseResponse", () => {
  it("parses valid 6-section JSON", () => {
    const input = JSON.stringify({
      executive_thesis: "Thesis text here.",
      what_we_observed: "Observation text here.",
      the_pattern: "Pattern text here.",
      what_this_means: "Meaning text here.",
      what_this_changes: "Change text here.",
      cta: "Reply to this letter.",
    });
    const result = parseResponse(input);
    expect(result.executive_thesis).toBe("Thesis text here.");
    expect(result.what_we_observed).toBe("Observation text here.");
    expect(result.the_pattern).toBe("Pattern text here.");
    expect(result.what_this_means).toBe("Meaning text here.");
    expect(result.what_this_changes).toBe("Change text here.");
    expect(result.cta).toBe("Reply to this letter.");
  });

  it("strips markdown code fences before parsing", () => {
    const inner = JSON.stringify({
      executive_thesis: "Thesis.",
      what_we_observed: "Obs.",
      the_pattern: "Pattern.",
      what_this_means: "Means.",
      what_this_changes: "Change.",
      cta: "Act.",
    });
    const wrapped = `\`\`\`json\n${inner}\n\`\`\``;
    const result = parseResponse(wrapped);
    expect(result.executive_thesis).toBe("Thesis.");
  });

  it("trims whitespace from section values", () => {
    const input = JSON.stringify({
      executive_thesis: "  Trimmed.  ",
      what_we_observed: "Obs.",
      the_pattern: "Pattern.",
      what_this_means: "Meaning.",
      what_this_changes: "Change.",
      cta: "Act.",
    });
    const result = parseResponse(input);
    expect(result.executive_thesis).toBe("Trimmed.");
  });

  it("throws ERR_MEMO_PARSE on invalid JSON", () => {
    expect(() => parseResponse("not json at all")).toThrow("ERR_MEMO_PARSE");
  });

  it("throws ERR_MEMO_MISSING_SECTIONS when a section is absent", () => {
    const input = JSON.stringify({
      executive_thesis: "Thesis.",
      what_we_observed: "Obs.",
      the_pattern: "Pattern.",
      what_this_means: "Meaning.",
      // what_this_changes is missing
      cta: "Act.",
    });
    expect(() => parseResponse(input)).toThrow("ERR_MEMO_MISSING_SECTIONS");
    expect(() => parseResponse(input)).toThrow("what_this_changes");
  });

  it("throws ERR_MEMO_MISSING_SECTIONS when a section is an empty string", () => {
    const input = JSON.stringify({
      executive_thesis: "",
      what_we_observed: "Obs.",
      the_pattern: "Pattern.",
      what_this_means: "Meaning.",
      what_this_changes: "Change.",
      cta: "Act.",
    });
    expect(() => parseResponse(input)).toThrow("ERR_MEMO_MISSING_SECTIONS");
  });

  it("throws ERR_MEMO_PARSE when response is not an object", () => {
    expect(() => parseResponse('"just a string"')).toThrow("ERR_MEMO_PARSE");
  });

  // ── _header extraction and sanitization ───────────────────────────────────

  it("extracts _header fields when present", () => {
    const input = JSON.stringify({
      executive_thesis_header: "Where Acme wins versus where it prices",
      executive_thesis: "Thesis text.",
      what_we_observed_header: "Five signals",
      what_we_observed: "Obs.",
      the_pattern_header: "The gap",
      the_pattern: "Pattern.",
      what_this_means_header: "Cost in real terms",
      what_this_means: "Means.",
      what_this_changes_header: "The structural move",
      what_this_changes: "Change.",
      cta_header: "Next step",
      cta: "Act.",
    });
    const result = parseResponse(input);
    expect(result.executive_thesis_header).toBe("Where Acme wins versus where it prices");
    expect(result.what_we_observed_header).toBe("Five signals");
    expect(result.cta_header).toBe("Next step");
  });

  it("returns undefined for _header when absent from JSON", () => {
    const input = JSON.stringify({
      executive_thesis: "Thesis.",
      what_we_observed: "Obs.",
      the_pattern: "Pattern.",
      what_this_means: "Means.",
      what_this_changes: "Change.",
      cta: "Act.",
    });
    const result = parseResponse(input);
    expect(result.executive_thesis_header).toBeUndefined();
    expect(result.cta_header).toBeUndefined();
  });

  it("sanitizes empty string _header to undefined", () => {
    const input = JSON.stringify({
      executive_thesis_header: "",
      executive_thesis: "Thesis.",
      what_we_observed_header: "   ",
      what_we_observed: "Obs.",
      the_pattern: "Pattern.",
      what_this_means: "Means.",
      what_this_changes: "Change.",
      cta: "Act.",
    });
    const result = parseResponse(input);
    expect(result.executive_thesis_header).toBeUndefined();
    expect(result.what_we_observed_header).toBeUndefined();
  });

  it("strips leading ## from _header value", () => {
    const input = JSON.stringify({
      executive_thesis_header: "## Where Acme's story breaks down",
      executive_thesis: "Thesis.",
      what_we_observed: "Obs.",
      the_pattern: "Pattern.",
      what_this_means: "Means.",
      what_this_changes: "Change.",
      cta: "Act.",
    });
    const result = parseResponse(input);
    expect(result.executive_thesis_header).toBe("Where Acme's story breaks down");
  });

  it("replaces newlines in _header with spaces", () => {
    const input = JSON.stringify({
      executive_thesis_header: "Header\nWith newline",
      executive_thesis: "Thesis.",
      what_we_observed: "Obs.",
      the_pattern: "Pattern.",
      what_this_means: "Means.",
      what_this_changes: "Change.",
      cta: "Act.",
    });
    const result = parseResponse(input);
    expect(result.executive_thesis_header).toBe("Header With newline");
  });
});

// ---------------------------------------------------------------------------
// writeMemo — with mocked Anthropic client
// ---------------------------------------------------------------------------

describe("writeMemo", () => {
  it("throws ERR_ADJUDICATION_ABORT when adjudication_mode is 'abort'", async () => {
    const brief = makeBrief({ adjudication_mode: "abort", memo_framing: "blocked" });
    await expect(writeMemo(brief)).rejects.toThrow("ERR_ADJUDICATION_ABORT");
  });

  it("returns a valid MarkdownMemo on a well-formed response", async () => {
    const brief = makeBrief();
    const config: WriteMemoConfig = { client: makeMockClient(validSectionsJson()) };
    const result = await writeMemo(brief, 1, config);

    expect(result.memo_id).toMatch(/^memo_test-co_\d+$/);
    expect(result.company_id).toBe("test-co");
    expect(result.brief_id).toBe("brief_test-co_001");
    expect(result.adjudication_mode).toBe("full_confidence");
    expect(result.attempt_number).toBe(1);
    expect(result.generated_at).toBeTruthy();
  });

  it("populates diagnosis_id and intervention_id from brief", async () => {
    const brief = makeBrief();
    const config: WriteMemoConfig = { client: makeMockClient(validSectionsJson()) };
    const result = await writeMemo(brief, 1, config);
    expect(result.diagnosis_id).toBe("diag_001");
    expect(result.intervention_id).toBe("int_001");
  });

  it("populates evidence_ids from evidence_spine (not from LLM output)", async () => {
    const brief = makeBrief();
    const config: WriteMemoConfig = { client: makeMockClient(validSectionsJson()) };
    const result = await writeMemo(brief, 1, config);
    expect(result.evidence_ids).toEqual(["ev_001", "ev_002", "ev_003"]);
  });

  it("sections appear in the correct order (7 sections, title_block first)", async () => {
    const brief = makeBrief();
    const config: WriteMemoConfig = { client: makeMockClient(validSectionsJson()) };
    const result = await writeMemo(brief, 1, config);

    const names = result.sections.map(s => s.name);
    expect(names).toEqual([
      "title_block",
      "executive_thesis",
      "what_we_observed",
      "the_pattern",
      "what_this_means",
      "what_this_changes",
      "cta",
    ]);
  });

  it("title_block contains company name and 'Strategic Diagnostic'", async () => {
    const brief = makeBrief();
    const config: WriteMemoConfig = { client: makeMockClient(validSectionsJson()) };
    const result = await writeMemo(brief, 1, config);

    const titleBlock = result.sections[0];
    expect(titleBlock.name).toBe("title_block");
    expect(titleBlock.markdown).toContain("TestCo");
    expect(titleBlock.markdown).toContain("Strategic Diagnostic");
    expect(titleBlock.markdown).toContain("Confidential");
  });

  it("each section has a positive word_count", async () => {
    const brief = makeBrief();
    const config: WriteMemoConfig = { client: makeMockClient(validSectionsJson()) };
    const result = await writeMemo(brief, 1, config);
    for (const section of result.sections) {
      expect(section.word_count).toBeGreaterThan(0);
    }
  });

  it("markdown omits ## lines when LLM returns no _header fields", async () => {
    const brief = makeBrief();
    const config: WriteMemoConfig = { client: makeMockClient(validSectionsJson()) };
    const result = await writeMemo(brief, 1, config);

    // title_block appears as raw text (no ## heading)
    expect(result.markdown).toContain("TestCo");
    expect(result.markdown).toContain("Strategic Diagnostic");
    // No generic fixed headers — dynamic headers only
    expect(result.markdown).not.toContain("## Executive Thesis");
    expect(result.markdown).not.toContain("## What We Observed");
    expect(result.markdown).not.toContain("## The Pattern");
  });

  it("markdown uses company-specific ## headers when LLM returns _header fields", async () => {
    const brief = makeBrief();
    const config: WriteMemoConfig = { client: makeMockClient(validSectionsJsonWithHeaders()) };
    const result = await writeMemo(brief, 1, config);

    // Custom headers appear as ## lines
    expect(result.markdown).toContain("## Where Acme's customers land versus where Acme's pricing points");
    expect(result.markdown).toContain("## Five signals from Acme's public record");
    expect(result.markdown).toContain("## The gap that compounds");
    // cta_header was empty string → sanitized to undefined → no ## line for cta
    const ctaSection = result.sections.find(s => s.name === "cta");
    expect(ctaSection?.header).toBeUndefined();
  });

  it("word_count matches the assembled markdown", async () => {
    const brief = makeBrief();
    const config: WriteMemoConfig = { client: makeMockClient(validSectionsJson()) };
    const result = await writeMemo(brief, 1, config);

    const rawCount = result.markdown.trim().split(/\s+/).filter(w => w.length > 0).length;
    expect(result.word_count).toBe(rawCount);
  });

  it("attempt_number 2 is passed through", async () => {
    const brief = makeBrief();
    const config: WriteMemoConfig = { client: makeMockClient(validSectionsJson()) };
    const result = await writeMemo(brief, 2, config);
    expect(result.attempt_number).toBe(2);
  });

  it("throws ERR_MEMO_TOO_SHORT when response word count < 400", async () => {
    // Each section has ~3-5 words x 6 sections = ~24 content words + title_block ~5 = ~29 total
    const shortJson = JSON.stringify({
      executive_thesis: "Short thesis text.",
      what_we_observed: "Short obs text.",
      the_pattern: "Short pattern text.",
      what_this_means: "Short means text.",
      what_this_changes: "Short change text.",
      cta: "Reply now.",
    });
    const brief = makeBrief();
    const config: WriteMemoConfig = { client: makeMockClient(shortJson) };
    await expect(writeMemo(brief, 1, config)).rejects.toThrow("ERR_MEMO_TOO_SHORT");
  });

  it("throws ERR_MEMO_TOO_LONG when response word count > 1400", async () => {
    // 250 words x 6 sections = 1500 content words + title_block + headings > 1400
    const longJson = validSectionsJson(250);
    const brief = makeBrief();
    const config: WriteMemoConfig = { client: makeMockClient(longJson) };
    await expect(writeMemo(brief, 1, config)).rejects.toThrow("ERR_MEMO_TOO_LONG");
  });

  it("throws ERR_BANNED_PHRASE when output contains a banned phrase", async () => {
    // Include "game-changing" — one of the banned phrases in makeBrief()
    const bannedJson = JSON.stringify({
      executive_thesis: words(80) + " This is game-changing technology.",
      what_we_observed: words(80),
      the_pattern: words(80),
      what_this_means: words(80),
      what_this_changes: words(80),
      cta: "Reply to this letter to explore further.",
    });
    const brief = makeBrief();
    const config: WriteMemoConfig = { client: makeMockClient(bannedJson) };
    await expect(writeMemo(brief, 1, config)).rejects.toThrow("ERR_BANNED_PHRASE");
    await expect(writeMemo(brief, 1, config)).rejects.toThrow("game-changing");
  });

  it("throws ERR_MEMO_EVIDENCE_EMPTY when evidence_spine is empty", async () => {
    const brief = makeBrief({ evidence_spine: [] });
    const config: WriteMemoConfig = { client: makeMockClient(validSectionsJson()) };
    await expect(writeMemo(brief, 1, config)).rejects.toThrow("ERR_MEMO_EVIDENCE_EMPTY");
  });

  it("throws ERR_MEMO_PARSE when LLM returns malformed JSON", async () => {
    const brief = makeBrief();
    const config: WriteMemoConfig = { client: makeMockClient("This is not JSON") };
    await expect(writeMemo(brief, 1, config)).rejects.toThrow("ERR_MEMO_PARSE");
  });

  it("throws ERR_MEMO_MISSING_SECTIONS when LLM omits a section", async () => {
    const incomplete = JSON.stringify({
      executive_thesis: words(80),
      what_we_observed: words(80),
      the_pattern: words(80),
      what_this_means: words(80),
      // what_this_changes is missing
      cta: "Reply to this letter.",
    });
    const brief = makeBrief();
    const config: WriteMemoConfig = { client: makeMockClient(incomplete) };
    await expect(writeMemo(brief, 1, config)).rejects.toThrow("ERR_MEMO_MISSING_SECTIONS");
  });

  it("throws when no API key and no injected client", async () => {
    const saved = process.env["ANTHROPIC_API_KEY"];
    delete process.env["ANTHROPIC_API_KEY"];
    try {
      const brief = makeBrief();
      await expect(writeMemo(brief, 1)).rejects.toThrow("ANTHROPIC_API_KEY");
    } finally {
      if (saved !== undefined) process.env["ANTHROPIC_API_KEY"] = saved;
    }
  });

  // ── New banned phrase tests (20 Golden Rules vocabulary) ─────────────────

  it("throws ERR_BANNED_PHRASE for em dash in output", async () => {
    const emDashJson = JSON.stringify({
      executive_thesis: words(80) + " The founder\u2014an engineer by training\u2014faces a structural problem.",
      what_we_observed: words(80),
      the_pattern: words(80),
      what_this_means: words(80),
      what_this_changes: words(80),
      cta: "Reply to this letter.",
    });
    const brief = makeBrief({ banned_phrases: ["\u2014"] });
    const config: WriteMemoConfig = { client: makeMockClient(emDashJson) };
    await expect(writeMemo(brief, 1, config)).rejects.toThrow("ERR_BANNED_PHRASE");
  });

  it("throws ERR_BANNED_PHRASE for 'bolster' in output", async () => {
    const bolsterJson = JSON.stringify({
      executive_thesis: words(80) + " This will bolster their market position.",
      what_we_observed: words(80),
      the_pattern: words(80),
      what_this_means: words(80),
      what_this_changes: words(80),
      cta: "Reply to this letter.",
    });
    const brief = makeBrief({ banned_phrases: ["bolster"] });
    const config: WriteMemoConfig = { client: makeMockClient(bolsterJson) };
    await expect(writeMemo(brief, 1, config)).rejects.toThrow("ERR_BANNED_PHRASE");
  });

  it("throws ERR_BANNED_PHRASE for 'in conclusion' in output", async () => {
    const conclusionJson = JSON.stringify({
      executive_thesis: words(80),
      what_we_observed: words(80),
      the_pattern: words(80),
      what_this_means: words(80),
      what_this_changes: words(80),
      cta: words(80) + " In conclusion, book a call with us.",
    });
    const brief = makeBrief({ banned_phrases: ["in conclusion"] });
    const config: WriteMemoConfig = { client: makeMockClient(conclusionJson) };
    await expect(writeMemo(brief, 1, config)).rejects.toThrow("ERR_BANNED_PHRASE");
  });

  it("throws ERR_BANNED_PHRASE for 'moving forward' in output", async () => {
    const movingForwardJson = JSON.stringify({
      executive_thesis: words(80),
      what_we_observed: words(80),
      the_pattern: words(80),
      what_this_means: words(80),
      what_this_changes: words(80) + " Moving forward, the team should reposition.",
      cta: "Reply to this letter.",
    });
    const brief = makeBrief({ banned_phrases: ["moving forward"] });
    const config: WriteMemoConfig = { client: makeMockClient(movingForwardJson) };
    await expect(writeMemo(brief, 1, config)).rejects.toThrow("ERR_BANNED_PHRASE");
  });

  it("emits banned_phrase_hit structured log on ERR_BANNED_PHRASE", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const bannedJson = JSON.stringify({
        executive_thesis: words(80) + " This is game-changing technology.",
        what_we_observed: words(80),
        the_pattern: words(80),
        what_this_means: words(80),
        what_this_changes: words(80),
        cta: "Reply to this letter.",
      });
      const brief = makeBrief();
      const config: WriteMemoConfig = { client: makeMockClient(bannedJson) };
      await expect(writeMemo(brief, 1, config)).rejects.toThrow("ERR_BANNED_PHRASE");

      const hitLog = logSpy.mock.calls.find(call => {
        try {
          const parsed = JSON.parse(call[0] as string);
          return parsed.event === "banned_phrase_rejected";
        } catch {
          return false;
        }
      });
      expect(hitLog).toBeDefined();
      const logData = JSON.parse(hitLog![0] as string);
      expect(logData.company_id).toBe("test-co");
      expect(logData.attempt_number).toBe(1);
      expect(logData.error).toContain("ERR_BANNED_PHRASE");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("emits structured log line after generation", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const brief = makeBrief();
      const config: WriteMemoConfig = { client: makeMockClient(validSectionsJson()) };
      await writeMemo(brief, 1, config);

      const logCall = logSpy.mock.calls.find(call => {
        try {
          const parsed = JSON.parse(call[0] as string);
          return parsed.event === "memo_generated";
        } catch {
          return false;
        }
      });
      expect(logCall).toBeDefined();
      const logData = JSON.parse(logCall![0] as string);
      expect(logData.company_id).toBe("test-co");
      expect(logData.attempt_number).toBe(1);
      expect(logData.word_count).toBeGreaterThan(0);
      expect(logData.section_word_counts).toBeDefined();
      expect(logData.evidence_spine_count).toBe(3);
    } finally {
      logSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// buildCriticSystemPrompt (tone_compliance rubric — 20 Golden Rules)
// ---------------------------------------------------------------------------

describe("buildCriticSystemPrompt", () => {
  it("tone_compliance rubric mentions tricolon detection", () => {
    const prompt = buildCriticSystemPrompt();
    expect(prompt).toContain("tricolon");
  });

  it("tone_compliance rubric mentions sentence length variance", () => {
    const prompt = buildCriticSystemPrompt();
    expect(prompt.toLowerCase()).toContain("sentence");
    expect(prompt.toLowerCase()).toContain("length");
    expect(prompt.toLowerCase()).toContain("consecutive");
  });

  it("tone_compliance rubric mentions contractions as AI tell", () => {
    const prompt = buildCriticSystemPrompt();
    expect(prompt).toContain("contractions");
    expect(prompt.toLowerCase()).toContain("ai tell");
  });

  it("tone_compliance rubric mentions honesty and acknowledgment", () => {
    const prompt = buildCriticSystemPrompt();
    expect(prompt).toContain("HONESTY");
    expect(prompt.toLowerCase()).toContain("working");
  });
});
