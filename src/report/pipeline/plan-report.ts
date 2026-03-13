/**
 * Stage 7: Plan Report
 *
 * Constructs the narrative structure of the intelligence report.
 * Selects the most important analytical insights and organizes them
 * into a coherent argument structure.
 *
 * This stage does NOT write prose. It designs the argument structure.
 *
 * V1: Deterministic heuristic-based planning over upstream analytical objects.
 * No LLM calls. No dossier inspection.
 */

import type { Signal } from './extract-signals.js';
import type { Tension } from './detect-tensions.js';
import type { Pattern } from './detect-patterns.js';
import type { Hypothesis } from './generate-hypotheses.js';
import type { Implication } from './generate-implications.js';
import type { Confidence } from '../../types/evidence.js';

// ---------------------------------------------------------------------------
// ReportPlan types (per spec 008-plan-report)
// ---------------------------------------------------------------------------

export interface SectionPlan {
  section_id: string;
  title: string;
  purpose: string;
  hypothesis_ids: string[];
  implication_ids: string[];
}

export interface ToneProfile {
  style: 'forensic' | 'analytical' | 'advisory';
  directness: Confidence;
  skepticism: Confidence;
  warmth: Confidence;
}

export interface ReportPlan {
  report_id: string;
  company_id: string;
  core_thesis: string;
  key_findings: string[];
  primary_hypothesis_ids: string[];
  supporting_hypothesis_ids: string[];
  implication_ids: string[];
  section_plan: SectionPlan[];
  tone_profile: ToneProfile;
}

// ---------------------------------------------------------------------------
// Confidence utilities
// ---------------------------------------------------------------------------

const CONFIDENCE_RANK: Record<Confidence, number> = { low: 1, medium: 2, high: 3 };

/** Rank a surviving hypothesis by composite score for primary selection. */
function rankHypothesis(hyp: Hypothesis, patterns: Pattern[]): number {
  const refPatterns = patterns.filter(p => hyp.pattern_ids.includes(p.pattern_id));
  const maxPatternWeight = refPatterns.length > 0
    ? Math.max(...refPatterns.map(p => CONFIDENCE_RANK[p.strategic_weight]))
    : 0;

  // confidence(3x) + severity(2x) + pattern_weight(2x) + novelty(1x)
  return (
    CONFIDENCE_RANK[hyp.confidence] * 3 +
    CONFIDENCE_RANK[hyp.severity] * 2 +
    maxPatternWeight * 2 +
    CONFIDENCE_RANK[hyp.novelty]
  );
}

/** Rank an implication by impact priority. */
function rankImplication(imp: Implication): number {
  // impact(3x) + urgency(2x) + confidence(1x)
  return (
    CONFIDENCE_RANK[imp.impact] * 3 +
    CONFIDENCE_RANK[imp.urgency] * 2 +
    CONFIDENCE_RANK[imp.confidence]
  );
}

// ---------------------------------------------------------------------------
// Core thesis
// ---------------------------------------------------------------------------

/**
 * Derive the core thesis from the strongest surviving hypothesis
 * and its dominant pattern. Combines the pattern observation with
 * the hypothesis explanation.
 */
function deriveThesis(primaryHyp: Hypothesis, patterns: Pattern[]): string {
  const refPatterns = patterns
    .filter(p => primaryHyp.pattern_ids.includes(p.pattern_id))
    .sort((a, b) => CONFIDENCE_RANK[b.strategic_weight] - CONFIDENCE_RANK[a.strategic_weight]);

  const dominantPattern = refPatterns[0] ?? null;

  if (dominantPattern) {
    // First sentence of pattern summary + hypothesis title as explanation
    const patternSentence = dominantPattern.summary.split(/\.\s/)[0].replace(/\.+$/, '');
    const hypClause =
      primaryHyp.title.charAt(0).toLowerCase() + primaryHyp.title.slice(1).replace(/\.+$/, '');
    return `${patternSentence}, suggesting that ${hypClause}.`;
  }

  // Fallback: first sentence of hypothesis statement
  return primaryHyp.statement.split(/\.\s/)[0].replace(/\.+$/, '') + '.';
}

// ---------------------------------------------------------------------------
// Key findings
// ---------------------------------------------------------------------------

/** Check if two text strings have >50% keyword overlap. */
function hasSignificantOverlap(a: string, b: string): boolean {
  const wordsA = a.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
  const wordsB = b.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
  const overlap = wordsA.filter(w => wordsB.includes(w)).length;
  const maxLen = Math.max(wordsA.length, wordsB.length);
  return maxLen > 0 && overlap / maxLen > 0.5;
}

/**
 * Derive 3-5 key findings from primary hypotheses and top implications.
 * Primary hypotheses contribute first, then top implications fill remaining
 * slots. Deduplication prevents overlapping findings.
 */
function deriveKeyFindings(
  primaryHyps: Hypothesis[],
  supportingHyps: Hypothesis[],
  rankedImplications: Implication[],
): string[] {
  const findings: string[] = [];

  // Primary hypotheses contribute findings first
  for (const hyp of primaryHyps) {
    if (findings.length >= 5) break;
    findings.push(hyp.title);
  }

  // Top implications fill remaining slots (deduped)
  for (const imp of rankedImplications) {
    if (findings.length >= 5) break;
    if (!findings.some(f => hasSignificantOverlap(f, imp.title))) {
      findings.push(imp.title);
    }
  }

  // If under 3, add supporting hypothesis titles
  for (const hyp of supportingHyps) {
    if (findings.length >= 3) break;
    if (!findings.some(f => hasSignificantOverlap(f, hyp.title))) {
      findings.push(hyp.title);
    }
  }

  return findings.slice(0, 5);
}

// ---------------------------------------------------------------------------
// Tone profile
// ---------------------------------------------------------------------------

/**
 * Derive tone profile from surviving hypothesis characteristics.
 * Higher average confidence -> more direct, less skeptical.
 */
function deriveToneProfile(surviving: Hypothesis[]): ToneProfile {
  if (surviving.length === 0) {
    return { style: 'analytical', directness: 'low', skepticism: 'high', warmth: 'low' };
  }

  const avgConf =
    surviving.reduce((sum, h) => sum + CONFIDENCE_RANK[h.confidence], 0) / surviving.length;

  const directness: Confidence = avgConf >= 2.5 ? 'high' : avgConf >= 1.5 ? 'medium' : 'low';
  const skepticism: Confidence = avgConf >= 2.5 ? 'medium' : 'high';

  return { style: 'forensic', directness, skepticism, warmth: 'low' };
}

// ---------------------------------------------------------------------------
// Section plan
// ---------------------------------------------------------------------------

/**
 * Build the 6-section report structure. Each section maps to a layer of
 * the analytical pipeline. Hypothesis and implication IDs are assigned
 * exclusively to avoid cross-section duplication.
 */
function buildSectionPlan(
  primaryHypIds: string[],
  supportingHypIds: string[],
  weakHypIds: string[],
  selectedImpIds: string[],
): SectionPlan[] {
  return [
    {
      section_id: 'sec_01',
      title: 'Executive Overview',
      purpose:
        'Summarize the core thesis, key findings, and most critical implications ' +
        'for decision-makers. This section frames the entire report.',
      hypothesis_ids: [],
      implication_ids: [],
    },
    {
      section_id: 'sec_02',
      title: 'What the Evidence Shows',
      purpose:
        'Present observable signals and structural patterns in the evidence, ' +
        'establishing the factual foundation before interpretation.',
      hypothesis_ids: [],
      implication_ids: [],
    },
    {
      section_id: 'sec_03',
      title: 'Where the Tensions Are',
      purpose:
        'Identify structural contradictions and misalignments between observable ' +
        'signals, revealing strain points that demand explanation.',
      hypothesis_ids: [],
      implication_ids: [],
    },
    {
      section_id: 'sec_04',
      title: 'What May Really Be Happening',
      purpose:
        'Present the most plausible explanations for observed tensions, grounded ' +
        'in evidence and pattern analysis.',
      hypothesis_ids: [...primaryHypIds, ...supportingHypIds],
      implication_ids: [],
    },
    {
      section_id: 'sec_05',
      title: 'Strategic Implications',
      purpose:
        'Translate surviving hypotheses into concrete consequences for stakeholders, ' +
        'prioritized by impact and urgency.',
      hypothesis_ids: [],
      implication_ids: selectedImpIds,
    },
    {
      section_id: 'sec_06',
      title: 'What Remains Uncertain',
      purpose:
        'Acknowledge hypotheses with insufficient support and identify evidence gaps ' +
        'that limit the analysis.',
      hypothesis_ids: weakHypIds,
      implication_ids: [],
    },
  ];
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export function planReport(
  implications: Implication[],
  hypotheses: Hypothesis[],
  patterns: Pattern[],
  _tensions: Tension[],
  _signals: Signal[],
): ReportPlan {
  // Partition hypotheses by status (discarded excluded entirely)
  const surviving = hypotheses.filter(h => h.status === 'survives');
  const weak = hypotheses.filter(h => h.status === 'weak');

  // Company ID from the first available object
  const companyId =
    surviving[0]?.company_id ??
    weak[0]?.company_id ??
    hypotheses[0]?.company_id ??
    implications[0]?.company_id ??
    _signals[0]?.company_id ??
    'unknown';

  // Rank surviving hypotheses and split primary (top 3) / supporting
  const rankedSurviving = [...surviving].sort(
    (a, b) => rankHypothesis(b, patterns) - rankHypothesis(a, patterns),
  );
  const primaryHyps = rankedSurviving.slice(0, 3);
  const supportingHyps = rankedSurviving.slice(3);

  const primaryHypIds = primaryHyps.map(h => h.hypothesis_id);
  const supportingHypIds = supportingHyps.map(h => h.hypothesis_id);
  const weakHypIds = weak.map(h => h.hypothesis_id);

  // Rank implications and select top 8
  const rankedImplications = [...implications].sort(
    (a, b) => rankImplication(b) - rankImplication(a),
  );
  const selectedImpIds = rankedImplications.slice(0, 8).map(i => i.implication_id);

  // Core thesis from strongest surviving hypothesis
  const coreThesis =
    primaryHyps.length > 0
      ? deriveThesis(primaryHyps[0], patterns)
      : 'Insufficient surviving hypotheses to derive a core thesis.';

  // Key findings (3-5)
  const keyFindings = deriveKeyFindings(primaryHyps, supportingHyps, rankedImplications);

  // Section plan
  const sectionPlan = buildSectionPlan(primaryHypIds, supportingHypIds, weakHypIds, selectedImpIds);

  // Tone
  const toneProfile = deriveToneProfile(surviving);

  return {
    report_id: 'rpt_001',
    company_id: companyId,
    core_thesis: coreThesis,
    key_findings: keyFindings,
    primary_hypothesis_ids: primaryHypIds,
    supporting_hypothesis_ids: supportingHypIds,
    implication_ids: selectedImpIds,
    section_plan: sectionPlan,
    tone_profile: toneProfile,
  };
}
