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
 *
 * Phase 9B: Templates now interpolate CompanyContext for company-specific output.
 */

import type { Signal } from './extract-signals.js';
import type { Tension } from './detect-tensions.js';
import type { Pattern } from './detect-patterns.js';
import type { Hypothesis } from './generate-hypotheses.js';
import type { Confidence } from '../../types/evidence.js';
import { extractCompanyContext, normalise } from './company-context.js';
import type { CompanyContext } from './company-context.js';

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
// Implication templates (Phase 9B: company-specific interpolation)
// ---------------------------------------------------------------------------

/**
 * Template 1: Service scaling constraint
 */
function implyServiceScalingConstraint(
  hyp: Hypothesis,
  companyId: string,
  ctx: CompanyContext,
): Implication | null {
  const text = `${hyp.title} ${hyp.statement}`;

  if (!textContains(text, [
    'structurally required',
    'structural requirement',
  ])) return null;

  return makeImplication(companyId, hyp, {
    title: `Scaling ${ctx.companyName}'s revenue may require scaling ${ctx.productDomain} service capacity`,
    statement:
      `If ${ctx.companyName}'s current delivery model for ${ctx.productDomain} depends on human ` +
      'onboarding and implementation support as a structural requirement, revenue growth may ' +
      'require increasing service capacity rather than relying on product-led operational leverage. ' +
      'Each new customer cohort demands proportional human investment, producing linear cost ' +
      `scaling rather than the software-like leverage ${ctx.companyName}'s ${ctx.positionedCapability} ` +
      'positioning implies.',
    implication_type: 'constraint',
    audience: 'executive',
    horizon: 'near_term',
    urgency: 'high',
    impact: 'high',
    key_questions: [
      `What is ${ctx.companyName}'s current ratio of implementation specialists to active customers?`,
      `Can ${ctx.productDomain} onboarding be partially automated without reducing customer outcomes?`,
      'How does service capacity growth compare to revenue growth targets?',
    ],
  });
}

/**
 * Template 2: Operational leverage overstatement
 */
function implyOperationalLeverageOverstatement(
  hyp: Hypothesis,
  companyId: string,
  ctx: CompanyContext,
): Implication | null {
  const text = `${hyp.title} ${hyp.statement}`;

  if (!textContains(text, [
    'automation narrative',
    'compensating',
    'automation-led positioning',
    'messaging fills the gap',
  ])) return null;

  return makeImplication(companyId, hyp, {
    title: `${ctx.companyName}'s ${ctx.positionedCapability} claims may overstate operational leverage`,
    statement:
      `If ${ctx.companyName}'s product cannot deliver autonomous value around ${ctx.productDomain} ` +
      'without significant human setup and implementation, the company\'s unit economics may be ' +
      'closer to a professional services firm than a SaaS platform. Gross margins, customer ' +
      `acquisition costs, and scalability projections may all be weaker than ${ctx.companyName}'s ` +
      `${ctx.positionedCapability} narrative implies.`,
    implication_type: 'risk',
    audience: 'investor',
    horizon: 'near_term',
    urgency: 'high',
    impact: 'high',
    key_questions: [
      `What percentage of ${ctx.companyName} deployments complete without human implementation support?`,
      'How do gross margins compare to pure SaaS benchmarks vs professional services firms?',
      'What is the true cost of customer acquisition including implementation labour?',
    ],
  });
}

/**
 * Template 3: Positioning risk growth
 */
function implyPositioningRisk(
  hyp: Hypothesis,
  companyId: string,
  ctx: CompanyContext,
): Implication | null {
  const text = `${hyp.title} ${hyp.statement}`;

  if (!textContains(text, ['narrative', 'positioning'])) return null;
  if (!textContains(text, [
    'gap',
    'compensating',
    'ahead of',
    'mismatch',
  ])) return null;

  return makeImplication(companyId, hyp, {
    title: `${ctx.companyName}'s positioning risk increases as its ${ctx.productDomain} customer base grows`,
    statement:
      `If early ${ctx.companyName} customers discover — or publicly share — that the ` +
      `${ctx.positionedCapability} positioning requires significant human involvement, the ` +
      'narrative gap could become a trust liability. This risk increases with visibility: ' +
      `more customers means more public reviews describing the actual experience around ` +
      `${ctx.customerReality}, which may conflict with ${ctx.companyName}'s marketing message.`,
    implication_type: 'risk',
    audience: 'executive',
    horizon: 'mid_term',
    urgency: 'medium',
    impact: 'high',
    key_questions: [
      `How are existing ${ctx.companyName} customers describing their experience in public reviews?`,
      `What is the gap between ${ctx.companyName}'s marketing claims and customer-reported onboarding experience?`,
      'Does the company monitor and respond to narrative risks in customer feedback channels?',
    ],
  });
}

/**
 * Template 4: Services team as competitive variable
 */
function implyServicesTeamCompetitiveVariable(
  hyp: Hypothesis,
  companyId: string,
  ctx: CompanyContext,
): Implication | null {
  const text = `${hyp.title} ${hyp.statement}`;

  if (!textContains(text, [
    'structurally required',
    'structural requirement',
    'unable to deliver value without',
  ])) return null;

  if (!textContains(text, [
    'implementation',
    'onboarding',
    'professional services',
  ])) return null;

  return makeImplication(companyId, hyp, {
    title: `${ctx.companyName}'s ${ctx.productDomain} services team quality becomes a critical competitive variable`,
    statement:
      `If ${ctx.companyName}'s customer success depends on implementation specialists rather than ` +
      `product capability alone in ${ctx.productDomain}, then hiring quality, training programmes, ` +
      'and consultant retention become critical competitive variables — not peripheral support ' +
      'functions. The services team may be the actual value delivery mechanism, making its ' +
      'quality and consistency a competitive differentiator or vulnerability.',
    implication_type: 'structural',
    audience: 'operator',
    horizon: 'structural',
    urgency: 'medium',
    impact: 'high',
    key_questions: [
      `What is ${ctx.companyName}'s current attrition rate among implementation specialists?`,
      `How standardised is ${ctx.companyName}'s implementation methodology across the services team?`,
      'Does the company invest in services team development as a competitive priority?',
      'How does service delivery quality vary across team members?',
    ],
  });
}

/**
 * Template 5: Investor narrative scrutiny
 */
function implyInvestorScrutiny(
  hyp: Hypothesis,
  companyId: string,
  ctx: CompanyContext,
): Implication | null {
  const text = `${hyp.title} ${hyp.statement}`;

  if (!textContains(text, ['automation narrative', 'automation-led'])) return null;
  if (!textContains(text, [
    'compensating',
    'ahead of',
    'messaging fills',
  ])) return null;

  return makeImplication(companyId, hyp, {
    title: `${ctx.companyName}'s ${ctx.productDomain} investor narrative may face scrutiny at scale`,
    statement:
      `If ${ctx.companyName} raised capital on a ${ctx.positionedCapability} thesis but operates as a ` +
      'services-heavy business, future fundraising rounds may require reconciling the positioning ' +
      'gap. Investor due diligence at scale examines gross margins, services revenue mix, and ' +
      `customer acquisition costs — metrics that may reveal the gap between ${ctx.companyName}'s ` +
      `${ctx.productDomain} narrative and operational reality.`,
    implication_type: 'risk',
    audience: 'investor',
    horizon: 'mid_term',
    urgency: 'medium',
    impact: 'medium',
    key_questions: [
      `How does ${ctx.companyName} classify services revenue in financial reporting?`,
      'What gross margin does the company report, and how does it compare to SaaS benchmarks?',
      'Has investor due diligence previously examined the services dependency?',
    ],
  });
}

/**
 * Template 6: Product roadmap pressure
 */
function implyProductRoadmapPressure(
  hyp: Hypothesis,
  companyId: string,
  ctx: CompanyContext,
): Implication | null {
  const text = `${hyp.title} ${hyp.statement}`;

  if (!textContains(text, [
    'incomplete product automation',
    'cannot yet deliver autonomous',
    'automation-led positioning',
  ])) return null;

  return makeImplication(companyId, hyp, {
    title: `${ctx.companyName}'s ${ctx.productDomain} roadmap pressure intensifies as the automation gap persists`,
    statement:
      `If ${ctx.companyName} acknowledges the automation gap internally, product engineering faces ` +
      `increasing pressure to close the gap between ${ctx.positionedCapability} claims and product ` +
      'capability. This may lead to rushed feature releases, quality trade-offs, or resource ' +
      `allocation conflicts between maintaining services capacity for ${ctx.customerReality} ` +
      `and investing in product automation.`,
    implication_type: 'watchpoint',
    audience: 'founder',
    horizon: 'near_term',
    urgency: 'medium',
    impact: 'medium',
    key_questions: [
      `What percentage of ${ctx.companyName}'s engineering investment targets automation capability gaps?`,
      'Is there internal acknowledgment of the gap between product claims and capability?',
      'How does the product roadmap prioritise closing automation gaps vs new features?',
    ],
  });
}

/**
 * Template 7: Enterprise credibility lag
 */
function implyEnterpriseCredibilityLag(
  hyp: Hypothesis,
  companyId: string,
  ctx: CompanyContext,
): Implication | null {
  const text = `${hyp.title} ${hyp.statement}`;

  if (!textContains(text, ['aspirational positioning', 'aspirational rather than'])) return null;

  return makeImplication(companyId, hyp, {
    title: `${ctx.companyName}'s ${ctx.positionedCapability} credibility may lag its enterprise ambition`,
    statement:
      `If ${ctx.companyName}'s ${ctx.positionedCapability} positioning is aspirational, enterprise ` +
      `buyers conducting due diligence may find the absence of enterprise references, case studies, ` +
      `and large-scale deployments in ${ctx.productDomain} to be a credibility gap. The more ` +
      `aggressive ${ctx.companyName}'s narrative around ${ctx.narrativeClaim}, the more conspicuous ` +
      'the lack of enterprise proof becomes.',
    implication_type: 'risk',
    audience: 'executive',
    horizon: 'near_term',
    urgency: 'high',
    impact: 'high',
    key_questions: [
      `How many ${ctx.companyName} reference customers exist at the scale implied by positioning?`,
      `What do enterprise prospects find when they conduct due diligence on ${ctx.companyName}?`,
      `Does ${ctx.companyName} have case studies demonstrating enterprise-scale ${ctx.productDomain} deployments?`,
    ],
  });
}

/**
 * Template 8: Larger customers may require undemonstrated capabilities
 */
function implyLargerCustomerCapabilityGap(
  hyp: Hypothesis,
  companyId: string,
  ctx: CompanyContext,
): Implication | null {
  const text = `${hyp.title} ${hyp.statement}`;

  if (!textContains(text, [
    'smaller organizations',
    'traction in smaller',
    'traction in',
  ])) return null;

  return makeImplication(companyId, hyp, {
    title: `Larger ${ctx.productDomain} buyers may require ${ctx.companyName} capabilities not yet demonstrated`,
    statement:
      `If ${ctx.companyName}'s current customer base is primarily ${ctx.customerSegment}, the ` +
      `product's fitness for larger ${ctx.productDomain} buyers is unproven. Larger customers ` +
      'typically require advanced permissioning, complex workflow orchestration, multi-team ' +
      `governance, and deep integration capabilities that may exceed what ${ctx.companyName} ` +
      'has demonstrated in practice with its current customer base.',
    implication_type: 'risk',
    audience: 'founder',
    horizon: 'mid_term',
    urgency: 'medium',
    impact: 'high',
    key_questions: [
      `What ${ctx.productDomain} capabilities do larger buyers require that ${ctx.companyName} has not demonstrated?`,
      `Has ${ctx.companyName}'s product been tested in environments with the complexity larger buyers demand?`,
      `What is the gap between current ${ctx.companyName} capabilities and larger buyer requirements?`,
    ],
  });
}

/**
 * Template 9: Positioning risk with enterprise scrutiny
 */
function implyPositioningScrutinyRisk(
  hyp: Hypothesis,
  companyId: string,
  ctx: CompanyContext,
): Implication | null {
  const text = `${hyp.title} ${hyp.statement}`;

  if (!textContains(text, ['aspirational'])) return null;
  if (!textContains(text, ['forward-looking', 'absence of supporting'])) return null;

  return makeImplication(companyId, hyp, {
    title: `${ctx.companyName}'s positioning risk may increase as ${ctx.productDomain} buyers scrutinise proof`,
    statement:
      `If ${ctx.companyName} actively pursues larger ${ctx.productDomain} deals, prospects may ` +
      `seek reference accounts of similar size and industry. The gap between ${ctx.companyName}'s ` +
      `${ctx.positionedCapability} narrative and observable proof points may create sales cycle ` +
      'friction, extended evaluation periods, or lost opportunities.',
    implication_type: 'risk',
    audience: 'executive',
    horizon: 'near_term',
    urgency: 'high',
    impact: 'high',
    key_questions: [
      `What happens when ${ctx.productDomain} prospects request ${ctx.companyName} reference customers at their scale?`,
      `How long are ${ctx.companyName}'s enterprise sales cycles, and does proof availability affect close rates?`,
      `Does ${ctx.companyName} have a strategy for bridging the reference gap in enterprise deals?`,
    ],
  });
}

/**
 * Template 10: SMB underserved by enterprise messaging
 */
function implySMBUnderservedByEnterpriseMessaging(
  hyp: Hypothesis,
  companyId: string,
  ctx: CompanyContext,
): Implication | null {
  const text = `${hyp.title} ${hyp.statement}`;

  if (!textContains(text, ['branding function', 'actual customer acquisition focuses'])) return null;

  return makeImplication(companyId, hyp, {
    title: `${ctx.companyName}'s ${ctx.customerSegment} may be underserved by its ${ctx.positionedCapability} messaging`,
    statement:
      `If ${ctx.companyName}'s actual customer base consists of ${ctx.customerSegment}, the ` +
      `enterprise-heavy ${ctx.positionedCapability} marketing may be creating a positioning ` +
      'mismatch for the company\'s best customers. These buyers — who value ' +
      `${ctx.customerReality} — may feel the product is not designed for them, or may have ` +
      'different expectations about support, pricing, and complexity based on the enterprise framing.',
    implication_type: 'risk',
    audience: 'executive',
    horizon: 'near_term',
    urgency: 'medium',
    impact: 'high',
    key_questions: [
      `How do current ${ctx.companyName} customers describe the product — using enterprise language or simpler terms?`,
      `Are ${ctx.customerSegment} buyers confused or deterred by the ${ctx.positionedCapability} positioning?`,
      `Does ${ctx.companyName}'s messaging accurately reflect the value proposition for its actual customer base?`,
    ],
  });
}

/**
 * Template 11: Sales motion adjustment risk
 */
function implySalesMotionAdjustment(
  hyp: Hypothesis,
  companyId: string,
  ctx: CompanyContext,
): Implication | null {
  const text = `${hyp.title} ${hyp.statement}`;

  if (!textContains(text, ['aspirational'])) return null;
  if (!textContains(text, ['different market segment', 'different segment'])) return null;

  return makeImplication(companyId, hyp, {
    title: `${ctx.companyName}'s ${ctx.productDomain} sales motion may require adjustment if enterprise proof remains thin`,
    statement:
      `If ${ctx.companyName} attempts to move upmarket in ${ctx.productDomain} without building ` +
      'enterprise proof, the current sales team — structured for shorter cycles and smaller deals ' +
      `serving ${ctx.customerSegment} — may not be equipped for enterprise sales cycles that ` +
      'typically span longer periods with multiple stakeholders.',
    implication_type: 'watchpoint',
    audience: 'operator',
    horizon: 'mid_term',
    urgency: 'medium',
    impact: 'medium',
    key_questions: [
      `Is ${ctx.companyName}'s current sales team structured for the deal sizes and cycles the positioning implies?`,
      `What is ${ctx.companyName}'s average sales cycle length, and how does it compare to enterprise benchmarks?`,
      `Does ${ctx.companyName} have enterprise sales experience or playbooks?`,
    ],
  });
}

/**
 * Template 12: Investor expectations calibration
 */
function implyInvestorExpectationsCalibration(
  hyp: Hypothesis,
  companyId: string,
  ctx: CompanyContext,
): Implication | null {
  const text = `${hyp.title} ${hyp.statement}`;

  if (!textContains(text, ['signal to investors', 'establish credibility'])) return null;

  return makeImplication(companyId, hyp, {
    title: `${ctx.companyName}'s investor expectations may be calibrated to its ${ctx.positionedCapability} narrative`,
    statement:
      `If ${ctx.companyName} raised capital on a ${ctx.positionedCapability} thesis, investors may ` +
      'expect enterprise metrics — net revenue retention above benchmarks, expansion revenue, and ' +
      `large logo acquisition. If ${ctx.companyName}'s actual trajectory serves ${ctx.customerSegment}, ` +
      'there may be a future disconnect between investor expectations and operational reality.',
    implication_type: 'risk',
    audience: 'investor',
    horizon: 'mid_term',
    urgency: 'medium',
    impact: 'medium',
    key_questions: [
      `Was ${ctx.companyName}'s most recent funding round positioned around an enterprise thesis?`,
      'What metrics are investors tracking — and do they align with the actual customer base?',
      'Is there a gap between investor expectations and operational trajectory?',
    ],
  });
}

/**
 * Template 13: Scaling requires distributing credibility
 */
function implyCredibilityDistribution(
  hyp: Hypothesis,
  companyId: string,
  ctx: CompanyContext,
): Implication | null {
  const text = `${hyp.title} ${hyp.statement}`;

  if (!textContains(text, [
    'credibility',
    'founder personal authority',
    'anchored to a single individual',
  ])) return null;

  if (!textContains(text, [
    'founder',
    'personal',
  ])) return null;

  return makeImplication(companyId, hyp, {
    title: `Scaling ${ctx.companyName} may require distributing ${ctx.productDomain} credibility beyond the founder`,
    statement:
      `If ${ctx.companyName}'s credibility in ${ctx.productDomain} is currently anchored to the ` +
      "founder personally, growth beyond the founder's personal bandwidth may require building " +
      'institutional credibility signals — a visible leadership team, team-led content, and ' +
      'customer relationships managed by people other than the founder.',
    implication_type: 'constraint',
    audience: 'executive',
    horizon: 'near_term',
    urgency: 'high',
    impact: 'high',
    key_questions: [
      `What institutional credibility signals exist at ${ctx.companyName} beyond the founder?`,
      `Can ${ctx.companyName} customer relationships be successfully transitioned to other team members?`,
      "How dependent is new customer acquisition on the founder's personal involvement?",
    ],
  });
}

/**
 * Template 14: Enterprise buyers seek institutional authority
 */
function implyEnterpriseInstitutionalAuthority(
  hyp: Hypothesis,
  companyId: string,
  ctx: CompanyContext,
): Implication | null {
  const text = `${hyp.title} ${hyp.statement}`;

  if (!textContains(text, ['credibility'])) return null;
  if (!textContains(text, [
    'single individual',
    'founder',
    'not yet been distributed',
    'anchored',
  ])) return null;

  return makeImplication(companyId, hyp, {
    title: `${ctx.productDomain} enterprise buyers may seek institutional authority signals beyond ${ctx.companyName}'s founder`,
    statement:
      `If ${ctx.companyName} pursues larger ${ctx.productDomain} customers, enterprise procurement ` +
      'processes may evaluate institutional maturity — executive team depth, organisational ' +
      `resilience, and continuity risk. A company whose ${ctx.productDomain} identity is ` +
      'inseparable from a single individual may face additional scrutiny from enterprise buyers ' +
      'assessing vendor risk.',
    implication_type: 'risk',
    audience: 'executive',
    horizon: 'mid_term',
    urgency: 'medium',
    impact: 'high',
    key_questions: [
      `How do enterprise ${ctx.productDomain} prospects evaluate vendor risk and institutional maturity?`,
      `Does ${ctx.companyName} have institutional authority signals beyond the founder?`,
      'What continuity risk do enterprise buyers perceive in a founder-dependent company?',
    ],
  });
}

/**
 * Template 15: Leadership depth becomes increasingly important
 */
function implyLeadershipDepthImportance(
  hyp: Hypothesis,
  companyId: string,
  ctx: CompanyContext,
): Implication | null {
  const text = `${hyp.title} ${hyp.statement}`;

  if (!textContains(text, [
    'institutional leadership',
    'leadership depth',
    'lean structure',
    'leadership structures',
  ])) return null;

  return makeImplication(companyId, hyp, {
    title: `${ctx.companyName}'s leadership depth in ${ctx.productDomain} may become increasingly important as it grows`,
    statement:
      `If ${ctx.companyName}'s current operating model — founder as sales, customer success, ` +
      `content creator, and ${ctx.productDomain} product evangelist — continues without delegation, ` +
      "the company's capacity to serve additional customers may be constrained by the founder's " +
      'available time and energy.',
    implication_type: 'constraint',
    audience: 'founder',
    horizon: 'near_term',
    urgency: 'medium',
    impact: 'high',
    key_questions: [
      `Which ${ctx.companyName} functions is the founder currently filling that could be delegated?`,
      'At what customer count does the current model reach capacity constraints?',
      `What leadership hires would most effectively distribute critical ${ctx.productDomain} functions?`,
    ],
  });
}

/**
 * Template 16: Founder bandwidth influences deal flow
 */
function implyFounderBandwidthConstraint(
  hyp: Hypothesis,
  companyId: string,
  ctx: CompanyContext,
): Implication | null {
  const text = `${hyp.title} ${hyp.statement}`;

  if (!textContains(text, ['founder'])) return null;
  if (!textContains(text, [
    'direct involvement',
    'customer implementations',
    'customer relationships',
  ])) return null;

  return makeImplication(companyId, hyp, {
    title: `${ctx.companyName}'s founder bandwidth may constrain ${ctx.productDomain} deal flow and customer partnerships`,
    statement:
      `If ${ctx.companyName}'s founder is personally involved in every customer implementation, ` +
      `demo, and ${ctx.productDomain} relationship, the number of concurrent deals and customer ` +
      "relationships may be limited by one person's capacity. This may become visible in sales " +
      'cycle length, response times, or customer attention quality as demand grows.',
    implication_type: 'watchpoint',
    audience: 'operator',
    horizon: 'near_term',
    urgency: 'medium',
    impact: 'high',
    key_questions: [
      `How many concurrent ${ctx.productDomain} customer engagements can ${ctx.companyName}'s founder effectively manage?`,
      'Are there signs of capacity strain in response times or deal velocity?',
      'What customer functions could be delegated without reducing perceived value?',
    ],
  });
}

/**
 * Template 17: Investor perception evolves with leadership
 */
function implyInvestorPerceptionEvolution(
  hyp: Hypothesis,
  companyId: string,
  ctx: CompanyContext,
): Implication | null {
  const text = `${hyp.title} ${hyp.statement}`;

  if (!textContains(text, ['institutional leadership', 'leadership structures'])) return null;
  if (!textContains(text, ['seed stage', 'early-stage', 'early stage'])) return null;

  return makeImplication(companyId, hyp, {
    title: `${ctx.companyName}'s investor perception may evolve as its ${ctx.productDomain} leadership structure matures`,
    statement:
      `If ${ctx.companyName}'s seed round was raised on the strength of the founder's personal ` +
      `credibility in ${ctx.productDomain}, future investors may evaluate whether the company ` +
      'has developed institutional capability beyond the founder. Series A investors typically ' +
      'assess team depth as a scaling indicator.',
    implication_type: 'watchpoint',
    audience: 'investor',
    horizon: 'mid_term',
    urgency: 'medium',
    impact: 'medium',
    key_questions: [
      `Was ${ctx.companyName}'s seed round primarily based on the founder's personal credibility?`,
      'What team depth milestones do Series A investors typically expect?',
      `How is ${ctx.companyName} building institutional capability visible to future investors?`,
    ],
  });
}

// ---------------------------------------------------------------------------
// Broader implication templates (Phase 8, updated Phase 9B)
// ---------------------------------------------------------------------------

/**
 * Template 18: Narrative-reality alignment risk
 */
function implyNarrativeRealityRisk(
  hyp: Hypothesis,
  companyId: string,
  ctx: CompanyContext,
): Implication | null {
  const text = `${hyp.title} ${hyp.statement}`;

  if (!textContains(text, ['narrative', 'positioning'])) return null;
  if (!textContains(text, [
    'human involvement',
    'not yet match',
    'different market segment',
    'aspirational rather than fully',
    'transitional phase',
  ])) return null;

  return makeImplication(companyId, hyp, {
    title: `${ctx.companyName}'s narrative-reality alignment around ${ctx.productDomain} may require attention as visibility increases`,
    statement:
      `If the gap between ${ctx.companyName}'s external narrative around ${ctx.positionedCapability} ` +
      'and observable reality persists, increasing market visibility may expose the misalignment. ' +
      `Customers, partners, and investors conducting due diligence on ${ctx.companyName} may ` +
      `discover discrepancies between the ${ctx.productDomain} positioning and operational evidence ` +
      `like ${ctx.customerReality}.`,
    implication_type: 'risk',
    audience: 'executive',
    horizon: 'near_term',
    urgency: 'medium',
    impact: 'high',
    key_questions: [
      `How would sophisticated buyers describe the gap between ${ctx.companyName}'s marketing and experience?`,
      `Does ${ctx.companyName} monitor for narrative-reality divergence in customer feedback?`,
      'Is there a plan to close the gap — by adjusting narrative or accelerating capability?',
    ],
  });
}

/**
 * Template 19: Growth stage scaling constraints
 */
function implyGrowthScalingConstraints(
  hyp: Hypothesis,
  companyId: string,
  ctx: CompanyContext,
): Implication | null {
  const text = `${hyp.title} ${hyp.statement}`;

  if (!textContains(text, [
    'organizational depth',
    'organisational depth',
    'growth capacity',
    'scaling constraint',
    'growth transition',
    'concentrated in the founder',
    'next growth stage',
  ])) return null;

  return makeImplication(companyId, hyp, {
    title: `${ctx.companyName}'s current ${ctx.productDomain} operating model may face capacity constraints at the next growth stage`,
    statement:
      `If ${ctx.companyName}'s operating model depends on concentrated individual effort or lean ` +
      `organisational structure, growth beyond current scale in ${ctx.productDomain} may require ` +
      'deliberate investment in team depth, process formalisation, or leadership expansion. ' +
      `The transition from founder-led to team-scaled operations is a common inflection point ` +
      `for growth-stage companies like ${ctx.companyName}.`,
    implication_type: 'constraint',
    audience: 'founder',
    horizon: 'near_term',
    urgency: 'medium',
    impact: 'high',
    key_questions: [
      `At what customer volume does ${ctx.companyName}'s current operating model reach capacity limits?`,
      'Which functions currently depend on individual effort that could be systematised?',
      `What leadership or operational investments would unlock ${ctx.companyName}'s next growth phase?`,
    ],
  });
}

/**
 * Template 20: Buyer due diligence vulnerability
 */
function implyBuyerDueDiligenceRisk(
  hyp: Hypothesis,
  companyId: string,
  ctx: CompanyContext,
): Implication | null {
  const text = `${hyp.title} ${hyp.statement}`;

  if (!textContains(text, [
    'traction',
    'ambitions',
    'aspirational',
    'observable evidence',
  ])) return null;

  if (!textContains(text, [
    'not yet match',
    'reflective of current',
    'exceed what can be verified',
    'limited relative to',
  ])) return null;

  return makeImplication(companyId, hyp, {
    title: `Sophisticated ${ctx.productDomain} buyers may probe for evidence behind ${ctx.companyName}'s positioning claims`,
    statement:
      `If ${ctx.companyName}'s external positioning around ${ctx.positionedCapability} exceeds what ` +
      'observable evidence supports, sophisticated buyers — enterprise procurement, strategic ' +
      `partners, or investors — may request proof points that are difficult to provide. ` +
      `Reference customers, ${ctx.productDomain} case studies, and independently verifiable ` +
      `metrics become increasingly important as ${ctx.companyName} targets more demanding stakeholders.`,
    implication_type: 'risk',
    audience: 'executive',
    horizon: 'near_term',
    urgency: 'high',
    impact: 'high',
    key_questions: [
      `What proof points can ${ctx.companyName} offer to validate its ${ctx.positionedCapability} claims?`,
      `How many reference customers exist at the scale implied by ${ctx.companyName}'s positioning?`,
      `What evidence would a sceptical ${ctx.productDomain} buyer need to see before committing?`,
    ],
  });
}

/**
 * Template 21: Strategic clarity opportunity
 */
function implyStrategicClarityOpportunity(
  hyp: Hypothesis,
  companyId: string,
  ctx: CompanyContext,
): Implication | null {
  const text = `${hyp.title} ${hyp.statement}`;

  if (!textContains(text, [
    'multiple structural tensions',
    'growth transition',
    'transitional phase',
  ])) return null;

  return makeImplication(companyId, hyp, {
    title: `Clarifying ${ctx.companyName}'s strategic priorities may accelerate growth through the ${ctx.productDomain} transition`,
    statement:
      `If ${ctx.companyName} is navigating a structural growth transition in ${ctx.productDomain}, ` +
      'explicitly prioritising which tensions to resolve first — and which to tolerate — may ' +
      `accelerate progress. The tension between ${ctx.positionedCapability} positioning and ` +
      `${ctx.customerReality} is a strategic choice that benefits from deliberate resolution.`,
    implication_type: 'opportunity',
    audience: 'founder',
    horizon: 'near_term',
    urgency: 'medium',
    impact: 'medium',
    key_questions: [
      `Which tension at ${ctx.companyName} — delivery, positioning, or organisational — is most urgent to resolve?`,
      `Does ${ctx.companyName}'s leadership have a shared view of the company's current growth transition?`,
      'What strategic choices would most directly accelerate the transition?',
    ],
  });
}

/**
 * Template 22: Segment-aligned positioning opportunity
 */
function implySegmentAlignmentOpportunity(
  hyp: Hypothesis,
  companyId: string,
  ctx: CompanyContext,
): Implication | null {
  const text = `${hyp.title} ${hyp.statement}`;

  if (!textContains(text, [
    'stronger market position',
    'genuine product-market fit',
    'demonstrated strength',
  ])) return null;

  return makeImplication(companyId, hyp, {
    title: `Aligning ${ctx.companyName}'s positioning with ${ctx.customerSegment} could accelerate ${ctx.productDomain} growth`,
    statement:
      `If ${ctx.companyName}'s current customer base — ${ctx.customerSegment} who value ` +
      `${ctx.customerReality} — represents genuine product-market fit, adjusting positioning ` +
      `to reflect this strength rather than aspirational ${ctx.positionedCapability} could ` +
      'improve conversion rates, reduce sales cycle length, and build more authentic case ' +
      'studies and references.',
    implication_type: 'opportunity',
    audience: 'executive',
    horizon: 'near_term',
    urgency: 'medium',
    impact: 'high',
    key_questions: [
      `What would ${ctx.companyName}'s positioning look like if it reflected its current customer base?`,
      'How do conversion rates compare between the current segment and the aspirational one?',
      'Would segment-aligned positioning enable faster growth than aspirational positioning?',
    ],
  });
}

/**
 * Template 23: Customer language intelligence opportunity
 */
function implyCustomerLanguageIntelligence(
  hyp: Hypothesis,
  companyId: string,
  ctx: CompanyContext,
): Implication | null {
  const text = `${hyp.title} ${hyp.statement}`;

  if (!textContains(text, [
    'customer perception of value',
    'positioning language',
    'value may differ',
    'perceive value differently',
  ])) return null;

  return makeImplication(companyId, hyp, {
    title: `${ctx.companyName}'s customer language analysis could reveal untapped ${ctx.productDomain} positioning opportunities`,
    statement:
      `If ${ctx.companyName}'s customers describe value in terms of ${ctx.customerReality} rather ` +
      `than ${ctx.positionedCapability}, systematically analysing customer language — in reviews, ` +
      'support tickets, and sales conversations — could reveal positioning angles that resonate ' +
      `more authentically with ${ctx.productDomain} buyers.`,
    implication_type: 'opportunity',
    audience: 'executive',
    horizon: 'near_term',
    urgency: 'medium',
    impact: 'medium',
    key_questions: [
      `How do ${ctx.companyName}'s customers describe the product in their own words?`,
      `What problem do customers say ${ctx.companyName} solves vs what marketing says?`,
      `Has ${ctx.companyName} tested positioning that mirrors customer language?`,
    ],
  });
}

// ---------------------------------------------------------------------------
// Deduplication (Phase 9B: enhanced with normalised title + key phrases)
// ---------------------------------------------------------------------------

/** Remove implications with >70% title keyword overlap or >65% normalised word overlap. */
function deduplicateImplications(implications: Implication[]): Implication[] {
  const result: Implication[] = [];

  for (const imp of implications) {
    const titleWords = imp.title.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
    const normTitle = normalise(imp.title);
    const normWords = normTitle.split(/\s+/).filter(w => w.length >= 3);

    const isDuplicate = result.some(existing => {
      // Check 1: raw title word overlap (original)
      const existingWords = existing.title.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
      const overlapCount = titleWords.filter(w => existingWords.includes(w)).length;
      const maxLen = Math.max(titleWords.length, existingWords.length);
      if (maxLen > 0 && overlapCount / maxLen > 0.7) return true;

      // Check 2: normalised title overlap (Phase 9B — catches semantic duplicates)
      const existingNorm = normalise(existing.title);
      const existingNormWords = existingNorm.split(/\s+/).filter(w => w.length >= 3);
      if (normWords.length > 0 && existingNormWords.length > 0) {
        const normOverlap = normWords.filter(w => existingNormWords.includes(w)).length;
        const maxNorm = Math.max(normWords.length, existingNormWords.length);
        if (normOverlap / maxNorm > 0.65) return true;
      }

      return false;
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

  // Top-ranked hypotheses (status = 'survives') generate implications
  const surviving = hypotheses.filter(h => h.status === 'survives');
  if (surviving.length === 0) return [];

  const companyId = surviving[0].company_id;

  // Extract company context for template interpolation
  const ctx = extractCompanyContext(_signals, _tensions, _patterns);

  const templates = [
    (h: Hypothesis) => implyServiceScalingConstraint(h, companyId, ctx),
    (h: Hypothesis) => implyOperationalLeverageOverstatement(h, companyId, ctx),
    (h: Hypothesis) => implyPositioningRisk(h, companyId, ctx),
    (h: Hypothesis) => implyServicesTeamCompetitiveVariable(h, companyId, ctx),
    (h: Hypothesis) => implyInvestorScrutiny(h, companyId, ctx),
    (h: Hypothesis) => implyProductRoadmapPressure(h, companyId, ctx),
    (h: Hypothesis) => implyEnterpriseCredibilityLag(h, companyId, ctx),
    (h: Hypothesis) => implyLargerCustomerCapabilityGap(h, companyId, ctx),
    (h: Hypothesis) => implyPositioningScrutinyRisk(h, companyId, ctx),
    (h: Hypothesis) => implySMBUnderservedByEnterpriseMessaging(h, companyId, ctx),
    (h: Hypothesis) => implySalesMotionAdjustment(h, companyId, ctx),
    (h: Hypothesis) => implyInvestorExpectationsCalibration(h, companyId, ctx),
    (h: Hypothesis) => implyCredibilityDistribution(h, companyId, ctx),
    (h: Hypothesis) => implyEnterpriseInstitutionalAuthority(h, companyId, ctx),
    (h: Hypothesis) => implyLeadershipDepthImportance(h, companyId, ctx),
    (h: Hypothesis) => implyFounderBandwidthConstraint(h, companyId, ctx),
    (h: Hypothesis) => implyInvestorPerceptionEvolution(h, companyId, ctx),
    (h: Hypothesis) => implyNarrativeRealityRisk(h, companyId, ctx),
    (h: Hypothesis) => implyGrowthScalingConstraints(h, companyId, ctx),
    (h: Hypothesis) => implyBuyerDueDiligenceRisk(h, companyId, ctx),
    (h: Hypothesis) => implyStrategicClarityOpportunity(h, companyId, ctx),
    (h: Hypothesis) => implySegmentAlignmentOpportunity(h, companyId, ctx),
    (h: Hypothesis) => implyCustomerLanguageIntelligence(h, companyId, ctx),
  ];

  // Apply each template to each surviving hypothesis
  const raw: Implication[] = [];
  for (const hyp of surviving) {
    for (const template of templates) {
      const result = template(hyp);
      if (result) raw.push(result);
    }
  }

  return deduplicateImplications(raw);
}
