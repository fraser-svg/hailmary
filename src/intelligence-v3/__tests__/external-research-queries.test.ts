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

      it('returns exactly 13 entries (8 standard + 5 CN)', () => {
        expect(entries).toHaveLength(13);
      });

      it('covers all required standard source types', () => {
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

      it('covers all 5 CN source types', () => {
        const types = entries.map(([t]) => t);
        expect(types).toContain('reddit_thread');
        expect(types).toContain('hackernews_thread');
        expect(types).toContain('github_issues_snippet');
        expect(types).toContain('comparison_article');
        expect(types).toContain('critical_review');
      });

      it('CN queries appear after standard queries (indices 8–12)', () => {
        const cnTypes = entries.slice(8).map(([t]) => t);
        expect(cnTypes).toEqual([
          'reddit_thread',
          'hackernews_thread',
          'github_issues_snippet',
          'comparison_article',
          'critical_review',
        ]);
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

      it('non-review standard queries all contain the domain', () => {
        const nonReviewTypes = ['press_mention', 'competitor_search_snippet', 'funding_announcement', 'linkedin_snippet', 'investor_mention'];
        const queryMapObj = Object.fromEntries(entries);
        for (const type of nonReviewTypes) {
          expect(queryMapObj[type]).toContain(domain);
        }
      });

      it('CN queries all contain the domain', () => {
        const cnTypes = ['reddit_thread', 'hackernews_thread', 'github_issues_snippet', 'comparison_article', 'critical_review'];
        const queryMapObj = Object.fromEntries(entries);
        for (const type of cnTypes) {
          expect(queryMapObj[type]).toContain(domain);
        }
      });
    });
  }
});

// ---------------------------------------------------------------------------
// CN query content anchors
// ---------------------------------------------------------------------------

describe('buildQueryMap — CN query content', () => {
  const map = Object.fromEntries(buildQueryMap('Trigger.dev', 'trigger.dev'));

  it('reddit_thread: anchors on domain with complaint terms and reddit.com', () => {
    expect(map['reddit_thread']).toContain('"trigger.dev"');
    expect(map['reddit_thread']).toContain('site:reddit.com');
    expect(map['reddit_thread']).toMatch(/complaints|problems|issues|disappointed/);
  });

  it('hackernews_thread: anchors on domain with news.ycombinator.com', () => {
    expect(map['hackernews_thread']).toContain('"trigger.dev"');
    expect(map['hackernews_thread']).toContain('site:news.ycombinator.com');
  });

  it('github_issues_snippet: anchors on domain with github.com and issue terms', () => {
    expect(map['github_issues_snippet']).toContain('"trigger.dev"');
    expect(map['github_issues_snippet']).toContain('site:github.com');
    expect(map['github_issues_snippet']).toMatch(/issues|bugs|broken/);
  });

  it('comparison_article: contains both company name and domain with vs alternatives', () => {
    expect(map['comparison_article']).toContain('"Trigger.dev"');
    expect(map['comparison_article']).toContain('"trigger.dev"');
    expect(map['comparison_article']).toContain('vs alternatives');
    // Excludes own domain to avoid company-controlled comparisons
    expect(map['comparison_article']).toContain('-site:trigger.dev');
  });

  it('critical_review: anchors on domain with negative review terms', () => {
    expect(map['critical_review']).toContain('"trigger.dev"');
    expect(map['critical_review']).toMatch(/disappointed|avoid|broken/);
    expect(map['critical_review']).toContain('review');
  });
});
