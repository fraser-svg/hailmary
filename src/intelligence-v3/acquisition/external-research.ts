/**
 * External Research Acquisition — V3-U2
 * Spec: docs/specs/intelligence-engine-v3/002_pipeline_architecture.md#v3-u2
 *
 * Two modes:
 *   Mode A (fixture/manual): caller supplies pre-loaded ExternalSource objects
 *   Mode B (provider): caller supplies an ExternalResearchProvider for live search
 *
 * If neither is supplied, returns an empty corpus with WARN_EXTERNAL_RESEARCH_SPARSE.
 * Pipeline does not abort on sparse external research — site corpus alone may be sufficient.
 *
 * Sources (priority order per spec):
 *   1. Reviews — Trustpilot (fetchable), G2/Capterra (search snippets only)
 *   2. Press mentions — news search, last 24 months
 *   3. Competitor positioning — 2-3 direct competitors, search snippets
 *   4. Investor/funding mentions — Crunchbase snippets, funding announcements
 *   5. LinkedIn company page — search snippet only
 *
 * Warnings (non-fatal):
 *   WARN_EXTERNAL_RESEARCH_SPARSE — no external sources return results
 */

import type { ExternalCorpus, ExternalSource, ExternalSourceType } from '../types/research-corpus.js';
import { now } from '../../utils/timestamps.js';

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

/**
 * Pluggable provider for external research.
 * Future: Perplexity API integration.
 */
export interface ExternalResearchProvider {
  /**
   * Search for external sources of a given type.
   * Returns [] if no results — must not throw for empty results.
   */
  search(query: string, sourceType: ExternalSourceType): Promise<ExternalSource[]>;
}

// ---------------------------------------------------------------------------
// Input contract
// ---------------------------------------------------------------------------

export interface ExternalResearchAcquisitionInput {
  company: string;
  domain: string;
  /**
   * Mode A — fixture/manual.
   * Supply pre-loaded ExternalSource objects. Used for tests and offline runs.
   */
  fixture_sources?: ExternalSource[];
  /**
   * Mode B — provider.
   * Supply an ExternalResearchProvider to query live.
   * If absent, the function falls back to fixture_sources or returns an empty corpus.
   */
  provider?: ExternalResearchProvider;
}

// ---------------------------------------------------------------------------
// Source type priority order (per spec V3-U2)
// ---------------------------------------------------------------------------

const SOURCE_TYPE_PRIORITY: ExternalSourceType[] = [
  'review_trustpilot',
  'review_g2_snippet',
  'review_capterra_snippet',
  'press_mention',
  'competitor_search_snippet',
  'funding_announcement',
  'linkedin_snippet',
  'investor_mention',
];

// ---------------------------------------------------------------------------
// Mode A — fixture / manual
// ---------------------------------------------------------------------------

function loadFromFixture(
  company: string,
  fixtureSources: ExternalSource[],
): ExternalCorpus {
  if (fixtureSources.length === 0) {
    console.warn('WARN_EXTERNAL_RESEARCH_SPARSE: no external sources provided in fixture');
  }

  const sourceTypesSuccessful = [
    ...new Set(fixtureSources.map(s => s.source_type)),
  ] as ExternalSourceType[];

  return {
    company,
    gathered_at: now(),
    sources: fixtureSources,
    source_metadata: {
      // In fixture mode we report all types as "attempted" since we don't track actuals
      source_types_attempted: SOURCE_TYPE_PRIORITY,
      source_types_successful: sourceTypesSuccessful,
      search_queries_used: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Mode B — provider
// ---------------------------------------------------------------------------

async function fetchFromProvider(
  company: string,
  domain: string,
  provider: ExternalResearchProvider,
): Promise<ExternalCorpus> {
  const allSources: ExternalSource[] = [];
  const queriesUsed: string[] = [];
  const sourceTypesAttempted: ExternalSourceType[] = [];
  const sourceTypesSuccessful: ExternalSourceType[] = [];

  // TODO: Make queries configurable and extend with domain-aware variants
  const queryMap: Array<[ExternalSourceType, string]> = [
    ['review_trustpilot', `${company} reviews site:trustpilot.com`],
    ['review_g2_snippet', `${company} reviews site:g2.com`],
    ['review_capterra_snippet', `${company} reviews site:capterra.com`],
    ['press_mention', `${company} ${domain} news coverage`],
    ['competitor_search_snippet', `${company} competitors alternatives`],
    ['funding_announcement', `${company} funding round investment`],
    ['linkedin_snippet', `${company} linkedin company`],
    ['investor_mention', `${company} investors crunchbase`],
  ];

  for (const [sourceType, query] of queryMap) {
    sourceTypesAttempted.push(sourceType);
    queriesUsed.push(query);

    try {
      const sources = await provider.search(query, sourceType);
      if (sources.length > 0) {
        allSources.push(...sources);
        sourceTypesSuccessful.push(sourceType);
      }
    } catch (err) {
      // Non-fatal — individual source type failure does not abort the pipeline
      console.warn(
        `WARN_EXTERNAL_RESEARCH_SPARSE: provider search failed for ${sourceType}: ${String(err)}`,
      );
    }
  }

  if (allSources.length === 0) {
    console.warn('WARN_EXTERNAL_RESEARCH_SPARSE: no external sources returned results');
  }

  return {
    company,
    gathered_at: now(),
    sources: allSources,
    source_metadata: {
      source_types_attempted: sourceTypesAttempted,
      source_types_successful: sourceTypesSuccessful,
      search_queries_used: queriesUsed,
    },
  };
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function externalResearchAcquisition(
  input: ExternalResearchAcquisitionInput,
): Promise<ExternalCorpus> {
  if (input.fixture_sources !== undefined) {
    // Mode A: fixture/manual
    return loadFromFixture(input.company, input.fixture_sources);
  }

  if (input.provider !== undefined) {
    // Mode B: live provider
    return fetchFromProvider(input.company, input.domain, input.provider);
  }

  // Neither configured — return empty corpus (non-fatal per spec)
  console.warn('WARN_EXTERNAL_RESEARCH_SPARSE: no provider or fixture_sources configured');
  return {
    company: input.company,
    gathered_at: now(),
    sources: [],
    source_metadata: {
      source_types_attempted: [],
      source_types_successful: [],
      search_queries_used: [],
    },
  };
}
