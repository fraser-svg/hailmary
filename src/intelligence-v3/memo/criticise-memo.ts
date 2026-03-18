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
 * Evaluation: 6 scoring dimensions (0–5 each, pass ≥ 3) + 2 named tests
 *
 * Dimensions:
 *   evidence_grounding    — every factual claim traces to real evidence
 *   commercial_sharpness  — reads like intelligence about a specific company
 *   pattern_clarity       — narrative gap is explicit and unmistakable
 *   signal_density        — 5–7 concrete signals with specific fragments
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
 * overall_pass = true only if all 6 dimensions ≥ 3 AND genericity_test = "pass"
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
  return `You are a rigorous critic evaluating a Dean & Wiseman strategic diagnostic. Your job is to find weaknesses. Default to finding problems. Only pass a dimension if you are confident it meets the standard.

You will evaluate a founder-facing strategic diagnostic on 6 scoring dimensions (0–5 each) plus 2 named tests.

SCORING DIMENSIONS:

1. evidence_grounding (0–5): Does every factual claim trace to a real observation?
   5 = every factual claim is directly traceable; no invented content
   4 = one minor claim that generalises slightly beyond the evidence
   3 = one moderate unsupported claim or generalisation
   2 = two unsupported claims, or one significant invention
   1 = multiple unsupported claims
   0 = evidence is largely invented or conflated with generic patterns
   Pass threshold: ≥ 3

2. commercial_sharpness (0–5): Does this read like intelligence about a specific company, built from 5–7 concrete signals? Every paragraph must contain company-specific texture.
   5 = every paragraph contains company-specific observations; 5+ verbatim signal fragments woven into analytical narrative
   4 = mostly specific with one generic paragraph; 4 signal fragments
   3 = half specific, half generic; or signal fragments present but not woven into analysis
   2 = more generic than specific; signals listed but not analysed
   1 = could be sent to any SaaS company with minor edits
   0 = fully generic
   Pass threshold: ≥ 3

3. pattern_clarity (0–5): Does "The Pattern" section make the narrative gap explicit and unmistakable?
   5 = gap is stated in 2-3 clear sentences; reader instantly sees the mismatch between positioning and reality
   4 = gap is present but slightly vague on one side (the "experienced as" or "positioned as")
   3 = gap is implied but not explicitly stated as a contrast
   2 = pattern section exists but describes the situation rather than naming the gap
   1 = pattern section is generic or could apply to many companies
   0 = no discernible narrative gap named
   Pass threshold: ≥ 3

4. signal_density (0–5): Does the memo contain 5–7 concrete external signals as specific fragments woven into the narrative?
   5 = 7+ concrete signals with verbatim fragments (review excerpts, developer comments, pricing observations) woven as texture
   4 = 5–6 concrete signals with specific fragments
   3 = 3–4 signals with specific fragments, or 5+ signals that are vague
   2 = 1–2 signals only, or evidence is paraphrased without specificity
   1 = vague claims with no concrete signals
   0 = no external signals referenced
   Pass threshold: ≥ 3

5. cta_clarity (0–5): Does the next step feel like continuing the analysis?
   5 = one unambiguous diagnostic ask; feels like continuing the analysis, not a meeting request
   4 = one ask, slightly vague on the action
   3 = one ask, weakened by hedging or sales language
   2 = two asks, or the ask feels like a meeting request
   1 = no clear ask, or memo ends without direction
   0 = multiple competing asks or blatant sales pitch
   Pass threshold: ≥ 3

6. tone_compliance (0–5): Does it read like a letter written by a specific person with a view? Apply the 20 Golden Rules test.

   VOICE/CONVICTION: States interpretation directly; hedges data not conclusions. Writes to one specific reader; no industry-context setup. Structure is invisible; no generic template feel.

   RHYTHM: Sentence length varies naturally; no two consecutive sentences the same length. No tricolon triplets ("X, Y, and Z" three-part rhythmic structures). No topic-sentence + three-supporting-points paragraph structure.

   VOICE AUTHENTICITY: British English throughout. Uses contractions naturally; formal avoidance ("it is", "do not" in place of "it's", "don't") is an AI tell. No em dashes.

   HONESTY: Acknowledges what is working before diagnosing what is not. Moments of honesty make the diagnosis land harder, not softer.

   ANTI-PATTERNS to flag: em dashes, tricolon patterns, "Furthermore"/"Moreover"/"Additionally" openers, "This represents"/"This demonstrates"/"This underscores", dead words (delve, synergy, leverage, robust, nuanced, comprehensive, holistic, myriad, plethora, bolster, garner), performative "that said"/"on the other hand", metronomic sentence rhythm, formal avoidance of contractions, generic headers identical across memos, topic-sentence paragraphs.

   Swap test: remove the company name. If any paragraph remains substantially intact, score ≤ 2.

   5 = passes all sub-criteria; reads like a specific human analyst wrote this only
   4 = fails 1 sub-criterion (minor: e.g. one formal contraction or one generic phrase)
   3 = fails 2 sub-criteria (e.g. metronomic rhythm + one hedged interpretation)
   2 = fails 3+ sub-criteria, or contains banned phrase / em dash
   1 = reads like consulting output; detectable template; formal throughout
   0 = reads like outreach, a product pitch, or unmistakably AI-generated
   Pass threshold: ≥ 3

NAMED TEST 1 — Genericity Test:
"Could this memo plausibly be sent to another SaaS company?"
Remove the company name. Does every sentence still contain company-specific information?
If removing the company name leaves the argument substantially intact, FAIL.
Pass condition: ≥ 3 claims that are uniquely specific to this company.
result: "pass" or "fail"

NAMED TEST 2 — Founder Pushback Test:
"What would the founder say is wrong here?"
Imagine you are the CEO. What is the single most credible objection? Where is the argument most vulnerable?
severity: "low" | "medium" | "high"

OUTPUT FORMAT: Return valid JSON only. No markdown code fences. No text outside the JSON.
{
  "evidence_grounding": { "score": <0-5>, "notes": "<brief explanation>" },
  "commercial_sharpness": { "score": <0-5>, "notes": "<brief explanation>" },
  "pattern_clarity": { "score": <0-5>, "notes": "<brief explanation>" },
  "signal_density": { "score": <0-5>, "notes": "<brief explanation>" },
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
Evaluate on all 6 dimensions and both named tests. Be hostile. Find problems. Return JSON only.`;
}

// ---------------------------------------------------------------------------
// Response parsing (exported for testing)
// ---------------------------------------------------------------------------

interface RawCriticResponse {
  evidence_grounding: { score: number; notes: string };
  commercial_sharpness: { score: number; notes: string };
  pattern_clarity: { score: number; notes: string };
  signal_density: { score: number; notes: string };
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
    "pattern_clarity",
    "signal_density",
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
  if (!dims.pattern_clarity.pass) {
    failingDims.push("pattern_clarity");
    specificIssues.push(`Pattern clarity (score ${dims.pattern_clarity.score}/5): ${dims.pattern_clarity.notes}`);
  }
  if (!dims.signal_density.pass) {
    failingDims.push("signal_density");
    specificIssues.push(`Signal density (score ${dims.signal_density.score}/5): ${dims.signal_density.notes}`);
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
    pattern_clarity: toDimensionScore(raw.pattern_clarity),
    signal_density: toDimensionScore(raw.signal_density),
    cta_clarity: toDimensionScore(raw.cta_clarity),
    tone_compliance: toDimensionScore(raw.tone_compliance),
  };
  const genericityTest = toGenericityTest(raw.genericity_test);
  const founderPushback = toFounderPushbackTest(raw.founder_pushback_test);

  const overallPass =
    dims.evidence_grounding.pass &&
    dims.commercial_sharpness.pass &&
    dims.pattern_clarity.pass &&
    dims.signal_density.pass &&
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
