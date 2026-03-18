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
  /** LLM-generated company-specific header. Absent = no ## line in assembled markdown. */
  header?: string;
  markdown: string;
  word_count: number;
}

/**
 * MarkdownMemo — the generated founder-facing strategic memo.
 * Produced by writeMemo(). Evaluated by criticiseMemo().
 *
 * Sections must appear in order (Dean & Wiseman execution spec):
 * 1. title_block        — code-generated (company name, date, confidential)
 * 2. executive_thesis    — the core contradiction + commercial implication
 * 3. what_we_observed    — 5-7 concrete evidence signals
 * 4. the_pattern         — the underlying system connecting the signals
 * 5. what_this_means     — business impact (trust, conversion, revenue)
 * 6. what_this_changes   — strategic shift (direction, not tactics)
 * 7. cta                 — conditional framing, low-friction next step
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
  attempt_number: 1 | 2 | 3;       // 1-2 = structural attempts, 3 = Rory revision
  sections: MemoSection[];
  markdown: string;                 // Full assembled memo as a markdown string
  generated_at: string;
}
