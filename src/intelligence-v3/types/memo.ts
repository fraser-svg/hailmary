/**
 * Memo Types — V3 Memo Layer
 * Spec: docs/specs/intelligence-engine-v3/005_memo_spec.md (Sub-Stage B)
 *
 * MarkdownMemo is the output of writeMemo() — the founder-facing strategic memo.
 * It is the primary product artifact of the V3 pipeline.
 */

import type { AdjudicationMode } from "./adjudication";
import type { MemoSectionName } from "./memo-brief";

/** A single section of the memo */
export interface MemoSection {
  name: MemoSectionName;
  markdown: string;
  word_count: number;
}

/**
 * MarkdownMemo — the generated founder-facing strategic memo.
 * Produced by writeMemo(). Evaluated by criticiseMemo().
 *
 * Sections must appear in order (Dean & Wiseman doctrine):
 * 1. observation
 * 2. the_pattern
 * 3. what_this_means
 * 4. why_this_happens
 * 5. what_this_changes
 * 6. next_step
 */
export interface MarkdownMemo {
  memo_id: string;                  // "memo_<company_id>_<timestamp>"
  company_id: string;
  brief_id: string;
  adjudication_mode: AdjudicationMode;
  diagnosis_id: string;
  intervention_id: string;
  evidence_ids: string[];           // All evidence records referenced by the brief's evidence_spine
  word_count: number;
  attempt_number: 1 | 2;           // Which revision attempt produced this memo
  sections: MemoSection[];
  markdown: string;                 // Full assembled memo as a markdown string
  generated_at: string;
}
