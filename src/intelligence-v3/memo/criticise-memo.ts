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
 *
 * Revision loop: if overall_pass = false AND attempt_number < 2,
 *   append revision_instructions to brief and re-run writeMemo.
 *
 * Errors:
 *   ERR_MEMO_CRITIC_FAIL — 2 attempts exhausted; overall_pass still false
 */

import type { MarkdownMemo } from "../types/memo";
import type { MemoBrief } from "../types/memo-brief";
import type { MemoCriticResult } from "../types/memo-critic";

/**
 * Adversarially evaluate the memo against quality standards.
 *
 * TODO: Implement
 * - Build system prompt: "You are a rigorous commercial writing critic.
 *   Your job is to find weaknesses. Default to finding problems."
 * - Score all 4 dimensions with per-dimension scoring guide from spec
 * - Run genericity test: remove company name; does argument still hold?
 * - Run founder pushback test: identify most vulnerable claim + likely objection
 * - Compute overall_pass: all dimensions ≥ 3 AND genericity_test = "pass"
 * - If overall_pass = false: build revision_instructions
 *   (failing_dimensions, specific_issues, founder_pushback_context)
 * - Return MemoCriticResult
 */
export async function criticiseMemo(
  memo: MarkdownMemo,
  brief: MemoBrief,
  attemptNumber: 1 | 2 = 1
): Promise<MemoCriticResult> {
  // TODO: implement
  throw new Error("Not implemented: criticiseMemo");
}
