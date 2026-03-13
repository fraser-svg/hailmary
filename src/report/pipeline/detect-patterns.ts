/**
 * Stage 3: Detect Patterns
 *
 * Identifies structural themes that emerge from groups of tensions and
 * signals. Patterns compress many observations into a smaller number of
 * meaningful strategic structures.
 *
 * Patterns are descriptive, not causal. They describe forms, not reasons.
 *
 * V1: Deterministic template-based detection over Tension[] + Signal[].
 * No LLM calls. No dossier inspection.
 */

import type { Signal } from './extract-signals.js';
import type { Tension, TensionType } from './detect-tensions.js';
import type { Confidence } from '../../types/evidence.js';

// ---------------------------------------------------------------------------
// Pattern types (per spec 004-detect-patterns)
// ---------------------------------------------------------------------------

export type PatternType =
  | 'contradiction'
  | 'gap'
  | 'dependency'
  | 'concentration'
  | 'fragility'
  | 'overextension'
  | 'misalignment'
  | 'drift'
  | 'consistency'
  | 'trajectory';

export interface Pattern {
  pattern_id: string;
  company_id: string;
  pattern_type: PatternType;
  title: string;
  summary: string;
  tension_ids: string[];
  signal_ids: string[];
  evidence_ids: string[];
  source_ids: string[];
  importance: Confidence;
  confidence: Confidence;
  strategic_weight: Confidence;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _counter = 0;

function nextId(): string {
  return `pat_${String(++_counter).padStart(3, '0')}`;
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

/** Find tensions by type. */
function tensionsByType(tensions: Tension[], type: TensionType): Tension[] {
  return tensions.filter(t => t.type === type);
}

/** Aggregate lineage from tensions and optional extra signals. */
function aggregateLineage(
  tensions: Tension[],
  extraSignals: Signal[] = [],
): { signal_ids: string[]; evidence_ids: string[]; source_ids: string[] } {
  return {
    signal_ids: unique([
      ...tensions.flatMap(t => t.signal_ids),
      ...extraSignals.map(s => s.signal_id),
    ]),
    evidence_ids: unique([
      ...tensions.flatMap(t => t.evidence_ids),
      ...extraSignals.flatMap(s => s.evidence_ids),
    ]),
    source_ids: unique([
      ...tensions.flatMap(t => t.source_ids),
      ...extraSignals.flatMap(s => s.source_ids),
    ]),
  };
}

function makePattern(
  companyId: string,
  opts: {
    pattern_type: PatternType;
    title: string;
    summary: string;
    tensions: Tension[];
    extraSignals?: Signal[];
    importance: Confidence;
    confidence: Confidence;
    strategic_weight: Confidence;
  },
): Pattern {
  const lineage = aggregateLineage(opts.tensions, opts.extraSignals);
  return {
    pattern_id: nextId(),
    company_id: companyId,
    pattern_type: opts.pattern_type,
    title: opts.title,
    summary: opts.summary,
    tension_ids: opts.tensions.map(t => t.tension_id),
    signal_ids: lineage.signal_ids,
    evidence_ids: lineage.evidence_ids,
    source_ids: lineage.source_ids,
    importance: opts.importance,
    confidence: opts.confidence,
    strategic_weight: opts.strategic_weight,
  };
}

// ---------------------------------------------------------------------------
// Pattern templates
// ---------------------------------------------------------------------------

/**
 * Template 1: Service-assisted delivery beneath automation narrative
 *
 * Multiple tensions converge on the same structural form: the company
 * markets autonomous AI, but delivery depends on human services.
 *
 * Requires: automation_vs_service + claim_vs_reality
 * Enriched by: positioning_vs_delivery
 */
function detectServiceDependencyPattern(
  tensions: Tension[],
  signals: Signal[],
  companyId: string,
): Pattern | null {
  const automationTensions = tensionsByType(tensions, 'automation_vs_service');
  const claimTensions = tensionsByType(tensions, 'claim_vs_reality');

  if (automationTensions.length === 0 || claimTensions.length === 0) return null;

  // Enrich with positioning_vs_delivery if present
  const deliveryTensions = tensionsByType(tensions, 'positioning_vs_delivery');
  const allTensions = [...automationTensions, ...claimTensions, ...deliveryTensions];

  // Pull in customer and operations signals for reinforcement
  const reinforcingSignals = signals.filter(s =>
    s.kind === 'customer' || s.kind === 'operations'
  );

  return makePattern(companyId, {
    pattern_type: 'dependency',
    title: 'Service-assisted delivery beneath automation narrative',
    summary:
      "The company's delivery model relies meaningfully on human onboarding, " +
      'implementation, plus support despite an automation-led outward narrative. This ' +
      'structural dependency is visible across marketing vs customer experience, pricing ' +
      'vs product positioning, hiring priorities vs stated investment narrative.',
    tensions: allTensions,
    extraSignals: reinforcingSignals,
    importance: 'high',
    confidence: allTensions.length >= 3 ? 'high' : 'medium',
    strategic_weight: 'high',
  });
}

/**
 * Template 2: Narrative-operating model mismatch
 *
 * The company's external narrative (AI-first, scalable) is structurally
 * misaligned with its operating model (services-heavy, linear scaling).
 *
 * Requires: positioning_vs_delivery + (vision_vs_execution OR credibility_vs_claim)
 */
function detectNarrativeMismatchPattern(
  tensions: Tension[],
  signals: Signal[],
  companyId: string,
): Pattern | null {
  const deliveryTensions = tensionsByType(tensions, 'positioning_vs_delivery');
  const executionTensions = tensionsByType(tensions, 'vision_vs_execution');
  const credibilityTensions = tensionsByType(tensions, 'credibility_vs_claim');

  if (deliveryTensions.length === 0) return null;
  if (executionTensions.length === 0 && credibilityTensions.length === 0) return null;

  const allTensions = [...deliveryTensions, ...executionTensions, ...credibilityTensions];

  // Reinforce with credibility and talent signals
  const reinforcingSignals = signals.filter(s =>
    s.kind === 'credibility' || s.kind === 'talent'
  );

  return makePattern(companyId, {
    pattern_type: 'misalignment',
    title: 'Narrative-operating model mismatch',
    summary:
      "The company's external narrative — AI-first, technology-led, scalable — is " +
      'structurally misaligned with its operating model, which appears services-heavy ' +
      'and consultant-dependent with linear scaling characteristics. This mismatch is ' +
      'visible across external press framing vs internal employee perception, stated ' +
      "priorities vs actual resource allocation, and product marketing vs customer-described " +
      'experience.',
    tensions: allTensions,
    extraSignals: reinforcingSignals,
    importance: 'high',
    confidence: 'medium',
    strategic_weight: 'high',
  });
}

/**
 * Template 3: Customer value attribution pattern (nice to detect)
 *
 * Across multiple independent customer sources, customers consistently
 * attribute value to human support rather than AI capability.
 *
 * Requires: ≥2 customer-kind signals with service/buyer language tags
 */
function detectCustomerAttributionPattern(
  tensions: Tension[],
  signals: Signal[],
  companyId: string,
): Pattern | null {
  const customerSignals = signals.filter(s =>
    s.kind === 'customer' &&
    s.tags.some(t => /service_dependency|buyer_language|customer_voice/.test(t))
  );

  // Need customer evidence plus a supporting operations or pricing signal
  const supportingSignals = signals.filter(s =>
    (s.kind === 'operations' || s.kind === 'pricing') &&
    s.tags.some(t => /consulting|implementation_evidence|service_model/.test(t))
  );

  if (customerSignals.length === 0 || supportingSignals.length === 0) return null;

  // Find tensions these signals participate in
  const relevantSignalIds = new Set([
    ...customerSignals.map(s => s.signal_id),
    ...supportingSignals.map(s => s.signal_id),
  ]);
  const relevantTensions = tensions.filter(t =>
    t.signal_ids.some(id => relevantSignalIds.has(id))
  );

  if (relevantTensions.length === 0) return null;

  return makePattern(companyId, {
    pattern_type: 'consistency',
    title: 'Customer value attribution pattern',
    summary:
      'Across multiple independent customer sources, customers consistently attribute ' +
      'value to human support and onboarding specialists rather than autonomous AI ' +
      'capability. This pattern strengthens the service-dependency observation by showing ' +
      "it from the customer's perspective across review platforms and case studies.",
    tensions: relevantTensions,
    extraSignals: [...customerSignals, ...supportingSignals],
    importance: 'medium',
    confidence: 'medium',
    strategic_weight: 'medium',
  });
}

/**
 * Template 4: Hiring-as-strategy-reveal pattern (nice to detect)
 *
 * Hiring activity reveals strategic priorities more accurately than
 * public messaging. Services roles dominate over engineering hires.
 *
 * Requires: talent-kind signals with hiring tags + credibility_vs_claim tension
 */
function detectHiringRevealPattern(
  tensions: Tension[],
  signals: Signal[],
  companyId: string,
): Pattern | null {
  const hiringSignals = signals.filter(s =>
    s.kind === 'talent' &&
    s.tags.some(t => /service_scaling/.test(t))
  );

  if (hiringSignals.length === 0) return null;

  // Find tensions that reference hiring signals
  const hiringSignalIds = new Set(hiringSignals.map(s => s.signal_id));
  const relevantTensions = tensions.filter(t =>
    t.signal_ids.some(id => hiringSignalIds.has(id))
  );

  // Need at least 2 tensions referencing hiring to call it a pattern
  if (relevantTensions.length < 2) return null;

  // Add funding/operations signals for reinforcement
  const reinforcingSignals = signals.filter(s =>
    s.tags.some(t => /funding|narrative_gap/.test(t)) && s.kind === 'operations'
  );

  return makePattern(companyId, {
    pattern_type: 'concentration',
    title: 'Hiring-as-strategy-reveal pattern',
    summary:
      "The company's hiring activity reveals strategic priorities more accurately than " +
      'its public messaging. Services and implementation roles dominate observable hiring, ' +
      'professional services is being scaled as a function, and solutions engineering is ' +
      'growing — all signals of a service-led strategy beneath a technology narrative.',
    tensions: relevantTensions,
    extraSignals: [...hiringSignals, ...reinforcingSignals],
    importance: 'medium',
    confidence: 'medium',
    strategic_weight: 'medium',
  });
}

/**
 * Template 5: Aspiration exceeding observable adoption
 *
 * Multiple positioning tensions converge: the company projects a market
 * identity across marketing, product, and press, but no observable
 * evidence — customers, pricing, hiring — demonstrates adoption at
 * the claimed scale.
 *
 * Requires: positioning_vs_customer_base + ambition_vs_proof
 * Enriched by: narrative_scale_vs_operations
 */
function detectAspirationExceedingAdoptionPattern(
  tensions: Tension[],
  signals: Signal[],
  companyId: string,
): Pattern | null {
  const positioningTensions = tensionsByType(tensions, 'positioning_vs_customer_base');
  const ambitionTensions = tensionsByType(tensions, 'ambition_vs_proof');

  if (positioningTensions.length === 0 || ambitionTensions.length === 0) return null;

  // Enrich with narrative_scale_vs_operations if present
  const scaleTensions = tensionsByType(tensions, 'narrative_scale_vs_operations');
  const allTensions = [...positioningTensions, ...ambitionTensions, ...scaleTensions];

  // Pull in customer and credibility signals
  const reinforcingSignals = signals.filter(s =>
    s.kind === 'customer' || s.kind === 'credibility'
  );

  return makePattern(companyId, {
    pattern_type: 'overextension',
    title: 'Enterprise aspiration exceeding observable enterprise adoption',
    summary:
      'Multiple tensions converge on the same structural form: the company projects ' +
      'a market identity across marketing, product features, and press, but observable ' +
      'evidence across every dimension — buyer profiles, pricing tiers, hiring activity, ' +
      'published case studies — indicates adoption at a different scale. This is a ' +
      'recurring structural theme synthesized from several independent tensions, ' +
      'spanning ambition, proof, and segment alignment.',
    tensions: allTensions,
    extraSignals: reinforcingSignals,
    importance: 'high',
    confidence: allTensions.length >= 3 ? 'high' : 'medium',
    strategic_weight: 'high',
  });
}

/**
 * Template 6: Narrative-operating model mismatch around customer scale
 *
 * External narrative targets one customer scale, but the operating model
 * — pricing, sales motion, CS structure — is built for a different scale.
 *
 * Requires: positioning_vs_customer_base + positioning_vs_market_fit
 * Enriched by: narrative_scale_vs_operations
 */
function detectNarrativeScaleMismatchPattern(
  tensions: Tension[],
  signals: Signal[],
  companyId: string,
): Pattern | null {
  const customerBaseTensions = tensionsByType(tensions, 'positioning_vs_customer_base');
  const marketFitTensions = tensionsByType(tensions, 'positioning_vs_market_fit');

  if (customerBaseTensions.length === 0 && marketFitTensions.length === 0) return null;
  // Need at least 2 relevant tensions
  const scaleTensions = tensionsByType(tensions, 'narrative_scale_vs_operations');
  const allTensions = [...customerBaseTensions, ...marketFitTensions, ...scaleTensions];
  if (allTensions.length < 2) return null;

  // Pull in pricing and talent signals
  const reinforcingSignals = signals.filter(s =>
    s.kind === 'pricing' || s.kind === 'talent'
  );

  return makePattern(companyId, {
    pattern_type: 'misalignment',
    title: 'Narrative-operating model mismatch around customer scale',
    summary:
      "The company's external narrative targets one customer scale, but its operating " +
      'model — pricing tiers, sales motion, customer success structure, deal sizes — ' +
      'is built for a different scale. The mismatch is systematic: marketing and press ' +
      'all say one thing, while operational structure, hiring, pricing, and customer ' +
      'evidence all indicate a different market segment.',
    tensions: allTensions,
    extraSignals: reinforcingSignals,
    importance: 'high',
    confidence: 'medium',
    strategic_weight: 'high',
  });
}

/**
 * Template 7: Positioning-led growth strategy (nice to detect)
 *
 * The company may be using aspirational positioning as a top-of-funnel
 * credibility signal while serving a different customer base.
 *
 * Requires: ambition_vs_proof tension + customer segment signals
 */
function detectPositioningLedGrowthPattern(
  tensions: Tension[],
  signals: Signal[],
  companyId: string,
): Pattern | null {
  const ambitionTensions = tensionsByType(tensions, 'ambition_vs_proof');
  if (ambitionTensions.length === 0) return null;

  // Need customer segment signals and positioning gap signals
  const segmentSignals = signals.filter(s =>
    s.tags.some(t => /segment_evidence|customer_concentration|smb_signal/.test(t))
  );
  const positioningSignals = signals.filter(s =>
    s.kind === 'positioning' && s.tags.some(t => /positioning_gap|narrative_gap/.test(t))
  );

  if (segmentSignals.length === 0 || positioningSignals.length === 0) return null;

  // Find any other tensions these signals participate in
  const allSignalIds = new Set([
    ...segmentSignals.map(s => s.signal_id),
    ...positioningSignals.map(s => s.signal_id),
  ]);
  const relevantTensions = tensions.filter(t =>
    t.signal_ids.some(id => allSignalIds.has(id))
  );
  const allTensions = unique([
    ...ambitionTensions.map(t => t.tension_id),
    ...relevantTensions.map(t => t.tension_id),
  ]);

  const tensionObjects = tensions.filter(t => allTensions.includes(t.tension_id));

  return makePattern(companyId, {
    pattern_type: 'trajectory',
    title: 'Positioning-led growth strategy',
    summary:
      'The company may be using aspirational positioning as a top-of-funnel ' +
      'credibility signal while serving a different customer segment. This pattern — ' +
      'leading with aspirational narrative to attract interest, then converting in a ' +
      'different segment — is a recognizable growth strategy that the evidence supports ' +
      'but does not confirm.',
    tensions: tensionObjects,
    extraSignals: [...segmentSignals, ...positioningSignals],
    importance: 'medium',
    confidence: 'medium',
    strategic_weight: 'medium',
  });
}

/**
 * Template 8: Credibility concentrated in founder identity
 *
 * Multiple tensions converge: company credibility, customer relationships,
 * thought leadership, and public narrative are all anchored to the founder
 * personally rather than distributed across institutional structure.
 *
 * Requires: founder_credibility_vs_institutional_depth + narrative_authority_vs_operational_scale
 * Enriched by: personal_brand_vs_company_identity
 */
function detectFounderCredibilityConcentrationPattern(
  tensions: Tension[],
  signals: Signal[],
  companyId: string,
): Pattern | null {
  const credibilityTensions = tensionsByType(tensions, 'founder_credibility_vs_institutional_depth');
  const narrativeTensions = tensionsByType(tensions, 'narrative_authority_vs_operational_scale');

  if (credibilityTensions.length === 0 || narrativeTensions.length === 0) return null;

  // Enrich with personal_brand_vs_company_identity if present
  const brandTensions = tensionsByType(tensions, 'personal_brand_vs_company_identity');
  const allTensions = [...credibilityTensions, ...narrativeTensions, ...brandTensions];

  // Pull in founder-related signals for reinforcement
  const reinforcingSignals = signals.filter(s =>
    s.tags.some(t => /founder_visibility|founder_dependency|founder_concentration/.test(t))
  );

  return makePattern(companyId, {
    pattern_type: 'concentration',
    title: 'Credibility concentrated in founder identity',
    summary:
      "The company's credibility, customer value delivery, thought leadership, and public " +
      'narrative are all anchored to the founder personally rather than distributed across ' +
      'an institutional structure. This concentration is visible across marketing, press, ' +
      'customer relationships, and content — no other institutional voice or authority is observable.',
    tensions: allTensions,
    extraSignals: reinforcingSignals,
    importance: 'high',
    confidence: allTensions.length >= 3 ? 'high' : 'medium',
    strategic_weight: 'high',
  });
}

/**
 * Template 9: Institutional leadership depth lagging company ambition
 *
 * The company's positioning implies organizational maturity, but observable
 * leadership consists of one executive and junior support staff.
 *
 * Requires: narrative_authority_vs_operational_scale + leadership_concentration_vs_scaling
 */
function detectInstitutionalLeadershipGapPattern(
  tensions: Tension[],
  signals: Signal[],
  companyId: string,
): Pattern | null {
  const narrativeTensions = tensionsByType(tensions, 'narrative_authority_vs_operational_scale');
  const scalingTensions = tensionsByType(tensions, 'leadership_concentration_vs_scaling');

  if (narrativeTensions.length === 0 && scalingTensions.length === 0) return null;
  const allTensions = [...narrativeTensions, ...scalingTensions];
  if (allTensions.length < 2) return null;

  // Pull in leadership and hiring signals
  const reinforcingSignals = signals.filter(s =>
    s.kind === 'talent' &&
    s.tags.some(t => /leadership_depth|junior_hiring|founder_concentration/.test(t))
  );

  return makePattern(companyId, {
    pattern_type: 'gap',
    title: 'Institutional leadership depth lagging company ambition',
    summary:
      "The company's positioning implies organizational maturity, but the observable " +
      'leadership structure consists of one executive and junior support staff. The gap ' +
      'between institutional ambition and institutional depth is visible across team ' +
      'composition, hiring patterns, and the founder personally performing functions ' +
      'that scaling companies typically distribute across multiple leaders.',
    tensions: allTensions,
    extraSignals: reinforcingSignals,
    importance: 'high',
    confidence: 'medium',
    strategic_weight: 'high',
  });
}

/**
 * Template 10: Founder-centric growth structure (nice to detect)
 *
 * The company operates a growth model where the founder's personal brand
 * and direct involvement are the primary acquisition and retention mechanism.
 *
 * Requires: founder_credibility_vs_institutional_depth tension + founder signals
 */
function detectFounderCentricGrowthPattern(
  tensions: Tension[],
  signals: Signal[],
  companyId: string,
): Pattern | null {
  const founderTensions = tensionsByType(tensions, 'founder_credibility_vs_institutional_depth');
  if (founderTensions.length === 0) return null;

  // Need customer and positioning signals showing founder dependency
  const founderSignals = signals.filter(s =>
    s.tags.some(t => /founder_dependency|founder_involvement|founder_visibility/.test(t))
  );
  if (founderSignals.length < 2) return null;

  // Add any scaling-related tensions
  const scalingTensions = tensionsByType(tensions, 'leadership_concentration_vs_scaling');
  const allTensions = [...founderTensions, ...scalingTensions];

  return makePattern(companyId, {
    pattern_type: 'dependency',
    title: 'Founder-centric growth structure',
    summary:
      "The company may be operating a growth model where the founder's personal brand " +
      'and direct involvement serve as the primary customer acquisition and retention ' +
      'mechanism. This structure — founder as sales, marketing, customer success, and ' +
      'product evangelist simultaneously — is a recognizable early-stage pattern.',
    tensions: allTensions,
    extraSignals: founderSignals,
    importance: 'medium',
    confidence: 'medium',
    strategic_weight: 'medium',
  });
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/** Collapse patterns with >70% tension_id overlap. */
function deduplicatePatterns(patterns: Pattern[]): Pattern[] {
  const result: Pattern[] = [];
  for (const pattern of patterns) {
    const isDuplicate = result.some(existing => {
      const overlapCount = pattern.tension_ids.filter(id =>
        existing.tension_ids.includes(id),
      ).length;
      const maxLen = Math.max(pattern.tension_ids.length, existing.tension_ids.length);
      if (maxLen === 0) return false;
      return overlapCount / maxLen > 0.7;
    });

    if (!isDuplicate) {
      result.push(pattern);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export function detectPatterns(tensions: Tension[], signals: Signal[]): Pattern[] {
  _counter = 0;
  if (tensions.length === 0) return [];

  const companyId = tensions[0].company_id;

  const candidates = [
    detectServiceDependencyPattern(tensions, signals, companyId),
    detectNarrativeMismatchPattern(tensions, signals, companyId),
    detectCustomerAttributionPattern(tensions, signals, companyId),
    detectHiringRevealPattern(tensions, signals, companyId),
    detectAspirationExceedingAdoptionPattern(tensions, signals, companyId),
    detectNarrativeScaleMismatchPattern(tensions, signals, companyId),
    detectPositioningLedGrowthPattern(tensions, signals, companyId),
    detectFounderCredibilityConcentrationPattern(tensions, signals, companyId),
    detectInstitutionalLeadershipGapPattern(tensions, signals, companyId),
    detectFounderCentricGrowthPattern(tensions, signals, companyId),
  ].filter((p): p is Pattern => p !== null);

  return deduplicatePatterns(candidates);
}
