/**
 * ArgumentSynthesis — V4-M2a
 *
 * Output of synthesiseArgument(). Produced before buildMemoBrief() when
 * memoIntelligenceVersion = "v4". Provides company-specific argument material
 * that replaces template-based inputs in the memo brief.
 *
 * Spec: docs/specs/v4-001-memo-intelligence.md §4 — V4-M2a synthesiseArgument
 */

// ---------------------------------------------------------------------------
// Sub-types
// ---------------------------------------------------------------------------

/**
 * One company-specific causal narrative.
 * Exactly 2 are produced per synthesis. Must be materially distinct.
 */
export interface MechanismNarrative {
  /** From V2 Mechanism.id */
  mechanism_id: string;
  /** From V2 Mechanism.type */
  mechanism_type: string;
  /**
   * 1–2 sentences (≤ 60 words).
   * Must describe WHY THIS COMPANY has this problem.
   * Must cite ≥1 evidence_id in parentheses: e.g. "... (ev_003)".
   */
  company_specific_narrative: string;
  /** Subset of evidencePack.records IDs cited in the narrative */
  evidence_refs: string[];
}

/**
 * Structured hook strategy — replaces the static framing_instruction lookup.
 * Anchors the hook to a specific evidence record and explains the strategic intent.
 */
export interface HookStrategy {
  /** Specific evidence record that anchors the hook; must exist in evidencePack.records */
  evidence_id: string;
  /**
   * Classifies the tension the hook creates.
   *   contradiction   — company claims X, evidence shows not-X
   *   commercial_cost — specific observable signal naming a revenue/growth cost
   *   hidden_pattern  — pattern the founder likely hasn't seen framed this way
   *   customer_signal — what customers say vs what company says they say
   */
  tension_type: "contradiction" | "commercial_cost" | "hidden_pattern" | "customer_signal";
  /**
   * One-sentence instruction for HOW to open.
   * ≤ 30 words. Replaces static framing_instruction string.
   */
  framing: string;
  /**
   * One-sentence explanation of WHY this hook matters to THIS founder.
   * ≤ 50 words. Used by writer to understand strategic intent.
   */
  why_it_matters: string;
}

/**
 * One step in the ordered argument sequence.
 * The skeleton orders 3–6 evidence records into a logical chain.
 * Must include exactly one step with logical_role = "diagnosis".
 */
export interface ArgumentStep {
  /** 1-based position in the argument sequence */
  step_order: number;
  /** Must exist in evidencePack.records */
  evidence_id: string;
  /**
   * Logical function of this step.
   *   observation — what is visible/measurable
   *   mechanism   — a causal force explaining WHY
   *   consequence — downstream commercial effect
   *   contrast    — tension between stated and real
   *   diagnosis   — connects observation + mechanisms into the thesis (exactly one required)
   */
  logical_role: "observation" | "mechanism" | "consequence" | "contrast" | "diagnosis";
  /** Transition word(s): "which means" | "because" | "while" | etc. */
  connector?: string;
  /**
   * One sentence (≤ 30 words) explaining what this step does logically in the argument.
   * Helps the writer render without inferring hidden structure.
   */
  purpose: string;
}

// ---------------------------------------------------------------------------
// Main type
// ---------------------------------------------------------------------------

export interface ArgumentSynthesis {
  /** "syn_<company_id>_<timestamp>" */
  synthesis_id: string;
  company_id: string;
  synthesised_at: string;

  /**
   * Company-specific diagnostic statement.
   * Must contain: (1) company-specific GTM condition, (2) commercial consequence,
   * (3) at least one observable company fact anchoring the condition.
   * Must diagnose, not describe. Max 70 words, min 20 words.
   * Replaces template thesis in MemoBrief.
   */
  company_specific_thesis: string;

  /**
   * Exactly 2 company-specific causal narratives.
   * Must be materially distinct: different mechanism_type, low evidence overlap,
   * non-redundant causal chain, and not causally dependent on each other.
   */
  mechanism_narratives: MechanismNarrative[];

  /**
   * Ordered argument sequence: 3–6 evidence records forming a logical chain.
   * Must include exactly one step with logical_role = "diagnosis".
   */
  argument_skeleton: ArgumentStep[];

  /**
   * Structured hook strategy.
   * Replaces static framing_instruction lookup in buildMemoBrief.
   */
  hook_strategy: HookStrategy;

  /** All evidence_ids cited anywhere in this synthesis */
  evidence_refs: string[];

  /** LLM self-assessment of synthesis quality given available evidence */
  synthesis_confidence: "high" | "medium" | "low";

  /**
   * Rhetorical fit between selected diagnosis and available evidence.
   * Does NOT affect pipeline routing. For diagnostics and future eval only.
   */
  diagnosis_fit: "strong" | "adequate" | "strained";

  /**
   * Explains the specific gap in evidence-to-diagnosis fit.
   * Populated when diagnosis_fit is "adequate" or "strained".
   */
  diagnosis_tension_note?: string;

  /**
   * Result of post-parse distinctness validation (4 checks).
   *   Check 1 (hard): mechanism_type uniqueness
   *   Check 2 (hard): Jaccard evidence overlap ≤ 0.60
   *   Check 3 (soft): word overlap ≤ 0.60
   *   Check 4 (soft): causal independence — mechanism_2 not downstream of mechanism_1
   */
  distinctness_check: {
    passed: boolean;
    /**
     * Populated when any check fails or produces a soft flag.
     * e.g. ["evidence_overlap: 0.72", "mechanism_types identical",
     *        "causal_dependence: mechanism_2 may be downstream of mechanism_1"]
     */
    notes?: string[];
  };

  /**
   * True if LLM error, parse error, timeout, validation failure, or distinctness
   * retry exhausted. When true, buildMemoBrief falls back to full V3 logic.
   */
  fallback_to_template: boolean;
}
