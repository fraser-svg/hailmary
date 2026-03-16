/**
 * AcquisitionQualityReport — Spec 006 §6
 *
 * Logged to stdout (structured JSON) at the end of the upstream acquisition layer.
 * Attached to V3PipelineResult as acquisitionQuality (optional).
 * NOT stored in the dossier.
 */

import type { SourceTier } from './research-corpus.js';

export interface AcquisitionQualityReport {
  run_id: string;
  company: string;
  domain: string;
  acquired_at: string;          // ISO 8601

  cloudflare: {
    pages_attempted: number;
    pages_success: number;
    pages_failed: string[];     // URLs of pages that failed
    total_tokens: number;
    duration_ms: number;
  };

  perplexity: {
    queries_attempted: number;
    queries_success: number;    // Queries returning ≥ 1 result
    results_raw: number;        // Total citations before dedup
    results_after_dedup: number;
    secondary_fetches_attempted: number;  // Format B only
    secondary_fetches_success: number;
    duration_ms: number;
  };

  corpus: {
    total_sources: number;      // After merge + dedup
    tier_distribution: Partial<Record<SourceTier, number>>;
    stale_source_count: number;
  };

  total_acquisition_duration_ms: number;
}
