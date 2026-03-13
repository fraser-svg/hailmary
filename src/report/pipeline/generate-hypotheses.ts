/**
 * Stage 4: Generate Hypotheses
 *
 * Proposes plausible explanations for observed structural patterns.
 * Hypotheses are tentative, falsifiable, and pattern-rooted.
 * They explain "why" — but never claim certainty.
 *
 * V1: Deterministic template-based generation over Pattern[] + Tension[] + Signal[].
 * No LLM calls. No dossier inspection.
 */

import type { Signal } from './extract-signals.js';
import type { Tension } from './detect-tensions.js';
import type { Pattern, PatternType } from './detect-patterns.js';
import type { Confidence } from '../../types/evidence.js';

// ---------------------------------------------------------------------------
// Hypothesis types (per spec 005-generate-hypotheses)
// ---------------------------------------------------------------------------

export type HypothesisType =
  | 'strategic'
  | 'product'
  | 'gtm'
  | 'operational'
  | 'leadership'
  | 'market'
  | 'organizational'
  | 'narrative';

export type HypothesisStatus = 'candidate' | 'survives' | 'weak' | 'discarded';

export interface Hypothesis {
  hypothesis_id: string;
  company_id: string;
  title: string;
  statement: string;
  hypothesis_type: HypothesisType;
  pattern_ids: string[];
  tension_ids: string[];
  signal_ids: string[];
  evidence_ids: string[];
  source_ids: string[];
  assumptions: string[];
  alternative_explanations: string[];
  missing_evidence: string[];
  confidence: Confidence;
  novelty: Confidence;
  severity: Confidence;
  actionability: Confidence;
  status: HypothesisStatus;
  // Stress-test results (populated by stress-test-hypotheses stage)
  strongest_support?: string[];
  strongest_objections?: string[];
  residual_uncertainty?: string;
  initial_confidence?: Confidence;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _counter = 0;

function nextId(): string {
  return `hyp_${String(++_counter).padStart(3, '0')}`;
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

/** Aggregate full lineage from patterns, tensions, and signals used. */
function aggregateLineage(
  patterns: Pattern[],
  tensions: Tension[],
  signals: Signal[],
): { signal_ids: string[]; evidence_ids: string[]; source_ids: string[] } {
  return {
    signal_ids: unique([
      ...patterns.flatMap(p => p.signal_ids),
      ...tensions.flatMap(t => t.signal_ids),
      ...signals.map(s => s.signal_id),
    ]),
    evidence_ids: unique([
      ...patterns.flatMap(p => p.evidence_ids),
      ...tensions.flatMap(t => t.evidence_ids),
      ...signals.flatMap(s => s.evidence_ids),
    ]),
    source_ids: unique([
      ...patterns.flatMap(p => p.source_ids),
      ...tensions.flatMap(t => t.source_ids),
      ...signals.flatMap(s => s.source_ids),
    ]),
  };
}

function makeHypothesis(
  companyId: string,
  opts: {
    title: string;
    statement: string;
    hypothesis_type: HypothesisType;
    patterns: Pattern[];
    tensions: Tension[];
    extraSignals?: Signal[];
    assumptions: string[];
    alternative_explanations: string[];
    missing_evidence: string[];
    confidence: Confidence;
    novelty: Confidence;
    severity: Confidence;
    actionability: Confidence;
  },
): Hypothesis {
  const lineage = aggregateLineage(
    opts.patterns,
    opts.tensions,
    opts.extraSignals ?? [],
  );
  return {
    hypothesis_id: nextId(),
    company_id: companyId,
    title: opts.title,
    statement: opts.statement,
    hypothesis_type: opts.hypothesis_type,
    pattern_ids: opts.patterns.map(p => p.pattern_id),
    tension_ids: unique([
      ...opts.patterns.flatMap(p => p.tension_ids),
      ...opts.tensions.map(t => t.tension_id),
    ]),
    signal_ids: lineage.signal_ids,
    evidence_ids: lineage.evidence_ids,
    source_ids: lineage.source_ids,
    assumptions: opts.assumptions,
    alternative_explanations: opts.alternative_explanations,
    missing_evidence: opts.missing_evidence,
    confidence: opts.confidence,
    novelty: opts.novelty,
    severity: opts.severity,
    actionability: opts.actionability,
    status: 'candidate',
  };
}

// ---------------------------------------------------------------------------
// Pattern lookup helpers
// ---------------------------------------------------------------------------

function findPatternByType(patterns: Pattern[], type: PatternType): Pattern | undefined {
  return patterns.find(p => p.pattern_type === type);
}

function findPatternByTitleKeyword(patterns: Pattern[], keyword: string): Pattern | undefined {
  const kw = keyword.toLowerCase();
  return patterns.find(p => p.title.toLowerCase().includes(kw));
}

function findTensionsByIds(tensions: Tension[], ids: string[]): Tension[] {
  const idSet = new Set(ids);
  return tensions.filter(t => idSet.has(t.tension_id));
}

// ---------------------------------------------------------------------------
// Hypothesis templates
// ---------------------------------------------------------------------------

/**
 * Template 1: Automation narrative compensates for incomplete product automation
 *
 * Triggered by: dependency-type pattern (service-assisted delivery)
 * Explains: the automation narrative may exist because the product cannot
 * yet deliver autonomous operation.
 */
function hypothesizeAutomationCompensation(
  patterns: Pattern[],
  tensions: Tension[],
  signals: Signal[],
  companyId: string,
): Hypothesis | null {
  // Look for service-dependency pattern
  const depPattern = findPatternByType(patterns, 'dependency')
    ?? findPatternByTitleKeyword(patterns, 'service');

  if (!depPattern) return null;

  // Get supporting tensions from the pattern
  const supportingTensions = findTensionsByIds(tensions, depPattern.tension_ids);

  // Pull customer signals for reinforcement
  const customerSignals = signals.filter(s =>
    s.kind === 'customer' &&
    s.tags.some(t => /service_dependency|buyer_language|customer_voice/.test(t))
  );

  return makeHypothesis(companyId, {
    title: 'Automation narrative may be compensating for incomplete product automation',
    statement:
      "The company's automation-led positioning may be ahead of its actual delivery model, " +
      'which appears to rely on meaningful human onboarding and implementation support. ' +
      'The strength of the automation narrative may exist precisely because the product ' +
      'cannot yet deliver autonomous operation — the messaging fills the gap between ' +
      'current capability and market expectation.',
    hypothesis_type: 'product',
    patterns: [depPattern],
    tensions: supportingTensions,
    extraSignals: customerSignals,
    assumptions: [
      'Customers expect automated delivery based on the company\'s marketing claims.',
      'The current level of human involvement in delivery is higher than what the narrative implies.',
      'Implementation specialists are necessary rather than optional for customer success.',
    ],
    alternative_explanations: [
      'The company may deliberately use high-touch onboarding as a competitive moat and ' +
        'land-and-expand strategy, while maintaining the AI narrative for market positioning.',
      'Automation narrative may be aspirational and forward-looking — describing a credible ' +
        'product roadmap rather than current capability, which is common in VC-backed companies.',
      'The product may genuinely automate core functions while requiring human expertise only ' +
        'for higher-order configuration, making the automation claims partially true but overstated in scope.',
    ],
    missing_evidence: [
      'Evidence of fully automated customer deployments without implementation support.',
      'Customer retention or NPS data comparing self-serve vs assisted onboarding cohorts.',
      'Product roadmap or engineering investment data showing automation capability progress.',
    ],
    confidence: 'medium',
    novelty: 'medium',
    severity: 'high',
    actionability: 'high',
  });
}

/**
 * Template 2: Human onboarding is structurally required, not transitional
 *
 * Triggered by: misalignment-type pattern (narrative-operating model mismatch)
 * Explains: the onboarding program is a structural requirement of the current
 * product, not a temporary growth artifact.
 */
function hypothesizeStructuralOnboarding(
  patterns: Pattern[],
  tensions: Tension[],
  signals: Signal[],
  companyId: string,
): Hypothesis | null {
  // Look for narrative-operating model mismatch
  const mismatchPattern = findPatternByType(patterns, 'misalignment')
    ?? findPatternByTitleKeyword(patterns, 'mismatch');

  if (!mismatchPattern) return null;

  const supportingTensions = findTensionsByIds(tensions, mismatchPattern.tension_ids);

  // Reinforce with operations and talent signals
  const opsSignals = signals.filter(s =>
    (s.kind === 'operations' || s.kind === 'talent') &&
    s.tags.some(t => /service_model|consulting|hiring_signal|service_scaling/.test(t))
  );

  return makeHypothesis(companyId, {
    title: 'Human onboarding may be structurally required because product automation is incomplete',
    statement:
      'The product may be unable to deliver value without significant human configuration ' +
      'and training. The onboarding and implementation program is not a temporary growth-stage ' +
      'artifact — it may be a structural requirement of the current product\'s capability level. ' +
      'The formalization of professional services as a department rather than its reduction ' +
      'suggests the company recognizes this dependency.',
    hypothesis_type: 'operational',
    patterns: [mismatchPattern],
    tensions: supportingTensions,
    extraSignals: opsSignals,
    assumptions: [
      'The company\'s product requires meaningful human configuration to deliver customer value.',
      'Professional services is being formalized as a function rather than being reduced.',
      'Customer outcomes depend more on implementation quality than on product capability alone.',
    ],
    alternative_explanations: [
      'Customers may prefer high-touch onboarding even when self-serve is available — the ' +
        'services dependency may reflect customer preference rather than product limitation.',
      'Service-heavy delivery may be a deliberate wedge strategy rather than a weakness — ' +
        'using deep implementation as a competitive moat that creates switching costs.',
      'The company may be running a two-speed delivery model where automation handles routine ' +
        'tasks while humans manage complex enterprise configurations.',
    ],
    missing_evidence: [
      'Customer churn data comparing assisted vs unassisted onboarding outcomes.',
      'Internal product capability assessments or automation coverage metrics.',
      'Evidence of successful fully-automated customer deployments.',
      'Professional services revenue trend as a percentage of total revenue.',
    ],
    confidence: 'medium',
    novelty: 'medium',
    severity: 'high',
    actionability: 'high',
  });
}

/**
 * Template 3: Services-led GTM may be intentional strategy
 *
 * Triggered by: consistency-type pattern (customer value attribution)
 * Explains: the services layer may be a deliberate competitive advantage
 * rather than a product deficiency.
 */
function hypothesizeIntentionalServicesGTM(
  patterns: Pattern[],
  tensions: Tension[],
  signals: Signal[],
  companyId: string,
): Hypothesis | null {
  // Look for customer attribution or consistency pattern
  const attributionPattern = findPatternByType(patterns, 'consistency')
    ?? findPatternByTitleKeyword(patterns, 'attribution');

  if (!attributionPattern) return null;

  const supportingTensions = findTensionsByIds(tensions, attributionPattern.tension_ids);

  const customerSignals = signals.filter(s =>
    s.kind === 'customer' || s.kind === 'pricing'
  );

  return makeHypothesis(companyId, {
    title: 'Services-led GTM may be a deliberate competitive wedge rather than a product gap',
    statement:
      'The company may deliberately use high-touch onboarding and implementation as a ' +
      'competitive moat and land-and-expand strategy. Customer attribution of value to ' +
      'human consultants could indicate that the services layer creates switching costs ' +
      'and deep integration that product-only competitors cannot match. The gap between ' +
      'narrative and delivery may be strategic rather than a product maturity issue.',
    hypothesis_type: 'gtm',
    patterns: [attributionPattern],
    tensions: supportingTensions,
    extraSignals: customerSignals,
    assumptions: [
      'Customer stickiness is driven partly by human relationships built during implementation.',
      'The services layer creates integration depth that product-only alternatives cannot replicate.',
      'The company maintains the automation narrative for market positioning while building on services.',
    ],
    alternative_explanations: [
      'The services dependency may be purely compensatory — masking product immaturity ' +
        'rather than creating deliberate competitive advantage.',
      'Customer preference for human support may be temporary, reflecting market immaturity ' +
        'rather than a durable strategic asset.',
    ],
    missing_evidence: [
      'Customer retention comparing high-touch vs low-touch cohorts.',
      'Competitive win/loss data showing whether services influence deal outcomes.',
      'Internal strategy documents or leadership commentary on services as strategy vs necessity.',
    ],
    confidence: 'low',
    novelty: 'medium',
    severity: 'medium',
    actionability: 'medium',
  });
}

/**
 * Template 4: Hiring patterns reveal actual strategic priorities
 *
 * Triggered by: concentration-type pattern (hiring-as-strategy-reveal)
 * Explains: hiring for services roles rather than engineering reveals
 * where the company actually invests vs what it claims.
 */
function hypothesizeHiringRevealsStrategy(
  patterns: Pattern[],
  tensions: Tension[],
  signals: Signal[],
  companyId: string,
): Hypothesis | null {
  const hiringPattern = findPatternByType(patterns, 'concentration')
    ?? findPatternByTitleKeyword(patterns, 'hiring');

  if (!hiringPattern) return null;

  const supportingTensions = findTensionsByIds(tensions, hiringPattern.tension_ids);

  const talentSignals = signals.filter(s =>
    s.kind === 'talent' &&
    s.tags.some(t => /hiring_signal|service_scaling/.test(t))
  );

  return makeHypothesis(companyId, {
    title: 'Hiring patterns may reveal actual strategy diverges from stated AI-first investment thesis',
    statement:
      'The company\'s hiring activity — concentrated in implementation, onboarding, and services ' +
      'roles — may more accurately reflect its actual strategic priorities than its public ' +
      'narrative about AI engineering investment. This could indicate the company privately ' +
      'recognizes its near-term growth depends on scaling human delivery capacity rather than ' +
      'product automation.',
    hypothesis_type: 'strategic',
    patterns: [hiringPattern],
    tensions: supportingTensions,
    extraSignals: talentSignals,
    assumptions: [
      'Hiring patterns reflect resource allocation decisions more accurately than press releases.',
      'Services hiring is growing faster than engineering hiring.',
      'The company\'s growth model currently requires proportional human scaling.',
    ],
    alternative_explanations: [
      'Services hiring may be cyclical — the company could be building implementation capacity ' +
        'for a specific market push while continuing to invest heavily in engineering off-cycle.',
      'The visible hiring may represent only a subset of total hiring, with engineering roles ' +
        'filled through different channels.',
    ],
    missing_evidence: [
      'Complete headcount breakdown by function over time.',
      'Engineering hiring data from internal sources or job boards.',
      'Revenue per employee trends that would reveal scaling efficiency.',
    ],
    confidence: 'medium',
    novelty: 'medium',
    severity: 'medium',
    actionability: 'medium',
  });
}

/**
 * Template 5: Cross-pattern — Narrative-delivery gap is widening
 *
 * Triggered by: both dependency AND misalignment patterns present.
 * Higher-order hypothesis that combines multiple patterns.
 */
function hypothesizeWideningGap(
  patterns: Pattern[],
  tensions: Tension[],
  signals: Signal[],
  companyId: string,
): Hypothesis | null {
  const depPattern = findPatternByType(patterns, 'dependency');
  const mismatchPattern = findPatternByType(patterns, 'misalignment');

  // Requires both core patterns
  if (!depPattern || !mismatchPattern) return null;

  const allPatternTensionIds = unique([
    ...depPattern.tension_ids,
    ...mismatchPattern.tension_ids,
  ]);
  const supportingTensions = findTensionsByIds(tensions, allPatternTensionIds);

  return makeHypothesis(companyId, {
    title: 'The gap between automation narrative and service-dependent delivery may be widening',
    statement:
      'Multiple structural patterns suggest the distance between the company\'s external ' +
      'narrative and its operating reality may be increasing rather than narrowing. ' +
      'Services formalization, implementation hiring growth, and customer attribution ' +
      'of value to human support all point toward deepening service dependency, while ' +
      'the automation narrative continues to strengthen in marketing materials.',
    hypothesis_type: 'narrative',
    patterns: [depPattern, mismatchPattern],
    tensions: supportingTensions,
    assumptions: [
      'The automation narrative has been strengthening over time in external communications.',
      'Services dependency is growing rather than shrinking based on hiring and formalization.',
      'The gap between narrative and reality has strategic consequences for credibility.',
    ],
    alternative_explanations: [
      'The company may be in a normal transition period where services investment leads ' +
        'product automation — the gap may narrow as engineering investments mature.',
      'The apparent widening may reflect measurement timing — services are more visible ' +
        'externally than internal engineering progress.',
    ],
    missing_evidence: [
      'Historical trend data on services headcount vs engineering headcount.',
      'Product release cadence or automation feature shipping velocity.',
      'Customer satisfaction trends over time that might reveal improving or worsening experience.',
    ],
    confidence: 'low',
    novelty: 'high',
    severity: 'high',
    actionability: 'medium',
  });
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/** Collapse hypotheses with >70% pattern_id + tension_id overlap. */
function deduplicateHypotheses(hypotheses: Hypothesis[]): Hypothesis[] {
  const result: Hypothesis[] = [];
  for (const hyp of hypotheses) {
    const allIds = [...hyp.pattern_ids, ...hyp.tension_ids];
    const isDuplicate = result.some(existing => {
      const existingIds = [...existing.pattern_ids, ...existing.tension_ids];
      const overlapCount = allIds.filter(id => existingIds.includes(id)).length;
      const maxLen = Math.max(allIds.length, existingIds.length);
      if (maxLen === 0) return false;
      return overlapCount / maxLen > 0.7;
    });

    if (!isDuplicate) {
      result.push(hyp);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export function generateHypotheses(
  patterns: Pattern[],
  tensions: Tension[],
  signals: Signal[],
): Hypothesis[] {
  _counter = 0;
  if (patterns.length === 0) return [];

  const companyId = patterns[0].company_id;

  const candidates = [
    hypothesizeAutomationCompensation(patterns, tensions, signals, companyId),
    hypothesizeStructuralOnboarding(patterns, tensions, signals, companyId),
    hypothesizeIntentionalServicesGTM(patterns, tensions, signals, companyId),
    hypothesizeHiringRevealsStrategy(patterns, tensions, signals, companyId),
    hypothesizeWideningGap(patterns, tensions, signals, companyId),
  ].filter((h): h is Hypothesis => h !== null);

  return deduplicateHypotheses(candidates);
}
