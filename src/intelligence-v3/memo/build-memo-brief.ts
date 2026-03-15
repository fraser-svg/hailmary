/**
 * Build Memo Brief — V3-M3
 * Spec: docs/specs/intelligence-engine-v3/005_memo_spec.md (Sub-Stage A)
 *
 * Produces a MemoBrief that fully constrains the LLM memo writer.
 * Deterministic — no LLM call.
 *
 * Key outputs:
 *   - hook: highest-scoring hook_candidate from EvidencePack
 *     (prefers founder_statement hook if founderContext.name provided + score ≥ 6)
 *   - thesis: single sentence derived from diagnosis.statement
 *   - evidence_spine: 3–5 EvidencePack records (≥1 diagnosis_support,
 *     ≥1 counter_narrative if available, ≥1 specificity_anchor, all score ≥ 5)
 *   - intervention_framing: determined by InterventionType (see spec 005 table)
 *   - cta: deterministic single ask — non-question, one action
 *   - word_budget: { target_min: 500, target_max: 700, hard_max: 850 }
 *
 * Errors:
 *   ERR_ADJUDICATION_ABORT — called when adjudication_mode = "abort"
 *   ERR_BUILD_MEMO_BRIEF   — no hook candidates in evidence pack
 */

import type { Diagnosis } from "../../intelligence-v2/types/diagnosis.js";
import type { Mechanism } from "../../intelligence-v2/types/mechanism.js";
import type { InterventionOpportunity, InterventionType } from "../../intelligence-v2/types/intervention.js";
import type { AdjudicationResult, MemoFraming } from "../types/adjudication.js";
import type { EvidencePack, EvidencePackRecord, MemoRole } from "../types/evidence-pack.js";
import type {
  MemoBrief,
  MemoHook,
  HookType,
  EvidenceSpineRecord,
  ToneConstraints,
  WordBudget,
  MemoSectionName,
} from "../types/memo-brief.js";
import { BANNED_PHRASES as V2_BANNED_PHRASES } from "../../intelligence-v2/stages/report/prompt.js";

// ---------------------------------------------------------------------------
// Input contract
// ---------------------------------------------------------------------------

export interface BuildMemoBriefInput {
  adjudication: AdjudicationResult;
  diagnosis: Diagnosis;
  mechanisms: Mechanism[];
  intervention: InterventionOpportunity;
  evidencePack: EvidencePack;
  founderContext?: {
    name?: string;
    title?: string;
    known_content?: string;
  };
  /** Human-readable company name. Falls back to company_id (slug) if not provided. */
  target_company_name?: string;
}

// ---------------------------------------------------------------------------
// Banned phrases — V2 list + V3 additions, deduplicated
// ---------------------------------------------------------------------------

const V3_ADDITIONS = [
  "I wanted to reach out",
  "just wanted to",
  "hope this finds you well",
  "excited to share",
  "game-changing",
  "thought leader",
  "world-class",
  "best-in-class",
  "cutting-edge",
  "paradigm shift",
  "move the needle",
  "low-hanging fruit",
  "circle back",
  "reach out",
  "at the end of the day",
];

/**
 * Banned phrases list (V2 list + V3 additions).
 * Exported for use in the send gate's independent scan.
 */
export const BANNED_PHRASES: string[] = Array.from(
  new Set([...V3_ADDITIONS, ...V2_BANNED_PHRASES])
);

// ---------------------------------------------------------------------------
// Intervention framing lookup (spec 005 table)
// ---------------------------------------------------------------------------

const INTERVENTION_FRAMING: Record<InterventionType, string> = {
  positioning_reset:
    "Frame as: we would help you clarify what you're actually selling, to whom, and why that earns the deal",
  icp_redefinition:
    "Frame as: we would help you identify the buyer profile where you actually win, and retool outreach around it",
  sales_motion_redesign:
    "Frame as: we would help you build a pipeline motion that works without founder involvement",
  founder_gtm_transition:
    "Frame as: we would help you build the institutional credibility to close without you in the room",
  distribution_strategy_reset:
    "Frame as: we would help you find a distribution path that doesn't depend on one channel or relationship",
  proof_architecture_design:
    "Frame as: we would help you build the proof assets that let buyers say yes without needing to talk to you",
};

// ---------------------------------------------------------------------------
// CTA by intervention type — non-question, one clear ask
// ---------------------------------------------------------------------------

const CTA_BY_INTERVENTION: Record<InterventionType, string> = {
  positioning_reset:
    "If the gap between what you are selling and what is buying resonates, reply to this letter — 20 minutes is enough to test whether the framing shift is worth pursuing.",
  icp_redefinition:
    "If identifying the buyer profile where you actually win is worth exploring, reply to this letter — 20 minutes to establish whether this is the right lever.",
  sales_motion_redesign:
    "If building a pipeline that works without you in every deal is the right next move, reply to this letter — 20 minutes to walk through what that motion looks like for your stage.",
  founder_gtm_transition:
    "If building the credibility to close without you in the room is the problem to solve next, reply to this letter — 20 minutes to establish whether we can help.",
  distribution_strategy_reset:
    "If finding a distribution path less concentrated in one channel is worth thinking through, reply to this letter — 20 minutes to explore what that path looks like.",
  proof_architecture_design:
    "If building proof assets that let buyers say yes is the lever that unlocks your next stage, reply to this letter — 20 minutes to test the hypothesis.",
};

// ---------------------------------------------------------------------------
// Hook type derivation from evidence type
// ---------------------------------------------------------------------------

const EVIDENCE_TYPE_TO_HOOK_TYPE: Partial<Record<string, HookType>> = {
  review_record: "customer_quote",
  testimonial_record: "customer_quote",
  customer_language_record: "customer_quote",
  pain_point_record: "customer_quote",
  outcome_record: "customer_quote",
  customer_value_record: "customer_quote",
  pricing_record: "pricing_signal",
  product_record: "product_gap",
  product_launch_record: "product_gap",
  competitor_record: "competitive_signal",
  comparison_record: "competitive_signal",
  founding_record: "founder_statement",
  leadership_record: "founder_statement",
  funding_record: "metric_observation",
  hiring_signal_record: "metric_observation",
  job_posting_record: "metric_observation",
  case_study_record: "metric_observation",
};

function deriveHookType(evidenceType: string): HookType {
  return EVIDENCE_TYPE_TO_HOOK_TYPE[evidenceType] ?? "metric_observation";
}

// ---------------------------------------------------------------------------
// Hook framing instructions by hook type
// ---------------------------------------------------------------------------

const HOOK_FRAMING: Record<HookType, string> = {
  customer_quote:
    "Open with this customer observation directly — no preamble. Let the customer language carry the first sentence. Do not introduce the company before the observation.",
  pricing_signal:
    "Lead with this pricing observation. Name what the pricing structure reveals about who they are actually selling to, not just what they charge.",
  product_gap:
    "Open by naming what the product delivers against what it claims. Make the gap visible in a single sentence — do not soften it.",
  competitive_signal:
    "Open with this competitive signal and what it reveals about how buyers actually decide in this market. Let the specific signal do the framing work.",
  founder_statement:
    "Open with the founder's own statement. In the next sentence, state what the evidence actually shows. Do not editorialize — let the contrast speak.",
  metric_observation:
    "Open with this specific signal — let the number or observable fact land before any interpretation. Do not explain what it means until the second sentence.",
};

// ---------------------------------------------------------------------------
// Role-to-section usage instruction
// ---------------------------------------------------------------------------

function roleToUsageInstruction(role: MemoRole, isInferred: boolean): string {
  const caveat = isInferred ? " — note: inferred, hedge appropriately" : "";
  switch (role) {
    case "hook_anchor":
      return `Use in 'observation' section as the opening hook${caveat}`;
    case "diagnosis_support":
      return `Use in 'what_this_means' section to ground the diagnosis claim in specific evidence${caveat}`;
    case "mechanism_illustration":
      return `Use in 'why_this_is_happening' section to illustrate a specific causal force${caveat}`;
    case "counter_narrative":
      return `Use in 'observation' or 'what_this_means' to contrast stated position with real-world signal — this is the tension that makes the memo credible${caveat}`;
    case "specificity_anchor":
      return `Use in any section at risk of sounding generic — this record makes the claim company-specific${caveat}`;
    case "intervention_evidence":
      return `Use in 'what_we_would_change' to ground the intervention in observed commercial reality${caveat}`;
  }
}

// ---------------------------------------------------------------------------
// Evidence spine selection
// ---------------------------------------------------------------------------

function buildSpineRecord(record: EvidencePackRecord, role: MemoRole): EvidenceSpineRecord {
  return {
    evidence_id: record.evidence_id,
    excerpt: record.excerpt,
    memo_role: role,
    usage_instruction: roleToUsageInstruction(role, record.is_inferred),
  };
}

/**
 * Select 3–5 evidence spine records from the pack.
 *
 * Priority order:
 *   1. ≥1 diagnosis_support record (required)
 *   2. ≥1 counter_narrative record (if available)
 *   3. ≥1 specificity_anchor record
 *   4. Fill remaining slots (up to 5) with highest-scoring remaining records
 *
 * All selected records must have total_score ≥ 5.
 */
function selectEvidenceSpine(evidencePack: EvidencePack): EvidenceSpineRecord[] {
  // Only records with total_score >= 5 are eligible
  const qualifying = evidencePack.records.filter(r => r.total_score >= 5);

  const result: EvidenceSpineRecord[] = [];
  const selected = new Set<string>();

  function addToSpine(record: EvidencePackRecord, role: MemoRole): void {
    result.push(buildSpineRecord(record, role));
    selected.add(record.evidence_id);
  }

  // Priority 1: Must include ≥1 diagnosis_support record
  const diagSupport = qualifying.find(
    r => r.memo_roles.includes("diagnosis_support") && !selected.has(r.evidence_id)
  );
  if (diagSupport) addToSpine(diagSupport, "diagnosis_support");

  // Priority 2: ≥1 counter_narrative record (if available in qualifying set)
  const counterNarrative = qualifying.find(
    r => r.memo_roles.includes("counter_narrative") && !selected.has(r.evidence_id)
  );
  if (counterNarrative) addToSpine(counterNarrative, "counter_narrative");

  // Priority 3: ≥1 specificity_anchor record
  const specificityAnchor = qualifying.find(
    r => r.memo_roles.includes("specificity_anchor") && !selected.has(r.evidence_id)
  );
  if (specificityAnchor) addToSpine(specificityAnchor, "specificity_anchor");

  // Fill remaining slots up to 5 with highest-scoring unselected qualifying records
  const remaining = qualifying
    .filter(r => !selected.has(r.evidence_id))
    .sort((a, b) => b.total_score - a.total_score);

  for (const r of remaining) {
    if (result.length >= 5) break;
    const primaryRole = (r.memo_roles[0] as MemoRole | undefined) ?? "diagnosis_support";
    addToSpine(r, primaryRole);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Thesis derivation
// ---------------------------------------------------------------------------

/**
 * Derives the single-sentence thesis from diagnosis.statement.
 * The thesis is the underlying commercial claim; memo_framing tells the
 * writer how assertively to state it.
 * For exploratory framing, prefix with a hypothesis marker to signal the
 * writer to avoid presenting the thesis as established fact.
 */
function buildThesis(diagnosis: Diagnosis, framing: MemoFraming): string {
  if (framing === "hypothesis") {
    return `The evidence points toward: ${diagnosis.statement.charAt(0).toLowerCase()}${diagnosis.statement.slice(1)}`;
  }
  // For assertive and indicative, use the statement directly — it is already a
  // direct commercial claim. The memo_framing field signals the writer on tone.
  return diagnosis.statement;
}

// ---------------------------------------------------------------------------
// Hook selection
// ---------------------------------------------------------------------------

/**
 * Select the best hook from evidencePack.hook_candidates.
 * Prefers founder_statement type if founderContext.name is provided and a
 * candidate with score ≥ 6 exists.
 * Default: highest total_score among all hook candidates.
 */
function selectHook(evidencePack: EvidencePack, founderName?: string): MemoHook {
  const candidates = evidencePack.hook_candidates;

  if (candidates.length === 0) {
    // Should not reach here — buildEvidencePack throws ERR_NO_HOOK_CANDIDATES
    throw new Error("ERR_BUILD_MEMO_BRIEF: no hook candidates in evidence pack");
  }

  // Prefer founder_statement if founderName is available and score ≥ 6
  if (founderName) {
    const founderHook = candidates.find(
      c => deriveHookType(c.evidence_type) === "founder_statement" && c.total_score >= 6
    );
    if (founderHook) {
      const hookType = deriveHookType(founderHook.evidence_type);
      return {
        evidence_id: founderHook.evidence_id,
        excerpt: founderHook.excerpt,
        hook_type: hookType,
        framing_instruction: HOOK_FRAMING[hookType],
      };
    }
  }

  // Default: highest-scoring candidate (stable sort: first on tie)
  const best = [...candidates].sort((a, b) => b.total_score - a.total_score)[0];
  const hookType = deriveHookType(best.evidence_type);
  return {
    evidence_id: best.evidence_id,
    excerpt: best.excerpt,
    hook_type: hookType,
    framing_instruction: HOOK_FRAMING[hookType],
  };
}

// ---------------------------------------------------------------------------
// Tone constraints — fixed per spec
// ---------------------------------------------------------------------------

const TONE_CONSTRAINTS: ToneConstraints = {
  register: "direct",
  perspective: "commercial_advisor",
  avoid: [
    "generic_advice",
    "jargon",
    "hedging_language",
    "feature_selling",
    "unsolicited_praise",
  ],
};

// ---------------------------------------------------------------------------
// Word budget — fixed per spec
// ---------------------------------------------------------------------------

const WORD_BUDGET: WordBudget = {
  target_min: 500,
  target_max: 700,
  hard_max: 850,
};

// ---------------------------------------------------------------------------
// Required sections — always all 5
// ---------------------------------------------------------------------------

const REQUIRED_SECTIONS: MemoSectionName[] = [
  "observation",
  "what_this_means",
  "why_this_is_happening",
  "what_we_would_change",
  "cta",
];

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * Build the MemoBrief from V2 outputs and adjudication result.
 *
 * Fully deterministic — no LLM calls.
 * Throws ERR_ADJUDICATION_ABORT if adjudication_mode is "abort".
 */
export function buildMemoBrief(input: BuildMemoBriefInput): MemoBrief {
  const { adjudication, diagnosis, mechanisms, intervention, evidencePack, founderContext, target_company_name } = input;

  // Guard: abort mode means no memo can be written
  if (adjudication.adjudication_mode === "abort") {
    throw new Error(
      `ERR_ADJUDICATION_ABORT: adjudication mode is 'abort' for company '${adjudication.company_id}'. ` +
      `buildMemoBrief cannot proceed. See adjudication_report for blocking_reasons and improvement_suggestions.`
    );
  }

  const companyId = evidencePack.company_id;
  const timestamp = Date.now();
  const now = new Date().toISOString();

  // Select hook — highest-scoring hook_candidate; founder_statement preferred if available
  const hook = selectHook(evidencePack, founderContext?.name);

  // Derive thesis — single sentence from diagnosis.statement, framing-adjusted
  const thesis = buildThesis(diagnosis, adjudication.recommended_memo_framing);

  // Select evidence spine (3–5 records with role coverage requirements)
  const evidenceSpine = selectEvidenceSpine(evidencePack);

  // Intervention framing — from spec 005 table
  const interventionFraming =
    INTERVENTION_FRAMING[intervention.type] ??
    `Frame as: we would help address the ${intervention.type} challenge identified in the diagnosis`;

  // CTA — deterministic, non-question single ask derived from intervention type
  const cta =
    CTA_BY_INTERVENTION[intervention.type] ??
    "If this resonates, reply to this letter — 20 minutes to explore whether we can help.";

  // Company name: use human-readable name if provided, fall back to slug
  const targetCompany = target_company_name ?? companyId;

  return {
    brief_id: `brief_${companyId}_${timestamp}`,
    company_id: companyId,
    created_at: now,

    target_company: targetCompany,
    founder_name: founderContext?.name,
    founder_title: founderContext?.title,

    adjudication_mode: adjudication.adjudication_mode,
    memo_framing: adjudication.recommended_memo_framing,

    diagnosis_id: diagnosis.id,
    intervention_id: intervention.id,

    hook,
    thesis,
    evidence_spine: evidenceSpine,
    intervention_framing: interventionFraming,

    tone_constraints: TONE_CONSTRAINTS,
    banned_phrases: BANNED_PHRASES,
    confidence_caveats: adjudication.confidence_caveats ?? [],

    cta,
    word_budget: WORD_BUDGET,
    required_sections: REQUIRED_SECTIONS,
  };
}
