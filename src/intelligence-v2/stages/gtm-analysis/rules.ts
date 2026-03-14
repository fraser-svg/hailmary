/**
 * GTM Analysis — Decision Rules
 *
 * Each function implements one classification rule from SPEC 005.
 * All logic is deterministic. No LLM calls. No side effects.
 *
 * Rules read Signal tags and statements; they never inspect the dossier directly.
 */

import type {
  Signal,
  Confidence,
  SalesMotionAssessment,
  BuyerStructureAssessment,
  DistributionArchitectureAssessment,
  FounderDependencyAssessment,
  ServiceDependencyAssessment,
  PricingDeliveryFitAssessment,
} from './types.js'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function hasAnyTag(signal: Signal, tags: string[]): boolean {
  return tags.some(t => signal.tags.includes(t))
}

function filterByTags(signals: Signal[], tags: string[]): Signal[] {
  return signals.filter(s => hasAnyTag(s, tags))
}

function collectEvidence(signals: Signal[]): string[] {
  return [...new Set(signals.flatMap(s => s.evidence_ids))]
}

function lowerConfidence(a: Confidence, b: Confidence): Confidence {
  const rank: Record<Confidence, number> = { low: 0, medium: 1, high: 2 }
  return rank[a] <= rank[b] ? a : b
}

// ---------------------------------------------------------------------------
// Rule: Classify Sales Motion
//
// SPEC 005 — Founder-Led Sales:
//   If founder content is the dominant public demand signal AND
//      weak/nonexistent sales team signals AND
//      product requires explanation/demo
//   Then: sales_motion.mode = founder_led
// ---------------------------------------------------------------------------

export function classifySalesMotion(signals: Signal[]): SalesMotionAssessment {
  const founderSignals = filterByTags(signals, [
    'founder_visibility', 'founder_concentration', 'founder_narrative', 'thought_leadership',
  ])
  const salesTeamSignals = filterByTags(signals, ['smb_signal', 'hiring_signal'])
    .filter(s => /sales|ae|account.exec|bdm|sdr|business.dev/i.test(s.statement))
  const plgSignals = filterByTags(signals, ['self_serve', 'plg', 'product_led'])
  const communitySignals = filterByTags(signals, ['community', 'community_led'])

  // Rule: Founder-Led (SPEC 005)
  if (founderSignals.length >= 2 && salesTeamSignals.length === 0) {
    const confidence: Confidence = founderSignals.length >= 3 ? 'high' : 'medium'
    return {
      mode: 'founder_led',
      confidence,
      rationale: `${founderSignals.length} signals indicate founder-mediated demand generation (content, visibility, customer relationships). No dedicated sales team infrastructure observed.`,
      evidence_refs: collectEvidence(founderSignals),
    }
  }

  // Rule: PLG
  if (plgSignals.length >= 2 && founderSignals.length < 2) {
    return {
      mode: 'plg',
      confidence: 'medium',
      rationale: `${plgSignals.length} signals indicate self-serve or product-led acquisition. Limited founder-mediated demand.`,
      evidence_refs: collectEvidence(plgSignals),
    }
  }

  // Rule: Sales-Led
  if (salesTeamSignals.length >= 2 && founderSignals.length < 2) {
    return {
      mode: 'sales_led',
      confidence: 'medium',
      rationale: `${salesTeamSignals.length} signals indicate dedicated sales team motion with limited founder dependency.`,
      evidence_refs: collectEvidence(salesTeamSignals),
    }
  }

  // Rule: Community-Led
  if (communitySignals.length >= 2) {
    return {
      mode: 'community_led',
      confidence: 'low',
      rationale: `Community signals present but insufficient evidence for a strong motion classification.`,
      evidence_refs: collectEvidence(communitySignals),
    }
  }

  // Rule: Founder-Led with partial evidence (one signal is enough if strong)
  if (founderSignals.length === 1 && salesTeamSignals.length === 0) {
    return {
      mode: 'founder_led',
      confidence: 'low',
      rationale: `Single founder visibility signal with no observable sales team. Weak founder-led classification.`,
      evidence_refs: collectEvidence(founderSignals),
    }
  }

  // Default: insufficient signal
  return {
    mode: 'hybrid',
    confidence: 'low',
    rationale: `Mixed or insufficient signals to classify a dominant sales motion.`,
    evidence_refs: collectEvidence(signals.slice(0, 5)),
  }
}

// ---------------------------------------------------------------------------
// Rule: Classify Buyer Structure
//
// SPEC 005 — User/Buyer Mismatch:
//   If evidence points to product being used by technical operators AND
//      pricing/proof language speaks to executives or enterprise buyers
//   Then: user_buyer_mismatch = true
// ---------------------------------------------------------------------------

export function classifyBuyerStructure(signals: Signal[]): BuyerStructureAssessment {
  const customerSignals = filterByTags(signals, ['customer_voice', 'buyer_language'])
  const smbSignals = filterByTags(signals, ['smb_signal', 'segment_alignment', 'customer_concentration'])
  const pricingSignals = signals.filter(s => s.kind === 'pricing')

  // Technical operator evidence
  const technicalUserSignals = customerSignals.filter(s =>
    /technical|developer|operator|engineer|analyst|specialist/i.test(s.statement),
  )

  // Executive or enterprise pricing language
  const executivePricingSignals = pricingSignals.filter(s =>
    /enterprise|executive|c-suite|leadership|vp|cmo|cro|roi|strategic/i.test(s.statement),
  )

  // Mismatch detection: technical users + executive pricing (SPEC 005)
  const technicalWithExecutivePricing =
    technicalUserSignals.length > 0 && executivePricingSignals.length > 0

  // Mismatch detection: SMB-concentrated customers + enterprise positioning
  const smbWithEnterpriseNarrative =
    smbSignals.length >= 2 &&
    signals.some(s =>
      s.kind === 'positioning' && /enterprise|platform|scale/i.test(s.statement),
    )

  const user_buyer_mismatch = technicalWithExecutivePricing || smbWithEnterpriseNarrative

  // Infer roles from observable evidence
  let primary_user: string | null = null
  let economic_buyer: string | null = null

  if (technicalUserSignals.length > 0) {
    primary_user = 'Technical operator'
  } else if (smbSignals.length >= 2) {
    primary_user = 'SMB team operator'
  }

  if (executivePricingSignals.length > 0) {
    economic_buyer = 'Senior executive / budget owner'
  } else if (smbSignals.length >= 2) {
    economic_buyer = 'SMB owner / ops lead'
  }

  const mismatchEvidence = collectEvidence([
    ...technicalUserSignals,
    ...executivePricingSignals,
    ...smbSignals,
  ])
  const allEvidence = collectEvidence([...customerSignals, ...pricingSignals, ...smbSignals])

  const confidence: Confidence =
    user_buyer_mismatch && mismatchEvidence.length >= 2 ? 'medium' : 'low'

  const rationale = user_buyer_mismatch
    ? [
        technicalWithExecutivePricing &&
          `Technical operator evidence (${technicalUserSignals.length} signals) conflicts with executive-level pricing language (${executivePricingSignals.length} signals).`,
        smbWithEnterpriseNarrative &&
          `SMB customer concentration (${smbSignals.length} signals) conflicts with enterprise positioning narrative.`,
      ]
        .filter(Boolean)
        .join(' ')
    : 'No clear user/buyer mismatch detected from available signals.'

  return {
    primary_user,
    economic_buyer,
    champion: null,
    user_buyer_mismatch,
    confidence,
    rationale,
    evidence_refs: user_buyer_mismatch ? mismatchEvidence : allEvidence,
  }
}

// ---------------------------------------------------------------------------
// Rule: Classify Distribution Architecture
//
// SPEC 005 — Distribution Fragility:
//   If majority of visible demand signals are founder-mediated AND
//      there is limited evidence of repeatable channel infrastructure
//   Then: fragility_score > 0.7
// ---------------------------------------------------------------------------

export function classifyDistributionArchitecture(
  signals: Signal[],
): DistributionArchitectureAssessment {
  const founderSignals = filterByTags(signals, [
    'founder_visibility', 'founder_concentration', 'thought_leadership', 'founder_narrative',
  ])
  const communitySignals = filterByTags(signals, ['community', 'community_led'])
  const productSignals = filterByTags(signals, ['plg', 'product_led', 'self_serve'])
  const outboundSignals = filterByTags(signals, ['smb_signal', 'hiring_signal']).filter(s =>
    /outbound|sdr|sales|cold|prospecting/i.test(s.statement),
  )
  const partnerSignals = filterByTags(signals, ['partner', 'integration', 'ecosystem'])
  const paidSignals = filterByTags(signals, ['paid', 'advertising'])

  const channelCounts: Record<string, Signal[]> = {
    founder_content: founderSignals,
    community: communitySignals,
    product: productSignals,
    outbound: outboundSignals,
    partnerships: partnerSignals,
    paid: paidSignals,
  }

  // Primary channel: highest signal count
  const sorted = Object.entries(channelCounts).sort(([, a], [, b]) => b.length - a.length)
  const primaryEntry = sorted.find(([, sigs]) => sigs.length > 0)
  const primary_channel =
    (primaryEntry?.[0] as DistributionArchitectureAssessment['primary_channel']) ?? 'unknown'

  const secondary_channels = sorted
    .slice(1)
    .filter(([ch, sigs]) => sigs.length > 0 && ch !== primaryEntry?.[0])
    .map(([ch]) => ch)

  // Rule: Distribution Fragility (SPEC 005)
  const totalSignalCount = Object.values(channelCounts).reduce((n, s) => n + s.length, 0)
  const founderProportion = totalSignalCount > 0 ? founderSignals.length / totalSignalCount : 0

  const fragility_reasons: string[] = []
  let fragility_score = 0

  if (founderProportion > 0.5) {
    fragility_score += 0.5
    fragility_reasons.push(
      `${Math.round(founderProportion * 100)}% of demand signals are founder-mediated`,
    )
  }

  if (secondary_channels.length === 0) {
    fragility_score += 0.2
    fragility_reasons.push('No secondary distribution channels observed')
  }

  if (partnerSignals.length === 0 && productSignals.length === 0) {
    fragility_score += 0.1
    fragility_reasons.push('No inbound or partnership channel infrastructure observed')
  }

  if (paidSignals.length === 0 && communitySignals.length === 0) {
    fragility_score += 0.1
    fragility_reasons.push('No paid or community demand mechanisms observed')
  }

  fragility_score = Math.min(Math.round(fragility_score * 100) / 100, 1.0)

  const activeSignals = Object.values(channelCounts).flat()
  const confidence: Confidence =
    activeSignals.length >= 4 ? 'medium' : activeSignals.length >= 2 ? 'low' : 'low'

  return {
    primary_channel,
    secondary_channels,
    fragility_score,
    fragility_reasons,
    confidence,
    evidence_refs: collectEvidence(activeSignals),
  }
}

// ---------------------------------------------------------------------------
// Rule: Classify Founder Dependency
// ---------------------------------------------------------------------------

export function classifyFounderDependency(signals: Signal[]): FounderDependencyAssessment {
  const narrativeSignals = filterByTags(signals, [
    'founder_visibility', 'founder_narrative', 'founder_concentration',
  ])
  const demandSignals = filterByTags(signals, [
    'thought_leadership', 'founder_dependency',
  ])
  const salesSignals = filterByTags(signals, [
    'founder_involvement', 'founder_dependency',
  ]).filter(s => s.kind === 'customer')

  const narrative_dependency = narrativeSignals.length >= 2
  const demand_dependency = demandSignals.length >= 2
  const sales_dependency = salesSignals.length >= 2

  const dependencyCount = [narrative_dependency, demand_dependency, sales_dependency].filter(
    Boolean,
  ).length
  const risk_score = Math.round((dependencyCount / 3) * 100) / 100

  const allSignals = [...narrativeSignals, ...demandSignals, ...salesSignals]

  const rationale = [
    narrative_dependency &&
      `Narrative dependency: ${narrativeSignals.length} signals show the founder dominates external communications.`,
    demand_dependency &&
      `Demand dependency: thought leadership and content signals are concentrated in the founder.`,
    sales_dependency &&
      `Sales dependency: ${salesSignals.length} customer signals attribute value to the founder personally.`,
    dependencyCount === 0 && 'No meaningful founder dependency signals identified.',
  ]
    .filter(Boolean)
    .join(' ')

  return {
    narrative_dependency,
    demand_dependency,
    sales_dependency,
    risk_score,
    rationale,
    evidence_refs: collectEvidence(allSignals),
  }
}

// ---------------------------------------------------------------------------
// Rule: Classify Service Dependency
//
// SPEC 005 — Services Disguised as SaaS:
//   If onboarding complexity is medium/high AND
//      implementation/integration appears necessary AND
//      product is marketed as software scale
//   Then: increase hidden_services_risk
//         emit tension: software_claim_vs_delivery_reality
// ---------------------------------------------------------------------------

export function classifyServiceDependency(signals: Signal[]): ServiceDependencyAssessment {
  const serviceDeliverySignals = filterByTags(signals, [
    'service_model', 'consulting', 'implementation_evidence',
  ])
  const hiringServiceSignals = filterByTags(signals, ['service_scaling']).filter(
    s => s.kind === 'talent',
  )
  const pricingServiceSignals = filterByTags(signals, [
    'service_revenue', 'implementation_evidence',
  ]).filter(s => s.kind === 'pricing')
  const internalPerceptionSignals = filterByTags(signals, ['culture_signal'])

  // Onboarding complexity: inferred from delivery evidence strength
  let onboarding_complexity: ServiceDependencyAssessment['onboarding_complexity'] = 'unknown'
  if (serviceDeliverySignals.length >= 2 && hiringServiceSignals.length >= 1) {
    onboarding_complexity = 'high'
  } else if (serviceDeliverySignals.length >= 1 || hiringServiceSignals.length >= 1) {
    onboarding_complexity = 'medium'
  } else if (signals.some(s => s.kind === 'pricing' || s.kind === 'product')) {
    onboarding_complexity = 'low'
  }

  // Implementation required: triggered by pricing fees or case study delivery evidence
  const implementation_required =
    pricingServiceSignals.length > 0 || serviceDeliverySignals.length > 0

  // Hidden services risk score (SPEC 005)
  let hidden_services_risk = 0
  if (onboarding_complexity === 'high') hidden_services_risk += 0.4
  else if (onboarding_complexity === 'medium') hidden_services_risk += 0.25
  if (implementation_required) hidden_services_risk += 0.3
  if (internalPerceptionSignals.length > 0) hidden_services_risk += 0.2
  if (hiringServiceSignals.length >= 2) hidden_services_risk += 0.1
  hidden_services_risk = Math.min(Math.round(hidden_services_risk * 100) / 100, 1.0)

  const allSignals = [
    ...serviceDeliverySignals,
    ...hiringServiceSignals,
    ...pricingServiceSignals,
    ...internalPerceptionSignals,
  ]

  const rationale = [
    `Onboarding complexity: ${onboarding_complexity}.`,
    implementation_required
      ? 'Implementation appears required based on pricing structure or delivery evidence.'
      : 'No mandatory implementation signals found.',
    `Hidden services risk: ${hidden_services_risk}.`,
    hidden_services_risk >= 0.5
      ? 'Service delivery risk is significant — delivery model may not match software positioning.'
      : '',
  ]
    .filter(Boolean)
    .join(' ')

  return {
    onboarding_complexity,
    implementation_required,
    hidden_services_risk,
    rationale,
    evidence_refs: collectEvidence(allSignals),
  }
}

// ---------------------------------------------------------------------------
// Rule: Classify Pricing/Delivery Fit
// ---------------------------------------------------------------------------

export function classifyPricingDeliveryFit(signals: Signal[], serviceDependency: ServiceDependencyAssessment): PricingDeliveryFitAssessment {
  const pricingSignals = signals.filter(s => s.kind === 'pricing')
  const segmentSignals = filterByTags(signals, ['smb_signal', 'segment_alignment'])
  const deliverySignals = filterByTags(signals, [
    'service_model', 'implementation_evidence', 'consulting',
  ])

  const pricingText = pricingSignals.map(s => s.statement).join(' ')

  // Pricing model classification from statement text
  let pricing_model: PricingDeliveryFitAssessment['pricing_model'] = 'unknown'
  if (/\bseat\b|per.user|per.seat|user.cap/i.test(pricingText)) {
    pricing_model = 'seat'
  } else if (/usage|per.use|consumption|credit/i.test(pricingText)) {
    pricing_model = 'usage'
  } else if (/custom|enterprise.quote|negotiated|contact.us/i.test(pricingText)) {
    pricing_model = 'custom'
  } else if (pricingSignals.length > 0) {
    pricing_model = 'hybrid'
  }

  // ROI clarity: high when pricing and segment signals are aligned
  let roi_clarity: PricingDeliveryFitAssessment['roi_clarity'] = 'unknown'
  if (segmentSignals.length >= 2 && pricing_model !== 'unknown') {
    roi_clarity = 'medium'
  } else if (pricingSignals.length === 0) {
    roi_clarity = 'low'
  } else if (pricing_model === 'unknown') {
    roi_clarity = 'low'
  }

  // Delivery fit tension: specific SPEC 005 conditions (not mere co-presence of signals)
  const delivery_fit_tension =
    (pricing_model === 'seat' && serviceDependency.onboarding_complexity === 'high') ||
    (pricing_model === 'usage' && serviceDependency.implementation_required) ||
    (roi_clarity === 'low' && pricing_model !== 'custom')

  const allSignals = [...pricingSignals, ...segmentSignals, ...deliverySignals]
  const confidence: Confidence = lowerConfidence(
    pricingSignals.length >= 2 ? 'medium' : 'low',
    deliverySignals.length >= 1 ? 'medium' : 'low',
  )

  const rationale = [
    `Pricing model: ${pricing_model}.`,
    `ROI clarity: ${roi_clarity}.`,
    delivery_fit_tension
      ? 'Delivery fit tension detected: service delivery evidence conflicts with software pricing model.'
      : 'No delivery fit tension detected.',
  ].join(' ')

  return {
    pricing_model,
    roi_clarity,
    delivery_fit_tension,
    rationale,
    evidence_refs: collectEvidence(allSignals),
  }
}
