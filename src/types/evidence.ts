/**
 * Evidence record — Spec 003 canonical schema.
 * Atomic intelligence unit extracted from a source.
 */
export interface EvidenceRecord {
  evidence_id: string;
  source_id: string;
  evidence_type: EvidenceType;
  captured_at: string; // ISO 8601
  excerpt: string;
  summary: string;
  normalized_fields: Record<string, unknown>;
  source_quality: Confidence;
  confidence: Confidence;
  is_inferred: boolean;
  supports_claims: string[];
  tags: string[];
}

/** Confidence enum — used across dossier. */
export type Confidence = 'low' | 'medium' | 'high';

/**
 * Controlled vocabulary for evidence_type — Spec 003.
 * 38 types across 8 categories.
 */
export type EvidenceType =
  // Company basics
  | 'company_description_record'
  | 'founding_record'
  | 'leadership_record'
  | 'location_record'
  | 'ownership_record'
  // Product and offer
  | 'product_record'
  | 'service_record'
  | 'pricing_record'
  | 'delivery_model_record'
  | 'implementation_record'
  // GTM
  | 'sales_motion_record'
  | 'channel_record'
  | 'content_record'
  | 'buyer_signal_record'
  | 'job_posting_record'
  // Customer
  | 'testimonial_record'
  | 'review_record'
  | 'case_study_record'
  | 'persona_signal_record'
  | 'pain_point_record'
  | 'outcome_record'
  | 'customer_language_record'
  // Competitors
  | 'competitor_record'
  | 'positioning_record'
  | 'comparison_record'
  | 'differentiation_record'
  // Signals
  | 'funding_record'
  | 'product_launch_record'
  | 'leadership_change_record'
  | 'press_record'
  | 'hiring_signal_record'
  // Market and macro
  | 'market_trend_record'
  | 'regulatory_record'
  | 'economic_exposure_record'
  | 'political_exposure_record'
  | 'technology_shift_record'
  | 'ecosystem_dependency_record'
  // Narrative intelligence
  | 'company_claim_record'
  | 'customer_value_record'
  | 'narrative_gap_support_record'
  | 'hidden_differentiator_record'
  // Risk
  | 'strategic_risk_record'
  | 'dependency_risk_record'
  | 'positioning_risk_record';

/** All valid evidence types as a runtime array for validation. */
export const EVIDENCE_TYPES: string[] = [
  'company_description_record',
  'founding_record',
  'leadership_record',
  'location_record',
  'ownership_record',
  'product_record',
  'service_record',
  'pricing_record',
  'delivery_model_record',
  'implementation_record',
  'sales_motion_record',
  'channel_record',
  'content_record',
  'buyer_signal_record',
  'job_posting_record',
  'testimonial_record',
  'review_record',
  'case_study_record',
  'persona_signal_record',
  'pain_point_record',
  'outcome_record',
  'customer_language_record',
  'competitor_record',
  'positioning_record',
  'comparison_record',
  'differentiation_record',
  'funding_record',
  'product_launch_record',
  'leadership_change_record',
  'press_record',
  'hiring_signal_record',
  'market_trend_record',
  'regulatory_record',
  'economic_exposure_record',
  'political_exposure_record',
  'technology_shift_record',
  'ecosystem_dependency_record',
  'company_claim_record',
  'customer_value_record',
  'narrative_gap_support_record',
  'hidden_differentiator_record',
  'strategic_risk_record',
  'dependency_risk_record',
  'positioning_risk_record',
];
