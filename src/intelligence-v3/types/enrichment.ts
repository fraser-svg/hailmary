/**
 * Enrichment Result Types — V3-U3.5
 *
 * Output of enrichCorpus(): LLM-extracted structured fields from raw corpus text.
 * Fields match real dossier types exactly (imported from src/types/dossier.ts).
 * Consumed by corpusToDossierAdapter() to fill 12 signal-critical fields.
 */

import type { NarrativeGap, ValueAlignmentEntry } from '../../types/dossier.js';

export interface EnrichmentResult {
  extracted_at: string;
  model: string;
  latency_ms: number;
  fallback: boolean;
  fields: {
    // Simple fields
    category: string | null;
    company_stage: string | null;
    founded_year: number | null;
    leadership: Array<{ name: string; role: string }> | null;
    // Competitor fields (name + domain provenance-checked)
    competitors: Array<{
      name: string;
      domain: string;
      evidence_id: string;
    }> | null;
    pricing_signals: string[] | null;
    delivery_model: string[] | null;
    customer_pain_themes: string[] | null;
    acquisition_channels: string[] | null;
    // Complex fields — match real dossier types exactly
    narrative_gaps: NarrativeGap[] | null;
    value_alignment_summary: ValueAlignmentEntry[] | null;
  };
  provenance: {
    fields_extracted: number;
    fields_null: number;
    fields_rejected_provenance: number;
    rejected_details: Array<{ field: string; value: string; reason: string }>;
  };
}
