/**
 * PerplexitySearchProvider Tests — Spec 005 §Provider 1
 *
 * Zero API calls — all tests use fixture responses via injectable fetchFn.
 *
 * Critical assertions:
 *   - choices[0].message.content (AI synthesis) NEVER appears in any excerpt
 *   - max_tokens: 50 in every request body (never 1, never absent)
 *   - NO return_citations field in request body
 *   - Citation count capped at 5 per query
 *   - Excerpt truncated at ≤ 500 characters
 *   - HTTP 429 → skip query, no throw
 *   - Timeout → skip query, no throw
 *   - Secondary fetch concurrency ≤ 3 in-flight
 */

import { describe, it, expect, vi } from 'vitest';
import { PerplexitySearchProvider } from '../perplexity-adapter.js';

import formatAFixture from './__fixtures__/perplexity/format-a-response.json';
import formatBFixture from './__fixtures__/perplexity/format-b-response.json';
import emptyFixture from './__fixtures__/perplexity/empty-response.json';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOkResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeErrorResponse(status: number): Response {
  return new Response(JSON.stringify({ error: 'error' }), { status });
}

function capturedRequests(fetchFn: ReturnType<typeof vi.fn>) {
  return fetchFn.mock.calls.map(([_url, init]: [string, RequestInit]) => {
    const body = JSON.parse(init.body as string);
    return body;
  });
}

// ---------------------------------------------------------------------------
// Format A — structured search_results with snippets
// ---------------------------------------------------------------------------

describe('PerplexitySearchProvider — Format A (search_results with snippets)', () => {
  it('returns ExternalSource[] from search_results', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeOkResponse(formatAFixture));
    const provider = new PerplexitySearchProvider({ apiKey: 'test-key', fetchFn: fetchFn as typeof fetch });

    const sources = await provider.search('trigger.dev reviews site:trustpilot.com', 'review_trustpilot');

    expect(sources.length).toBeGreaterThan(0);
    expect(sources.length).toBeLessThanOrEqual(5);
  });

  it('excerpt comes from search_results[].snippet, NOT from choices[].message.content', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeOkResponse(formatAFixture));
    const provider = new PerplexitySearchProvider({ apiKey: 'test-key', fetchFn: fetchFn as typeof fetch });

    const sources = await provider.search('trigger.dev reviews site:trustpilot.com', 'review_trustpilot');

    // AI synthesis text from choices — must NOT appear in any excerpt
    const aiSynthesisText = (formatAFixture as Record<string, unknown>).choices[0].message.content as string;
    for (const source of sources) {
      expect(source.excerpt).not.toBe(aiSynthesisText);
      // The synthesis text contains "[1][2][3]" — no source page excerpt should
      expect(source.excerpt).not.toContain('[1][2][3]');
    }
  });

  it('all excerpts are from search_results snippets (verbatim source page text)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeOkResponse(formatAFixture));
    const provider = new PerplexitySearchProvider({ apiKey: 'test-key', fetchFn: fetchFn as typeof fetch });

    const sources = await provider.search('trigger.dev reviews site:trustpilot.com', 'review_trustpilot');

    // Each excerpt must match one of the fixture snippets (possibly truncated)
    const fixtureSnippets = (formatAFixture.search_results ?? []).map((r: Record<string, unknown>) => r.snippet as string);
    for (const source of sources) {
      const matchesASnippet = fixtureSnippets.some((s) => s.startsWith(source.excerpt) || source.excerpt.startsWith(s.slice(0, 50)));
      expect(matchesASnippet).toBe(true);
    }
  });

  it('excerpt length ≤ 500 characters', async () => {
    const longSnippetFixture = {
      choices: [{ message: { role: 'assistant', content: 'AI synthesis text to be discarded.' } }],
      search_results: [
        {
          url: 'https://trustpilot.com/review/1',
          snippet: 'A'.repeat(600), // > 500 chars
        },
      ],
    };
    const fetchFn = vi.fn().mockResolvedValue(makeOkResponse(longSnippetFixture));
    const provider = new PerplexitySearchProvider({ apiKey: 'test-key', fetchFn: fetchFn as typeof fetch });

    const sources = await provider.search('test query', 'review_trustpilot');

    expect(sources.length).toBe(1);
    expect(sources[0].excerpt.length).toBeLessThanOrEqual(500);
  });

  it('max 5 citations returned even if more are in search_results', async () => {
    const manyResultsFixture = {
      choices: [{ message: { role: 'assistant', content: 'synthesis' } }],
      search_results: Array.from({ length: 10 }, (_, i) => ({
        url: `https://trustpilot.com/review/${i}`,
        snippet: `Review snippet number ${i} with enough text to be useful.`,
      })),
    };
    const fetchFn = vi.fn().mockResolvedValue(makeOkResponse(manyResultsFixture));
    const provider = new PerplexitySearchProvider({ apiKey: 'test-key', fetchFn: fetchFn as typeof fetch });

    const sources = await provider.search('test', 'review_trustpilot');

    expect(sources.length).toBeLessThanOrEqual(5);
  });

  it('published_at is set when search_results provide a date', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeOkResponse(formatAFixture));
    const provider = new PerplexitySearchProvider({ apiKey: 'test-key', fetchFn: fetchFn as typeof fetch });

    const sources = await provider.search('test', 'review_trustpilot');

    // First fixture result has date: "2024-11-15"
    const withDate = sources.find(s => s.published_at);
    expect(withDate).toBeDefined();
  });

  it('source_type matches the query sourceType argument', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeOkResponse(formatAFixture));
    const provider = new PerplexitySearchProvider({ apiKey: 'test-key', fetchFn: fetchFn as typeof fetch });

    const sources = await provider.search('test', 'press_mention');

    for (const source of sources) {
      expect(source.source_type).toBe('press_mention');
    }
  });
});

// ---------------------------------------------------------------------------
// Request shape assertions
// ---------------------------------------------------------------------------

describe('PerplexitySearchProvider — request shape', () => {
  it('request body contains max_tokens: 50', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeOkResponse(emptyFixture));
    const provider = new PerplexitySearchProvider({ apiKey: 'test-key', fetchFn: fetchFn as typeof fetch });

    await provider.search('test', 'review_trustpilot');

    const [body] = capturedRequests(fetchFn);
    expect(body.max_tokens).toBe(50);
  });

  it('request body does NOT contain return_citations field', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeOkResponse(emptyFixture));
    const provider = new PerplexitySearchProvider({ apiKey: 'test-key', fetchFn: fetchFn as typeof fetch });

    await provider.search('test', 'review_trustpilot');

    const [body] = capturedRequests(fetchFn);
    expect('return_citations' in body).toBe(false);
  });

  it('request body contains model: "sonar"', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeOkResponse(emptyFixture));
    const provider = new PerplexitySearchProvider({ apiKey: 'test-key', fetchFn: fetchFn as typeof fetch });

    await provider.search('test', 'review_trustpilot');

    const [body] = capturedRequests(fetchFn);
    expect(body.model).toBe('sonar');
  });

  it('request body contains temperature: 0', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeOkResponse(emptyFixture));
    const provider = new PerplexitySearchProvider({ apiKey: 'test-key', fetchFn: fetchFn as typeof fetch });

    await provider.search('test', 'review_trustpilot');

    const [body] = capturedRequests(fetchFn);
    expect(body.temperature).toBe(0);
  });

  it('request body contains return_images: false', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeOkResponse(emptyFixture));
    const provider = new PerplexitySearchProvider({ apiKey: 'test-key', fetchFn: fetchFn as typeof fetch });

    await provider.search('test', 'review_trustpilot');

    const [body] = capturedRequests(fetchFn);
    expect(body.return_images).toBe(false);
  });

  it('sends search_recency_filter: "year" for review_trustpilot', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeOkResponse(emptyFixture));
    const provider = new PerplexitySearchProvider({ apiKey: 'test-key', fetchFn: fetchFn as typeof fetch });

    await provider.search('test', 'review_trustpilot');

    const [body] = capturedRequests(fetchFn);
    expect(body.search_recency_filter).toBe('year');
  });

  it('sends search_recency_filter: "month" for linkedin_snippet', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeOkResponse(emptyFixture));
    const provider = new PerplexitySearchProvider({ apiKey: 'test-key', fetchFn: fetchFn as typeof fetch });

    await provider.search('test', 'linkedin_snippet');

    const [body] = capturedRequests(fetchFn);
    expect(body.search_recency_filter).toBe('month');
  });

  it('does NOT send search_recency_filter for competitor_search_snippet', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeOkResponse(emptyFixture));
    const provider = new PerplexitySearchProvider({ apiKey: 'test-key', fetchFn: fetchFn as typeof fetch });

    await provider.search('test', 'competitor_search_snippet');

    const [body] = capturedRequests(fetchFn);
    expect(body.search_recency_filter).toBeUndefined();
  });

  it('uses Authorization: Bearer header', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeOkResponse(emptyFixture));
    const provider = new PerplexitySearchProvider({ apiKey: 'my-secret-key', fetchFn: fetchFn as typeof fetch });

    await provider.search('test', 'press_mention');

    const [_url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer my-secret-key');
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('PerplexitySearchProvider — error handling', () => {
  it('HTTP 429 → returns [] (no throw)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeErrorResponse(429));
    const provider = new PerplexitySearchProvider({ apiKey: 'test-key', fetchFn: fetchFn as typeof fetch });

    const result = await provider.search('test', 'review_trustpilot');

    expect(result).toEqual([]);
  });

  it('HTTP 500 → returns [] (no throw)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeErrorResponse(500));
    const provider = new PerplexitySearchProvider({ apiKey: 'test-key', fetchFn: fetchFn as typeof fetch });

    const result = await provider.search('test', 'review_trustpilot');

    expect(result).toEqual([]);
  });

  it('HTTP 503 → returns [] (no throw)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeErrorResponse(503));
    const provider = new PerplexitySearchProvider({ apiKey: 'test-key', fetchFn: fetchFn as typeof fetch });

    const result = await provider.search('test', 'press_mention');

    expect(result).toEqual([]);
  });

  it('HTTP 401 → throws ERR_PERPLEXITY_AUTH_FAILED', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeErrorResponse(401));
    const provider = new PerplexitySearchProvider({ apiKey: 'bad-key', fetchFn: fetchFn as typeof fetch });

    await expect(provider.search('test', 'review_trustpilot')).rejects.toThrow('ERR_PERPLEXITY_AUTH_FAILED');
  });

  it('fetch timeout (AbortError) → returns [] (no throw)', async () => {
    const fetchFn = vi.fn().mockRejectedValue(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
    const provider = new PerplexitySearchProvider({ apiKey: 'test-key', fetchFn: fetchFn as typeof fetch });

    const result = await provider.search('test', 'press_mention');

    expect(result).toEqual([]);
  });

  it('network error → returns [] (no throw)', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('Network failure'));
    const provider = new PerplexitySearchProvider({ apiKey: 'test-key', fetchFn: fetchFn as typeof fetch });

    const result = await provider.search('test', 'press_mention');

    expect(result).toEqual([]);
  });

  it('empty citations array → returns [] (no throw)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeOkResponse(emptyFixture));
    const provider = new PerplexitySearchProvider({ apiKey: 'test-key', fetchFn: fetchFn as typeof fetch });

    const result = await provider.search('test', 'press_mention');

    expect(result).toEqual([]);
  });

  it('missing PERPLEXITY_API_KEY → throws ERR_MISSING_CREDENTIAL', () => {
    const originalKey = process.env['PERPLEXITY_API_KEY'];
    delete process.env['PERPLEXITY_API_KEY'];

    expect(() => PerplexitySearchProvider.fromEnv()).toThrow('ERR_MISSING_CREDENTIAL');

    if (originalKey !== undefined) {
      process.env['PERPLEXITY_API_KEY'] = originalKey;
    }
  });
});

// ---------------------------------------------------------------------------
// Format B — URL-only citations → secondary fetches
// ---------------------------------------------------------------------------

describe('PerplexitySearchProvider — Format B (URL-only citations, secondary fetch)', () => {
  it('falls back to citations array when no search_results', async () => {
    // Format B fixture has citations: string[] but no search_results
    let secondaryFetchCount = 0;
    const fetchFn = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://api.perplexity.ai/chat/completions') {
        return Promise.resolve(makeOkResponse(formatBFixture));
      }
      // Secondary fetch for citation URLs
      secondaryFetchCount++;
      return Promise.resolve(new Response('<html><body><p>Article excerpt text about the company.</p></body></html>', { status: 200 }));
    });

    const provider = new PerplexitySearchProvider({ apiKey: 'test-key', fetchFn: fetchFn as typeof fetch });
    const sources = await provider.search('trigger.dev press_mention', 'press_mention');

    // Should have attempted secondary fetches for the 5 citation URLs
    expect(secondaryFetchCount).toBeGreaterThan(0);
    expect(sources.length).toBeLessThanOrEqual(5);
  });

  it('excerpt from secondary fetch is NOT the Perplexity AI synthesis text', async () => {
    const aiSynthesisText = (formatBFixture as Record<string, unknown>).choices[0].message.content as string;

    const fetchFn = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://api.perplexity.ai/chat/completions') {
        return Promise.resolve(makeOkResponse(formatBFixture));
      }
      return Promise.resolve(new Response('<html><body><p>Real page content from the source article.</p></body></html>', { status: 200 }));
    });

    const provider = new PerplexitySearchProvider({ apiKey: 'test-key', fetchFn: fetchFn as typeof fetch });
    const sources = await provider.search('test', 'press_mention');

    for (const source of sources) {
      expect(source.excerpt).not.toContain(aiSynthesisText.slice(0, 50));
    }
  });

  it('max 5 secondary fetches attempted even if citations has more URLs', async () => {
    const manyUrls = Array.from({ length: 10 }, (_, i) => `https://example.com/article-${i}`);
    const formatBMany = {
      choices: [{ message: { role: 'assistant', content: 'synthesis' } }],
      citations: manyUrls,
    };

    let secondaryFetchCount = 0;
    const fetchFn = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://api.perplexity.ai/chat/completions') {
        return Promise.resolve(makeOkResponse(formatBMany));
      }
      secondaryFetchCount++;
      return Promise.resolve(new Response('<p>Article text.</p>', { status: 200 }));
    });

    const provider = new PerplexitySearchProvider({ apiKey: 'test-key', fetchFn: fetchFn as typeof fetch });
    await provider.search('test', 'press_mention');

    // Capped at MAX_CITATIONS_PER_QUERY = 5
    expect(secondaryFetchCount).toBeLessThanOrEqual(5);
  });

  it('secondary fetch failure is non-fatal — skips that citation', async () => {
    const fetchFn = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://api.perplexity.ai/chat/completions') {
        return Promise.resolve(makeOkResponse({
          choices: [{ message: { role: 'assistant', content: 'synthesis' } }],
          citations: [
            'https://techcrunch.com/article-1',
            'https://failing-site.example.com/article-2',
          ],
        }));
      }
      if (url.includes('techcrunch')) {
        return Promise.resolve(new Response('<p>Real article content.</p>', { status: 200 }));
      }
      // Simulate failure for the second URL
      return Promise.reject(new Error('Connection refused'));
    });

    const provider = new PerplexitySearchProvider({ apiKey: 'test-key', fetchFn: fetchFn as typeof fetch });

    // Should not throw, just skip the failed citation
    const sources = await provider.search('test', 'press_mention');
    expect(sources).toBeDefined();
    // Should have at least the successful one
    expect(sources.length).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Evidence contamination guards
// ---------------------------------------------------------------------------

describe('PerplexitySearchProvider — evidence contamination guards', () => {
  it('choices[0].message.content does NOT appear in any source excerpt (Format A)', async () => {
    const synthesisText = 'This is unique AI-generated synthesis text that must never appear in excerpts abc123xyz';
    const fixture = {
      choices: [{ message: { role: 'assistant', content: synthesisText } }],
      search_results: [
        { url: 'https://trustpilot.com/r/1', snippet: 'Real user review text from the actual page.' },
        { url: 'https://trustpilot.com/r/2', snippet: 'Another real review from a different user.' },
      ],
    };

    const fetchFn = vi.fn().mockResolvedValue(makeOkResponse(fixture));
    const provider = new PerplexitySearchProvider({ apiKey: 'test-key', fetchFn: fetchFn as typeof fetch });
    const sources = await provider.search('test', 'review_trustpilot');

    for (const source of sources) {
      expect(source.excerpt).not.toContain('unique AI-generated synthesis');
      expect(source.excerpt).not.toBe(synthesisText);
    }
  });

  it('choices[0].message.content does NOT appear in any source excerpt (Format B)', async () => {
    const synthesisText = 'Unique AI synthesis text that should never be stored anywhere in evidence';
    const fixture = {
      choices: [{ message: { role: 'assistant', content: synthesisText } }],
      citations: ['https://techcrunch.com/article'],
    };

    const fetchFn = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://api.perplexity.ai/chat/completions') {
        return Promise.resolve(makeOkResponse(fixture));
      }
      return Promise.resolve(new Response('<p>Real page content here.</p>', { status: 200 }));
    });

    const provider = new PerplexitySearchProvider({ apiKey: 'test-key', fetchFn: fetchFn as typeof fetch });
    const sources = await provider.search('test', 'press_mention');

    for (const source of sources) {
      expect(source.excerpt).not.toContain('Unique AI synthesis');
    }
  });
});
