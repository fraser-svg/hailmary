/**
 * Stage 5: Stress Test Hypotheses
 *
 * Evaluates candidate hypotheses through 5 deterministic checks to determine
 * whether each should survive, weaken, or be discarded.
 *
 * The goal is to challenge hypotheses, not confirm them.
 * Only hypotheses that survive should influence the report.
 *
 * Checks:
 *   1. Support strength — pattern quality, tension breadth, signal diversity
 *   2. Alternative explanation pressure — plausibility of alternatives
 *   3. Assumption fragility — grounding in observed signals
 *   4. Structural coverage — fraction of patterns explained
 *   5. Counter-signal — signals that contradict the hypothesis
 *
 * V1: Deterministic checks over hypothesis structure and upstream objects.
 * No LLM calls. No dossier inspection.
 */

import type { Signal } from './extract-signals.js';
import type { Tension } from './detect-tensions.js';
import type { Pattern } from './detect-patterns.js';
import type { Hypothesis, HypothesisStatus } from './generate-hypotheses.js';
import type { Confidence } from '../../types/evidence.js';

// ---------------------------------------------------------------------------
// Confidence utilities
// ---------------------------------------------------------------------------

const CONFIDENCE_RANK: Record<Confidence, number> = { low: 1, medium: 2, high: 3 };

function downgradeConfidence(c: Confidence): Confidence {
  if (c === 'high') return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Check 1: Support strength
// ---------------------------------------------------------------------------

interface SupportResult {
  score: number;
  patternQuality: number;
  tensionCount: number;
  signalKindDiversity: number;
  hasHighImportancePattern: boolean;
  descriptions: string[];
}

function checkSupportStrength(
  hyp: Hypothesis,
  patterns: Pattern[],
  tensions: Tension[],
  signals: Signal[],
): SupportResult {
  const refPatterns = patterns.filter(p => hyp.pattern_ids.includes(p.pattern_id));
  const refTensions = tensions.filter(t => hyp.tension_ids.includes(t.tension_id));
  const refSignals = signals.filter(s => hyp.signal_ids.includes(s.signal_id));
  const signalKinds = new Set(refSignals.map(s => s.kind));

  // Pattern quality: importance * strategic_weight (high=3, medium=2, low=1)
  const patternQuality = refPatterns.reduce(
    (sum, p) => sum + CONFIDENCE_RANK[p.importance] * CONFIDENCE_RANK[p.strategic_weight],
    0,
  );

  const hasHigh = refPatterns.some(p => p.importance === 'high');
  const score = patternQuality + refTensions.length * 1.5 + signalKinds.size * 1.5;

  const descriptions: string[] = [];
  if (refPatterns.length > 0) {
    descriptions.push(
      `Supported by ${refPatterns.length} structural pattern(s): ${refPatterns.map(p => p.title).join('; ')}`,
    );
  }
  if (refTensions.length >= 3) {
    descriptions.push(
      `Corroborated by ${refTensions.length} independent tensions across multiple observation categories`,
    );
  }
  if (signalKinds.size >= 3) {
    descriptions.push(
      `Evidence spans ${signalKinds.size} signal categories (${[...signalKinds].join(', ')})`,
    );
  }

  return {
    score,
    patternQuality,
    tensionCount: refTensions.length,
    signalKindDiversity: signalKinds.size,
    hasHighImportancePattern: hasHigh,
    descriptions,
  };
}

// ---------------------------------------------------------------------------
// Check 2: Alternative explanation pressure
// ---------------------------------------------------------------------------

function checkAlternativePressure(
  hyp: Hypothesis,
): { penalty: number; objections: string[] } {
  const altCount = hyp.alternative_explanations.length;
  const objections: string[] = [];
  let penalty = 0;

  if (altCount >= 2) {
    penalty += 1;
    objections.push(
      `${altCount} alternative explanation(s) remain plausible`,
    );
  }

  // Low initial confidence amplifies alternative pressure
  if (hyp.confidence === 'low' && altCount >= 2) {
    penalty += 1;
    objections.push(
      'Low initial confidence compounds alternative explanation pressure',
    );
  }

  return { penalty, objections };
}

// ---------------------------------------------------------------------------
// Check 3: Assumption fragility
// ---------------------------------------------------------------------------

function checkAssumptionFragility(
  hyp: Hypothesis,
  signals: Signal[],
): { penalty: number; objections: string[] } {
  const refSignals = signals.filter(s => hyp.signal_ids.includes(s.signal_id));
  const objections: string[] = [];

  // Check each assumption for grounding in observed signals
  let groundedCount = 0;
  for (const assumption of hyp.assumptions) {
    const words = assumption.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const isGrounded = refSignals.some(s => {
      const combined = `${s.title} ${s.statement} ${s.tags.join(' ')}`.toLowerCase();
      const matchCount = words.filter(w => combined.includes(w)).length;
      return matchCount >= 2;
    });
    if (isGrounded) groundedCount++;
  }

  const ungrounded = hyp.assumptions.length - groundedCount;
  let penalty = 0;

  if (ungrounded > hyp.assumptions.length / 2) {
    penalty = 2;
    objections.push(
      `${ungrounded}/${hyp.assumptions.length} assumptions lack direct grounding in observed signals`,
    );
  } else if (ungrounded > 0) {
    penalty = 1;
    objections.push(
      `${ungrounded} assumption(s) only partially grounded in available evidence`,
    );
  }

  return { penalty, objections };
}

// ---------------------------------------------------------------------------
// Check 4: Structural coverage
// ---------------------------------------------------------------------------

function checkStructuralCoverage(
  hyp: Hypothesis,
  allPatterns: Pattern[],
): { coverage: number; objections: string[] } {
  if (allPatterns.length === 0) return { coverage: 0, objections: [] };

  const coverage = hyp.pattern_ids.length / allPatterns.length;
  const objections: string[] = [];

  if (coverage <= 0.25 && allPatterns.length >= 3) {
    objections.push(
      `Explains only ${hyp.pattern_ids.length}/${allPatterns.length} observed patterns — narrow explanatory scope`,
    );
  }

  return { coverage, objections };
}

// ---------------------------------------------------------------------------
// Check 5: Counter-signal detection
// ---------------------------------------------------------------------------

function checkCounterSignals(
  hyp: Hypothesis,
  signals: Signal[],
): { count: number; objections: string[] } {
  const refIds = new Set(hyp.signal_ids);
  const unreferenced = signals.filter(s => !refIds.has(s.signal_id));
  const objections: string[] = [];

  // Signals with positive polarity and reasonable confidence that the
  // hypothesis does not account for could soften its claims
  const counters = unreferenced.filter(s =>
    s.polarity === 'positive' &&
    s.confidence !== 'low' &&
    s.relevance !== 'low',
  );

  if (counters.length > 0) {
    objections.push(
      `${counters.length} positive signal(s) may soften this hypothesis: ${counters.map(c => c.title).join('; ')}`,
    );
  }

  return { count: counters.length, objections };
}

// ---------------------------------------------------------------------------
// Status determination
// ---------------------------------------------------------------------------

function determineStatus(
  support: SupportResult,
  alternativePenalty: number,
  assumptionPenalty: number,
  counterCount: number,
  initialConfidence: Confidence,
): { status: HypothesisStatus; confidence: Confidence } {
  // Survives requires ALL of:
  //   - at least one high-importance referenced pattern
  //   - initial confidence >= medium
  //   - 3+ referenced tensions (multi-tension support)
  //   - 2+ signal kind diversity
  //   - no strong counter-evidence
  const survives =
    support.hasHighImportancePattern &&
    CONFIDENCE_RANK[initialConfidence] >= 2 &&
    support.tensionCount >= 3 &&
    support.signalKindDiversity >= 2 &&
    counterCount === 0;

  if (survives) {
    return { status: 'survives', confidence: initialConfidence };
  }

  // Discarded: zero support or overwhelming counter-evidence
  if (
    support.tensionCount === 0 ||
    support.patternQuality === 0 ||
    counterCount >= 3
  ) {
    return { status: 'discarded', confidence: 'low' };
  }

  // Everything else is weak — downgrade confidence
  return {
    status: 'weak',
    confidence: downgradeConfidence(initialConfidence),
  };
}

// ---------------------------------------------------------------------------
// Residual uncertainty
// ---------------------------------------------------------------------------

function buildResidualUncertainty(hyp: Hypothesis, status: HypothesisStatus): string {
  if (hyp.missing_evidence.length >= 2) {
    return hyp.missing_evidence.slice(0, 2).join(' ');
  }
  if (hyp.missing_evidence.length === 1) {
    return hyp.missing_evidence[0];
  }
  if (status === 'survives') {
    return 'Hypothesis survives available challenges but may be revised with additional evidence.';
  }
  return 'Insufficient evidence to confirm or refute this hypothesis with confidence.';
}

// ---------------------------------------------------------------------------
// Post-stress-test deduplication
// ---------------------------------------------------------------------------

/** If two hypotheses overlap >70% in pattern+tension ids, discard the weaker. */
function deduplicateStressTested(hypotheses: Hypothesis[]): Hypothesis[] {
  const statusOrder: Record<HypothesisStatus, number> = {
    survives: 0,
    weak: 1,
    candidate: 2,
    discarded: 3,
  };

  // Process stronger hypotheses first
  const sorted = [...hypotheses].sort(
    (a, b) => statusOrder[a.status] - statusOrder[b.status],
  );

  const kept: Hypothesis[] = [];
  for (const hyp of sorted) {
    const allIds = [...hyp.pattern_ids, ...hyp.tension_ids];
    const isDuplicate = kept.some(existing => {
      if (existing.status === 'discarded') return false;
      const existingIds = [...existing.pattern_ids, ...existing.tension_ids];
      const overlapCount = allIds.filter(id => existingIds.includes(id)).length;
      const maxLen = Math.max(allIds.length, existingIds.length);
      if (maxLen === 0) return false;
      return overlapCount / maxLen > 0.7;
    });

    if (isDuplicate && hyp.status !== 'survives') {
      hyp.status = 'discarded';
      hyp.strongest_objections = [
        ...(hyp.strongest_objections ?? []),
        'Near-duplicate of a stronger hypothesis — redundant explanatory value',
      ];
      hyp.confidence = 'low';
    }

    kept.push(hyp);
  }

  return kept;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export function stressTestHypotheses(
  hypotheses: Hypothesis[],
  patterns: Pattern[],
  tensions: Tension[],
  signals: Signal[],
): Hypothesis[] {
  if (hypotheses.length === 0) return [];

  const tested = hypotheses.map(hyp => {
    const initialConfidence = hyp.confidence;

    // Run all 5 checks
    const support = checkSupportStrength(hyp, patterns, tensions, signals);
    const altPressure = checkAlternativePressure(hyp);
    const assumption = checkAssumptionFragility(hyp, signals);
    const coverage = checkStructuralCoverage(hyp, patterns);
    const counter = checkCounterSignals(hyp, signals);

    // Determine status and updated confidence
    const { status, confidence } = determineStatus(
      support,
      altPressure.penalty,
      assumption.penalty,
      counter.count,
      initialConfidence,
    );

    // Aggregate objections from all checks
    const allObjections = [
      ...altPressure.objections,
      ...assumption.objections,
      ...coverage.objections,
      ...counter.objections,
    ];

    const result: Hypothesis = {
      ...hyp,
      status,
      confidence,
      initial_confidence: initialConfidence,
      strongest_support: support.descriptions,
      strongest_objections: allObjections.length > 0
        ? allObjections
        : ['No significant objections identified — hypothesis withstands available challenges'],
      residual_uncertainty: buildResidualUncertainty(hyp, status),
    };

    return result;
  });

  return deduplicateStressTested(tested);
}
