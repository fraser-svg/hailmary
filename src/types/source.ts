/**
 * Source record — Spec 002 §15 + Spec 003 Layer 1 + Spec 006 V2 extensions.
 * Describes the origin of evidence.
 */
export interface SourceRecord {
  source_id: string;
  url: string;
  source_type: string;
  title: string;
  publisher_or_owner: string;
  // Real fetch timestamp (not defaulted to current time).
  // For Perplexity: time of the API call that returned this citation.
  // For Cloudflare: time the page was rendered.
  captured_at: string; // ISO 8601
  // Original publication date if known (from Perplexity citation metadata or HTTP headers).
  published_at?: string; // ISO 8601 — optional
  relevance_notes: string[];
  source_tier: 1 | 2 | 3 | 4 | 5;
  // Which acquisition method produced this source record.
  acquisition_method?: 'cloudflare' | 'perplexity' | 'websearch' | 'webfetch' | 'fixture';
  // SHA-256(content).slice(0, 16) — used for cross-corpus deduplication. Set by mergeResearchCorpus().
  content_hash?: string;
  // Token count (estimated: characters / 4). Set by mergeResearchCorpus().
  token_count?: number;
}
