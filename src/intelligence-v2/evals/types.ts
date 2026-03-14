/**
 * Eval Fixture Types
 *
 * Defines the shape of evaluation fixtures for the intelligence-v2 reasoning pipeline.
 * Each fixture provides mock signals and expected outputs at every deterministic stage:
 * GTM analysis, diagnosis, mechanisms, and intervention.
 *
 * Fixtures test the pipeline end-to-end without LLM calls.
 */

import type { Signal } from '../../report/pipeline/extract-signals.js'
import type { GTMAnalysis } from '../types/gtm-analysis.js'
import type { DiagnosisType } from '../types/diagnosis.js'
import type { MechanismType } from '../types/mechanism.js'
import type { InterventionType } from '../types/intervention.js'
import type { Confidence, Plausibility, ImpactLevel } from '../types/shared.js'

// ---------------------------------------------------------------------------
// Expected GTM Analysis — partial assertions
// ---------------------------------------------------------------------------

export interface ExpectedGTMAnalysis {
  sales_motion: {
    mode: GTMAnalysis['sales_motion']['mode']
    confidence_min: Confidence
  }
  buyer_structure: {
    user_buyer_mismatch: boolean
  }
  distribution_architecture: {
    primary_channel: GTMAnalysis['distribution_architecture']['primary_channel']
    fragility_score_min: number
    fragility_score_max: number
  }
  founder_dependency: {
    risk_score_min: number
    risk_score_max: number
  }
  service_dependency: {
    onboarding_complexity: GTMAnalysis['service_dependency']['onboarding_complexity']
    implementation_required: boolean
    hidden_services_risk_min: number
  }
  pricing_delivery_fit: {
    delivery_fit_tension: boolean
  }
}

// ---------------------------------------------------------------------------
// Expected Diagnosis
// ---------------------------------------------------------------------------

export interface ExpectedDiagnosis {
  type: DiagnosisType
  confidence_min: Confidence
}

// ---------------------------------------------------------------------------
// Expected Mechanisms
// ---------------------------------------------------------------------------

export interface ExpectedMechanism {
  type: MechanismType
  plausibility: Plausibility
}

// ---------------------------------------------------------------------------
// Expected Intervention
// ---------------------------------------------------------------------------

export interface ExpectedIntervention {
  type: InterventionType
  expected_impact: ImpactLevel
  delivery_fit: ImpactLevel
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

export interface EvalFixture {
  /** Fixture identifier, e.g. "001-services-disguised-as-saas" */
  id: string

  /** Human-readable name */
  name: string

  /** Which archetype this fixture targets */
  archetype: DiagnosisType

  /** Why this fixture exists and what it tests */
  description: string

  /** Mock signals fed into the reasoning pipeline */
  signals: Signal[]

  /** Expected outputs at each deterministic stage */
  expected: {
    gtm_analysis: ExpectedGTMAnalysis
    diagnosis: ExpectedDiagnosis
    mechanisms: ExpectedMechanism[]
    intervention: ExpectedIntervention
  }
}
