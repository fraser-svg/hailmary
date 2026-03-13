/**
 * Stage 1: Extract Signals
 *
 * Converts dossier claims into analytical observations.
 * Signals are observational, evidence-backed, and non-explanatory.
 * They form the raw material for tension/pattern detection downstream.
 *
 * V1: Deterministic extraction passes over dossier sections.
 * No LLM calls. No external data.
 */

import type { Dossier } from '../../types/index.js';
import type { Confidence } from '../../types/evidence.js';

// ---------------------------------------------------------------------------
// Signal type (per spec 002-extract-signals)
// ---------------------------------------------------------------------------

export type SignalCategory =
  | 'positioning' | 'product' | 'gtm' | 'customer'
  | 'leadership' | 'talent' | 'pricing' | 'market'
  | 'credibility' | 'operations' | 'risk' | 'other';

export type InferenceLabel = 'direct' | 'light_inference' | 'strong_inference';

export interface Signal {
  signal_id: string;
  company_id: string;
  kind: SignalCategory;
  title: string;
  statement: string;
  claim_ids: string[];
  evidence_ids: string[];
  source_ids: string[];
  inference_label: InferenceLabel;
  confidence: Confidence;
  relevance: Confidence;
  novelty: Confidence;
  polarity: 'positive' | 'negative' | 'neutral' | 'mixed';
  tags: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _counter = 0;

function nextId(): string {
  return `sig_${String(++_counter).padStart(3, '0')}`;
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

function resolveSourceIds(dossier: Dossier, evidenceIds: string[]): string[] {
  const lookup = new Map(dossier.evidence.map(e => [e.evidence_id, e.source_id]));
  return unique(evidenceIds.map(id => lookup.get(id)).filter((s): s is string => !!s));
}

function makeSignal(
  companyId: string,
  dossier: Dossier,
  opts: {
    kind: SignalCategory;
    title: string;
    statement: string;
    evidence_ids: string[];
    claim_ids?: string[];
    inference_label: InferenceLabel;
    confidence: Confidence;
    relevance: Confidence;
    novelty: Confidence;
    polarity: Signal['polarity'];
    tags: string[];
  },
): Signal {
  const evIds = unique(opts.evidence_ids);
  return {
    signal_id: nextId(),
    company_id: companyId,
    kind: opts.kind,
    title: opts.title,
    statement: opts.statement,
    claim_ids: unique(opts.claim_ids ?? []),
    evidence_ids: evIds,
    source_ids: resolveSourceIds(dossier, evIds),
    inference_label: opts.inference_label,
    confidence: opts.confidence,
    relevance: opts.relevance,
    novelty: opts.novelty,
    polarity: opts.polarity,
    tags: opts.tags,
  };
}

// ---------------------------------------------------------------------------
// Extraction passes
// ---------------------------------------------------------------------------

/**
 * Pass 1: Narrative gap — company automation claims vs customer delivery experience.
 * Looks at narrative_intelligence for divergence between claimed and expressed value.
 */
function extractNarrativeGapSignals(dossier: Dossier, companyId: string): Signal[] {
  const ni = dossier.narrative_intelligence;
  if (ni.company_claimed_value.length === 0 || ni.customer_expressed_value.length === 0) return [];
  if (ni.narrative_gaps.length === 0) return [];

  const signals: Signal[] = [];

  for (const gap of ni.narrative_gaps) {
    if (gap.company_language.length === 0 || gap.customer_language.length === 0) continue;

    const companyExamples = ni.company_claimed_value.flatMap(c => c.language_examples);
    const customerExamples = ni.customer_expressed_value.flatMap(c => c.language_examples);
    const claimEvidence = ni.company_claimed_value.flatMap(c => c.evidence_ids);
    const customerEvidence = ni.customer_expressed_value.flatMap(c => c.evidence_ids);

    signals.push(makeSignal(companyId, dossier, {
      kind: 'positioning',
      title: `${ni.company_claimed_value[0]?.theme ?? 'Company'} narrative stronger than observable delivery automation`,
      statement: `Marketing materials emphasize ${companyExamples[0] ?? 'automation'}, but customer feedback describes ${customerExamples[0]?.toLowerCase() ?? 'human involvement'} during implementation and setup.`,
      evidence_ids: [...claimEvidence, ...customerEvidence],
      claim_ids: claimEvidence,
      inference_label: 'light_inference',
      confidence: gap.confidence,
      relevance: 'high',
      novelty: 'medium',
      polarity: 'mixed',
      tags: ['narrative_gap', 'automation', 'positioning'],
    }));
  }

  return signals;
}

/**
 * Pass 2: Customer language patterns — what customers credit for value.
 * Looks at customer_expressed_value and customer_language_patterns.
 */
function extractCustomerLanguageSignals(dossier: Dossier, companyId: string): Signal[] {
  const ni = dossier.narrative_intelligence;
  if (ni.customer_language_patterns.length === 0 && ni.customer_expressed_value.length === 0) return [];

  const signals: Signal[] = [];

  // Customer attribution pattern
  for (const pattern of ni.customer_language_patterns) {
    const custEvidence = ni.customer_expressed_value.flatMap(v => v.evidence_ids);
    const allEvidence = unique([...pattern.evidence_ids, ...custEvidence]);

    signals.push(makeSignal(companyId, dossier, {
      kind: 'customer',
      title: 'Customer language credits human support over product automation',
      statement: `Across multiple review platforms, customers attribute value to onboarding specialists and human consultants rather than to autonomous product capability. ${pattern.pattern}.`,
      evidence_ids: allEvidence,
      inference_label: 'direct',
      confidence: 'medium',
      relevance: 'high',
      novelty: 'medium',
      polarity: 'mixed',
      tags: ['customer_voice', 'service_dependency', 'buyer_language'],
    }));
  }

  return signals;
}

/**
 * Pass 3: Hiring signals — disproportionate services hiring.
 * Looks at gtm_model.hiring_signals for patterns.
 */
function extractHiringSignals(dossier: Dossier, companyId: string): Signal[] {
  const hiring = dossier.gtm_model.hiring_signals;
  if (hiring.length === 0) return [];

  const allEvidence = unique(hiring.flatMap(h => h.evidence_ids));
  const totalRoles = hiring.length;

  // Check for services-heavy hiring concentration
  const servicesRoles = hiring.filter(h =>
    /implementation|onboarding|solutions|services|consulting/i.test(h.role_title + ' ' + h.department)
  );

  if (servicesRoles.length === 0) return [];

  // Look for headcount context in evidence
  let headcountNote = '';
  for (const evId of allEvidence) {
    const ev = dossier.evidence.find(e => e.evidence_id === evId);
    if (ev?.normalized_fields?.['total_services_openings'] && ev?.normalized_fields?.['company_headcount']) {
      headcountNote = ` ${ev.normalized_fields['total_services_openings']} open services-oriented roles at a ${ev.normalized_fields['company_headcount']}-person company.`;
      break;
    }
  }

  return [makeSignal(companyId, dossier, {
    kind: 'talent',
    title: 'Implementation and services hiring disproportionate to company size',
    statement: `Hiring activity skews heavily toward implementation, onboarding, and services roles rather than engineering.${headcountNote} ${totalRoles} hiring signals indicate scaling of human delivery capacity.`,
    evidence_ids: allEvidence,
    inference_label: 'direct',
    confidence: 'high',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'neutral',
    tags: ['hiring_signal', 'service_scaling', 'operations'],
  })];
}

/**
 * Pass 4: Pricing structure — mandatory service/implementation fees.
 * Looks at product_and_offer.pricing_model and pricing_signals.
 */
function extractPricingSignals(dossier: Dossier, companyId: string): Signal[] {
  const po = dossier.product_and_offer;
  const pm = po.pricing_model;
  if (!pm.details) return [];

  const signals: Signal[] = [];
  const hasServiceFee = /onboarding|implementation|service|fee/i.test(pm.details);

  if (hasServiceFee) {
    signals.push(makeSignal(companyId, dossier, {
      kind: 'pricing',
      title: 'Pricing structure includes mandatory implementation service fees',
      statement: `${pm.details}. Mandatory fees for implementation suggest setup is not self-serve despite automation positioning.`,
      evidence_ids: pm.evidence_ids,
      inference_label: 'direct',
      confidence: 'high',
      relevance: 'high',
      novelty: 'medium',
      polarity: 'neutral',
      tags: ['pricing', 'service_revenue', 'implementation_evidence'],
    }));
  }

  return signals;
}

/**
 * Pass 5: Case study analysis — consulting engagement evidence.
 * Looks at case_study_signals and case_study_record evidence.
 */
function extractCaseStudySignals(dossier: Dossier, companyId: string): Signal[] {
  const csSignals = dossier.customer_and_personas.case_study_signals;
  if (csSignals.length === 0) return [];

  // Find case_study_record evidence
  const csEvidence = dossier.evidence.filter(e => e.evidence_type === 'case_study_record');
  if (csEvidence.length === 0) return [];

  const evidenceIds = csEvidence.map(e => e.evidence_id);
  const consultingIndicators = csEvidence.filter(e =>
    /consult|engagement|week|implementation team|strategy session/i.test(e.excerpt + ' ' + e.summary)
  );

  if (consultingIndicators.length === 0) return [];

  const ev = consultingIndicators[0];
  const duration = ev.normalized_fields?.['engagement_duration'] ?? '';
  const durationNote = duration ? `a ${duration} ` : '';

  return [makeSignal(companyId, dossier, {
    kind: 'operations',
    title: 'Case study reveals consulting-style engagement model',
    statement: `Company-published case study describes ${durationNote}consulting engagement with implementation team involvement and strategy sessions — a service model rather than a product-led model.`,
    evidence_ids: evidenceIds,
    inference_label: 'light_inference',
    confidence: 'high',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'neutral',
    tags: ['service_model', 'consulting', 'implementation_evidence'],
  })];
}

/**
 * Pass 6: Internal perception — employee evidence contradicting external narrative.
 * Looks for employee/culture evidence that diverges from company positioning.
 */
function extractInternalPerceptionSignals(dossier: Dossier, companyId: string): Signal[] {
  const employeeEvidence = dossier.evidence.filter(e =>
    e.tags.some(t => /employee|culture|internal/i.test(t)) ||
    e.evidence_type === 'customer_language_record' && /employee|internal/i.test(e.excerpt)
  );

  if (employeeEvidence.length === 0) return [];

  // Check for narrative gap between internal and external
  const hasNarrativeGap = employeeEvidence.some(e =>
    e.tags.includes('narrative_gap') ||
    /internal.*external|external.*internal|consulting company|services company/i.test(e.excerpt + ' ' + e.summary)
  );

  if (!hasNarrativeGap) return [];

  const evidenceIds = employeeEvidence.map(e => e.evidence_id);

  return [makeSignal(companyId, dossier, {
    kind: 'credibility',
    title: 'Internal employee perception diverges from external company narrative',
    statement: `Employee evidence describes the organization differently from its external positioning. Internal characterization suggests a services-oriented operating model, while external narrative emphasizes technology-led automation.`,
    evidence_ids: evidenceIds,
    inference_label: 'strong_inference',
    confidence: 'medium',
    relevance: 'high',
    novelty: 'high',
    polarity: 'negative',
    tags: ['employee_voice', 'narrative_gap', 'culture_signal'],
  })];
}

/**
 * Pass 7: Funding narrative vs hiring reality.
 * Compares stated use of funds with observable hiring patterns.
 */
function extractFundingHiringMismatchSignals(dossier: Dossier, companyId: string): Signal[] {
  const pressEvidence = dossier.evidence.filter(e => e.evidence_type === 'press_record');
  const hiringEvidence = dossier.evidence.filter(e =>
    e.evidence_type === 'job_posting_record' || e.evidence_type === 'hiring_signal_record'
  );

  if (pressEvidence.length === 0 || hiringEvidence.length === 0) return [];

  // Check for stated investment priorities in press
  const statedPriority = pressEvidence.find(e =>
    /funds|investment|use of|engineering|product/i.test(e.excerpt + ' ' + e.summary)
  );
  if (!statedPriority) return [];

  // Check if hiring contradicts stated priority
  const servicesHiring = hiringEvidence.filter(e =>
    /implementation|onboarding|services|solutions/i.test(e.excerpt + ' ' + e.summary)
  );
  if (servicesHiring.length === 0) return [];

  const statedUse = statedPriority.normalized_fields?.['stated_use_of_funds'] ?? 'stated priorities';
  const evidenceIds = [statedPriority.evidence_id, ...servicesHiring.map(e => e.evidence_id)];

  return [makeSignal(companyId, dossier, {
    kind: 'operations',
    title: 'Stated use of funds contradicts observable hiring pattern',
    statement: `Leadership stated investment priority is ${statedUse}, but observable hiring activity concentrates in implementation and services roles rather than engineering.`,
    evidence_ids: evidenceIds,
    inference_label: 'light_inference',
    confidence: 'medium',
    relevance: 'high',
    novelty: 'high',
    polarity: 'negative',
    tags: ['funding', 'hiring_signal', 'narrative_gap'],
  })];
}

/**
 * Pass 8: Professional services as revenue stream.
 * Checks if implementation fees are significant relative to subscription.
 */
function extractServicesRevenueSignals(dossier: Dossier, companyId: string): Signal[] {
  const po = dossier.product_and_offer;
  const pricingSignals = po.pricing_signals;
  if (pricingSignals.length === 0) return [];

  // Check for signals indicating services revenue significance
  const revenueIndicators = pricingSignals.filter(s =>
    /substantial|significant|high|meaningful|revenue/i.test(s) ||
    /relative to|compared to/i.test(s)
  );

  if (revenueIndicators.length === 0) return [];

  return [makeSignal(companyId, dossier, {
    kind: 'pricing',
    title: 'Professional services fees indicate meaningful revenue stream',
    statement: `Implementation fees are substantial relative to subscription pricing, suggesting professional services function as a meaningful revenue stream rather than a cost center.`,
    evidence_ids: po.pricing_model.evidence_ids,
    inference_label: 'light_inference',
    confidence: 'medium',
    relevance: 'medium',
    novelty: 'medium',
    polarity: 'neutral',
    tags: ['pricing', 'service_revenue'],
  })];
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

function deduplicateSignals(signals: Signal[]): Signal[] {
  const seen = new Set<string>();
  return signals.filter(signal => {
    // Key on normalized title — different observations from the same evidence are kept,
    // but stylistically identical signals are collapsed.
    const key = signal.title.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export function extractSignals(dossier: Dossier): Signal[] {
  _counter = 0;
  const companyId = dossier.company_input.primary_domain;

  const raw = [
    ...extractNarrativeGapSignals(dossier, companyId),
    ...extractCustomerLanguageSignals(dossier, companyId),
    ...extractHiringSignals(dossier, companyId),
    ...extractPricingSignals(dossier, companyId),
    ...extractCaseStudySignals(dossier, companyId),
    ...extractInternalPerceptionSignals(dossier, companyId),
    ...extractFundingHiringMismatchSignals(dossier, companyId),
    ...extractServicesRevenueSignals(dossier, companyId),
  ];

  return deduplicateSignals(raw);
}
