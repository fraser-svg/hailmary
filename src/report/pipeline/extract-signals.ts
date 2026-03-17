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
 * Pass 1: Narrative gap — company claims vs customer evidence divergence.
 * Looks at narrative_intelligence for divergence between claimed and expressed value.
 * Generalized: uses actual gap language from the dossier, not hardcoded themes.
 */
function extractNarrativeGapSignals(dossier: Dossier, companyId: string): Signal[] {
  const ni = dossier.narrative_intelligence;
  if (ni.company_claimed_value.length === 0 || ni.customer_expressed_value.length === 0) return [];
  if (ni.narrative_gaps.length === 0) return [];

  const signals: Signal[] = [];

  for (const gap of ni.narrative_gaps) {
    if (gap.company_language.length === 0 || gap.customer_language.length === 0) continue;

    const claimEvidence = ni.company_claimed_value.flatMap(c => c.evidence_ids);
    const customerEvidence = ni.customer_expressed_value.flatMap(c => c.evidence_ids);

    signals.push(makeSignal(companyId, dossier, {
      kind: 'positioning',
      title: `Narrative gap: ${gap.gap_name}`,
      statement: `${gap.gap_description}. Company language emphasizes ${gap.company_language.slice(0, 2).join(', ')}, while customer language describes ${gap.customer_language.slice(0, 2).join(', ')}.`,
      evidence_ids: [...claimEvidence, ...customerEvidence],
      claim_ids: claimEvidence,
      inference_label: 'light_inference',
      confidence: gap.confidence,
      relevance: 'high',
      novelty: 'medium',
      polarity: 'mixed',
      tags: ['narrative_gap', 'positioning', 'positioning_gap'],
    }));
  }

  return signals;
}

/**
 * Pass 2: Customer language patterns — what customers credit for value.
 * Looks at customer_expressed_value and customer_language_patterns.
 * Generalized: uses actual pattern text from the dossier to build the signal.
 */
function extractCustomerLanguageSignals(dossier: Dossier, companyId: string): Signal[] {
  const ni = dossier.narrative_intelligence;
  if (ni.customer_language_patterns.length === 0 && ni.customer_expressed_value.length === 0) return [];

  const signals: Signal[] = [];

  for (const pattern of ni.customer_language_patterns) {
    const custEvidence = ni.customer_expressed_value.flatMap(v => v.evidence_ids);
    const allEvidence = unique([...pattern.evidence_ids, ...custEvidence]);
    const customerTheme = ni.customer_expressed_value[0]?.theme ?? 'customer perception';

    // Determine tags dynamically based on pattern content
    const patternText = pattern.pattern.toLowerCase();
    const tags: string[] = ['customer_voice', 'buyer_language'];
    if (/human|support|consult|onboarding/i.test(patternText)) {
      tags.push('service_dependency');
    }
    if (/small.team|smb|not.*(enterprise|platform)|startup/i.test(patternText)) {
      tags.push('segment_perception', 'positioning_gap');
    }
    if (/founder|ceo|personal/i.test(patternText)) {
      tags.push('founder_dependency');
    }

    signals.push(makeSignal(companyId, dossier, {
      kind: 'customer',
      title: `Customer language diverges from company positioning toward ${customerTheme}`,
      statement: `${pattern.interpretation}. Customer language patterns suggest a different value perception than the company narrative implies.`,
      evidence_ids: allEvidence,
      inference_label: 'direct',
      confidence: 'medium',
      relevance: 'high',
      novelty: 'medium',
      polarity: 'mixed',
      tags,
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

/**
 * Pass 9: Customer segment concentration.
 * Detects when observable customer evidence clusters in a narrow segment.
 * Examines case_study_signals, case_study_record evidence, and review_record evidence.
 */
function extractCustomerSegmentSignals(dossier: Dossier, companyId: string): Signal[] {
  const csSignals = dossier.customer_and_personas.case_study_signals;
  const customerEvidence = dossier.evidence.filter(e =>
    e.evidence_type === 'case_study_record' ||
    e.evidence_type === 'review_record' ||
    e.evidence_type === 'testimonial_record'
  );
  if (customerEvidence.length === 0) return [];

  // Look for customer size data in normalized_fields
  const sizes: number[] = [];
  const evidenceIds: string[] = [];
  for (const ev of customerEvidence) {
    const size = ev.normalized_fields?.['customer_size']
      ?? ev.normalized_fields?.['reviewer_team_size']
      ?? ev.normalized_fields?.['reviewer_company_size'];
    if (typeof size === 'number') {
      sizes.push(size);
      evidenceIds.push(ev.evidence_id);
    }
  }

  if (sizes.length < 2) return [];

  // Check if all observable customers are small (under a threshold)
  const maxSize = Math.max(...sizes);
  const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;

  if (maxSize > 50) return []; // Not a clear small-org concentration

  const sizeDescriptions = sizes.sort((a, b) => a - b).join(', ');

  return [makeSignal(companyId, dossier, {
    kind: 'customer',
    title: 'Customer base skewed toward small organizations',
    statement: `All identifiable customers are small organizations with team sizes of ${sizeDescriptions} employees (average ${Math.round(avgSize)}). No customer with more than ${maxSize} employees is observable in available evidence.`,
    evidence_ids: unique(evidenceIds),
    inference_label: 'direct',
    confidence: sizes.length >= 3 ? 'high' : 'medium',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'neutral',
    tags: ['customer_concentration', 'segment_evidence', 'smb_signal'],
  })];
}

/**
 * Pass 10: Pricing-segment alignment.
 * Detects when pricing_signals reveal market segment targeting.
 * Looks at pricing_signals for segment indicators (SMB, mid-market, enterprise).
 */
function extractPricingSegmentSignals(dossier: Dossier, companyId: string): Signal[] {
  const pricingSignals = dossier.product_and_offer.pricing_signals;
  if (pricingSignals.length === 0) return [];

  // Look for segment-indicating patterns in pricing signals
  const segmentIndicators = pricingSignals.filter(s =>
    /small.team|smb|mid.market|self.serve|low.entry|user.cap|starter/i.test(s)
  );

  if (segmentIndicators.length === 0) return [];

  return [makeSignal(companyId, dossier, {
    kind: 'pricing',
    title: 'Pricing tiers align with SMB or mid-market adoption',
    statement: `Pricing structure indicates targeting of smaller organizations. ${segmentIndicators.join('. ')}.`,
    evidence_ids: dossier.product_and_offer.pricing_model.evidence_ids,
    inference_label: 'direct',
    confidence: 'high',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'neutral',
    tags: ['pricing', 'segment_alignment', 'smb_signal'],
  })];
}

/**
 * Pass 11: Hiring-segment signal.
 * Detects when hiring signals explicitly target a specific market segment,
 * particularly when the segment differs from positioning.
 */
function extractHiringSegmentSignals(dossier: Dossier, companyId: string): Signal[] {
  const hiring = dossier.gtm_model.hiring_signals;
  if (hiring.length === 0) return [];

  // Look for explicit segment labels in hiring signals
  const segmentRoles = hiring.filter(h => {
    const text = `${h.role_title} ${h.signal} ${h.department}`;
    return /smb|small.business|mid.market|velocity|high.volume/i.test(text);
  });

  if (segmentRoles.length === 0) return [];

  const allEvidence = unique(segmentRoles.flatMap(h => h.evidence_ids));
  const roleDescriptions = segmentRoles.map(h => h.signal).join('. ');

  // Look for deal size or portfolio data
  let dealContext = '';
  for (const evId of allEvidence) {
    const ev = dossier.evidence.find(e => e.evidence_id === evId);
    if (ev?.normalized_fields?.['deal_size_range']) {
      dealContext += ` Deal sizes target ${ev.normalized_fields['deal_size_range']}.`;
    }
    if (ev?.normalized_fields?.['portfolio_size']) {
      dealContext += ` Account portfolios of ${ev.normalized_fields['portfolio_size']} suggest high-volume model.`;
    }
  }

  return [makeSignal(companyId, dossier, {
    kind: 'talent',
    title: 'Hiring signals emphasize SMB sales motion',
    statement: `Sales and customer success hiring explicitly targets SMB segment. ${roleDescriptions}.${dealContext}`,
    evidence_ids: allEvidence,
    inference_label: 'direct',
    confidence: 'high',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'neutral',
    tags: ['hiring_signal', 'segment_alignment', 'smb_signal'],
  })];
}

/**
 * Pass 12: Positioning-evidence credibility gap.
 * Detects absence of proof for positioning claims using value_alignment_summary.
 */
function extractPositioningCredibilityGapSignals(dossier: Dossier, companyId: string): Signal[] {
  const ni = dossier.narrative_intelligence;
  const vas = ni.value_alignment_summary ?? [];
  if (vas.length === 0) return [];

  // Look for divergent alignment themes
  const divergent = vas.filter(v => v.alignment === 'divergent' || v.alignment === 'company_only');
  if (divergent.length === 0) return [];

  const allEvidence = unique(divergent.flatMap(v => v.evidence_ids));
  const themeLabels = divergent.map(v => v.theme);

  return [makeSignal(companyId, dossier, {
    kind: 'credibility',
    title: 'Positioning claims lack supporting customer evidence',
    statement: `Value alignment analysis reveals ${divergent.length} divergent theme(s) between positioning and customer perception: ${themeLabels.join(', ')}.`,
    evidence_ids: allEvidence,
    inference_label: 'light_inference',
    confidence: 'medium',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['positioning_gap', 'credibility', 'segment_evidence'],
  })];
}

/**
 * Pass 13: Founder visibility dominance.
 * Detects when a single founder/leader dominates all external-facing content,
 * marketing, and public communications.
 */
function extractFounderVisibilitySignals(dossier: Dossier, companyId: string): Signal[] {
  const gtm = dossier.gtm_model;
  const hooks = gtm.content_and_positioning_hooks;
  const observations = gtm.gtm_observations;
  const allText = [...hooks, ...observations].join(' ');

  // Check for founder-centric content patterns
  const founderMentions = (allText.match(/founder|ceo|personally|personal brand/gi) ?? []).length;
  if (founderMentions < 2) return [];

  // Gather evidence from press, blog, and company profile
  const pressEvidence = dossier.evidence.filter(e =>
    e.tags.some(t => /founder_narrative|founder_concentration|thought_leadership/i.test(t))
  );
  if (pressEvidence.length === 0) return [];

  const evidenceIds = pressEvidence.map(e => e.evidence_id);

  // Check for content exclusivity (all content by one person)
  const contentExclusive = pressEvidence.some(e =>
    e.normalized_fields?.['other_authors'] === 0 ||
    e.normalized_fields?.['other_presenters'] === 0 ||
    e.normalized_fields?.['team_mentions'] === 0
  );

  return [makeSignal(companyId, dossier, {
    kind: 'positioning',
    title: 'Founder visibility dominates company narrative and external communications',
    statement: `The founder is prominently featured across external-facing content. ${contentExclusive ? 'All published content appears to be authored or presented exclusively by the founder. ' : ''}Marketing language and press coverage consistently center the company's identity around a single individual rather than institutional capability.`,
    evidence_ids: evidenceIds,
    inference_label: 'direct',
    confidence: pressEvidence.length >= 3 ? 'high' : 'medium',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'neutral',
    tags: ['founder_visibility', 'founder_concentration', 'narrative_gap'],
  })];
}

/**
 * Pass 14: Founder central to customer relationships.
 * Detects when customers attribute value to the founder personally.
 */
function extractFounderCustomerSignals(dossier: Dossier, companyId: string): Signal[] {
  const customerEvidence = dossier.evidence.filter(e =>
    (e.evidence_type === 'review_record' || e.evidence_type === 'case_study_record') &&
    (e.normalized_fields?.['founder_referenced_by_name'] === true ||
     e.normalized_fields?.['founder_led_implementation'] === true ||
     e.normalized_fields?.['value_attribution'] === 'founder_personal' ||
     e.tags.some(t => /founder_involvement|founder_dependency/i.test(t)))
  );

  if (customerEvidence.length < 2) return [];

  const evidenceIds = customerEvidence.map(e => e.evidence_id);

  return [makeSignal(companyId, dossier, {
    kind: 'customer',
    title: 'Founder appears central to customer relationships and value delivery',
    statement: `Customers describe the founder as their primary point of contact and attribute value to the founder's personal involvement. ${customerEvidence.length} customer evidence records reference the founder directly in the context of implementation, setup, or ongoing engagement.`,
    evidence_ids: evidenceIds,
    inference_label: 'direct',
    confidence: customerEvidence.length >= 3 ? 'high' : 'medium',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'neutral',
    tags: ['founder_dependency', 'customer_voice', 'founder_involvement'],
  })];
}

/**
 * Pass 15: Leadership depth.
 * Detects when leadership team is thin — single executive with only junior staff.
 */
function extractLeadershipDepthSignals(dossier: Dossier, companyId: string): Signal[] {
  const leadership = dossier.company_profile.leadership;
  if (leadership.length > 1) return []; // Multiple leaders → not thin

  // Look for team structure evidence
  const teamEvidence = dossier.evidence.filter(e =>
    e.tags.some(t => /leadership_depth|team_structure/i.test(t)) ||
    (e.normalized_fields?.['senior_leaders'] !== undefined && (e.normalized_fields['senior_leaders'] as number) <= 1)
  );

  if (teamEvidence.length === 0) return [];

  // Check for missing roles
  const missingRoles = teamEvidence.flatMap(e =>
    (e.normalized_fields?.['missing_roles'] as string[] | undefined) ?? []
  );

  const evidenceIds = teamEvidence.map(e => e.evidence_id);

  // Also include hiring evidence that confirms no senior hires
  const hiringEvidence = dossier.evidence.filter(e =>
    e.evidence_type === 'job_posting_record' &&
    e.normalized_fields?.['senior_roles'] === 0
  );
  evidenceIds.push(...hiringEvidence.map(e => e.evidence_id));

  return [makeSignal(companyId, dossier, {
    kind: 'talent',
    title: 'Observable senior leadership limited to a single executive',
    statement: `The leadership structure appears thin beyond one individual. Only ${leadership.length} executive-level role is listed, with remaining staff at individual contributor titles.${missingRoles.length > 0 ? ` No ${missingRoles.slice(0, 3).join(', ')} observed.` : ''} Institutional depth appears limited based on observable evidence.`,
    evidence_ids: unique(evidenceIds),
    inference_label: 'direct',
    confidence: 'high',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'neutral',
    tags: ['leadership_depth', 'founder_concentration', 'institutional_gap'],
  })];
}

/**
 * Pass 16: Junior hiring pattern.
 * Detects when all open positions are junior/entry-level with no senior leadership hires.
 */
function extractJuniorHiringSignals(dossier: Dossier, companyId: string): Signal[] {
  const hiring = dossier.gtm_model.hiring_signals;
  if (hiring.length === 0) return [];

  const hiringEvidence = dossier.evidence.filter(e =>
    (e.evidence_type === 'job_posting_record' || e.evidence_type === 'hiring_signal_record') &&
    e.normalized_fields?.['senior_roles'] === 0
  );

  if (hiringEvidence.length === 0) return [];

  // Check if all roles are junior
  const allJunior = hiringEvidence.every(e =>
    (e.normalized_fields?.['seniority'] === 'junior' || e.normalized_fields?.['junior_roles'] !== undefined) &&
    e.normalized_fields?.['senior_roles'] === 0
  );

  if (!allJunior) return [];

  const totalOpenings = hiringEvidence.reduce(
    (sum, e) => sum + ((e.normalized_fields?.['total_openings'] as number) ?? (e.normalized_fields?.['role_count'] as number) ?? 0),
    0,
  );

  const evidenceIds = hiringEvidence.map(e => e.evidence_id);

  return [makeSignal(companyId, dossier, {
    kind: 'talent',
    title: 'Hiring signals emphasize junior operational roles with no senior leadership',
    statement: `All ${totalOpenings} open positions are junior individual contributor roles. No senior leadership, management, or executive-level positions are being recruited. Hiring pattern suggests staff augmentation rather than leadership expansion.`,
    evidence_ids: evidenceIds,
    inference_label: 'direct',
    confidence: 'high',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'neutral',
    tags: ['hiring_signal', 'leadership_depth', 'junior_hiring', 'founder_concentration'],
  })];
}

/**
 * Pass 17: Thought leadership concentration.
 * Detects when all published content (blog, webinars) is by a single person.
 */
function extractThoughtLeadershipConcentrationSignals(dossier: Dossier, companyId: string): Signal[] {
  const contentEvidence = dossier.evidence.filter(e =>
    e.tags.some(t => /thought_leadership|content_strategy/i.test(t)) &&
    (e.normalized_fields?.['other_authors'] === 0 || e.normalized_fields?.['other_presenters'] === 0)
  );

  if (contentEvidence.length === 0) return [];

  const evidenceIds = contentEvidence.map(e => e.evidence_id);
  const totalContent = contentEvidence.reduce(
    (sum, e) => sum + ((e.normalized_fields?.['total_articles'] as number) ?? 0) + ((e.normalized_fields?.['total_webinars'] as number) ?? 0),
    0,
  );

  return [makeSignal(companyId, dossier, {
    kind: 'positioning',
    title: 'Thought leadership concentrated in a single voice',
    statement: `All published content${totalContent > 0 ? ` (${totalContent} pieces)` : ''} is authored or presented by a single individual. No guest contributors, team authors, or other company voices appear in any published content. The company's thought leadership is exclusively one person's voice.`,
    evidence_ids: evidenceIds,
    inference_label: 'direct',
    confidence: 'high',
    relevance: 'medium',
    novelty: 'medium',
    polarity: 'neutral',
    tags: ['thought_leadership', 'founder_concentration', 'content_strategy'],
  })];
}

/**
 * Pass 18: Press founder framing.
 * Detects when press coverage frames the company around the founder's persona.
 */
function extractPressFounderFramingSignals(dossier: Dossier, companyId: string): Signal[] {
  const pressEvidence = dossier.evidence.filter(e =>
    e.evidence_type === 'press_record' &&
    (e.normalized_fields?.['article_focus'] === 'founder profile' ||
     e.normalized_fields?.['team_mentions'] === 0 ||
     e.tags.some(t => /founder_narrative|institutional_gap/i.test(t)))
  );

  if (pressEvidence.length < 2) return [];

  const evidenceIds = pressEvidence.map(e => e.evidence_id);
  const framings = pressEvidence
    .map(e => e.normalized_fields?.['founder_framing'] as string | undefined)
    .filter((f): f is string => !!f);

  return [makeSignal(companyId, dossier, {
    kind: 'credibility',
    title: 'Press coverage frames company around founder persona',
    statement: `Press articles frame the company through the founder's personal narrative${framings.length > 0 ? ` (described as ${framings.join(', ')})` : ''}. No other team members are quoted or referenced in press coverage. The company's media identity appears inseparable from the founder's personal identity.`,
    evidence_ids: evidenceIds,
    inference_label: 'light_inference',
    confidence: 'medium',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'neutral',
    tags: ['press_coverage', 'founder_narrative', 'institutional_gap'],
  })];
}

/**
 * Pass 19: Open source / GitHub adoption signal.
 * Fires when evidence contains github_stars or an open-source license.
 * Emits one consolidated signal tagged with plg/open_source/github_adoption.
 */
function extractOpenSourceAdoptionSignals(dossier: Dossier, companyId: string): Signal[] {
  const matching = dossier.evidence.filter(e => {
    const hasStars = e.normalized_fields?.['github_stars'] !== undefined;
    const hasLicense = typeof e.normalized_fields?.['license'] === 'string' &&
      /apache|mit|gpl|bsd/i.test(e.normalized_fields['license'] as string);
    return hasStars || hasLicense;
  });

  if (matching.length === 0) return [];

  // Collect representative values for the statement
  let starCount: string | null = null;
  let license: string | null = null;
  for (const ev of matching) {
    if (ev.normalized_fields?.['github_stars'] && !starCount) {
      starCount = String(ev.normalized_fields['github_stars']);
    }
    if (typeof ev.normalized_fields?.['license'] === 'string' && !license) {
      license = ev.normalized_fields['license'] as string;
    }
  }

  const hasBoth = starCount !== null && license !== null;
  const parts: string[] = [];
  if (starCount) parts.push(`${starCount} GitHub stars`);
  if (license) parts.push(`${license} license`);

  return [makeSignal(companyId, dossier, {
    kind: 'gtm',
    title: 'Open source / GitHub adoption indicates developer-led distribution',
    statement: `${parts.join(' and ')}. Open source traction is the primary acquisition signal.`,
    evidence_ids: matching.map(e => e.evidence_id),
    inference_label: 'direct',
    confidence: hasBoth ? 'high' : 'medium',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'positive',
    tags: ['open_source', 'plg', 'github_adoption'],
  })];
}

/**
 * Pass 20: Explicit PLG / self-serve motion signal.
 * Fires when sales_motion_record or delivery_model_record evidence indicates PLG.
 * Emits one signal tagged self_serve/plg/product_led.
 */
function extractPlgMotionSignals(dossier: Dossier, companyId: string): Signal[] {
  const candidates = dossier.evidence.filter(e =>
    e.evidence_type === 'sales_motion_record' ||
    e.evidence_type === 'delivery_model_record',
  );
  if (candidates.length === 0) return [];

  const explicitPlg = candidates.filter(e =>
    e.normalized_fields?.['motion_type'] === 'PLG',
  );
  const textMatch = candidates.filter(e =>
    /self.serv|no.sales|free.tier|product.led|plg/i.test(e.excerpt + ' ' + (e.summary ?? '')),
  );

  const matching = explicitPlg.length > 0 ? explicitPlg : textMatch;
  if (matching.length === 0) return [];

  const isExplicit = explicitPlg.length > 0;

  // Collect explicit signals list if available
  const rawSignals = matching
    .flatMap(e => {
      const s = e.normalized_fields?.['signals'];
      return Array.isArray(s) ? s as string[] : [];
    })
    .slice(0, 3);
  const signalNote = rawSignals.length > 0
    ? ` Signals: ${rawSignals.join(', ')}.`
    : '';

  return [makeSignal(companyId, dossier, {
    kind: 'gtm',
    title: 'Product-led growth motion: self-serve, no sales required',
    statement: `Evidence indicates PLG distribution.${signalNote} Developer self-serve is the primary acquisition path.`,
    evidence_ids: matching.map(e => e.evidence_id),
    inference_label: isExplicit ? 'direct' : 'light_inference',
    confidence: isExplicit ? 'high' : 'medium',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'positive',
    tags: ['self_serve', 'plg', 'product_led'],
  })];
}

// ---------------------------------------------------------------------------
// Generalized passes for live acquisition data
// ---------------------------------------------------------------------------
// These passes work with the raw data that the corpus-to-dossier adapter
// produces (company_claimed_value, customer_expressed_value, evidence excerpts)
// rather than the highly structured fields (narrative_gaps, hiring_signals,
// customer_language_patterns, normalized_fields) that fixture dossiers have.
// They bridge the gap so the pipeline works on live-acquired data.

/**
 * Pass 21: Generalized narrative divergence.
 * Fires when company_claimed_value AND customer_expressed_value both exist.
 * Creates a positioning signal indicating potential claim/reality divergence.
 * This is a loosened version of Pass 1 that doesn't require structured narrative_gaps.
 */
function extractGeneralizedPositioningSignals(dossier: Dossier, companyId: string): Signal[] {
  const ni = dossier.narrative_intelligence;
  if (ni.company_claimed_value.length === 0) return [];

  const allEvidence = unique(ni.company_claimed_value.flatMap(c => c.evidence_ids));
  const hasCustomerEvidence = ni.customer_expressed_value.length > 0;

  const tags: string[] = ['positioning', 'company_claim'];
  if (hasCustomerEvidence) {
    tags.push('positioning_gap', 'narrative_gap');
  }

  return [makeSignal(companyId, dossier, {
    kind: 'positioning',
    title: 'Company positioning claims identified',
    statement: `Company makes ${ni.company_claimed_value.length} positioning claims across its web presence.${hasCustomerEvidence ? ' Customer evidence exists that may diverge from these claims.' : ''}`,
    evidence_ids: allEvidence,
    inference_label: 'direct',
    confidence: 'medium',
    relevance: 'high',
    novelty: 'low',
    polarity: hasCustomerEvidence ? 'mixed' : 'neutral',
    tags,
  })];
}

/**
 * Pass 22: Generalized customer evidence.
 * Fires when review_record evidence exists.
 * Creates a customer signal with buyer_language + segment_perception tags.
 */
function extractGeneralizedCustomerEvidenceSignals(dossier: Dossier, companyId: string): Signal[] {
  const reviewEvidence = dossier.evidence.filter(e =>
    e.evidence_type === 'review_record'
  );
  if (reviewEvidence.length === 0) return [];

  const evidenceIds = reviewEvidence.map(e => e.evidence_id);
  const allText = reviewEvidence.map(e => e.excerpt).join(' ');

  const tags: string[] = ['customer_voice', 'buyer_language'];

  if (/small.team|startup|indie|solo|individual|freelanc/i.test(allText)) {
    tags.push('segment_perception', 'segment_evidence', 'smb_signal');
  }
  if (/developer|engineer|dev.team|backend|frontend|devops/i.test(allText)) {
    tags.push('segment_perception');
  }

  const ni = dossier.narrative_intelligence;
  if (ni.company_claimed_value.length > 0) {
    tags.push('positioning_gap');
  }

  return [makeSignal(companyId, dossier, {
    kind: 'customer',
    title: 'Customer perception from reviews',
    statement: `${reviewEvidence.length} customer review(s) provide buyer perspective. Customer language may differ from company positioning.`,
    evidence_ids: evidenceIds,
    inference_label: 'direct',
    confidence: reviewEvidence.length >= 2 ? 'medium' : 'low',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'mixed',
    tags,
  })];
}

/**
 * Pass 23: PLG / developer tools detection from evidence text.
 * Scans all evidence excerpts for developer-oriented keywords.
 */
function extractDeveloperToolSignals(dossier: Dossier, companyId: string): Signal[] {
  const plgKeywords = /free.tier|free.forever|self.serv|open.source|github|npm|pip.install|API.first|developer.first|developers?.blog|SDK|CLI.tool|product.led|PLG|no.sales|download.free/i;

  // Only scan company-controlled evidence (site pages) — not reviews or press
  const companyEvidenceTypes = new Set([
    'company_description_record', 'pricing_record', 'product_record',
    'content_record', 'channel_record',
  ]);
  const matching = dossier.evidence.filter(e =>
    companyEvidenceTypes.has(e.evidence_type) && plgKeywords.test(e.excerpt)
  );
  if (matching.length === 0) return [];

  const evidenceIds = matching.map(e => e.evidence_id);

  return [makeSignal(companyId, dossier, {
    kind: 'gtm',
    title: 'Developer-oriented product with self-serve distribution',
    statement: `Evidence indicates a developer-focused product with self-serve or PLG distribution model. ${matching.length} evidence record(s) reference developer tools, open source, or self-serve patterns.`,
    evidence_ids: evidenceIds,
    inference_label: 'light_inference',
    confidence: matching.length >= 2 ? 'high' : 'medium',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'positive',
    tags: ['self_serve', 'plg', 'product_led', 'open_source'],
  })];
}

/**
 * Pass 24: Funding growth signal from evidence.
 */
function extractGeneralizedFundingSignals(dossier: Dossier, companyId: string): Signal[] {
  const fundingEvidence = dossier.evidence.filter(e =>
    e.evidence_type === 'funding_record'
  );
  if (fundingEvidence.length === 0) return [];

  const evidenceIds = fundingEvidence.map(e => e.evidence_id);
  const allText = fundingEvidence.map(e => e.excerpt).join(' ');

  const amountMatch = allText.match(/\$(\d+(?:\.\d+)?)\s*([MB])/i);
  const amountStr = amountMatch ? `$${amountMatch[1]}${amountMatch[2].toUpperCase()}` : '';

  return [makeSignal(companyId, dossier, {
    kind: 'operations',
    title: `Funding activity${amountStr ? ` (${amountStr})` : ''}`,
    statement: `Company has ${fundingEvidence.length} funding signal(s).${amountStr ? ` Most recent funding: ${amountStr}.` : ''} Growth ambition is observable.`,
    evidence_ids: evidenceIds,
    inference_label: 'direct',
    confidence: 'medium',
    relevance: 'medium',
    novelty: 'low',
    polarity: 'positive',
    tags: ['funding', 'growth_signal'],
  })];
}

/**
 * Pass 25: Pricing page transparency signal.
 * Detects free/starter tiers that indicate SMB/self-serve entry.
 */
function extractPricingPageSignals(dossier: Dossier, companyId: string): Signal[] {
  const po = dossier.product_and_offer;
  if (!po.pricing_model.is_public) return [];

  const text = po.pricing_model.details ?? '';
  if (!text) return [];

  const tags: string[] = ['pricing'];
  const evidenceIds = po.pricing_model.evidence_ids ?? [];

  const hasFreeEntry = /free|starter|hobby|trial|\$0/i.test(text);
  if (hasFreeEntry) {
    tags.push('segment_alignment', 'smb_signal', 'self_serve', 'plg');
  }

  return [makeSignal(companyId, dossier, {
    kind: 'pricing',
    title: 'Public pricing indicates market segment targeting',
    statement: `Company publishes pricing publicly.${hasFreeEntry ? ' Free/starter tier indicates self-serve PLG entry.' : ''}`,
    evidence_ids: evidenceIds,
    inference_label: 'direct',
    confidence: 'high',
    relevance: 'medium',
    novelty: 'low',
    polarity: 'neutral',
    tags,
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
    ...extractCustomerSegmentSignals(dossier, companyId),
    ...extractPricingSegmentSignals(dossier, companyId),
    ...extractHiringSegmentSignals(dossier, companyId),
    ...extractPositioningCredibilityGapSignals(dossier, companyId),
    ...extractFounderVisibilitySignals(dossier, companyId),
    ...extractFounderCustomerSignals(dossier, companyId),
    ...extractLeadershipDepthSignals(dossier, companyId),
    ...extractJuniorHiringSignals(dossier, companyId),
    ...extractThoughtLeadershipConcentrationSignals(dossier, companyId),
    ...extractPressFounderFramingSignals(dossier, companyId),
    ...extractOpenSourceAdoptionSignals(dossier, companyId),
    ...extractPlgMotionSignals(dossier, companyId),
    // Generalized passes for live acquisition data
    ...extractGeneralizedPositioningSignals(dossier, companyId),
    ...extractGeneralizedCustomerEvidenceSignals(dossier, companyId),
    ...extractDeveloperToolSignals(dossier, companyId),
    ...extractGeneralizedFundingSignals(dossier, companyId),
    ...extractPricingPageSignals(dossier, companyId),
  ];

  return deduplicateSignals(raw);
}
