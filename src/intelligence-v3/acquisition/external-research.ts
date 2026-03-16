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
import { filterExternalSources } from './source-filter.js';
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
// Query builder — exported for tests
// ---------------------------------------------------------------------------

/**
 * Build the Perplexity query map for a given company + domain.
 *
 * Disambiguation strategy:
 *   - Review queries use domain as primary anchor (e.g. "trigger.dev") rather
 *     than company name alone, because domain names are unique identifiers
 *     whereas company names can be generic keywords ("Trigger", "Relay", etc.)
 *   - Press / competitor / funding / investor queries use both company name AND
 *     domain for dual-anchor disambiguation.
 *
 * This is intentionally a pure function so it can be unit-tested.
 */
export function buildQueryMap(
  company: string,
  domain: string,
): Array<[ExternalSourceType, string]> {
  return [
    // Review sites: domain is the most specific, unambiguous anchor.
    // Using "trigger.dev" rather than "Trigger.dev" avoids matching unrelated
    // pages that mention "Trigger" (PM software, automation concepts, etc.).
    ['review_trustpilot', `"${domain}" reviews site:trustpilot.com`],
    ['review_g2_snippet', `"${domain}" reviews site:g2.com`],
    ['review_capterra_snippet', `"${domain}" reviews site:capterra.com`],

    // Press: both company name and domain for dual-anchor disambiguation.
    ['press_mention', `"${company}" "${domain}" news announcement`],

    // Competitors: domain anchor + explicit alternatives framing.
    ['competitor_search_snippet', `"${company}" "${domain}" competitors alternatives vs`],

    // Funding: company + domain + investment terms.
    ['funding_announcement', `"${company}" "${domain}" funding investment round`],

    // LinkedIn: company + domain (avoids generic company-name pages).
    ['linkedin_snippet', `"${company}" "${domain}" linkedin`],

    // Investors: company + domain + key funding databases.
    ['investor_mention', `"${company}" "${domain}" investors ycombinator crunchbase`],
  ];
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
  let totalBeforeFilter = 0;
  let totalOwnDomainRejected = 0;
  let totalNoMatchRejected = 0;

  const queryMap = buildQueryMap(company, domain);

  for (const [sourceType, query] of queryMap) {
    sourceTypesAttempted.push(sourceType);
    queriesUsed.push(query);

    try {
      const raw = await provider.search(query, sourceType);
      totalBeforeFilter += raw.length;

      // Apply company-relevance filter to each batch before accepting
      const { accepted, own_domain_count, no_match_count } = filterExternalSources(raw, {
        company,
        domain,
      });

      totalOwnDomainRejected += own_domain_count;
      totalNoMatchRejected += no_match_count;

      if (own_domain_count > 0) {
        console.warn(
          `WARN_OWN_DOMAIN_FILTERED: ${own_domain_count} own-domain source(s) removed from ${sourceType}`,
        );
      }
      if (no_match_count > 0) {
        console.warn(
          `WARN_COMPANY_MISMATCH_FILTERED: ${no_match_count} irrelevant source(s) removed from ${sourceType}`,
        );
      }

      if (accepted.length > 0) {
        allSources.push(...accepted);
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
      filter_stats: {
        total_before_filter: totalBeforeFilter,
        total_after_filter: allSources.length,
        own_domain_rejected: totalOwnDomainRejected,
        no_match_rejected: totalNoMatchRejected,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Auto-provider (lazy) — loaded only when PERPLEXITY_API_KEY is present
// ---------------------------------------------------------------------------

let _perplexityProvider: ExternalResearchProvider | null = null;

async function getPerplexityProvider(): Promise<ExternalResearchProvider | null> {
  if (!process.env['PERPLEXITY_API_KEY']) return null;
  if (!_perplexityProvider) {
    const { PerplexitySearchProvider } = await import('../providers/perplexity-adapter.js');
    _perplexityProvider = PerplexitySearchProvider.fromEnv();
  }
  return _perplexityProvider;
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
    // Mode B: caller-supplied provider
    return fetchFromProvider(input.company, input.domain, input.provider);
  }

  // Mode B (auto): try to instantiate PerplexitySearchProvider from env vars
  const autoProvider = await getPerplexityProvider();
  if (autoProvider) {
    return fetchFromProvider(input.company, input.domain, autoProvider);
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
