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
import type { Tension, TensionType } from './detect-tensions.js';
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
  // Look for narrative-operating model mismatch (service-delivery variant)
  const mismatchPattern = findPatternByType(patterns, 'misalignment')
    ?? findPatternByTitleKeyword(patterns, 'mismatch');

  if (!mismatchPattern) return null;

  // Only fire when the mismatch is about service delivery, not customer segment
  const supportingTensions = findTensionsByIds(tensions, mismatchPattern.tension_ids);
  const hasServiceTensions = supportingTensions.some(t =>
    t.type === 'automation_vs_service' ||
    t.type === 'positioning_vs_delivery' ||
    t.type === 'vision_vs_execution' ||
    t.type === 'credibility_vs_claim'
  );
  if (!hasServiceTensions) return null;

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
  const hiringPattern = findPatternByTitleKeyword(patterns, 'hiring')
    ?? findPatternByType(patterns, 'concentration');

  if (!hiringPattern) return null;
  // Guard: must be about hiring patterns, not founder credibility concentration
  if (!hiringPattern.title.toLowerCase().includes('hiring')) return null;

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

/**
 * Template 6: Positioning may be aspirational rather than descriptive
 *
 * Triggered by: overextension-type pattern (aspiration exceeding adoption)
 * Explains: the company's positioning may represent where it wants to be,
 * not where it currently is. The gap between narrative and evidence is
 * forward-looking positioning, not a description of current reality.
 */
function hypothesizeAspirationalPositioning(
  patterns: Pattern[],
  tensions: Tension[],
  signals: Signal[],
  companyId: string,
): Hypothesis | null {
  const aspirationPattern = findPatternByType(patterns, 'overextension')
    ?? findPatternByTitleKeyword(patterns, 'aspiration');

  if (!aspirationPattern) return null;

  const supportingTensions = findTensionsByIds(tensions, aspirationPattern.tension_ids);

  // Pull in additional related tensions for broader support
  const relatedTensions = tensions.filter(t =>
    !aspirationPattern.tension_ids.includes(t.tension_id) &&
    (t.type === 'positioning_vs_market_fit' || t.type === 'narrative_scale_vs_operations')
  );

  const customerSignals = signals.filter(s =>
    s.kind === 'customer' && s.tags.some(t => /segment_evidence|customer_concentration|smb_signal/.test(t))
  );

  return makeHypothesis(companyId, {
    title: 'Enterprise positioning may be aspirational rather than reflective of the current customer base',
    statement:
      "The company's consistent use of aspirational positioning across marketing, product, " +
      'and press may represent where the company wants to be, not where it currently is. ' +
      'The absence of supporting customer evidence — combined with pricing, hiring, and ' +
      'case study evidence indicating a different market segment — suggests the positioning ' +
      'narrative is forward-looking, not a description of current reality.',
    hypothesis_type: 'narrative',
    patterns: [aspirationPattern],
    tensions: [...supportingTensions, ...relatedTensions],
    extraSignals: customerSignals,
    assumptions: [
      'The positioning language is intentional and reflects leadership strategy.',
      'The observable customer base represents the current state, not a subset of a larger base.',
      'Pricing and hiring patterns reflect actual go-to-market priorities.',
    ],
    alternative_explanations: [
      'The company may have a genuine pipeline in the targeted segment that is not yet ' +
        'visible in public evidence — sales cycles can be long.',
      'The positioning may be a deliberate beachhead strategy, using aspirational framing ' +
        'to establish credibility while building traction in a different segment.',
    ],
    missing_evidence: [
      'Evidence of customer adoption at the scale implied by positioning.',
      'Pipeline or deal stage data showing movement toward the positioned segment.',
      'Internal strategy documents clarifying whether the positioning is aspirational or descriptive.',
    ],
    confidence: 'medium',
    novelty: 'medium',
    severity: 'high',
    actionability: 'high',
  });
}

/**
 * Template 7: Company may be building credibility while serving a different segment
 *
 * Triggered by: misalignment-type pattern (narrative-scale mismatch around customer scale)
 * Explains: the aspirational positioning may serve a branding function (investors,
 * press, credibility) while actual customer acquisition focuses on a different segment.
 */
function hypothesizeCredibilityWhileBuildingTraction(
  patterns: Pattern[],
  tensions: Tension[],
  signals: Signal[],
  companyId: string,
): Hypothesis | null {
  // Look for narrative-scale mismatch pattern
  const mismatchPattern = findPatternByType(patterns, 'misalignment')
    ?? findPatternByTitleKeyword(patterns, 'scale');

  if (!mismatchPattern) return null;

  // Avoid duplicate with Template 2 (structural onboarding) by checking for
  // segment-related tensions rather than service-related tensions
  const hasSegmentTensions = mismatchPattern.tension_ids.length > 0 &&
    findTensionsByIds(tensions, mismatchPattern.tension_ids).some(t =>
      t.type === 'positioning_vs_customer_base' ||
      t.type === 'positioning_vs_market_fit' ||
      t.type === 'narrative_scale_vs_operations'
    );

  if (!hasSegmentTensions) return null;

  const supportingTensions = findTensionsByIds(tensions, mismatchPattern.tension_ids);

  // Pull in additional related tensions for broader support
  // Include both ambition_vs_proof and vision_vs_execution to differentiate
  // from the aspirational positioning hypothesis (which uses positioning_vs_market_fit)
  const relatedTensions = tensions.filter(t =>
    !mismatchPattern.tension_ids.includes(t.tension_id) &&
    (t.type === 'ambition_vs_proof' || t.type === 'vision_vs_execution' ||
     t.type === 'narrative_scale_vs_operations')
  );

  const segmentSignals = signals.filter(s =>
    s.tags.some(t => /segment_alignment|segment_perception|smb_signal/.test(t))
  );

  return makeHypothesis(companyId, {
    title: 'The company may be targeting enterprise credibility while building traction in smaller organizations',
    statement:
      'The aspirational positioning may be a deliberate signal to investors, press, and ' +
      'the market to establish credibility, while actual customer acquisition focuses on ' +
      'a different segment. The product may genuinely serve smaller organizations well, ' +
      'with the aspirational narrative serving a branding function rather than a customer ' +
      'acquisition function.',
    hypothesis_type: 'strategic',
    patterns: [mismatchPattern],
    tensions: [...supportingTensions, ...relatedTensions],
    extraSignals: segmentSignals,
    assumptions: [
      'Press coverage uses aspirational framing that reinforces brand credibility.',
      'Hiring targets a specific segment that differs from the positioned segment.',
      'Customers describe value in terms appropriate to their actual segment, not the positioned segment.',
    ],
    alternative_explanations: [
      'The segment adoption may be early and not yet visible — the gap may reflect timing ' +
        'rather than strategy.',
      'The company may be executing a bottom-up adoption strategy, building in one segment ' +
        'and expanding upmarket over time.',
      'Aspirational features may exist primarily to close deals at higher price points ' +
        'within the current segment, not for actual upmarket sales.',
    ],
    missing_evidence: [
      'Internal strategy documents or leadership commentary on segment strategy.',
      'Pipeline data showing movement toward the positioned segment.',
      'Competitive win/loss data at different customer scales.',
    ],
    confidence: 'medium',
    novelty: 'medium',
    severity: 'high',
    actionability: 'high',
  });
}

/**
 * Template 8: Founder-dependent credibility
 *
 * Triggered by: concentration-type pattern (credibility concentrated in founder)
 * Explains: the company's market position may be anchored to a single individual
 * rather than to institutional capability.
 */
function hypothesizeFounderDependentCredibility(
  patterns: Pattern[],
  tensions: Tension[],
  signals: Signal[],
  companyId: string,
): Hypothesis | null {
  // Look for founder credibility concentration pattern
  const concentrationPattern = findPatternByTitleKeyword(patterns, 'credibility concentrated')
    ?? findPatternByTitleKeyword(patterns, 'founder');

  if (!concentrationPattern) return null;
  // Guard: must be about founder concentration, not hiring-as-strategy-reveal
  if (concentrationPattern.title.toLowerCase().includes('hiring-as-strategy')) return null;

  const supportingTensions = findTensionsByIds(tensions, concentrationPattern.tension_ids);

  // Also pull in the institutional leadership gap pattern tensions if available
  const gapPattern = findPatternByTitleKeyword(patterns, 'institutional leadership');
  const additionalTensions = gapPattern
    ? findTensionsByIds(tensions, gapPattern.tension_ids).filter(
        t => !concentrationPattern.tension_ids.includes(t.tension_id),
      )
    : [];

  // Pull in founder-related signals across multiple kinds
  const founderSignals = signals.filter(s =>
    s.tags.some(t => /founder_dependency|founder_visibility|founder_concentration/.test(t))
  );

  return makeHypothesis(companyId, {
    title: "The company's credibility may currently depend heavily on founder personal authority",
    statement:
      "The concentration of credibility, customer relationships, and public narrative in " +
      "the founder may mean that the company's market position is anchored to a single " +
      'individual rather than to institutional capability. The absence of visible senior ' +
      "leadership, the founder's direct involvement in customer implementations, and the " +
      'exclusively founder-generated content all suggest that credibility has not yet been ' +
      'distributed beyond the founder.',
    hypothesis_type: 'leadership',
    patterns: gapPattern ? [concentrationPattern, gapPattern] : [concentrationPattern],
    tensions: [...supportingTensions, ...additionalTensions],
    extraSignals: founderSignals,
    assumptions: [
      "The founder's personal involvement is currently necessary for customer acquisition and retention.",
      'No other team member has comparable external authority or customer-facing credibility.',
      'The company\'s brand identity is inseparable from the founder\'s personal identity.',
    ],
    alternative_explanations: [
      "Founder visibility may be a deliberate early-stage growth strategy — using the founder's " +
        'personal brand to build initial traction before investing in institutional infrastructure.',
      'Institutional leadership may be developing but not yet externally visible — seed-stage ' +
        'companies often make leadership hires through networks rather than public postings.',
    ],
    missing_evidence: [
      'Evidence of customer relationships managed by team members other than the founder.',
      'Internal hiring plans or leadership development strategies not visible publicly.',
      'Customer retention data comparing founder-led vs team-led engagements.',
    ],
    confidence: 'medium',
    novelty: 'medium',
    severity: 'high',
    actionability: 'high',
  });
}

/**
 * Template 9: Institutional leadership still emerging
 *
 * Triggered by: gap-type pattern (institutional leadership depth lagging)
 * Explains: the limited leadership depth may reflect early-stage phase,
 * not a structural limitation.
 */
function hypothesizeEmergingInstitutionalLeadership(
  patterns: Pattern[],
  tensions: Tension[],
  signals: Signal[],
  companyId: string,
): Hypothesis | null {
  const gapPattern = findPatternByType(patterns, 'gap')
    ?? findPatternByTitleKeyword(patterns, 'institutional leadership');

  if (!gapPattern) return null;
  // Guard: must be about leadership depth, not other gaps
  if (!gapPattern.title.toLowerCase().includes('leadership') &&
      !gapPattern.title.toLowerCase().includes('institutional')) return null;

  const supportingTensions = findTensionsByIds(tensions, gapPattern.tension_ids);

  // Also look for founder-centric growth pattern for broader support
  const growthPattern = findPatternByTitleKeyword(patterns, 'founder-centric growth')
    ?? findPatternByType(patterns, 'dependency');
  const additionalTensions = growthPattern
    ? findTensionsByIds(tensions, growthPattern.tension_ids).filter(
        t => !gapPattern.tension_ids.includes(t.tension_id),
      )
    : [];

  const talentSignals = signals.filter(s =>
    s.kind === 'talent' &&
    s.tags.some(t => /leadership_depth|junior_hiring|hiring_signal/.test(t))
  );

  return makeHypothesis(companyId, {
    title: 'Institutional leadership structures may still be emerging as the company scales',
    statement:
      'The limited leadership depth may reflect an early-stage company that has not yet ' +
      'reached the inflection point where senior leadership hires become necessary. The ' +
      'founder may be intentionally maintaining a lean structure during the seed stage, ' +
      'with plans to build institutional depth as revenue and customer base grow. The ' +
      'current state may be a temporary phase rather than a structural limitation.',
    hypothesis_type: 'organizational',
    patterns: growthPattern ? [gapPattern, growthPattern] : [gapPattern],
    tensions: [...supportingTensions, ...additionalTensions],
    extraSignals: talentSignals,
    assumptions: [
      'The company is at an early stage where founder-led operations are expected.',
      'Junior hires are building operational capacity while leadership hiring is deferred.',
      'The founder intends to build institutional leadership as the company matures.',
    ],
    alternative_explanations: [
      "The founder's personal involvement may be a competitive differentiator the company " +
        'is deliberately leveraging rather than a sign of incomplete institutionalization.',
      'The company may have informal leadership structures or advisors that are not ' +
        'reflected on the public team page or job postings.',
    ],
    missing_evidence: [
      'Board composition or advisory board that might provide institutional guidance.',
      'Internal hiring plans for senior leadership positions.',
      'Evidence of delegation or leadership development within the existing team.',
    ],
    confidence: 'medium',
    novelty: 'medium',
    severity: 'medium',
    actionability: 'medium',
  });
}

// ---------------------------------------------------------------------------
// Tension-driven hypothesis templates (Phase 8: no pattern requirement)
//
// These fire based on tension type clusters, not pattern matches.
// Patterns boost confidence when present but are not required.
// ---------------------------------------------------------------------------

/** Tension type groups for themed hypothesis generation. */
const SERVICE_DELIVERY_TYPES: TensionType[] = [
  'automation_vs_service',
  'claim_vs_reality',
  'positioning_vs_delivery',
  'vision_vs_execution',
  'credibility_vs_claim',
];

const POSITIONING_TYPES: TensionType[] = [
  'positioning_vs_customer_base',
  'ambition_vs_proof',
  'narrative_scale_vs_operations',
  'positioning_vs_market_fit',
];

const FOUNDER_TYPES: TensionType[] = [
  'founder_credibility_vs_institutional_depth',
  'narrative_authority_vs_operational_scale',
  'personal_brand_vs_company_identity',
  'leadership_concentration_vs_scaling',
];

function tensionsByTypes(tensions: Tension[], types: TensionType[]): Tension[] {
  return tensions.filter(t => types.includes(t.type));
}

function signalsForTensions(tensions: Tension[], signals: Signal[]): Signal[] {
  const ids = new Set(tensions.flatMap(t => t.signal_ids));
  return signals.filter(s => ids.has(s.signal_id));
}

function maxSeverity(tensions: Tension[]): Confidence {
  if (tensions.some(t => t.severity === 'high')) return 'high';
  if (tensions.some(t => t.severity === 'medium')) return 'medium';
  return 'low';
}

/**
 * T1: Product delivery may require more human involvement than narrative suggests
 *
 * Fires when service/delivery tensions exist.
 * Patterns boost confidence but are not required.
 */
function hypothesizeDeliveryReality(
  patterns: Pattern[],
  tensions: Tension[],
  signals: Signal[],
  companyId: string,
): Hypothesis | null {
  const relevant = tensionsByTypes(tensions, SERVICE_DELIVERY_TYPES);
  if (relevant.length === 0) return null;

  const boostPatterns = patterns.filter(p =>
    p.pattern_type === 'dependency' || p.pattern_type === 'misalignment',
  );
  const confidence: Confidence = boostPatterns.length > 0 ? 'medium' : 'low';
  const relatedSignals = signalsForTensions(relevant, signals);

  return makeHypothesis(companyId, {
    title: 'Product delivery may require more human involvement than the company narrative suggests',
    statement:
      'Tensions between the company\'s stated capabilities and observable delivery evidence ' +
      'suggest the product may depend on human configuration, onboarding, or implementation ' +
      'support to a greater degree than external messaging implies. This is common in ' +
      'growth-stage companies where the product is still maturing toward full automation.',
    hypothesis_type: 'product',
    patterns: boostPatterns,
    tensions: relevant,
    extraSignals: relatedSignals,
    assumptions: [
      'The company\'s external narrative emphasizes automation or self-service delivery.',
      'Observable evidence suggests human involvement in customer onboarding or delivery.',
      'The gap between narrative and delivery is structural rather than temporary.',
    ],
    alternative_explanations: [
      'Human involvement may be a deliberate high-touch strategy rather than a product limitation.',
      'The delivery model may be transitional, with automation improvements already in progress.',
    ],
    missing_evidence: [
      'Evidence of fully automated customer deployments without human support.',
      'Customer feedback comparing self-serve vs assisted delivery experiences.',
      'Product roadmap or engineering investment data showing automation progress.',
    ],
    confidence,
    novelty: 'medium',
    severity: maxSeverity(relevant),
    actionability: 'medium',
  });
}

/**
 * T2: Market positioning may be aspirational rather than reflective of current state
 *
 * Fires when positioning/segment tensions exist.
 */
function hypothesizePositioningAspiration(
  patterns: Pattern[],
  tensions: Tension[],
  signals: Signal[],
  companyId: string,
): Hypothesis | null {
  const relevant = tensionsByTypes(tensions, POSITIONING_TYPES);
  if (relevant.length === 0) return null;

  const boostPatterns = patterns.filter(p =>
    p.pattern_type === 'overextension' || p.pattern_type === 'trajectory',
  );
  const confidence: Confidence = boostPatterns.length > 0 ? 'medium' : 'low';
  const relatedSignals = signalsForTensions(relevant, signals);

  return makeHypothesis(companyId, {
    title: 'Market positioning may be aspirational rather than fully reflective of current traction',
    statement:
      'The company\'s market positioning — including target customer profile, scale claims, ' +
      'and competitive framing — may represent where the company aspires to be rather than ' +
      'where it currently operates. Observable customer evidence, pricing structure, and ' +
      'hiring patterns may indicate a different market segment than the one described in ' +
      'external positioning.',
    hypothesis_type: 'narrative',
    patterns: boostPatterns,
    tensions: relevant,
    extraSignals: relatedSignals,
    assumptions: [
      'The company\'s positioning language targets a specific customer segment or scale.',
      'Observable customer evidence suggests a different profile than the positioned segment.',
      'The gap between positioning and evidence reflects strategy rather than deception.',
    ],
    alternative_explanations: [
      'The company may have genuine traction in the positioned segment that is not yet publicly visible.',
      'Aspirational positioning may be a deliberate beachhead strategy common in venture-backed companies.',
      'Sales pipeline may include prospects at the positioned scale that have not yet converted.',
    ],
    missing_evidence: [
      'Evidence of customer adoption at the scale implied by positioning.',
      'Pipeline or deal stage data showing movement toward the positioned segment.',
      'Internal strategy documents clarifying positioning intent.',
    ],
    confidence,
    novelty: 'medium',
    severity: maxSeverity(relevant),
    actionability: 'high',
  });
}

/**
 * T3: Observable traction may not yet match the scale of company ambitions
 *
 * Fires when ambition_vs_proof or vision_vs_execution tensions exist.
 */
function hypothesizeAmbitionEvidenceGap(
  patterns: Pattern[],
  tensions: Tension[],
  signals: Signal[],
  companyId: string,
): Hypothesis | null {
  const relevant = tensions.filter(t =>
    t.type === 'ambition_vs_proof' || t.type === 'vision_vs_execution',
  );
  if (relevant.length === 0) return null;

  const boostPatterns = patterns.filter(p =>
    p.pattern_type === 'overextension' || p.pattern_type === 'trajectory',
  );
  const confidence: Confidence = boostPatterns.length > 0 ? 'medium' : 'low';
  const relatedSignals = signalsForTensions(relevant, signals);

  return makeHypothesis(companyId, {
    title: 'Observable traction may not yet match the scale of company ambitions',
    statement:
      'The company\'s stated ambitions — growth targets, market scope, or competitive ' +
      'positioning — may exceed what can be verified through observable evidence. This ' +
      'is common in early-stage companies where vision necessarily leads execution, but ' +
      'the gap between ambition and proof may affect credibility with sophisticated buyers ' +
      'or investors who seek evidence of traction.',
    hypothesis_type: 'strategic',
    patterns: boostPatterns,
    tensions: relevant,
    extraSignals: relatedSignals,
    assumptions: [
      'The company\'s growth ambitions are expressed in external communications.',
      'Observable evidence of traction is limited relative to stated ambitions.',
      'Sophisticated buyers or investors will evaluate evidence alongside claims.',
    ],
    alternative_explanations: [
      'Early-stage companies routinely project ambitious futures — the gap may be normal and expected.',
      'Evidence of traction may exist in private metrics not visible through public research.',
    ],
    missing_evidence: [
      'Customer growth metrics or revenue trajectory data.',
      'Competitive win/loss data showing market position accuracy.',
      'Independent validation of market traction claims.',
    ],
    confidence,
    novelty: 'low',
    severity: maxSeverity(relevant),
    actionability: 'medium',
  });
}

/**
 * T4: Company credibility may depend disproportionately on founder involvement
 *
 * Fires when founder/leadership tensions exist.
 */
function hypothesizeFounderConcentration(
  patterns: Pattern[],
  tensions: Tension[],
  signals: Signal[],
  companyId: string,
): Hypothesis | null {
  const relevant = tensionsByTypes(tensions, FOUNDER_TYPES);
  if (relevant.length === 0) return null;

  const boostPatterns = patterns.filter(p =>
    p.pattern_type === 'concentration' || p.pattern_type === 'gap',
  );
  const confidence: Confidence = boostPatterns.length > 0 ? 'medium' : 'low';
  const relatedSignals = signalsForTensions(relevant, signals);

  return makeHypothesis(companyId, {
    title: 'Company credibility and growth capacity may depend disproportionately on founder involvement',
    statement:
      'The company\'s market credibility, customer relationships, and public narrative ' +
      'may be concentrated in the founder rather than distributed across the organization. ' +
      'This concentration may be appropriate for the current stage but could become a ' +
      'scaling constraint as the company grows beyond the founder\'s personal bandwidth.',
    hypothesis_type: 'leadership',
    patterns: boostPatterns,
    tensions: relevant,
    extraSignals: relatedSignals,
    assumptions: [
      'The founder is the primary source of external credibility and customer relationships.',
      'No other team member has comparable external visibility or authority.',
      'Growth beyond current scale may require distributing leadership functions.',
    ],
    alternative_explanations: [
      'Founder-led credibility may be a deliberate early-stage strategy with planned transition.',
      'The company may have informal leadership depth not visible through public research.',
    ],
    missing_evidence: [
      'Evidence of customer relationships managed by team members other than the founder.',
      'Internal leadership development plans or senior hiring pipeline.',
      'Board or advisory composition providing institutional depth.',
    ],
    confidence,
    novelty: 'medium',
    severity: maxSeverity(relevant),
    actionability: 'high',
  });
}

/**
 * T5: Organizational depth may need to develop to support next growth stage
 *
 * Fires when leadership scaling or narrative authority tensions exist.
 */
function hypothesizeOrganizationalScaling(
  patterns: Pattern[],
  tensions: Tension[],
  signals: Signal[],
  companyId: string,
): Hypothesis | null {
  const relevant = tensions.filter(t =>
    t.type === 'leadership_concentration_vs_scaling' ||
    t.type === 'narrative_authority_vs_operational_scale',
  );
  if (relevant.length === 0) return null;

  const boostPatterns = patterns.filter(p =>
    p.pattern_type === 'gap' || p.pattern_type === 'dependency',
  );
  const confidence: Confidence = boostPatterns.length > 0 ? 'medium' : 'low';
  const relatedSignals = signalsForTensions(relevant, signals);

  return makeHypothesis(companyId, {
    title: 'Organizational depth may need to develop to support the next growth stage',
    statement:
      'The current organizational structure may be lean relative to the company\'s ' +
      'stated ambitions. Leadership concentration, limited team depth, and founder-dependent ' +
      'operations may be appropriate for the current stage but could constrain capacity ' +
      'as customer volume and operational complexity increase.',
    hypothesis_type: 'organizational',
    patterns: boostPatterns,
    tensions: relevant,
    extraSignals: relatedSignals,
    assumptions: [
      'The company operates with a lean organizational structure relative to its ambitions.',
      'Key functions are concentrated in a small number of individuals.',
      'Scaling beyond current capacity may require additional leadership hiring.',
    ],
    alternative_explanations: [
      'Lean operations may be intentional and efficient for the current stage.',
      'The company may have plans for organizational expansion not visible externally.',
    ],
    missing_evidence: [
      'Internal hiring plans for senior leadership positions.',
      'Operational capacity metrics relative to growth targets.',
      'Evidence of delegation or leadership development within the team.',
    ],
    confidence,
    novelty: 'low',
    severity: maxSeverity(relevant),
    actionability: 'medium',
  });
}

/**
 * T6: Multiple tensions suggest a structural growth transition
 *
 * Fires when tensions exist across 2+ theme groups.
 * Higher-order hypothesis that synthesizes cross-theme observations.
 */
function hypothesizeStructuralTransition(
  patterns: Pattern[],
  tensions: Tension[],
  signals: Signal[],
  companyId: string,
): Hypothesis | null {
  const hasService = tensionsByTypes(tensions, SERVICE_DELIVERY_TYPES).length > 0;
  const hasPositioning = tensionsByTypes(tensions, POSITIONING_TYPES).length > 0;
  const hasFounder = tensionsByTypes(tensions, FOUNDER_TYPES).length > 0;
  const themeCount = [hasService, hasPositioning, hasFounder].filter(Boolean).length;

  if (themeCount < 2) return null;

  const relatedSignals = signalsForTensions(tensions, signals);

  return makeHypothesis(companyId, {
    title: 'Multiple structural tensions suggest the company is navigating a growth transition',
    statement:
      'Tensions spanning multiple dimensions — delivery model, market positioning, and ' +
      'organizational structure — suggest the company may be in a transitional phase ' +
      'where its current operating model is being stretched by growth ambitions. This ' +
      'is common in growth-stage companies moving from founder-led to institutionally ' +
      'scaled operations.',
    hypothesis_type: 'strategic',
    patterns: patterns.slice(0, 2), // include top patterns as boosters if available
    tensions,
    extraSignals: relatedSignals,
    assumptions: [
      'The company is experiencing tensions across multiple operational dimensions.',
      'These tensions reflect growth-stage dynamics rather than fundamental dysfunction.',
      'Resolving these tensions will require deliberate strategic choices.',
    ],
    alternative_explanations: [
      'Cross-dimensional tensions may be normal operating noise in any growing company.',
      'The tensions may be independently caused rather than symptoms of a single transition.',
    ],
    missing_evidence: [
      'Internal strategic planning documents addressing these tensions.',
      'Founder or leadership commentary acknowledging growth transition challenges.',
      'Operational metrics showing capacity constraints or scaling friction.',
    ],
    confidence: 'low',
    novelty: 'medium',
    severity: maxSeverity(tensions),
    actionability: 'medium',
  });
}

/**
 * T7: The actual customer base may represent the company's strongest market position
 *
 * Fires on positioning_vs_customer_base (single tension, distinct angle).
 * Reframes segment mismatch as an opportunity: the current customers
 * may be the right market, and positioning should follow.
 */
function hypothesizeActualSegmentStrength(
  patterns: Pattern[],
  tensions: Tension[],
  signals: Signal[],
  companyId: string,
): Hypothesis | null {
  const relevant = tensions.filter(t => t.type === 'positioning_vs_customer_base');
  if (relevant.length === 0) return null;

  const relatedSignals = signalsForTensions(relevant, signals);
  const customerSignals = signals.filter(s =>
    s.kind === 'customer' &&
    s.tags.some(t => /segment_evidence|customer_concentration|buyer_language/.test(t)),
  );

  return makeHypothesis(companyId, {
    title: 'The actual customer base may represent a stronger market position than the aspirational target',
    statement:
      'The customers the company currently serves may represent its genuine product-market ' +
      'fit. Rather than viewing the gap between positioning and customer base as a weakness, ' +
      'the current segment may be where the product delivers the most value. Leaning into ' +
      'this segment — rather than stretching toward an aspirational one — could accelerate ' +
      'growth by aligning messaging with demonstrated strength.',
    hypothesis_type: 'market',
    patterns: [],
    tensions: relevant,
    extraSignals: [...relatedSignals, ...customerSignals],
    assumptions: [
      'The current customer base reflects genuine product-market fit.',
      'Customer retention and satisfaction are stronger in the current segment.',
      'Aspirational positioning may be distracting from the strongest growth path.',
    ],
    alternative_explanations: [
      'The aspirational segment may be the correct long-term target, with current customers as a beachhead.',
      'The company may be deliberately building capability in the current segment before moving upmarket.',
    ],
    missing_evidence: [
      'Customer retention rates comparing current segment vs aspirational segment.',
      'Revenue concentration analysis across customer segments.',
      'Customer satisfaction or NPS data by segment.',
    ],
    confidence: 'low',
    novelty: 'medium',
    severity: 'medium',
    actionability: 'high',
  });
}

/**
 * T8: Customer value perception may diverge from company messaging
 *
 * Fires on positioning_vs_market_fit (single tension, customer-centric angle).
 * Focuses on how customers describe and experience value differently
 * from how the company positions it.
 */
function hypothesizeCustomerValueDivergence(
  patterns: Pattern[],
  tensions: Tension[],
  signals: Signal[],
  companyId: string,
): Hypothesis | null {
  const relevant = tensions.filter(t => t.type === 'positioning_vs_market_fit');
  if (relevant.length === 0) return null;

  const relatedSignals = signalsForTensions(relevant, signals);
  const customerSignals = signals.filter(s =>
    s.kind === 'customer' || s.tags.some(t => /buyer_language|customer_voice/.test(t)),
  );

  return makeHypothesis(companyId, {
    title: 'Customer perception of value may differ from how the company positions its product',
    statement:
      'The language customers use to describe the product\'s value may differ from the ' +
      'company\'s own positioning language. This divergence can signal that the product ' +
      'solves a different problem than the company emphasizes — or solves the right ' +
      'problem but for different reasons than marketing suggests. Understanding this ' +
      'gap could reveal untapped positioning opportunities.',
    hypothesis_type: 'gtm',
    patterns: [],
    tensions: relevant,
    extraSignals: [...relatedSignals, ...customerSignals],
    assumptions: [
      'Customer language differs from company positioning language.',
      'The divergence reflects genuine differences in perceived value.',
      'Aligning positioning with customer perception could improve conversion.',
    ],
    alternative_explanations: [
      'Customer language may simply be less sophisticated — the product delivers exactly what is promised.',
      'The positioning may be intentionally aspirational to attract a higher-value segment.',
    ],
    missing_evidence: [
      'Direct customer quotes describing why they chose the product.',
      'Win/loss analysis showing what customers value most.',
      'A/B test data on positioning messages and conversion rates.',
    ],
    confidence: 'low',
    novelty: 'medium',
    severity: 'medium',
    actionability: 'high',
  });
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/** Collapse hypotheses with >70% overlap in pattern_ids + tension_ids or tension_ids alone. */
function deduplicateHypotheses(hypotheses: Hypothesis[]): Hypothesis[] {
  const result: Hypothesis[] = [];
  for (const hyp of hypotheses) {
    const allIds = [...hyp.pattern_ids, ...hyp.tension_ids];
    const isDuplicate = result.some(existing => {
      const existingIds = [...existing.pattern_ids, ...existing.tension_ids];

      // Check full ID overlap (pattern_ids + tension_ids)
      const overlapCount = allIds.filter(id => existingIds.includes(id)).length;
      const maxLen = Math.max(allIds.length, existingIds.length);
      if (maxLen > 0 && overlapCount / maxLen > 0.7) return true;

      // Also check tension-only overlap (catches tension-subset cases where
      // a pattern-boosted hypothesis already covers the same tensions)
      if (hyp.tension_ids.length > 0 && existing.tension_ids.length > 0) {
        const tensionOverlap = hyp.tension_ids.filter(
          id => existing.tension_ids.includes(id),
        ).length;
        const maxTensions = Math.max(
          hyp.tension_ids.length,
          existing.tension_ids.length,
        );
        if (tensionOverlap / maxTensions > 0.7) return true;
      }

      return false;
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
  if (tensions.length === 0) return [];

  const companyId =
    patterns[0]?.company_id ?? tensions[0].company_id;

  // Phase 1: Pattern-boosted hypotheses (original templates — fire when patterns match)
  const patternBoosted = [
    hypothesizeAutomationCompensation(patterns, tensions, signals, companyId),
    hypothesizeStructuralOnboarding(patterns, tensions, signals, companyId),
    hypothesizeIntentionalServicesGTM(patterns, tensions, signals, companyId),
    hypothesizeHiringRevealsStrategy(patterns, tensions, signals, companyId),
    hypothesizeWideningGap(patterns, tensions, signals, companyId),
    hypothesizeAspirationalPositioning(patterns, tensions, signals, companyId),
    hypothesizeCredibilityWhileBuildingTraction(patterns, tensions, signals, companyId),
    hypothesizeFounderDependentCredibility(patterns, tensions, signals, companyId),
    hypothesizeEmergingInstitutionalLeadership(patterns, tensions, signals, companyId),
  ].filter((h): h is Hypothesis => h !== null);

  // Phase 2: Tension-driven hypotheses (new — no pattern requirement)
  const tensionDriven = [
    hypothesizeDeliveryReality(patterns, tensions, signals, companyId),
    hypothesizePositioningAspiration(patterns, tensions, signals, companyId),
    hypothesizeAmbitionEvidenceGap(patterns, tensions, signals, companyId),
    hypothesizeFounderConcentration(patterns, tensions, signals, companyId),
    hypothesizeOrganizationalScaling(patterns, tensions, signals, companyId),
    hypothesizeStructuralTransition(patterns, tensions, signals, companyId),
    hypothesizeActualSegmentStrength(patterns, tensions, signals, companyId),
    hypothesizeCustomerValueDivergence(patterns, tensions, signals, companyId),
  ].filter((h): h is Hypothesis => h !== null);

  // Pattern-boosted first so they win deduplication over tension-driven equivalents
  return deduplicateHypotheses([...patternBoosted, ...tensionDriven]);
}
