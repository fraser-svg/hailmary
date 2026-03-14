/**
 * Mechanism Map
 *
 * For each DiagnosisType, defines which 2–3 MechanismTypes explain it,
 * their plausibility, and the statement that articulates the causal force.
 *
 * Design rules:
 *   - Exactly 3 entries per diagnosis (the stage trims to 2 if evidence is thin)
 *   - Ordered by plausibility descending — first entry is always the primary mechanism
 *   - Statements name the force, explain how it produces the diagnosis, and
 *     remain psychologically plausible without LLM assistance
 *   - No mechanism may contradict the diagnosis it explains
 */

import type { DiagnosisType, MechanismType, Plausibility } from './types.js'

export interface MechanismTemplate {
  type: MechanismType
  plausibility: Plausibility
  statement: string
}

const MAP: Record<DiagnosisType, [MechanismTemplate, MechanismTemplate, MechanismTemplate]> = {
  // -------------------------------------------------------------------------
  // founder_led_sales_ceiling
  //
  // Growth cannot exceed founder attention. Three forces produce this:
  //   1. Founder is the trust asset (lock-in)
  //   2. Early customer pattern embedded expectations (local success trap)
  //   3. No institutional proof to replace founder credibility (proof gap)
  // -------------------------------------------------------------------------
  founder_led_sales_ceiling: [
    {
      type: 'founder_lock_in',
      plausibility: 'high',
      statement:
        'The founder is the primary trust asset in the sales process. Prospects buy access to the founder\'s judgment, not a product. This makes founder involvement structurally non-optional at the deal level — a sales team cannot close without replicating credibility that belongs to one person.',
    },
    {
      type: 'local_success_trap',
      plausibility: 'medium',
      statement:
        'Early customers were won through founder relationships and direct access, which created a referral pattern and an expectation of the same. The company optimised for what worked early rather than building a motion a team could run. That pattern is now embedded in how the pipeline fills and closes.',
    },
    {
      type: 'proof_gap',
      plausibility: 'medium',
      statement:
        'The company lacks the case study depth, third-party validation, and scalable proof architecture that would allow a sales team to close independently. Without institutional proof, the founder\'s personal credibility remains the only available trust-building asset.',
    },
  ],

  // -------------------------------------------------------------------------
  // services_disguised_as_saas
  //
  // Software positioning masks a service delivery reality. Three forces:
  //   1. The product genuinely requires human involvement (delivery constraint)
  //   2. SaaS multiples drive the narrative (investor signalling)
  //   3. Market categories pull positioning up (category gravity)
  // -------------------------------------------------------------------------
  services_disguised_as_saas: [
    {
      type: 'delivery_constraint',
      plausibility: 'high',
      statement:
        'The product cannot deliver its promised outcome without significant human involvement in configuration, onboarding, or ongoing management. This is a structural constraint, not a maturity issue — the workflow complexity requires expert judgment that the software does not yet encode.',
    },
    {
      type: 'investor_signalling',
      plausibility: 'medium',
      statement:
        'SaaS valuation multiples are substantially higher than services multiples. Software positioning — even when delivery is primarily human — signals scalability to investors and commands higher valuations. The narrative serves the cap table, not the customer.',
    },
    {
      type: 'category_gravity',
      plausibility: 'medium',
      statement:
        'The category the company operates in is dominated by software-first language. Competitors position as SaaS; the market expects SaaS; the company follows the category convention regardless of whether its delivery model supports that framing.',
    },
  ],

  // -------------------------------------------------------------------------
  // developer_adoption_without_buyer_motion
  //
  // Technical adoption is not reaching the buyer. Three forces:
  //   1. User and buyer have different decision logic (buyer psychology)
  //   2. No proof in the buyer's language (proof gap)
  //   3. Developer category doesn't translate to procurement (category gravity)
  // -------------------------------------------------------------------------
  developer_adoption_without_buyer_motion: [
    {
      type: 'buyer_psychology',
      plausibility: 'high',
      statement:
        'Technical users and economic buyers operate with entirely different decision criteria. Developers adopt for capability; buyers purchase for business outcomes. The product reaches one and speaks its language, but the conversion path to the other does not exist. Adoption and purchase are not the same motion.',
    },
    {
      type: 'proof_gap',
      plausibility: 'medium',
      statement:
        'There is no proof architecture that translates developer adoption into the ROI language an economic buyer requires. Case studies, outcome metrics, and business-case templates are missing or framed for a technical audience. The buyer cannot justify the purchase without evidence in their own language.',
    },
    {
      type: 'category_gravity',
      plausibility: 'medium',
      statement:
        'The product is positioned in a developer tools or technical infrastructure category that does not naturally map to procurement workflows. Buyers in this space default to bottom-up adoption assumptions — they wait for internal demand rather than initiating evaluation — which only works if someone builds the bridge from usage to purchase.',
    },
  ],

  // -------------------------------------------------------------------------
  // enterprise_theatre
  //
  // Enterprise positioning without enterprise capability. Three forces:
  //   1. Enterprise narrative signals ambition to investors/press (investor signalling)
  //   2. Market prestige pulls positioning toward enterprise (category gravity)
  //   3. A few enterprise-sounding wins created false signal (local success trap)
  // -------------------------------------------------------------------------
  enterprise_theatre: [
    {
      type: 'investor_signalling',
      plausibility: 'high',
      statement:
        'Enterprise positioning signals seriousness, scale ambition, and large ACV potential — all of which attract investor interest and press coverage. The enterprise narrative is performing for an audience of investors and analysts, not demonstrating capability to enterprise buyers.',
    },
    {
      type: 'category_gravity',
      plausibility: 'medium',
      statement:
        'The category the company occupies rewards enterprise positioning with higher perceived legitimacy. Competitors use enterprise language; analysts frame the space in enterprise terms; the company follows the category convention to remain credible, regardless of actual enterprise readiness.',
    },
    {
      type: 'local_success_trap',
      plausibility: 'medium',
      statement:
        'One or two enterprise-adjacent deals — possibly through founder relationships — created momentum in enterprise language that does not reflect systematic capability. Those wins are cited as evidence of enterprise fit even though they were won through conditions that cannot be repeated at scale.',
    },
  ],

  // -------------------------------------------------------------------------
  // distribution_fragility
  //
  // Growth is concentrated in a single breakable channel. Three forces:
  //   1. The founder is the channel (founder lock-in)
  //   2. The single channel worked so it was optimised instead of diversified (local success trap)
  //   3. Delivery model requires the same relationships the channel depends on (delivery constraint)
  // -------------------------------------------------------------------------
  distribution_fragility: [
    {
      type: 'founder_lock_in',
      plausibility: 'high',
      statement:
        'The founder is the primary distribution mechanism — generating demand through content, relationships, or personal credibility. This makes the channel inherently non-scalable and non-transferable. Any growth in distribution capacity requires the founder\'s direct participation.',
    },
    {
      type: 'local_success_trap',
      plausibility: 'medium',
      statement:
        'A single acquisition channel produced early growth, so the company invested more in that channel rather than building alternatives. Path dependency now makes diversification feel costly and risky — but the concentration it created is a larger structural risk than the cost of diversification.',
    },
    {
      type: 'delivery_constraint',
      plausibility: 'medium',
      statement:
        'The delivery model requires the same high-trust relationships that the distribution channel depends on. New channels would require different buyer relationships and different onboarding models — changes that the current delivery architecture does not support without significant rebuilding.',
    },
  ],

  // -------------------------------------------------------------------------
  // narrative_distribution_mismatch
  //
  // What the company says about how it sells differs from how it actually sells.
  // Three forces:
  //   1. The narrative serves investors/press (investor signalling)
  //   2. Market category conventions pull the story (category gravity)
  //   3. Buyers tell the company what it wants to hear (buyer psychology)
  // -------------------------------------------------------------------------
  narrative_distribution_mismatch: [
    {
      type: 'investor_signalling',
      plausibility: 'high',
      statement:
        'The stated go-to-market narrative — typically scalable, inbound, or product-led — serves investor expectations about how modern software companies grow. The actual distribution — often founder-mediated, referral-heavy, or service-dependent — reflects customer reality. Both narratives persist because they serve different audiences.',
    },
    {
      type: 'category_gravity',
      plausibility: 'medium',
      statement:
        'The category the company operates in has a dominant narrative about how companies in this space go to market. The company has adopted that narrative as its own, even though its actual distribution evolved differently. The story is borrowed from the category; the motion is inherited from necessity.',
    },
    {
      type: 'buyer_psychology',
      plausibility: 'medium',
      statement:
        'Buyers frequently affirm the company\'s preferred narrative during discovery — they say they found the product through the channel the company believes in. This creates false signal about distribution effectiveness. The company optimises for a narrative that buyers validate but that does not accurately describe how deals actually originate.',
    },
  ],
}

export function getMechanismTemplates(
  diagnosisType: DiagnosisType,
): [MechanismTemplate, MechanismTemplate, MechanismTemplate] {
  return MAP[diagnosisType]
}
