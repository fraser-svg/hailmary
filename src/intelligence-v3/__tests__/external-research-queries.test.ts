/**
 * External Research Query Builder Tests
 *
 * Verifies that buildQueryMap() produces domain-anchored queries that
 * correctly disambiguate ambiguous company names.
 *
 * Key invariant: review queries must anchor on the domain string, not just
 * the company name, because company names like "Trigger" are generic keywords
 * in automation and review contexts.
 */

import { describe, it, expect } from 'vitest';
import { buildQueryMap } from '../acquisition/external-research.js';

// ---------------------------------------------------------------------------
// Trigger.dev — highly ambiguous company name
// ---------------------------------------------------------------------------

describe('buildQueryMap — Trigger.dev (ambiguous name)', () => {
  const map = Object.fromEntries(buildQueryMap('Trigger.dev', 'trigger.dev'));

  it('review_trustpilot: anchors on domain, not company name alone', () => {
    expect(map['review_trustpilot']).toContain('trigger.dev');
    expect(map['review_trustpilot']).toContain('trustpilot.com');
  });

  it('review_g2_snippet: anchors on domain', () => {
    expect(map['review_g2_snippet']).toContain('trigger.dev');
    expect(map['review_g2_snippet']).toContain('g2.com');
  });

  it('review_capterra_snippet: anchors on domain', () => {
    expect(map['review_capterra_snippet']).toContain('trigger.dev');
    expect(map['review_capterra_snippet']).toContain('capterra.com');
  });

  it('review queries do NOT rely on company name alone', () => {
    // "Trigger.dev" alone as the only identifier would be ambiguous
    // The domain "trigger.dev" (without quotes around just company name) should appear
    expect(map['review_trustpilot']).toContain('"trigger.dev"');
    expect(map['review_g2_snippet']).toContain('"trigger.dev"');
    expect(map['review_capterra_snippet']).toContain('"trigger.dev"');
  });

  it('press_mention: contains both company name and domain', () => {
    expect(map['press_mention']).toContain('"Trigger.dev"');
    expect(map['press_mention']).toContain('"trigger.dev"');
  });

  it('competitor_search_snippet: contains both company name and domain', () => {
    expect(map['competitor_search_snippet']).toContain('"Trigger.dev"');
    expect(map['competitor_search_snippet']).toContain('"trigger.dev"');
  });

  it('funding_announcement: contains both company name and domain', () => {
    expect(map['funding_announcement']).toContain('"Trigger.dev"');
    expect(map['funding_announcement']).toContain('"trigger.dev"');
  });

  it('investor_mention: contains both company name and domain', () => {
    expect(map['investor_mention']).toContain('"Trigger.dev"');
    expect(map['investor_mention']).toContain('"trigger.dev"');
  });

  it('investor_mention: includes key investor databases', () => {
    const query = map['investor_mention']!;
    expect(query).toMatch(/ycombinator|crunchbase/i);
  });
});

// ---------------------------------------------------------------------------
// Omnea — unique company name (unique domain: omnea.com)
// ---------------------------------------------------------------------------

describe('buildQueryMap — Omnea (unique name)', () => {
  const map = Object.fromEntries(buildQueryMap('Omnea', 'omnea.com'));

  it('review_trustpilot: anchors on domain', () => {
    expect(map['review_trustpilot']).toContain('"omnea.com"');
    expect(map['review_trustpilot']).toContain('trustpilot.com');
  });

  it('press_mention: contains both company name and domain', () => {
    expect(map['press_mention']).toContain('"Omnea"');
    expect(map['press_mention']).toContain('"omnea.com"');
  });

  it('investor_mention: contains company, domain, and databases', () => {
    expect(map['investor_mention']).toContain('"Omnea"');
    expect(map['investor_mention']).toContain('"omnea.com"');
    expect(map['investor_mention']).toMatch(/ycombinator|crunchbase/i);
  });
});

// ---------------------------------------------------------------------------
// Structure invariants — all companies
// ---------------------------------------------------------------------------

describe('buildQueryMap — structure invariants', () => {
  const companies = [
    ['Trigger.dev', 'trigger.dev'],
    ['Omnea', 'omnea.com'],
    ['Stripe', 'stripe.com'],
    ['Linear', 'linear.app'],
  ] as const;

  for (const [company, domain] of companies) {
    describe(`${company}`, () => {
      const entries = buildQueryMap(company, domain);

      it('returns exactly 8 entries', () => {
        expect(entries).toHaveLength(8);
      });

      it('covers all required source types', () => {
        const types = entries.map(([t]) => t);
        expect(types).toContain('review_trustpilot');
        expect(types).toContain('review_g2_snippet');
        expect(types).toContain('review_capterra_snippet');
        expect(types).toContain('press_mention');
        expect(types).toContain('competitor_search_snippet');
        expect(types).toContain('funding_announcement');
        expect(types).toContain('linkedin_snippet');
        expect(types).toContain('investor_mention');
      });

      it('all query strings are non-empty', () => {
        for (const [, query] of entries) {
          expect(query.length).toBeGreaterThan(0);
        }
      });

      it('review queries all contain the domain', () => {
        const reviewTypes = ['review_trustpilot', 'review_g2_snippet', 'review_capterra_snippet'];
        const reviewMap = Object.fromEntries(entries);
        for (const type of reviewTypes) {
          expect(reviewMap[type]).toContain(domain);
        }
      });

      it('non-review queries all contain the domain', () => {
        const nonReviewTypes = ['press_mention', 'competitor_search_snippet', 'funding_announcement', 'linkedin_snippet', 'investor_mention'];
        const queryMapObj = Object.fromEntries(entries);
        for (const type of nonReviewTypes) {
          expect(queryMapObj[type]).toContain(domain);
        }
      });
    });
  }
});
