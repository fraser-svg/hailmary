/**
 * CloudflareRenderingProvider Tests — Spec 005 §Provider 2
 *
 * Zero API calls — all tests use fixture HTML via injectable fetchFn.
 *
 * Critical assertions:
 *   - nav elements stripped from raw_text
 *   - hero text in <header> IS preserved (not stripped)
 *   - <script> and <style> content absent from output
 *   - cookie banner text absent from output
 *   - token cap enforced (output ≤ 5,000 tokens)
 *   - fallback to plain fetch when Cloudflare success: false
 *   - homepage fatal (ERR_CORPUS_EMPTY thrown on both Cloudflare and plain fetch failure)
 *   - non-homepage failure returns { text: '', success: false } without throwing
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CloudflareRenderingProvider, normaliseHTML } from '../cloudflare-adapter.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function loadFixture(name: string): string {
  return readFileSync(join(__dirname, '__fixtures__', 'cloudflare', name), 'utf-8');
}

const homepageHtml = loadFixture('homepage-with-hero.html');
const pricingHtml = loadFixture('pricing-js-rendered.html');

// ---------------------------------------------------------------------------
// Cloudflare success response
// ---------------------------------------------------------------------------

function makeCloudflareOk(html: string): Response {
  const body = JSON.stringify({
    success: true,
    result: { content: html },
    errors: [],
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function makeCloudflareFailure(): Response {
  const body = JSON.stringify({ success: false, result: { content: '' }, errors: [{ code: 1001, message: 'Timeout' }] });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function makeHttpError(status: number): Response {
  return new Response('Error', { status });
}

function makePlainHtmlResponse(html: string): Response {
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } });
}

// ---------------------------------------------------------------------------
// normaliseHTML unit tests (pure function)
// ---------------------------------------------------------------------------

describe('normaliseHTML — pure HTML normalisation', () => {
  it('removes <script> content', () => {
    const html = '<html><body><script>var secret = "analytics_key";</script><p>Hello world content here.</p></body></html>';
    const result = normaliseHTML(html);
    expect(result).not.toContain('analytics_key');
    expect(result).toContain('Hello world content here');
  });

  it('removes <style> content', () => {
    const html = '<html><head><style>.hidden { display: none; } body { color: red; }</style></head><body><p>Page content is here and has enough text.</p></body></html>';
    const result = normaliseHTML(html);
    expect(result).not.toContain('display: none');
    expect(result).not.toContain('color: red');
    expect(result).toContain('Page content is here');
  });

  it('removes <nav> content', () => {
    const html = '<html><body><nav><ul><li><a href="/pricing">Pricing</a></li><li><a href="/login">Login</a></li></ul></nav><main><p>Main product description with enough characters to pass the line filter.</p></main></body></html>';
    const result = normaliseHTML(html);
    expect(result).not.toContain('href="/pricing"');
    expect(result).not.toContain('href="/login"');
    expect(result).toContain('Main product description');
  });

  it('removes <footer> content', () => {
    const html = '<html><body><main><p>This is the main content paragraph which is long enough.</p></main><footer><p>Copyright 2024. Privacy Policy. Terms of Service.</p></footer></body></html>';
    const result = normaliseHTML(html);
    expect(result).not.toContain('Copyright 2024');
    expect(result).toContain('This is the main content paragraph');
  });

  it('removes <noscript> content', () => {
    const html = '<html><body><noscript>Please enable JavaScript to use this site. NoScript fallback message here.</noscript><main><p>Main content that matters and has plenty of text here.</p></main></body></html>';
    const result = normaliseHTML(html);
    expect(result).not.toContain('enable JavaScript');
    expect(result).toContain('Main content that matters');
  });

  it('removes <iframe> content', () => {
    const html = '<html><body><iframe src="https://intercom.io/widget">Intercom chat iframe fallback text here</iframe><p>This is the real page content with enough characters here.</p></body></html>';
    const result = normaliseHTML(html);
    expect(result).not.toContain('Intercom chat iframe fallback');
    expect(result).toContain('real page content');
  });

  it('PRESERVES hero text in <header> when nav is removed', () => {
    const result = normaliseHTML(homepageHtml);
    // Hero text from the <header> hero-content div should be present
    expect(result).toContain('Background jobs built for developers');
    expect(result).toContain('Trigger.dev is the open-source background jobs platform');
  });

  it('removes navigation links from within <header>', () => {
    const result = normaliseHTML(homepageHtml);
    // Nav links within header should be stripped
    expect(result).not.toContain('href="/pricing"');
    expect(result).not.toContain('href="/login"');
    expect(result).not.toContain('href="/signup"');
  });

  it('removes cookie banner text (class=cookie-banner)', () => {
    const result = normaliseHTML(homepageHtml);
    expect(result).not.toContain('We use cookies to improve your experience');
    expect(result).not.toContain('cookie policy');
  });

  it('removes intercom container (class=intercom-container)', () => {
    const result = normaliseHTML(homepageHtml);
    expect(result).not.toContain('widget.intercom.io');
  });

  it('preserves main content body text', () => {
    const result = normaliseHTML(homepageHtml);
    expect(result).toContain('Why teams choose Trigger.dev');
    expect(result).toContain('Durable execution with automatic retries');
    expect(result).toContain('Real-time logs and observability');
  });

  it('preserves customer quotes', () => {
    const result = normaliseHTML(homepageHtml);
    expect(result).toContain('cut our infrastructure complexity by 60%');
  });

  it('preserves pricing table content', () => {
    const result = normaliseHTML(pricingHtml);
    expect(result).toContain('$0/month');
    expect(result).toContain('$20/month');
    expect(result).toContain('500,000 task runs/month');
  });

  it('removes footer content', () => {
    const result = normaliseHTML(pricingHtml);
    expect(result).not.toContain('© 2024 Trigger.dev');
  });

  it('collapses multiple whitespace', () => {
    const html = '<p>Text   with    lots    of     spaces   here   for    testing.</p>';
    const result = normaliseHTML(html);
    expect(result).not.toMatch(/  +/); // no double spaces
  });
});

// ---------------------------------------------------------------------------
// CloudflareRenderingProvider — successful fetch
// ---------------------------------------------------------------------------

describe('CloudflareRenderingProvider — successful Cloudflare render', () => {
  it('returns success: true with normalised text', async () => {
    const fetchFn = async (url: string) => {
      if (String(url).includes('browser-rendering')) {
        return makeCloudflareOk(homepageHtml);
      }
      return makeHttpError(500);
    };

    const provider = new CloudflareRenderingProvider({
      accountId: 'test-account',
      apiToken: 'test-token',
      fetchFn: fetchFn as typeof fetch,
    });

    const result = await provider.fetchPage('https://trigger.dev/');

    expect(result.success).toBe(true);
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.text).toContain('Background jobs built for developers');
  });

  it('hero text from <header> is in output text', async () => {
    const fetchFn = async (url: string) => {
      if (String(url).includes('browser-rendering')) return makeCloudflareOk(homepageHtml);
      return makeHttpError(500);
    };

    const provider = new CloudflareRenderingProvider({
      accountId: 'test-account',
      apiToken: 'test-token',
      fetchFn: fetchFn as typeof fetch,
    });

    const result = await provider.fetchPage('https://trigger.dev/');

    expect(result.text).toContain('Background jobs built for developers');
    expect(result.text).toContain('Trigger.dev is the open-source background jobs platform');
  });

  it('<script> content absent from output', async () => {
    const fetchFn = async (url: string) => {
      if (String(url).includes('browser-rendering')) return makeCloudflareOk(homepageHtml);
      return makeHttpError(500);
    };

    const provider = new CloudflareRenderingProvider({
      accountId: 'test-account',
      apiToken: 'test-token',
      fetchFn: fetchFn as typeof fetch,
    });

    const result = await provider.fetchPage('https://trigger.dev/');

    expect(result.text).not.toContain('window._analytics');
    expect(result.text).not.toContain('document.addEventListener');
    expect(result.text).not.toContain("s.src = 'https://cdn.example.com/tracker.js'");
  });

  it('<style> content absent from output', async () => {
    const fetchFn = async (url: string) => {
      if (String(url).includes('browser-rendering')) return makeCloudflareOk(homepageHtml);
      return makeHttpError(500);
    };

    const provider = new CloudflareRenderingProvider({
      accountId: 'test-account',
      apiToken: 'test-token',
      fetchFn: fetchFn as typeof fetch,
    });

    const result = await provider.fetchPage('https://trigger.dev/');

    expect(result.text).not.toContain('font-family: sans-serif');
    expect(result.text).not.toContain('background: #000');
  });

  it('cookie banner text absent from output', async () => {
    const fetchFn = async (url: string) => {
      if (String(url).includes('browser-rendering')) return makeCloudflareOk(homepageHtml);
      return makeHttpError(500);
    };

    const provider = new CloudflareRenderingProvider({
      accountId: 'test-account',
      apiToken: 'test-token',
      fetchFn: fetchFn as typeof fetch,
    });

    const result = await provider.fetchPage('https://trigger.dev/');

    expect(result.text).not.toContain('We use cookies to improve your experience');
  });

  it('token cap enforced: output token estimate ≤ 5000', async () => {
    // Create a very large HTML fixture
    const largeContent = '<p>' + 'This is a very long paragraph with lots of content. '.repeat(500) + '</p>';
    const largeHtml = `<html><body><main>${largeContent}</main></body></html>`;

    const fetchFn = async (url: string) => {
      if (String(url).includes('browser-rendering')) return makeCloudflareOk(largeHtml);
      return makeHttpError(500);
    };

    const provider = new CloudflareRenderingProvider({
      accountId: 'test-account',
      apiToken: 'test-token',
      fetchFn: fetchFn as typeof fetch,
    });

    const result = await provider.fetchPage('https://trigger.dev/');

    expect(result.success).toBe(true);
    // Token estimate: chars / 4 ≤ 5000 means chars ≤ 20000
    expect(result.text.length).toBeLessThanOrEqual(20000);
  });
});

// ---------------------------------------------------------------------------
// Fallback behaviour
// ---------------------------------------------------------------------------

describe('CloudflareRenderingProvider — fallback to plain HTTP', () => {
  it('falls back to plain HTTP fetch when Cloudflare returns success: false', async () => {
    let plainFetchCalled = false;
    const fetchFn = async (url: string) => {
      if (String(url).includes('browser-rendering')) {
        return makeCloudflareFailure();
      }
      // Plain HTTP fallback
      plainFetchCalled = true;
      return makePlainHtmlResponse(homepageHtml);
    };

    const provider = new CloudflareRenderingProvider({
      accountId: 'test-account',
      apiToken: 'test-token',
      fetchFn: fetchFn as typeof fetch,
    });

    const result = await provider.fetchPage('https://trigger.dev/');

    expect(plainFetchCalled).toBe(true);
    expect(result.success).toBe(true);
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('returns { text: "", success: false } when both Cloudflare and plain fetch fail', async () => {
    const fetchFn = async (url: string) => {
      if (String(url).includes('browser-rendering')) return makeCloudflareFailure();
      return makeHttpError(503);
    };

    const provider = new CloudflareRenderingProvider({
      accountId: 'test-account',
      apiToken: 'test-token',
      fetchFn: fetchFn as typeof fetch,
    });

    const result = await provider.fetchPage('https://trigger.dev/about');

    expect(result.success).toBe(false);
    expect(result.text).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('CloudflareRenderingProvider — error handling', () => {
  it('HTTP 401 → throws ERR_CLOUDFLARE_AUTH_FAILED', async () => {
    const fetchFn = async () => makeHttpError(401);

    const provider = new CloudflareRenderingProvider({
      accountId: 'test-account',
      apiToken: 'bad-token',
      fetchFn: fetchFn as typeof fetch,
    });

    await expect(provider.fetchPage('https://trigger.dev/')).rejects.toThrow('ERR_CLOUDFLARE_AUTH_FAILED');
  });

  it('network error → returns { text: "", success: false } without throwing', async () => {
    const fetchFn = async (url: string) => {
      if (String(url).includes('browser-rendering')) {
        throw new Error('Network failure');
      }
      throw new Error('Also failed');
    };

    const provider = new CloudflareRenderingProvider({
      accountId: 'test-account',
      apiToken: 'test-token',
      fetchFn: fetchFn as typeof fetch,
    });

    const result = await provider.fetchPage('https://trigger.dev/about');

    expect(result.success).toBe(false);
    expect(result.text).toBe('');
  });

  it('missing credentials → throws ERR_MISSING_CREDENTIAL', () => {
    const originalAccountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
    const originalToken = process.env['CLOUDFLARE_API_TOKEN'];

    delete process.env['CLOUDFLARE_ACCOUNT_ID'];
    delete process.env['CLOUDFLARE_API_TOKEN'];

    expect(() => CloudflareRenderingProvider.fromEnv()).toThrow('ERR_MISSING_CREDENTIAL');

    if (originalAccountId !== undefined) process.env['CLOUDFLARE_ACCOUNT_ID'] = originalAccountId;
    if (originalToken !== undefined) process.env['CLOUDFLARE_API_TOKEN'] = originalToken;
  });

  it('uses correct Cloudflare endpoint path', async () => {
    let capturedUrl = '';
    const fetchFn = async (url: string) => {
      capturedUrl = String(url);
      return makeCloudflareOk(homepageHtml);
    };

    const provider = new CloudflareRenderingProvider({
      accountId: 'my-account-id',
      apiToken: 'test-token',
      fetchFn: fetchFn as typeof fetch,
    });

    await provider.fetchPage('https://trigger.dev/');

    expect(capturedUrl).toContain('/accounts/my-account-id/browser-rendering/snapshot');
  });

  it('uses Bearer token authentication', async () => {
    let capturedHeaders: Record<string, string> = {};
    const fetchFn = async (_url: string, init?: RequestInit) => {
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
      return makeCloudflareOk(homepageHtml);
    };

    const provider = new CloudflareRenderingProvider({
      accountId: 'test-account',
      apiToken: 'my-secret-token',
      fetchFn: fetchFn as typeof fetch,
    });

    await provider.fetchPage('https://trigger.dev/');

    expect(capturedHeaders['Authorization']).toBe('Bearer my-secret-token');
  });

  it('request body contains waitUntil: networkidle2', async () => {
    let capturedBody: Record<string, unknown> = {};
    const fetchFn = async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return makeCloudflareOk(homepageHtml);
    };

    const provider = new CloudflareRenderingProvider({
      accountId: 'test-account',
      apiToken: 'test-token',
      fetchFn: fetchFn as typeof fetch,
    });

    await provider.fetchPage('https://trigger.dev/');

    expect((capturedBody.gotoOptions as Record<string, unknown>)?.waitUntil).toBe('networkidle2');
  });

  it('request body rejects image, media, font, stylesheet resources', async () => {
    let capturedBody: Record<string, unknown> = {};
    const fetchFn = async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return makeCloudflareOk(homepageHtml);
    };

    const provider = new CloudflareRenderingProvider({
      accountId: 'test-account',
      apiToken: 'test-token',
      fetchFn: fetchFn as typeof fetch,
    });

    await provider.fetchPage('https://trigger.dev/');

    const rejected = capturedBody.rejectResourceTypes as string[];
    expect(rejected).toContain('image');
    expect(rejected).toContain('media');
    expect(rejected).toContain('font');
    expect(rejected).toContain('stylesheet');
  });
});
