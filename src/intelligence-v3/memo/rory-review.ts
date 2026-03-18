/**
 * Rory Review — V3-M5b
 *
 * LLM evaluation of the memo through the lens of Rory Sutherland's
 * intellectual framework: behavioural economics, reframing, psychological
 * insight, asymmetric value.
 *
 * Model: claude-opus-4-6
 * Max tokens: 2000
 * Temperature: 0.3
 *
 * Evaluation: 4 scoring dimensions (0–5 each, pass >= 3) + 1 named test
 *
 * Dimensions:
 *   reframe_quality        — genuine reframe vs restating the obvious
 *   behavioural_insight    — psychological mechanism, not just market observation
 *   asymmetric_opportunity — disproportionate return from non-obvious lever
 *   memorability           — would someone retell this? the pub test
 *
 * Named Test — Pub Test:
 *   "Would Rory bring this up at the pub?"
 *   Binary pass/fail.
 *
 * verdict = "approve" only if all 4 dimensions >= 3 AND pub_test = "pass"
 */

import Anthropic from "@anthropic-ai/sdk";
import type { MarkdownMemo } from "../types/memo.js";
import type { MemoBrief } from "../types/memo-brief.js";
import type {
  RoryReviewResult,
  RoryDimensionScore,
  PubTest,
  RoryRevisionNotes,
} from "../types/rory-review.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = "claude-opus-4-6";
const DEFAULT_MAX_TOKENS = 2000;
const DEFAULT_TEMPERATURE = 0.3;

export interface RoryReviewConfig {
  model?: string;
  max_tokens?: number;
  temperature?: number;
  /** Injected Anthropic client — used in tests to avoid live API calls */
  client?: Anthropic;
}

// ---------------------------------------------------------------------------
// Prompts (exported for testing)
// ---------------------------------------------------------------------------

export function buildRorySystemPrompt(): string {
  return `You are Rory Sutherland reviewing a Dean & Wiseman strategic diagnostic before it goes to a company founder.

You are looking for one thing above all: is this INTERESTING? Not correct — the structural review already checked that. Interesting. Does it reframe? Does it name a behavioural mechanism? Does it point to an asymmetric opportunity? Would you bring this up at the pub?

Your intellectual framework:
- Behavioural economics: people do not act rationally. The interesting question is always WHY they behave the way they do, not WHAT the data shows.
- Reframing: the most valuable insight is showing someone their own situation from an angle they cannot see from inside. "I hadn't thought about it that way" is the highest compliment.
- Asymmetric opportunity: small changes in perception, framing, or positioning that create disproportionate commercial outcomes. The best interventions are cheap but high-leverage.
- The pub test: if you wouldn't voluntarily tell someone about this observation over a drink, it's not interesting enough to send.

You will evaluate this memo on 4 scoring dimensions (0–5 each) plus 1 named test.

SCORING DIMENSIONS:

1. reframe_quality (0–5): Does this show the founder something they couldn't see from inside their own company?
   5 = genuinely new angle; the founder will think "I hadn't thought about it that way"
   4 = fresh perspective with one slightly obvious element
   3 = partially new framing, partially restating what they already know
   2 = mostly telling them what they already know, with minor new framing
   1 = almost entirely restating their own positioning back to them
   0 = no reframe; "yes, we know this"
   Pass threshold: >= 3

2. behavioural_insight (0–5): Does this identify a psychological or behavioural mechanism?
   5 = names a specific cognitive bias, incentive misalignment, or decision-making pattern that explains the observations; the "why" behind the "what"
   4 = identifies a behavioural dynamic but doesn't fully articulate the mechanism
   3 = hints at a behavioural layer but relies mainly on market/product analysis
   2 = purely functional analysis; describes what is happening but not why people behave this way
   1 = generic observations about "the market" or "customers" without behavioural specificity
   0 = no behavioural layer whatsoever
   Pass threshold: >= 3

3. asymmetric_opportunity (0–5): Does "What This Changes" point to a disproportionate return from a non-obvious lever?
   5 = the implied intervention is cheap but high-leverage; a perception or framing change, not a product rebuild
   4 = points to a non-obvious lever but the return isn't clearly disproportionate
   3 = identifies a real lever but it's somewhat obvious or proportional in effort/return
   2 = suggests changes that are proportional in effort and return; no asymmetry
   1 = vague about what should change; no clear lever identified
   0 = no lever; the "what this changes" section is generic strategy-speak
   Pass threshold: >= 3

4. memorability (0–5): Would someone retell this observation?
   5 = genuinely surprising; you'd quote the central insight to a colleague; it sticks
   4 = interesting enough to mention but not quotable
   3 = competent analysis that you'd nod at but not repeat
   2 = forgettable; reads like a strategy document, not a discovery
   1 = dull; you'd skim it
   0 = actively boring; generic corporate analysis
   Pass threshold: >= 3

NAMED TEST — The Pub Test:
"Would you bring this company's situation up at the pub?"
Not "is it correct?" — is the OBSERVATION genuinely interesting as a story? Does it have a surprising twist, an unexpected connection, or a "huh, I never thought about it that way" moment?
result: "pass" or "fail"

OUTPUT FORMAT: Return valid JSON only. No markdown code fences. No text outside the JSON.
{
  "reframe_quality": { "score": <0-5>, "notes": "<brief explanation>" },
  "behavioural_insight": { "score": <0-5>, "notes": "<brief explanation>" },
  "asymmetric_opportunity": { "score": <0-5>, "notes": "<brief explanation>" },
  "memorability": { "score": <0-5>, "notes": "<brief explanation>" },
  "pub_test": { "result": "<pass|fail>", "reasoning": "<1-2 sentences>" },
  "revision_notes": {
    "what_is_boring": "<what makes the current memo uninteresting>",
    "what_would_be_interesting": "<what angle/reframe would make it compelling>",
    "missing_behavioural_layer": "<what psychological insight is absent>",
    "specific_suggestions": ["<suggestion 1>", "<suggestion 2>", "<suggestion 3>"]
  }
}

IMPORTANT: Always populate revision_notes, even when you approve. Your notes help calibrate future memos.`;
}

export function buildRoryUserPrompt(
  memo: MarkdownMemo,
  brief: MemoBrief
): string {
  const spineExcerpts = brief.evidence_spine
    .map((r, i) => `  [${i + 1}] "${r.excerpt}"`)
    .join("\n");

  return `Review this strategic memo for ${brief.target_company}.

EVIDENCE SPINE (the facts the writer had to work with):
${spineExcerpts}

MEMO TO EVALUATE:
${memo.markdown}

---
Evaluate on all 4 dimensions and the pub test. Be honest — a boring memo that passes structural review is worse than no memo. Return JSON only.`;
}

// ---------------------------------------------------------------------------
// Response parsing (exported for testing)
// ---------------------------------------------------------------------------

interface RawRoryResponse {
  reframe_quality: { score: number; notes: string };
  behavioural_insight: { score: number; notes: string };
  asymmetric_opportunity: { score: number; notes: string };
  memorability: { score: number; notes: string };
  pub_test: { result: string; reasoning: string };
  revision_notes: {
    what_is_boring: string;
    what_would_be_interesting: string;
    missing_behavioural_layer: string;
    specific_suggestions: string[];
  };
}

function clampScore(n: unknown): 0 | 1 | 2 | 3 | 4 | 5 {
  const v = typeof n === "number" ? Math.round(n) : 0;
  return Math.max(0, Math.min(5, v)) as 0 | 1 | 2 | 3 | 4 | 5;
}

export function parseRoryResponse(text: string): RawRoryResponse {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `ERR_RORY_PARSE: LLM response was not valid JSON.\n\nResponse:\n${text.slice(0, 400)}`
    );
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("ERR_RORY_PARSE: LLM response is not a JSON object");
  }

  const obj = parsed as Record<string, unknown>;

  const requiredDims = [
    "reframe_quality",
    "behavioural_insight",
    "asymmetric_opportunity",
    "memorability",
  ] as const;

  for (const dim of requiredDims) {
    if (typeof obj[dim] !== "object" || obj[dim] === null) {
      throw new Error(`ERR_RORY_PARSE: missing dimension '${dim}'`);
    }
  }

  if (typeof obj["pub_test"] !== "object" || obj["pub_test"] === null) {
    throw new Error("ERR_RORY_PARSE: missing pub_test");
  }
  if (typeof obj["revision_notes"] !== "object" || obj["revision_notes"] === null) {
    throw new Error("ERR_RORY_PARSE: missing revision_notes");
  }

  // Clamp specific_suggestions to max 3 items
  const revNotes = obj["revision_notes"] as Record<string, unknown>;
  if (Array.isArray(revNotes["specific_suggestions"])) {
    revNotes["specific_suggestions"] = (revNotes["specific_suggestions"] as unknown[]).slice(0, 3);
  }

  return obj as unknown as RawRoryResponse;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

function toDimensionScore(raw: { score: number; notes: string }): RoryDimensionScore {
  const score = clampScore(raw.score);
  return { score, pass: score >= 3, notes: String(raw.notes ?? "") };
}

function toPubTest(raw: { result: string; reasoning: string }): PubTest {
  const result = raw.result === "pass" ? "pass" : "fail";
  return { result, reasoning: String(raw.reasoning ?? "") };
}

function toRevisionNotes(raw: RawRoryResponse["revision_notes"]): RoryRevisionNotes {
  return {
    what_is_boring: String(raw.what_is_boring ?? ""),
    what_would_be_interesting: String(raw.what_would_be_interesting ?? ""),
    missing_behavioural_layer: String(raw.missing_behavioural_layer ?? ""),
    specific_suggestions: Array.isArray(raw.specific_suggestions)
      ? raw.specific_suggestions.map(s => String(s)).slice(0, 3)
      : [],
  };
}

// ---------------------------------------------------------------------------
// LLM client
// ---------------------------------------------------------------------------

function getClient(injected?: Anthropic): Anthropic {
  if (injected) return injected;
  const key = process.env["ANTHROPIC_API_KEY"];
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY is not set — cannot run Rory review");
  }
  return new Anthropic({ apiKey: key });
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * Evaluate the memo through Rory Sutherland's strategic lens.
 *
 * @param memo         - MarkdownMemo produced by writeMemo()
 * @param brief        - MemoBrief used to write the memo (evidence spine provided to Rory)
 * @param attemptNumber - 1 (first review) or 2 (post-revision review)
 * @param config       - Optional model/client overrides; inject client in tests
 *
 * Throws:
 *   ERR_RORY_PARSE — LLM response is not parseable JSON or missing required fields
 */
export async function roryReview(
  memo: MarkdownMemo,
  brief: MemoBrief,
  attemptNumber: 1 | 2 = 1,
  config: RoryReviewConfig = {}
): Promise<RoryReviewResult> {
  const client = getClient(config.client);
  const model = config.model ?? DEFAULT_MODEL;
  const maxTokens = config.max_tokens ?? DEFAULT_MAX_TOKENS;
  const temperature = config.temperature ?? DEFAULT_TEMPERATURE;

  const systemPrompt = buildRorySystemPrompt();
  const userPrompt = buildRoryUserPrompt(memo, brief);

  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const content = message.content[0];
  if (!content || content.type !== "text") {
    throw new Error("ERR_RORY_PARSE: LLM returned no text content");
  }

  const raw = parseRoryResponse(content.text);

  const dims: RoryReviewResult["dimensions"] = {
    reframe_quality: toDimensionScore(raw.reframe_quality),
    behavioural_insight: toDimensionScore(raw.behavioural_insight),
    asymmetric_opportunity: toDimensionScore(raw.asymmetric_opportunity),
    memorability: toDimensionScore(raw.memorability),
  };
  const pubTest = toPubTest(raw.pub_test);
  const revisionNotes = toRevisionNotes(raw.revision_notes);

  const overallApprove =
    dims.reframe_quality.pass &&
    dims.behavioural_insight.pass &&
    dims.asymmetric_opportunity.pass &&
    dims.memorability.pass &&
    pubTest.result === "pass";

  const timestamp = Date.now();
  return {
    review_id: `rory_${memo.company_id}_${timestamp}`,
    company_id: memo.company_id,
    memo_id: memo.memo_id,
    reviewed_at: new Date().toISOString(),
    attempt_number: attemptNumber,
    dimensions: dims,
    pub_test: pubTest,
    verdict: overallApprove ? "approve" : "revise",
    // Always include revision_notes for calibration, but only semantically meaningful on "revise"
    ...(overallApprove ? {} : { revision_notes: revisionNotes }),
  };
}
