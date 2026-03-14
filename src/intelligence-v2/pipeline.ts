/**
 * Intelligence V2 Pipeline
 *
 * Orchestrates the full v2 reasoning pipeline:
 *   signals → gtm_analysis → tensions → patterns → diagnosis → mechanisms → intervention → report
 *
 * Reuses the report pipeline's signal extraction, tension detection, and pattern detection.
 * Then diverges into the intelligence-v2 diagnosis/mechanism/intervention/report stages.
 *
 * The adapter layer converts report pipeline types to intelligence-v2 types
 * at the boundary (patterns and tensions need archetype classification and field mapping).
 */

import type { Dossier } from '../types/index.js'
import type { Signal } from '../report/pipeline/extract-signals.js'
import type { Tension as ReportTension } from '../report/pipeline/detect-tensions.js'
import type { Pattern as ReportPattern } from '../report/pipeline/detect-patterns.js'
import type { GTMAnalysis } from './types/gtm-analysis.js'
import type { Pattern as V2Pattern } from './types/pattern.js'
import type { Tension as V2Tension } from './types/tension.js'
import type { Diagnosis } from './types/diagnosis.js'
import type { Mechanism } from './types/mechanism.js'
import type { InterventionOpportunity } from './types/intervention.js'
import type { WriteReportResult } from './stages/report/types.js'

// Shared stages (from report pipeline)
import { extractSignals } from '../report/pipeline/extract-signals.js'
import { detectTensions } from '../report/pipeline/detect-tensions.js'
import { detectPatterns } from '../report/pipeline/detect-patterns.js'

// V2-only stages
import { analyseGtm } from './stages/gtm-analysis/index.js'
import { selectDiagnosis } from './stages/diagnosis/index.js'
import { generateMechanisms } from './stages/mechanisms/index.js'
import { selectIntervention } from './stages/intervention/index.js'
import { renderReport } from './stages/report/index.js'

// Adapter
import { adaptTensions, adaptPatterns } from './adapter.js'

// ---------------------------------------------------------------------------
// Pipeline result
// ---------------------------------------------------------------------------

export interface V2PipelineResult {
  signals: Signal[]
  gtm_analysis: GTMAnalysis
  tensions: ReportTension[]
  patterns: ReportPattern[]
  v2_tensions: V2Tension[]
  v2_patterns: V2Pattern[]
  diagnosis: Diagnosis
  mechanisms: Mechanism[]
  intervention: InterventionOpportunity
  report: WriteReportResult
}

// ---------------------------------------------------------------------------
// Pipeline orchestrator
// ---------------------------------------------------------------------------

export async function runV2Pipeline(
  companyId: string,
  dossier: Dossier,
): Promise<V2PipelineResult> {
  // Stage 1: Extract signals (shared with report pipeline)
  const signals = extractSignals(dossier)

  // Stage 2: GTM analysis (v2-only — runs on signals)
  const gtm_analysis = analyseGtm(companyId, signals)

  // Stage 3: Detect tensions (shared with report pipeline)
  const tensions = detectTensions(signals)

  // Stage 4: Detect patterns (shared with report pipeline)
  const patterns = detectPatterns(tensions, signals)

  // Stage 5: Adapt to v2 types (archetype classification happens here)
  const v2_tensions = adaptTensions(tensions)
  const v2_patterns = adaptPatterns(patterns, tensions, gtm_analysis)

  // Stage 6: Select diagnosis (v2-only)
  const diagnosis = selectDiagnosis(companyId, v2_patterns, v2_tensions)

  // Stage 7: Generate mechanisms (v2-only)
  const supportingPatterns = v2_patterns.filter(p =>
    diagnosis.supporting_pattern_ids.includes(p.id),
  )
  const supportingTensionIds = new Set(supportingPatterns.flatMap(p => p.tension_ids))
  const supportingTensions = v2_tensions.filter(t => supportingTensionIds.has(t.id))
  const mechanisms = generateMechanisms(
    companyId,
    diagnosis,
    supportingPatterns,
    supportingTensions,
  )

  // Stage 8: Select intervention (v2-only)
  const intervention = selectIntervention(companyId, diagnosis, mechanisms)

  // Stage 9: Render report (v2-only — the only LLM call)
  const report = await renderReport(companyId, diagnosis, mechanisms, intervention)

  return {
    signals,
    gtm_analysis,
    tensions,
    patterns,
    v2_tensions,
    v2_patterns,
    diagnosis,
    mechanisms,
    intervention,
    report,
  }
}
