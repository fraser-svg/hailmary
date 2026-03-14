/**
 * Fixture 005: Distribution Fragility
 *
 * Company: "GrowthPulse" — a revenue analytics tool where the founder's LinkedIn
 * content, podcast appearances, and personal network are the sole demand generation
 * mechanism. No inbound, no paid, no partnerships, no community channel. If the
 * founder stops producing content, pipeline stops.
 *
 * Tests whether the pipeline detects single-channel concentration and fragility,
 * and routes to distribution_strategy_reset intervention.
 */

import type { EvalFixture } from '../types.js'
import type { Signal } from '../../../report/pipeline/extract-signals.js'

const COMPANY_ID = 'eval_growthpulse'

const signals: Signal[] = [
  {
    signal_id: 'sig_001',
    company_id: COMPANY_ID,
    kind: 'leadership',
    title: 'Founder LinkedIn is the primary demand channel',
    statement:
      'The founder publishes 4-5 LinkedIn posts per week with 500-2,000 impressions each. Website traffic spikes correlate with founder post timing. The founder\'s personal audience is the top-of-funnel, not a company-owned channel.',
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
    kind: 'credibility',
    title: 'Founder podcast appearances are the sole brand awareness mechanism',
    statement:
      'GrowthPulse has appeared on 20+ B2B podcasts in 12 months — all featuring the founder. No other employee has any public presence. When the founder is referenced, the company is mentioned; the reverse does not occur.',
    claim_ids: ['cl_002'],
    evidence_ids: ['ev_003', 'ev_004'],
    source_ids: ['src_003', 'src_004'],
    inference_label: 'direct',
    confidence: 'high',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['founder_visibility', 'thought_leadership', 'founder_narrative'],
  },
  {
    signal_id: 'sig_003',
    company_id: COMPANY_ID,
    kind: 'gtm',
    title: 'No secondary distribution channels observable',
    statement:
      'No paid acquisition, no SEO-optimized content hub, no partner integrations, no affiliate program, no community forum. The only observable demand mechanism is the founder\'s personal content output and network.',
    claim_ids: ['cl_003'],
    evidence_ids: ['ev_005'],
    source_ids: ['src_005'],
    inference_label: 'direct',
    confidence: 'high',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['founder_concentration'],
  },
  {
    signal_id: 'sig_004',
    company_id: COMPANY_ID,
    kind: 'customer',
    title: 'Customer acquisition traces to founder content',
    statement:
      'Two customer case studies mention discovering GrowthPulse through the founder\'s LinkedIn posts. A Trustpilot review states: "Found this through [founder]\'s revenue analytics threads." Acquisition is founder-mediated, not channel-mediated.',
    claim_ids: ['cl_004'],
    evidence_ids: ['ev_006', 'ev_007'],
    source_ids: ['src_006', 'src_007'],
    inference_label: 'direct',
    confidence: 'high',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'mixed',
    tags: ['founder_dependency', 'customer_voice', 'founder_involvement'],
  },
  {
    signal_id: 'sig_005',
    company_id: COMPANY_ID,
    kind: 'operations',
    title: 'Company has no marketing function beyond founder content',
    statement:
      'Team of 12 includes no marketing hires. No content marketer, no growth marketer, no demand gen specialist. The founder is the marketing department. This is not a lean team choice — it is a structural single point of failure.',
    claim_ids: ['cl_005'],
    evidence_ids: ['ev_008'],
    source_ids: ['src_008'],
    inference_label: 'light_inference',
    confidence: 'medium',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['founder_concentration', 'hiring_signal'],
  },
  {
    signal_id: 'sig_006',
    company_id: COMPANY_ID,
    kind: 'risk',
    title: 'Growth trajectory depends on founder content velocity',
    statement:
      'Month-over-month website traffic and trial signups show direct correlation with founder posting frequency. During a 3-week period when the founder reduced posting (visible gap in LinkedIn history), trial signups dropped by an estimated 40%.',
    claim_ids: ['cl_006'],
    evidence_ids: ['ev_009', 'ev_001'],
    source_ids: ['src_001', 'src_009'],
    inference_label: 'strong_inference',
    confidence: 'medium',
    relevance: 'high',
    novelty: 'high',
    polarity: 'negative',
    tags: ['founder_dependency', 'founder_concentration'],
  },
  {
    signal_id: 'sig_007',
    company_id: COMPANY_ID,
    kind: 'customer',
    title: 'Customers reference founder relationship as retention factor',
    statement:
      'Customer reviews describe staying with GrowthPulse because "the founder is responsive" and "you can DM [founder] directly." Customer retention may be founder-mediated alongside acquisition, doubling the fragility.',
    claim_ids: ['cl_007'],
    evidence_ids: ['ev_010', 'ev_006'],
    source_ids: ['src_006', 'src_010'],
    inference_label: 'light_inference',
    confidence: 'medium',
    relevance: 'medium',
    novelty: 'medium',
    polarity: 'mixed',
    tags: ['founder_dependency', 'founder_involvement', 'customer_voice'],
  },
]

export const fixture: EvalFixture = {
  id: '005-distribution-fragility',
  name: 'GrowthPulse — Distribution Fragility',
  archetype: 'distribution_fragility',
  description:
    'Tests detection of single-channel distribution concentration. All demand flows through ' +
    'the founder\'s personal content and network. No secondary channels exist. The business ' +
    'would lose its pipeline if the founder stopped producing content for any reason.',

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
        fragility_score_min: 0.8,
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
      type: 'distribution_fragility',
      confidence_min: 'medium',
    },
    mechanisms: [
      { type: 'founder_lock_in', plausibility: 'high' },
      { type: 'local_success_trap', plausibility: 'medium' },
      { type: 'delivery_constraint', plausibility: 'medium' },
    ],
    intervention: {
      type: 'distribution_strategy_reset',
      expected_impact: 'high',
      delivery_fit: 'medium',
    },
  },
}
