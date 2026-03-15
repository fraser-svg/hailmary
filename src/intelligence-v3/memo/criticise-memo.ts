/**
 * Criticise Memo — V3-M5
 * Spec: docs/specs/intelligence-engine-v3/005_memo_spec.md (Sub-Stage C)
 *
 * Adversarial LLM evaluation of the generated memo.
 * Default posture: find problems. Only pass a dimension if confident.
 *
 * Model: claude-haiku-4-5-20251001
 * Max tokens: 800
 * Temperature: 0.1
 *
 * Evaluation: 4 scoring dimensions (0–5 each, pass ≥ 3) + 2 named tests
 *
 * Dimensions:
 *   evidence_grounding    — every factual claim traces to real evidence
 *   commercial_sharpness  — reads like intelligence about a specific company
 *   cta_clarity           — exactly one clear, actionable ask
 *   tone_compliance       — no banned phrases, jargon, or feature-selling
 *
 * Named Test 1 — Genericity Test:
 *   "Could this memo plausibly be sent to another SaaS company?"
 *   Binary pass/fail. Failure = hard failure at send gate.
 *
 * Named Test 2 — Founder Pushback Test:
 *   "What would the founder say is wrong here?"
 *   Identifies most vulnerable claim. Does not directly gate; feeds revision instructions.
 *
 * overall_pass = true only if all 4 dimensions ≥ 3 AND genericity_test = "pass"
 */

import Anthropic from "@anthropic-ai/sdk";
import type { MarkdownMemo } from "../types/memo.js";
import type { MemoBrief } from "../types/memo-brief.js";
import type {
  MemoCriticResult,
  DimensionScore,
  GenericityTest,
  FounderPushbackTest,
} from "../types/memo-critic.js";
import type { RevisionInstructions } from "../types/memo-brief.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_TOKENS = 800;
const DEFAULT_TEMPERATURE = 0.1;

export interface CriticConfig {
  model?: string;
  max_tokens?: number;
  temperature?: number;
  /** Injected Anthropic client — used in tests to avoid live API calls */
  client?: Anthropic;
}

// ---------------------------------------------------------------------------
// Prompts (exported for testing)
// ---------------------------------------------------------------------------

export function buildCriticSystemPrompt(): string {
  return `You are a rigorous commercial writing critic. Your job is to find weaknesses. Default to finding problems. Only pass a dimension if you are confident it meets the standard.

You will evaluate a founder-facing strategic memo on 4 scoring dimensions (0–5 each) plus 2 named tests.

SCORING DIMENSIONS:

1. evidence_grounding (0–5): Does every factual claim trace to a real observation?
   5 = every factual claim is directly traceable; no invented content
   4 = one minor claim that generalises slightly beyond the evidence
   3 = one moderate unsupported claim or generalisation
   2 = two unsupported claims, or one significant invention
   1 = multiple unsupported claims
   0 = evidence is largely invented or conflated with generic patterns
   Pass threshold: ≥ 3

2. commercial_sharpness (0–5): Does this read like intelligence about a specific company?
   5 = every paragraph contains company-specific observations
   4 = mostly specific with one generic paragraph
   3 = half specific, half generic
   2 = more generic than specific
   1 = could be sent to any SaaS company with minor edits
   0 = fully generic
   Pass threshold: ≥ 3

3. cta_clarity (0–5): Is there exactly one clear ask?
   5 = one unambiguous ask; reader knows exactly what action to take
   4 = one ask, slightly vague on the action
   3 = one ask, weakened by hedging language
   2 = two asks, or the ask is implicit
   1 = no clear ask, or memo ends without direction
   0 = multiple competing asks or no ask
   Pass threshold: ≥ 3

4. tone_compliance (0–5): Banned phrases, jargon, feature-selling?
   5 = no violations; direct, precise, commercial register throughout
   4 = minor register issue (one slightly corporate phrase)
   3 = one non-critical tone violation
   2 = one banned phrase or one jargon phrase
   1 = multiple tone violations
   0 = banned phrase in opening or closing; or memo is clearly a product pitch
   Pass threshold: ≥ 3

NAMED TEST 1 — Genericity Test:
"Could this memo plausibly be sent to another SaaS company?"
Remove the company name from every occurrence. Does the memo still make specific, accurate claims about a real business, or does it become generically true of any SaaS company?
If removing the company name leaves the argument substantially intact, this memo FAILS the genericity test.
Pass condition: the memo contains ≥ 3 claims that are uniquely specific to this company.
result: "pass" or "fail"

NAMED TEST 2 — Founder Pushback Test:
"What would the founder say is wrong here?"
Imagine you are the CEO of this company. You have just read this memo. What is the single most credible objection you would raise? Where is the memo's argument most vulnerable to being dismissed?
Identify the claim most likely to cause the founder to stop reading.
severity: "low" | "medium" | "high"

OUTPUT FORMAT: Return valid JSON only. No markdown code fences. No text outside the JSON.
{
  "evidence_grounding": { "score": <0-5>, "notes": "<brief explanation>" },
  "commercial_sharpness": { "score": <0-5>, "notes": "<brief explanation>" },
  "cta_clarity": { "score": <0-5>, "notes": "<brief explanation>" },
  "tone_compliance": { "score": <0-5>, "notes": "<brief explanation>" },
  "genericity_test": { "result": "<pass|fail>", "reasoning": "<1-2 sentences>" },
  "founder_pushback_test": {
    "most_vulnerable_claim": "<the specific sentence or claim>",
    "likely_objection": "<the founder's probable response>",
    "severity": "<low|medium|high>",
    "revision_suggestion": "<optional: how to strengthen this claim>"
  }
}`;
}

export function buildCriticUserPrompt(
  memo: MarkdownMemo,
  brief: MemoBrief
): string {
  const spineExcerpts = brief.evidence_spine
    .map((r, i) => `  [${i + 1}] "${r.excerpt}"`)
    .join("\n");

  return `Evaluate this strategic memo for ${brief.target_company}.

EVIDENCE SPINE (the only facts the writer was permitted to use):
${spineExcerpts}

MEMO TO EVALUATE:
${memo.markdown}

---
Evaluate on all 4 dimensions and both named tests. Be hostile. Find problems. Return JSON only.`;
}

// ---------------------------------------------------------------------------
// Response parsing (exported for testing)
// ---------------------------------------------------------------------------

interface RawCriticResponse {
  evidence_grounding: { score: number; notes: string };
  commercial_sharpness: { score: number; notes: string };
  cta_clarity: { score: number; notes: string };
  tone_compliance: { score: number; notes: string };
  genericity_test: { result: string; reasoning: string };
  founder_pushback_test: {
    most_vulnerable_claim: string;
    likely_objection: string;
    severity: string;
    revision_suggestion?: string;
  };
}

function clampScore(n: unknown): 0 | 1 | 2 | 3 | 4 | 5 {
  const v = typeof n === "number" ? Math.round(n) : 0;
  return Math.max(0, Math.min(5, v)) as 0 | 1 | 2 | 3 | 4 | 5;
}

export function parseCriticResponse(text: string): RawCriticResponse {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `ERR_CRITIC_PARSE: LLM response was not valid JSON.\n\nResponse:\n${text.slice(0, 400)}`
    );
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("ERR_CRITIC_PARSE: LLM response is not a JSON object");
  }

  const obj = parsed as Record<string, unknown>;

  const requiredDims = [
    "evidence_grounding",
    "commercial_sharpness",
    "cta_clarity",
    "tone_compliance",
  ] as const;

  for (const dim of requiredDims) {
    if (typeof obj[dim] !== "object" || obj[dim] === null) {
      throw new Error(`ERR_CRITIC_PARSE: missing dimension '${dim}'`);
    }
  }

  if (typeof obj["genericity_test"] !== "object" || obj["genericity_test"] === null) {
    throw new Error("ERR_CRITIC_PARSE: missing genericity_test");
  }
  if (typeof obj["founder_pushback_test"] !== "object" || obj["founder_pushback_test"] === null) {
    throw new Error("ERR_CRITIC_PARSE: missing founder_pushback_test");
  }

  return obj as unknown as RawCriticResponse;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

function toDimensionScore(raw: { score: number; notes: string }): DimensionScore {
  const score = clampScore(raw.score);
  return { score, pass: score >= 3, notes: String(raw.notes ?? "") };
}

function toGenericityTest(raw: { result: string; reasoning: string }): GenericityTest {
  const result = raw.result === "pass" ? "pass" : "fail";
  return { result, reasoning: String(raw.reasoning ?? "") };
}

function toFounderPushbackTest(raw: {
  most_vulnerable_claim: string;
  likely_objection: string;
  severity: string;
  revision_suggestion?: string;
}): FounderPushbackTest {
  const severity: "low" | "medium" | "high" =
    raw.severity === "low" ? "low" : raw.severity === "high" ? "high" : "medium";
  return {
    most_vulnerable_claim: String(raw.most_vulnerable_claim ?? ""),
    likely_objection: String(raw.likely_objection ?? ""),
    severity,
    ...(raw.revision_suggestion
      ? { revision_suggestion: String(raw.revision_suggestion) }
      : {}),
  };
}

function buildRevisionInstructions(
  dims: MemoCriticResult["dimensions"],
  genericityTest: GenericityTest,
  founderPushback: FounderPushbackTest
): RevisionInstructions {
  const failingDims: string[] = [];
  const specificIssues: string[] = [];

  if (!dims.evidence_grounding.pass) {
    failingDims.push("evidence_grounding");
    specificIssues.push(`Evidence grounding (score ${dims.evidence_grounding.score}/5): ${dims.evidence_grounding.notes}`);
  }
  if (!dims.commercial_sharpness.pass) {
    failingDims.push("commercial_sharpness");
    specificIssues.push(`Commercial sharpness (score ${dims.commercial_sharpness.score}/5): ${dims.commercial_sharpness.notes}`);
  }
  if (!dims.cta_clarity.pass) {
    failingDims.push("cta_clarity");
    specificIssues.push(`CTA clarity (score ${dims.cta_clarity.score}/5): ${dims.cta_clarity.notes}`);
  }
  if (!dims.tone_compliance.pass) {
    failingDims.push("tone_compliance");
    specificIssues.push(`Tone compliance (score ${dims.tone_compliance.score}/5): ${dims.tone_compliance.notes}`);
  }
  if (genericityTest.result === "fail") {
    failingDims.push("genericity_test");
    specificIssues.push(`Genericity test failed: ${genericityTest.reasoning}`);
  }

  const founderContext = `Most vulnerable claim: "${founderPushback.most_vulnerable_claim}". Likely objection: "${founderPushback.likely_objection}". Severity: ${founderPushback.severity}.${founderPushback.revision_suggestion ? ` Suggestion: ${founderPushback.revision_suggestion}` : ""}`;

  return {
    attempt_number: 1,
    failing_dimensions: failingDims,
    specific_issues: specificIssues,
    founder_pushback_context: founderContext,
  };
}

// ---------------------------------------------------------------------------
// LLM client
// ---------------------------------------------------------------------------

function getClient(injected?: Anthropic): Anthropic {
  if (injected) return injected;
  const key = process.env["ANTHROPIC_API_KEY"];
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY is not set — cannot criticise memo");
  }
  return new Anthropic({ apiKey: key });
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * Adversarially evaluate the memo against quality standards.
 *
 * @param memo         - MarkdownMemo produced by writeMemo()
 * @param brief        - MemoBrief used to write the memo (evidence spine provided to critic)
 * @param attemptNumber - 1 (first attempt) or 2 (revision)
 * @param config       - Optional model/client overrides; inject client in tests
 *
 * Throws:
 *   ERR_CRITIC_PARSE — LLM response is not parseable JSON or missing required fields
 */
export async function criticiseMemo(
  memo: MarkdownMemo,
  brief: MemoBrief,
  attemptNumber: 1 | 2 = 1,
  config: CriticConfig = {}
): Promise<MemoCriticResult> {
  const client = getClient(config.client);
  const model = config.model ?? DEFAULT_MODEL;
  const maxTokens = config.max_tokens ?? DEFAULT_MAX_TOKENS;
  const temperature = config.temperature ?? DEFAULT_TEMPERATURE;

  const systemPrompt = buildCriticSystemPrompt();
  const userPrompt = buildCriticUserPrompt(memo, brief);

  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const content = message.content[0];
  if (!content || content.type !== "text") {
    throw new Error("ERR_CRITIC_PARSE: LLM returned no text content");
  }

  const raw = parseCriticResponse(content.text);

  const dims: MemoCriticResult["dimensions"] = {
    evidence_grounding: toDimensionScore(raw.evidence_grounding),
    commercial_sharpness: toDimensionScore(raw.commercial_sharpness),
    cta_clarity: toDimensionScore(raw.cta_clarity),
    tone_compliance: toDimensionScore(raw.tone_compliance),
  };
  const genericityTest = toGenericityTest(raw.genericity_test);
  const founderPushback = toFounderPushbackTest(raw.founder_pushback_test);

  const overallPass =
    dims.evidence_grounding.pass &&
    dims.commercial_sharpness.pass &&
    dims.cta_clarity.pass &&
    dims.tone_compliance.pass &&
    genericityTest.result === "pass";

  const revisionInstructions = overallPass
    ? undefined
    : buildRevisionInstructions(dims, genericityTest, founderPushback);

  const timestamp = Date.now();
  return {
    critic_id: `critic_${memo.company_id}_${timestamp}`,
    memo_id: memo.memo_id,
    evaluated_at: new Date().toISOString(),
    attempt_number: attemptNumber,
    dimensions: dims,
    genericity_test: genericityTest,
    founder_pushback_test: founderPushback,
    overall_pass: overallPass,
    ...(revisionInstructions ? { revision_instructions: revisionInstructions } : {}),
  };
}
