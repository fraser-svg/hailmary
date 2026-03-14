/**
 * Build Memo Brief — V3-M3
 * Spec: docs/specs/intelligence-engine-v3/005_memo_spec.md (Sub-Stage A)
 *
 * Produces a MemoBrief that fully constrains the LLM memo writer.
 * Deterministic — no LLM call.
 *
 * Key outputs:
 *   - hook: highest-scoring hook_candidate from EvidencePack
 *     (prefers founder_statement hook if founderContext provided + score ≥ 6)
 *   - thesis: single sentence derived from diagnosis.statement
 *   - evidence_spine: 3–5 EvidencePack records (≥1 diagnosis_support,
 *     ≥1 counter_narrative if available, ≥1 specificity_anchor, all score ≥ 5)
 *   - intervention_framing: determined by InterventionType (see spec table)
 *   - cta: deterministic single ask (e.g. "Worth 20 minutes?")
 *   - word_budget: { target_min: 500, target_max: 700, hard_max: 850 }
 */

import type { Diagnosis } from "../../intelligence-v2/types/diagnosis";
import type { Mechanism } from "../../intelligence-v2/types/mechanism";
import type { InterventionOpportunity } from "../../intelligence-v2/types/intervention";
import type { AdjudicationResult } from "../types/adjudication";
import type { EvidencePack } from "../types/evidence-pack";
import type { MemoBrief } from "../types/memo-brief";

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
}

/**
 * Build the MemoBrief from V2 outputs and adjudication result.
 *
 * TODO: Implement
 * - Select hook from evidencePack.hook_candidates (highest total_score;
 *   prefer founder_statement type if founderContext.name provided + score ≥ 6)
 * - Derive thesis from diagnosis.statement (single sentence, remove hedging if framing=assertive)
 * - Select evidence_spine (3–5 records, enforce role coverage requirements)
 * - Derive intervention_framing from intervention.type (see spec 005 table)
 * - Build CTA: deterministic, non-question single ask
 * - Pass confidence_caveats from adjudication directly into brief
 * - Include full banned_phrases list (V2 45 items + V3 15 additions)
 * - Set required_sections to all 5 MemoSectionName values
 */
export function buildMemoBrief(input: BuildMemoBriefInput): MemoBrief {
  // TODO: implement
  throw new Error("Not implemented: buildMemoBrief");
}

/**
 * Banned phrases list (V2 45 + V3 15 additions).
 * Exported for use in the send gate's independent scan.
 */
export const BANNED_PHRASES: string[] = [
  // V3 additions
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
  // TODO: merge V2 banned phrases list from src/intelligence-v2/stages/report/prompt.ts
];
