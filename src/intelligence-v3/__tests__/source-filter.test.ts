/**
 * source-filter.ts unit tests
 *
 * Tests for:
 *   - isOwnDomain()         — URL ownership detection
 *   - meetsCompanyMatchThreshold()  — relevance scoring
 *   - filterExternalSources()       — full filter with outcome tracking
 *
 * No API calls — pure deterministic logic.
 */

import { describe, it, expect } from 'vitest';
import {
  isOwnDomain,
  meetsCompanyMatchThreshold,
  filterExternalSources,
} from '../acquisition/source-filter.js';
import type { ExternalSource } from '../types/research-corpus.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSource(
  url: string,
  excerpt: string,
  overrides: Partial<ExternalSource> = {},
): ExternalSource {
  return {
    url,
    source_type: 'review_trustpilot',
    gathered_at: '2024-01-01T00:00:00Z',
    excerpt,
    token_count: Math.ceil(excerpt.length / 4),
    source_tier: 4,
    acquisition_method: 'perplexity',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isOwnDomain()
// ---------------------------------------------------------------------------

describe('isOwnDomain', () => {
  it('returns true for exact domain match', () => {
    expect(isOwnDomain('https://trigger.dev/blog/post', 'trigger.dev')).toBe(true);
  });

  it('returns true for www. variant of own domain', () => {
    expect(isOwnDomain('https://www.trigger.dev/', 'trigger.dev')).toBe(true);
  });

  it('returns true for subdomain of own domain', () => {
    expect(isOwnDomain('https://docs.trigger.dev/quickstart', 'trigger.dev')).toBe(true);
  });

  it('returns false for a different company domain', () => {
    expect(isOwnDomain('https://techcrunch.com/2024/trigger-dev-funding', 'trigger.dev')).toBe(false);
  });

  it('returns false for a domain that contains the target as substring', () => {
    // "trigger.dev" must not match "not-trigger.dev"
    expect(isOwnDomain('https://not-trigger.dev/page', 'trigger.dev')).toBe(false);
  });

  it('handles domain without protocol', () => {
    expect(isOwnDomain('trigger.dev/pricing', 'trigger.dev')).toBe(true);
  });

  it('handles targetDomain with www. prefix gracefully', () => {
    expect(isOwnDomain('https://trigger.dev/pricing', 'www.trigger.dev')).toBe(true);
  });

  it('returns false for stripe.com when target is trigger.dev', () => {
    expect(isOwnDomain('https://stripe.com/docs', 'trigger.dev')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// meetsCompanyMatchThreshold() — Trigger.dev
// ---------------------------------------------------------------------------

describe('meetsCompanyMatchThreshold — Trigger.dev', () => {
  const COMPANY = 'Trigger.dev';
  const DOMAIN = 'trigger.dev';

  it('S1: excerpt contains exact domain string → accept', () => {
    const src = makeSource(
      'https://producthunt.com/products/trigger-dev/reviews',
      "Really impressed with Trigger.dev's approach to workflow automation!",
    );
    expect(meetsCompanyMatchThreshold(src, COMPANY, DOMAIN)).toBe(true);
  });

  it('S3: URL path contains hyphenated domain slug → accept', () => {
    // Excerpt does not mention trigger.dev, but URL path has "trigger-dev"
    const src = makeSource(
      'https://producthunt.com/products/trigger-dev/reviews',
      'A workflow tool for scheduling and queuing.',
    );
    expect(meetsCompanyMatchThreshold(src, COMPANY, DOMAIN)).toBe(true);
  });

  it('S4: URL contains exact domain string → accept', () => {
    const src = makeSource(
      'https://www.menlotimes.com/post/trigger.dev-raises-series-a',
      'The company announced a new funding round today.',
    );
    expect(meetsCompanyMatchThreshold(src, COMPANY, DOMAIN)).toBe(true);
  });

  it('no signal present → reject (HubSpot Trustpilot article)', () => {
    const src = makeSource(
      'https://ecosystem.hubspot.com/marketplace/listing/trustpilot-reviews',
      'Great for triggering reviews with simple setup, but missing crucial HubSpot sync functionality.',
    );
    expect(meetsCompanyMatchThreshold(src, COMPANY, DOMAIN)).toBe(false);
  });

  it('no signal present → reject (Yotpo vs Trustpilot comparison)', () => {
    const src = makeSource(
      'https://www.yotpo.com/blog/reviewsio-vs-trustpilot-vs-yotpo/',
      'Choosing a reviews platform? Our in-depth comparison of Yotpo, Reviews.io, and Trustpilot.',
    );
    expect(meetsCompanyMatchThreshold(src, COMPANY, DOMAIN)).toBe(false);
  });

  it('no signal present → reject (wrong Capterra product "Trigger" PM software)', () => {
    const src = makeSource(
      'https://www.capterra.com/p/161804/Trigger/',
      'Nice intuitive interface. Quick and simple to set projects up. Time tracking is easy and quick.',
    );
    expect(meetsCompanyMatchThreshold(src, COMPANY, DOMAIN)).toBe(false);
  });

  it('no signal present → reject (CBS Evening News unrelated YouTube)', () => {
    const src = makeSource(
      'https://www.youtube.com/watch?v=uMJNVd4JD8Y',
      'Go to channel CBS Evening News. The most intense shoe salesman you will ever see.',
    );
    expect(meetsCompanyMatchThreshold(src, COMPANY, DOMAIN)).toBe(false);
  });

  it('no signal present → reject (Crunchbase about themselves)', () => {
    const src = makeSource(
      'https://about.crunchbase.com/blog/crunchbase-fusion-by-jp-morgan-partnership',
      'Crunchbase provides AI-powered forecasts on private market movements.',
    );
    expect(meetsCompanyMatchThreshold(src, COMPANY, DOMAIN)).toBe(false);
  });

  it('no signal present → reject (n8n workflow for Crunchbase scraping)', () => {
    const src = makeSource(
      'https://n8n.io/workflows/4731-automated-investor-intelligence-crunchbase-to-google-sheets-data-harvester/',
      'This cutting-edge n8n automation is a sophisticated investor intelligence tool for market research.',
    );
    expect(meetsCompanyMatchThreshold(src, COMPANY, DOMAIN)).toBe(false);
  });

  it('S1: Inngest vs Trigger.dev comparison excerpt → accept', () => {
    const src = makeSource(
      'https://www.youtube.com/watch?v=S3prrMEjvQ4',
      'Inngest Vs Trigger.dev | Which Software Is Better? In this video we take a closer look.',
    );
    expect(meetsCompanyMatchThreshold(src, COMPANY, DOMAIN)).toBe(true);
  });

  it('S1: CBInsights competitor snippet → accept', () => {
    const src = makeSource(
      'https://www.cbinsights.com/company/triggerdev/alternatives-competitors',
      'See how Trigger.dev compares to similar products. Top competitors include Dify.',
    );
    expect(meetsCompanyMatchThreshold(src, COMPANY, DOMAIN)).toBe(true);
  });

  it('S1: Menlo Times Series A article → accept', () => {
    const src = makeSource(
      'https://www.menlotimes.com/post/y-combinator-backed-trigger-dev-raises-16-million-series-a',
      'Y Combinator Backed Trigger.dev Raises $16 Million Series A.',
    );
    expect(meetsCompanyMatchThreshold(src, COMPANY, DOMAIN)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// meetsCompanyMatchThreshold() — other company names
// ---------------------------------------------------------------------------

describe('meetsCompanyMatchThreshold — other companies', () => {
  it('Stripe: excerpt contains "stripe.com" → accept', () => {
    const src = makeSource(
      'https://techcrunch.com/2024/01/stripe-funding',
      'Stripe.com today announced a major new product update for payment processing.',
    );
    expect(meetsCompanyMatchThreshold(src, 'Stripe', 'stripe.com')).toBe(true);
  });

  it('Stripe: unrelated excerpt → reject', () => {
    const src = makeSource(
      'https://generalreview.com/payment-review',
      'This payment platform offers competitive pricing and good customer support.',
    );
    expect(meetsCompanyMatchThreshold(src, 'Stripe', 'stripe.com')).toBe(false);
  });

  it('HubSpot: S2 fires (company name differs from domain root) → accept', () => {
    // companyLower = "hubspot", domainNorm = "hubspot.com" — they differ, so S2 fires
    const src = makeSource(
      'https://g2.com/products/hubspot-crm',
      'HubSpot CRM is rated highly for ease of use by marketing teams.',
    );
    expect(meetsCompanyMatchThreshold(src, 'HubSpot', 'hubspot.com')).toBe(true);
  });

  it('Omnea: S2 fires (company name in excerpt, name differs from domain)', () => {
    // company "Omnea" != domainNorm "omnea.com", so S2 checks excerpt for "omnea"
    const src = makeSource(
      'https://g2.com/products/omnea/reviews',
      'Omnea makes procurement simple. Very easy workflow with strong approvals.',
    );
    expect(meetsCompanyMatchThreshold(src, 'Omnea', 'omnea.com')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// filterExternalSources()
// ---------------------------------------------------------------------------

describe('filterExternalSources', () => {
  const CONFIG = { company: 'Trigger.dev', domain: 'trigger.dev' };

  it('accepts a source with company name in excerpt', () => {
    const src = makeSource(
      'https://producthunt.com/products/trigger-dev/reviews',
      'Trigger.dev is excellent for background jobs.',
    );
    const result = filterExternalSources([src], CONFIG);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
    expect(result.own_domain_count).toBe(0);
    expect(result.no_match_count).toBe(0);
  });

  it('rejects own-domain source (trigger.dev/blog)', () => {
    const src = makeSource(
      'https://trigger.dev/blog/series-a',
      'Trigger.dev raises $16M Series A.',
    );
    const result = filterExternalSources([src], CONFIG);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]!.reason).toBe('own_domain');
    expect(result.own_domain_count).toBe(1);
    expect(result.no_match_count).toBe(0);
  });

  it('rejects no-match source (HubSpot Trustpilot article)', () => {
    const src = makeSource(
      'https://ecosystem.hubspot.com/marketplace/listing/trustpilot-reviews',
      'Great for triggering reviews with simple setup.',
    );
    const result = filterExternalSources([src], CONFIG);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]!.reason).toBe('no_company_match');
    expect(result.no_match_count).toBe(1);
    expect(result.own_domain_count).toBe(0);
  });

  it('filters a mixed batch correctly', () => {
    const sources = [
      // should accept
      makeSource(
        'https://producthunt.com/products/trigger-dev/reviews',
        'Trigger.dev is great for background jobs.',
      ),
      makeSource(
        'https://www.menlotimes.com/post/trigger-dev-series-a',
        'Trigger.dev raises $16M. The open-source background job platform.',
      ),
      // should reject own_domain
      makeSource(
        'https://trigger.dev/blog/series-a',
        'Trigger.dev raises $16M Series A.',
      ),
      // should reject no_match
      makeSource(
        'https://ecosystem.hubspot.com/marketplace/listing/trustpilot',
        'Great for triggering reviews with simple HubSpot sync.',
      ),
      makeSource(
        'https://www.capterra.com/p/161804/Trigger/',
        'Nice intuitive interface. Quick to set projects up.',
      ),
    ];

    const result = filterExternalSources(sources, CONFIG);
    expect(result.accepted).toHaveLength(2);
    expect(result.rejected).toHaveLength(3);
    expect(result.own_domain_count).toBe(1);
    expect(result.no_match_count).toBe(2);
  });

  it('returns empty accepted list with zero counts when all rejected', () => {
    const sources = [
      makeSource(
        'https://trigger.dev/blog/post',
        'Our latest update.',
      ),
      makeSource(
        'https://www.yotpo.com/comparison',
        'Choosing a reviews platform.',
      ),
    ];
    const result = filterExternalSources(sources, CONFIG);
    expect(result.accepted).toHaveLength(0);
    expect(result.own_domain_count).toBe(1);
    expect(result.no_match_count).toBe(1);
  });

  it('returns all accepted when all sources are relevant', () => {
    const sources = [
      makeSource(
        'https://techcrunch.com/2024/trigger-dev-funding',
        'Trigger.dev announced a $16M round.',
      ),
      makeSource(
        'https://producthunt.com/products/trigger-dev',
        'trigger.dev is a background jobs platform.',
      ),
    ];
    const result = filterExternalSources(sources, CONFIG);
    expect(result.accepted).toHaveLength(2);
    expect(result.rejected).toHaveLength(0);
  });

  it('handles empty sources list gracefully', () => {
    const result = filterExternalSources([], CONFIG);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toHaveLength(0);
    expect(result.own_domain_count).toBe(0);
    expect(result.no_match_count).toBe(0);
  });

  it('own-domain check applies before company-match check', () => {
    // This URL would pass company-match (it contains trigger.dev) but should
    // be rejected as own_domain first
    const src = makeSource(
      'https://trigger.dev/blog/series-a',
      'Trigger.dev raises $16M Series A from Standard Capital.',
    );
    const result = filterExternalSources([src], CONFIG);
    expect(result.rejected[0]!.reason).toBe('own_domain');
  });

  it('subdomain of own domain is also rejected as own_domain', () => {
    const src = makeSource(
      'https://docs.trigger.dev/quickstart',
      'Trigger.dev docs: getting started with background jobs.',
    );
    const result = filterExternalSources([src], CONFIG);
    expect(result.rejected[0]!.reason).toBe('own_domain');
  });
});
