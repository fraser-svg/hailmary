/**
 * Write Memo Tests — V3-M4
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
 *   - valid JSON → returns all 5 sections
 *   - JSON wrapped in code fences → strips and parses
 *   - invalid JSON → throws ERR_MEMO_PARSE
 *   - missing required section → throws ERR_MEMO_MISSING_SECTIONS
 *   - empty section string → throws ERR_MEMO_MISSING_SECTIONS
 *
 * writeMemo (with mocked Anthropic client):
 *   - abort guard: adjudication_mode = "abort" throws ERR_ADJUDICATION_ABORT
 *   - valid response → correct MarkdownMemo shape
 *   - evidence_ids populated from evidence_spine (not from LLM output)
 *   - sections appear in SECTION_ORDER order
 *   - memo_id format: "memo_<company_id>_<timestamp>"
 *   - diagnosis_id and intervention_id come from brief
 *   - attempt_number is passed through
 *   - word_count < 300 → ERR_MEMO_TOO_SHORT
 *   - word_count > 850 → ERR_MEMO_TOO_LONG
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
        model: "claude-haiku-4-5-20251001",
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
  // Section headings add ~22 words to assembledMarkdown; stay within budget.
  // Default 80 × 6 + 22 = 502 total — within 300–1100.
  // All 6 sections use the same body so word count is predictable across tests.
  const body = words(wordsPerSection);
  return JSON.stringify({
    observation: body,
    the_pattern: body,
    what_this_means: body,
    why_this_happens: body,
    what_this_changes: body,
    next_step: body,
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
    word_budget: { target_min: 650, target_max: 850, hard_max: 1100 },
    required_sections: ["observation", "the_pattern", "what_this_means", "why_this_happens", "what_this_changes", "next_step"],
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
    expect(prompt).toContain("850");
    expect(prompt).toContain("1100");
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

  it("requires exactly 6 JSON keys in output format", () => {
    const brief = makeBrief();
    const prompt = buildSystemPrompt(brief);
    expect(prompt).toContain('"observation"');
    expect(prompt).toContain('"the_pattern"');
    expect(prompt).toContain('"what_this_means"');
    expect(prompt).toContain('"why_this_happens"');
    expect(prompt).toContain('"what_this_changes"');
    expect(prompt).toContain('"next_step"');
  });

  it("instructs: exactly 2 causal forces in why_this_happens", () => {
    const brief = makeBrief();
    const prompt = buildSystemPrompt(brief);
    expect(prompt).toContain("exactly 2 causal forces");
  });

  it("instructs: every section must contain company-specific facts", () => {
    const brief = makeBrief();
    const prompt = buildSystemPrompt(brief);
    expect(prompt.toLowerCase()).toContain("company-specific");
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
});

// ---------------------------------------------------------------------------
// parseResponse
// ---------------------------------------------------------------------------

describe("parseResponse", () => {
  it("parses valid 6-section JSON", () => {
    const input = JSON.stringify({
      observation: "Observation text here.",
      the_pattern: "Pattern text here.",
      what_this_means: "Meaning text here.",
      why_this_happens: "Cause text here.",
      what_this_changes: "Change text here.",
      next_step: "Reply to this letter.",
    });
    const result = parseResponse(input);
    expect(result.observation).toBe("Observation text here.");
    expect(result.the_pattern).toBe("Pattern text here.");
    expect(result.what_this_means).toBe("Meaning text here.");
    expect(result.why_this_happens).toBe("Cause text here.");
    expect(result.what_this_changes).toBe("Change text here.");
    expect(result.next_step).toBe("Reply to this letter.");
  });

  it("strips markdown code fences before parsing", () => {
    const inner = JSON.stringify({
      observation: "Obs.",
      the_pattern: "Pattern.",
      what_this_means: "Means.",
      why_this_happens: "Cause.",
      what_this_changes: "Change.",
      next_step: "Act.",
    });
    const wrapped = `\`\`\`json\n${inner}\n\`\`\``;
    const result = parseResponse(wrapped);
    expect(result.observation).toBe("Obs.");
  });

  it("trims whitespace from section values", () => {
    const input = JSON.stringify({
      observation: "  Trimmed.  ",
      the_pattern: "Pattern.",
      what_this_means: "Meaning.",
      why_this_happens: "Cause.",
      what_this_changes: "Change.",
      next_step: "Act.",
    });
    const result = parseResponse(input);
    expect(result.observation).toBe("Trimmed.");
  });

  it("throws ERR_MEMO_PARSE on invalid JSON", () => {
    expect(() => parseResponse("not json at all")).toThrow("ERR_MEMO_PARSE");
  });

  it("throws ERR_MEMO_MISSING_SECTIONS when a section is absent", () => {
    const input = JSON.stringify({
      observation: "Obs.",
      the_pattern: "Pattern.",
      what_this_means: "Meaning.",
      // why_this_happens is missing
      what_this_changes: "Change.",
      next_step: "Act.",
    });
    expect(() => parseResponse(input)).toThrow("ERR_MEMO_MISSING_SECTIONS");
    expect(() => parseResponse(input)).toThrow("why_this_happens");
  });

  it("throws ERR_MEMO_MISSING_SECTIONS when a section is an empty string", () => {
    const input = JSON.stringify({
      observation: "",
      the_pattern: "Pattern.",
      what_this_means: "Meaning.",
      why_this_happens: "Cause.",
      what_this_changes: "Change.",
      next_step: "Act.",
    });
    expect(() => parseResponse(input)).toThrow("ERR_MEMO_MISSING_SECTIONS");
  });

  it("throws ERR_MEMO_PARSE when response is not an object", () => {
    expect(() => parseResponse('"just a string"')).toThrow("ERR_MEMO_PARSE");
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

  it("sections appear in the correct order", async () => {
    const brief = makeBrief();
    const config: WriteMemoConfig = { client: makeMockClient(validSectionsJson()) };
    const result = await writeMemo(brief, 1, config);

    const names = result.sections.map(s => s.name);
    expect(names).toEqual([
      "observation",
      "the_pattern",
      "what_this_means",
      "why_this_happens",
      "what_this_changes",
      "next_step",
    ]);
  });

  it("each section has a positive word_count", async () => {
    const brief = makeBrief();
    const config: WriteMemoConfig = { client: makeMockClient(validSectionsJson()) };
    const result = await writeMemo(brief, 1, config);
    for (const section of result.sections) {
      expect(section.word_count).toBeGreaterThan(0);
    }
  });

  it("markdown assembles all 6 section headings", async () => {
    const brief = makeBrief();
    const config: WriteMemoConfig = { client: makeMockClient(validSectionsJson()) };
    const result = await writeMemo(brief, 1, config);

    expect(result.markdown).toContain("## Observation");
    expect(result.markdown).toContain("## The Pattern");
    expect(result.markdown).toContain("## What This Means");
    expect(result.markdown).toContain("## Why This Happens");
    expect(result.markdown).toContain("## What This Changes");
    expect(result.markdown).toContain("## Next Step");
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

  it("throws ERR_MEMO_TOO_SHORT when response word count < 300", async () => {
    // Each section has ~3-5 words × 6 sections = ~24 content words + headings ~22 = ~46 total
    const shortJson = JSON.stringify({
      observation: "Short obs text.",
      the_pattern: "Short pattern text.",
      what_this_means: "Short means text.",
      why_this_happens: "Short cause text.",
      what_this_changes: "Short change text.",
      next_step: "Reply now.",
    });
    const brief = makeBrief();
    const config: WriteMemoConfig = { client: makeMockClient(shortJson) };
    await expect(writeMemo(brief, 1, config)).rejects.toThrow("ERR_MEMO_TOO_SHORT");
  });

  it("throws ERR_MEMO_TOO_LONG when response word count > 1100", async () => {
    // 200 words × 6 sections = 1200 content words + ~22 heading words = 1222 total > 1100
    const longJson = validSectionsJson(200);
    const brief = makeBrief();
    const config: WriteMemoConfig = { client: makeMockClient(longJson) };
    await expect(writeMemo(brief, 1, config)).rejects.toThrow("ERR_MEMO_TOO_LONG");
  });

  it("throws ERR_BANNED_PHRASE when output contains a banned phrase", async () => {
    // Include "game-changing" — one of the banned phrases in makeBrief()
    const bannedJson = JSON.stringify({
      observation: words(80) + " This is game-changing technology.",
      the_pattern: words(80),
      what_this_means: words(80),
      why_this_happens: words(80),
      what_this_changes: words(80),
      next_step: "Reply to this letter to explore further.",
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
      observation: words(80),
      the_pattern: words(80),
      what_this_means: words(80),
      // why_this_happens is missing
      what_this_changes: words(80),
      next_step: "Reply to this letter.",
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
});
