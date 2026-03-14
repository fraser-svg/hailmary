/**
 * Fixture 001: Services Disguised as SaaS
 *
 * Company: "CloudOps Pro" — markets itself as an AI-powered cloud infrastructure
 * automation platform. Evidence reveals that delivery depends on a managed services
 * team, mandatory implementation engagements, and consultant-led configuration.
 *
 * Tests whether the pipeline detects the gap between software positioning and
 * service-dependent delivery, and routes to the correct diagnosis, mechanisms,
 * and intervention.
 */

import type { EvalFixture } from '../types.js'
import type { Signal } from '../../../report/pipeline/extract-signals.js'

const COMPANY_ID = 'eval_cloudops_pro'

const signals: Signal[] = [
  {
    signal_id: 'sig_001',
    company_id: COMPANY_ID,
    kind: 'positioning',
    title: 'Automation narrative exceeds observable product capability',
    statement:
      'Website and press materials describe "fully automated cloud migration" and "zero-touch infrastructure management," but case studies and customer reviews describe multi-week consultant-led engagements for every deployment.',
    claim_ids: ['cl_001'],
    evidence_ids: ['ev_001', 'ev_002'],
    source_ids: ['src_001', 'src_002'],
    inference_label: 'light_inference',
    confidence: 'high',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['service_model', 'positioning_gap'],
  },
  {
    signal_id: 'sig_002',
    company_id: COMPANY_ID,
    kind: 'customer',
    title: 'Customer value attribution credits human consultants',
    statement:
      'Across Trustpilot and G2 reviews, customers consistently credit "the implementation team" and "our dedicated cloud architect" for successful outcomes rather than the platform itself.',
    claim_ids: ['cl_002'],
    evidence_ids: ['ev_003', 'ev_004'],
    source_ids: ['src_003', 'src_004'],
    inference_label: 'direct',
    confidence: 'high',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'mixed',
    tags: ['customer_voice', 'service_model'],
  },
  {
    signal_id: 'sig_003',
    company_id: COMPANY_ID,
    kind: 'talent',
    title: 'Implementation hiring outpaces engineering hiring',
    statement:
      'Of 18 open roles, 11 are in implementation, solutions engineering, and customer success. Only 4 are in product engineering. For a company positioning as a software platform, the hiring ratio reveals service-heavy operations.',
    claim_ids: ['cl_003'],
    evidence_ids: ['ev_005'],
    source_ids: ['src_005'],
    inference_label: 'direct',
    confidence: 'high',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['service_scaling', 'hiring_signal', 'implementation_evidence'],
  },
  {
    signal_id: 'sig_004',
    company_id: COMPANY_ID,
    kind: 'pricing',
    title: 'Mandatory onboarding fees signal service dependency',
    statement:
      'All tiers above "Starter" include mandatory implementation fees ($8,000–$30,000). Self-serve onboarding is not available for the tiers that generate meaningful revenue.',
    claim_ids: ['cl_004'],
    evidence_ids: ['ev_006'],
    source_ids: ['src_006'],
    inference_label: 'direct',
    confidence: 'high',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['service_revenue', 'implementation_evidence'],
  },
  {
    signal_id: 'sig_005',
    company_id: COMPANY_ID,
    kind: 'operations',
    title: 'Case study describes consulting engagement, not product deployment',
    statement:
      'Published case study with FinanceFirst Corp describes a 10-week engagement with dedicated solutions architect, weekly strategy reviews, and custom integration builds — a consulting delivery model, not a software deployment.',
    claim_ids: ['cl_005'],
    evidence_ids: ['ev_007'],
    source_ids: ['src_007'],
    inference_label: 'light_inference',
    confidence: 'medium',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['service_model', 'consulting', 'implementation_evidence'],
  },
  {
    signal_id: 'sig_006',
    company_id: COMPANY_ID,
    kind: 'credibility',
    title: 'Internal perception describes a services business',
    statement:
      'Glassdoor review from current employee: "Great company but we are essentially a managed services shop that happens to have a software product. The product is the sales pitch, the people are the delivery."',
    claim_ids: ['cl_006'],
    evidence_ids: ['ev_008'],
    source_ids: ['src_008'],
    inference_label: 'direct',
    confidence: 'medium',
    relevance: 'high',
    novelty: 'high',
    polarity: 'negative',
    tags: ['culture_signal', 'service_model'],
  },
  {
    signal_id: 'sig_007',
    company_id: COMPANY_ID,
    kind: 'pricing',
    title: 'Services revenue is a material revenue component',
    statement:
      'Implementation fees range from $8K to $30K per customer on paid tiers. With reported 120+ enterprise customers, services revenue could represent 15-25% of total revenue — a meaningful margin drag for a company valued as software.',
    claim_ids: ['cl_007'],
    evidence_ids: ['ev_006', 'ev_009'],
    source_ids: ['src_006', 'src_009'],
    inference_label: 'strong_inference',
    confidence: 'medium',
    relevance: 'medium',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['service_revenue'],
  },
  {
    signal_id: 'sig_008',
    company_id: COMPANY_ID,
    kind: 'leadership',
    title: 'CEO funding narrative contradicts operational reality',
    statement:
      'CEO states Series B funds will "accelerate autonomous infrastructure capabilities," but observable headcount growth is concentrated in implementation and services roles, not AI/ML engineering.',
    claim_ids: ['cl_008'],
    evidence_ids: ['ev_009', 'ev_005'],
    source_ids: ['src_009', 'src_005'],
    inference_label: 'light_inference',
    confidence: 'medium',
    relevance: 'medium',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['positioning_gap', 'hiring_signal'],
  },
]

export const fixture: EvalFixture = {
  id: '001-services-disguised-as-saas',
  name: 'CloudOps Pro — Services Disguised as SaaS',
  archetype: 'services_disguised_as_saas',
  description:
    'Tests detection of service-dependent delivery behind software positioning. ' +
    'Signals span customer reviews, hiring patterns, pricing structure, case studies, ' +
    'and internal culture — all converging on a services reality the narrative denies.',

  signals,

  expected: {
    gtm_analysis: {
      sales_motion: {
        mode: 'hybrid',
        confidence_min: 'low',
      },
      buyer_structure: {
        user_buyer_mismatch: false,
      },
      distribution_architecture: {
        primary_channel: 'unknown',
        fragility_score_min: 0,
        fragility_score_max: 0.5,
      },
      founder_dependency: {
        risk_score_min: 0,
        risk_score_max: 0.33,
      },
      service_dependency: {
        onboarding_complexity: 'high',
        implementation_required: true,
        hidden_services_risk_min: 0.7,
      },
      pricing_delivery_fit: {
        delivery_fit_tension: true,
      },
    },
    diagnosis: {
      type: 'services_disguised_as_saas',
      confidence_min: 'medium',
    },
    mechanisms: [
      { type: 'delivery_constraint', plausibility: 'high' },
      { type: 'investor_signalling', plausibility: 'medium' },
      { type: 'category_gravity', plausibility: 'medium' },
    ],
    intervention: {
      type: 'positioning_reset',
      expected_impact: 'high',
      delivery_fit: 'high',
    },
  },
}
