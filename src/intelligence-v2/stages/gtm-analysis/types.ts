// Local type re-exports for the gtm-analysis stage.
// Keeps imports in rules.ts and analyse-gtm.ts concise.

export type { Signal } from '../../../report/pipeline/extract-signals.js'

export type {
  GTMAnalysis,
  SalesMotionAssessment,
  BuyerStructureAssessment,
  DistributionArchitectureAssessment,
  FounderDependencyAssessment,
  ServiceDependencyAssessment,
  PricingDeliveryFitAssessment,
} from '../../types/index.js'

export type { Confidence } from '../../types/index.js'
