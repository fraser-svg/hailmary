/**
 * PerplexitySearchProvider — Spec 005 §Provider 1
 *
 * Implements ExternalResearchProvider using the Perplexity Search API.
 * Runs one query per search() call. Returns up to 5 ExternalSource records.
 *
 * Evidence contamination rule (ABSOLUTE):
 *   choices[0].message.content is AI-generated synthesis text.
 *   It is ALWAYS discarded. It MUST NEVER enter any ExternalSource.excerpt.
 *   Only citation source-page verbatim text may enter the evidence layer.
 *
 * Citation extraction:
 *   1. Check response.search_results — structured objects with url/title/snippet (Format A)
 *   2. Fall back to response.citations string[] — URL-only, requires secondary fetch (Format B)
 */

import type { ExternalSource, ExternalSourceType } from '../types/research-corpus.js';
import type { ExternalResearchProvider } from '../acquisition/external-research.js';
import type {
  PerplexityRequestBody,
  PerplexityResponse,
  PerplexitySearchResult,
  QueryFamily,
} from './perplexity-types.js';
import { now } from '../../utils/timestamps.js';
import { estimateTokenCount } from '../acquisition/site-corpus.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';
const MAX_CITATIONS_PER_QUERY = 5;
const MAX_EXCERPT_CHARS = 500;
const PER_QUERY_TIMEOUT_MS = 8000;
const SECONDARY_FETCH_TIMEOUT_MS = 5000;
const SECONDARY_FETCH_MAX_CONCURRENT = 3;
const SECONDARY_FETCH_GAP_MS = 150;

const PERPLEXITY_SYSTEM_PROMPT =
  'You are a search index. Return citations for the query. Do not write analysis or commentary.';

// ---------------------------------------------------------------------------
// Recency filter per source type
// ---------------------------------------------------------------------------

const RECENCY_FILTER: Partial<Record<ExternalSourceType, 'month' | 'year'>> = {
  review_trustpilot: 'year',
  review_g2_snippet: 'year',
  press_mention: 'year',
  linkedin_snippet: 'month',
  investor_mention: 'year',
};

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/** Strip HTML tags and return first MAX_EXCERPT_CHARS chars, truncated at word boundary. */
function stripHtmlAndTruncate(html: string, maxChars: number = MAX_EXCERPT_CHARS): string {
  // Strip HTML tags
  const text = html.replace(/<[^>]+>/g, ' ')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= maxChars) return text;

  // Truncate at word boundary
  const truncated = text.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
}

/** Truncate plain text at word boundary. */
function truncateAtWordBoundary(text: string, maxChars: number = MAX_EXCERPT_CHARS): string {
  if (text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
}

// ---------------------------------------------------------------------------
// Simple concurrency semaphore (no external deps)
// ---------------------------------------------------------------------------

class Semaphore {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly maxConcurrent: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return;
    }
    return new Promise(resolve => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      this.running++;
      next();
    }
  }
}

// ---------------------------------------------------------------------------
// Secondary fetch (Format B) — fetch a URL and extract a text excerpt
// ---------------------------------------------------------------------------

async function fetchSecondaryExcerpt(
  url: string,
  abortSignal: AbortSignal,
  fetchFn: typeof fetch,
): Promise<string | null> {
  try {
    const res = await fetchFn(url, {
      signal: abortSignal,
      headers: { 'User-Agent': 'HailMary/1.0 (intelligence research)' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return stripHtmlAndTruncate(html, MAX_EXCERPT_CHARS);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fetch secondary excerpts for Format B (URL-only citations)
// ---------------------------------------------------------------------------

async function fetchSecondaryExcerpts(
  urls: string[],
  gathered_at: string,
  sourceType: ExternalSourceType,
  publishedAt: string | undefined,
  fetchFn: typeof fetch,
): Promise<ExternalSource[]> {
  const semaphore = new Semaphore(SECONDARY_FETCH_MAX_CONCURRENT);
  const results: ExternalSource[] = [];
  let lastStartTime = 0;

  const tasks = urls.map((url) => async (): Promise<ExternalSource | null> => {
    // Enforce 150ms minimum gap between starting requests
    const now_ms = Date.now();
    const waitMs = Math.max(0, lastStartTime + SECONDARY_FETCH_GAP_MS - now_ms);
    if (waitMs > 0) {
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }

    await semaphore.acquire();
    lastStartTime = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SECONDARY_FETCH_TIMEOUT_MS);
      const excerpt = await fetchSecondaryExcerpt(url, controller.signal, fetchFn);
      clearTimeout(timeout);

      if (!excerpt) {
        console.warn(`WARN_CITATION_FETCH_FAILED: ${url}`);
        return null;
      }

      return {
        url,
        source_type: sourceType,
        gathered_at,
        ...(publishedAt ? { published_at: publishedAt } : {}),
        excerpt,
        token_count: estimateTokenCount(excerpt),
        source_tier: 4, // Provisional — overridden by tier-classifier in mergeResearchCorpus
        acquisition_method: 'perplexity' as const,
      };
    } finally {
      semaphore.release();
    }
  });

  // Run all tasks, collect non-null results
  const settled = await Promise.all(tasks.map(t => t().catch(() => null)));
  for (const r of settled) {
    if (r !== null) results.push(r);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Parse Perplexity response → ExternalSource[]
// ---------------------------------------------------------------------------

function parseFormatA(
  searchResults: PerplexitySearchResult[],
  sourceType: ExternalSourceType,
  gathered_at: string,
  maxResults: number,
): ExternalSource[] {
  return searchResults
    .slice(0, maxResults)
    .map((result): ExternalSource | null => {
      const excerpt = result.snippet
        ? truncateAtWordBoundary(result.snippet)
        : null;

      if (!excerpt) return null;

      return {
        url: result.url,
        source_type: sourceType,
        gathered_at,
        ...(result.date ? { published_at: result.date } : {}),
        excerpt,
        token_count: estimateTokenCount(excerpt),
        source_tier: 4, // Provisional — overridden by tier-classifier in mergeResearchCorpus
        acquisition_method: 'perplexity' as const,
      };
    })
    .filter((s): s is ExternalSource => s !== null);
}

async function parseFormatB(
  citationUrls: string[],
  sourceType: ExternalSourceType,
  gathered_at: string,
  maxResults: number,
  fetchFn: typeof fetch,
): Promise<ExternalSource[]> {
  const urls = citationUrls.slice(0, maxResults);
  return fetchSecondaryExcerpts(urls, gathered_at, sourceType, undefined, fetchFn);
}

// ---------------------------------------------------------------------------
// PerplexitySearchProvider
// ---------------------------------------------------------------------------

export interface PerplexitySearchProviderConfig {
  apiKey: string;
  /** Injectable fetch function — used in tests to avoid real API calls */
  fetchFn?: typeof fetch;
}

export class PerplexitySearchProvider implements ExternalResearchProvider {
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(config: PerplexitySearchProviderConfig) {
    this.apiKey = config.apiKey;
    this.fetchFn = config.fetchFn ?? fetch;
  }

  static fromEnv(): PerplexitySearchProvider {
    const apiKey = process.env['PERPLEXITY_API_KEY'];
    if (!apiKey) {
      throw new Error('ERR_MISSING_CREDENTIAL: PERPLEXITY_API_KEY');
    }
    return new PerplexitySearchProvider({ apiKey });
  }

  async search(query: string, sourceType: ExternalSourceType): Promise<ExternalSource[]> {
    const gathered_at = now();
    const recency = RECENCY_FILTER[sourceType];

    const body: PerplexityRequestBody = {
      model: 'sonar',
      temperature: 0,
      max_tokens: 50,
      return_images: false,
      ...(recency ? { search_recency_filter: recency } : {}),
      messages: [
        { role: 'system', content: PERPLEXITY_SYSTEM_PROMPT },
        { role: 'user', content: query },
      ],
    };

    let response: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PER_QUERY_TIMEOUT_MS);

      response = await this.fetchFn(PERPLEXITY_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);
    } catch (err) {
      // AbortError = timeout; network errors
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('abort') || msg.includes('timed out')) {
        console.warn(`WARN_PERPLEXITY_TIMEOUT: ${sourceType}`);
      } else {
        console.warn(`WARN_PERPLEXITY_NETWORK: ${sourceType}: ${msg}`);
      }
      return [];
    }

    if (response.status === 401) {
      throw new Error('ERR_PERPLEXITY_AUTH_FAILED');
    }

    if (response.status === 429) {
      console.warn(`WARN_PERPLEXITY_RATE_LIMIT: ${sourceType}`);
      return [];
    }

    if (response.status >= 500) {
      console.warn(`WARN_PERPLEXITY_SERVER_ERROR: ${sourceType}`);
      return [];
    }

    if (!response.ok) {
      console.warn(`WARN_PERPLEXITY_HTTP_ERROR: ${sourceType}: ${response.status}`);
      return [];
    }

    let data: PerplexityResponse;
    try {
      data = await response.json() as PerplexityResponse;
    } catch {
      console.warn(`WARN_PERPLEXITY_PARSE_ERROR: ${sourceType}`);
      return [];
    }

    // -- Evidence contamination guard --
    // choices[0].message.content is AI-generated synthesis. NEVER use it.
    // Only citations/search_results contain source-page verbatim text.

    // Format A: structured search_results with snippets
    if (
      data.search_results &&
      data.search_results.length > 0 &&
      data.search_results.some(r => r.snippet)
    ) {
      const sources = parseFormatA(data.search_results, sourceType, gathered_at, MAX_CITATIONS_PER_QUERY);
      if (sources.length === 0) {
        console.warn(`WARN_PERPLEXITY_NO_RESULTS: ${sourceType}`);
      }
      return sources;
    }

    // Format B: URL-only citations → secondary fetches
    if (data.citations && data.citations.length > 0) {
      const sources = await parseFormatB(
        data.citations,
        sourceType,
        gathered_at,
        MAX_CITATIONS_PER_QUERY,
        this.fetchFn,
      );
      if (sources.length === 0) {
        console.warn(`WARN_PERPLEXITY_NO_RESULTS: ${sourceType}`);
      }
      return sources;
    }

    console.warn(`WARN_PERPLEXITY_NO_RESULTS: ${sourceType}`);
    return [];
  }
}
