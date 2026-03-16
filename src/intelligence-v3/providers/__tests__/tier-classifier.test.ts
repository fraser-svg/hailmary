/**
 * Tier Classifier Tests — Spec 005 §Tier Classifier
 *
 * ≥ 30 test cases covering every table row + edge cases.
 * Zero API calls — pure deterministic lookup.
 */

import { describe, it, expect } from 'vitest';
import { classifySourceTier } from '../tier-classifier.js';

const TARGET = 'trigger.dev';
const TARGET_STRIPE = 'stripe.com';

describe('classifySourceTier — Tier 1 (company-owned)', () => {
  it('exact company domain → tier 1', () => {
    expect(classifySourceTier('https://trigger.dev/pricing', TARGET)).toBe(1);
  });

  it('www. variant of company domain → tier 1', () => {
    expect(classifySourceTier('https://www.trigger.dev/', TARGET)).toBe(1);
  });

  it('subdomain of company domain → tier 1', () => {
    expect(classifySourceTier('https://docs.trigger.dev/quickstart', TARGET)).toBe(1);
  });

  it('company domain without protocol → tier 1', () => {
    expect(classifySourceTier('trigger.dev/blog/post', TARGET)).toBe(1);
  });

  it('stripe.com for stripe target → tier 1', () => {
    expect(classifySourceTier('https://stripe.com/docs', TARGET_STRIPE)).toBe(1);
  });

  it('does not promote unrelated domain to tier 1', () => {
    expect(classifySourceTier('https://trigger.dev/pricing', TARGET_STRIPE)).not.toBe(1);
  });
});

describe('classifySourceTier — Tier 2 (authoritative external)', () => {
  it('linkedin.com/company/ path → tier 2', () => {
    expect(classifySourceTier('https://linkedin.com/company/trigger-dev', TARGET)).toBe(2);
  });

  it('www.linkedin.com/company/ path → tier 2', () => {
    expect(classifySourceTier('https://www.linkedin.com/company/trigger-dev', TARGET)).toBe(2);
  });

  it('techcrunch.com → tier 2', () => {
    expect(classifySourceTier('https://techcrunch.com/2024/01/trigger', TARGET)).toBe(2);
  });

  it('venturebeat.com → tier 2', () => {
    expect(classifySourceTier('https://venturebeat.com/article', TARGET)).toBe(2);
  });

  it('businesswire.com → tier 2', () => {
    expect(classifySourceTier('https://www.businesswire.com/news/home/1234', TARGET)).toBe(2);
  });

  it('prnewswire.com → tier 2', () => {
    expect(classifySourceTier('https://www.prnewswire.com/release', TARGET)).toBe(2);
  });

  it('crunchbase.com → tier 2', () => {
    expect(classifySourceTier('https://www.crunchbase.com/organization/trigger-dev', TARGET)).toBe(2);
  });

  it('pitchbook.com → tier 2', () => {
    expect(classifySourceTier('https://pitchbook.com/profiles/company', TARGET)).toBe(2);
  });

  it('bloomberg.com → tier 2', () => {
    expect(classifySourceTier('https://bloomberg.com/news/articles/123', TARGET)).toBe(2);
  });

  it('reuters.com → tier 2', () => {
    expect(classifySourceTier('https://reuters.com/technology/', TARGET)).toBe(2);
  });

  it('forbes.com → tier 2', () => {
    expect(classifySourceTier('https://www.forbes.com/sites/trigger', TARGET)).toBe(2);
  });

  it('wsj.com → tier 2', () => {
    expect(classifySourceTier('https://wsj.com/articles/trigger', TARGET)).toBe(2);
  });

  it('ft.com → tier 2', () => {
    expect(classifySourceTier('https://www.ft.com/content/abc', TARGET)).toBe(2);
  });

  it('sec.gov → tier 2', () => {
    expect(classifySourceTier('https://sec.gov/cgi-bin/browse-edgar', TARGET)).toBe(2);
  });

  it('.gov TLD → tier 2', () => {
    expect(classifySourceTier('https://ftc.gov/news/press-releases', TARGET)).toBe(2);
  });

  it('gov.uk TLD → tier 2', () => {
    expect(classifySourceTier('https://ico.org.uk', TARGET)).not.toBe(2); // .org.uk not .gov.uk
    expect(classifySourceTier('https://companieshouse.gov.uk/company', TARGET)).toBe(2);
  });
});

describe('classifySourceTier — Tier 3 (customer/market)', () => {
  it('trustpilot.com → tier 3', () => {
    expect(classifySourceTier('https://www.trustpilot.com/review/trigger.dev', TARGET)).toBe(3);
  });

  it('g2.com → tier 3', () => {
    expect(classifySourceTier('https://g2.com/products/trigger-dev/reviews', TARGET)).toBe(3);
  });

  it('capterra.com → tier 3', () => {
    expect(classifySourceTier('https://capterra.com/software/trigger-dev', TARGET)).toBe(3);
  });

  it('getapp.com → tier 3', () => {
    expect(classifySourceTier('https://getapp.com/task-management-software/a/trigger-dev', TARGET)).toBe(3);
  });

  it('softwareadvice.com → tier 3', () => {
    expect(classifySourceTier('https://softwareadvice.com/project-management/trigger-dev', TARGET)).toBe(3);
  });

  it('reddit.com → tier 3', () => {
    expect(classifySourceTier('https://reddit.com/r/webdev/comments/abc', TARGET)).toBe(3);
  });

  it('news.ycombinator.com → tier 3', () => {
    expect(classifySourceTier('https://news.ycombinator.com/item?id=123', TARGET)).toBe(3);
  });

  it('producthunt.com → tier 3', () => {
    expect(classifySourceTier('https://www.producthunt.com/products/trigger-dev', TARGET)).toBe(3);
  });

  it('appsumo.com → tier 3', () => {
    expect(classifySourceTier('https://appsumo.com/products/trigger-dev', TARGET)).toBe(3);
  });
});

describe('classifySourceTier — Tier 4 (secondary/weak)', () => {
  it('glassdoor.com → tier 4', () => {
    expect(classifySourceTier('https://glassdoor.com/Reviews/trigger-dev', TARGET)).toBe(4);
  });

  it('comparably.com → tier 4', () => {
    expect(classifySourceTier('https://comparably.com/companies/trigger-dev', TARGET)).toBe(4);
  });

  it('indeed.com → tier 4', () => {
    expect(classifySourceTier('https://indeed.com/cmp/trigger-dev', TARGET)).toBe(4);
  });

  it('greenhouse.io → tier 4', () => {
    expect(classifySourceTier('https://boards.greenhouse.io/triggerdev/jobs/123', TARGET)).toBe(4);
  });

  it('lever.co → tier 4', () => {
    expect(classifySourceTier('https://jobs.lever.co/triggerdev/position', TARGET)).toBe(4);
  });

  it('ashbyhq.com → tier 4', () => {
    expect(classifySourceTier('https://jobs.ashbyhq.com/trigger.dev', TARGET)).toBe(4);
  });

  it('medium.com generic post → tier 4', () => {
    expect(classifySourceTier('https://medium.com/@user/some-article', TARGET)).toBe(4);
  });

  it('medium.com publication article → tier 4 (Phase 1 default)', () => {
    expect(classifySourceTier('https://medium.com/bettermarketing/some-article', TARGET)).toBe(4);
  });

  it('substack.com → tier 4', () => {
    expect(classifySourceTier('https://someauthor.substack.com/p/article', TARGET)).toBe(4);
  });

  it('unknown domain → tier 4 (default)', () => {
    expect(classifySourceTier('https://somerandomblog.io/post', TARGET)).toBe(4);
  });

  it('empty url → tier 4', () => {
    expect(classifySourceTier('', TARGET)).toBe(4);
  });

  it('malformed url → tier 4 (graceful fallback)', () => {
    expect(classifySourceTier('not-a-url-at-all', TARGET)).toBe(4);
  });
});

describe('classifySourceTier — required domain coverage', () => {
  // All domains explicitly required by the acquisition hardening spec

  it('trigger.dev (target domain) → tier 1', () => {
    expect(classifySourceTier('https://trigger.dev/pricing', TARGET)).toBe(1);
  });

  it('www.trigger.dev (www variant) → tier 1', () => {
    expect(classifySourceTier('https://www.trigger.dev/', TARGET)).toBe(1);
  });

  it('techcrunch.com → tier 2', () => {
    expect(classifySourceTier('https://techcrunch.com/2024/trigger', TARGET)).toBe(2);
  });

  it('ycombinator.com → tier 2 (investor site)', () => {
    expect(classifySourceTier('https://www.ycombinator.com/companies/trigger-dev', TARGET)).toBe(2);
  });

  it('ycombinator.com without www → tier 2', () => {
    expect(classifySourceTier('https://ycombinator.com/companies/trigger-dev', TARGET)).toBe(2);
  });

  it('news.ycombinator.com → tier 3 (HN community, NOT tier 2)', () => {
    expect(classifySourceTier('https://news.ycombinator.com/item?id=123', TARGET)).toBe(3);
  });

  it('trustpilot.com → tier 3', () => {
    expect(classifySourceTier('https://www.trustpilot.com/review/trigger.dev', TARGET)).toBe(3);
  });

  it('g2.com → tier 3', () => {
    expect(classifySourceTier('https://g2.com/products/trigger-dev/reviews', TARGET)).toBe(3);
  });

  it('capterra.com → tier 3', () => {
    expect(classifySourceTier('https://capterra.com/software/trigger-dev', TARGET)).toBe(3);
  });

  it('slashdot.org → tier 4 (low-quality aggregator)', () => {
    expect(classifySourceTier('https://slashdot.org/software/p/trigger-dev', TARGET)).toBe(4);
  });

  it('sourceforge.net → tier 4 (software hosting aggregator)', () => {
    expect(classifySourceTier('https://sourceforge.net/software/compare/trigger-dev', TARGET)).toBe(4);
  });

  it('linkedin.com/company/ → tier 2', () => {
    expect(classifySourceTier('https://linkedin.com/company/trigger-dev', TARGET)).toBe(2);
  });

  it('greenhouse.io → tier 4 (job board)', () => {
    expect(classifySourceTier('https://greenhouse.io/triggerdev/jobs', TARGET)).toBe(4);
  });
});

describe('classifySourceTier — subdomain matching', () => {
  it('about.crunchbase.com → tier 2 (subdomain of Tier 2 domain)', () => {
    expect(classifySourceTier('https://about.crunchbase.com/news/trigger-dev', TARGET)).toBe(2);
  });

  it('blog.crunchbase.com → tier 2 (subdomain of Tier 2 domain)', () => {
    expect(classifySourceTier('https://blog.crunchbase.com/trigger-dev', TARGET)).toBe(2);
  });

  it('app.trustpilot.com → tier 3 (subdomain of Tier 3 domain)', () => {
    expect(classifySourceTier('https://app.trustpilot.com/review/trigger.dev', TARGET)).toBe(3);
  });

  it('boards.greenhouse.io → tier 4 (subdomain of Tier 4 domain)', () => {
    expect(classifySourceTier('https://boards.greenhouse.io/triggerdev/jobs/123', TARGET)).toBe(4);
  });

  it('jobs.lever.co → tier 4 (subdomain of Tier 4 domain)', () => {
    expect(classifySourceTier('https://jobs.lever.co/triggerdev/position', TARGET)).toBe(4);
  });

  it('news.ycombinator.com → tier 3 (exact override wins over ycombinator.com subdomain-Tier-2)', () => {
    // This is the critical ordering test: news.ycombinator.com must be Tier 3,
    // NOT Tier 2 via subdomain-match of ycombinator.com
    expect(classifySourceTier('https://news.ycombinator.com/item?id=12345', TARGET)).toBe(3);
  });

  it('subdomain of own domain → tier 1', () => {
    expect(classifySourceTier('https://docs.trigger.dev/quickstart', TARGET)).toBe(1);
  });
});

describe('classifySourceTier — edge cases', () => {
  it('linkedin.com individual post (not /company/) → tier 4', () => {
    expect(classifySourceTier('https://linkedin.com/posts/john-doe_some-post', TARGET)).toBe(4);
  });

  it('linkedin.com profile page (not /company/) → tier 4', () => {
    expect(classifySourceTier('https://www.linkedin.com/in/john-doe/', TARGET)).toBe(4);
  });

  it('www.trustpilot.com (www. prefix) → tier 3', () => {
    expect(classifySourceTier('https://www.trustpilot.com/review', TARGET)).toBe(3);
  });

  it('company domain with port → tier 1', () => {
    expect(classifySourceTier('https://trigger.dev:443/pricing', TARGET)).toBe(1);
  });

  it('target domain with www. prefix in input → still normalises correctly', () => {
    expect(classifySourceTier('https://www.stripe.com/docs', 'www.stripe.com')).toBe(1);
  });

  it('does NOT return tier 5 (reserved for manual flagging)', () => {
    const result = classifySourceTier('https://obscure-no-match-site.xyz/page', TARGET);
    expect(result).not.toBe(5);
  });
});
