/**
 * Cloudflare Browser Rendering REST API internal types — Spec 005 §Provider 2
 *
 * NOT exported from the providers index. Only used internally by cloudflare-adapter.ts.
 *
 * API verified: https://developers.cloudflare.com/browser-rendering/rest-api/snapshot/
 * Endpoint: POST https://api.cloudflare.com/client/v4/accounts/{accountId}/browser-rendering/snapshot
 * Auth: Authorization: Bearer <token> (token only — no X-Auth-Email needed)
 */

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

export interface CloudflareGotoOptions {
  /** Wait for JS rendering to complete — recommended for SPAs */
  waitUntil: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
  /** Timeout in ms — 9000 gives 1s buffer under our 10s hard cap */
  timeout: number;
}

export interface CloudflareSnapshotRequest {
  url: string;
  gotoOptions?: CloudflareGotoOptions;
  rejectResourceTypes?: Array<
    | 'document' | 'stylesheet' | 'image' | 'media' | 'font'
    | 'script' | 'texttrack' | 'xhr' | 'fetch' | 'eventsource'
    | 'websocket' | 'manifest' | 'other'
  >;
}

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

export interface CloudflareSnapshotResponse {
  result: {
    /** Full rendered HTML of the page */
    content: string;
    screenshot?: string; // Base64 — not used
  };
  success: boolean;
  errors: Array<{ code: number; message: string }>;
}
