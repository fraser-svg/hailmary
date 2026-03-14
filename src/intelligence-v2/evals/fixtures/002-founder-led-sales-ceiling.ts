/**
 * Fixture 002: Founder-Led Sales Ceiling
 *
 * Company: "InsightMetrics" — a B2B analytics platform where the founder is the
 * primary trust asset, demand generator, and deal closer. No scalable sales
 * infrastructure exists. Growth is capped by the founder's calendar.
 *
 * Tests whether the pipeline detects founder concentration across narrative,
 * demand, and sales motions, and routes to founder_gtm_transition intervention.
 */

import type { EvalFixture } from '../types.js'
import type { Signal } from '../../../report/pipeline/extract-signals.js'

const COMPANY_ID = 'eval_insightmetrics'

const signals: Signal[] = [
  {
    signal_id: 'sig_001',
    company_id: COMPANY_ID,
    kind: 'leadership',
    title: 'Founder dominates all public-facing communication',
    statement:
      'Every published blog post, podcast appearance, and conference talk features the founder exclusively. No other team member has any visible thought leadership presence. The company brand and the founder brand are indistinguishable.',
    claim_ids: ['cl_001'],
    evidence_ids: ['ev_001', 'ev_002'],
    source_ids: ['src_001', 'src_002'],
    inference_label: 'direct',
    confidence: 'high',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['founder_visibility', 'founder_concentration', 'thought_leadership'],
  },
  {
    signal_id: 'sig_002',
    company_id: COMPANY_ID,
    kind: 'customer',
    title: 'Customers attribute purchase decision to founder relationship',
    statement:
      'Three independent customer testimonials reference the founder by name as the reason they chose InsightMetrics. One states: "We went with InsightMetrics because [founder] personally understood our data challenges." No product feature is cited as the primary decision driver.',
    claim_ids: ['cl_002'],
    evidence_ids: ['ev_003', 'ev_004'],
    source_ids: ['src_003', 'src_004'],
    inference_label: 'direct',
    confidence: 'high',
    relevance: 'high',
    novelty: 'high',
    polarity: 'mixed',
    tags: ['founder_dependency', 'customer_voice', 'founder_involvement'],
  },
  {
    signal_id: 'sig_003',
    company_id: COMPANY_ID,
    kind: 'gtm',
    title: 'No observable sales team infrastructure',
    statement:
      'LinkedIn shows no sales, SDR, or business development roles at the company. The team page lists engineers, one marketer, and the founder. All customer-facing activity is founder-mediated.',
    claim_ids: ['cl_003'],
    evidence_ids: ['ev_005'],
    source_ids: ['src_005'],
    inference_label: 'direct',
    confidence: 'high',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['founder_concentration', 'hiring_signal'],
  },
  {
    signal_id: 'sig_004',
    company_id: COMPANY_ID,
    kind: 'credibility',
    title: 'Founder is the sole conference and podcast presence',
    statement:
      'In the last 12 months, the founder appeared on 14 podcasts and 6 conference stages. No other employee appeared publicly. Demand generation is entirely concentrated in one person.',
    claim_ids: ['cl_004'],
    evidence_ids: ['ev_006', 'ev_007'],
    source_ids: ['src_006', 'src_007'],
    inference_label: 'direct',
    confidence: 'high',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['thought_leadership', 'founder_visibility', 'founder_narrative'],
  },
  {
    signal_id: 'sig_005',
    company_id: COMPANY_ID,
    kind: 'customer',
    title: 'Referral network traces back to founder connections',
    statement:
      'Case studies and customer references consistently mention introductions through the founder\'s personal network. The pipeline appears to originate from relationships the founder built over a 15-year career, not from scalable channels.',
    claim_ids: ['cl_005'],
    evidence_ids: ['ev_008', 'ev_003'],
    source_ids: ['src_003', 'src_008'],
    inference_label: 'light_inference',
    confidence: 'medium',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['founder_dependency', 'founder_involvement'],
  },
  {
    signal_id: 'sig_006',
    company_id: COMPANY_ID,
    kind: 'operations',
    title: 'No documented sales process or playbook',
    statement:
      'Job postings and company content show no evidence of a formalized sales methodology, CRM-driven pipeline, or sales enablement function. Deal progression appears ad hoc and founder-driven.',
    claim_ids: ['cl_006'],
    evidence_ids: ['ev_009'],
    source_ids: ['src_009'],
    inference_label: 'light_inference',
    confidence: 'medium',
    relevance: 'medium',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['founder_concentration'],
  },
  {
    signal_id: 'sig_007',
    company_id: COMPANY_ID,
    kind: 'credibility',
    title: 'Case studies lack institutional proof depth',
    statement:
      'Published case studies are short-form quotes from founders of customer companies who know the InsightMetrics founder personally. No quantitative outcomes, no ROI metrics, no third-party validation. Proof architecture does not exist beyond founder credibility.',
    claim_ids: ['cl_007'],
    evidence_ids: ['ev_010', 'ev_008'],
    source_ids: ['src_008', 'src_010'],
    inference_label: 'light_inference',
    confidence: 'medium',
    relevance: 'medium',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['proof_gap', 'founder_concentration'],
  },
]

export const fixture: EvalFixture = {
  id: '002-founder-led-sales-ceiling',
  name: 'InsightMetrics — Founder-Led Sales Ceiling',
  archetype: 'founder_led_sales_ceiling',
  description:
    'Tests detection of founder-dependent growth constraints. Signals show founder ' +
    'dominance across thought leadership, demand generation, customer relationships, ' +
    'and deal closure — with no institutional sales infrastructure to absorb that load.',

  signals,

  expected: {
    gtm_analysis: {
      sales_motion: {
        mode: 'founder_led',
        confidence_min: 'high',
      },
      buyer_structure: {
        user_buyer_mismatch: false,
      },
      distribution_architecture: {
        primary_channel: 'founder_content',
        fragility_score_min: 0.7,
        fragility_score_max: 1.0,
      },
      founder_dependency: {
        risk_score_min: 0.67,
        risk_score_max: 1.0,
      },
      service_dependency: {
        onboarding_complexity: 'low',
        implementation_required: false,
        hidden_services_risk_min: 0,
      },
      pricing_delivery_fit: {
        delivery_fit_tension: false,
      },
    },
    diagnosis: {
      type: 'founder_led_sales_ceiling',
      confidence_min: 'medium',
    },
    mechanisms: [
      { type: 'founder_lock_in', plausibility: 'high' },
      { type: 'local_success_trap', plausibility: 'medium' },
      { type: 'proof_gap', plausibility: 'medium' },
    ],
    intervention: {
      type: 'founder_gtm_transition',
      expected_impact: 'high',
      delivery_fit: 'high',
    },
  },
}
