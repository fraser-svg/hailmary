/**
 * Stage 6: Generate Implications
 *
 * Translates surviving hypotheses into strategic consequences.
 * Implications describe what may follow if a hypothesis is true.
 * They are conditional, not deterministic. Consequences, not recommendations.
 *
 * Only hypotheses with status "survives" generate implications.
 * Weak and discarded hypotheses are excluded.
 *
 * V1: Deterministic template-based generation over surviving Hypothesis[].
 * No LLM calls. No dossier inspection.
 */

import type { Signal } from './extract-signals.js';
import type { Tension } from './detect-tensions.js';
import type { Pattern } from './detect-patterns.js';
import type { Hypothesis } from './generate-hypotheses.js';
import type { Confidence } from '../../types/evidence.js';

// ---------------------------------------------------------------------------
// Implication types (per spec 007-generate-implications)
// ---------------------------------------------------------------------------

export type ImplicationType =
  | 'risk'
  | 'opportunity'
  | 'constraint'
  | 'tradeoff'
  | 'watchpoint'
  | 'structural';

export type Audience = 'founder' | 'executive' | 'investor' | 'operator' | 'candidate';

export type Horizon = 'immediate' | 'near_term' | 'mid_term' | 'structural';

export interface Implication {
  implication_id: string;
  company_id: string;
  hypothesis_id: string;
  title: string;
  statement: string;
  implication_type: ImplicationType;
  audience: Audience;
  horizon: Horizon;
  confidence: Confidence;
  urgency: Confidence;
  impact: Confidence;
  evidence_ids: string[];
  source_ids: string[];
  key_questions: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _counter = 0;

function nextId(): string {
  return `imp_${String(++_counter).padStart(3, '0')}`;
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

/** Check if text contains any of the given phrases (case-insensitive). */
function textContains(text: string, phrases: string[]): boolean {
  const lower = text.toLowerCase();
  return phrases.some(phrase => lower.includes(phrase.toLowerCase()));
}

function makeImplication(
  companyId: string,
  hyp: Hypothesis,
  opts: {
    title: string;
    statement: string;
    implication_type: ImplicationType;
    audience: Audience;
    horizon: Horizon;
    urgency: Confidence;
    impact: Confidence;
    key_questions: string[];
  },
): Implication {
  return {
    implication_id: nextId(),
    company_id: companyId,
    hypothesis_id: hyp.hypothesis_id,
    title: opts.title,
    statement: opts.statement,
    implication_type: opts.implication_type,
    audience: opts.audience,
    horizon: opts.horizon,
    confidence: hyp.confidence,
    urgency: opts.urgency,
    impact: opts.impact,
    evidence_ids: unique(hyp.evidence_ids),
    source_ids: unique(hyp.source_ids),
    key_questions: opts.key_questions,
  };
}

// ---------------------------------------------------------------------------
// Implication templates
// ---------------------------------------------------------------------------

/**
 * Template 1: Service scaling constraint
 *
 * Triggered by hypotheses about structural human delivery dependency.
 * If human delivery is structurally required, scaling revenue requires
 * scaling service capacity — creating a linear cost constraint.
 */
function implyServiceScalingConstraint(
  hyp: Hypothesis,
  companyId: string,
): Implication | null {
  const text = `${hyp.title} ${hyp.statement}`;

  if (!textContains(text, [
    'structurally required',
    'structural requirement',
  ])) return null;

  return makeImplication(companyId, hyp, {
    title: 'Scaling revenue may require scaling service capacity',
    statement:
      'If the current delivery model depends on human onboarding and implementation ' +
      'support as a structural requirement, revenue growth may require increasing ' +
      'service capacity rather than relying on product-led operational leverage. ' +
      'Each new customer cohort demands proportional human investment, producing ' +
      'linear cost scaling rather than the software-like leverage the platform ' +
      'positioning implies.',
    implication_type: 'constraint',
    audience: 'executive',
    horizon: 'near_term',
    urgency: 'high',
    impact: 'high',
    key_questions: [
      'What is the current ratio of implementation specialists to active customers?',
      'Can onboarding be partially automated without reducing customer outcomes?',
      'How does service capacity growth compare to revenue growth targets?',
    ],
  });
}

/**
 * Template 2: Operational leverage overstatement
 *
 * Triggered by hypotheses about automation narrative compensating for gaps.
 * If automation is incomplete, the company's unit economics may be closer
 * to professional services than SaaS.
 */
function implyOperationalLeverageOverstatement(
  hyp: Hypothesis,
  companyId: string,
): Implication | null {
  const text = `${hyp.title} ${hyp.statement}`;

  if (!textContains(text, [
    'automation narrative',
    'compensating',
    'automation-led positioning',
    'messaging fills the gap',
  ])) return null;

  return makeImplication(companyId, hyp, {
    title: 'Automation claims may overstate operational leverage',
    statement:
      'If the product cannot deliver autonomous value without significant human ' +
      'setup and implementation, the company\'s unit economics may be closer to a ' +
      'professional services firm than a SaaS platform. Gross margins, customer ' +
      'acquisition costs, and scalability projections may all be weaker than the ' +
      'automation narrative implies. Operational leverage may be overstated in ' +
      'investor materials and market positioning.',
    implication_type: 'risk',
    audience: 'investor',
    horizon: 'near_term',
    urgency: 'high',
    impact: 'high',
    key_questions: [
      'What percentage of customer deployments complete without human implementation support?',
      'How do gross margins compare to pure SaaS benchmarks vs professional services firms?',
      'What is the true cost of customer acquisition including implementation labor?',
    ],
  });
}

/**
 * Template 3: Positioning risk growth
 *
 * Triggered by hypotheses about narrative-reality gaps.
 * As the customer base grows, the risk of public exposure of the gap
 * between narrative and delivery increases.
 */
function implyPositioningRisk(
  hyp: Hypothesis,
  companyId: string,
): Implication | null {
  const text = `${hyp.title} ${hyp.statement}`;

  // Must reference narrative or positioning
  if (!textContains(text, ['narrative', 'positioning'])) return null;

  // Must also be about a gap between claims and reality
  if (!textContains(text, [
    'gap',
    'compensating',
    'ahead of',
    'mismatch',
  ])) return null;

  return makeImplication(companyId, hyp, {
    title: 'Positioning risk increases as customer base grows',
    statement:
      'If early customers discover — or publicly share — that the automation ' +
      'platform requires significant human onboarding and implementation, the ' +
      'narrative gap could become a trust liability. This positioning risk ' +
      'increases with visibility: more customers means more public reviews ' +
      'describing the service-heavy reality, which may conflict with the ' +
      'automation-first marketing message.',
    implication_type: 'risk',
    audience: 'executive',
    horizon: 'mid_term',
    urgency: 'medium',
    impact: 'high',
    key_questions: [
      'How are existing customers describing their experience in public reviews?',
      'What is the gap between marketing claims and customer-reported onboarding experience?',
      'Does the company monitor and respond to narrative risks in customer feedback channels?',
    ],
  });
}

/**
 * Template 4: Services team as competitive variable
 *
 * Triggered by hypotheses about structural human dependency for value delivery.
 * If customer success depends on implementation specialists, services team
 * quality becomes a core competitive concern.
 */
function implyServicesTeamCompetitiveVariable(
  hyp: Hypothesis,
  companyId: string,
): Implication | null {
  const text = `${hyp.title} ${hyp.statement}`;

  // Must be about structural human delivery requirements
  if (!textContains(text, [
    'structurally required',
    'structural requirement',
    'unable to deliver value without',
  ])) return null;

  // Must also reference implementation or services
  if (!textContains(text, [
    'implementation',
    'onboarding',
    'professional services',
  ])) return null;

  return makeImplication(companyId, hyp, {
    title: 'Services team quality becomes a critical competitive variable',
    statement:
      'If customer success depends on implementation specialists rather than ' +
      'product capability alone, then hiring quality, training programs, and ' +
      'consultant retention become critical competitive variables — not ' +
      'peripheral support functions. The services team may be the actual ' +
      'value delivery mechanism, making its quality and consistency a ' +
      'competitive differentiator or vulnerability.',
    implication_type: 'structural',
    audience: 'operator',
    horizon: 'structural',
    urgency: 'medium',
    impact: 'high',
    key_questions: [
      'What is the current attrition rate among implementation specialists?',
      'How standardized is the implementation methodology across the services team?',
      'Does the company invest in services team development as a competitive priority?',
      'How does service delivery quality vary across team members?',
    ],
  });
}

/**
 * Template 5: Investor narrative scrutiny
 *
 * Triggered by hypotheses about AI/automation narrative vs services reality.
 * Future fundraising may require reconciling the positioning gap.
 */
function implyInvestorScrutiny(
  hyp: Hypothesis,
  companyId: string,
): Implication | null {
  const text = `${hyp.title} ${hyp.statement}`;

  // Must be about automation or AI narrative
  if (!textContains(text, ['automation narrative', 'automation-led'])) return null;

  // Must also reference narrative/positioning gap
  if (!textContains(text, [
    'compensating',
    'ahead of',
    'messaging fills',
  ])) return null;

  return makeImplication(companyId, hyp, {
    title: 'Investor narrative may face scrutiny at scale',
    statement:
      'If the company raised capital on an AI-first thesis but operates as a ' +
      'services-heavy business, future fundraising rounds may require ' +
      'reconciling the positioning gap. Investor due diligence at scale examines ' +
      'gross margins, services revenue mix, and customer acquisition costs — ' +
      'metrics that may reveal the gap between the automation narrative and ' +
      'operational reality.',
    implication_type: 'risk',
    audience: 'investor',
    horizon: 'mid_term',
    urgency: 'medium',
    impact: 'medium',
    key_questions: [
      'How does the company classify services revenue in financial reporting?',
      'What gross margin does the company report, and how does it compare to SaaS benchmarks?',
      'Has investor due diligence previously examined the services dependency?',
    ],
  });
}

/**
 * Template 6: Product roadmap pressure
 *
 * Triggered by hypotheses about incomplete product automation.
 * Product engineering faces pressure to close the gap between claims
 * and capability.
 */
function implyProductRoadmapPressure(
  hyp: Hypothesis,
  companyId: string,
): Implication | null {
  const text = `${hyp.title} ${hyp.statement}`;

  if (!textContains(text, [
    'incomplete product automation',
    'cannot yet deliver autonomous',
    'automation-led positioning',
  ])) return null;

  return makeImplication(companyId, hyp, {
    title: 'Product roadmap pressure intensifies as automation gap persists',
    statement:
      'If the company acknowledges the automation gap internally, product ' +
      'engineering faces increasing pressure to close the gap between marketing ' +
      'claims and product capability. This product roadmap pressure may lead to ' +
      'rushed feature releases, quality trade-offs, or resource allocation ' +
      'conflicts between maintaining services capacity and investing in ' +
      'product automation.',
    implication_type: 'watchpoint',
    audience: 'founder',
    horizon: 'near_term',
    urgency: 'medium',
    impact: 'medium',
    key_questions: [
      'What percentage of engineering investment targets automation capability gaps?',
      'Is there internal acknowledgment of the gap between product claims and capability?',
      'How does the product roadmap prioritize closing automation gaps vs new features?',
    ],
  });
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/** Remove implications with >70% title keyword overlap. */
function deduplicateImplications(implications: Implication[]): Implication[] {
  const result: Implication[] = [];

  for (const imp of implications) {
    const titleWords = imp.title.toLowerCase().split(/\s+/).filter(w => w.length >= 3);

    const isDuplicate = result.some(existing => {
      const existingWords = existing.title.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
      const overlapCount = titleWords.filter(w => existingWords.includes(w)).length;
      const maxLen = Math.max(titleWords.length, existingWords.length);
      if (maxLen === 0) return false;
      return overlapCount / maxLen > 0.7;
    });

    if (!isDuplicate) {
      result.push(imp);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export function generateImplications(
  hypotheses: Hypothesis[],
  _patterns: Pattern[],
  _tensions: Tension[],
  _signals: Signal[],
): Implication[] {
  _counter = 0;

  // Only surviving hypotheses generate implications
  const surviving = hypotheses.filter(h => h.status === 'survives');
  if (surviving.length === 0) return [];

  const companyId = surviving[0].company_id;

  const templates = [
    implyServiceScalingConstraint,
    implyOperationalLeverageOverstatement,
    implyPositioningRisk,
    implyServicesTeamCompetitiveVariable,
    implyInvestorScrutiny,
    implyProductRoadmapPressure,
  ];

  // Apply each template to each surviving hypothesis
  const raw: Implication[] = [];
  for (const hyp of surviving) {
    for (const template of templates) {
      const result = template(hyp, companyId);
      if (result) raw.push(result);
    }
  }

  return deduplicateImplications(raw);
}
