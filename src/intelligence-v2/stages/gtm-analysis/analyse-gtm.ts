/**
 * Stage: GTM Analysis
 *
 * Consumes signals, produces a GTMAnalysis object.
 * All classification is deterministic — no LLM calls.
 *
 * Responsibilities:
 *   - classify sales motion
 *   - assess buyer structure
 *   - map distribution architecture
 *   - assess founder dependency
 *   - assess service dependency
 *   - assess pricing/delivery fit
 *
 * Input:  Signal[]       — from the signals stage
 * Output: GTMAnalysis    — structured commercial state
 */

import type { GTMAnalysis, Signal } from './types.js'
import {
  classifySalesMotion,
  classifyBuyerStructure,
  classifyDistributionArchitecture,
  classifyFounderDependency,
  classifyServiceDependency,
  classifyPricingDeliveryFit,
} from './rules.js'

function unique(ids: string[]): string[] {
  return [...new Set(ids)]
}

export function analyseGtm(companyId: string, signals: Signal[]): GTMAnalysis {
  const sales_motion = classifySalesMotion(signals)
  const buyer_structure = classifyBuyerStructure(signals)
  const distribution_architecture = classifyDistributionArchitecture(signals)
  const founder_dependency = classifyFounderDependency(signals)
  const service_dependency = classifyServiceDependency(signals)
  const pricing_delivery_fit = classifyPricingDeliveryFit(signals)

  const evidence_refs = unique([
    ...sales_motion.evidence_refs,
    ...buyer_structure.evidence_refs,
    ...distribution_architecture.evidence_refs,
    ...founder_dependency.evidence_refs,
    ...service_dependency.evidence_refs,
    ...pricing_delivery_fit.evidence_refs,
  ])

  return {
    company_id: companyId,
    sales_motion,
    buyer_structure,
    distribution_architecture,
    founder_dependency,
    service_dependency,
    pricing_delivery_fit,
    evidence_refs,
  }
}
