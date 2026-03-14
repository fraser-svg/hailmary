/**
 * Diagnosis — Statement Templates
 *
 * Deterministic statement generation for each DiagnosisType.
 * No LLM. Templates are parameterised by observable counts only.
 *
 * Each template states:
 *   1. What the structural condition is
 *   2. What evidence form supports it (pattern count, tension count)
 *   3. What consequence it creates
 */

import type { DiagnosisType } from './types.js'

export interface StatementContext {
  patternCount: number
  tensionCount: number
}

function pl(n: number, singular: string, plural = `${singular}s`): string {
  return n === 1 ? singular : plural
}

const TEMPLATES: Record<DiagnosisType, (ctx: StatementContext) => string> = {
  founder_led_sales_ceiling: ({ patternCount, tensionCount }) =>
    `Growth is structurally constrained by founder-dependent sales. ` +
    `${patternCount} ${pl(patternCount, 'pattern')} across ${tensionCount} ${pl(tensionCount, 'tension')} ` +
    `indicate that demand generation, trust-building, and deal closure depend on the founder's direct involvement. ` +
    `This creates a ceiling on scale: growth cannot exceed the founder's available attention.`,

  services_disguised_as_saas: ({ patternCount, tensionCount }) =>
    `The delivery model depends on human service capacity that the software positioning does not acknowledge. ` +
    `${patternCount} ${pl(patternCount, 'pattern')} across ${tensionCount} ${pl(tensionCount, 'tension')} ` +
    `reveal that onboarding, implementation, and ongoing delivery require significant service labour. ` +
    `This creates margin pressure, scaling constraints, and a positioning gap that undermines self-serve growth narratives.`,

  developer_adoption_without_buyer_motion: ({ patternCount, tensionCount }) =>
    `Developer or technical adoption is not converting to organisational revenue. ` +
    `${patternCount} ${pl(patternCount, 'pattern')} across ${tensionCount} ${pl(tensionCount, 'tension')} ` +
    `show that product usage is concentrated among technical users while purchasing decisions remain with ` +
    `buyers the product does not directly reach. Distribution reaches the wrong person in the buying chain.`,

  enterprise_theatre: ({ patternCount, tensionCount }) =>
    `Enterprise positioning is not supported by enterprise distribution, proof, or delivery capability. ` +
    `${patternCount} ${pl(patternCount, 'pattern')} across ${tensionCount} ${pl(tensionCount, 'tension')} ` +
    `reveal that enterprise language and aspirations exist without the sales infrastructure, case study evidence, ` +
    `or operational depth that enterprise buyers require. The company is performing enterprise readiness rather than demonstrating it.`,

  distribution_fragility: ({ patternCount, tensionCount }) =>
    `Growth depends on a distribution architecture that is structurally fragile. ` +
    `${patternCount} ${pl(patternCount, 'pattern')} across ${tensionCount} ${pl(tensionCount, 'tension')} ` +
    `indicate that the primary demand-generation mechanism is concentrated in a single channel or individual, ` +
    `with no observable secondary infrastructure. A disruption to that channel would halt growth.`,

  narrative_distribution_mismatch: ({ patternCount, tensionCount }) =>
    `The stated go-to-market narrative diverges from the observable distribution architecture. ` +
    `${patternCount} ${pl(patternCount, 'pattern')} across ${tensionCount} ${pl(tensionCount, 'tension')} ` +
    `reveal that how the company claims to sell does not match how it actually reaches and converts customers. ` +
    `This creates positioning confusion, misaligned sales infrastructure, and buyer trust gaps.`,
}

export function buildStatement(type: DiagnosisType, ctx: StatementContext): string {
  return TEMPLATES[type](ctx)
}
