/**
 * Tier Classifier — Spec 005 §Tier Classifier
 *
 * Deterministic URL-to-tier lookup. Called by mergeResearchCorpus().
 * Providers do NOT call this directly.
 *
 * Rules are evaluated in order — first match wins.
 * Tier 5 is never assigned by this classifier (reserved for manually-flagged records).
 */

import type { SourceTier } from '../types/research-corpus.js';

// ---------------------------------------------------------------------------
// URL normalisation
// ---------------------------------------------------------------------------

/** Normalise a URL to a bare hostname for comparison.
 *  Strips protocol, www., port, path, and trailing slashes. */
function normaliseHostname(raw: string): string {
  try {
    // Add protocol if missing so URL() can parse it
    const withProto = raw.startsWith('http') ? raw : `https://${raw}`;
    const parsed = new URL(withProto);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    // If parsing fails, do a best-effort strip
    return raw
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .split(':')[0]
      .toLowerCase();
  }
}

/** Normalise a domain for comparison with a source URL hostname. */
function normaliseDomain(domain: string): string {
  return domain
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
    .split('/')[0]
    .split(':')[0]
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Tier 2 exact-match domains
// ---------------------------------------------------------------------------

const TIER_2_DOMAINS = new Set([
  // Tech media
  'techcrunch.com',
  'venturebeat.com',
  'businesswire.com',
  'prnewswire.com',
  'thenewstack.io',
  // Financial data + market intelligence
  'crunchbase.com',
  'pitchbook.com',
  'cbinsights.com',
  // Major press
  'reuters.com',
  'bloomberg.com',
  'forbes.com',
  'wsj.com',
  'ft.com',
  // Regulatory
  'sec.gov',
  // Investor platforms
  'ycombinator.com',    // YC main site — investor profiles, batch pages, funding posts
  // LinkedIn company profiles handled separately (Rule 2)
]);

// ---------------------------------------------------------------------------
// Tier 3 exact-match domains
// ---------------------------------------------------------------------------

// NOTE: news.ycombinator.com appears here as a deliberate Tier 3 override.
// Its parent domain ycombinator.com is Tier 2 (investor site), but the HN
// subdomain is customer/community discussion, not authoritative company data.
// The classifier evaluates Tier 3 exact-match BEFORE Tier 2 subdomain-match
// so that this override takes effect correctly.
const TIER_3_DOMAINS = new Set([
  'trustpilot.com',
  'g2.com',
  'capterra.com',
  'getapp.com',
  'softwareadvice.com',
  'reddit.com',
  'news.ycombinator.com',  // HN community discussions — Tier 3 override
  'producthunt.com',
  'appsumo.com',
]);

// ---------------------------------------------------------------------------
// Tier 4 exact-match domains
// ---------------------------------------------------------------------------

const TIER_4_DOMAINS = new Set([
  'glassdoor.com',
  'comparably.com',
  'indeed.com',
  // Job boards
  'greenhouse.io',
  'lever.co',
  'ashbyhq.com',
  'workday.com',
  // Content platforms — default to 4 in Phase 1
  'medium.com',
  'substack.com',
  // Tech aggregators (old-school, low signal)
  'slashdot.org',
  'sourceforge.net',
]);

// ---------------------------------------------------------------------------
// Main classifier
// ---------------------------------------------------------------------------

/**
 * Classify a source URL into a tier (1–4).
 *
 * @param url - The URL of the source to classify
 * @param targetDomain - The company's own domain (e.g. "trigger.dev")
 * @returns SourceTier (1–4). Never returns 5.
 */
export function classifySourceTier(url: string, targetDomain: string): SourceTier {
  if (!url) return 4;

  const hostname = normaliseHostname(url);
  const cleanTarget = normaliseDomain(targetDomain);

  // Rule 1: Company's own domain → Tier 1
  // Match exact hostname or any subdomain of the target domain
  if (hostname === cleanTarget || hostname.endsWith(`.${cleanTarget}`)) {
    return 1;
  }

  // Rule 2: LinkedIn company profiles → Tier 2
  // Only /company/* paths, not individual user posts
  if (hostname === 'linkedin.com') {
    try {
      const withProto = url.startsWith('http') ? url : `https://${url}`;
      const parsed = new URL(withProto);
      if (parsed.pathname.startsWith('/company/')) {
        return 2;
      }
    } catch {
      // If URL parse fails, treat as Tier 4
    }
    return 4;
  }

  // Rule 3: Regulatory TLDs → Tier 2
  // gov.uk, .gov (already covered by sec.gov above), regulatory country domains
  if (hostname.endsWith('.gov') || hostname.endsWith('.gov.uk')) {
    return 2;
  }

  // Rule 4: Tier 2 exact-match domains
  if (TIER_2_DOMAINS.has(hostname)) return 2;

  // Rule 5: Tier 3 exact-match domains
  // IMPORTANT: evaluated BEFORE Tier 2 subdomain-match so that deliberate
  // Tier 3 overrides (e.g. news.ycombinator.com → Tier 3, not Tier 2) win.
  if (TIER_3_DOMAINS.has(hostname)) return 3;

  // Rule 6: Tier 2 subdomain-match (e.g. about.crunchbase.com → Tier 2)
  // Handles subdomains of known Tier 2 domains that aren't www-prefixed.
  for (const t2 of TIER_2_DOMAINS) {
    if (hostname.endsWith(`.${t2}`)) return 2;
  }

  // Rule 7: Tier 3 subdomain-match (e.g. app.trustpilot.com → Tier 3)
  for (const t3 of TIER_3_DOMAINS) {
    if (hostname.endsWith(`.${t3}`)) return 3;
  }

  // Rule 8: Tier 4 exact-match + subdomain (e.g. boards.greenhouse.io → Tier 4)
  if (TIER_4_DOMAINS.has(hostname)) return 4;
  for (const t4 of TIER_4_DOMAINS) {
    if (hostname.endsWith(`.${t4}`)) return 4;
  }

  // Default: unknown → Tier 4 (never 5 from classifier)
  return 4;
}
