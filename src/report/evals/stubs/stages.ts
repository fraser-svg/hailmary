/**
 * Stage adapters for the eval harness.
 *
 * Converts rich stage outputs (Signal[], etc.) into StageOutputItem[]
 * for the scorer. Stages without real implementations return empty arrays.
 */

import type { Dossier } from '../../../types/index.js';
import type { StageOutputItem } from '../scoring/common.js';
import { extractSignals as realExtractSignals } from '../../pipeline/extract-signals.js';
import { detectTensions as realDetectTensions } from '../../pipeline/detect-tensions.js';
import { detectPatterns as realDetectPatterns } from '../../pipeline/detect-patterns.js';
import { generateHypotheses as realGenerateHypotheses } from '../../pipeline/generate-hypotheses.js';
import { stressTestHypotheses as realStressTestHypotheses } from '../../pipeline/stress-test-hypotheses.js';
import { generateImplications as realGenerateImplications } from '../../pipeline/generate-implications.js';
import { planReport as realPlanReport } from '../../pipeline/plan-report.js';
import type { ReportPlan } from '../../pipeline/plan-report.js';

export function extractSignals(dossier: Dossier): StageOutputItem[] {
  return realExtractSignals(dossier).map(signal => ({
    title: signal.title,
    body: signal.statement,
  }));
}

export function detectTensions(
  dossier: Dossier,
  _signals: StageOutputItem[],
): StageOutputItem[] {
  const signals = realExtractSignals(dossier);
  return realDetectTensions(signals).map(tension => ({
    title: tension.title,
    body: tension.statement,
  }));
}

export function detectPatterns(
  dossier: Dossier,
  _tensions: StageOutputItem[],
): StageOutputItem[] {
  const signals = realExtractSignals(dossier);
  const tensions = realDetectTensions(signals);
  return realDetectPatterns(tensions, signals).map(pattern => ({
    title: pattern.title,
    body: pattern.summary,
  }));
}

// --- Real implementations wired in (generate + stress test) ---

export function generateHypotheses(
  dossier: Dossier,
  _patterns: StageOutputItem[],
): StageOutputItem[] {
  const signals = realExtractSignals(dossier);
  const tensions = realDetectTensions(signals);
  const patterns = realDetectPatterns(tensions, signals);
  const hypotheses = realGenerateHypotheses(patterns, tensions, signals);
  const stressTested = realStressTestHypotheses(hypotheses, patterns, tensions, signals);
  return stressTested.map(hyp => ({
    title: hyp.title,
    body: hyp.statement,
  }));
}

// --- Real implementation wired in (generate-implications) ---

export function generateImplications(
  dossier: Dossier,
  _hypotheses: StageOutputItem[],
): StageOutputItem[] {
  const signals = realExtractSignals(dossier);
  const tensions = realDetectTensions(signals);
  const patterns = realDetectPatterns(tensions, signals);
  const hypotheses = realGenerateHypotheses(patterns, tensions, signals);
  const stressTested = realStressTestHypotheses(hypotheses, patterns, tensions, signals);
  const implications = realGenerateImplications(stressTested, patterns, tensions, signals);
  return implications.map(imp => ({
    title: imp.title,
    body: imp.statement,
  }));
}

// --- Real implementation wired in (plan-report) ---

export function planReport(dossier: Dossier): ReportPlan {
  const signals = realExtractSignals(dossier);
  const tensions = realDetectTensions(signals);
  const patterns = realDetectPatterns(tensions, signals);
  const hypotheses = realGenerateHypotheses(patterns, tensions, signals);
  const stressTested = realStressTestHypotheses(hypotheses, patterns, tensions, signals);
  const implications = realGenerateImplications(stressTested, patterns, tensions, signals);
  return realPlanReport(implications, stressTested, patterns, tensions, signals);
}
