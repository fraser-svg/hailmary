/**
 * tagFrictionSignals — Unit Tests (Spec 008 §7)
 *
 * Covers:
 *   - Returns [] on empty/undefined excerpt
 *   - Friction keywords produce "friction" tag
 *   - Complaint keywords produce "complaint" tag
 *   - Contradiction keywords produce "contradiction" tag
 *   - Both friction + complaint produce "buyer_disappointment"
 *   - Positive excerpt produces no tags
 *   - Case-insensitive matching
 *   - Multi-keyword excerpt can produce all tags
 */

import { describe, it, expect } from 'vitest';
import { tagFrictionSignals } from '../acquisition/corpus-to-dossier.js';

// ---------------------------------------------------------------------------
// Guard cases
// ---------------------------------------------------------------------------

describe('tagFrictionSignals — guard cases', () => {
  it('returns [] on empty string', () => {
    expect(tagFrictionSignals('', 'reddit_thread')).toEqual([]);
  });

  it('returns [] on undefined excerpt', () => {
    expect(tagFrictionSignals(undefined, 'reddit_thread')).toEqual([]);
  });

  it('returns [] for positive/neutral excerpt', () => {
    expect(tagFrictionSignals('Great product, works well. Highly recommend.', 'reddit_thread')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Friction keywords
// ---------------------------------------------------------------------------

describe('tagFrictionSignals — friction keywords', () => {
  const frictionCases: [string, string][] = [
    ['The app is slow and laggy', 'slow'],
    ['It is completely broken after the update', 'broken'],
    ["It doesn't work for our use case", "doesn't work"],
    ['It is hard to get started', 'hard to'],
    ['The UI is difficult to navigate', 'difficult'],
    ['The onboarding was painful', 'painful'],
    ['The interface feels janky', 'janky'],
    ['The integration fails constantly', 'fails'],
    ['There are a lot of errors in production', 'error'],
    ['We found a major bug in the export', 'bug'],
    ['The service crashes under load', 'crashes'],
    ['The system is unstable', 'unstable'],
    ['Performance is unreliable', 'unreliable'],
    ['The dashboard is confusing', 'confusing'],
    ['The UI is clunky and outdated', 'clunky'],
    ['The workflow is cumbersome', 'cumbersome'],
    ['Frustrating to use in production', 'frustrating to use'],
    ['There is poor documentation for the API', 'poor documentation'],
    ['Has a steep learning curve for new users', 'steep learning curve'],
    ['Setup is very complex', 'setup is'],
    ['It is hard to set up in Docker', 'hard to set up'],
    ['Complex to integrate with Salesforce', 'complex to'],
  ];

  for (const [excerpt, keyword] of frictionCases) {
    it(`detects friction for "${keyword}"`, () => {
      const tags = tagFrictionSignals(excerpt, 'reddit_thread');
      expect(tags).toContain('friction');
    });
  }
});

// ---------------------------------------------------------------------------
// Complaint keywords
// ---------------------------------------------------------------------------

describe('tagFrictionSignals — complaint keywords', () => {
  const complaintCases: [string, string][] = [
    ['I am disappointed with the product', 'disappointed'],
    ['I am frustrated with support', 'frustrated'],
    ['Total waste of money', 'waste'],
    ['I regret buying this', 'regret'],
    ['You should avoid this tool', 'avoid'],
    ['The UI is terrible', 'terrible'],
    ['Awful experience overall', 'awful'],
    ['The worst SaaS I have used', 'worst'],
    ['Not worth the price', 'not worth'],
    ['We switched away after 3 months', 'switched away'],
    ['We cancelled our subscription', 'cancelled'],
    ['The team churned from the platform', 'churned'],
    ['We left for a competitor', 'left for'],
    ['We moved to a different tool', 'moved to'],
    ['We went back to the old solution', 'went back to'],
    ['Not recommended for enterprise', 'not recommended'],
    ['Stay away from this product', 'stay away'],
    ['The product is overpriced', 'overpriced'],
    ['There is poor support', 'poor support'],
    ['There is no support for custom workflows', 'no support'],
    ['They ignored our feature requests', 'ignored our'],
  ];

  for (const [excerpt, keyword] of complaintCases) {
    it(`detects complaint for "${keyword}"`, () => {
      const tags = tagFrictionSignals(excerpt, 'critical_review');
      expect(tags).toContain('complaint');
    });
  }
});

// ---------------------------------------------------------------------------
// Contradiction keywords
// ---------------------------------------------------------------------------

describe('tagFrictionSignals — contradiction keywords', () => {
  const contradictionCases: [string, string][] = [
    ['The vendor claims it scales', 'claims'],
    ['They say it integrates but actually it does not', 'but actually'],
    ['It is marketed as enterprise-ready', 'marketed as'],
    ['The vs reality is quite different', 'vs reality'],
    ['In practice it is much harder', 'in practice'],
    ['It was supposed to handle this case', 'supposed to'],
    ['Advertised as real-time but it is not', 'advertised as'],
    ['They promised enterprise features', 'promised'],
    ['The reality is it cannot scale', 'reality is'],
    ['The truth is we gave up', 'truth is'],
    ['The marketing is misleading', 'misleading'],
    ['The claims are overstated', 'overstated'],
    ["It doesn't actually handle scale", "doesn't actually"],
    ['In theory it works but in practice no', 'in theory'],
    ['On paper the specs look good', 'on paper'],
  ];

  for (const [excerpt, keyword] of contradictionCases) {
    it(`detects contradiction for "${keyword}"`, () => {
      const tags = tagFrictionSignals(excerpt, 'comparison_article');
      expect(tags).toContain('contradiction');
    });
  }
});

// ---------------------------------------------------------------------------
// buyer_disappointment composite tag
// ---------------------------------------------------------------------------

describe('tagFrictionSignals — buyer_disappointment', () => {
  it('adds buyer_disappointment when both friction AND complaint are present', () => {
    const tags = tagFrictionSignals('broken and terrible', 'reddit_thread');
    expect(tags).toContain('friction');
    expect(tags).toContain('complaint');
    expect(tags).toContain('buyer_disappointment');
  });

  it('does NOT add buyer_disappointment for friction only', () => {
    const tags = tagFrictionSignals('the app is broken', 'reddit_thread');
    expect(tags).toContain('friction');
    expect(tags).not.toContain('complaint');
    expect(tags).not.toContain('buyer_disappointment');
  });

  it('does NOT add buyer_disappointment for complaint only', () => {
    const tags = tagFrictionSignals('I am disappointed with the service', 'reddit_thread');
    expect(tags).toContain('complaint');
    expect(tags).not.toContain('friction');
    expect(tags).not.toContain('buyer_disappointment');
  });
});

// ---------------------------------------------------------------------------
// Case-insensitive matching
// ---------------------------------------------------------------------------

describe('tagFrictionSignals — case insensitive', () => {
  it('matches uppercase friction keyword', () => {
    const tags = tagFrictionSignals('The app is BROKEN after the update', 'reddit_thread');
    expect(tags).toContain('friction');
  });

  it('matches mixed-case complaint keyword', () => {
    const tags = tagFrictionSignals('I am Disappointed with the support', 'critical_review');
    expect(tags).toContain('complaint');
  });

  it('matches uppercase contradiction keyword', () => {
    const tags = tagFrictionSignals('CLAIMS to be enterprise-ready but it is not', 'comparison_article');
    expect(tags).toContain('contradiction');
  });
});

// ---------------------------------------------------------------------------
// sourceType parameter does not affect keyword matching
// ---------------------------------------------------------------------------

describe('tagFrictionSignals — sourceType agnostic', () => {
  const sourceTypes = [
    'reddit_thread',
    'hackernews_thread',
    'github_issues_snippet',
    'comparison_article',
    'critical_review',
    'review_trustpilot',
  ] as const;

  for (const sourceType of sourceTypes) {
    it(`produces friction tag for all source types (${sourceType})`, () => {
      const tags = tagFrictionSignals('The app is broken and terrible', sourceType);
      expect(tags).toContain('friction');
      expect(tags).toContain('complaint');
    });
  }
});

// ---------------------------------------------------------------------------
// Multi-tag excerpt
// ---------------------------------------------------------------------------

describe('tagFrictionSignals — multi-tag excerpt', () => {
  it('can produce friction + complaint + contradiction + buyer_disappointment simultaneously', () => {
    const excerpt =
      'They claims it works but actually it is broken and terrible in practice';
    const tags = tagFrictionSignals(excerpt, 'reddit_thread');
    expect(tags).toContain('friction');
    expect(tags).toContain('complaint');
    expect(tags).toContain('contradiction');
    expect(tags).toContain('buyer_disappointment');
  });

  it('returns no duplicate tags even when multiple keywords match', () => {
    const excerpt = 'broken and unstable and crashes all the time';
    const tags = tagFrictionSignals(excerpt, 'reddit_thread');
    const unique = [...new Set(tags)];
    expect(tags).toEqual(unique);
  });
});
