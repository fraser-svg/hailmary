/**
 * V3 Pipeline Orchestrator
 * Spec: docs/specs/intelligence-engine-v3/002_pipeline_architecture.md
 *
 * Runs all V3 stages in order across three layers:
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
 *   buildEvidencePack (V3-M1, implemented)
 *   → adjudicateDiagnosis (V3-M2, implemented)
 *   → buildMemoBrief (V3-M3, implemented — skipped when adjudication = abort)
 *   → writeMemo (V3-M4, implemented — LLM; skipped when memoBrief absent)
 *   → criticiseMemo (V3-M5, implemented — adversarial LLM; skipped when memo absent)
 *   → runSendGate (V3-M6, implemented — deterministic; skipped when criticResult absent)
 *
 * Backward compatibility:
 *   Pass input.dossier to skip upstream acquisition (V3-U1 through V3-U4).
 *   V2-only mode (runV2Pipeline) remains unchanged in src/intelligence-v2/pipeline.ts.
 */

import type { Dossier } from "../../types/dossier.js";
import type { CrawlConfig, ResearchCorpus } from "../types/research-corpus.js";
import type { EvidencePack } from "../types/evidence-pack.js";
import type { AdjudicationResult } from "../types/adjudication.js";
import type { MemoBrief } from "../types/memo-brief.js";
import type { MarkdownMemo } from "../types/memo.js";
import type { MemoCriticResult } from "../types/memo-critic.js";
import type { SendGateResult } from "../types/send-gate.js";
import type { AcquisitionQualityReport } from "../types/acquisition-quality.js";
import type { ArgumentSynthesis } from "../types/argument-synthesis.js";

// V2 pipeline — import as-is, no modifications
import { runV2Pipeline } from "../../intelligence-v2/pipeline.js";
import type { V2PipelineResult } from "../../intelligence-v2/pipeline.js";
// Re-export so callers can import V2PipelineResult from the V3 entry point
export type { V2PipelineResult };

// V3 upstream acquisition layer
import { siteCorpusAcquisition } from "../acquisition/site-corpus.js";
import type { SiteCorpusAcquisitionInput } from "../acquisition/site-corpus.js";
import { externalResearchAcquisition } from "../acquisition/external-research.js";
import type { ExternalResearchAcquisitionInput } from "../acquisition/external-research.js";
import { mergeResearchCorpus } from "../acquisition/merge-corpus.js";
import { corpusToDossierAdapter } from "../acquisition/corpus-to-dossier.js";

// V3-M1
import { buildEvidencePack } from "../memo/build-evidence-pack.js";

// V3-M2
import { adjudicateDiagnosis } from "../memo/adjudicate-diagnosis.js";

// V4-M2a
import { synthesiseArgument } from "../memo/synthesise-argument.js";
import type { SynthesiseArgumentConfig } from "../memo/synthesise-argument.js";

// V3-M3
import { buildMemoBrief } from "../memo/build-memo-brief.js";

// V3-M4
import { writeMemo } from "../memo/write-memo.js";
import type { WriteMemoConfig } from "../memo/write-memo.js";

// V3-M5
import { criticiseMemo } from "../memo/criticise-memo.js";
import type { CriticConfig } from "../memo/criticise-memo.js";

// V3-M6
import { runSendGate } from "../memo/run-send-gate.js";

// Utilities
import { slugify, makeRunId } from "../../utils/ids.js";
import { now } from "../../utils/timestamps.js";
import { validateDossierObject } from "../../validate-core.js";

// ---------------------------------------------------------------------------
// Input contract
// ---------------------------------------------------------------------------

export interface V3PipelineInput {
  company: string;
  domain: string;
  founderContext?: {
    name?: string;
    title?: string;
    known_content?: string;
  };
  crawl_config?: CrawlConfig;

  /**
   * Optional writer config — inject a mock Anthropic client in tests,
   * or override model/token settings for the memo writer (V3-M4).
   * When omitted and ANTHROPIC_API_KEY is not set, writeMemo will throw.
   */
  writerConfig?: WriteMemoConfig;

  /**
   * Optional critic config — inject a mock Anthropic client in tests,
   * or override model/token settings for the memo critic (V3-M5).
   * When omitted and ANTHROPIC_API_KEY is not set, criticiseMemo will throw.
   */
  criticConfig?: CriticConfig;

  /**
   * Optional synthesis config — inject a mock Anthropic client in tests,
   * or override model/token settings for synthesiseArgument (V4-M2a).
   * Only used when memoIntelligenceVersion = "v4".
   */
  synthConfig?: SynthesiseArgumentConfig;

  /**
   * Skip upstream acquisition and use a pre-built Dossier.
   * Useful for running on an existing V2 dossier or in tests.
   */
  dossier?: Dossier;

  /**
   * Controls which memo intelligence version is used.
   *   "v4" (default): runs synthesiseArgument (V4-M2a) before brief assembly.
   *   "v3": skips synthesis; uses V3 template-based brief logic.
   *
   * Used for side-by-side V3 vs V4 evaluation and safe rollback.
   * Spec: docs/specs/v4-001-memo-intelligence.md §3
   */
  memoIntelligenceVersion?: "v3" | "v4";

  /**
   * Fixture pages for site corpus (Mode A — for tests / offline runs).
   * Passed through to siteCorpusAcquisition when provided.
   */
  fixture_site_pages?: SiteCorpusAcquisitionInput["fixture_pages"];

  /**
   * Fixture external sources (Mode A — for tests / offline runs).
   * Passed through to externalResearchAcquisition when provided.
   */
  fixture_external_sources?: ExternalResearchAcquisitionInput["fixture_sources"];
}

// ---------------------------------------------------------------------------
// Result contract
// ---------------------------------------------------------------------------

export interface V3PipelineResult {
  pipeline_version: "v3";
  company_id: string;
  run_id: string;
  generated_at: string;

  // Upstream layer (undefined if pre-built dossier was provided)
  corpus?: ResearchCorpus;
  dossier: Dossier;
  // Acquisition observability — populated when live providers are used
  acquisitionQuality?: AcquisitionQualityReport;

  // V2 reasoning layer
  v2Result: V2PipelineResult;

  // Memo layer — V3-M1 through V3-M6 implemented
  evidencePack: EvidencePack;
  adjudication: AdjudicationResult;        // V3-M2 — always present
  memoBrief?: MemoBrief;                   // V3-M3 — present unless adjudication_mode = "abort"
  memo?: MarkdownMemo;                     // V3-M4 — final memo (attempt 1 or 2)
  criticResult?: MemoCriticResult;         // V3-M5 — final critic result (attempt 1 or 2)
  sendGate?: SendGateResult;               // V3-M6 — present when criticResult exists

  // Revision metadata — only present when the revision loop ran (attempt 1 failed critic)
  firstAttemptMemo?: MarkdownMemo;         // Attempt 1 memo before revision
  firstCriticResult?: MemoCriticResult;    // Attempt 1 critic result that triggered revision

  // V4 memo intelligence
  /** Which memo intelligence version was used (matches input flag, or "v4" when not specified). */
  memo_intelligence_version: "v3" | "v4";
  /**
   * ArgumentSynthesis output from V4-M2a synthesiseArgument.
   * Only present when memoIntelligenceVersion = "v4" and synthesis ran successfully.
   * Undefined in Phase 1 (synthesiseArgument not yet implemented).
   */
  argumentSynthesis?: ArgumentSynthesis;
}

// ---------------------------------------------------------------------------
// Pipeline orchestrator
// ---------------------------------------------------------------------------

/**
 * Run the V3 pipeline from company/domain input (or pre-built dossier) through
 * evidence pack, adjudication, memo brief construction, memo writing,
 * adversarial critic evaluation, and final send gate.
 *
 * Acquisition modes:
 *   - input.dossier provided: skip upstream, use existing dossier
 *   - input.fixture_site_pages: fixture/manual mode (offline, tests)
 *   - provider mode: not yet wired (requires live SiteCorpusProvider)
 */
export async function runV3Pipeline(
  input: V3PipelineInput
): Promise<V3PipelineResult> {
  const run_id = makeRunId();
  const generated_at = now();

  // ──────────────────────────────────────────────────────────────────────────
  // UPSTREAM LAYER (V3-U1 – V3-U4)
  // ──────────────────────────────────────────────────────────────────────────

  let corpus: ResearchCorpus | undefined;
  let dossier: Dossier;

  if (input.dossier) {
    // Skip acquisition — use pre-built dossier
    dossier = input.dossier;
  } else {
    // V3-U1: Site corpus acquisition
    const siteCorpus = await siteCorpusAcquisition({
      domain: input.domain,
      crawl_config: input.crawl_config,
      fixture_pages: input.fixture_site_pages,
    });

    // V3-U2: External research acquisition
    const externalCorpus = await externalResearchAcquisition({
      company: input.company,
      domain: input.domain,
      fixture_sources: input.fixture_external_sources,
    });

    // V3-U3: Merge into unified ResearchCorpus
    corpus = mergeResearchCorpus(siteCorpus, externalCorpus);

    // V3-U4: Adapt corpus to standard Dossier
    dossier = corpusToDossierAdapter(corpus);

    // Early validation gate — catch adapter bugs before V2 reasoning
    const validation = validateDossierObject(dossier);
    if (!validation.valid) {
      throw new Error(`ERR_DOSSIER_INVALID: ${validation.errors.join('; ')}`);
    }
    if (validation.warnings.length > 0) {
      console.warn('[V3 pipeline] Dossier validation warnings:', validation.warnings);
    }
  }

  // Derive company_id: use company name from dossier, fall back to domain slugify
  const company_id =
    dossier.company_input?.resolved_company_name
      ? slugify(dossier.company_input.resolved_company_name)
      : slugify(input.domain);

  // ──────────────────────────────────────────────────────────────────────────
  // REASONING LAYER (V2-R1 – V2-R7)
  // ──────────────────────────────────────────────────────────────────────────

  // Run V2 pipeline unchanged. Richer dossier = richer signals = better diagnosis.
  const v2Result = await runV2Pipeline(company_id, dossier);

  // Resolve memo intelligence version — default is "v4"
  const memoIntelligenceVersion = input.memoIntelligenceVersion ?? "v4";

  // ──────────────────────────────────────────────────────────────────────────
  // MEMO LAYER (V3-M1 – V3-M6)
  // ──────────────────────────────────────────────────────────────────────────

  // V3-M1: Build evidence pack (deterministic)
  const evidencePack = buildEvidencePack({
    dossier,
    diagnosis: v2Result.diagnosis,
    mechanisms: v2Result.mechanisms,
    intervention: v2Result.intervention,
  });

  // V3-M2: Adjudicate diagnosis — determines epistemic framing mode for memo
  const adjudication = adjudicateDiagnosis({
    diagnosis: v2Result.diagnosis,
    evidencePack,
    patterns: v2Result.v2_patterns,
  });

  // V4-M2a: synthesiseArgument — runs when memoIntelligenceVersion = "v4"
  // Skipped when adjudication = "abort" (no memo will be written).
  // Never throws; returns fallback_to_template = true on any failure.
  let argumentSynthesis: ArgumentSynthesis | undefined;
  if (memoIntelligenceVersion === "v4" && adjudication.adjudication_mode !== "abort") {
    argumentSynthesis = await synthesiseArgument(
      {
        company_id,
        company: input.company,
        diagnosis: v2Result.diagnosis,
        mechanisms: v2Result.mechanisms,
        evidencePack,
      },
      input.synthConfig ?? {}
    );
  }

  // V3-M3: Build memo brief (skipped when adjudication = abort)
  // When abort: adjudication_report contains blocking_reasons and improvement_suggestions
  let memoBrief: MemoBrief | undefined;
  if (adjudication.adjudication_mode !== "abort") {
    memoBrief = buildMemoBrief({
      adjudication,
      diagnosis: v2Result.diagnosis,
      mechanisms: v2Result.mechanisms,
      intervention: v2Result.intervention,
      evidencePack,
      founderContext: input.founderContext,
      target_company_name: input.company,
      argumentSynthesis,
    });
  }

  // V3-M4 → V3-M5: write → critic → optional single revision → critic again
  // Maximum 2 write attempts total. Revision runs only when:
  //   (a) criticResult.overall_pass === false, AND
  //   (b) memoBrief is present (i.e. adjudication is not "abort")
  let memo: MarkdownMemo | undefined;
  let criticResult: MemoCriticResult | undefined;
  let firstAttemptMemo: MarkdownMemo | undefined;
  let firstCriticResult: MemoCriticResult | undefined;

  if (memoBrief) {
    // Attempt 1: write + critic
    memo = await writeMemo(memoBrief, 1, input.writerConfig ?? {});
    criticResult = await criticiseMemo(memo, memoBrief, 1, input.criticConfig ?? {});

    // Revision: if critic fails, attempt once more with revision instructions appended
    if (!criticResult.overall_pass) {
      firstAttemptMemo = memo;
      firstCriticResult = criticResult;

      const revisedBrief: MemoBrief = {
        ...memoBrief,
        ...(criticResult.revision_instructions
          ? { revision_instructions: criticResult.revision_instructions }
          : {}),
      };

      // Attempt 2 (final — no further loops)
      memo = await writeMemo(revisedBrief, 2, input.writerConfig ?? {});
      criticResult = await criticiseMemo(memo, revisedBrief, 2, input.criticConfig ?? {});
    }
  }

  // V3-M6: runSendGate (deterministic) — runs on the final memo only
  let sendGate: SendGateResult | undefined;
  if (memo && criticResult) {
    sendGate = runSendGate({
      memo,
      criticResult,
      adjudication,
      evidencePack,
    });
  }

  return {
    pipeline_version: "v3",
    company_id,
    run_id,
    generated_at,
    corpus,
    dossier,
    v2Result,
    evidencePack,
    adjudication,
    memoBrief,
    memo,
    criticResult,
    sendGate,
    firstAttemptMemo,
    firstCriticResult,
    memo_intelligence_version: memoIntelligenceVersion,
    argumentSynthesis,
  };
}
