/**
 * Counter-Narrative Integration Tests (Spec 008 — Amendment 3)
 *
 * Scoped to corpusToDossierAdapter() output ONLY.
 * Does NOT call buildEvidencePack() — a 2-record fixture would throw
 * ERR_EVIDENCE_PACK_INSUFFICIENT (requires ≥5 qualifying records).
 * The counter_narrative role assignment is already covered by evidence-pack.test.ts.
 *
 * These tests assert what Spec 008 actually adds:
 *   - CN source types are mapped to the correct EvidenceType
 *   - Base tags are applied per source type
 *   - tagFrictionSignals() adds friction/complaint/contradiction/buyer_disappointment tags
 *   - negative_signal_depth is computed from friction/complaint-tagged evidence
 */

import { describe, it, expect } from 'vitest';
import { corpusToDossierAdapter } from '../acquisition/corpus-to-dossier.js';
import type { ResearchCorpus, CorpusPage, ExternalSource } from '../types/research-corpus.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeCorpus(overrides?: {
  site_pages?: CorpusPage[];
  external_sources?: ExternalSource[];
}): ResearchCorpus {
  return {
    company_id: 'test-co',
    domain: 'test-co.com',
    merged_at: new Date().toISOString(),
    site_pages: overrides?.site_pages ?? [makeHomepage()],
    external_sources: overrides?.external_sources ?? [],
    community_mentions: [],
    founder_statements: [],
    merge_metadata: {
      total_items: 1,
      deduplicated_count: 0,
      cross_corpus_deduplicated: 0,
      tier_distribution: { 1: 1 },
      stale_item_count: 0,
    },
  };
}

function makeHomepage(): CorpusPage {
  return {
    url: 'https://test-co.com/',
    page_type: 'homepage',
    fetched_at: new Date().toISOString(),
    raw_text: 'We automate workflows for engineering teams. Fast, reliable, secure.',
    token_count: 15,
    fetch_success: true,
    source_tier: 1,
  };
}

function makeExternalSource(
  source_type: ExternalSource['source_type'],
  overrides?: Partial<ExternalSource>,
): ExternalSource {
  return {
    url: `https://example.com/${source_type}`,
    source_type,
    gathered_at: new Date().toISOString(),
    excerpt: `Sample excerpt for ${source_type}. This is a test review.`,
    token_count: 20,
    source_tier: 3,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Evidence type mapping
// ---------------------------------------------------------------------------

describe('corpusToDossierAdapter — CN evidence type mapping', () => {
  it('reddit_thread maps to pain_point_record', () => {
    const dossier = corpusToDossierAdapter(
      makeCorpus({ external_sources: [makeExternalSource('reddit_thread')] }),
    );
    const ev = dossier.evidence.find(e => e.evidence_type === 'pain_point_record');
    expect(ev).toBeDefined();
  });

  it('hackernews_thread maps to customer_language_record', () => {
    const dossier = corpusToDossierAdapter(
      makeCorpus({ external_sources: [makeExternalSource('hackernews_thread')] }),
    );
    const ev = dossier.evidence.find(e => e.evidence_type === 'customer_language_record');
    expect(ev).toBeDefined();
  });

  it('github_issues_snippet maps to pain_point_record', () => {
    const dossier = corpusToDossierAdapter(
      makeCorpus({ external_sources: [makeExternalSource('github_issues_snippet')] }),
    );
    const ev = dossier.evidence.find(e => e.evidence_type === 'pain_point_record');
    expect(ev).toBeDefined();
  });

  it('comparison_article maps to comparison_record', () => {
    const dossier = corpusToDossierAdapter(
      makeCorpus({ external_sources: [makeExternalSource('comparison_article')] }),
    );
    const ev = dossier.evidence.find(e => e.evidence_type === 'comparison_record');
    expect(ev).toBeDefined();
  });

  it('critical_review maps to review_record', () => {
    const dossier = corpusToDossierAdapter(
      makeCorpus({ external_sources: [makeExternalSource('critical_review')] }),
    );
    const ev = dossier.evidence.find(e => e.evidence_type === 'review_record');
    expect(ev).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Base tag assignment per source type
// ---------------------------------------------------------------------------

describe('corpusToDossierAdapter — CN base tags', () => {
  it('reddit_thread gets community_voice + buyer_language base tags', () => {
    const dossier = corpusToDossierAdapter(
      makeCorpus({ external_sources: [makeExternalSource('reddit_thread')] }),
    );
    const ev = dossier.evidence.find(e =>
      (e.tags ?? []).includes('reddit_thread'),
    )!;
    expect(ev.tags).toContain('community_voice');
    expect(ev.tags).toContain('buyer_language');
  });

  it('hackernews_thread gets community_voice + developer_voice base tags', () => {
    const dossier = corpusToDossierAdapter(
      makeCorpus({ external_sources: [makeExternalSource('hackernews_thread')] }),
    );
    const ev = dossier.evidence.find(e =>
      (e.tags ?? []).includes('hackernews_thread'),
    )!;
    expect(ev.tags).toContain('community_voice');
    expect(ev.tags).toContain('developer_voice');
  });

  it('github_issues_snippet gets developer_voice + product_friction base tags', () => {
    const dossier = corpusToDossierAdapter(
      makeCorpus({ external_sources: [makeExternalSource('github_issues_snippet')] }),
    );
    const ev = dossier.evidence.find(e =>
      (e.tags ?? []).includes('github_issues_snippet'),
    )!;
    expect(ev.tags).toContain('developer_voice');
    expect(ev.tags).toContain('product_friction');
  });

  it('comparison_article gets competitor_positioning + buyer_language base tags', () => {
    const dossier = corpusToDossierAdapter(
      makeCorpus({ external_sources: [makeExternalSource('comparison_article')] }),
    );
    const ev = dossier.evidence.find(e =>
      (e.tags ?? []).includes('comparison_article'),
    )!;
    expect(ev.tags).toContain('competitor_positioning');
    expect(ev.tags).toContain('buyer_language');
  });

  it('critical_review gets customer_voice + buyer_language base tags', () => {
    const dossier = corpusToDossierAdapter(
      makeCorpus({ external_sources: [makeExternalSource('critical_review')] }),
    );
    const ev = dossier.evidence.find(e =>
      (e.tags ?? []).includes('critical_review'),
    )!;
    expect(ev.tags).toContain('customer_voice');
    expect(ev.tags).toContain('buyer_language');
  });
});

// ---------------------------------------------------------------------------
// Core integration: reddit_thread with friction excerpt → pain_point_record
// ---------------------------------------------------------------------------

describe('corpusToDossierAdapter — reddit_thread friction tagging', () => {
  it('reddit_thread source with friction excerpt produces pain_point_record with friction tag', () => {
    const dossier = corpusToDossierAdapter(
      makeCorpus({
        external_sources: [
          makeExternalSource('reddit_thread', {
            excerpt: 'The app is completely broken after the latest update.',
          }),
        ],
      }),
    );

    const ev = dossier.evidence.find(e => e.evidence_type === 'pain_point_record');
    expect(ev).toBeDefined();
    expect(ev!.tags).toContain('friction');
    expect(ev!.tags).toContain('community_voice');
    expect(ev!.is_inferred).toBe(false);
    // Tier 3 → 'medium'
    expect(ev!.source_quality).toBe('medium');
  });

  it('reddit_thread with complaint excerpt gets complaint tag', () => {
    const dossier = corpusToDossierAdapter(
      makeCorpus({
        external_sources: [
          makeExternalSource('reddit_thread', {
            excerpt: 'Disappointed with the product, not recommended.',
          }),
        ],
      }),
    );
    const ev = dossier.evidence.find(e =>
      (e.tags ?? []).includes('reddit_thread'),
    )!;
    expect(ev.tags).toContain('complaint');
  });

  it('reddit_thread with both friction + complaint gets buyer_disappointment tag', () => {
    const dossier = corpusToDossierAdapter(
      makeCorpus({
        external_sources: [
          makeExternalSource('reddit_thread', {
            excerpt: 'Broken and terrible, avoid this product.',
          }),
        ],
      }),
    );
    const ev = dossier.evidence.find(e =>
      (e.tags ?? []).includes('reddit_thread'),
    )!;
    expect(ev.tags).toContain('friction');
    expect(ev.tags).toContain('complaint');
    expect(ev.tags).toContain('buyer_disappointment');
  });

  it('reddit_thread with neutral excerpt gets no friction/complaint tags', () => {
    const dossier = corpusToDossierAdapter(
      makeCorpus({
        external_sources: [
          makeExternalSource('reddit_thread', {
            excerpt: 'Great product, works perfectly for our team.',
          }),
        ],
      }),
    );
    const ev = dossier.evidence.find(e =>
      (e.tags ?? []).includes('reddit_thread'),
    )!;
    expect(ev.tags).not.toContain('friction');
    expect(ev.tags).not.toContain('complaint');
    expect(ev.tags).not.toContain('buyer_disappointment');
  });
});

// ---------------------------------------------------------------------------
// negative_signal_depth computation
// ---------------------------------------------------------------------------

describe('corpusToDossierAdapter — negative_signal_depth', () => {
  it('is "none" when no CN sources with friction/complaint tags', () => {
    const dossier = corpusToDossierAdapter(
      makeCorpus({
        external_sources: [
          makeExternalSource('reddit_thread', {
            excerpt: 'Great product, works well.',
          }),
        ],
      }),
    );
    expect(dossier.run_metadata.evidence_summary.negative_signal_depth).toBe('none');
  });

  it('is "thin" when 1–2 friction/complaint records', () => {
    const dossier = corpusToDossierAdapter(
      makeCorpus({
        external_sources: [
          makeExternalSource('reddit_thread', { excerpt: 'The app is broken.' }),
          makeExternalSource('critical_review', { url: 'https://example.com/cr', excerpt: 'Disappointed with it.' }),
        ],
      }),
    );
    expect(dossier.run_metadata.evidence_summary.negative_signal_depth).toBe('thin');
  });

  it('is "moderate" when 3–5 friction/complaint records', () => {
    const sources = [
      makeExternalSource('reddit_thread', { url: 'https://example.com/1', excerpt: 'broken product' }),
      makeExternalSource('reddit_thread', { url: 'https://example.com/2', excerpt: 'terrible experience' }),
      makeExternalSource('critical_review', { url: 'https://example.com/3', excerpt: 'crashes constantly' }),
    ];
    const dossier = corpusToDossierAdapter(makeCorpus({ external_sources: sources }));
    expect(dossier.run_metadata.evidence_summary.negative_signal_depth).toBe('moderate');
  });

  it('is "rich" when ≥6 friction/complaint records', () => {
    const sources = Array.from({ length: 6 }, (_, i) =>
      makeExternalSource('reddit_thread', {
        url: `https://example.com/${i}`,
        excerpt: 'broken terrible product',
      }),
    );
    const dossier = corpusToDossierAdapter(makeCorpus({ external_sources: sources }));
    expect(dossier.run_metadata.evidence_summary.negative_signal_depth).toBe('rich');
  });
});
