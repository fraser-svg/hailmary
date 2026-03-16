/**
 * Site Corpus Acquisition — V3-U1
 * Spec: docs/specs/intelligence-engine-v3/002_pipeline_architecture.md#v3-u1
 *
 * Two modes:
 *   Mode A (fixture/manual): caller supplies pre-loaded CorpusPage objects
 *   Mode B (provider): caller supplies a SiteCorpusProvider for live fetching
 *
 * If neither is supplied, ERR_CORPUS_EMPTY is raised.
 *
 * Mandatory pages: homepage, pricing, about
 * Optional pages (up to 5): customers, case-studies, blog, docs, integrations, security
 * Hard limits: ≤10 pages, ≤20,000 tokens aggregate
 *
 * Errors:
 *   ERR_CORPUS_EMPTY — homepage not present or unreachable
 */

import type { SiteCorpus, CorpusPage, CrawlConfig, SitePageType } from '../types/research-corpus.js';
import { now } from '../../utils/timestamps.js';

// Lazy import — PlaywrightRenderingProvider is the default live provider.
// Loaded on first use to avoid top-level Chromium import overhead.
let _pwProvider: SiteCorpusProvider | null = null;
async function getPlaywrightProvider(): Promise<SiteCorpusProvider> {
  if (!_pwProvider) {
    const { PlaywrightRenderingProvider } = await import('../providers/playwright-adapter.js');
    _pwProvider = new PlaywrightRenderingProvider();
  }
  return _pwProvider;
}

// Cloudflare provider kept as a named fallback (env-vars required).
// Not used by default — wire explicitly via input.provider if needed.
async function getCloudflareProvider(): Promise<SiteCorpusProvider | null> {
  const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
  const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
  if (!accountId || !apiToken) return null;
  const { CloudflareRenderingProvider } = await import('../providers/cloudflare-adapter.js');
  return new CloudflareRenderingProvider({ accountId, apiToken });
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_PAGES = 10;
export const MAX_TOKENS = 20_000;

const MANDATORY_PAGES: SitePageType[] = ['homepage', 'pricing', 'about'];

const OPTIONAL_PAGE_PRIORITY: SitePageType[] = [
  'customers',
  'case-studies',
  'blog',
  'docs',
  'integrations',
  'security',
];

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

/**
 * Pluggable provider for fetching site pages.
 */
export interface SiteCorpusProvider {
  fetchPage(url: string): Promise<{
    text: string;
    success: boolean;
  }>;
  /** Optional: identifies how pages acquired by this provider were fetched (set on CorpusPage) */
  acquisition_method?: CorpusPage['acquisition_method'];
}

// ---------------------------------------------------------------------------
// Input contract
// ---------------------------------------------------------------------------

export interface SiteCorpusAcquisitionInput {
  domain: string;
  crawl_config?: CrawlConfig;
  /**
   * Mode A — fixture/manual.
   * Supply pre-loaded CorpusPage objects. Used for tests and offline runs.
   * Token counts are computed automatically from raw_text if zero.
   */
  fixture_pages?: CorpusPage[];
  /**
   * Mode B — provider.
   * Supply a SiteCorpusProvider to fetch pages live.
   * If absent, the function requires fixture_pages or raises ERR_CORPUS_EMPTY.
   */
  provider?: SiteCorpusProvider;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Rough token estimate: 1 token ≈ 4 characters.
 * Good enough for limit enforcement; not used for billing.
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

function buildPageUrl(domain: string, pageType: SitePageType): string {
  const base = domain.startsWith('http') ? domain : `https://${domain}`;
  const paths: Record<SitePageType, string> = {
    homepage: '/',
    pricing: '/pricing',
    about: '/about',
    docs: '/docs',
    integrations: '/integrations',
    blog: '/blog',
    customers: '/customers',
    'case-studies': '/case-studies',
    security: '/security',
  };
  return `${base.replace(/\/$/, '')}${paths[pageType]}`;
}

const PAGE_PRIORITY_ORDER: SitePageType[] = [...MANDATORY_PAGES, ...OPTIONAL_PAGE_PRIORITY];

function pageTypePriority(pt: SitePageType): number {
  const idx = PAGE_PRIORITY_ORDER.indexOf(pt);
  return idx === -1 ? 999 : idx;
}

function sortPagesByPriority(pages: CorpusPage[]): CorpusPage[] {
  return [...pages].sort((a, b) => pageTypePriority(a.page_type) - pageTypePriority(b.page_type));
}

/**
 * Enforce hard limits by priority order (mandatory pages first).
 * Returns pages that fit within both the page count and token budget.
 */
export function applyLimits(
  pages: CorpusPage[],
  maxPages: number,
  maxTokens: number,
): CorpusPage[] {
  const sorted = sortPagesByPriority(pages);
  const result: CorpusPage[] = [];
  let totalTokens = 0;

  for (const page of sorted) {
    if (result.length >= maxPages) break;
    if (totalTokens + page.token_count > maxTokens) break;
    result.push(page);
    totalTokens += page.token_count;
  }

  return result;
}

function checkRequiredPages(pages: CorpusPage[]): {
  hasHomepage: boolean;
  hasPricing: boolean;
  hasAbout: boolean;
} {
  const types = new Set(pages.map(p => p.page_type));
  return {
    hasHomepage: types.has('homepage'),
    hasPricing: types.has('pricing'),
    hasAbout: types.has('about'),
  };
}

// ---------------------------------------------------------------------------
// Mode A — fixture / manual
// ---------------------------------------------------------------------------

function loadFromFixture(
  domain: string,
  fixturePages: CorpusPage[],
  config: CrawlConfig,
): SiteCorpus {
  const maxPages = Math.min(config.max_pages ?? MAX_PAGES, MAX_PAGES);
  const maxTokens = Math.min(config.max_tokens ?? MAX_TOKENS, MAX_TOKENS);

  // Compute token counts from raw_text when the fixture omits them
  const normalizedPages: CorpusPage[] = fixturePages.map(p => ({
    ...p,
    token_count: p.token_count > 0 ? p.token_count : estimateTokenCount(p.raw_text),
  }));

  const { hasHomepage, hasPricing, hasAbout } = checkRequiredPages(normalizedPages);
  const failedPages: string[] = [];
  const optionalTypes = config.optional_pages ?? OPTIONAL_PAGE_PRIORITY.slice(0, 5);
  const attemptedPages = [...MANDATORY_PAGES, ...optionalTypes];

  if (!hasHomepage) {
    throw new Error('ERR_CORPUS_EMPTY: homepage page not present in fixture');
  }
  if (!hasPricing) {
    console.warn('WARN_PRICING_UNAVAILABLE: pricing page not present in fixture');
    failedPages.push(buildPageUrl(domain, 'pricing'));
  }
  if (!hasAbout) {
    console.warn('WARN_ABOUT_UNAVAILABLE: about page not present in fixture');
    failedPages.push(buildPageUrl(domain, 'about'));
  }

  const limitedPages = applyLimits(normalizedPages, maxPages, maxTokens);
  const totalTokens = limitedPages.reduce((sum, p) => sum + p.token_count, 0);

  return {
    domain,
    fetched_at: now(),
    pages: limitedPages,
    fetch_metadata: {
      attempted_pages: attemptedPages.map(pt => buildPageUrl(domain, pt)),
      failed_pages: failedPages,
      total_tokens: totalTokens,
    },
  };
}

// ---------------------------------------------------------------------------
// Mode B — provider
// ---------------------------------------------------------------------------

// Minimum gap between consecutive provider requests (rate-limit protection)
const PROVIDER_REQUEST_GAP_MS = 300;

async function fetchFromProvider(
  domain: string,
  provider: SiteCorpusProvider,
  config: CrawlConfig,
): Promise<SiteCorpus> {
  const maxPages = Math.min(config.max_pages ?? MAX_PAGES, MAX_PAGES);
  const maxTokens = Math.min(config.max_tokens ?? MAX_TOKENS, MAX_TOKENS);

  const optionalTypes = (config.optional_pages ?? OPTIONAL_PAGE_PRIORITY).slice(0, 5);
  const pageTypesToFetch: SitePageType[] = [...MANDATORY_PAGES, ...optionalTypes];
  // Deduplicate while preserving order
  const uniqueTypes = pageTypesToFetch.filter((pt, i) => pageTypesToFetch.indexOf(pt) === i);

  const attemptedUrls: string[] = [];
  const failedPages: string[] = [];
  const pages: CorpusPage[] = [];
  let totalTokens = 0;
  let lastRequestAt = 0;

  for (const pageType of uniqueTypes) {
    if (pages.length >= maxPages) break;

    // 300ms pacing between requests (rate-limit protection)
    const elapsed = Date.now() - lastRequestAt;
    if (lastRequestAt > 0 && elapsed < PROVIDER_REQUEST_GAP_MS) {
      await new Promise(resolve => setTimeout(resolve, PROVIDER_REQUEST_GAP_MS - elapsed));
    }

    const url = buildPageUrl(domain, pageType);
    attemptedUrls.push(url);
    lastRequestAt = Date.now();

    const result = await provider.fetchPage(url);
    const tokenCount = estimateTokenCount(result.text);

    if (!result.success || !result.text) {
      failedPages.push(url);
      if (pageType === 'homepage') {
        throw new Error('ERR_CORPUS_EMPTY: homepage fetch failed');
      }
      if (pageType === 'pricing') {
        console.warn('WARN_PRICING_UNAVAILABLE: pricing page fetch failed');
      }
      continue;
    }

    if (totalTokens + tokenCount > maxTokens) break;

    pages.push({
      url,
      page_type: pageType,
      fetched_at: now(),
      raw_text: result.text,
      token_count: tokenCount,
      fetch_success: true,
      source_tier: 1,
      // Propagate acquisition method from provider (e.g. 'cloudflare')
      ...(provider.acquisition_method ? { acquisition_method: provider.acquisition_method } : {}),
    });
    totalTokens += tokenCount;
  }

  if (!checkRequiredPages(pages).hasHomepage) {
    throw new Error('ERR_CORPUS_EMPTY: homepage was not successfully fetched');
  }

  return {
    domain,
    fetched_at: now(),
    pages,
    fetch_metadata: {
      attempted_pages: attemptedUrls,
      failed_pages: failedPages,
      total_tokens: totalTokens,
    },
  };
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function siteCorpusAcquisition(
  input: SiteCorpusAcquisitionInput,
): Promise<SiteCorpus> {
  const config: CrawlConfig = input.crawl_config ?? {};

  if (input.fixture_pages !== undefined) {
    // Mode A: fixture/manual — synchronous logic, wrapped for async API consistency
    return loadFromFixture(input.domain, input.fixture_pages, config);
  }

  if (input.provider !== undefined) {
    // Mode B: caller-supplied provider
    return fetchFromProvider(input.domain, input.provider, config);
  }

  // Mode B (auto): use PlaywrightRenderingProvider (default live provider)
  const autoProvider = await getPlaywrightProvider();
  return fetchFromProvider(input.domain, autoProvider, config);
}
