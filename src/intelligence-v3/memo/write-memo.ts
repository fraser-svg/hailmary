/**
 * Write Memo — V3-M4
 * Spec: docs/specs/intelligence-engine-v3/005_memo_spec.md (Sub-Stage B)
 *
 * Generates the founder-facing strategic memo from the MemoBrief.
 * LLM stage — the writer is a renderer, not a reasoner.
 * All reasoning has been done upstream; the LLM renders it into prose.
 *
 * Model: claude-haiku-4-5-20251001
 * Max tokens: 1500
 * Temperature: 0.3
 *
 * Required sections (in order):
 *   1. observation         — specific hook + commercial signal
 *   2. what_this_means     — structural diagnosis + commercial consequence
 *   3. why_this_is_happening — 2 causal forces (not 1, not 3)
 *   4. what_we_would_change — intervention framed as value delivery
 *   5. cta                 — exactly one clear ask (≤50 words, not a question)
 *
 * Errors:
 *   ERR_MEMO_TOO_LONG — word_count > 850
 *   ERR_MEMO_TOO_SHORT — word_count < 300
 *   ERR_MEMO_EVIDENCE_EMPTY — evidence_ids is empty
 *   ERR_BANNED_PHRASE — banned phrase detected in output
 */

import type { MemoBrief } from "../types/memo-brief";
import type { MarkdownMemo } from "../types/memo";

/**
 * Generate the founder-facing strategic memo from the brief.
 *
 * TODO: Implement
 * - Build system prompt: constrain LLM to brief contract
 *   (no invention, no reasoning, exact section structure)
 * - Build user prompt: inject brief fields as structured input
 * - Call claude-haiku-4-5-20251001 with temperature: 0.3, max_tokens: 1500
 * - Parse LLM output into MemoSection[] (5 sections in order)
 * - Compute word_count for each section and overall
 * - Populate evidence_ids from brief.evidence_spine (all records)
 * - Validate: word_count bounds, banned phrase scan, evidence_ids non-empty
 * - Set attempt_number from brief context (1 or 2)
 * - Assemble markdown string from sections
 */
export async function writeMemo(
  brief: MemoBrief,
  attemptNumber: 1 | 2 = 1
): Promise<MarkdownMemo> {
  // TODO: implement
  throw new Error("Not implemented: writeMemo");
}
