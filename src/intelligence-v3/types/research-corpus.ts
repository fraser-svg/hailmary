/**
 * Research Corpus Types — V3 Upstream Layer
 * Spec: docs/specs/intelligence-engine-v3/002_pipeline_architecture.md
 *
 * ResearchCorpus is the primary artifact of the upstream acquisition layer.
 * It is produced by mergeResearchCorpus() after site and external acquisition,
 * then consumed by corpusToDossierAdapter() to produce a standard V2 Dossier.
 */

/** Source tier from V1 tier system (1 = company-controlled, 5 = noisy) */
export type SourceTier = 1 | 2 | 3 | 4 | 5;

/** Page types eligible for site crawl */
export type SitePageType =
  | "homepage"
  | "pricing"
  | "about"
  | "docs"
  | "integrations"
  | "blog"
  | "customers"
  | "case-studies"
  | "security";

/** External source types */
export type ExternalSourceType =
  | "review_trustpilot"
  | "review_g2_snippet"
  | "review_capterra_snippet"
  | "press_mention"
  | "competitor_search_snippet"
  | "funding_announcement"
  | "linkedin_snippet"
  | "investor_mention"
  // Counter-narrative sources (Spec 008)
  | "reddit_thread"
  | "hackernews_thread"
  | "github_issues_snippet"
  | "comparison_article"
  | "critical_review";

/** A single fetched or extracted web page from the company's own domain */
export interface CorpusPage {
  url: string;
  page_type: SitePageType;
  fetched_at: string;          // ISO 8601
  raw_text: string;            // Extracted text content (not HTML) — NEVER AI-generated text
  token_count: number;
  fetch_success: boolean;
  source_tier: 1;              // All site pages are Tier 1 (company-controlled)
  // SHA-256(raw_text).slice(0, 16) — set by mergeResearchCorpus() after dedup
  content_hash?: string;
  // How this page was fetched — set by provider
  acquisition_method?: 'cloudflare' | 'playwright' | 'websearch' | 'webfetch' | 'fixture';
}

/** A single external source record */
export interface ExternalSource {
  url: string;
  source_type: ExternalSourceType;
  gathered_at: string;         // ISO 8601 — when HailMary fetched/queried this source
  published_at?: string;       // ISO 8601 — when the source was originally published (from Perplexity metadata)
  excerpt: string;             // Verbatim text from the source page — NEVER AI-generated text
  token_count: number;
  source_tier: SourceTier;     // Typically 2 or 3
  // How this source was acquired — set by provider
  acquisition_method?: 'perplexity' | 'websearch' | 'webfetch' | 'fixture';
  // Set by mergeResearchCorpus() — true when published_at or captured_at > 24 months old
  is_stale?: boolean;
}

/** A community mention (Reddit, HN, Slack leak, Discord) — optional bucket */
export interface CommunityMention {
  url?: string;
  platform: string;            // e.g. "reddit", "hackernews", "discord"
  gathered_at: string;
  excerpt: string;
  author_type?: string;        // e.g. "customer", "developer", "unknown"
  source_tier: 3 | 4;         // Community is Tier 3; unattributed is Tier 4
}

/** A founder's own public statement — optional bucket */
export interface FounderStatement {
  url?: string;
  platform: string;            // e.g. "linkedin", "podcast", "talk", "interview"
  gathered_at: string;
  excerpt: string;
  founder_name?: string;
  source_tier: 1 | 2;         // Founder statements are Tier 1 or 2 depending on platform
}

/** Site corpus produced by siteCorpusAcquisition() */
export interface SiteCorpus {
  domain: string;
  fetched_at: string;
  pages: CorpusPage[];
  fetch_metadata: {
    attempted_pages: string[];
    failed_pages: string[];
    total_tokens: number;
  };
}

/** External corpus produced by externalResearchAcquisition() */
export interface ExternalCorpus {
  company: string;
  gathered_at: string;
  sources: ExternalSource[];
  source_metadata: {
    source_types_attempted: ExternalSourceType[];
    source_types_successful: ExternalSourceType[];
    search_queries_used: string[];
    /** Present when provider mode was used (not fixture mode). */
    filter_stats?: {
      total_before_filter: number;
      total_after_filter: number;
      own_domain_rejected: number;
      no_match_rejected: number;
    };
  };
}

/**
 * ResearchCorpus — unified research artifact produced by mergeResearchCorpus()
 *
 * Four buckets. Only site_pages and external_sources are required in V3.
 * community_mentions and founder_statements must be present as arrays
 * (empty arrays are valid) to support future enrichment.
 */
export interface ResearchCorpus {
  company_id: string;
  domain: string;
  merged_at: string;

  // Required buckets
  site_pages: CorpusPage[];
  external_sources: ExternalSource[];

  // Optional buckets — empty arrays allowed, structure must be present
  community_mentions: CommunityMention[];
  founder_statements: FounderStatement[];

  merge_metadata: {
    total_items: number;
    deduplicated_count: number;
    // Items removed because same URL appeared in both Cloudflare and Perplexity corpora
    cross_corpus_deduplicated: number;
    tier_distribution: Partial<Record<SourceTier, number>>;
    // Items tagged "stale" across all buckets
    stale_item_count: number;
  };
}

/** Configuration for the site crawl */
export interface CrawlConfig {
  optional_pages?: SitePageType[];
  max_pages?: number;     // Default: 10, Hard limit: 10
  max_tokens?: number;    // Default: 20000, Hard limit: 20000
}
