/**
 * Company Dossier — Spec 002 canonical schema + V1 evidence extension.
 * 16 top-level fields. All required.
 */

import type { Confidence, EvidenceRecord } from './evidence.js';
import type { SourceRecord } from './source.js';

// --- Nested types ---

export interface InferredValue {
  value: string;
  is_inferred: boolean;
  confidence: Confidence;
  evidence_ids?: string[];
}

export interface LeadershipEntry {
  name: string;
  title: string;
  evidence_ids: string[];
}

export interface ProductEntry {
  name: string;
  type: string;
  description: string;
  target_user: string;
  evidence_ids: string[];
}

export interface PricingModel {
  value: string;
  details: string;
  is_public: boolean;
  is_inferred: boolean;
  evidence_ids: string[];
}

export interface HiringSignal {
  role_title: string;
  department: string;
  signal: string;
  evidence_ids: string[];
}

export interface BuyerPersona {
  title: string;
  department: string;
  seniority: string;
  role_in_purchase: string;
  pain_points: string[];
  desired_outcomes: string[];
  evidence_ids: string[];
  is_inferred: boolean;
}

export interface ICP {
  company_size: string[];
  industries: string[];
  geographies: string[];
  traits: string[];
  is_inferred: boolean;
  evidence_ids: string[];
}

export interface CompetitorEntry {
  name: string;
  domain: string;
  why_included: string;
  positioning_summary: string;
  comparison_notes: string[];
  evidence_ids: string[];
}

export interface FundingEntry {
  date: string;
  amount: string;
  round: string;
  investors: string[];
  evidence_ids: string[];
}

export interface ProductLaunch {
  date: string;
  title: string;
  summary: string;
  evidence_ids: string[];
}

export interface LeadershipChange {
  date: string;
  person: string;
  role: string;
  change_type: string;
  evidence_ids: string[];
}

export interface PressEntry {
  date: string;
  type: string;
  title: string;
  summary: string;
  evidence_ids: string[];
}

export interface CompanyClaimedValue {
  theme: string;
  description: string;
  language_examples: string[];
  evidence_ids: string[];
}

export interface CustomerExpressedValue {
  theme: string;
  description: string;
  language_examples: string[];
  source_types: string[];
  evidence_ids: string[];
}

export interface CustomerLanguagePattern {
  pattern: string;
  interpretation: string;
  evidence_ids: string[];
}

export interface NarrativeGap {
  gap_name: string;
  company_language: string[];
  customer_language: string[];
  gap_description: string;
  likely_business_impact: string[];
  suggested_repositioning_direction: string;
  evidence_ids: string[];
  confidence: Confidence;
}

export interface NegativeSignal {
  signal: string;
  category: 'billing' | 'support' | 'reliability' | 'migration' | 'trust' | 'usability' | 'other';
  severity: Confidence;
  frequency: 'isolated' | 'recurring' | 'pervasive';
  related_narrative_gap?: string;
  evidence_ids: string[];
}

export interface ValueAlignmentEntry {
  theme: string;
  alignment: 'aligned' | 'divergent' | 'company_only' | 'customer_only';
  company_language: string[];
  customer_language: string[];
  business_implication: string;
  evidence_ids: string[];
  confidence: Confidence;
}

export interface RiskObservation {
  risk: string;
  description: string;
  severity: Confidence;
  is_inferred: boolean;
  evidence_ids: string[];
}

// --- Top-level sections ---

export interface CompanyInput {
  company_name: string;
  primary_domain: string;
  resolved_company_name: string;
  resolved_domain: string;
  aliases: string[];
}

export interface RunMetadata {
  run_id: string;
  pipeline_version: string;
  collection_started_at: string;
  collection_finished_at: string;
  source_count: number;
  evidence_record_count: number;
  notes: string[];
}

export interface CompanyProfile {
  plain_language_description: string;
  category: string;
  subcategories: string[];
  founded_year: number | null;
  company_stage: InferredValue;
  headquarters: string;
  geographic_presence: string[];
  leadership: LeadershipEntry[];
  ownership_or_structure_notes: string[];
  evidence_ids: string[];
  confidence: Confidence;
}

export interface ProductAndOffer {
  core_offer_summary: string;
  products_or_services: ProductEntry[];
  pricing_model: PricingModel;
  pricing_signals: string[];
  delivery_model: string[];
  implementation_complexity: InferredValue;
  evidence_ids: string[];
  confidence: Confidence;
}

export interface GTMModel {
  sales_motion: InferredValue;
  acquisition_channels: string[];
  buyer_journey_notes: string[];
  distribution_model: string[];
  territory_or_market_focus: string[];
  growth_signals: string[];
  hiring_signals: HiringSignal[];
  content_and_positioning_hooks: string[];
  gtm_observations: string[];
  evidence_ids: string[];
  confidence: Confidence;
}

export interface CustomerAndPersonas {
  ideal_customer_profile: ICP;
  buyer_personas: BuyerPersona[];
  end_user_personas: BuyerPersona[];
  customer_pain_themes: string[];
  customer_outcome_themes: string[];
  case_study_signals: string[];
  evidence_ids: string[];
  confidence: Confidence;
}

export interface Competitors {
  direct_competitors: CompetitorEntry[];
  adjacent_competitors: CompetitorEntry[];
  substitutes: CompetitorEntry[];
  claimed_differentiators: string[];
  positioning_overlaps: string[];
  competitive_gaps: string[];
  competitive_observations: string[];
  evidence_ids: string[];
  confidence: Confidence;
}

export interface MarketAndMacro {
  market_category: string;
  market_dynamics: string[];
  industry_trends: string[];
  economic_sensitivity: string[];
  regulatory_exposure: string[];
  political_or_geopolitical_exposure: string[];
  technology_shift_risks: string[];
  ecosystem_dependencies: string[];
  macro_observations: string[];
  evidence_ids: string[];
  confidence: Confidence;
}

export interface Signals {
  funding: FundingEntry[];
  product_launches: ProductLaunch[];
  leadership_changes: LeadershipChange[];
  press_and_content: PressEntry[];
  notable_hiring: string[];
  signal_summary: string[];
  confidence: Confidence;
}

export interface NarrativeIntelligence {
  company_claimed_value: CompanyClaimedValue[];
  customer_expressed_value: CustomerExpressedValue[];
  customer_language_patterns: CustomerLanguagePattern[];
  narrative_gaps: NarrativeGap[];
  negative_signals: NegativeSignal[];
  value_alignment_summary: ValueAlignmentEntry[];
  hidden_differentiators: string[];
  messaging_opportunities: string[];
  narrative_summary: string;
  confidence: Confidence;
}

export interface StrategicRisks {
  positioning_risks: string[];
  gtm_risks: string[];
  competitive_risks: string[];
  market_risks: string[];
  dependency_risks: string[];
  risk_observations: RiskObservation[];
  confidence: Confidence;
}

export interface ConfidenceAndGaps {
  high_confidence_findings: string[];
  medium_confidence_findings: string[];
  low_confidence_findings: string[];
  missing_data: string[];
  conflicting_evidence: string[];
  sections_with_weak_support: string[];
  overall_confidence: Confidence;
}

// --- The Dossier ---

export interface Dossier {
  schema_version: string;
  generated_at: string;
  company_input: CompanyInput;
  run_metadata: RunMetadata;
  company_profile: CompanyProfile;
  product_and_offer: ProductAndOffer;
  gtm_model: GTMModel;
  customer_and_personas: CustomerAndPersonas;
  competitors: Competitors;
  market_and_macro: MarketAndMacro;
  signals: Signals;
  narrative_intelligence: NarrativeIntelligence;
  strategic_risks: StrategicRisks;
  confidence_and_gaps: ConfidenceAndGaps;
  sources: SourceRecord[];
  evidence: EvidenceRecord[];  // V1 extension — see CLAUDE.md
}
