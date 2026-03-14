/**
 * Fixture 006: Narrative-Distribution Mismatch
 *
 * Company: "FlowStack" — a marketing attribution tool that claims to be product-led
 * and inbound-driven in all external communications. Investor decks reference PLG,
 * the website emphasizes self-serve, and the CEO describes "viral adoption." But
 * observable evidence reveals that deals originate from founder referrals, outbound
 * prospecting, and partner introductions — not product-led growth.
 *
 * Tests whether the pipeline detects the divergence between stated GTM narrative
 * and actual distribution architecture, and routes to positioning_reset intervention.
 */

import type { EvalFixture } from '../types.js'
import type { Signal } from '../../../report/pipeline/extract-signals.js'

const COMPANY_ID = 'eval_flowstack'

const signals: Signal[] = [
  {
    signal_id: 'sig_001',
    company_id: COMPANY_ID,
    kind: 'positioning',
    title: 'PLG narrative dominates external communications',
    statement:
      'Website, press coverage, and CEO interviews consistently describe FlowStack as "product-led" with "self-serve onboarding" and "viral team adoption." The PLG narrative is the company\'s stated distribution strategy across all external channels.',
    claim_ids: ['cl_001'],
    evidence_ids: ['ev_001', 'ev_002'],
    source_ids: ['src_001', 'src_002'],
    inference_label: 'direct',
    confidence: 'high',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'neutral',
    tags: ['plg', 'product_led', 'self_serve'],
  },
  {
    signal_id: 'sig_002',
    company_id: COMPANY_ID,
    kind: 'customer',
    title: 'Customer acquisition stories contradict PLG narrative',
    statement:
      'Customer case studies describe discovery through "a mutual introduction," "a call from their sales team," and "a demo at a marketing conference." None describes self-serve signup or product-led discovery. The stated motion and the described experience do not match.',
    claim_ids: ['cl_002'],
    evidence_ids: ['ev_003', 'ev_004'],
    source_ids: ['src_003', 'src_004'],
    inference_label: 'direct',
    confidence: 'high',
    relevance: 'high',
    novelty: 'high',
    polarity: 'negative',
    tags: ['customer_voice', 'founder_dependency'],
  },
  {
    signal_id: 'sig_003',
    company_id: COMPANY_ID,
    kind: 'leadership',
    title: 'Founder is the primary demand generation mechanism',
    statement:
      'The founder publishes weekly LinkedIn content, speaks at 8+ conferences per year, and maintains a personal network of CMOs from a prior career at a marketing agency. Observable deal origination patterns trace to this network, not to product-led channels.',
    claim_ids: ['cl_003'],
    evidence_ids: ['ev_005', 'ev_006'],
    source_ids: ['src_005', 'src_006'],
    inference_label: 'light_inference',
    confidence: 'high',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['founder_visibility', 'founder_concentration', 'thought_leadership', 'founder_narrative'],
  },
  {
    signal_id: 'sig_004',
    company_id: COMPANY_ID,
    kind: 'gtm',
    title: 'Hiring reveals outbound and partnership motion, not PLG',
    statement:
      'Open roles include 2 SDRs, 1 partnerships manager, and 1 field marketing lead. No product growth engineer, no growth PM, no self-serve optimization role. The hiring pattern builds an outbound and relationship-driven GTM, contradicting the PLG positioning.',
    claim_ids: ['cl_004'],
    evidence_ids: ['ev_007'],
    source_ids: ['src_007'],
    inference_label: 'direct',
    confidence: 'high',
    relevance: 'high',
    novelty: 'high',
    polarity: 'negative',
    tags: ['hiring_signal'],
  },
  {
    signal_id: 'sig_005',
    company_id: COMPANY_ID,
    kind: 'pricing',
    title: 'Free tier exists but does not drive observable conversion',
    statement:
      'FlowStack offers a free plan with limited features. However, no customer review or case study mentions starting on the free tier. The free plan appears to be a positioning artifact — it signals PLG without functioning as a conversion engine.',
    claim_ids: ['cl_005'],
    evidence_ids: ['ev_008', 'ev_003'],
    source_ids: ['src_008', 'src_003'],
    inference_label: 'light_inference',
    confidence: 'medium',
    relevance: 'medium',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['self_serve', 'positioning_gap'],
  },
  {
    signal_id: 'sig_006',
    company_id: COMPANY_ID,
    kind: 'credibility',
    title: 'Investor narrative emphasises PLG metrics the business may not generate',
    statement:
      'CEO\'s conference talk references "organic sign-up velocity" and "bottom-up adoption." But the observable sales motion is top-down: founder-led, relationship-driven, conference-originated. The investor-facing narrative may describe aspiration, not operation.',
    claim_ids: ['cl_006'],
    evidence_ids: ['ev_002', 'ev_005'],
    source_ids: ['src_002', 'src_005'],
    inference_label: 'strong_inference',
    confidence: 'medium',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['positioning_gap', 'founder_narrative'],
  },
  {
    signal_id: 'sig_007',
    company_id: COMPANY_ID,
    kind: 'operations',
    title: 'Sales process is high-touch despite self-serve positioning',
    statement:
      'Trustpilot and G2 reviews describe multi-call sales processes, custom demos, and "working with their team to set up attribution models." This is consultative sales, not self-serve. The operational reality is sales-led despite the PLG framing.',
    claim_ids: ['cl_007'],
    evidence_ids: ['ev_009', 'ev_004'],
    source_ids: ['src_004', 'src_009'],
    inference_label: 'direct',
    confidence: 'high',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['customer_voice', 'service_model'],
  },
]

export const fixture: EvalFixture = {
  id: '006-narrative-distribution-mismatch',
  name: 'FlowStack — Narrative-Distribution Mismatch',
  archetype: 'narrative_distribution_mismatch',
  description:
    'Tests detection of the gap between stated GTM narrative and actual distribution. ' +
    'The company claims product-led growth across all channels, but deals originate from ' +
    'founder relationships, outbound sales, and conference connections. The PLG story ' +
    'serves investors; the founder-led motion serves customers.',

  signals,

  expected: {
    gtm_analysis: {
      sales_motion: {
        mode: 'founder_led',
        confidence_min: 'medium',
      },
      buyer_structure: {
        user_buyer_mismatch: false,
      },
      distribution_architecture: {
        primary_channel: 'founder_content',
        fragility_score_min: 0.5,
        fragility_score_max: 1.0,
      },
      founder_dependency: {
        risk_score_min: 0.33,
        risk_score_max: 1.0,
      },
      service_dependency: {
        onboarding_complexity: 'medium',
        implementation_required: true,
        hidden_services_risk_min: 0.25,
      },
      pricing_delivery_fit: {
        delivery_fit_tension: true,
      },
    },
    diagnosis: {
      type: 'narrative_distribution_mismatch',
      confidence_min: 'medium',
    },
    mechanisms: [
      { type: 'investor_signalling', plausibility: 'high' },
      { type: 'category_gravity', plausibility: 'medium' },
      { type: 'buyer_psychology', plausibility: 'medium' },
    ],
    intervention: {
      type: 'positioning_reset',
      expected_impact: 'medium',
      delivery_fit: 'high',
    },
  },
}
