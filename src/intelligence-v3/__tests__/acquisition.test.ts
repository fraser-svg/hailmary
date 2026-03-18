/**
 * V3 Acquisition Layer Tests
 *
 * Tests for V3-U1 through V3-U4:
 *   - site-corpus: required page validation, token/page limits, fixture mode
 *   - external-research: fixture mode, empty fixture handling
 *   - merge-corpus: corpus structure, URL dedup, content hash dedup, tier distribution
 *   - corpus-to-dossier: minimally valid dossier shape, source/evidence integrity
 *
 * All tests use fixture/manual mode — no external API calls.
 */

import { describe, it, expect } from 'vitest';
import {
  siteCorpusAcquisition,
  estimateTokenCount,
  applyLimits,
  MAX_PAGES,
  MAX_TOKENS,
} from '../acquisition/site-corpus.js';
import { externalResearchAcquisition } from '../acquisition/external-research.js';
import type { ExternalResearchProvider } from '../acquisition/external-research.js';
import { mergeResearchCorpus } from '../acquisition/merge-corpus.js';
import { corpusToDossierAdapter, domainToCompanyName } from '../acquisition/corpus-to-dossier.js';
import type { CorpusPage, ExternalSource, CommunityMention } from '../types/research-corpus.js';
import type { EnrichmentResult } from '../types/enrichment.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCorpusPage(
  pageType: CorpusPage['page_type'],
  overrides?: Partial<CorpusPage>,
): CorpusPage {
  return {
    url: `https://example.com/${pageType === 'homepage' ? '' : pageType}`,
    page_type: pageType,
    fetched_at: new Date().toISOString(),
    raw_text: `This is the ${pageType} page content. `.repeat(10),
    token_count: 0, // will be computed by siteCorpusAcquisition
    fetch_success: true,
    source_tier: 1,
    ...overrides,
  };
}

// Use realistic external URLs so tier-classifier assigns correct canonical tiers:
//   review_* → trustpilot.com / g2.com → Tier 3
//   press_mention → techcrunch.com → Tier 2
//   others → external sites → Tier 2-4
const EXTERNAL_SOURCE_URLS: Partial<Record<ExternalSource['source_type'], string>> = {
  review_trustpilot: 'https://trustpilot.com/review/example-co',
  review_g2_snippet: 'https://g2.com/products/example-co/reviews',
  review_capterra_snippet: 'https://capterra.com/software/example-co',
  press_mention: 'https://techcrunch.com/2024/01/example-co-funding',
  competitor_search_snippet: 'https://g2.com/compare/example-co-vs-competitor',
  funding_announcement: 'https://crunchbase.com/organization/example-co',
  linkedin_snippet: 'https://linkedin.com/company/example-co',
  investor_mention: 'https://news.ycombinator.com/item?id=12345',
};

function makeExternalSource(
  type: ExternalSource['source_type'],
  overrides?: Partial<ExternalSource>,
): ExternalSource {
  const url = EXTERNAL_SOURCE_URLS[type] ?? `https://techcrunch.com/${type}`;
  return {
    url,
    source_type: type,
    gathered_at: new Date().toISOString(),
    excerpt: `Review excerpt for ${type}. Great product, works well.`,
    token_count: 20,
    source_tier: type.startsWith('review_') ? 3 : 2,
    ...overrides,
  };
}

const MANDATORY_PAGES: CorpusPage[] = [
  makeCorpusPage('homepage', { raw_text: 'We help businesses automate workflows. Simple, fast, reliable.' }),
  makeCorpusPage('pricing', { raw_text: 'Starter: $49/month. Pro: $149/month. Enterprise: contact us.' }),
  makeCorpusPage('about', { raw_text: 'Founded in 2020 by Jane Smith. Team of 25 people in London.' }),
];

// ---------------------------------------------------------------------------
// site-corpus.ts
// ---------------------------------------------------------------------------

describe('siteCorpusAcquisition', () => {
  describe('fixture mode', () => {
    it('loads mandatory pages and returns valid SiteCorpus', async () => {
      const result = await siteCorpusAcquisition({
        domain: 'example.com',
        fixture_pages: MANDATORY_PAGES,
      });

      expect(result.domain).toBe('example.com');
      expect(result.pages).toHaveLength(3);
      expect(result.fetch_metadata.total_tokens).toBeGreaterThan(0);
      expect(result.pages.every(p => p.fetch_success)).toBe(true);
    });

    it('computes token counts from raw_text when fixture provides token_count: 0', async () => {
      const result = await siteCorpusAcquisition({
        domain: 'example.com',
        fixture_pages: MANDATORY_PAGES,
      });

      for (const page of result.pages) {
        expect(page.token_count).toBeGreaterThan(0);
        // estimateTokenCount rough check
        expect(page.token_count).toBe(estimateTokenCount(page.raw_text));
      }
    });

    it('returns degraded corpus when homepage is missing (non-fatal)', async () => {
      const pagesWithoutHomepage = MANDATORY_PAGES.filter(p => p.page_type !== 'homepage');

      const result = await siteCorpusAcquisition({
        domain: 'example.com',
        fixture_pages: pagesWithoutHomepage,
      });

      // Should succeed but with no homepage page
      expect(result.pages.some(p => p.page_type === 'homepage')).toBe(false);
      expect(result.pages.length).toBeGreaterThan(0);
    });

    it('continues when pricing page is missing (non-fatal)', async () => {
      const pagesWithoutPricing = MANDATORY_PAGES.filter(p => p.page_type !== 'pricing');

      const result = await siteCorpusAcquisition({
        domain: 'example.com',
        fixture_pages: pagesWithoutPricing,
      });

      expect(result.pages.some(p => p.page_type === 'homepage')).toBe(true);
      expect(result.fetch_metadata.failed_pages).toHaveLength(1);
      expect(result.fetch_metadata.failed_pages[0]).toContain('pricing');
    });

    it('enforces page limit: truncates to MAX_PAGES (10)', async () => {
      const manyPages: CorpusPage[] = [
        ...MANDATORY_PAGES,
        makeCorpusPage('docs'),
        makeCorpusPage('integrations'),
        makeCorpusPage('blog'),
        makeCorpusPage('customers'),
        makeCorpusPage('case-studies'),
        makeCorpusPage('security'),
        // 9 pages above; add one more to exceed 10 after mandatory
        makeCorpusPage('docs', { url: 'https://example.com/docs2', raw_text: 'Extra docs page' }),
        makeCorpusPage('blog', { url: 'https://example.com/blog2', raw_text: 'Extra blog page' }),
      ];
      // 11 pages total; should be capped at MAX_PAGES = 10

      const result = await siteCorpusAcquisition({
        domain: 'example.com',
        fixture_pages: manyPages,
      });

      expect(result.pages.length).toBeLessThanOrEqual(MAX_PAGES);
    });

    it('enforces token limit: stops adding pages when budget exceeded', async () => {
      // Create pages that together exceed MAX_TOKENS
      const bigText = 'word '.repeat(2500); // ~2500 * 5 chars / 4 = ~3125 tokens each
      const bigPages: CorpusPage[] = [
        makeCorpusPage('homepage', { raw_text: bigText }),
        makeCorpusPage('pricing', { raw_text: bigText }),
        makeCorpusPage('about', { raw_text: bigText }),
        makeCorpusPage('docs', { raw_text: bigText }),
        makeCorpusPage('blog', { raw_text: bigText }),
        makeCorpusPage('integrations', { raw_text: bigText }),
        makeCorpusPage('security', { raw_text: bigText }),
      ];

      const result = await siteCorpusAcquisition({
        domain: 'example.com',
        fixture_pages: bigPages,
      });

      expect(result.fetch_metadata.total_tokens).toBeLessThanOrEqual(MAX_TOKENS);
    });

    it('respects max_pages in crawl_config (lower than default)', async () => {
      const result = await siteCorpusAcquisition({
        domain: 'example.com',
        fixture_pages: MANDATORY_PAGES,
        crawl_config: { max_pages: 2 },
      });

      expect(result.pages.length).toBeLessThanOrEqual(2);
      // Homepage must always be first (highest priority)
      expect(result.pages[0]?.page_type).toBe('homepage');
    });

    it('preserves mandatory pages before optional in priority order', async () => {
      const pages: CorpusPage[] = [
        makeCorpusPage('security'),       // optional
        makeCorpusPage('blog'),            // optional
        makeCorpusPage('pricing'),         // mandatory
        makeCorpusPage('homepage'),        // mandatory
        makeCorpusPage('about'),           // mandatory
      ];

      const result = await siteCorpusAcquisition({
        domain: 'example.com',
        fixture_pages: pages,
        crawl_config: { max_pages: 3 },
      });

      const types = result.pages.map(p => p.page_type);
      // With max_pages: 3, we should get the 3 mandatory pages, not optional ones
      expect(types).toContain('homepage');
      expect(types).toContain('pricing');
      expect(types).toContain('about');
    });
  });

});

// ---------------------------------------------------------------------------
// estimateTokenCount
// ---------------------------------------------------------------------------

describe('estimateTokenCount', () => {
  it('returns ceil(length / 4)', () => {
    expect(estimateTokenCount('abcd')).toBe(1);
    expect(estimateTokenCount('hello world')).toBe(3);  // ceil(11/4) = 3
    expect(estimateTokenCount('')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// applyLimits
// ---------------------------------------------------------------------------

describe('applyLimits', () => {
  it('returns all pages when under limits', () => {
    const pages = MANDATORY_PAGES.map(p => ({ ...p, token_count: 100 }));
    const result = applyLimits(pages, 10, 20_000);
    expect(result).toHaveLength(3);
  });

  it('stops at page count limit', () => {
    const pages = MANDATORY_PAGES.map(p => ({ ...p, token_count: 100 }));
    const result = applyLimits(pages, 2, 20_000);
    expect(result).toHaveLength(2);
  });

  it('stops at token limit', () => {
    const pages: CorpusPage[] = [
      { ...makeCorpusPage('homepage'), token_count: 8000 },
      { ...makeCorpusPage('pricing'), token_count: 8000 },
      { ...makeCorpusPage('about'), token_count: 8000 },
    ];
    // 8000 + 8000 = 16000 fits; adding 3rd (8000) would make 24000 > 20000
    const result = applyLimits(pages, 10, 20_000);
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// externalResearchAcquisition
// ---------------------------------------------------------------------------

describe('externalResearchAcquisition', () => {
  it('fixture mode: loads provided sources', async () => {
    const sources = [
      makeExternalSource('review_trustpilot'),
      makeExternalSource('press_mention'),
    ];

    const result = await externalResearchAcquisition({
      company: 'Example',
      domain: 'example.com',
      fixture_sources: sources,
    });

    expect(result.company).toBe('Example');
    expect(result.sources).toHaveLength(2);
    expect(result.source_metadata.source_types_successful).toContain('review_trustpilot');
    expect(result.source_metadata.source_types_successful).toContain('press_mention');
  });

  it('fixture mode: empty fixture returns corpus with no sources', async () => {
    const result = await externalResearchAcquisition({
      company: 'Example',
      domain: 'example.com',
      fixture_sources: [],
    });

    expect(result.sources).toHaveLength(0);
    expect(result.source_metadata.source_types_successful).toHaveLength(0);
  });

  it('no provider/fixture: returns empty corpus (non-fatal)', async () => {
    const result = await externalResearchAcquisition({
      company: 'Example',
      domain: 'example.com',
    });

    expect(result.sources).toHaveLength(0);
    expect(result.gathered_at).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// mergeResearchCorpus
// ---------------------------------------------------------------------------

describe('mergeResearchCorpus', () => {
  const baseSiteCorpus = {
    domain: 'https://example.com',
    fetched_at: new Date().toISOString(),
    pages: MANDATORY_PAGES.map(p => ({ ...p, token_count: 100 })),
    fetch_metadata: {
      attempted_pages: ['https://example.com/'],
      failed_pages: [],
      total_tokens: 300,
    },
  };

  const baseExternalCorpus = {
    company: 'Example',
    gathered_at: new Date().toISOString(),
    sources: [
      makeExternalSource('review_trustpilot'),
      makeExternalSource('press_mention'),
    ],
    source_metadata: {
      source_types_attempted: ['review_trustpilot', 'press_mention'] as ExternalSource['source_type'][],
      source_types_successful: ['review_trustpilot', 'press_mention'] as ExternalSource['source_type'][],
      search_queries_used: ['Example reviews'],
    },
  };

  it('produces a valid ResearchCorpus with all four buckets', () => {
    const corpus = mergeResearchCorpus(baseSiteCorpus, baseExternalCorpus);

    expect(corpus.site_pages).toHaveLength(3);
    expect(corpus.external_sources).toHaveLength(2);
    expect(corpus.community_mentions).toEqual([]);
    expect(corpus.founder_statements).toEqual([]);
    expect(corpus.company_id).toBeTruthy();
    expect(corpus.domain).toBe('https://example.com');
  });

  it('derives company_id from domain (slugified)', () => {
    const corpus = mergeResearchCorpus(baseSiteCorpus, baseExternalCorpus);
    // "https://example.com" → strip protocol → "example.com" → slugify → "example-com"
    expect(corpus.company_id).toBe('example-com');
  });

  it('deduplicates site pages by URL (keeps higher token count)', () => {
    const dupPages = [
      ...MANDATORY_PAGES.map(p => ({ ...p, token_count: 50 })),
      { ...MANDATORY_PAGES[0], token_count: 200 }, // duplicate homepage with higher tokens
    ];

    const corpus = mergeResearchCorpus(
      { ...baseSiteCorpus, pages: dupPages },
      baseExternalCorpus,
    );

    const homepages = corpus.site_pages.filter(p => p.page_type === 'homepage');
    expect(homepages).toHaveLength(1);
    expect(homepages[0]!.token_count).toBe(200); // kept the higher token count version
  });

  it('deduplicates external sources by content hash', () => {
    const identicalExcerpt = 'Exactly the same review text for deduplication testing.';
    const dupSources = [
      makeExternalSource('review_trustpilot', {
        url: 'https://trustpilot.com/review/example-1',
        excerpt: identicalExcerpt,
        token_count: 30,
      }),
      makeExternalSource('review_g2_snippet', {
        url: 'https://g2.com/review/example-1',
        excerpt: identicalExcerpt, // same content, different URL
        token_count: 30,
      }),
    ];

    const corpus = mergeResearchCorpus(
      baseSiteCorpus,
      { ...baseExternalCorpus, sources: dupSources },
    );

    // Same content from two URLs → deduplicated to 1
    expect(corpus.external_sources).toHaveLength(1);
    expect(corpus.merge_metadata.deduplicated_count).toBe(1);
  });

  it('computes correct tier_distribution', () => {
    const corpus = mergeResearchCorpus(baseSiteCorpus, baseExternalCorpus);

    // 3 site pages = Tier 1
    expect(corpus.merge_metadata.tier_distribution[1]).toBe(3);
    // press_mention = Tier 2; review_trustpilot = Tier 3
    expect(corpus.merge_metadata.tier_distribution[2]).toBeGreaterThanOrEqual(1);
    expect(corpus.merge_metadata.tier_distribution[3]).toBeGreaterThanOrEqual(1);
  });

  it('reports correct total_items and deduplicated_count', () => {
    const corpus = mergeResearchCorpus(baseSiteCorpus, baseExternalCorpus);

    // 3 pages + 2 sources, no dups
    expect(corpus.merge_metadata.total_items).toBe(5);
    expect(corpus.merge_metadata.deduplicated_count).toBe(0);
  });

  it('accepts optional community_mentions and founder_statements', () => {
    const corpus = mergeResearchCorpus(baseSiteCorpus, baseExternalCorpus, {
      community_mentions: [
        {
          url: 'https://reddit.com/r/saas/123',
          platform: 'reddit',
          gathered_at: new Date().toISOString(),
          excerpt: 'Switched to Example last month, love it.',
          author_type: 'customer',
          source_tier: 3,
        },
      ],
    });

    expect(corpus.community_mentions).toHaveLength(1);
    expect(corpus.founder_statements).toEqual([]);
    expect(corpus.merge_metadata.total_items).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// corpusToDossierAdapter
// ---------------------------------------------------------------------------

describe('corpusToDossierAdapter', () => {
  const siteCorpus = {
    domain: 'https://acme.io',
    fetched_at: new Date().toISOString(),
    pages: MANDATORY_PAGES.map(p => ({
      ...p,
      url: `https://acme.io/${p.page_type === 'homepage' ? '' : p.page_type}`,
      token_count: 50,
    })),
    fetch_metadata: {
      attempted_pages: ['https://acme.io/'],
      failed_pages: [],
      total_tokens: 150,
    },
  };

  const externalCorpus = {
    company: 'Acme',
    gathered_at: new Date().toISOString(),
    sources: [
      makeExternalSource('review_trustpilot', {
        url: 'https://trustpilot.com/review/acme',
        excerpt: 'Acme is a fantastic tool. Saved us hours every week.',
        token_count: 20,
        source_tier: 3,
      }),
      makeExternalSource('press_mention', {
        url: 'https://techcrunch.com/acme-funding',
        excerpt: 'Acme raises $5M Series A to expand workflow automation.',
        token_count: 20,
        source_tier: 2,
      }),
    ],
    source_metadata: {
      source_types_attempted: [] as ExternalSource['source_type'][],
      source_types_successful: [] as ExternalSource['source_type'][],
      search_queries_used: [],
    },
  };

  const corpus = mergeResearchCorpus(siteCorpus, externalCorpus);

  it('produces a dossier with all 16 required top-level fields', () => {
    const dossier = corpusToDossierAdapter(corpus);

    expect(dossier.schema_version).toBeTruthy();
    expect(dossier.generated_at).toBeTruthy();
    expect(dossier.company_input).toBeTruthy();
    expect(dossier.run_metadata).toBeTruthy();
    expect(dossier.company_profile).toBeTruthy();
    expect(dossier.product_and_offer).toBeTruthy();
    expect(dossier.gtm_model).toBeTruthy();
    expect(dossier.customer_and_personas).toBeTruthy();
    expect(dossier.competitors).toBeTruthy();
    expect(dossier.market_and_macro).toBeTruthy();
    expect(dossier.signals).toBeTruthy();
    expect(dossier.narrative_intelligence).toBeTruthy();
    expect(dossier.strategic_risks).toBeTruthy();
    expect(dossier.confidence_and_gaps).toBeTruthy();
    expect(dossier.sources).toBeTruthy();
    expect(dossier.evidence).toBeTruthy();
  });

  it('populates sources from corpus items', () => {
    const dossier = corpusToDossierAdapter(corpus);

    // 3 site pages + 2 external sources = 5 sources
    expect(dossier.sources).toHaveLength(5);
    expect(dossier.sources.every(s => s.source_id.startsWith('src_'))).toBe(true);
    expect(dossier.sources.every(s => typeof s.source_tier === 'number')).toBe(true);
  });

  it('populates evidence from corpus items', () => {
    const dossier = corpusToDossierAdapter(corpus);

    // One evidence record per corpus item = 5
    expect(dossier.evidence).toHaveLength(5);
    expect(dossier.evidence.every(e => e.evidence_id.startsWith('ev_'))).toBe(true);
    expect(dossier.evidence.every(e => e.source_id.startsWith('src_'))).toBe(true);
  });

  it('all evidence source_ids resolve to existing sources', () => {
    const dossier = corpusToDossierAdapter(corpus);

    const sourceIds = new Set(dossier.sources.map(s => s.source_id));
    for (const ev of dossier.evidence) {
      expect(sourceIds.has(ev.source_id)).toBe(true);
    }
  });

  it('all evidence_ids referenced in sections exist in dossier.evidence', () => {
    const dossier = corpusToDossierAdapter(corpus);

    const evidenceIds = new Set(dossier.evidence.map(e => e.evidence_id));

    function collectReferencedIds(obj: unknown): string[] {
      if (obj === null || typeof obj !== 'object') return [];
      if (Array.isArray(obj)) return obj.flatMap(item => collectReferencedIds(item));
      const result: string[] = [];
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (key === 'evidence_ids' && Array.isArray(value)) {
          result.push(...value.filter((v): v is string => typeof v === 'string'));
        } else if (key !== 'sources' && key !== 'evidence') {
          result.push(...collectReferencedIds(value));
        }
      }
      return result;
    }

    const referenced = collectReferencedIds(dossier);
    for (const id of referenced) {
      expect(evidenceIds.has(id)).toBe(true);
    }
  });

  it('sets company_input.primary_domain from corpus domain', () => {
    const dossier = corpusToDossierAdapter(corpus);
    // corpus.domain is 'https://acme.io' → stripped to 'acme.io'
    expect(dossier.company_input.primary_domain).toBe('acme.io');
  });

  it('sets pipeline_version to v3-upstream', () => {
    const dossier = corpusToDossierAdapter(corpus);
    expect(dossier.run_metadata.pipeline_version).toBe('v3-upstream');
  });

  it('populates narrative_intelligence.company_claimed_value from site pages', () => {
    const dossier = corpusToDossierAdapter(corpus);
    expect(dossier.narrative_intelligence.company_claimed_value.length).toBeGreaterThan(0);
  });

  it('populates narrative_intelligence.customer_expressed_value from review sources', () => {
    const dossier = corpusToDossierAdapter(corpus);
    expect(dossier.narrative_intelligence.customer_expressed_value.length).toBeGreaterThan(0);
  });

  it('confidence_and_gaps.overall_confidence is low for sparse corpus', async () => {
    // Minimal corpus: just homepage
    const minimalSiteCorpus = {
      domain: 'https://minimal.io',
      fetched_at: new Date().toISOString(),
      pages: [makeCorpusPage('homepage', { url: 'https://minimal.io/', token_count: 50 })],
      fetch_metadata: { attempted_pages: [], failed_pages: [], total_tokens: 50 },
    };
    const minimalExternalCorpus = {
      company: 'Minimal',
      gathered_at: new Date().toISOString(),
      sources: [],
      source_metadata: {
        source_types_attempted: [] as ExternalSource['source_type'][],
        source_types_successful: [] as ExternalSource['source_type'][],
        search_queries_used: [],
      },
    };
    const minimalCorpus = mergeResearchCorpus(minimalSiteCorpus, minimalExternalCorpus);
    const dossier = corpusToDossierAdapter(minimalCorpus);
    expect(dossier.confidence_and_gaps.overall_confidence).toBe('low');
  });
});

// ---------------------------------------------------------------------------
// corpusToDossierAdapter — tag propagation
// ---------------------------------------------------------------------------

describe('corpusToDossierAdapter — tag propagation', () => {
  function buildMinimalCorpusWithSource(
    sourceOverrides: Partial<ExternalSource>,
    pageOverrides?: Partial<CorpusPage>,
  ) {
    const siteCorpus = {
      domain: 'https://acme.io',
      fetched_at: new Date().toISOString(),
      pages: [
        makeCorpusPage('homepage', { url: 'https://acme.io/', token_count: 50, ...pageOverrides }),
        makeCorpusPage('pricing', { url: 'https://acme.io/pricing', token_count: 30 }),
        makeCorpusPage('about', { url: 'https://acme.io/about', token_count: 30 }),
      ],
      fetch_metadata: { attempted_pages: [], failed_pages: [], total_tokens: 110 },
    };
    const source = makeExternalSource('review_trustpilot', sourceOverrides);
    const externalCorpus = {
      company: 'Acme',
      gathered_at: new Date().toISOString(),
      sources: [source],
      source_metadata: {
        source_types_attempted: ['review_trustpilot'] as ExternalSource['source_type'][],
        source_types_successful: ['review_trustpilot'] as ExternalSource['source_type'][],
        search_queries_used: ['acme reviews'],
      },
    };
    const corpus = mergeResearchCorpus(siteCorpus, externalCorpus);
    return corpusToDossierAdapter(corpus);
  }

  it('adds "stale" tag on evidence record when source is_stale=true', () => {
    // A source with published_at > 24 months ago triggers is_stale in merge
    const twoYearsAgo = new Date();
    twoYearsAgo.setMonth(twoYearsAgo.getMonth() - 25);
    const dossier = buildMinimalCorpusWithSource({
      published_at: twoYearsAgo.toISOString(),
    });
    const reviewEvidence = dossier.evidence.find(
      e => e.evidence_type === 'review_record',
    );
    expect(reviewEvidence?.tags).toContain('stale');
  });

  it('does NOT add "stale" tag when source is recent', () => {
    const dossier = buildMinimalCorpusWithSource({
      published_at: new Date().toISOString(), // today = fresh
    });
    const reviewEvidence = dossier.evidence.find(
      e => e.evidence_type === 'review_record',
    );
    expect(reviewEvidence?.tags).not.toContain('stale');
  });

  it('adds "acquisition_perplexity" tag when acquisition_method=perplexity', () => {
    const dossier = buildMinimalCorpusWithSource({
      acquisition_method: 'perplexity',
    });
    const reviewEvidence = dossier.evidence.find(
      e => e.evidence_type === 'review_record',
    );
    expect(reviewEvidence?.tags).toContain('acquisition_perplexity');
  });

  it('adds "acquisition_cloudflare" tag on site page evidence when acquisition_method=cloudflare', () => {
    const siteCorpus = {
      domain: 'https://acme.io',
      fetched_at: new Date().toISOString(),
      pages: [
        makeCorpusPage('homepage', {
          url: 'https://acme.io/',
          token_count: 50,
          acquisition_method: 'cloudflare' as const,
        }),
        makeCorpusPage('pricing', { url: 'https://acme.io/pricing', token_count: 30 }),
        makeCorpusPage('about', { url: 'https://acme.io/about', token_count: 30 }),
      ],
      fetch_metadata: { attempted_pages: [], failed_pages: [], total_tokens: 110 },
    };
    const externalCorpus = {
      company: 'Acme',
      gathered_at: new Date().toISOString(),
      sources: [],
      source_metadata: {
        source_types_attempted: [] as ExternalSource['source_type'][],
        source_types_successful: [] as ExternalSource['source_type'][],
        search_queries_used: [],
      },
    };
    const corpus = mergeResearchCorpus(siteCorpus, externalCorpus);
    const dossier = corpusToDossierAdapter(corpus);
    const homepageEvidence = dossier.evidence.find(
      e => e.evidence_type === 'company_description_record',
    );
    expect(homepageEvidence?.tags).toContain('acquisition_cloudflare');
  });

  it('does NOT add acquisition tags when acquisition_method is undefined', () => {
    const dossier = buildMinimalCorpusWithSource({});
    const reviewEvidence = dossier.evidence.find(
      e => e.evidence_type === 'review_record',
    );
    expect(reviewEvidence?.tags).not.toContain('acquisition_perplexity');
    expect(reviewEvidence?.tags).not.toContain('acquisition_cloudflare');
  });
});

// ---------------------------------------------------------------------------
// domainToCompanyName
// ---------------------------------------------------------------------------

describe('domainToCompanyName', () => {
  it('capitalises the first segment of the domain', () => {
    expect(domainToCompanyName('stripe.com')).toBe('Stripe');
    expect(domainToCompanyName('trigger.dev')).toBe('Trigger');
    expect(domainToCompanyName('https://acme.io')).toBe('Acme');
    expect(domainToCompanyName('https://www.example.com/')).toBe('Example');
  });
});

// ---------------------------------------------------------------------------
// externalResearchAcquisition — CN budget timeout + sparse warning (Spec 008)
// ---------------------------------------------------------------------------

describe('externalResearchAcquisition — provider mode CN budget', () => {
  /**
   * Build a mock provider that:
   *   - returns 1 source for standard queries
   *   - for CN queries, takes `cnDelayMs` before returning (to simulate slow search)
   */
  function makeMockProvider(options: {
    cnDelayMs?: number;
    cnReturnEmpty?: boolean;
  }): ExternalResearchProvider {
    const { cnDelayMs = 0, cnReturnEmpty = false } = options;
    const cnTypes = new Set([
      'reddit_thread',
      'hackernews_thread',
      'github_issues_snippet',
      'comparison_article',
      'critical_review',
    ]);

    return {
      async search(_query: string, sourceType: ExternalSource['source_type']) {
        const isCN = cnTypes.has(sourceType);

        if (isCN && cnDelayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, cnDelayMs));
        }

        if (isCN && cnReturnEmpty) {
          return [];
        }

        // Use external (non-own-domain) URLs and mention the company/domain
        // in the excerpt so filterExternalSources() accepts them.
        return [
          {
            url: `https://reddit.com/r/saas/${sourceType}`,
            source_type: sourceType,
            gathered_at: new Date().toISOString(),
            excerpt: `example.com ${sourceType} result. Relevant review of the product.`,
            token_count: 15,
            source_tier: 3 as const,
          },
        ];
      },
    };
  }

  it('emits WARN_COUNTER_NARRATIVE_SPARSE when all CN queries return no results', async () => {
    const warnMessages: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => { warnMessages.push(String(args[0])); };

    try {
      await externalResearchAcquisition({
        company: 'Example',
        domain: 'example.com',
        provider: makeMockProvider({ cnReturnEmpty: true }),
      });
    } finally {
      console.warn = origWarn;
    }

    expect(warnMessages.some(m => m.includes('WARN_COUNTER_NARRATIVE_SPARSE'))).toBe(true);
  });

  it('does NOT emit WARN_COUNTER_NARRATIVE_SPARSE when at least one CN query returns results', async () => {
    const warnMessages: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => { warnMessages.push(String(args[0])); };

    try {
      await externalResearchAcquisition({
        company: 'Example',
        domain: 'example.com',
        provider: makeMockProvider({ cnReturnEmpty: false }),
      });
    } finally {
      console.warn = origWarn;
    }

    expect(warnMessages.some(m => m.includes('WARN_COUNTER_NARRATIVE_SPARSE'))).toBe(false);
  });

  it('emits COUNTER_NARRATIVE_ACQUISITION log line when CN queries are attempted', async () => {
    const logMessages: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => { logMessages.push(String(args[0])); };

    try {
      await externalResearchAcquisition({
        company: 'Example',
        domain: 'example.com',
        provider: makeMockProvider({}),
      });
    } finally {
      console.log = origLog;
    }

    expect(logMessages.some(m => m.includes('COUNTER_NARRATIVE_ACQUISITION'))).toBe(true);
  });

  it('COUNTER_NARRATIVE_ACQUISITION log includes queries_attempted and sources_acquired', async () => {
    const logMessages: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => { logMessages.push(args.join(' ')); };

    try {
      await externalResearchAcquisition({
        company: 'Example',
        domain: 'example.com',
        provider: makeMockProvider({}),
      });
    } finally {
      console.log = origLog;
    }

    const cnLog = logMessages.find(m => m.includes('COUNTER_NARRATIVE_ACQUISITION'));
    expect(cnLog).toBeDefined();
    const parsed = JSON.parse(cnLog!.replace('COUNTER_NARRATIVE_ACQUISITION ', ''));
    expect(parsed).toHaveProperty('queries_attempted');
    expect(parsed).toHaveProperty('queries_success');
    expect(parsed).toHaveProperty('sources_acquired');
    expect(parsed).toHaveProperty('budget_exceeded');
    expect(parsed.queries_attempted).toBe(5); // 5 CN query types
  });

  it('emits WARN_COUNTER_NARRATIVE_TIMEOUT and stops remaining CN queries when budget exceeded', async () => {
    const warnMessages: string[] = [];
    const logMessages: string[] = [];
    const origWarn = console.warn;
    const origLog = console.log;
    console.warn = (...args: unknown[]) => { warnMessages.push(String(args[0])); };
    console.log = (...args: unknown[]) => { logMessages.push(args.join(' ')); };

    try {
      // Each CN query takes 25s (> 20s budget) — budget exceeded on first CN query
      await externalResearchAcquisition({
        company: 'Example',
        domain: 'example.com',
        provider: makeMockProvider({ cnDelayMs: 25_000 }),
      });
    } finally {
      console.warn = origWarn;
      console.log = origLog;
    }

    expect(warnMessages.some(m => m.includes('WARN_COUNTER_NARRATIVE_TIMEOUT'))).toBe(true);

    const cnLog = logMessages.find(m => m.includes('COUNTER_NARRATIVE_ACQUISITION'));
    expect(cnLog).toBeDefined();
    const parsed = JSON.parse(cnLog!.replace('COUNTER_NARRATIVE_ACQUISITION ', ''));
    expect(parsed.budget_exceeded).toBe(true);
  }, 30_000); // 30s timeout — allows for the one 25s delay + overhead
});

// ---------------------------------------------------------------------------
// Community routing (Change 2)
// ---------------------------------------------------------------------------

describe('mergeResearchCorpus — community routing', () => {
  const siteCorpus = {
    domain: 'example.com',
    fetched_at: new Date().toISOString(),
    pages: MANDATORY_PAGES,
    fetch_metadata: { attempted_pages: [], failed_pages: [], total_tokens: 100 },
  };

  it('routes reddit_thread to community_mentions[]', () => {
    const externalCorpus = {
      company: 'Example',
      gathered_at: new Date().toISOString(),
      sources: [
        makeExternalSource('reddit_thread', {
          url: 'https://reddit.com/r/devops/example',
          excerpt: 'Example is slow and buggy.',
          source_tier: 3,
        }),
        makeExternalSource('review_trustpilot'),
      ],
      source_metadata: { source_types_attempted: [], source_types_successful: [], search_queries_used: [] },
    };

    const corpus = mergeResearchCorpus(siteCorpus, externalCorpus);

    // reddit_thread should be in community_mentions, not external_sources
    expect(corpus.community_mentions.length).toBe(1);
    expect(corpus.community_mentions[0]!.platform).toBe('reddit');
    expect(corpus.community_mentions[0]!.original_source_type).toBe('reddit_thread');
    // Trustpilot review should remain in external_sources
    expect(corpus.external_sources.some(s => s.source_type === 'review_trustpilot')).toBe(true);
    expect(corpus.external_sources.some(s => s.source_type === 'reddit_thread')).toBe(false);
  });

  it('routes hackernews_thread to community_mentions[]', () => {
    const externalCorpus = {
      company: 'Example',
      gathered_at: new Date().toISOString(),
      sources: [
        makeExternalSource('hackernews_thread', {
          url: 'https://news.ycombinator.com/item?id=99999',
          excerpt: 'HN discussion about Example.',
          source_tier: 3,
        }),
      ],
      source_metadata: { source_types_attempted: [], source_types_successful: [], search_queries_used: [] },
    };

    const corpus = mergeResearchCorpus(siteCorpus, externalCorpus);

    expect(corpus.community_mentions.length).toBe(1);
    expect(corpus.community_mentions[0]!.platform).toBe('hackernews');
    expect(corpus.external_sources.length).toBe(0);
  });

  it('preserves provenance fields during routing', () => {
    const externalCorpus = {
      company: 'Example',
      gathered_at: new Date().toISOString(),
      sources: [
        makeExternalSource('reddit_thread', {
          url: 'https://reddit.com/r/devops/thread',
          excerpt: 'Reddit content.',
          token_count: 42,
          published_at: '2024-06-15T00:00:00Z',
          acquisition_method: 'perplexity' as const,
          source_tier: 3,
        }),
      ],
      source_metadata: { source_types_attempted: [], source_types_successful: [], search_queries_used: [] },
    };

    const corpus = mergeResearchCorpus(siteCorpus, externalCorpus);
    const mention = corpus.community_mentions[0]!;

    expect(mention.token_count).toBe(42);
    expect(mention.published_at).toBe('2024-06-15T00:00:00Z');
    expect(mention.acquisition_method).toBe('perplexity');
    expect(mention.original_source_type).toBe('reddit_thread');
  });

  it('merges with caller-provided community mentions', () => {
    const externalCorpus = {
      company: 'Example',
      gathered_at: new Date().toISOString(),
      sources: [
        makeExternalSource('reddit_thread', { url: 'https://reddit.com/r/devops/thread' }),
      ],
      source_metadata: { source_types_attempted: [], source_types_successful: [], search_queries_used: [] },
    };

    const callerMention: CommunityMention = {
      platform: 'discord',
      gathered_at: new Date().toISOString(),
      excerpt: 'Discord mention.',
      source_tier: 4,
    };

    const corpus = mergeResearchCorpus(siteCorpus, externalCorpus, {
      community_mentions: [callerMention],
    });

    expect(corpus.community_mentions.length).toBe(2);
    expect(corpus.community_mentions.some(m => m.platform === 'discord')).toBe(true);
    expect(corpus.community_mentions.some(m => m.platform === 'reddit')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Negative signals (Change 3)
// ---------------------------------------------------------------------------

describe('corpusToDossierAdapter — negative_signals population', () => {
  it('populates negative_signals from friction-tagged evidence', () => {
    const siteCorpus = {
      domain: 'example.com',
      fetched_at: new Date().toISOString(),
      pages: MANDATORY_PAGES,
      fetch_metadata: { attempted_pages: [], failed_pages: [], total_tokens: 100 },
    };

    // Create a review with friction keywords
    const externalCorpus = {
      company: 'Example',
      gathered_at: new Date().toISOString(),
      sources: [
        makeExternalSource('review_trustpilot', {
          excerpt: 'Product is unreliable and crashes frequently. The support team ignored our requests.',
        }),
        makeExternalSource('critical_review', {
          url: 'https://blog.example.org/review',
          excerpt: 'Switched away from Example because it was overpriced and confusing to use.',
        }),
      ],
      source_metadata: { source_types_attempted: [], source_types_successful: [], search_queries_used: [] },
    };

    const corpus = mergeResearchCorpus(siteCorpus, externalCorpus);
    const dossier = corpusToDossierAdapter(corpus);

    // Should have negative signals extracted from friction-tagged reviews
    const ns = dossier.narrative_intelligence.negative_signals;
    expect(ns.length).toBeGreaterThan(0);

    // Check that categories are inferred correctly
    const categories = ns.map(s => s.category);
    // "unreliable" → reliability, "overpriced" → billing, "confusing" → usability, etc.
    expect(categories.some(c => ['reliability', 'billing', 'usability', 'support', 'migration'].includes(c))).toBe(true);

    // All should have frequency: 'isolated'
    expect(ns.every(s => s.frequency === 'isolated')).toBe(true);

    // All should have evidence_ids
    expect(ns.every(s => s.evidence_ids.length > 0)).toBe(true);
  });

  it('returns empty negative_signals when no friction evidence', () => {
    const siteCorpus = {
      domain: 'example.com',
      fetched_at: new Date().toISOString(),
      pages: MANDATORY_PAGES,
      fetch_metadata: { attempted_pages: [], failed_pages: [], total_tokens: 100 },
    };

    const externalCorpus = {
      company: 'Example',
      gathered_at: new Date().toISOString(),
      sources: [
        makeExternalSource('press_mention', {
          excerpt: 'Example Co announced a new partnership with BigCorp.',
        }),
      ],
      source_metadata: { source_types_attempted: [], source_types_successful: [], search_queries_used: [] },
    };

    const corpus = mergeResearchCorpus(siteCorpus, externalCorpus);
    const dossier = corpusToDossierAdapter(corpus);

    // Press mentions don't have friction tags → no negative signals
    expect(dossier.narrative_intelligence.negative_signals.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Community evidence in dossier (Change 2 adapter)
// ---------------------------------------------------------------------------

describe('corpusToDossierAdapter — community_mentions evidence', () => {
  it('creates evidence records from community_mentions', () => {
    const siteCorpus = {
      domain: 'example.com',
      fetched_at: new Date().toISOString(),
      pages: MANDATORY_PAGES,
      fetch_metadata: { attempted_pages: [], failed_pages: [], total_tokens: 100 },
    };

    const externalCorpus = {
      company: 'Example',
      gathered_at: new Date().toISOString(),
      sources: [
        makeExternalSource('reddit_thread', {
          url: 'https://reddit.com/r/devops/example',
          excerpt: 'Example is slow and hard to set up.',
          source_tier: 3,
        }),
      ],
      source_metadata: { source_types_attempted: [], source_types_successful: [], search_queries_used: [] },
    };

    const corpus = mergeResearchCorpus(siteCorpus, externalCorpus);
    // Verify routing happened
    expect(corpus.community_mentions.length).toBe(1);

    const dossier = corpusToDossierAdapter(corpus);

    // Community mentions should produce evidence records
    const communityEv = dossier.evidence.filter(e =>
      e.tags?.includes('community_voice')
    );
    expect(communityEv.length).toBeGreaterThan(0);

    // Should have corresponding source records
    for (const ev of communityEv) {
      const source = dossier.sources.find(s => s.source_id === ev.source_id);
      expect(source).toBeDefined();
    }

    // Community evidence should appear in customer_and_personas.evidence_ids
    const customerEvIds = dossier.customer_and_personas.evidence_ids;
    expect(communityEv.some(ev => customerEvIds.includes(ev.evidence_id))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Enrichment adapter integration (Change 6)
// ---------------------------------------------------------------------------

describe('corpusToDossierAdapter — enrichment merge', () => {
  function makeEnrichment(overrides?: Partial<EnrichmentResult['fields']>): EnrichmentResult {
    return {
      extracted_at: new Date().toISOString(),
      model: 'claude-haiku-4-5-20251001',
      latency_ms: 500,
      fallback: false,
      fields: {
        category: 'Developer Tools',
        company_stage: 'series-a',
        founded_year: 2020,
        leadership: [{ name: 'Jane Smith', role: 'CEO' }],
        competitors: [{ name: 'Competitor Co', domain: 'competitor.com', evidence_id: 'ext_0' }],
        pricing_signals: ['usage-based pricing'],
        delivery_model: ['SaaS'],
        customer_pain_themes: ['deployment speed'],
        acquisition_channels: ['PLG'],
        narrative_gaps: null,
        value_alignment_summary: null,
        ...overrides,
      },
      provenance: {
        fields_extracted: 9,
        fields_null: 2,
        fields_rejected_provenance: 0,
        rejected_details: [],
      },
    };
  }

  it('merges enriched fields into dossier', () => {
    const siteCorpus = {
      domain: 'example.com',
      fetched_at: new Date().toISOString(),
      pages: MANDATORY_PAGES,
      fetch_metadata: { attempted_pages: [], failed_pages: [], total_tokens: 100 },
    };
    const externalCorpus = {
      company: 'Example',
      gathered_at: new Date().toISOString(),
      sources: [
        makeExternalSource('competitor_search_snippet'),
        makeExternalSource('review_trustpilot', { excerpt: 'Good product but deployment speed needs improvement.' }),
      ],
      source_metadata: { source_types_attempted: [], source_types_successful: [], search_queries_used: [] },
    };

    const corpus = mergeResearchCorpus(siteCorpus, externalCorpus);
    const enrichment = makeEnrichment();
    const dossier = corpusToDossierAdapter(corpus, enrichment);

    expect(dossier.company_profile.category).toBe('Developer Tools');
    expect(dossier.company_profile.company_stage.value).toBe('series-a');
    expect(dossier.company_profile.founded_year).toBe(2020);
    expect(dossier.company_profile.leadership.length).toBe(1);
    expect(dossier.product_and_offer.pricing_signals).toContain('usage-based pricing');
    expect(dossier.product_and_offer.delivery_model).toContain('SaaS');
    expect(dossier.gtm_model.acquisition_channels).toContain('PLG');
    expect(dossier.customer_and_personas.customer_pain_themes).toContain('deployment speed');
    // Enriched competitor
    expect(dossier.competitors.direct_competitors[0]!.name).toBe('Competitor Co');
  });

  it('produces identical output without enrichment', () => {
    const siteCorpus = {
      domain: 'example.com',
      fetched_at: new Date().toISOString(),
      pages: MANDATORY_PAGES,
      fetch_metadata: { attempted_pages: [], failed_pages: [], total_tokens: 100 },
    };
    const externalCorpus = {
      company: 'Example',
      gathered_at: new Date().toISOString(),
      sources: [],
      source_metadata: { source_types_attempted: [], source_types_successful: [], search_queries_used: [] },
    };

    const corpus = mergeResearchCorpus(siteCorpus, externalCorpus);
    const dossier = corpusToDossierAdapter(corpus);

    // Without enrichment, fields should be empty defaults
    expect(dossier.company_profile.category).toBe('');
    expect(dossier.company_profile.company_stage.value).toBe('');
    expect(dossier.company_profile.founded_year).toBeNull();
    expect(dossier.company_profile.leadership).toEqual([]);
    expect(dossier.product_and_offer.pricing_signals).toEqual([]);
    expect(dossier.product_and_offer.delivery_model).toEqual([]);
    expect(dossier.gtm_model.acquisition_channels).toEqual([]);
  });

  it('handles fallback enrichment (all null fields)', () => {
    const siteCorpus = {
      domain: 'example.com',
      fetched_at: new Date().toISOString(),
      pages: MANDATORY_PAGES,
      fetch_metadata: { attempted_pages: [], failed_pages: [], total_tokens: 100 },
    };
    const externalCorpus = {
      company: 'Example',
      gathered_at: new Date().toISOString(),
      sources: [],
      source_metadata: { source_types_attempted: [], source_types_successful: [], search_queries_used: [] },
    };

    const corpus = mergeResearchCorpus(siteCorpus, externalCorpus);
    const fallbackEnrichment = makeEnrichment({
      category: null,
      company_stage: null,
      founded_year: null,
      leadership: null,
      competitors: null,
      pricing_signals: null,
      delivery_model: null,
      customer_pain_themes: null,
      acquisition_channels: null,
    });
    fallbackEnrichment.fallback = true;

    const dossier = corpusToDossierAdapter(corpus, fallbackEnrichment);

    // Null enrichment fields → empty defaults
    expect(dossier.company_profile.category).toBe('');
    expect(dossier.company_profile.leadership).toEqual([]);
    expect(dossier.product_and_offer.pricing_signals).toEqual([]);
  });
});
