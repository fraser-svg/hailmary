/**
 * Stage 2: Detect Tensions
 *
 * Identifies structural contradictions, asymmetries, and misalignments
 * between signals. Tensions are observational — they describe strain,
 * not causes or explanations.
 *
 * V1: Deterministic template-based detection over Signal[].
 * No LLM calls. No dossier inspection.
 */

import type { Signal } from './extract-signals.js';
import type { Confidence } from '../../types/evidence.js';

// ---------------------------------------------------------------------------
// Tension types (per spec 003-detect-tensions)
// ---------------------------------------------------------------------------

export type TensionType =
  | 'claim_vs_reality'
  | 'ambition_vs_proof'
  | 'positioning_vs_delivery'
  | 'growth_vs_readiness'
  | 'breadth_vs_focus'
  | 'brand_vs_customer_language'
  | 'speed_vs_trust'
  | 'automation_vs_service'
  | 'vision_vs_execution'
  | 'credibility_vs_claim'
  | 'positioning_vs_customer_base'
  | 'narrative_scale_vs_operations'
  | 'positioning_vs_market_fit'
  | 'other';

export interface Tension {
  tension_id: string;
  company_id: string;
  type: TensionType;
  title: string;
  statement: string;
  signal_ids: string[];
  evidence_ids: string[];
  source_ids: string[];
  confidence: Confidence;
  severity: Confidence;
  strategic_relevance: Confidence;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _counter = 0;

function nextId(): string {
  return `ten_${String(++_counter).padStart(3, '0')}`;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function hasAnyTag(signal: Signal, tags: string[]): boolean {
  return tags.some(tag =>
    signal.tags.some(t => t.toLowerCase().includes(tag.toLowerCase()))
  );
}

/** Aggregate evidence_ids and source_ids from constituent signals. */
function aggregateLineage(signals: Signal[]): { evidence_ids: string[]; source_ids: string[] } {
  return {
    evidence_ids: unique(signals.flatMap(s => s.evidence_ids)),
    source_ids: unique(signals.flatMap(s => s.source_ids)),
  };
}

function makeTension(
  companyId: string,
  opts: {
    type: TensionType;
    title: string;
    statement: string;
    signals: Signal[];
    confidence: Confidence;
    severity: Confidence;
    strategic_relevance: Confidence;
  },
): Tension {
  const lineage = aggregateLineage(opts.signals);
  return {
    tension_id: nextId(),
    company_id: companyId,
    type: opts.type,
    title: opts.title,
    statement: opts.statement,
    signal_ids: opts.signals.map(s => s.signal_id),
    evidence_ids: lineage.evidence_ids,
    source_ids: lineage.source_ids,
    confidence: opts.confidence,
    severity: opts.severity,
    strategic_relevance: opts.strategic_relevance,
  };
}

// ---------------------------------------------------------------------------
// Tension templates
// ---------------------------------------------------------------------------

/**
 * Template 1: automation_vs_service
 * Automation/AI narrative signals vs customer/hiring/operational signals
 * indicating human-heavy delivery.
 */
function detectAutomationVsService(signals: Signal[], companyId: string): Tension | null {
  const automationSignals = signals.filter(s =>
    hasAnyTag(s, ['automation', 'narrative_gap']) && s.kind === 'positioning'
  );
  const serviceSignals = signals.filter(s =>
    hasAnyTag(s, ['service_dependency', 'service_scaling', 'consulting', 'service_model'])
  );

  if (automationSignals.length === 0 || serviceSignals.length === 0) return null;

  const allIds = unique([...automationSignals, ...serviceSignals].map(s => s.signal_id));
  const constituentSignals = signals.filter(s => allIds.includes(s.signal_id));

  return makeTension(companyId, {
    type: 'automation_vs_service',
    title: 'Automation narrative vs service-heavy delivery',
    statement:
      "The company's outward automation narrative appears to conflict with multiple signals " +
      'indicating meaningful human involvement in onboarding, implementation, and delivery. ' +
      'Customer language, hiring patterns, and case study evidence all point toward a ' +
      'service-dependent operating model.',
    signals: constituentSignals,
    confidence: constituentSignals.length >= 3 ? 'high' : 'medium',
    severity: 'high',
    strategic_relevance: 'high',
  });
}

/**
 * Template 2: claim_vs_reality
 * Product self-serve/platform positioning vs mandatory fees and sales-led GTM.
 */
function detectClaimVsReality(signals: Signal[], companyId: string): Tension | null {
  const positioningSignals = signals.filter(s =>
    s.kind === 'positioning' && hasAnyTag(s, ['automation', 'narrative_gap', 'positioning'])
  );
  const pricingServiceSignals = signals.filter(s =>
    s.kind === 'pricing' && hasAnyTag(s, ['implementation_evidence', 'service_revenue'])
  );

  if (positioningSignals.length === 0 || pricingServiceSignals.length === 0) return null;

  const constituentSignals = [...positioningSignals, ...pricingServiceSignals];

  return makeTension(companyId, {
    type: 'claim_vs_reality',
    title: 'Product positioning vs operational reality',
    statement:
      'The company positions as a self-serve AI platform, but pricing structure includes ' +
      'mandatory implementation fees and the go-to-market motion appears sales-led with ' +
      'high-touch onboarding rather than product-led.',
    signals: constituentSignals,
    confidence: 'high',
    severity: 'high',
    strategic_relevance: 'high',
  });
}

/**
 * Template 3: positioning_vs_delivery
 * External company narrative vs internal employee/culture perception.
 */
function detectPositioningVsDelivery(signals: Signal[], companyId: string): Tension | null {
  const externalSignals = signals.filter(s =>
    hasAnyTag(s, ['funding', 'narrative_gap']) && s.kind === 'operations'
  );
  const internalSignals = signals.filter(s =>
    hasAnyTag(s, ['employee_voice', 'culture_signal']) && s.kind === 'credibility'
  );

  if (externalSignals.length === 0 || internalSignals.length === 0) return null;

  const constituentSignals = [...externalSignals, ...internalSignals];

  return makeTension(companyId, {
    type: 'positioning_vs_delivery',
    title: 'External narrative vs internal perception',
    statement:
      "Leadership's external narrative about investment priorities and company direction " +
      "diverges from internal employee perception of the company's operating model. " +
      'The external narrative emphasizes technology and AI, while internal signals ' +
      'characterize the organization as services-oriented.',
    signals: constituentSignals,
    confidence: 'medium',
    severity: 'medium',
    strategic_relevance: 'high',
  });
}

/**
 * Template 4: vision_vs_execution (nice to detect)
 * Growth/scalability narrative vs service-dependent delivery requiring
 * proportional headcount.
 */
function detectVisionVsExecution(signals: Signal[], companyId: string): Tension | null {
  const growthSignals = signals.filter(s =>
    hasAnyTag(s, ['service_scaling', 'hiring_signal']) && s.kind === 'talent'
  );
  const serviceModelSignals = signals.filter(s =>
    hasAnyTag(s, ['service_model', 'consulting']) && s.kind === 'operations'
  );

  if (growthSignals.length === 0 || serviceModelSignals.length === 0) return null;

  const constituentSignals = [...growthSignals, ...serviceModelSignals];

  return makeTension(companyId, {
    type: 'vision_vs_execution',
    title: 'Scalability claim vs service dependency',
    statement:
      "The company's growth narrative implies scalable technology leverage, but delivery " +
      'appears to require proportional human scaling. Hiring patterns and case study ' +
      'evidence suggest each new customer engagement demands significant implementation ' +
      'resources.',
    signals: constituentSignals,
    confidence: 'medium',
    severity: 'medium',
    strategic_relevance: 'high',
  });
}

/**
 * Template 5: credibility_vs_claim (nice to detect)
 * Stated investment priorities (engineering/AI) vs observable hiring
 * (services/implementation).
 */
function detectCredibilityVsClaim(signals: Signal[], companyId: string): Tension | null {
  const fundingNarrativeSignals = signals.filter(s =>
    hasAnyTag(s, ['funding']) && hasAnyTag(s, ['narrative_gap'])
  );
  const hiringSignals = signals.filter(s =>
    hasAnyTag(s, ['hiring_signal']) && s.kind === 'talent'
  );

  if (fundingNarrativeSignals.length === 0 || hiringSignals.length === 0) return null;

  const constituentSignals = [...fundingNarrativeSignals, ...hiringSignals];

  return makeTension(companyId, {
    type: 'credibility_vs_claim',
    title: 'AI investment narrative vs services hiring pattern',
    statement:
      "Leadership's stated investment priorities emphasize AI engineering expansion, but " +
      'observable hiring activity concentrates in implementation, onboarding, and services ' +
      'roles rather than engineering or research positions.',
    signals: constituentSignals,
    confidence: 'medium',
    severity: 'medium',
    strategic_relevance: 'medium',
  });
}

/**
 * Template 6: positioning_vs_customer_base
 * Company positioning targets one market segment, but observable customer
 * evidence concentrates in a different segment.
 * Triggered by: positioning signals + customer segment concentration signals.
 */
function detectPositioningVsCustomerBase(signals: Signal[], companyId: string): Tension | null {
  const positioningSignals = signals.filter(s =>
    s.kind === 'positioning' && hasAnyTag(s, ['positioning_gap', 'narrative_gap'])
  );
  const customerSegmentSignals = signals.filter(s =>
    hasAnyTag(s, ['customer_concentration', 'segment_evidence', 'smb_signal']) &&
    (s.kind === 'customer' || s.kind === 'credibility')
  );

  if (positioningSignals.length === 0 || customerSegmentSignals.length === 0) return null;

  const constituentSignals = [...positioningSignals, ...customerSegmentSignals];

  return makeTension(companyId, {
    type: 'positioning_vs_customer_base',
    title: 'Enterprise positioning vs customer reality',
    statement:
      'The company positions itself for a market segment that does not match its observable ' +
      'customer base. Positioning language targets one segment, but customer evidence — ' +
      'case studies, reviews, and testimonials — consistently indicates adoption by a ' +
      'different segment.',
    signals: constituentSignals,
    confidence: constituentSignals.length >= 3 ? 'high' : 'medium',
    severity: 'high',
    strategic_relevance: 'high',
  });
}

/**
 * Template 7: ambition_vs_proof
 * Company ambition (visible in marketing, press, product emphasis) outpaces
 * observable proof (customer evidence, deal sizes, deployments).
 * Triggered by: positioning signals + pricing/hiring segment alignment signals.
 */
function detectAmbitionVsProof(signals: Signal[], companyId: string): Tension | null {
  const ambitionSignals = signals.filter(s =>
    s.kind === 'positioning' && hasAnyTag(s, ['positioning_gap', 'narrative_gap', 'positioning'])
  );
  const proofSignals = signals.filter(s =>
    hasAnyTag(s, ['segment_alignment', 'smb_signal']) &&
    (s.kind === 'pricing' || s.kind === 'talent')
  );

  if (ambitionSignals.length === 0 || proofSignals.length === 0) return null;

  const constituentSignals = [...ambitionSignals, ...proofSignals];

  return makeTension(companyId, {
    type: 'ambition_vs_proof',
    title: 'Ambition vs proof',
    statement:
      "The company's ambition is visible in marketing, press, and product feature emphasis. " +
      'However, observable evidence — pricing structure, hiring patterns, deal sizes — ' +
      'does not demonstrate the adoption or scale implied by the positioning. ' +
      'Ambition outpaces demonstrated capability.',
    signals: constituentSignals,
    confidence: constituentSignals.length >= 3 ? 'high' : 'medium',
    severity: 'high',
    strategic_relevance: 'high',
  });
}

/**
 * Template 8: narrative_scale_vs_operations
 * Marketing language speaks to one scale, but operational signals —
 * hiring, pricing, CS structure — indicate a different scale.
 * Triggered by: positioning signals + hiring segment + pricing segment signals.
 */
function detectNarrativeScaleVsOperations(signals: Signal[], companyId: string): Tension | null {
  const narrativeSignals = signals.filter(s =>
    s.kind === 'positioning' && hasAnyTag(s, ['positioning_gap', 'narrative_gap'])
  );
  const operationalSignals = signals.filter(s =>
    hasAnyTag(s, ['segment_alignment', 'hiring_signal']) &&
    (s.kind === 'talent' || s.kind === 'pricing') &&
    hasAnyTag(s, ['smb_signal'])
  );

  if (narrativeSignals.length === 0 || operationalSignals.length === 0) return null;

  const constituentSignals = [...narrativeSignals, ...operationalSignals];

  return makeTension(companyId, {
    type: 'narrative_scale_vs_operations',
    title: 'Narrative scale vs operational evidence',
    statement:
      'Marketing language targets one scale of customer, but operational signals — ' +
      'sales team structure, customer success portfolios, pricing tiers, and deal sizes — ' +
      'are structured for a different scale. The narrative and the operating model ' +
      'appear to target different market segments.',
    signals: constituentSignals,
    confidence: 'medium',
    severity: 'medium',
    strategic_relevance: 'high',
  });
}

/**
 * Template 9: positioning_vs_market_fit
 * Company positions against one competitive set, but customers describe
 * value in terms that align with a different competitive set.
 * Triggered by: customer language signals with segment_perception + positioning signals.
 */
function detectPositioningVsMarketFit(signals: Signal[], companyId: string): Tension | null {
  const customerPerceptionSignals = signals.filter(s =>
    s.kind === 'customer' && hasAnyTag(s, ['segment_perception', 'buyer_language', 'positioning_gap'])
  );
  const positioningSignals = signals.filter(s =>
    s.kind === 'positioning' && hasAnyTag(s, ['positioning_gap', 'narrative_gap'])
  );

  if (customerPerceptionSignals.length === 0 || positioningSignals.length === 0) return null;

  const constituentSignals = [...customerPerceptionSignals, ...positioningSignals];

  return makeTension(companyId, {
    type: 'positioning_vs_market_fit',
    title: 'Positioning vs market fit',
    statement:
      "The company's positioning targets one market segment, but customer language " +
      'describes value in terms that align with a different segment. Customers perceive ' +
      'the product in a competitive frame that differs from the company\'s intended ' +
      'positioning, suggesting product-market fit may be in a different segment than claimed.',
    signals: constituentSignals,
    confidence: 'medium',
    severity: 'medium',
    strategic_relevance: 'high',
  });
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/** Collapse tensions with >70% signal_id overlap. */
function deduplicateTensions(tensions: Tension[]): Tension[] {
  const result: Tension[] = [];
  for (const tension of tensions) {
    const isDuplicate = result.some(existing => {
      const overlapCount = tension.signal_ids.filter(id =>
        existing.signal_ids.includes(id),
      ).length;
      const maxLen = Math.max(tension.signal_ids.length, existing.signal_ids.length);
      if (maxLen === 0) return false;
      return overlapCount / maxLen > 0.7;
    });

    if (!isDuplicate) {
      result.push(tension);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export function detectTensions(signals: Signal[]): Tension[] {
  _counter = 0;
  if (signals.length === 0) return [];

  const companyId = signals[0].company_id;

  const candidates = [
    detectAutomationVsService(signals, companyId),
    detectClaimVsReality(signals, companyId),
    detectPositioningVsDelivery(signals, companyId),
    detectVisionVsExecution(signals, companyId),
    detectCredibilityVsClaim(signals, companyId),
    detectPositioningVsCustomerBase(signals, companyId),
    detectAmbitionVsProof(signals, companyId),
    detectNarrativeScaleVsOperations(signals, companyId),
    detectPositioningVsMarketFit(signals, companyId),
  ].filter((t): t is Tension => t !== null);

  return deduplicateTensions(candidates);
}
