/**
 * External Source Filter — V3-U2 Hardening
 *
 * Deterministic company-relevance filter applied after provider search
 * and before sources are added to the corpus.
 *
 * Two rejection rules (evaluated in order):
 *
 *   1. own_domain — URL hostname matches or is a subdomain of the target company domain.
 *      These are Tier 1 company-controlled content; they must not inflate external diversity.
 *
 *   2. no_company_match — Neither excerpt nor URL contains a reliable signal linking
 *      this source to the target company. Applied to all source types.
 *      Sources that refer to a different product with the same generic keyword are caught here.
 *
 * Match signals (any one = accept):
 *   S1 (strong): excerpt contains exact domain string (e.g. "trigger.dev")
 *   S2 (strong): excerpt contains lowercased company name, when it differs from the domain
 *   S3 (medium): URL path contains hyphenated domain slug (e.g. "/products/trigger-dev/")
 *   S4 (medium): URL string (beyond hostname) contains exact domain string
 *
 * Design constraints:
 *   - Deterministic — no LLM, no regex lookahead, no external data
 *   - Generic — works for any (company, domain) pair
 *   - Conservative — prefer false negatives over false positives for corpus hygiene
 *   - No side effects — pure function on ExternalSource[]
 */

import type { ExternalSource } from '../types/research-corpus.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RejectionReason =
  | 'own_domain'         // Source URL is on the company's own domain
  | 'no_company_match';  // Source does not mention the target company

export interface RejectedSource {
  source: ExternalSource;
  reason: RejectionReason;
}

export interface FilterOutcome {
  accepted: ExternalSource[];
  rejected: RejectedSource[];
  /** Count of own-domain sources rejected */
  own_domain_count: number;
  /** Count of sources rejected for failing company-match threshold */
  no_match_count: number;
}

export interface FilterConfig {
  /** Company display name, e.g. "Trigger.dev" */
  company: string;
  /** Company's primary domain, e.g. "trigger.dev" */
  domain: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise a domain string to bare hostname (no protocol, no www, no trailing slash). */
function normaliseDomain(raw: string): string {
  try {
    const withProto = raw.startsWith('http') ? raw : `https://${raw}`;
    return new URL(withProto).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return raw
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]!
      .split(':')[0]!
      .toLowerCase();
  }
}

/** Return the hostname of a URL, normalised. Empty string on parse failure. */
function urlHostname(url: string): string {
  try {
    const withProto = url.startsWith('http') ? url : `https://${url}`;
    return new URL(withProto).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/** Return the URL path, lowercased. Empty string on parse failure. */
function urlPath(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Rule 1 — Own-domain rejection
// ---------------------------------------------------------------------------

/**
 * Returns true if the source URL is on the company's own domain (or a subdomain).
 * These are Tier 1 company-controlled pages; they should not appear in the external corpus.
 */
export function isOwnDomain(url: string, domain: string): boolean {
  const host = urlHostname(url);
  const target = normaliseDomain(domain);
  if (!host || !target) return false;
  return host === target || host.endsWith(`.${target}`);
}

// ---------------------------------------------------------------------------
// Rule 2 — Company-match threshold
// ---------------------------------------------------------------------------

/**
 * Returns true if the source excerpt or URL contains a reliable signal that this
 * source is about the target company.
 *
 * Any single signal from S1–S4 is sufficient to accept the source.
 */
export function meetsCompanyMatchThreshold(
  source: ExternalSource,
  company: string,
  domain: string,
): boolean {
  const domainNorm = normaliseDomain(domain);           // e.g. "trigger.dev"
  const domainSlug = domainNorm.replace(/\./g, '-');    // e.g. "trigger-dev"
  const companyLower = company.toLowerCase().trim();    // e.g. "trigger.dev"

  const excerptLower = source.excerpt.toLowerCase();
  const urlLower = source.url.toLowerCase();

  // S1: excerpt contains exact domain string
  if (excerptLower.includes(domainNorm)) return true;

  // S2: excerpt contains company name — only useful when company name differs from domain
  //     (avoids re-testing the same string when company === domain)
  if (companyLower !== domainNorm && excerptLower.includes(companyLower)) return true;

  // S3: URL path contains hyphenated domain slug (e.g. "/products/trigger-dev/reviews")
  if (domainSlug && urlPath(source.url).includes(domainSlug)) return true;

  // S4: URL string (full, not just path) contains exact domain string
  //     Guards against cases where domain appears in query params or subdomains of a third-party
  if (urlLower.includes(domainNorm)) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Main filter
// ---------------------------------------------------------------------------

/**
 * Filter a list of external sources, rejecting those that:
 *   1. Come from the company's own domain (own_domain)
 *   2. Do not demonstrate relevance to the target company (no_company_match)
 *
 * Returns accepted sources and a detailed rejection log for observability.
 */
export function filterExternalSources(
  sources: ExternalSource[],
  config: FilterConfig,
): FilterOutcome {
  const { company, domain } = config;
  const accepted: ExternalSource[] = [];
  const rejected: RejectedSource[] = [];

  for (const source of sources) {
    // Rule 1: own-domain
    if (isOwnDomain(source.url, domain)) {
      rejected.push({ source, reason: 'own_domain' });
      continue;
    }

    // Rule 2: company-match threshold
    if (!meetsCompanyMatchThreshold(source, company, domain)) {
      rejected.push({ source, reason: 'no_company_match' });
      continue;
    }

    accepted.push(source);
  }

  const own_domain_count = rejected.filter(r => r.reason === 'own_domain').length;
  const no_match_count = rejected.filter(r => r.reason === 'no_company_match').length;

  return { accepted, rejected, own_domain_count, no_match_count };
}
