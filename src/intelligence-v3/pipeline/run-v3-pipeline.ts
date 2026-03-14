/**
 * V3 Pipeline Orchestrator
 * Spec: docs/specs/intelligence-engine-v3/002_pipeline_architecture.md
 *
 * Runs all 17 V3 stages in order across three layers:
 *
 * UPSTREAM LAYER (V3-U1 – V3-U4):
 *   siteCorpusAcquisition → externalResearchAcquisition
 *   → mergeResearchCorpus → corpusToDossierAdapter
 *
 * REASONING LAYER (V2-R1 – V2-R7):
 *   extractSignals → analyseGtm → detectTensions → detectPatterns
 *   → selectDiagnosis → generateMechanisms → selectIntervention
 *
 * MEMO LAYER (V3-M1 – V3-M6):
 *   buildEvidencePack → adjudicateDiagnosis → buildMemoBrief
 *   → writeMemo → criticiseMemo (revision loop) → runSendGate
 *
 * Backward compatibility:
 *   Pass a pre-built dossier to skip upstream acquisition (V3-U1 through V3-U4).
 *   V2-only mode (runV2Pipeline) remains unchanged in src/intelligence-v2/pipeline.ts.
 */

import type { Dossier } from "../../types/dossier";
import type { CrawlConfig } from "../types/research-corpus";
import type { ResearchCorpus } from "../types/research-corpus";
import type { EvidencePack } from "../types/evidence-pack";
import type { AdjudicationResult } from "../types/adjudication";
import type { MemoBrief } from "../types/memo-brief";
import type { MarkdownMemo } from "../types/memo";
import type { MemoCriticResult } from "../types/memo-critic";
import type { SendGateResult } from "../types/send-gate";
import type { V2PipelineResult } from "../../intelligence-v2/pipeline";

export interface V3PipelineInput {
  company: string;
  domain: string;
  founderContext?: {
    name?: string;
    title?: string;
    known_content?: string;
  };
  crawl_config?: CrawlConfig;

  /** Skip upstream acquisition and use a pre-built Dossier (e.g. from a previous V2 run) */
  dossier?: Dossier;
}

export interface V3PipelineResult {
  pipeline_version: "v3";
  company_id: string;
  run_id: string;
  generated_at: string;

  // Upstream layer (undefined if pre-built dossier was provided)
  corpus?: ResearchCorpus;
  dossier: Dossier;

  // V2 reasoning layer
  v2Result: V2PipelineResult;

  // Memo layer
  evidencePack: EvidencePack;
  adjudication: AdjudicationResult;
  memoBrief: MemoBrief;
  memo: MarkdownMemo;
  criticResult: MemoCriticResult;
  sendGate: SendGateResult;
}

/**
 * Run the full V3 pipeline from company/domain input to send gate.
 *
 * TODO: Implement
 *
 * UPSTREAM LAYER:
 *   - If input.dossier provided: skip to V2 reasoning layer
 *   - Otherwise: run siteCorpusAcquisition, externalResearchAcquisition,
 *     mergeResearchCorpus, corpusToDossierAdapter
 *
 * REASONING LAYER:
 *   - Run runV2Pipeline(companyId, dossier) from src/intelligence-v2/pipeline.ts
 *   - Do NOT modify any V2 stage logic
 *
 * MEMO LAYER:
 *   - buildEvidencePack (uses dossier + v2Result outputs)
 *   - adjudicateDiagnosis
 *   - If adjudication.mode = "abort": throw ERR_ADJUDICATION_ABORT
 *   - buildMemoBrief
 *   - writeMemo (attempt 1)
 *   - criticiseMemo (attempt 1)
 *   - If !criticResult.overall_pass:
 *       append revision_instructions to brief
 *       writeMemo (attempt 2)
 *       criticiseMemo (attempt 2)
 *       if still failing: throw ERR_MEMO_CRITIC_FAIL
 *   - runSendGate
 *   - Return V3PipelineResult
 */
export async function runV3Pipeline(
  input: V3PipelineInput
): Promise<V3PipelineResult> {
  // TODO: implement
  throw new Error("Not implemented: runV3Pipeline");
}
