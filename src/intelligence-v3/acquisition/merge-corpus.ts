/**
 * Research Corpus Merge — V3-U3
 * Spec: docs/specs/intelligence-engine-v3/002_pipeline_architecture.md#v3-u3
 *
 * Deduplication rules:
 *   - Same URL fetched twice → keep the version with the higher token count
 *   - Same snippet from two search queries → deduplicate by content hash (SHA-256, 16 hex chars)
 *   - Source tier is already assigned by acquisition stages; preserved as-is
 *
 * The four-bucket ResearchCorpus structure supports future enrichment:
 *   community_mentions and founder_statements default to empty arrays in V3 initial.
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
import { now } from '../../utils/timestamps.js';
import { slugify } from '../../utils/ids.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Short content hash for deduplication — not for security. */
function contentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function deduplicateSitePages(pages: CorpusPage[]): CorpusPage[] {
  const byUrl = new Map<string, CorpusPage>();
  for (const page of pages) {
    const existing = byUrl.get(page.url);
    if (!existing || page.token_count > existing.token_count) {
      byUrl.set(page.url, page);
    }
  }
  return [...byUrl.values()];
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

  const rawTotal =
    siteCorpus.pages.length +
    externalCorpus.sources.length +
    communityMentions.length +
    founderStatements.length;

  const dedupedSitePages = deduplicateSitePages(siteCorpus.pages);
  const dedupedExternalSources = deduplicateExternalSources(externalCorpus.sources);

  const totalAfterDedup =
    dedupedSitePages.length +
    dedupedExternalSources.length +
    communityMentions.length +
    founderStatements.length;

  const tierDistribution = computeTierDistribution(
    dedupedSitePages,
    dedupedExternalSources,
    communityMentions,
    founderStatements,
  );

  // Derive company_id from domain (strip protocol + trailing slash, then slugify)
  const cleanDomain = siteCorpus.domain
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  const company_id = slugify(cleanDomain);

  return {
    company_id,
    domain: siteCorpus.domain,
    merged_at: now(),

    site_pages: dedupedSitePages,
    external_sources: dedupedExternalSources,
    community_mentions: communityMentions,
    founder_statements: founderStatements,

    merge_metadata: {
      total_items: totalAfterDedup,
      deduplicated_count: rawTotal - totalAfterDedup,
      tier_distribution: tierDistribution,
    },
  };
}
