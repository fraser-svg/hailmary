/**
 * Eval Fixtures — Barrel Export
 *
 * One fixture per archetype. Each provides mock signals and expected
 * outputs at every deterministic stage of the reasoning pipeline.
 */

export { fixture as servicesDisguisedAsSaas } from './001-services-disguised-as-saas.js'
export { fixture as founderLedSalesCeiling } from './002-founder-led-sales-ceiling.js'
export { fixture as developerAdoptionWithoutBuyerMotion } from './003-developer-adoption-without-buyer-motion.js'
export { fixture as enterpriseTheatre } from './004-enterprise-theatre.js'
export { fixture as distributionFragility } from './005-distribution-fragility.js'
export { fixture as narrativeDistributionMismatch } from './006-narrative-distribution-mismatch.js'

import { fixture as f1 } from './001-services-disguised-as-saas.js'
import { fixture as f2 } from './002-founder-led-sales-ceiling.js'
import { fixture as f3 } from './003-developer-adoption-without-buyer-motion.js'
import { fixture as f4 } from './004-enterprise-theatre.js'
import { fixture as f5 } from './005-distribution-fragility.js'
import { fixture as f6 } from './006-narrative-distribution-mismatch.js'

import type { EvalFixture } from '../types.js'

export const ALL_FIXTURES: EvalFixture[] = [f1, f2, f3, f4, f5, f6]
