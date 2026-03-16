/**
 * Research Corpus Merge — V3-U3
 * Spec: docs/specs/intelligence-engine-v3/002_pipeline_architecture.md#v3-u3
 *       docs/specs/intelligence-engine-v3/006_evidence_schema_v2.md
 *
 * Deduplication rules (enhanced in Spec 006):
 *   - Same URL fetched twice → keep the version with the higher token count
 *   - Same snippet from two search queries → deduplicate by content hash (SHA-256, 16 hex chars)
 *   - Cross-corpus dedup: if a Perplexity citation URL matches a Cloudflare CorpusPage URL
 *     → discard the ExternalSource (Cloudflare version is longer and has better provenance)
 *   - Canonical source_tier assigned via tier-classifier (overrides provisional tier from providers)
 *   - content_hash set on all CorpusPages after dedup
 *   - stale_item_count computed (items with published_at or captured_at > 24 months old)
 */

import { createHash } from 'node:crypto';
import type {
  SiteCorpus,
  ExternalCorpus,
  ResearchCorpus,
  CorpusPage,
  ExternalSource,
  CommunityMention,
  FounderStatement,
  SourceTier,
} from '../types/research-corpus.js';
import { classifySourceTier } from '../providers/tier-classifier.js';
import { now } from '../../utils/timestamps.js';
import { slugify } from '../../utils/ids.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Short content hash for deduplication — not for security. */
function contentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/** Normalise a URL for cross-corpus comparison.
 *  Strips protocol, www., and trailing slash. */
function normaliseUrlForDedup(url: string): string {
  try {
    const withProto = url.startsWith('http') ? url : `https://${url}`;
    const parsed = new URL(withProto);
    const host = parsed.hostname.replace(/^www\./, '');
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${host}${path}`;
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  }
}

function deduplicateSitePages(pages: CorpusPage[]): CorpusPage[] {
  const byUrl = new Map<string, CorpusPage>();
  for (const page of pages) {
    const existing = byUrl.get(page.url);
    if (!existing || page.token_count > existing.token_count) {
      byUrl.set(page.url, page);
    }
  }
  // Attach content_hash to each page after dedup
  return [...byUrl.values()].map(page => ({
    ...page,
    content_hash: contentHash(page.raw_text),
  }));
}

/** Cross-corpus dedup: remove ExternalSource records whose URL matches a CorpusPage URL.
 *  Cloudflare-rendered pages (CorpusPage) take precedence — longer text, better provenance. */
function crossCorpusDedup(
  externalSources: ExternalSource[],
  sitePages: CorpusPage[],
): { sources: ExternalSource[]; crossDedupCount: number } {
  const sitePageNormUrls = new Set(sitePages.map(p => normaliseUrlForDedup(p.url)));

  const filtered: ExternalSource[] = [];
  let crossDedupCount = 0;

  for (const source of externalSources) {
    if (source.url && sitePageNormUrls.has(normaliseUrlForDedup(source.url))) {
      crossDedupCount++;
    } else {
      filtered.push(source);
    }
  }

  return { sources: filtered, crossDedupCount };
}

function deduplicateExternalSources(sources: ExternalSource[]): ExternalSource[] {
  // Pass 1: URL dedup (keep higher token count)
  const byUrl = new Map<string, ExternalSource>();
  const noUrl: ExternalSource[] = [];
  for (const source of sources) {
    if (source.url) {
      const existing = byUrl.get(source.url);
      if (!existing || source.token_count > existing.token_count) {
        byUrl.set(source.url, source);
      }
    } else {
      noUrl.push(source);
    }
  }

  // Pass 2: content hash dedup on remaining items (url-deduped + no-url entries)
  const candidates = [...byUrl.values(), ...noUrl];
  const byHash = new Map<string, ExternalSource>();
  for (const source of candidates) {
    const hash = contentHash(source.excerpt);
    const existing = byHash.get(hash);
    if (!existing || source.token_count > existing.token_count) {
      byHash.set(hash, source);
    }
  }

  return [...byHash.values()];
}

/** Assign canonical source_tier via tier-classifier (overrides provisional tier from providers). */
function assignCanonicalTiers(
  sources: ExternalSource[],
  targetDomain: string,
): ExternalSource[] {
  return sources.map(source => ({
    ...source,
    source_tier: classifySourceTier(source.url, targetDomain),
  }));
}

function computeTierDistribution(
  sitePages: CorpusPage[],
  externalSources: ExternalSource[],
  communityMentions: CommunityMention[],
  founderStatements: FounderStatement[],
): Partial<Record<SourceTier, number>> {
  const dist: Partial<Record<SourceTier, number>> = {};

  const increment = (tier: SourceTier) => {
    dist[tier] = (dist[tier] ?? 0) + 1;
  };

  for (const p of sitePages) increment(p.source_tier);
  for (const s of externalSources) increment(s.source_tier);
  for (const m of communityMentions) increment(m.source_tier);
  for (const f of founderStatements) increment(f.source_tier);

  return dist;
}

/** Staleness threshold: 24 months before current date. */
function getStalenessCutoff(): Date {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 24);
  return cutoff;
}

function isStale(
  published_at: string | undefined,
  captured_at: string,
  cutoff: Date,
): boolean {
  if (published_at) {
    try {
      return new Date(published_at) < cutoff;
    } catch {
      // If published_at is not parseable, fall through to captured_at
    }
  }
  try {
    return new Date(captured_at) < cutoff;
  } catch {
    return false;
  }
}

/** Mark stale items with is_stale: true and return the stale count. */
function markAndCountStaleItems(
  externalSources: ExternalSource[],
  cutoff: Date,
): { marked: ExternalSource[]; count: number } {
  let count = 0;
  const marked = externalSources.map(s => {
    if (isStale(s.published_at, s.gathered_at, cutoff)) {
      count++;
      return { ...s, is_stale: true as const };
    }
    return s;
  });
  return { marked, count };
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export function mergeResearchCorpus(
  siteCorpus: SiteCorpus,
  externalCorpus: ExternalCorpus,
  options?: {
    community_mentions?: CommunityMention[];
    founder_statements?: FounderStatement[];
  },
): ResearchCorpus {
  const communityMentions = options?.community_mentions ?? [];
  const founderStatements = options?.founder_statements ?? [];

  // Normalise domain for tier classifier (strip protocol and trailing slash)
  const targetDomain = siteCorpus.domain
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');

  const rawTotal =
    siteCorpus.pages.length +
    externalCorpus.sources.length +
    communityMentions.length +
    founderStatements.length;

  // Step 1: Dedup site pages + attach content_hash
  const dedupedSitePages = deduplicateSitePages(siteCorpus.pages);

  // Step 2: Cross-corpus dedup — remove ExternalSources whose URL matches a CorpusPage
  const { sources: crossDedupedSources, crossDedupCount } = crossCorpusDedup(
    externalCorpus.sources,
    dedupedSitePages,
  );

  // Step 3: URL + content-hash dedup within external sources
  const dedupedExternalSources = deduplicateExternalSources(crossDedupedSources);

  // Step 4: Assign canonical source tiers via tier-classifier
  const tieredExternalSources = assignCanonicalTiers(dedupedExternalSources, targetDomain);

  const totalAfterDedup =
    dedupedSitePages.length +
    tieredExternalSources.length +
    communityMentions.length +
    founderStatements.length;

  // Step 5: Mark stale items and count them
  const stalenessCutoff = getStalenessCutoff();
  const { marked: markedExternalSources, count: staleItemCount } =
    markAndCountStaleItems(tieredExternalSources, stalenessCutoff);

  const tierDistribution = computeTierDistribution(
    dedupedSitePages,
    markedExternalSources,
    communityMentions,
    founderStatements,
  );

  // Derive company_id from domain
  const cleanDomain = targetDomain;
  const company_id = slugify(cleanDomain);

  return {
    company_id,
    domain: siteCorpus.domain,
    merged_at: now(),

    site_pages: dedupedSitePages,
    external_sources: markedExternalSources,
    community_mentions: communityMentions,
    founder_statements: founderStatements,

    merge_metadata: {
      total_items: totalAfterDedup,
      deduplicated_count: rawTotal - totalAfterDedup,
      cross_corpus_deduplicated: crossDedupCount,
      tier_distribution: tierDistribution,
      stale_item_count: staleItemCount,
    },
  };
}
