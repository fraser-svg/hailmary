/**
 * PlaywrightRenderingProvider — Site corpus acquisition via headless Chromium
 *
 * Implements SiteCorpusProvider using Playwright + Chromium.
 * Renders JS-heavy pages, waits for networkidle, extracts clean text.
 *
 * Evidence contamination rule: page.content() returns raw rendered HTML.
 * Normalisation is deterministic TypeScript via normaliseHTML() — no LLM.
 * Only verbatim page text enters CorpusPage.raw_text.
 *
 * Design:
 *   - Browser launched lazily on first fetchPage() call
 *   - One browser instance reused across all pages in a corpus run
 *   - Each page opened/closed per fetchPage() call
 *   - Fallback: any Playwright error → { text: '', success: false }
 *   - launchFn injectable for tests (avoids real Chromium in unit tests)
 */

import type { SiteCorpusProvider } from '../acquisition/site-corpus.js';
import { normaliseHTML } from './cloudflare-adapter.js';
import { estimateTokenCount } from '../acquisition/site-corpus.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PER_PAGE_TIMEOUT_MS = 15_000;
const GOTO_TIMEOUT_MS = 12_000;      // 3s buffer under per-page cap
const MAX_TOKENS_PER_PAGE = 5_000;
const MIN_CONTENT_CHARS = 100;

// ---------------------------------------------------------------------------
// Minimal browser/page interfaces for testability
// ---------------------------------------------------------------------------

export interface PlaywrightPage {
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  content(): Promise<string>;
  close(): Promise<void>;
}

export interface PlaywrightBrowser {
  newPage(): Promise<PlaywrightPage>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// PlaywrightRenderingProvider
// ---------------------------------------------------------------------------

export interface PlaywrightRenderingProviderConfig {
  /**
   * Injectable browser launch function — used in tests to avoid spawning
   * a real Chromium process. Defaults to: chromium.launch({ headless: true })
   */
  launchFn?: () => Promise<PlaywrightBrowser>;
}

export class PlaywrightRenderingProvider implements SiteCorpusProvider {
  readonly acquisition_method = 'playwright' as const;

  private readonly launchFn: () => Promise<PlaywrightBrowser>;
  private _browser: PlaywrightBrowser | null = null;

  constructor(config: PlaywrightRenderingProviderConfig = {}) {
    this.launchFn = config.launchFn ?? defaultLaunchFn;
  }

  static fromEnv(): PlaywrightRenderingProvider {
    return new PlaywrightRenderingProvider();
  }

  /**
   * Fetch a single URL via headless Chromium.
   *
   * Renders the page (JS executed), waits for networkidle, extracts HTML,
   * normalises to plain text, and enforces the token cap.
   *
   * Returns { text: '', success: false } on any error.
   */
  async fetchPage(url: string): Promise<{ text: string; success: boolean }> {
    let page: PlaywrightPage | null = null;
    const timer = setTimeout(
      () => { /* hard timeout handled by goto */ },
      PER_PAGE_TIMEOUT_MS,
    );

    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();

      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: GOTO_TIMEOUT_MS,
      });

      const html = await page.content();
      const text = normaliseHTML(html);

      if (!text || text.length < MIN_CONTENT_CHARS) {
        console.warn(`WARN_PLAYWRIGHT_SPARSE: ${url} (${text.length} chars after normalisation)`);
        return { text: '', success: false };
      }

      const capped = truncateToTokenCap(text, MAX_TOKENS_PER_PAGE);
      return { text: capped, success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Timeout') || msg.includes('timeout')) {
        console.warn(`WARN_PLAYWRIGHT_TIMEOUT: ${url}`);
      } else if (msg.includes('net::ERR') || msg.includes('Navigation')) {
        console.warn(`WARN_PLAYWRIGHT_NAVIGATION: ${url}: ${msg}`);
      } else {
        console.warn(`WARN_PLAYWRIGHT_ERROR: ${url}: ${msg}`);
      }
      return { text: '', success: false };
    } finally {
      clearTimeout(timer);
      if (page) {
        await page.close().catch(() => { /* ignore close errors */ });
      }
    }
  }

  /**
   * Close the underlying browser. Call when finished with all fetches
   * to release Chromium resources. Safe to call if browser was never opened.
   */
  async close(): Promise<void> {
    if (this._browser) {
      await this._browser.close().catch(() => { /* ignore */ });
      this._browser = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Private: lazy browser init
  // ---------------------------------------------------------------------------

  private async getBrowser(): Promise<PlaywrightBrowser> {
    if (!this._browser) {
      this._browser = await this.launchFn();
    }
    return this._browser;
  }
}

// ---------------------------------------------------------------------------
// Default launch function — dynamically imported to avoid top-level require
// ---------------------------------------------------------------------------

async function defaultLaunchFn(): Promise<PlaywrightBrowser> {
  const { chromium } = await import('playwright');
  return chromium.launch({ headless: true }) as Promise<PlaywrightBrowser>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateToTokenCap(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4; // rough: 1 token ≈ 4 chars
  if (text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
}

/**
 * Estimate token count for a page fetched by this provider.
 * Re-exported so callers don't need to import from site-corpus.
 */
export { estimateTokenCount };
