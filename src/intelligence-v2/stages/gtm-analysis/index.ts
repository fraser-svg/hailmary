export { analyseGtm } from './analyse-gtm.js'

export {
  classifySalesMotion,
  classifyBuyerStructure,
  classifyDistributionArchitecture,
  classifyFounderDependency,
  classifyServiceDependency,
  classifyPricingDeliveryFit,
} from './rules.js'

export type {
  GTMAnalysis,
  SalesMotionAssessment,
  BuyerStructureAssessment,
  DistributionArchitectureAssessment,
  FounderDependencyAssessment,
  ServiceDependencyAssessment,
  PricingDeliveryFitAssessment,
} from './types.js'
