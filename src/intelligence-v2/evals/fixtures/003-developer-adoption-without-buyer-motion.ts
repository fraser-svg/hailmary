/**
 * Fixture 003: Developer Adoption Without Buyer Motion
 *
 * Company: "QueryForge" — an open-source database query optimization tool with
 * strong developer adoption (GitHub stars, community contributions, DevRel presence).
 * The product is used by engineers daily, but purchasing decisions sit with VPs of
 * Engineering and CTOs who the product never reaches. No buyer-facing proof exists.
 *
 * Tests whether the pipeline detects the user/buyer mismatch and routes to
 * sales_motion_redesign intervention.
 */

import type { EvalFixture } from '../types.js'
import type { Signal } from '../../../report/pipeline/extract-signals.js'

const COMPANY_ID = 'eval_queryforge'

const signals: Signal[] = [
  {
    signal_id: 'sig_001',
    company_id: COMPANY_ID,
    kind: 'product',
    title: 'Strong developer adoption with no commercial conversion path',
    statement:
      'QueryForge has 12,000+ GitHub stars, 400+ contributors, and active community Discord (3,200 members). Yet the commercial "Teams" plan has fewer than 50 paying customers. Developer enthusiasm is not converting to organisational purchases.',
    claim_ids: ['cl_001'],
    evidence_ids: ['ev_001', 'ev_002'],
    source_ids: ['src_001', 'src_002'],
    inference_label: 'direct',
    confidence: 'high',
    relevance: 'high',
    novelty: 'high',
    polarity: 'negative',
    tags: ['plg', 'product_led', 'self_serve'],
  },
  {
    signal_id: 'sig_002',
    company_id: COMPANY_ID,
    kind: 'customer',
    title: 'Users are technical operators, not budget owners',
    statement:
      'Community feedback and user profiles consistently show database engineers, backend developers, and DevOps specialists as primary users. These roles typically lack purchasing authority for team-level tooling decisions.',
    claim_ids: ['cl_002'],
    evidence_ids: ['ev_003', 'ev_004'],
    source_ids: ['src_003', 'src_004'],
    inference_label: 'direct',
    confidence: 'high',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['customer_voice', 'buyer_language'],
  },
  {
    signal_id: 'sig_003',
    company_id: COMPANY_ID,
    kind: 'pricing',
    title: 'Enterprise pricing language targets executives the product does not reach',
    statement:
      'The Enterprise tier page uses language like "strategic database infrastructure," "executive visibility dashboards," and "ROI-driven query optimization" — language that speaks to VP/CTO buyers. But the product experience, documentation, and community are entirely developer-facing.',
    claim_ids: ['cl_003'],
    evidence_ids: ['ev_005'],
    source_ids: ['src_005'],
    inference_label: 'light_inference',
    confidence: 'high',
    relevance: 'high',
    novelty: 'high',
    polarity: 'negative',
    tags: ['buyer_language', 'segment_alignment'],
  },
  {
    signal_id: 'sig_004',
    company_id: COMPANY_ID,
    kind: 'positioning',
    title: 'Marketing oscillates between developer and enterprise audiences',
    statement:
      'Blog content alternates between deep technical posts (query plan optimization, index strategies) and executive-facing content (total cost of ownership, infrastructure ROI). Neither audience receives a consistent narrative. The positioning serves two masters.',
    claim_ids: ['cl_004'],
    evidence_ids: ['ev_006', 'ev_007'],
    source_ids: ['src_006', 'src_007'],
    inference_label: 'light_inference',
    confidence: 'medium',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['positioning_gap'],
  },
  {
    signal_id: 'sig_005',
    company_id: COMPANY_ID,
    kind: 'credibility',
    title: 'Case studies are developer success stories, not business outcome proof',
    statement:
      'All three published case studies describe technical improvements: "reduced query latency by 40%," "eliminated N+1 queries across 200 endpoints." None quantifies business impact in terms a buyer would use: revenue protected, downtime cost avoided, engineer hours saved.',
    claim_ids: ['cl_005'],
    evidence_ids: ['ev_008'],
    source_ids: ['src_008'],
    inference_label: 'light_inference',
    confidence: 'medium',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['proof_gap', 'buyer_language'],
  },
  {
    signal_id: 'sig_006',
    company_id: COMPANY_ID,
    kind: 'gtm',
    title: 'No observable sales motion targeting economic buyers',
    statement:
      'No outbound sales team, no account executive roles, no BDR function. The GTM motion is entirely community-driven and product-led. There is no mechanism to reach or convert economic buyers who do not self-select through developer channels.',
    claim_ids: ['cl_006'],
    evidence_ids: ['ev_009'],
    source_ids: ['src_009'],
    inference_label: 'direct',
    confidence: 'high',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['plg', 'community', 'community_led'],
  },
  {
    signal_id: 'sig_007',
    company_id: COMPANY_ID,
    kind: 'customer',
    title: 'Free-tier usage dwarfs paid conversion',
    statement:
      'Company reports 8,000+ monthly active users on the free tier. Paid Teams plan has ~50 customers. The 0.6% conversion rate suggests the product delivers enough value for free that individual developers have no incentive to trigger an organisational purchase.',
    claim_ids: ['cl_007'],
    evidence_ids: ['ev_010', 'ev_002'],
    source_ids: ['src_002', 'src_010'],
    inference_label: 'light_inference',
    confidence: 'medium',
    relevance: 'high',
    novelty: 'medium',
    polarity: 'negative',
    tags: ['self_serve', 'product_led'],
  },
]

export const fixture: EvalFixture = {
  id: '003-developer-adoption-without-buyer-motion',
  name: 'QueryForge — Developer Adoption Without Buyer Motion',
  archetype: 'developer_adoption_without_buyer_motion',
  description:
    'Tests detection of the user/buyer mismatch pattern. Developers adopt and love the product, ' +
    'but no mechanism exists to convert technical enthusiasm into organisational purchasing decisions. ' +
    'Pricing speaks to executives the product never reaches.',

  signals,

  expected: {
    gtm_analysis: {
      sales_motion: {
        mode: 'plg',
        confidence_min: 'medium',
      },
      buyer_structure: {
        user_buyer_mismatch: true,
      },
      distribution_architecture: {
        primary_channel: 'community',
        fragility_score_min: 0,
        fragility_score_max: 0.5,
      },
      founder_dependency: {
        risk_score_min: 0,
        risk_score_max: 0.33,
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
      type: 'developer_adoption_without_buyer_motion',
      confidence_min: 'medium',
    },
    mechanisms: [
      { type: 'buyer_psychology', plausibility: 'high' },
      { type: 'proof_gap', plausibility: 'medium' },
      { type: 'category_gravity', plausibility: 'medium' },
    ],
    intervention: {
      type: 'sales_motion_redesign',
      expected_impact: 'high',
      delivery_fit: 'high',
    },
  },
}
