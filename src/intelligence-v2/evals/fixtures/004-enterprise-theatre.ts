/**
 * Fixture 004: Enterprise Theatre
 *
 * Company: "ScaleGrid" — a workflow automation tool that positions as an
 * enterprise platform. Pricing page has "Enterprise" tier with SSO and SLAs.
 * Press coverage mentions "enterprise customers." But observable evidence
 * shows SMB customer concentration, no enterprise case studies, no
 * enterprise sales infrastructure, and startup-scale delivery capacity.
 *
 * Tests whether the pipeline detects the gap between enterprise positioning
 * and SMB operational reality, and routes to icp_redefinition intervention.
 */

import type { EvalFixture } from '../types.js'
import type { Signal } from '../../../report/pipeline/extract-signals.js'

const COMPANY_ID = 'eval_scalegrid'

const signals: Signal[] = [
  {
    signal_id: 'sig_001',
    company_id: COMPANY_ID,
    kind: 'positioning',
    title: 'Enterprise language dominates messaging without enterprise evidence',
    statement:
      'Website header: "Enterprise Workflow Automation Platform." Pricing page features Enterprise tier at custom pricing with SSO, SLAs, and dedicated support. But no enterprise logos, no enterprise case studies, and no evidence of deals above 100 seats.',
    claim_ids: ['cl_001'],
    evidence_ids: ['ev_001', 'ev_002'],
    source_ids: ['src_001', 'src_002'],
    inference_label: 'light_inference',
    confidence: 'high',
    relevance: 'high',
    novelty: 'high',
    polarity: 'negative',
    tags: ['segment_alignment', 'positioning_gap'],
  },
  {
    signal_id: 'sig_002',
    company_id: COMPANY_ID,
    kind: 'customer',
    title: 'Observable customer base is SMB-concentrated',
    statement:
      'Customer testimonials and case studies feature companies with 20-80 employees. G2 reviews are from "small business" and "mid-market" segments. No reviews from companies with 500+ employees. The customer evidence base is entirely SMB.',
    claim_ids: ['cl_002'],
    evidence_ids: ['ev_003', 'ev_004'],
    source_ids: ['src_003', 'src_004'],
    inference_label: 'direct',
    confidence: 'high',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['smb_signal', 'customer_concentration', 'customer_voice'],
  },
  {
    signal_id: 'sig_003',
    company_id: COMPANY_ID,
    kind: 'customer',
    title: 'SMB customer concentration conflicts with enterprise pricing',
    statement:
      'Average deal size inferred from pricing tiers and review data suggests $200-$800/month customers. Enterprise tier pricing starts at "custom" but no evidence exists that any customer is on it. The pricing architecture serves SMBs despite the enterprise label.',
    claim_ids: ['cl_003'],
    evidence_ids: ['ev_004', 'ev_005'],
    source_ids: ['src_004', 'src_005'],
    inference_label: 'light_inference',
    confidence: 'medium',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['smb_signal', 'segment_alignment'],
  },
  {
    signal_id: 'sig_004',
    company_id: COMPANY_ID,
    kind: 'positioning',
    title: 'Press coverage echoes enterprise narrative without validation',
    statement:
      'TechCrunch coverage of Series A describes ScaleGrid as "building enterprise-grade workflow automation." The article quotes the CEO using "enterprise" 8 times but includes no named enterprise customers, no ARR metrics, and no enterprise-specific product capabilities.',
    claim_ids: ['cl_004'],
    evidence_ids: ['ev_006'],
    source_ids: ['src_006'],
    inference_label: 'light_inference',
    confidence: 'medium',
    relevance: 'medium',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['positioning_gap'],
  },
  {
    signal_id: 'sig_005',
    company_id: COMPANY_ID,
    kind: 'talent',
    title: 'No enterprise sales infrastructure exists',
    statement:
      'Team page shows 28 employees. No enterprise AE, solutions engineer, or sales engineer roles. No VP of Sales. One "growth lead" handles both marketing and sales. This is an SMB sales structure, not enterprise.',
    claim_ids: ['cl_005'],
    evidence_ids: ['ev_007'],
    source_ids: ['src_007'],
    inference_label: 'direct',
    confidence: 'high',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['hiring_signal', 'smb_signal'],
  },
  {
    signal_id: 'sig_006',
    company_id: COMPANY_ID,
    kind: 'credibility',
    title: 'Enterprise features listed but not validated by customer evidence',
    statement:
      'Enterprise tier lists SSO, SCIM, audit logs, and SLAs. No review mentions using these features. No case study describes an enterprise compliance or security evaluation. Features exist on the pricing page but not in observable customer experience.',
    claim_ids: ['cl_006'],
    evidence_ids: ['ev_002', 'ev_003'],
    source_ids: ['src_002', 'src_003'],
    inference_label: 'light_inference',
    confidence: 'medium',
    relevance: 'medium',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['proof_gap', 'segment_alignment'],
  },
  {
    signal_id: 'sig_007',
    company_id: COMPANY_ID,
    kind: 'leadership',
    title: 'Founder frames company for investor audience, not enterprise buyers',
    statement:
      'CEO LinkedIn posts and podcast appearances focus on "disrupting the enterprise workflow space" and "our enterprise vision." The audience is investors and press, not enterprise procurement teams. Enterprise language serves fundraising, not sales.',
    claim_ids: ['cl_007'],
    evidence_ids: ['ev_008', 'ev_006'],
    source_ids: ['src_008', 'src_006'],
    inference_label: 'light_inference',
    confidence: 'medium',
    relevance: 'medium',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['founder_visibility', 'positioning_gap'],
  },
]

export const fixture: EvalFixture = {
  id: '004-enterprise-theatre',
  name: 'ScaleGrid — Enterprise Theatre',
  archetype: 'enterprise_theatre',
  description:
    'Tests detection of enterprise positioning without enterprise substance. ' +
    'The company uses enterprise language across website, press, and investor communications, ' +
    'but observable customer evidence, hiring patterns, and delivery capacity are all SMB-scale.',

  signals,

  expected: {
    gtm_analysis: {
      sales_motion: {
        mode: 'founder_led',
        confidence_min: 'low',
      },
      buyer_structure: {
        user_buyer_mismatch: true,
      },
      distribution_architecture: {
        primary_channel: 'founder_content',
        fragility_score_min: 0.3,
        fragility_score_max: 0.9,
      },
      founder_dependency: {
        risk_score_min: 0,
        risk_score_max: 0.67,
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
      type: 'enterprise_theatre',
      confidence_min: 'medium',
    },
    mechanisms: [
      { type: 'investor_signalling', plausibility: 'high' },
      { type: 'category_gravity', plausibility: 'medium' },
      { type: 'local_success_trap', plausibility: 'medium' },
    ],
    intervention: {
      type: 'icp_redefinition',
      expected_impact: 'medium',
      delivery_fit: 'high',
    },
  },
}
