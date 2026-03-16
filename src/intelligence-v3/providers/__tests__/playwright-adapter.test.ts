/**
 * PlaywrightRenderingProvider Tests
 *
 * Zero real browser calls — all tests use injectable launchFn with mock
 * browser/page objects.
 *
 * Critical assertions:
 *   - nav/footer/script/style stripped via normaliseHTML
 *   - hero text in <header> preserved
 *   - token cap enforced (≤ 5,000 tokens)
 *   - networkidle wait option passed to page.goto()
 *   - page.close() always called (even on error)
 *   - browser lazily initialized (launchFn not called until first fetchPage)
 *   - browser reused across multiple fetchPage calls
 *   - any page.goto() error → { text: '', success: false }
 *   - any page.content() error → { text: '', success: false }
 *   - sparse content (< 100 chars after normalisation) → success: false
 *   - close() shuts browser and clears reference
 */

import { describe, it, expect, vi } from 'vitest';
import type { PlaywrightPage, PlaywrightBrowser } from '../playwright-adapter.js';
import { PlaywrightRenderingProvider } from '../playwright-adapter.js';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makePageMock(html: string): PlaywrightPage & { closeCalled: boolean; gotoOptions: unknown[] } {
  const closeCalled = { value: false };
  const gotoOptions: unknown[] = [];
  return {
    goto: vi.fn(async (_url: string, opts?: unknown) => {
      gotoOptions.push(opts);
    }) as unknown as PlaywrightPage['goto'],
    content: vi.fn(async () => html),
    close: vi.fn(async () => { closeCalled.value = true; }),
    get closeCalled() { return closeCalled.value; },
    get gotoOptions() { return gotoOptions; },
  };
}

function makeBrowserMock(page: PlaywrightPage): PlaywrightBrowser & { closeCalled: boolean } {
  const closeCalled = { value: false };
  return {
    newPage: vi.fn(async () => page),
    close: vi.fn(async () => { closeCalled.value = true; }),
    get closeCalled() { return closeCalled.value; },
  };
}

function makeLaunchFn(browser: PlaywrightBrowser) {
  return vi.fn(async () => browser);
}

// ---------------------------------------------------------------------------
// HTML fixtures
// ---------------------------------------------------------------------------

const RICH_HTML = `
<html>
<head><style>.nav { display: none; }</style></head>
<body>
  <nav><a href="/pricing">Pricing</a><a href="/login">Login</a></nav>
  <header>
    <h1>The best developer workflow automation platform</h1>
    <p>Build reliable background jobs in minutes, not months.</p>
  </header>
  <main>
    <section>
      <h2>Ship faster with background jobs</h2>
      <p>Trigger.dev handles retries, scheduling, and observability so you can focus on building features that matter to your customers.</p>
      <p>Native TypeScript SDK. Zero infrastructure. Deploy anywhere.</p>
    </section>
    <section>
      <h2>Trusted by thousands of developers</h2>
      <p>From startups to enterprises, teams rely on Trigger.dev for critical background processing.</p>
    </section>
  </main>
  <footer>
    <p>© 2024 Trigger.dev. All rights reserved.</p>
    <nav>Footer navigation links here</nav>
  </footer>
  <div class="cookie-banner">Accept cookies to continue using our site.</div>
</body>
</html>
`.trim();

const SPARSE_HTML = `<html><body><nav>Home About</nav><footer>Footer</footer></body></html>`;

const SCRIPT_HEAVY_HTML = `
<html>
<head>
  <script>
    window.__SECRET_KEY__ = "abc123";
    analytics.track("pageview");
  </script>
</head>
<body>
  <main>
    <h1>Product pricing that scales with your usage</h1>
    <p>Start free, pay as you grow. No credit card required to get started with our developer plan.</p>
    <p>Our enterprise plan includes custom limits, dedicated support, and SLA guarantees for production workloads.</p>
  </main>
</body>
</html>
`.trim();

// ---------------------------------------------------------------------------
// Core behaviour tests
// ---------------------------------------------------------------------------

describe('PlaywrightRenderingProvider — core behaviour', () => {
  it('returns success: true with clean text for rich HTML', async () => {
    const page = makePageMock(RICH_HTML);
    const browser = makeBrowserMock(page);
    const provider = new PlaywrightRenderingProvider({ launchFn: makeLaunchFn(browser) });

    const result = await provider.fetchPage('https://trigger.dev');

    expect(result.success).toBe(true);
    expect(result.text.length).toBeGreaterThan(100);
  });

  it('preserves header hero text', async () => {
    const page = makePageMock(RICH_HTML);
    const browser = makeBrowserMock(page);
    const provider = new PlaywrightRenderingProvider({ launchFn: makeLaunchFn(browser) });

    const result = await provider.fetchPage('https://trigger.dev');

    expect(result.text).toContain('best developer workflow automation platform');
  });

  it('strips <nav> content', async () => {
    const page = makePageMock(RICH_HTML);
    const browser = makeBrowserMock(page);
    const provider = new PlaywrightRenderingProvider({ launchFn: makeLaunchFn(browser) });

    const result = await provider.fetchPage('https://trigger.dev');

    expect(result.text).not.toContain('Footer navigation links');
  });

  it('strips <footer> content', async () => {
    const page = makePageMock(RICH_HTML);
    const browser = makeBrowserMock(page);
    const provider = new PlaywrightRenderingProvider({ launchFn: makeLaunchFn(browser) });

    const result = await provider.fetchPage('https://trigger.dev');

    expect(result.text).not.toContain('All rights reserved');
  });

  it('strips <script> content', async () => {
    const page = makePageMock(SCRIPT_HEAVY_HTML);
    const browser = makeBrowserMock(page);
    const provider = new PlaywrightRenderingProvider({ launchFn: makeLaunchFn(browser) });

    const result = await provider.fetchPage('https://trigger.dev/pricing');

    expect(result.text).not.toContain('__SECRET_KEY__');
    expect(result.text).not.toContain('analytics.track');
    expect(result.text).toContain('Product pricing that scales');
  });

  it('strips cookie banner noise elements', async () => {
    const page = makePageMock(RICH_HTML);
    const browser = makeBrowserMock(page);
    const provider = new PlaywrightRenderingProvider({ launchFn: makeLaunchFn(browser) });

    const result = await provider.fetchPage('https://trigger.dev');

    expect(result.text).not.toContain('Accept cookies');
  });

  it('passes waitUntil: networkidle to page.goto()', async () => {
    const page = makePageMock(RICH_HTML);
    const browser = makeBrowserMock(page);
    const launchFn = makeLaunchFn(browser);
    const provider = new PlaywrightRenderingProvider({ launchFn });

    await provider.fetchPage('https://trigger.dev');

    expect(page.goto).toHaveBeenCalledWith(
      'https://trigger.dev',
      expect.objectContaining({ waitUntil: 'networkidle' }),
    );
  });

  it('passes timeout to page.goto()', async () => {
    const page = makePageMock(RICH_HTML);
    const browser = makeBrowserMock(page);
    const provider = new PlaywrightRenderingProvider({ launchFn: makeLaunchFn(browser) });

    await provider.fetchPage('https://trigger.dev');

    expect(page.goto).toHaveBeenCalledWith(
      'https://trigger.dev',
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  it('always calls page.close() after successful fetch', async () => {
    const page = makePageMock(RICH_HTML);
    const browser = makeBrowserMock(page);
    const provider = new PlaywrightRenderingProvider({ launchFn: makeLaunchFn(browser) });

    await provider.fetchPage('https://trigger.dev');

    expect(page.close).toHaveBeenCalledOnce();
  });

  it('has acquisition_method = playwright', () => {
    const provider = new PlaywrightRenderingProvider({ launchFn: async () => ({} as PlaywrightBrowser) });
    expect(provider.acquisition_method).toBe('playwright');
  });
});

// ---------------------------------------------------------------------------
// Token cap
// ---------------------------------------------------------------------------

describe('PlaywrightRenderingProvider — token cap', () => {
  it('enforces 5000-token cap on long pages', async () => {
    // Generate text > 20,000 chars (5000 tokens × 4 chars/token)
    const longParagraph = 'This is a long paragraph about product features that developers would love. '.repeat(500);
    const longHtml = `<html><body><main>${longParagraph}</main></body></html>`;

    const page = makePageMock(longHtml);
    const browser = makeBrowserMock(page);
    const provider = new PlaywrightRenderingProvider({ launchFn: makeLaunchFn(browser) });

    const result = await provider.fetchPage('https://example.com');

    expect(result.success).toBe(true);
    // 5000 tokens × 4 chars = max 20,000 chars
    expect(result.text.length).toBeLessThanOrEqual(20_000);
  });

  it('does not truncate short pages under the cap', async () => {
    const page = makePageMock(RICH_HTML);
    const browser = makeBrowserMock(page);
    const provider = new PlaywrightRenderingProvider({ launchFn: makeLaunchFn(browser) });

    const result = await provider.fetchPage('https://trigger.dev');

    // RICH_HTML normalised is well under 5000 tokens
    expect(result.success).toBe(true);
    expect(result.text.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('PlaywrightRenderingProvider — error handling', () => {
  it('returns success: false when page.goto() throws', async () => {
    const page: PlaywrightPage = {
      goto: vi.fn(async () => { throw new Error('net::ERR_NAME_NOT_RESOLVED'); }),
      content: vi.fn(async () => ''),
      close: vi.fn(async () => {}),
    };
    const browser = makeBrowserMock(page);
    const provider = new PlaywrightRenderingProvider({ launchFn: makeLaunchFn(browser) });

    const result = await provider.fetchPage('https://nonexistent.invalid');

    expect(result.success).toBe(false);
    expect(result.text).toBe('');
  });

  it('calls page.close() even when goto() throws', async () => {
    const page: PlaywrightPage = {
      goto: vi.fn(async () => { throw new Error('Navigation timeout'); }),
      content: vi.fn(async () => ''),
      close: vi.fn(async () => {}),
    };
    const browser = makeBrowserMock(page);
    const provider = new PlaywrightRenderingProvider({ launchFn: makeLaunchFn(browser) });

    await provider.fetchPage('https://nonexistent.invalid');

    expect(page.close).toHaveBeenCalledOnce();
  });

  it('returns success: false when page.content() throws', async () => {
    const page: PlaywrightPage = {
      goto: vi.fn(async () => {}),
      content: vi.fn(async () => { throw new Error('Page context destroyed'); }),
      close: vi.fn(async () => {}),
    };
    const browser = makeBrowserMock(page);
    const provider = new PlaywrightRenderingProvider({ launchFn: makeLaunchFn(browser) });

    const result = await provider.fetchPage('https://trigger.dev');

    expect(result.success).toBe(false);
    expect(result.text).toBe('');
  });

  it('calls page.close() even when content() throws', async () => {
    const page: PlaywrightPage = {
      goto: vi.fn(async () => {}),
      content: vi.fn(async () => { throw new Error('Context destroyed'); }),
      close: vi.fn(async () => {}),
    };
    const browser = makeBrowserMock(page);
    const provider = new PlaywrightRenderingProvider({ launchFn: makeLaunchFn(browser) });

    await provider.fetchPage('https://trigger.dev');

    expect(page.close).toHaveBeenCalledOnce();
  });

  it('returns success: false when normalised content is too sparse', async () => {
    const page = makePageMock(SPARSE_HTML);
    const browser = makeBrowserMock(page);
    const provider = new PlaywrightRenderingProvider({ launchFn: makeLaunchFn(browser) });

    const result = await provider.fetchPage('https://example.com/minimal');

    expect(result.success).toBe(false);
    expect(result.text).toBe('');
  });

  it('returns success: false when launchFn throws', async () => {
    const provider = new PlaywrightRenderingProvider({
      launchFn: async () => { throw new Error('Chromium not installed'); },
    });

    const result = await provider.fetchPage('https://trigger.dev');

    expect(result.success).toBe(false);
    expect(result.text).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Browser lifecycle
// ---------------------------------------------------------------------------

describe('PlaywrightRenderingProvider — browser lifecycle', () => {
  it('does not call launchFn until first fetchPage()', () => {
    const launchFn = vi.fn(async () => ({
      newPage: async () => makePageMock(RICH_HTML),
      close: async () => {},
    } as PlaywrightBrowser));

    new PlaywrightRenderingProvider({ launchFn });

    expect(launchFn).not.toHaveBeenCalled();
  });

  it('calls launchFn once on first fetchPage()', async () => {
    const page = makePageMock(RICH_HTML);
    const browser = makeBrowserMock(page);
    const launchFn = makeLaunchFn(browser);
    const provider = new PlaywrightRenderingProvider({ launchFn });

    await provider.fetchPage('https://trigger.dev');

    expect(launchFn).toHaveBeenCalledOnce();
  });

  it('reuses browser across multiple fetchPage() calls', async () => {
    const page = makePageMock(RICH_HTML);
    const browser = makeBrowserMock(page);
    const launchFn = makeLaunchFn(browser);
    const provider = new PlaywrightRenderingProvider({ launchFn });

    await provider.fetchPage('https://trigger.dev');
    await provider.fetchPage('https://trigger.dev/pricing');
    await provider.fetchPage('https://trigger.dev/about');

    // Browser launched only once
    expect(launchFn).toHaveBeenCalledOnce();
    // But newPage called 3 times
    expect(browser.newPage).toHaveBeenCalledTimes(3);
  });

  it('close() shuts browser', async () => {
    const page = makePageMock(RICH_HTML);
    const browser = makeBrowserMock(page);
    const launchFn = makeLaunchFn(browser);
    const provider = new PlaywrightRenderingProvider({ launchFn });

    await provider.fetchPage('https://trigger.dev');
    await provider.close();

    expect(browser.close).toHaveBeenCalledOnce();
  });

  it('close() is safe to call before any fetchPage()', async () => {
    const browser = makeBrowserMock(makePageMock(RICH_HTML));
    const provider = new PlaywrightRenderingProvider({ launchFn: makeLaunchFn(browser) });

    // Should not throw
    await expect(provider.close()).resolves.toBeUndefined();
    // Browser never launched so close never called
    expect(browser.close).not.toHaveBeenCalled();
  });

  it('after close(), subsequent fetchPage() relaunches browser', async () => {
    let callCount = 0;
    const launchFn = vi.fn(async () => {
      callCount++;
      return makeBrowserMock(makePageMock(RICH_HTML)) as PlaywrightBrowser;
    });
    const provider = new PlaywrightRenderingProvider({ launchFn });

    await provider.fetchPage('https://trigger.dev');
    await provider.close();
    await provider.fetchPage('https://trigger.dev/pricing');

    expect(callCount).toBe(2);
  });
});
