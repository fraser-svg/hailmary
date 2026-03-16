/**
 * CloudflareRenderingProvider — Spec 005 §Provider 2
 *
 * Implements SiteCorpusProvider using the Cloudflare Browser Rendering REST API.
 * Fetches and JS-renders pages, then normalises HTML to clean plain text.
 *
 * Endpoint: POST https://api.cloudflare.com/client/v4/accounts/{accountId}/browser-rendering/snapshot
 * Auth: Authorization: Bearer ${CLOUDFLARE_API_TOKEN}
 * Response field: result.content (rendered HTML string)
 *
 * Evidence contamination rule: result.content is raw HTML from the rendered page.
 * Normalisation is deterministic TypeScript — no LLM. Only verbatim page text
 * enters CorpusPage.raw_text.
 *
 * Fallback: Cloudflare failure → plain HTTP fetch.
 * Homepage: fatal (throws ERR_CORPUS_EMPTY) if both fail.
 * Non-homepage: returns { text: '', success: false }.
 */

import type { SiteCorpusProvider } from '../acquisition/site-corpus.js';
import type { CloudflareSnapshotRequest, CloudflareSnapshotResponse } from './cloudflare-types.js';
import { estimateTokenCount } from '../acquisition/site-corpus.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';
const PER_PAGE_TIMEOUT_MS = 10_000;
const GOTO_TIMEOUT_MS = 9_000;     // 1s buffer under 10s cap
const MAX_TOKENS_PER_PAGE = 5_000;
const MIN_CONTENT_CHARS = 100;     // Below this after normalisation = treat as empty

// ---------------------------------------------------------------------------
// HTML normalisation — deterministic, no LLM
// ---------------------------------------------------------------------------

// Noise class name patterns for cookie banners, modals, chat widgets
const NOISE_CLASS_PATTERNS = [
  'cookie', 'banner', 'consent', 'gdpr', 'intercom', 'drift', 'crisp',
  'chatbot', 'popup', 'modal', 'overlay',
];
const NOISE_CLASS_RE = new RegExp(
  `class="[^"]*(?:${NOISE_CLASS_PATTERNS.join('|')})[^"]*"`,
  'i',
);

/**
 * Strip a named element and its entire inner content.
 * Uses a simple tag-balancing loop — not a full parser, but handles most real pages.
 */
function stripElementContent(html: string, tagName: string): string {
  const openRe = new RegExp(`<${tagName}(\\s[^>]*)?>`, 'gi');
  const closeTag = `</${tagName}>`;
  let result = html;
  let match: RegExpExecArray | null;

  // Reset index before loop
  openRe.lastIndex = 0;

  while ((match = openRe.exec(result)) !== null) {
    const start = match.index;
    const closeIdx = result.toLowerCase().indexOf(closeTag.toLowerCase(), start);
    if (closeIdx === -1) {
      // No closing tag — just remove the open tag
      result = result.slice(0, start) + result.slice(start + match[0].length);
      openRe.lastIndex = start;
    } else {
      const end = closeIdx + closeTag.length;
      result = result.slice(0, start) + ' ' + result.slice(end);
      openRe.lastIndex = start;
    }
  }

  return result;
}

/**
 * Remove div/section/aside elements whose class attribute matches noise patterns.
 * Best-effort: finds the opening tag, then removes to the matching close tag.
 */
function stripNoiseElements(html: string): string {
  // Match opening div/section/aside/header tags with noise class names
  const openRe = /<(div|section|aside|header)\b([^>]*)>/gi;
  let result = html;
  let match: RegExpExecArray | null;
  openRe.lastIndex = 0;

  const toStrip: Array<{ start: number; end: number }> = [];

  while ((match = openRe.exec(result)) !== null) {
    const attrs = match[2];
    const hasNoiseClass = NOISE_CLASS_RE.test(attrs);
    const hasNoiseRole = /role="(?:complementary)"/i.test(attrs);
    if (!hasNoiseClass && !hasNoiseRole) continue;

    const tagName = match[1];
    const start = match.index;
    const closeTag = `</${tagName}>`;
    const closeIdx = result.toLowerCase().indexOf(closeTag.toLowerCase(), start + match[0].length);
    if (closeIdx !== -1) {
      toStrip.push({ start, end: closeIdx + closeTag.length });
    }
  }

  // Remove in reverse order so indices remain valid
  for (let i = toStrip.length - 1; i >= 0; i--) {
    const { start, end } = toStrip[i]!;
    result = result.slice(0, start) + ' ' + result.slice(end);
  }

  return result;
}

/**
 * Decode common HTML entities.
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Normalise rendered HTML → plain text per Spec 005 §Content Normalisation.
 *
 * Strip order:
 * 1. Remove <script>, <style>, <noscript>, <iframe> blocks
 * 2. Remove <nav>, <footer> blocks (entire content)
 * 3. Remove noise elements (cookie banners, modals, chat widgets)
 * 4. Remove role=navigation elements
 * 5. Strip all remaining HTML tags
 * 6. Decode entities + post-process
 *
 * <header> hero text is PRESERVED. The <nav> stripping pass removes navigation
 * within headers (most sites put nav menus in <nav> elements inside <header>).
 */
export function normaliseHTML(html: string): string {
  let text = html;

  // Pass 1: remove script/style/noscript/iframe content entirely
  text = stripElementContent(text, 'script');
  text = stripElementContent(text, 'style');
  text = stripElementContent(text, 'noscript');
  text = stripElementContent(text, 'iframe');

  // Pass 2: remove nav and footer blocks (including content within <header>)
  text = stripElementContent(text, 'nav');
  text = stripElementContent(text, 'footer');

  // Pass 3: remove noise class / role elements
  text = stripNoiseElements(text);

  // Pass 4: remove role="navigation" spans/divs
  text = text.replace(/<[^>]+role="navigation"[^>]*>[\s\S]*?<\/(?:div|nav|ul|header)>/gi, ' ');

  // Pass 5: strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode entities
  text = decodeEntities(text);

  // Post-processing per spec:
  // 1. Collapse whitespace (spaces, tabs)
  text = text.replace(/[ \t]+/g, ' ');
  // 2. Collapse 3+ consecutive newlines to 2
  text = text.replace(/\n{3,}/g, '\n\n');
  // 3. Remove lines shorter than 20 chars (nav remnants) — keep numeric lines (prices)
  const lines = text.split('\n')
    .map(line => line.trim())
    .filter(line => {
      if (line.length === 0) return false;
      if (line.length >= 20) return true;
      // Keep lines that start with a number/currency (prices)
      if (/^[\$£€]?\d/.test(line)) return true;
      return false;
    });

  return lines.join('\n').trim();
}

/**
 * Hard-truncate at token cap, at word boundary.
 */
function truncateToTokenCap(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4; // rough: 1 token ≈ 4 chars
  if (text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
}

// ---------------------------------------------------------------------------
// CloudflareRenderingProvider
// ---------------------------------------------------------------------------

export interface CloudflareRenderingProviderConfig {
  accountId: string;
  apiToken: string;
  /** Injectable fetch function — used in tests to avoid real API calls */
  fetchFn?: typeof fetch;
}

export class CloudflareRenderingProvider implements SiteCorpusProvider {
  /** Identifies how pages fetched by this provider were acquired */
  readonly acquisition_method = 'cloudflare' as const;

  private readonly accountId: string;
  private readonly apiToken: string;
  private readonly fetchFn: typeof fetch;
  private readonly snapshotUrl: string;

  constructor(config: CloudflareRenderingProviderConfig) {
    this.accountId = config.accountId;
    this.apiToken = config.apiToken;
    this.fetchFn = config.fetchFn ?? fetch;
    this.snapshotUrl = `${CF_API_BASE}/accounts/${this.accountId}/browser-rendering/snapshot`;
  }

  static fromEnv(): CloudflareRenderingProvider {
    const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
    const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
    if (!accountId || !apiToken) {
      throw new Error('ERR_MISSING_CREDENTIAL: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required');
    }
    return new CloudflareRenderingProvider({ accountId, apiToken });
  }

  async fetchPage(url: string): Promise<{ text: string; success: boolean }> {
    // Try Cloudflare rendering first
    const cfResult = await this.fetchWithCloudflare(url);

    if (cfResult !== null && cfResult.length >= MIN_CONTENT_CHARS) {
      const capped = truncateToTokenCap(cfResult, MAX_TOKENS_PER_PAGE);
      return { text: capped, success: true };
    }

    // Fallback: plain HTTP fetch
    const plainResult = await this.fetchWithPlainHttp(url);

    if (plainResult !== null && plainResult.length >= MIN_CONTENT_CHARS) {
      const capped = truncateToTokenCap(plainResult, MAX_TOKENS_PER_PAGE);
      return { text: capped, success: true };
    }

    return { text: '', success: false };
  }

  // ---------------------------------------------------------------------------
  // Internal: Cloudflare render
  // ---------------------------------------------------------------------------

  private async fetchWithCloudflare(url: string): Promise<string | null> {
    const body: CloudflareSnapshotRequest = {
      url,
      gotoOptions: {
        waitUntil: 'networkidle2',
        timeout: GOTO_TIMEOUT_MS,
      },
      rejectResourceTypes: ['image', 'media', 'font', 'stylesheet'],
    };

    let response: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PER_PAGE_TIMEOUT_MS);

      response = await this.fetchFn(this.snapshotUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('abort') || msg.includes('timed out')) {
        console.warn(`WARN_CLOUDFLARE_TIMEOUT: ${url}`);
      } else {
        console.warn(`WARN_CLOUDFLARE_NETWORK: ${url}: ${msg}`);
      }
      return null;
    }

    if (response.status === 401) {
      throw new Error('ERR_CLOUDFLARE_AUTH_FAILED');
    }

    if (response.status === 403) {
      console.warn(`WARN_CLOUDFLARE_BLOCKED: ${url}`);
      return null;
    }

    if (response.status === 429) {
      // Retry once after 2s
      await new Promise(resolve => setTimeout(resolve, 2000));
      try {
        const retryResponse = await this.fetchFn(this.snapshotUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        if (!retryResponse.ok) return null;
        const retryData = await retryResponse.json() as CloudflareSnapshotResponse;
        if (!retryData.success) return null;
        return normaliseHTML(retryData.result.content ?? '');
      } catch {
        return null;
      }
    }

    if (!response.ok) {
      console.warn(`WARN_CLOUDFLARE_HTTP_ERROR: ${url}: ${response.status}`);
      return null;
    }

    let data: CloudflareSnapshotResponse;
    try {
      data = await response.json() as CloudflareSnapshotResponse;
    } catch {
      console.warn(`WARN_CLOUDFLARE_PARSE_ERROR: ${url}`);
      return null;
    }

    if (!data.success || !data.result?.content) {
      return null;
    }

    return normaliseHTML(data.result.content);
  }

  // ---------------------------------------------------------------------------
  // Internal: plain HTTP fallback
  // ---------------------------------------------------------------------------

  private async fetchWithPlainHttp(url: string): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PER_PAGE_TIMEOUT_MS);

      const response = await this.fetchFn(url, {
        headers: { 'User-Agent': 'HailMary/1.0 (intelligence research)' },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) return null;
      const html = await response.text();
      return normaliseHTML(html);
    } catch {
      return null;
    }
  }
}
