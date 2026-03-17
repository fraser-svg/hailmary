/**
 * Enrichment Tests — V3-U3.5
 *
 * Tests for enrichCorpus(), selectEvidenceItems(), checkProvenance(),
 * and the integration of enrichment into corpus-to-dossier adapter.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  enrichCorpus,
  selectEvidenceItems,
  checkProvenance,
  stripCodeFences,
  hasProvenance,
} from '../acquisition/enrich-corpus.js';
import type { CorpusItem, RawFields } from '../acquisition/enrich-corpus.js';
import type { ResearchCorpus, CorpusPage, ExternalSource, CommunityMention } from '../types/research-corpus.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCorpusPage(overrides?: Partial<CorpusPage>): CorpusPage {
  return {
    url: 'https://example.com/',
    page_type: 'homepage',
    fetched_at: new Date().toISOString(),
    raw_text: 'Acme Corp builds developer tools for CI/CD pipelines. Founded in 2019 by Jane Smith.',
    token_count: 50,
    fetch_success: true,
    source_tier: 1,
    ...overrides,
  };
}

function makeExternalSource(overrides?: Partial<ExternalSource>): ExternalSource {
  return {
    url: 'https://trustpilot.com/review/acme',
    source_type: 'review_trustpilot',
    gathered_at: new Date().toISOString(),
    excerpt: 'Acme is great but the pricing is confusing and support is slow.',
    token_count: 30,
    source_tier: 3,
    ...overrides,
  };
}

function makeCommunityMention(overrides?: Partial<CommunityMention>): CommunityMention {
  return {
    url: 'https://reddit.com/r/devops/acme-review',
    platform: 'reddit',
    gathered_at: new Date().toISOString(),
    excerpt: 'Switched from Acme to BuildKite because Acme kept crashing during peak deploys.',
    source_tier: 3,
    ...overrides,
  };
}

function makeMinimalCorpus(overrides?: Partial<ResearchCorpus>): ResearchCorpus {
  return {
    company_id: 'acme-com',
    domain: 'acme.com',
    merged_at: new Date().toISOString(),
    site_pages: [makeCorpusPage()],
    external_sources: [makeExternalSource()],
    community_mentions: [makeCommunityMention()],
    founder_statements: [],
    merge_metadata: {
      total_items: 3,
      deduplicated_count: 0,
      cross_corpus_deduplicated: 0,
      tier_distribution: { 1: 1, 3: 2 },
      stale_item_count: 0,
    },
    ...overrides,
  };
}

// Mock Anthropic client that returns valid JSON
function makeMockClient(responseJson: Record<string, unknown>) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(responseJson) }],
      }),
    },
  } as unknown as import('@anthropic-ai/sdk').default;
}

// Mock client that returns JSON wrapped in markdown fences
function makeFencedMockClient(responseJson: Record<string, unknown>) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '```json\n' + JSON.stringify(responseJson) + '\n```' }],
      }),
    },
  } as unknown as import('@anthropic-ai/sdk').default;
}

// Mock client that times out
function makeTimeoutClient() {
  return {
    messages: {
      create: vi.fn().mockImplementation(() => new Promise((_resolve, _reject) => {
        // Never resolves — will be caught by the timeout race
      })),
    },
  } as unknown as import('@anthropic-ai/sdk').default;
}

// Mock client that returns refusal
function makeRefusalClient() {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: "I'm sorry, I cannot extract data from this content." }],
      }),
    },
  } as unknown as import('@anthropic-ai/sdk').default;
}

const VALID_ENRICHMENT_RESPONSE = {
  category: 'Developer Tools',
  company_stage: 'seed',
  founded_year: 2019,
  leadership: [{ name: 'Jane Smith', role: 'CEO' }],
  competitors: [{ name: 'BuildKite', domain: 'buildkite.com' }],
  pricing_signals: ['free tier available', 'usage-based pricing'],
  delivery_model: ['SaaS', 'API'],
  customer_pain_themes: ['CI/CD reliability', 'deploy speed'],
  acquisition_channels: ['PLG', 'organic search'],
  narrative_gaps: null,
  value_alignment_summary: null,
};

// ---------------------------------------------------------------------------
// selectEvidenceItems
// ---------------------------------------------------------------------------

describe('selectEvidenceItems', () => {
  it('returns items from all corpus buckets', () => {
    const corpus = makeMinimalCorpus();
    const items = selectEvidenceItems(corpus);
    expect(items.length).toBe(3);
    expect(items.some(i => i.id.startsWith('site_'))).toBe(true);
    expect(items.some(i => i.id.startsWith('ext_'))).toBe(true);
    expect(items.some(i => i.id.startsWith('comm_'))).toBe(true);
  });

  it('caps at 20 items', () => {
    const corpus = makeMinimalCorpus({
      site_pages: Array.from({ length: 10 }, (_, i) =>
        makeCorpusPage({ url: `https://example.com/page-${i}`, page_type: 'blog' })
      ),
      external_sources: Array.from({ length: 15 }, (_, i) =>
        makeExternalSource({ url: `https://review.com/${i}` })
      ),
    });
    const items = selectEvidenceItems(corpus);
    expect(items.length).toBe(20);
  });

  it('prioritizes Tier 3 over Tier 1', () => {
    const corpus = makeMinimalCorpus({
      site_pages: Array.from({ length: 15 }, (_, i) =>
        makeCorpusPage({ url: `https://example.com/page-${i}`, page_type: 'blog' })
      ),
      external_sources: Array.from({ length: 10 }, (_, i) =>
        makeExternalSource({ url: `https://review.com/${i}`, source_tier: 3 })
      ),
      community_mentions: [], // exclude community to isolate tier priority
    });
    const items = selectEvidenceItems(corpus);
    // All 10 Tier 3 items should be included (prioritized), capped at 20 total
    const tier3Count = items.filter(i => i.tier === 3).length;
    expect(tier3Count).toBe(10);
    // Remaining 10 should be Tier 1
    const tier1Count = items.filter(i => i.tier === 1).length;
    expect(tier1Count).toBe(10);
  });

  it('returns empty for empty corpus', () => {
    const corpus = makeMinimalCorpus({
      site_pages: [],
      external_sources: [],
      community_mentions: [],
    });
    const items = selectEvidenceItems(corpus);
    expect(items.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// hasProvenance
// ---------------------------------------------------------------------------

describe('hasProvenance', () => {
  it('matches case-insensitively', () => {
    expect(hasProvenance('Jane Smith', ['JANE SMITH is the CEO'])).toBe(true);
    expect(hasProvenance('JANE SMITH', ['jane smith is the CEO'])).toBe(true);
  });

  it('returns false when not found', () => {
    expect(hasProvenance('Bob Johnson', ['Jane Smith is the CEO'])).toBe(false);
  });

  it('matches substrings', () => {
    expect(hasProvenance('BuildKite', ['Switched from Acme to BuildKite'])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// stripCodeFences
// ---------------------------------------------------------------------------

describe('stripCodeFences', () => {
  it('strips ```json fences', () => {
    expect(stripCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips ``` fences without language', () => {
    expect(stripCodeFences('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('returns clean JSON unchanged', () => {
    expect(stripCodeFences('{"a":1}')).toBe('{"a":1}');
  });
});

// ---------------------------------------------------------------------------
// checkProvenance
// ---------------------------------------------------------------------------

describe('checkProvenance', () => {
  const corpusTexts = [
    'Acme Corp builds developer tools. Founded in 2019 by Jane Smith.',
    'BuildKite is a competitor. Pricing is confusing.',
  ];
  const evidenceItemIds = new Set(['site_0', 'ext_0']);

  it('passes through valid simple fields', () => {
    const raw: RawFields = {
      category: 'Developer Tools',
      company_stage: 'seed',
      founded_year: 2019,
    };
    const { fields, provenance } = checkProvenance(raw, corpusTexts, evidenceItemIds);
    expect(fields.category).toBe('Developer Tools');
    expect(fields.company_stage).toBe('seed');
    expect(fields.founded_year).toBe(2019);
    expect(provenance.fields_extracted).toBe(3);
  });

  it('rejects leadership names not in corpus', () => {
    const raw: RawFields = {
      leadership: [
        { name: 'Jane Smith', role: 'CEO' },
        { name: 'Bob Hallucinated', role: 'CTO' },
      ],
    };
    const { fields, provenance } = checkProvenance(raw, corpusTexts, evidenceItemIds);
    expect(fields.leadership).toHaveLength(1);
    expect(fields.leadership![0]!.name).toBe('Jane Smith');
    expect(provenance.fields_rejected_provenance).toBe(1);
    expect(provenance.rejected_details[0]!.field).toBe('leadership');
  });

  it('rejects competitor names not in corpus', () => {
    const raw: RawFields = {
      competitors: [
        { name: 'BuildKite', domain: 'buildkite.com' },
        { name: 'FakeCompany', domain: 'fake.com' },
      ],
    };
    const { fields, provenance } = checkProvenance(raw, corpusTexts, evidenceItemIds);
    expect(fields.competitors).toHaveLength(1);
    expect(fields.competitors![0]!.name).toBe('BuildKite');
    expect(provenance.fields_rejected_provenance).toBe(1);
  });

  it('returns null for invalid founded_year', () => {
    const raw: RawFields = { founded_year: 1800 };
    const { fields } = checkProvenance(raw, corpusTexts, evidenceItemIds);
    expect(fields.founded_year).toBeNull();
  });

  it('filters invalid evidence_ids in narrative_gaps', () => {
    const raw: RawFields = {
      narrative_gaps: [{
        gap_name: 'Test Gap',
        gap_description: 'A test gap',
        company_language: ['we build tools'],
        customer_language: ['tools are broken'],
        likely_business_impact: ['churn'],
        suggested_repositioning_direction: 'fix it',
        evidence_ids: ['site_0', 'nonexistent_id'],
        confidence: 'medium',
      }],
    };
    const { fields } = checkProvenance(raw, corpusTexts, evidenceItemIds);
    expect(fields.narrative_gaps).toHaveLength(1);
    expect(fields.narrative_gaps![0]!.evidence_ids).toEqual(['site_0']);
  });

  it('validates value_alignment_summary alignment enum', () => {
    const raw: RawFields = {
      value_alignment_summary: [
        { theme: 'speed', alignment: 'aligned', company_language: [], customer_language: [], business_implication: 'good', evidence_ids: [], confidence: 'high' },
        { theme: 'bad', alignment: 'invalid_value', company_language: [], customer_language: [], business_implication: '', evidence_ids: [], confidence: 'low' },
      ],
    };
    const { fields } = checkProvenance(raw, corpusTexts, evidenceItemIds);
    expect(fields.value_alignment_summary).toHaveLength(1);
    expect(fields.value_alignment_summary![0]!.theme).toBe('speed');
  });
});

// ---------------------------------------------------------------------------
// enrichCorpus (integration)
// ---------------------------------------------------------------------------

describe('enrichCorpus', () => {
  it('returns enriched fields from mock client', async () => {
    const corpus = makeMinimalCorpus();
    const client = makeMockClient(VALID_ENRICHMENT_RESPONSE);
    const result = await enrichCorpus(corpus, 'Acme', { client });

    expect(result.fallback).toBe(false);
    expect(result.fields.category).toBe('Developer Tools');
    expect(result.fields.founded_year).toBe(2019);
    // Jane Smith is in corpus text → passes provenance
    expect(result.fields.leadership).toHaveLength(1);
    // BuildKite is in community mention text → passes provenance
    expect(result.fields.competitors).toHaveLength(1);
    expect(result.fields.pricing_signals).toEqual(['free tier available', 'usage-based pricing']);
    expect(result.provenance.fields_extracted).toBeGreaterThan(0);
  });

  it('handles markdown-fenced JSON response', async () => {
    const corpus = makeMinimalCorpus();
    const client = makeFencedMockClient(VALID_ENRICHMENT_RESPONSE);
    const result = await enrichCorpus(corpus, 'Acme', { client });

    expect(result.fallback).toBe(false);
    expect(result.fields.category).toBe('Developer Tools');
  });

  it('returns fallback on timeout', async () => {
    const corpus = makeMinimalCorpus();
    const client = makeTimeoutClient();
    const result = await enrichCorpus(corpus, 'Acme', { client, timeout_ms: 50 });

    expect(result.fallback).toBe(true);
    expect(result.fields.category).toBeNull();
  });

  it('returns fallback on LLM refusal', async () => {
    const corpus = makeMinimalCorpus();
    const client = makeRefusalClient();
    const result = await enrichCorpus(corpus, 'Acme', { client });

    expect(result.fallback).toBe(true);
  });

  it('returns fallback on empty corpus', async () => {
    const corpus = makeMinimalCorpus({
      site_pages: [],
      external_sources: [],
      community_mentions: [],
    });
    const client = makeMockClient(VALID_ENRICHMENT_RESPONSE);
    const result = await enrichCorpus(corpus, 'Acme', { client });

    expect(result.fallback).toBe(true);
    // Client should NOT have been called
    expect(client.messages.create).not.toHaveBeenCalled();
  });

  it('returns fallback when no client and no API key', async () => {
    const origKey = process.env['ANTHROPIC_API_KEY'];
    delete process.env['ANTHROPIC_API_KEY'];
    try {
      const corpus = makeMinimalCorpus();
      const result = await enrichCorpus(corpus, 'Acme', {});
      expect(result.fallback).toBe(true);
    } finally {
      if (origKey) process.env['ANTHROPIC_API_KEY'] = origKey;
    }
  });

  it('rejects hallucinated names not in corpus', async () => {
    const corpus = makeMinimalCorpus();
    const response = {
      ...VALID_ENRICHMENT_RESPONSE,
      leadership: [{ name: 'Totally Made Up Person', role: 'CEO' }],
      competitors: [{ name: 'Nonexistent Inc', domain: 'nonexistent.com' }],
    };
    const client = makeMockClient(response);
    const result = await enrichCorpus(corpus, 'Acme', { client });

    expect(result.fallback).toBe(false);
    // Hallucinated names should be rejected
    expect(result.fields.leadership).toBeNull();
    expect(result.fields.competitors).toBeNull();
    expect(result.provenance.fields_rejected_provenance).toBeGreaterThan(0);
  });

  it('handles malformed JSON gracefully', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'not valid json at all {{{}' }],
        }),
      },
    } as unknown as import('@anthropic-ai/sdk').default;
    const corpus = makeMinimalCorpus();
    const result = await enrichCorpus(corpus, 'Acme', { client });

    expect(result.fallback).toBe(true);
  });

  it('handles partial enrichment (some null fields)', async () => {
    const response = {
      category: 'Developer Tools',
      company_stage: null,
      founded_year: null,
      leadership: null,
      competitors: null,
      pricing_signals: null,
      delivery_model: ['SaaS'],
      customer_pain_themes: null,
      acquisition_channels: null,
      narrative_gaps: null,
      value_alignment_summary: null,
    };
    const client = makeMockClient(response);
    const corpus = makeMinimalCorpus();
    const result = await enrichCorpus(corpus, 'Acme', { client });

    expect(result.fallback).toBe(false);
    expect(result.fields.category).toBe('Developer Tools');
    expect(result.fields.delivery_model).toEqual(['SaaS']);
    expect(result.fields.company_stage).toBeNull();
    expect(result.provenance.fields_null).toBeGreaterThan(0);
    expect(result.provenance.fields_extracted).toBeGreaterThan(0);
  });
});
