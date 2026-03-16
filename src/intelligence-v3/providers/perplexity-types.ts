/**
 * Perplexity API internal types — Spec 005 §Provider 1: PerplexitySearchProvider
 *
 * NOT exported from the providers index. Only used internally by perplexity-adapter.ts.
 *
 * API verification: https://docs.perplexity.ai/api-reference/chat-completions-post
 * - Endpoint: https://api.perplexity.ai/chat/completions
 * - citations are returned automatically (no return_citations param needed)
 * - Format B: citations: string[] (URL-only, always present)
 * - Format A: search_results (structured, with title/snippet — check first)
 */

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

export interface PerplexityMessage {
  role: 'system' | 'user';
  content: string;
}

export interface PerplexityRequestBody {
  model: 'sonar';
  temperature: 0;
  max_tokens: 50;
  return_images: false;
  search_recency_filter?: 'hour' | 'day' | 'week' | 'month' | 'year';
  messages: PerplexityMessage[];
  // NOTE: return_citations is NOT a real API param. Citations are always returned.
}

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

export interface PerplexityChoice {
  message: {
    role: string;
    content: string; // AI-generated synthesis text — DISCARD. NEVER use in evidence layer.
  };
}

/** Format A: structured result objects with title + snippet (from search_results field) */
export interface PerplexitySearchResult {
  url: string;
  title?: string;
  snippet?: string;  // Verbatim excerpt from the source page
  date?: string;     // Publication date if available
}

/** Perplexity API response shape (verified from live docs) */
export interface PerplexityResponse {
  choices: PerplexityChoice[];
  // Format B: URL-only citations (always present when citations are available)
  citations?: string[];
  // Format A: structured web search results (may be absent in older API versions)
  search_results?: PerplexitySearchResult[];
}

// ---------------------------------------------------------------------------
// Query family definition
// ---------------------------------------------------------------------------

import type { ExternalSourceType } from '../types/research-corpus.js';

export interface QueryFamily {
  source_type: ExternalSourceType;
  /** Template — replace ${company} and ${domain} before sending */
  query_template: string;
  search_recency_filter?: 'month' | 'year';
}
