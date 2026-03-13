/**
 * Empty dossier generator.
 * Produces a valid skeleton with all 16 top-level sections.
 * Every section present, all arrays empty, confidence = "low".
 *
 * Usage:
 *   npx tsx src/utils/empty-dossier.ts <slug>
 *   Writes to runs/<slug>/dossier.json
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeRunId } from './ids.js';
import { now } from './timestamps.js';
import type { Dossier } from '../types/index.js';

export function createEmptyDossier(
  companyName: string,
  primaryDomain: string,
): Dossier {
  const timestamp = now();

  return {
    schema_version: '1.0.0',
    generated_at: timestamp,
    company_input: {
      company_name: companyName,
      primary_domain: primaryDomain,
      resolved_company_name: '',
      resolved_domain: '',
      aliases: [],
    },
    run_metadata: {
      run_id: makeRunId(),
      pipeline_version: '0.1.0',
      collection_started_at: timestamp,
      collection_finished_at: '',
      source_count: 0,
      evidence_record_count: 0,
      notes: [],
      evidence_summary: {
        total_sources: 0,
        total_evidence: 0,
        by_source_tier: { tier_1: 0, tier_2: 0, tier_3: 0, tier_4: 0, tier_5: 0 },
        by_evidence_category: {
          company_basics: 0,
          product_and_offer: 0,
          gtm: 0,
          customer: 0,
          competitors: 0,
          signals: 0,
          market_and_macro: 0,
          positioning_and_narrative: 0,
          risk: 0,
        },
        inferred_count: 0,
        direct_count: 0,
        customer_voice_depth: 'none',
        negative_signal_depth: 'none',
      },
    },
    company_profile: {
      plain_language_description: '',
      category: '',
      subcategories: [],
      founded_year: null,
      company_stage: { value: '', is_inferred: false, confidence: 'low' },
      headquarters: '',
      geographic_presence: [],
      leadership: [],
      ownership_or_structure_notes: [],
      evidence_ids: [],
      confidence: 'low',
    },
    product_and_offer: {
      core_offer_summary: '',
      products_or_services: [],
      pricing_model: {
        value: '',
        details: '',
        is_public: false,
        is_inferred: false,
        evidence_ids: [],
      },
      pricing_signals: [],
      delivery_model: [],
      implementation_complexity: { value: '', is_inferred: false, confidence: 'low' },
      evidence_ids: [],
      confidence: 'low',
    },
    gtm_model: {
      sales_motion: { value: '', is_inferred: false, confidence: 'low' },
      acquisition_channels: [],
      buyer_journey_notes: [],
      distribution_model: [],
      territory_or_market_focus: [],
      growth_signals: [],
      hiring_signals: [],
      content_and_positioning_hooks: [],
      gtm_observations: [],
      evidence_ids: [],
      confidence: 'low',
    },
    customer_and_personas: {
      ideal_customer_profile: {
        company_size: [],
        industries: [],
        geographies: [],
        traits: [],
        is_inferred: false,
        evidence_ids: [],
      },
      buyer_personas: [],
      end_user_personas: [],
      customer_pain_themes: [],
      customer_outcome_themes: [],
      case_study_signals: [],
      evidence_ids: [],
      confidence: 'low',
    },
    competitors: {
      direct_competitors: [],
      adjacent_competitors: [],
      substitutes: [],
      claimed_differentiators: [],
      positioning_overlaps: [],
      competitive_gaps: [],
      competitive_observations: [],
      evidence_ids: [],
      confidence: 'low',
    },
    market_and_macro: {
      market_category: '',
      market_dynamics: [],
      industry_trends: [],
      economic_sensitivity: [],
      regulatory_exposure: [],
      political_or_geopolitical_exposure: [],
      technology_shift_risks: [],
      ecosystem_dependencies: [],
      macro_observations: [],
      evidence_ids: [],
      confidence: 'low',
    },
    signals: {
      funding: [],
      product_launches: [],
      leadership_changes: [],
      press_and_content: [],
      notable_hiring: [],
      signal_summary: [],
      confidence: 'low',
    },
    narrative_intelligence: {
      company_claimed_value: [],
      customer_expressed_value: [],
      customer_language_patterns: [],
      narrative_gaps: [],
      negative_signals: [],
      value_alignment_summary: [],
      hidden_differentiators: [],
      messaging_opportunities: [],
      narrative_summary: '',
      confidence: 'low',
    },
    strategic_risks: {
      positioning_risks: [],
      gtm_risks: [],
      competitive_risks: [],
      market_risks: [],
      dependency_risks: [],
      risk_observations: [],
      strategic_hypotheses: [],
      confidence: 'low',
    },
    confidence_and_gaps: {
      high_confidence_findings: [],
      medium_confidence_findings: [],
      low_confidence_findings: [],
      missing_data: [],
      conflicting_evidence: [],
      sections_with_weak_support: [],
      overall_confidence: 'low',
    },
    sources: [],
    evidence: [],
  };
}

// CLI entrypoint
if (process.argv[1]?.endsWith('empty-dossier.ts')) {
  const slug = process.argv[2];
  if (!slug) {
    console.error('Usage: npx tsx src/utils/empty-dossier.ts <slug>');
    process.exit(1);
  }

  const dossier = createEmptyDossier(slug, `${slug}.com`);
  const dir = join(process.cwd(), 'runs', slug);
  mkdirSync(dir, { recursive: true });
  const outPath = join(dir, 'dossier.json');
  writeFileSync(outPath, JSON.stringify(dossier, null, 2) + '\n');
  console.log(`Empty dossier written to ${outPath}`);
}
