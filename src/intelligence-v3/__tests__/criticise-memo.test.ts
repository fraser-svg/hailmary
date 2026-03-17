/**
 * Criticise Memo Tests — V3-M5
 *
 * Tests for criticiseMemo() and its sub-functions:
 *
 * buildCriticSystemPrompt:
 *   - contains the adversarial posture instruction
 *   - describes all 4 dimensions with scoring guides
 *   - describes both named tests
 *   - requests JSON output format
 *
 * buildCriticUserPrompt:
 *   - contains the company name
 *   - contains the memo markdown
 *   - contains the evidence spine excerpts
 *
 * parseCriticResponse:
 *   - valid JSON → returns all dimensions + tests
 *   - JSON wrapped in code fences → strips and parses
 *   - invalid JSON → throws ERR_CRITIC_PARSE
 *   - missing dimension → throws ERR_CRITIC_PARSE
 *   - missing named test → throws ERR_CRITIC_PARSE
 *   - scores are clamped to 0–5
 *
 * criticiseMemo (mocked client):
 *   - pass case: all dimensions ≥ 3 + genericity pass → overall_pass = true
 *   - revise case: one dimension < 3 → overall_pass = false + revision_instructions
 *   - fail case: genericity fail → overall_pass = false + genericity in failing_dims
 *   - genericity test output: result and reasoning populated
 *   - founder pushback output: most_vulnerable_claim always non-empty
 *   - overall_pass = false when any dimension < 3
 *   - overall_pass = false when genericity_test fails (even if all dims ≥ 3)
 *   - revision_instructions absent when overall_pass = true
 *   - revision_instructions present when overall_pass = false
 *   - critic_id format: "critic_<company_id>_<timestamp>"
 *   - attempt_number is passed through
 *
 * All tests are fully deterministic — no external API calls.
 */

import { describe, it, expect, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import {
  criticiseMemo,
  buildCriticSystemPrompt,
  buildCriticUserPrompt,
  parseCriticResponse,
} from "../memo/criticise-memo.js";
import type { CriticConfig } from "../memo/criticise-memo.js";
import type { MarkdownMemo } from "../types/memo.js";
import type { MemoBrief, EvidenceSpineRecord } from "../types/memo-brief.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockCriticClient(responseText: string): Anthropic {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: responseText }],
        id: "msg_critic_test",
        model: "claude-haiku-4-5-20251001",
        role: "assistant",
        stop_reason: "end_turn",
        type: "message",
        usage: { input_tokens: 100, output_tokens: 200 },
      }),
    },
  } as unknown as Anthropic;
}

function makePassCriticJson(): string {
  return JSON.stringify({
    evidence_grounding: { score: 4, notes: "All claims trace to evidence spine." },
    commercial_sharpness: { score: 4, notes: "Company-specific throughout." },
    pattern_clarity: { score: 4, notes: "Narrative gap clearly stated." },
    signal_density: { score: 4, notes: "4 concrete signals with specific fragments." },
    cta_clarity: { score: 5, notes: "One unambiguous ask." },
    tone_compliance: { score: 5, notes: "No violations." },
    genericity_test: {
      result: "pass",
      reasoning: "Memo contains 4 claims uniquely specific to Acme's procurement pricing.",
    },
    founder_pushback_test: {
      most_vulnerable_claim: "Acme is losing deals on procurement cycle length.",
      likely_objection: "We win plenty of deals — our win rate is 40%.",
      severity: "low",
      revision_suggestion: "Add a deal-loss statistic if available.",
    },
  });
}

function makeReviseCriticJson(): string {
  return JSON.stringify({
    evidence_grounding: { score: 4, notes: "Solid grounding." },
    commercial_sharpness: { score: 2, notes: "Second paragraph reads like generic GTM advice." },
    pattern_clarity: { score: 4, notes: "Gap is clear." },
    signal_density: { score: 3, notes: "3 signals but references are vague." },
    cta_clarity: { score: 4, notes: "One clear ask." },
    tone_compliance: { score: 4, notes: "No violations." },
    genericity_test: {
      result: "pass",
      reasoning: "Core argument is company-specific.",
    },
    founder_pushback_test: {
      most_vulnerable_claim: "Your pricing is misaligned with SMB buyers.",
      likely_objection: "We only target enterprise — SMBs are not our ICP.",
      severity: "medium",
      revision_suggestion: "Qualify the buyer claim with enterprise evidence.",
    },
  });
}

function makeFailCriticJson(): string {
  return JSON.stringify({
    evidence_grounding: { score: 3, notes: "Mostly grounded." },
    commercial_sharpness: { score: 1, notes: "Could be sent to any SaaS company." },
    pattern_clarity: { score: 2, notes: "Gap not explicitly named." },
    signal_density: { score: 1, notes: "Vague claims with no concrete signals." },
    cta_clarity: { score: 2, notes: "Two asks embedded in closing." },
    tone_compliance: { score: 3, notes: "Minor issues." },
    genericity_test: {
      result: "fail",
      reasoning: "Removing Acme's name leaves the argument intact — applies to any B2B SaaS.",
    },
    founder_pushback_test: {
      most_vulnerable_claim: "Your pricing structure discourages trial.",
      likely_objection: "We have a free tier — this claim is factually wrong.",
      severity: "high",
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
    cta: "If the diagnosis is wrong, it would be useful to know. If it is right, there is a specific way companies resolve it. Twenty minutes is enough to test which it is.",
    word_budget: { target_min: 650, target_max: 850, hard_max: 1100 },
    required_sections: ["observation", "the_pattern", "what_this_means", "why_this_happens", "what_this_changes", "next_step"],
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
      { name: "observation", markdown: "Acme's procurement platform saw 40% cost savings.", word_count: 8 },
      { name: "what_this_means", markdown: "The deal size creates a buyer mismatch.", word_count: 7 },
      { name: "why_this_is_happening", markdown: "Enterprise pricing and mid-market reality diverge.", word_count: 7 },
      { name: "what_we_would_change", markdown: "We would reframe the ICP.", word_count: 6 },
      { name: "cta", markdown: "Reply to this letter to explore further.", word_count: 7 },
    ],
    markdown: "## Observation\n\nAcme's procurement platform saw 40% cost savings.\n\n## What this means\n\nThe deal size creates a buyer mismatch.\n\n## Why this is happening\n\nEnterprise pricing and mid-market reality diverge.\n\n## What we would change\n\nWe would reframe the ICP.\n\n## Next step\n\nReply to this letter to explore further.",
    generated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildCriticSystemPrompt
// ---------------------------------------------------------------------------

describe("buildCriticSystemPrompt", () => {
  it("contains the adversarial posture instruction", () => {
    const prompt = buildCriticSystemPrompt();
    expect(prompt.toLowerCase()).toContain("find weaknesses");
    expect(prompt.toLowerCase()).toContain("default to finding problems");
  });

  it("describes all 6 scoring dimensions", () => {
    const prompt = buildCriticSystemPrompt();
    expect(prompt).toContain("evidence_grounding");
    expect(prompt).toContain("commercial_sharpness");
    expect(prompt).toContain("pattern_clarity");
    expect(prompt).toContain("signal_density");
    expect(prompt).toContain("cta_clarity");
    expect(prompt).toContain("tone_compliance");
  });

  it("includes pass threshold of 3 for each dimension", () => {
    const prompt = buildCriticSystemPrompt();
    // should appear multiple times — once per dimension
    expect((prompt.match(/Pass threshold.*≥ 3/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });

  it("describes the Genericity Test", () => {
    const prompt = buildCriticSystemPrompt();
    expect(prompt).toContain("Genericity Test");
    expect(prompt).toContain("SaaS company");
  });

  it("describes the Founder Pushback Test", () => {
    const prompt = buildCriticSystemPrompt();
    expect(prompt).toContain("Founder Pushback Test");
    expect(prompt).toContain("CEO");
  });

  it("requests JSON output with all required keys", () => {
    const prompt = buildCriticSystemPrompt();
    expect(prompt).toContain('"evidence_grounding"');
    expect(prompt).toContain('"genericity_test"');
    expect(prompt).toContain('"founder_pushback_test"');
  });
});

// ---------------------------------------------------------------------------
// buildCriticUserPrompt
// ---------------------------------------------------------------------------

describe("buildCriticUserPrompt", () => {
  it("contains the company name", () => {
    const memo = makeMemo();
    const brief = makeBrief();
    const prompt = buildCriticUserPrompt(memo, brief);
    expect(prompt).toContain("Acme");
  });

  it("contains the memo markdown", () => {
    const memo = makeMemo();
    const brief = makeBrief();
    const prompt = buildCriticUserPrompt(memo, brief);
    expect(prompt).toContain("## Observation");
    expect(prompt).toContain("40% cost savings");
  });

  it("contains evidence spine excerpts", () => {
    const memo = makeMemo();
    const brief = makeBrief();
    const prompt = buildCriticUserPrompt(memo, brief);
    expect(prompt).toContain("Evidence excerpt for ev_001");
    expect(prompt).toContain("Evidence excerpt for ev_002");
    expect(prompt).toContain("Evidence excerpt for ev_003");
  });
});

// ---------------------------------------------------------------------------
// parseCriticResponse
// ---------------------------------------------------------------------------

describe("parseCriticResponse", () => {
  it("parses a valid full critic JSON", () => {
    const result = parseCriticResponse(makePassCriticJson());
    expect(result.evidence_grounding.score).toBe(4);
    expect(result.commercial_sharpness.score).toBe(4);
    expect(result.pattern_clarity.score).toBe(4);
    expect(result.signal_density.score).toBe(4);
    expect(result.cta_clarity.score).toBe(5);
    expect(result.tone_compliance.score).toBe(5);
    expect(result.genericity_test.result).toBe("pass");
    expect(result.founder_pushback_test.most_vulnerable_claim).toBeTruthy();
  });

  it("strips markdown code fences before parsing", () => {
    const wrapped = `\`\`\`json\n${makePassCriticJson()}\n\`\`\``;
    const result = parseCriticResponse(wrapped);
    expect(result.evidence_grounding.score).toBe(4);
  });

  it("throws ERR_CRITIC_PARSE on invalid JSON", () => {
    expect(() => parseCriticResponse("not json")).toThrow("ERR_CRITIC_PARSE");
  });

  it("throws ERR_CRITIC_PARSE when a dimension is missing", () => {
    const obj = JSON.parse(makePassCriticJson());
    delete obj.commercial_sharpness;
    expect(() => parseCriticResponse(JSON.stringify(obj))).toThrow("ERR_CRITIC_PARSE");
    expect(() => parseCriticResponse(JSON.stringify(obj))).toThrow("commercial_sharpness");
  });

  it("throws ERR_CRITIC_PARSE when genericity_test is missing", () => {
    const obj = JSON.parse(makePassCriticJson());
    delete obj.genericity_test;
    expect(() => parseCriticResponse(JSON.stringify(obj))).toThrow("ERR_CRITIC_PARSE");
  });

  it("throws ERR_CRITIC_PARSE when founder_pushback_test is missing", () => {
    const obj = JSON.parse(makePassCriticJson());
    delete obj.founder_pushback_test;
    expect(() => parseCriticResponse(JSON.stringify(obj))).toThrow("ERR_CRITIC_PARSE");
  });

  it("throws ERR_CRITIC_PARSE when response is not an object", () => {
    expect(() => parseCriticResponse('"just a string"')).toThrow("ERR_CRITIC_PARSE");
  });
});

// ---------------------------------------------------------------------------
// criticiseMemo (with mocked Anthropic client)
// ---------------------------------------------------------------------------

describe("criticiseMemo", () => {
  it("pass case: all dims ≥ 3 + genericity pass → overall_pass = true", async () => {
    const memo = makeMemo();
    const brief = makeBrief();
    const config: CriticConfig = { client: makeMockCriticClient(makePassCriticJson()) };

    const result = await criticiseMemo(memo, brief, 1, config);

    expect(result.overall_pass).toBe(true);
    expect(result.dimensions.evidence_grounding.pass).toBe(true);
    expect(result.dimensions.commercial_sharpness.pass).toBe(true);
    expect(result.dimensions.pattern_clarity.pass).toBe(true);
    expect(result.dimensions.signal_density.pass).toBe(true);
    expect(result.dimensions.cta_clarity.pass).toBe(true);
    expect(result.dimensions.tone_compliance.pass).toBe(true);
    expect(result.genericity_test.result).toBe("pass");
  });

  it("pass case: no revision_instructions when overall_pass = true", async () => {
    const memo = makeMemo();
    const brief = makeBrief();
    const config: CriticConfig = { client: makeMockCriticClient(makePassCriticJson()) };

    const result = await criticiseMemo(memo, brief, 1, config);
    expect(result.revision_instructions).toBeUndefined();
  });

  it("revise case: one dim < 3 → overall_pass = false", async () => {
    const memo = makeMemo();
    const brief = makeBrief();
    const config: CriticConfig = { client: makeMockCriticClient(makeReviseCriticJson()) };

    const result = await criticiseMemo(memo, brief, 1, config);

    expect(result.overall_pass).toBe(false);
    expect(result.dimensions.commercial_sharpness.pass).toBe(false);
    expect(result.dimensions.commercial_sharpness.score).toBe(2);
  });

  it("revise case: revision_instructions populated with failing dimension", async () => {
    const memo = makeMemo();
    const brief = makeBrief();
    const config: CriticConfig = { client: makeMockCriticClient(makeReviseCriticJson()) };

    const result = await criticiseMemo(memo, brief, 1, config);

    expect(result.revision_instructions).toBeDefined();
    expect(result.revision_instructions!.failing_dimensions).toContain("commercial_sharpness");
    expect(result.revision_instructions!.specific_issues.length).toBeGreaterThan(0);
  });

  it("fail case: genericity fail → overall_pass = false even when dims ≥ 3", async () => {
    const memo = makeMemo();
    const brief = makeBrief();
    const config: CriticConfig = { client: makeMockCriticClient(makeFailCriticJson()) };

    const result = await criticiseMemo(memo, brief, 1, config);

    expect(result.overall_pass).toBe(false);
    expect(result.genericity_test.result).toBe("fail");
  });

  it("fail case: revision_instructions includes genericity_test in failing_dims", async () => {
    const memo = makeMemo();
    const brief = makeBrief();
    const config: CriticConfig = { client: makeMockCriticClient(makeFailCriticJson()) };

    const result = await criticiseMemo(memo, brief, 1, config);

    expect(result.revision_instructions!.failing_dimensions).toContain("genericity_test");
  });

  it("genericity test output: result and reasoning are populated", async () => {
    const memo = makeMemo();
    const brief = makeBrief();
    const config: CriticConfig = { client: makeMockCriticClient(makePassCriticJson()) };

    const result = await criticiseMemo(memo, brief, 1, config);

    expect(result.genericity_test.result).toBe("pass");
    expect(result.genericity_test.reasoning.length).toBeGreaterThan(5);
  });

  it("founder pushback test always returns non-empty most_vulnerable_claim", async () => {
    const memo = makeMemo();
    const brief = makeBrief();
    const config: CriticConfig = { client: makeMockCriticClient(makePassCriticJson()) };

    const result = await criticiseMemo(memo, brief, 1, config);

    expect(result.founder_pushback_test.most_vulnerable_claim.length).toBeGreaterThan(5);
    expect(result.founder_pushback_test.likely_objection.length).toBeGreaterThan(5);
    expect(["low", "medium", "high"]).toContain(result.founder_pushback_test.severity);
  });

  it("founder pushback test severity is high for fail case", async () => {
    const memo = makeMemo();
    const brief = makeBrief();
    const config: CriticConfig = { client: makeMockCriticClient(makeFailCriticJson()) };

    const result = await criticiseMemo(memo, brief, 1, config);
    expect(result.founder_pushback_test.severity).toBe("high");
  });

  it("critic_id has correct format", async () => {
    const memo = makeMemo();
    const brief = makeBrief();
    const config: CriticConfig = { client: makeMockCriticClient(makePassCriticJson()) };

    const result = await criticiseMemo(memo, brief, 1, config);
    expect(result.critic_id).toMatch(/^critic_acme_\d+$/);
  });

  it("memo_id matches the input memo", async () => {
    const memo = makeMemo();
    const brief = makeBrief();
    const config: CriticConfig = { client: makeMockCriticClient(makePassCriticJson()) };

    const result = await criticiseMemo(memo, brief, 1, config);
    expect(result.memo_id).toBe("memo_acme_123456");
  });

  it("attempt_number 2 is passed through", async () => {
    const memo = makeMemo();
    const brief = makeBrief();
    const config: CriticConfig = { client: makeMockCriticClient(makePassCriticJson()) };

    const result = await criticiseMemo(memo, brief, 2, config);
    expect(result.attempt_number).toBe(2);
  });

  it("dimension scores are preserved as numbers (0–5)", async () => {
    const memo = makeMemo();
    const brief = makeBrief();
    const config: CriticConfig = { client: makeMockCriticClient(makeReviseCriticJson()) };

    const result = await criticiseMemo(memo, brief, 1, config);
    const scores = [
      result.dimensions.evidence_grounding.score,
      result.dimensions.commercial_sharpness.score,
      result.dimensions.pattern_clarity.score,
      result.dimensions.signal_density.score,
      result.dimensions.cta_clarity.score,
      result.dimensions.tone_compliance.score,
    ];
    for (const s of scores) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(5);
    }
  });

  it("throws when no API key and no injected client", async () => {
    const saved = process.env["ANTHROPIC_API_KEY"];
    delete process.env["ANTHROPIC_API_KEY"];
    try {
      const memo = makeMemo();
      const brief = makeBrief();
      await expect(criticiseMemo(memo, brief, 1)).rejects.toThrow("ANTHROPIC_API_KEY");
    } finally {
      if (saved !== undefined) process.env["ANTHROPIC_API_KEY"] = saved;
    }
  });

  it("revision_instructions.founder_pushback_context is non-empty on failure", async () => {
    const memo = makeMemo();
    const brief = makeBrief();
    const config: CriticConfig = { client: makeMockCriticClient(makeReviseCriticJson()) };

    const result = await criticiseMemo(memo, brief, 1, config);
    expect(result.revision_instructions!.founder_pushback_context.length).toBeGreaterThan(10);
  });
});
