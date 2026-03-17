/**
 * Adapter: Report Pipeline → Intelligence-V2 Types
 *
 * The report pipeline produces Tensions and Patterns with a different schema
 * than intelligence-v2 expects. This adapter converts between them.
 *
 * Key transformations:
 *   - Tension: field renaming (tension_id → id, evidence_ids → evidence_refs)
 *   - Pattern: field renaming + archetype classification
 *
 * The archetype classification is the critical step. Report patterns have
 * generic pattern_types (contradiction, gap, dependency, etc.). Intelligence-v2
 * needs specific archetypes (founder_led_sales_ceiling, services_disguised_as_saas, etc.).
 * Classification uses the pattern's constituent tension types + GTM analysis signals.
 */

import type { Tension as ReportTension, TensionType as ReportTensionType } from '../report/pipeline/detect-tensions.js'
import type { Pattern as ReportPattern } from '../report/pipeline/detect-patterns.js'
import type { Tension as V2Tension, TensionType as V2TensionType } from './types/tension.js'
import type { Pattern as V2Pattern, PatternArchetype } from './types/pattern.js'
import type { GTMAnalysis } from './types/gtm-analysis.js'
import type { Confidence } from './types/shared.js'

// ---------------------------------------------------------------------------
// Tension type mapping
// ---------------------------------------------------------------------------

const TENSION_TYPE_MAP: Record<ReportTensionType, V2TensionType> = {
  // Service/delivery tensions
  automation_vs_service: 'software_claim_vs_delivery_reality',
  claim_vs_reality: 'software_claim_vs_delivery_reality',
  positioning_vs_delivery: 'product_led_claim_vs_service_onboarding',

  // Enterprise/founder narrative tensions
  positioning_vs_customer_base: 'enterprise_narrative_vs_founder_distribution',
  ambition_vs_proof: 'enterprise_narrative_vs_founder_distribution',
  founder_credibility_vs_institutional_depth: 'enterprise_narrative_vs_founder_distribution',
  personal_brand_vs_company_identity: 'enterprise_narrative_vs_founder_distribution',

  // Growth/distribution fragility tensions
  narrative_scale_vs_operations: 'growth_ambition_vs_distribution_fragility',
  narrative_authority_vs_operational_scale: 'growth_ambition_vs_distribution_fragility',
  leadership_concentration_vs_scaling: 'growth_ambition_vs_distribution_fragility',
  growth_vs_readiness: 'growth_ambition_vs_distribution_fragility',

  // Narrative/distribution mismatch tensions
  vision_vs_execution: 'narrative_vs_distribution',
  credibility_vs_claim: 'narrative_vs_distribution',
  positioning_vs_market_fit: 'narrative_vs_distribution',
  breadth_vs_focus: 'narrative_vs_distribution',
  brand_vs_customer_language: 'narrative_vs_distribution',
  speed_vs_trust: 'pricing_model_vs_delivery_reality',

  // Fallback
  other: 'other',
}

// ---------------------------------------------------------------------------
// Archetype affinity scoring
//
// Each report tension type carries signal strength toward specific archetypes.
// Patterns are classified by summing affinities across their constituent tensions.
// ---------------------------------------------------------------------------

const TENSION_ARCHETYPE_AFFINITY: Record<ReportTensionType, Partial<Record<PatternArchetype, number>>> = {
  // Service/delivery → services_disguised_as_saas
  automation_vs_service: { services_disguised_as_saas: 3 },
  claim_vs_reality: { services_disguised_as_saas: 2, narrative_distribution_mismatch: 1 },
  positioning_vs_delivery: { services_disguised_as_saas: 2, narrative_distribution_mismatch: 1 },

  // Founder concentration → founder_led_sales_ceiling
  founder_credibility_vs_institutional_depth: { founder_led_sales_ceiling: 3 },
  personal_brand_vs_company_identity: { founder_led_sales_ceiling: 2, distribution_fragility: 1 },
  leadership_concentration_vs_scaling: { founder_led_sales_ceiling: 2, distribution_fragility: 1 },

  // Enterprise positioning → enterprise_theatre
  positioning_vs_customer_base: { enterprise_theatre: 2, narrative_distribution_mismatch: 2 },
  ambition_vs_proof: { enterprise_theatre: 2, narrative_distribution_mismatch: 1 },

  // Growth/distribution → distribution_fragility
  narrative_scale_vs_operations: { distribution_fragility: 2, enterprise_theatre: 1 },
  narrative_authority_vs_operational_scale: { distribution_fragility: 2, founder_led_sales_ceiling: 1 },
  growth_vs_readiness: { distribution_fragility: 2 },

  // Narrative/distribution → narrative_distribution_mismatch
  vision_vs_execution: { narrative_distribution_mismatch: 2, services_disguised_as_saas: 1 },
  credibility_vs_claim: { narrative_distribution_mismatch: 2 },
  positioning_vs_market_fit: { narrative_distribution_mismatch: 2, enterprise_theatre: 1 },
  breadth_vs_focus: { narrative_distribution_mismatch: 1 },
  brand_vs_customer_language: { narrative_distribution_mismatch: 1 },
  speed_vs_trust: { narrative_distribution_mismatch: 1 },

  // Fallback
  other: { narrative_distribution_mismatch: 1 },
}

// ---------------------------------------------------------------------------
// Confidence → weight mapping
// ---------------------------------------------------------------------------

const WEIGHT_MAP: Record<Confidence, number> = { low: 1, medium: 2, high: 3 }

// ---------------------------------------------------------------------------
// Adapt tensions
// ---------------------------------------------------------------------------

export function adaptTensions(reportTensions: ReportTension[]): V2Tension[] {
  return reportTensions.map(t => ({
    id: t.tension_id,
    company_id: t.company_id,
    type: TENSION_TYPE_MAP[t.type] ?? 'other',
    title: t.title,
    statement: t.statement,
    signal_ids: t.signal_ids,
    evidence_refs: t.evidence_ids,
    confidence: t.confidence,
    severity: t.severity,
  }))
}

// ---------------------------------------------------------------------------
// Classify archetype
// ---------------------------------------------------------------------------

function classifyArchetype(
  pattern: ReportPattern,
  allTensions: ReportTension[],
  gtm: GTMAnalysis,
): PatternArchetype {
  const patternTensionIds = new Set(pattern.tension_ids)
  const patternTensions = allTensions.filter(t => patternTensionIds.has(t.tension_id))

  // Score each archetype based on tension affinities
  const scores: Record<PatternArchetype, number> = {
    founder_led_sales_ceiling: 0,
    services_disguised_as_saas: 0,
    developer_adoption_without_buyer_motion: 0,
    enterprise_theatre: 0,
    distribution_fragility: 0,
    narrative_distribution_mismatch: 0,
  }

  for (const tension of patternTensions) {
    const affinities = TENSION_ARCHETYPE_AFFINITY[tension.type]
    if (affinities) {
      for (const [archetype, score] of Object.entries(affinities)) {
        scores[archetype as PatternArchetype] += score
      }
    }
  }

  // Boost with GTM analysis signals
  if (gtm.service_dependency.hidden_services_risk >= 0.5) {
    scores.services_disguised_as_saas += 2
  }
  if (gtm.founder_dependency.risk_score >= 0.67) {
    scores.founder_led_sales_ceiling += 2
  }
  if (gtm.sales_motion.mode === 'founder_led') {
    scores.founder_led_sales_ceiling += 2
  }
  if (gtm.sales_motion.mode === 'plg') {
    scores.developer_adoption_without_buyer_motion += 2
  }
  if (gtm.distribution_architecture.primary_channel === 'product') {
    scores.developer_adoption_without_buyer_motion += 2
  }
  if (gtm.buyer_structure.user_buyer_mismatch) {
    scores.developer_adoption_without_buyer_motion += 3
  }
  // Compound boost: strong PLG signal when both mode and channel agree
  if (gtm.sales_motion.mode === 'plg' && gtm.distribution_architecture.primary_channel === 'product') {
    scores.developer_adoption_without_buyer_motion += 2
  }
  if (gtm.distribution_architecture.fragility_score >= 0.7) {
    scores.distribution_fragility += 2
  }
  if (gtm.pricing_delivery_fit.delivery_fit_tension) {
    scores.services_disguised_as_saas += 1
  }

  // Debug: log score map before selection
  if (process.env['ARCHETYPE_DEBUG'] === 'true') {
    console.log(`\nArchetype scores [${pattern.pattern_id}]:`)
    for (const [arch, score] of Object.entries(scores).sort(([, a], [, b]) => b - a)) {
      console.log(`  ${arch}: ${score}`)
    }
  }

  // Pick highest-scoring archetype; break ties alphabetically
  const sorted = Object.entries(scores).sort(([aType, aScore], [bType, bScore]) => {
    if (bScore !== aScore) return bScore - aScore
    return aType.localeCompare(bType)
  })

  return sorted[0][0] as PatternArchetype
}

// ---------------------------------------------------------------------------
// Adapt patterns
// ---------------------------------------------------------------------------

export function adaptPatterns(
  reportPatterns: ReportPattern[],
  reportTensions: ReportTension[],
  gtm: GTMAnalysis,
): V2Pattern[] {
  return reportPatterns.map(p => ({
    id: p.pattern_id,
    company_id: p.company_id,
    archetype: classifyArchetype(p, reportTensions, gtm),
    title: p.title,
    description: p.summary,
    tension_ids: p.tension_ids,
    signal_ids: p.signal_ids,
    evidence_refs: p.evidence_ids,
    confidence: p.confidence,
    weight: WEIGHT_MAP[p.strategic_weight] ?? 1,
  }))
}
