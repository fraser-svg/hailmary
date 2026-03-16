/**
 * Memo Brief Types — V3 Memo Layer
 * Spec: docs/specs/intelligence-engine-v3/005_memo_spec.md (Sub-Stage A)
 *
 * The MemoBrief fully constrains the LLM memo writer.
 * The writer may not invent facts, choose a different framing,
 * or select evidence outside the brief. It is a contract between
 * the deterministic pipeline and the LLM.
 */

import type { AdjudicationMode, MemoFraming } from "./adjudication";
import type { EvidencePackRecord, MemoRole } from "./evidence-pack";
import type { MechanismNarrative, ArgumentStep, HookStrategy } from "./argument-synthesis";

/** Names of the 5 required memo sections */
export type MemoSectionName =
  | "observation"
  | "what_this_means"
  | "why_this_is_happening"
  | "what_we_would_change"
  | "cta";

/** The type of hook being used in the opening Observation section */
export type HookType =
  | "customer_quote"
  | "pricing_signal"
  | "product_gap"
  | "competitive_signal"
  | "founder_statement"
  | "metric_observation";

/** The opening hook — the specific observation that earns the founder's attention */
export interface MemoHook {
  evidence_id: string;          // From evidencePack.hook_candidates
  excerpt: string;              // Verbatim excerpt from the evidence record
  hook_type: HookType;
  framing_instruction: string;  // How the writer should use this in the opening
}

/** A single evidence record in the brief's evidence spine */
export interface EvidenceSpineRecord {
  evidence_id: string;
  excerpt: string;              // Verbatim
  memo_role: MemoRole;          // Primary role in the spine
  usage_instruction: string;    // Which section to use this in, and how
}

/** Tone constraints for the memo writer */
export interface ToneConstraints {
  register: "direct";
  perspective: "commercial_advisor";
  avoid: Array<
    | "generic_advice"
    | "jargon"
    | "hedging_language"
    | "feature_selling"
    | "unsolicited_praise"
  >;
}

/** Word budget for the memo */
export interface WordBudget {
  target_min: 500;
  target_max: 700;
  hard_max: 850;
}

/**
 * MemoBrief — the full constraint object passed to writeMemo().
 * Produced by buildMemoBrief(). All fields are binding on the LLM writer.
 */
export interface MemoBrief {
  brief_id: string;              // "brief_<company_id>_<timestamp>"
  company_id: string;
  created_at: string;

  // Reader context
  target_company: string;
  founder_name?: string;
  founder_title?: string;

  // Epistemic framing — from adjudication
  adjudication_mode: AdjudicationMode;
  memo_framing: MemoFraming;

  // Upstream IDs — carried so writeMemo can populate MarkdownMemo without extra params
  diagnosis_id: string;             // From diagnosis.id
  intervention_id: string;         // From intervention.id

  // Argument structure
  hook: MemoHook;
  thesis: string;                           // Single sentence derived from diagnosis.statement
  evidence_spine: EvidenceSpineRecord[];    // 3–5 records from EvidencePack
  intervention_framing: string;             // How to position the intervention

  // Constraints
  tone_constraints: ToneConstraints;
  banned_phrases: string[];
  confidence_caveats: string[];             // From adjudication; must not assert as fact

  // Output spec
  cta: string;                              // One clear ask; drafted deterministically
  word_budget: WordBudget;
  required_sections: MemoSectionName[];     // Always all 5

  // Populated on revision loop only
  revision_instructions?: RevisionInstructions;

  // V4 additions — all optional; absent in v3 mode or when synthesis falls back to template
  /**
   * Company-specific diagnostic thesis from ArgumentSynthesis.
   * Contains GTM condition + commercial consequence + observable company fact.
   * Replaces the template thesis string for the writer when present.
   * MemoBrief.thesis (template string) retained alongside for diagnostics.
   */
  synthesised_thesis?: string;
  /**
   * 2 company-specific mechanism narratives from synthesis.
   * Replaces template mechanism framing in writeMemo user prompt when present.
   */
  mechanism_narratives?: MechanismNarrative[];
  /**
   * Ordered argument sequence (3–6 steps) from synthesis.
   * Presented as advisory argument flow in writeMemo user prompt.
   */
  argument_skeleton?: ArgumentStep[];
  /**
   * Full hook strategy from synthesis.
   * When present, hook.framing_instruction is overridden with hookStrategy.framing.
   * All fields (including evidence_id, tension_type, why_it_matters) are exposed to the writer.
   */
  hook_strategy?: HookStrategy;
}

/** Revision instructions appended to the brief on a failed critic pass */
export interface RevisionInstructions {
  attempt_number: number;
  failing_dimensions: string[];
  specific_issues: string[];
  founder_pushback_context: string;
}
