/**
 * Corpus to Dossier Adapter — V3-U4
 * Spec: docs/specs/intelligence-engine-v3/002_pipeline_architecture.md#v3-u4
 *
 * Transforms a ResearchCorpus into a standard Dossier (V2-compatible type).
 * Does NOT create any new TypeScript types — only uses types from src/types/.
 *
 * Design intent:
 *   - Pragmatic first pass: get V2 extractSignals() to run on V3 research inputs
 *   - One SourceRecord per corpus item (CorpusPage + ExternalSource)
 *   - One EvidenceRecord per corpus item, typed by page/source type
 *   - Key dossier sections populated from raw content; deeper NLP is TODO
 *   - All unresolvable sections → empty valid shapes with confidence: "low"
 *   - All extracted claims → is_inferred: true (we haven't verified them)
 *   - confidence: "medium" for sections with ≥2 evidence records; "low" otherwise
 *
 * Errors:
 *   ERR_DOSSIER_INVALID — assembled dossier fails source/evidence link validation
 */

import type { Dossier, NegativeSignal } from '../../types/dossier.js';
import type { EvidenceRecord, EvidenceType, Confidence } from '../../types/evidence.js';
import type { SourceRecord } from '../../types/source.js';
import type {
  ResearchCorpus,
  CorpusPage,
  ExternalSource,
  CommunityMention,
  SitePageType,
  ExternalSourceType,
} from '../types/research-corpus.js';
import type { EnrichmentResult } from '../types/enrichment.js';
import { createEmptyDossier } from '../../utils/empty-dossier.js';
import { makeSourceId, makeEvidenceId, makeRunId } from '../../utils/ids.js';
import { now } from '../../utils/timestamps.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max chars to include in an evidence excerpt (keeps token usage bounded). */
const EXCERPT_MAX_CHARS = 600;

// ---------------------------------------------------------------------------
// Type mappings
// ---------------------------------------------------------------------------

const SITE_PAGE_EVIDENCE_TYPE: Record<SitePageType, EvidenceType> = {
  homepage: 'company_description_record',
  pricing: 'pricing_record',
  about: 'company_description_record',
  docs: 'product_record',
  integrations: 'channel_record',
  blog: 'content_record',
  customers: 'case_study_record',
  'case-studies': 'case_study_record',
  security: 'product_record',
};

const EXTERNAL_SOURCE_EVIDENCE_TYPE: Record<ExternalSourceType, EvidenceType> = {
  review_trustpilot: 'review_record',
  review_g2_snippet: 'review_record',
  review_capterra_snippet: 'review_record',
  press_mention: 'press_record',
  competitor_search_snippet: 'competitor_record',
  funding_announcement: 'funding_record',
  linkedin_snippet: 'channel_record',
  investor_mention: 'funding_record',
  // Counter-narrative sources (Spec 008)
  reddit_thread: 'pain_point_record',
  hackernews_thread: 'customer_language_record',
  github_issues_snippet: 'pain_point_record',
  comparison_article: 'comparison_record',
  critical_review: 'review_record',
};

/** Tier → source_quality mapping for EvidenceRecord */
function tierToQuality(tier: 1 | 2 | 3 | 4 | 5): Confidence {
  if (tier <= 2) return 'high';
  if (tier === 3) return 'medium';
  return 'low';
}

/** Count of evidence records → section confidence */
function sectionConfidence(evidenceCount: number): Confidence {
  return evidenceCount >= 2 ? 'medium' : 'low';
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  // Break at last word boundary
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return lastSpace > maxChars * 0.8 ? cut.slice(0, lastSpace) + '…' : cut + '…';
}

/** Derive a human-readable company name from the domain. */
export function domainToCompanyName(domain: string): string {
  const cleaned = domain
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
  const firstPart = cleaned.split('.')[0] ?? cleaned;
  return firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
}

// ---------------------------------------------------------------------------
// Source record builders
// ---------------------------------------------------------------------------

function sitePageSourceRecord(page: CorpusPage, idx: number): SourceRecord {
  const pageLabel: Record<SitePageType, string> = {
    homepage: 'Homepage',
    pricing: 'Pricing Page',
    about: 'About Page',
    docs: 'Documentation',
    integrations: 'Integrations Page',
    blog: 'Blog',
    customers: 'Customers Page',
    'case-studies': 'Case Studies',
    security: 'Security Page',
  };

  return {
    source_id: makeSourceId(idx),
    url: page.url,
    source_type: 'website',
    title: pageLabel[page.page_type] ?? page.page_type,
    publisher_or_owner: page.url.split('/')[2] ?? page.url,
    captured_at: page.fetched_at,
    relevance_notes: [`${page.page_type} page crawled during V3 acquisition`],
    source_tier: page.source_tier,
  };
}

function externalSourceRecord(source: ExternalSource, idx: number): SourceRecord {
  const typeLabel: Record<ExternalSourceType, string> = {
    review_trustpilot: 'Trustpilot Review',
    review_g2_snippet: 'G2 Review Snippet',
    review_capterra_snippet: 'Capterra Review Snippet',
    press_mention: 'Press Mention',
    competitor_search_snippet: 'Competitor Search Snippet',
    funding_announcement: 'Funding Announcement',
    linkedin_snippet: 'LinkedIn Company Snippet',
    investor_mention: 'Investor Mention',
    reddit_thread: 'Reddit Thread',
    hackernews_thread: 'Hacker News Thread',
    github_issues_snippet: 'GitHub Issues Snippet',
    comparison_article: 'Comparison Article',
    critical_review: 'Critical Review',
  };

  return {
    source_id: makeSourceId(idx),
    url: source.url,
    source_type: source.source_type,
    title: typeLabel[source.source_type] ?? source.source_type,
    publisher_or_owner: source.url.split('/')[2] ?? source.source_type,
    captured_at: source.gathered_at,
    ...(source.published_at ? { published_at: source.published_at } : {}),
    ...(source.acquisition_method ? { acquisition_method: source.acquisition_method } : {}),
    relevance_notes: [`${source.source_type} gathered during V3 external acquisition`],
    source_tier: source.source_tier,
  };
}

function communityMentionSourceRecord(mention: CommunityMention, idx: number): SourceRecord {
  const platformLabel = mention.platform === 'reddit' ? 'Reddit Thread' : 'Hacker News Thread';
  return {
    source_id: makeSourceId(idx),
    url: mention.url ?? '',
    source_type: mention.original_source_type ?? (mention.platform === 'reddit' ? 'reddit_thread' : 'hackernews_thread'),
    title: platformLabel,
    publisher_or_owner: mention.platform,
    captured_at: mention.gathered_at,
    ...(mention.published_at ? { published_at: mention.published_at } : {}),
    ...(mention.acquisition_method ? { acquisition_method: mention.acquisition_method } : {}),
    relevance_notes: [`${mention.platform} community mention routed from external acquisition`],
    source_tier: mention.source_tier,
  };
}

// ---------------------------------------------------------------------------
// Evidence record builders
// ---------------------------------------------------------------------------

function sitePageEvidenceRecord(
  page: CorpusPage,
  sourceId: string,
  idx: number,
): EvidenceRecord {
  const excerpt = truncate(page.raw_text, EXCERPT_MAX_CHARS);
  const evidenceType = SITE_PAGE_EVIDENCE_TYPE[page.page_type];

  // Tags: combine page type with content signals
  const tags: string[] = [page.page_type];
  if (page.page_type === 'homepage') tags.push('company_claim', 'positioning');
  if (page.page_type === 'pricing') tags.push('pricing', 'delivery_model');
  if (page.page_type === 'about') tags.push('company_claim', 'leadership');
  if (page.page_type === 'customers' || page.page_type === 'case-studies') {
    tags.push('social_proof', 'customer_voice');
  }
  if (page.page_type === 'blog') tags.push('content_strategy', 'thought_leadership');
  if (page.page_type === 'integrations') tags.push('channel', 'ecosystem');
  // Acquisition provenance tags
  if (page.acquisition_method === 'cloudflare') tags.push('acquisition_cloudflare');

  return {
    evidence_id: makeEvidenceId(idx),
    source_id: sourceId,
    evidence_type: evidenceType,
    captured_at: page.fetched_at,
    excerpt,
    summary: `${page.page_type} content from ${page.url}`,
    normalized_fields: {},
    source_quality: 'high', // Site pages are Tier 1 — company-controlled
    confidence: 'medium',
    is_inferred: false, // Direct content, not inferred
    supports_claims: [`${page.page_type}_content`],
    tags,
  };
}

// ---------------------------------------------------------------------------
// Counter-narrative tagging (Spec 008 §7)
// ---------------------------------------------------------------------------

const FRICTION_KEYWORDS = [
  "slow", "broken", "doesn't work", "hard to", "difficult", "painful", "janky",
  "fails", "error", "bug", "crashes", "unstable", "unreliable", "confusing",
  "clunky", "cumbersome", "frustrating to use", "poor documentation",
  "steep learning curve", "setup is", "hard to set up", "complex to",
];

const COMPLAINT_KEYWORDS = [
  "disappointed", "frustrated", "waste", "regret", "avoid", "terrible", "awful",
  "worst", "not worth", "switched away", "cancelled", "churned", "left for",
  "moved to", "went back to", "not recommended", "stay away", "overpriced",
  "poor support", "no support", "ignored our",
];

const CONTRADICTION_KEYWORDS = [
  "claims", "but actually", "marketed as", "vs reality", "in practice",
  "supposed to", "advertised as", "promised", "reality is", "truth is",
  "misleading", "overstated", "doesn't actually", "in theory", "on paper",
];

// ---------------------------------------------------------------------------
// Negative signal category inference (for NegativeSignal.category enum)
// ---------------------------------------------------------------------------

const SIGNAL_CATEGORY_MAP: Record<string, NegativeSignal['category']> = {
  // reliability
  'slow': 'reliability', 'broken': 'reliability', "doesn't work": 'reliability',
  'crashes': 'reliability', 'unstable': 'reliability', 'unreliable': 'reliability',
  'bug': 'reliability', 'error': 'reliability', 'fails': 'reliability',
  'janky': 'reliability',
  // usability
  'hard to': 'usability', 'difficult': 'usability', 'confusing': 'usability',
  'clunky': 'usability', 'cumbersome': 'usability', 'steep learning curve': 'usability',
  'hard to set up': 'usability', 'complex to': 'usability', 'poor documentation': 'usability',
  'frustrating to use': 'usability',
  // support
  'poor support': 'support', 'no support': 'support', 'ignored our': 'support',
  // billing
  'overpriced': 'billing', 'not worth': 'billing', 'waste': 'billing',
  // migration
  'switched away': 'migration', 'cancelled': 'migration', 'churned': 'migration',
  'left for': 'migration', 'moved to': 'migration', 'went back to': 'migration',
  // trust
  'misleading': 'trust', 'promised': 'trust', 'marketed as': 'trust',
  'vs reality': 'trust', 'overstated': 'trust',
};

/** Infer NegativeSignal.category from an evidence excerpt using keyword matching. */
function inferSignalCategory(excerpt: string): NegativeSignal['category'] {
  const lower = excerpt.toLowerCase();
  for (const [keyword, category] of Object.entries(SIGNAL_CATEGORY_MAP)) {
    if (lower.includes(keyword)) return category;
  }
  return 'other';
}

/**
 * Tag an evidence excerpt with friction/complaint/contradiction signals.
 *
 * Returns an array of tag strings to append to the evidence record's tags[].
 * Returns [] on empty/undefined excerpt.
 * Does NOT modify the excerpt — only derives tags from it.
 *
 * Tags emitted:
 *   "friction"           — excerpt contains a friction keyword
 *   "complaint"          — excerpt contains a complaint keyword
 *   "contradiction"      — excerpt contains a contradiction keyword
 *   "buyer_disappointment" — excerpt contains BOTH friction AND complaint keywords
 */
export function tagFrictionSignals(
  excerpt: string | undefined,
  _sourceType: ExternalSourceType,
): string[] {
  if (!excerpt) return [];

  const lower = excerpt.toLowerCase();
  const hasFriction = FRICTION_KEYWORDS.some(kw => lower.includes(kw));
  const hasComplaint = COMPLAINT_KEYWORDS.some(kw => lower.includes(kw));
  const hasContradiction = CONTRADICTION_KEYWORDS.some(kw => lower.includes(kw));

  const tags: string[] = [];
  if (hasFriction) tags.push('friction');
  if (hasComplaint) tags.push('complaint');
  if (hasContradiction) tags.push('contradiction');
  if (hasFriction && hasComplaint) tags.push('buyer_disappointment');

  return tags;
}

/**
 * Compute negative_signal_depth from the full evidence array.
 *
 * Counts evidence records with a 'friction' or 'complaint' tag.
 * Thresholds (Spec 008 Amendment 2):
 *   0     → 'none'
 *   1–2   → 'thin'
 *   3–5   → 'moderate'
 *   ≥6    → 'rich'
 */
function computeNegativeSignalDepth(
  evidence: EvidenceRecord[],
): 'none' | 'thin' | 'moderate' | 'rich' {
  const count = evidence.filter(ev =>
    (ev.tags ?? []).some(t => t === 'friction' || t === 'complaint'),
  ).length;
  if (count === 0) return 'none';
  if (count <= 2) return 'thin';
  if (count <= 5) return 'moderate';
  return 'rich';
}

function externalSourceEvidenceRecord(
  source: ExternalSource,
  sourceId: string,
  idx: number,
): EvidenceRecord {
  const excerpt = truncate(source.excerpt, EXCERPT_MAX_CHARS);
  const evidenceType = EXTERNAL_SOURCE_EVIDENCE_TYPE[source.source_type];

  const tags: string[] = [source.source_type];
  if (source.source_type.startsWith('review_')) tags.push('customer_voice', 'buyer_language');
  if (source.source_type === 'press_mention') tags.push('press_coverage');
  if (source.source_type === 'competitor_search_snippet') tags.push('competitor_positioning');
  if (source.source_type === 'funding_announcement') tags.push('funding', 'investor_signal');
  if (source.source_type === 'linkedin_snippet') tags.push('channel', 'social');
  // Counter-narrative base tags (Spec 008 §7)
  if (source.source_type === 'reddit_thread') tags.push('community_voice', 'buyer_language');
  if (source.source_type === 'hackernews_thread') tags.push('community_voice', 'developer_voice');
  if (source.source_type === 'github_issues_snippet') tags.push('developer_voice', 'product_friction');
  if (source.source_type === 'comparison_article') tags.push('competitor_positioning', 'buyer_language');
  if (source.source_type === 'critical_review') tags.push('customer_voice', 'buyer_language');
  // Staleness and acquisition provenance tags
  if (source.is_stale) tags.push('stale');
  if (source.acquisition_method === 'perplexity') tags.push('acquisition_perplexity');
  // Friction/complaint/contradiction tagging (Spec 008 §7)
  tags.push(...tagFrictionSignals(source.excerpt, source.source_type));

  return {
    evidence_id: makeEvidenceId(idx),
    source_id: sourceId,
    evidence_type: evidenceType,
    captured_at: source.gathered_at,
    excerpt,
    summary: `${source.source_type} for company`,
    normalized_fields: {},
    source_quality: tierToQuality(source.source_tier),
    confidence: tierToQuality(source.source_tier),
    is_inferred: false,
    supports_claims: [`${source.source_type}_content`],
    tags,
  };
}

function communityMentionEvidenceRecord(
  mention: CommunityMention,
  sourceId: string,
  idx: number,
): EvidenceRecord {
  const excerpt = truncate(mention.excerpt, EXCERPT_MAX_CHARS);
  // Reddit → pain_point_record, HN → customer_language_record
  const evidenceType: EvidenceType = mention.platform === 'reddit'
    ? 'pain_point_record'
    : 'customer_language_record';

  const sourceType = mention.original_source_type
    ?? (mention.platform === 'reddit' ? 'reddit_thread' : 'hackernews_thread') as ExternalSourceType;

  const tags: string[] = [sourceType];
  tags.push('community_voice');
  if (mention.platform === 'reddit') tags.push('buyer_language');
  if (mention.platform === 'hackernews') tags.push('developer_voice');
  if (mention.is_stale) tags.push('stale');
  if (mention.acquisition_method === 'perplexity') tags.push('acquisition_perplexity');
  // Friction/complaint tagging
  tags.push(...tagFrictionSignals(mention.excerpt, sourceType));

  return {
    evidence_id: makeEvidenceId(idx),
    source_id: sourceId,
    evidence_type: evidenceType,
    captured_at: mention.gathered_at,
    excerpt,
    summary: `${mention.platform} community mention`,
    normalized_fields: {},
    source_quality: tierToQuality(mention.source_tier),
    confidence: tierToQuality(mention.source_tier),
    is_inferred: false,
    supports_claims: [`${sourceType}_content`],
    tags,
  };
}

// ---------------------------------------------------------------------------
// Section population helpers
// ---------------------------------------------------------------------------

/** Group evidence records by their page_type / source_type. */
type EvidenceIndex = {
  byPageType: Map<SitePageType, EvidenceRecord[]>;
  bySourceType: Map<ExternalSourceType, EvidenceRecord[]>;
  reviewEvidence: EvidenceRecord[];
  pressEvidence: EvidenceRecord[];
  competitorEvidence: EvidenceRecord[];
  fundingEvidence: EvidenceRecord[];
  siteEvidence: EvidenceRecord[];
};

function buildEvidenceIndex(
  corpus: ResearchCorpus,
  pageEvidenceMap: Map<string, EvidenceRecord>,
  sourceEvidenceMap: Map<string, EvidenceRecord>,
): EvidenceIndex {
  const byPageType = new Map<SitePageType, EvidenceRecord[]>();
  const bySourceType = new Map<ExternalSourceType, EvidenceRecord[]>();

  for (const page of corpus.site_pages) {
    const ev = pageEvidenceMap.get(page.url);
    if (!ev) continue;
    const list = byPageType.get(page.page_type) ?? [];
    list.push(ev);
    byPageType.set(page.page_type, list);
  }

  for (const source of corpus.external_sources) {
    const ev = sourceEvidenceMap.get(source.url ?? source.excerpt.slice(0, 64));
    if (!ev) continue;
    const list = bySourceType.get(source.source_type) ?? [];
    list.push(ev);
    bySourceType.set(source.source_type, list);
  }

  const reviewEvidence = [
    ...(bySourceType.get('review_trustpilot') ?? []),
    ...(bySourceType.get('review_g2_snippet') ?? []),
    ...(bySourceType.get('review_capterra_snippet') ?? []),
  ];
  const pressEvidence = bySourceType.get('press_mention') ?? [];
  const competitorEvidence = bySourceType.get('competitor_search_snippet') ?? [];
  const fundingEvidence = [
    ...(bySourceType.get('funding_announcement') ?? []),
    ...(bySourceType.get('investor_mention') ?? []),
  ];
  const siteEvidence = [...pageEvidenceMap.values()];

  return {
    byPageType,
    bySourceType,
    reviewEvidence,
    pressEvidence,
    competitorEvidence,
    fundingEvidence,
    siteEvidence,
  };
}

// ---------------------------------------------------------------------------
// Evidence summary computation
// ---------------------------------------------------------------------------

function computeEvidenceSummary(
  sources: SourceRecord[],
  evidence: EvidenceRecord[],
) {
  const byTier = { tier_1: 0, tier_2: 0, tier_3: 0, tier_4: 0, tier_5: 0 };
  for (const s of sources) {
    const key = `tier_${s.source_tier}` as keyof typeof byTier;
    byTier[key] = (byTier[key] ?? 0) + 1;
  }

  const byCategory = {
    company_basics: 0,
    product_and_offer: 0,
    gtm: 0,
    customer: 0,
    competitors: 0,
    signals: 0,
    market_and_macro: 0,
    positioning_and_narrative: 0,
    risk: 0,
  };

  for (const ev of evidence) {
    switch (ev.evidence_type) {
      case 'company_description_record':
      case 'founding_record':
      case 'leadership_record':
      case 'location_record':
      case 'ownership_record':
        byCategory.company_basics++;
        break;
      case 'product_record':
      case 'service_record':
      case 'pricing_record':
      case 'delivery_model_record':
      case 'implementation_record':
        byCategory.product_and_offer++;
        break;
      case 'sales_motion_record':
      case 'channel_record':
      case 'content_record':
      case 'buyer_signal_record':
      case 'job_posting_record':
        byCategory.gtm++;
        break;
      case 'testimonial_record':
      case 'review_record':
      case 'case_study_record':
      case 'persona_signal_record':
      case 'pain_point_record':
      case 'outcome_record':
      case 'customer_language_record':
        byCategory.customer++;
        break;
      case 'competitor_record':
      case 'positioning_record':
      case 'comparison_record':
      case 'differentiation_record':
        byCategory.competitors++;
        break;
      case 'funding_record':
      case 'product_launch_record':
      case 'leadership_change_record':
      case 'press_record':
      case 'hiring_signal_record':
        byCategory.signals++;
        break;
      case 'market_trend_record':
      case 'regulatory_record':
      case 'economic_exposure_record':
      case 'political_exposure_record':
      case 'technology_shift_record':
      case 'ecosystem_dependency_record':
        byCategory.market_and_macro++;
        break;
      case 'company_claim_record':
      case 'customer_value_record':
      case 'narrative_gap_support_record':
      case 'hidden_differentiator_record':
        byCategory.positioning_and_narrative++;
        break;
      case 'strategic_risk_record':
      case 'dependency_risk_record':
      case 'positioning_risk_record':
        byCategory.risk++;
        break;
    }
  }

  const inferred = evidence.filter(e => e.is_inferred).length;
  const CUSTOMER_VOICE_TYPES = new Set([
    'review_record', 'testimonial_record', 'pain_point_record',
    'customer_language_record', 'comparison_record',
  ]);
  const reviewCount = evidence.filter(e => CUSTOMER_VOICE_TYPES.has(e.evidence_type)).length;

  return {
    total_sources: sources.length,
    total_evidence: evidence.length,
    by_source_tier: byTier,
    by_evidence_category: byCategory,
    inferred_count: inferred,
    direct_count: evidence.length - inferred,
    customer_voice_depth: (reviewCount >= 3 ? 'rich' : reviewCount >= 1 ? 'thin' : 'none') as
      'none' | 'thin' | 'moderate' | 'rich',
    negative_signal_depth: computeNegativeSignalDepth(evidence),
  };
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export function corpusToDossierAdapter(
  corpus: ResearchCorpus,
  enrichment?: EnrichmentResult,
): Dossier {
  const companyName = domainToCompanyName(corpus.domain);
  const domain = corpus.domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

  // --- 1. Build source records ---
  let srcCounter = 0;
  const sources: SourceRecord[] = [];
  const pageEvidenceMap = new Map<string, EvidenceRecord>(); // url → evidence
  const sourceEvidenceMap = new Map<string, EvidenceRecord>(); // url|hash → evidence

  for (const page of corpus.site_pages) {
    srcCounter++;
    sources.push(sitePageSourceRecord(page, srcCounter));
  }
  for (const source of corpus.external_sources) {
    srcCounter++;
    sources.push(externalSourceRecord(source, srcCounter));
  }
  for (const mention of corpus.community_mentions) {
    srcCounter++;
    sources.push(communityMentionSourceRecord(mention, srcCounter));
  }

  // --- 2. Build evidence records ---
  let evCounter = 0;
  const allEvidence: EvidenceRecord[] = [];
  const communityEvidenceMap = new Map<string, EvidenceRecord>(); // key → evidence

  for (let i = 0; i < corpus.site_pages.length; i++) {
    const page = corpus.site_pages[i];
    const sourceId = sources[i]!.source_id;
    evCounter++;
    const ev = sitePageEvidenceRecord(page, sourceId, evCounter);
    allEvidence.push(ev);
    pageEvidenceMap.set(page.url, ev);
  }

  const externalOffset = corpus.site_pages.length;
  for (let i = 0; i < corpus.external_sources.length; i++) {
    const source = corpus.external_sources[i];
    const sourceId = sources[externalOffset + i]!.source_id;
    evCounter++;
    const ev = externalSourceEvidenceRecord(source, sourceId, evCounter);
    allEvidence.push(ev);
    const key = source.url ?? source.excerpt.slice(0, 64);
    sourceEvidenceMap.set(key, ev);
  }

  const communityOffset = externalOffset + corpus.external_sources.length;
  for (let i = 0; i < corpus.community_mentions.length; i++) {
    const mention = corpus.community_mentions[i];
    const sourceId = sources[communityOffset + i]!.source_id;
    evCounter++;
    const ev = communityMentionEvidenceRecord(mention, sourceId, evCounter);
    allEvidence.push(ev);
    const key = mention.url ?? mention.excerpt.slice(0, 64);
    communityEvidenceMap.set(key, ev);
  }

  // --- 2b. Build enrichment-ID → ev_XXX map for remapping LLM-generated evidence_ids ---
  // Enrichment uses internal IDs (site_0, ext_0, comm_0) that don't match dossier ev_XXX IDs.
  // This map translates them so evidence links in enriched fields are valid.
  const enrichmentIdMap = new Map<string, string>();
  for (let i = 0; i < corpus.site_pages.length; i++) {
    const ev = allEvidence[i];
    if (ev) enrichmentIdMap.set(`site_${i}`, ev.evidence_id);
  }
  for (let i = 0; i < corpus.external_sources.length; i++) {
    const ev = allEvidence[externalOffset + i];
    if (ev) enrichmentIdMap.set(`ext_${i}`, ev.evidence_id);
  }
  for (let i = 0; i < corpus.community_mentions.length; i++) {
    const ev = allEvidence[communityOffset + i];
    if (ev) enrichmentIdMap.set(`comm_${i}`, ev.evidence_id);
  }

  // --- 3. Build evidence index for section population ---
  const idx = buildEvidenceIndex(corpus, pageEvidenceMap, sourceEvidenceMap);

  // --- 4. Start from empty dossier (all 16 sections, valid shapes) ---
  const timestamp = now();
  const dossier = createEmptyDossier(companyName, domain);

  // --- 5. Populate company_input ---
  dossier.company_input = {
    company_name: companyName,
    primary_domain: domain,
    resolved_company_name: companyName,
    resolved_domain: domain,
    aliases: [],
  };

  // --- 6. Populate run_metadata ---
  dossier.run_metadata = {
    run_id: makeRunId(),
    pipeline_version: 'v3-upstream',
    collection_started_at: corpus.merged_at,
    collection_finished_at: timestamp,
    source_count: sources.length,
    evidence_record_count: allEvidence.length,
    notes: [
      `Assembled by corpusToDossierAdapter from ResearchCorpus (${corpus.site_pages.length} site pages, ${corpus.external_sources.length} external sources)`,
    ],
    evidence_summary: computeEvidenceSummary(sources, allEvidence),
  };

  // --- 7. Populate company_profile ---
  const homepageEvidence = idx.byPageType.get('homepage') ?? [];
  const aboutEvidence = idx.byPageType.get('about') ?? [];
  const profileEvidence = [...homepageEvidence, ...aboutEvidence];

  if (profileEvidence.length > 0) {
    const homeText = homepageEvidence[0]?.excerpt ?? '';
    dossier.company_profile = {
      plain_language_description: truncate(homeText, 250) || '',
      category: enrichment?.fields.category ?? '',
      subcategories: [],
      founded_year: enrichment?.fields.founded_year ?? null,
      company_stage: {
        value: enrichment?.fields.company_stage ?? '',
        is_inferred: true,
        confidence: enrichment?.fields.company_stage ? 'medium' : 'low',
      },
      headquarters: '',
      geographic_presence: [],
      leadership: (enrichment?.fields.leadership ?? []).map(l => ({
        name: l.name,
        title: l.role,
        evidence_ids: profileEvidence.map(e => e.evidence_id),
      })),
      ownership_or_structure_notes: [],
      evidence_ids: profileEvidence.map(e => e.evidence_id),
      confidence: sectionConfidence(profileEvidence.length),
    };
  }

  // --- 8. Populate product_and_offer ---
  const pricingEvidence = idx.byPageType.get('pricing') ?? [];
  const docsEvidence = idx.byPageType.get('docs') ?? [];
  const productEvidence = [...pricingEvidence, ...docsEvidence, ...homepageEvidence];

  if (productEvidence.length > 0) {
    const pricingText = pricingEvidence[0]?.excerpt ?? '';
    dossier.product_and_offer = {
      core_offer_summary: truncate(homepageEvidence[0]?.excerpt ?? '', 200) || '',
      products_or_services: [], // TODO: extract product names via keyword matching
      pricing_model: {
        value: pricingEvidence.length > 0 ? 'extracted from pricing page' : '',
        details: truncate(pricingText, 200) || '',
        is_public: pricingEvidence.length > 0,
        is_inferred: pricingEvidence.length === 0,
        evidence_ids: pricingEvidence.map(e => e.evidence_id),
      },
      pricing_signals: enrichment?.fields.pricing_signals ?? [],
      delivery_model: enrichment?.fields.delivery_model ?? [],
      implementation_complexity: { value: '', is_inferred: true, confidence: 'low' },
      evidence_ids: productEvidence.map(e => e.evidence_id),
      confidence: sectionConfidence(productEvidence.length),
    };
  }

  // --- 9. Populate gtm_model ---
  const integrationsEvidence = idx.byPageType.get('integrations') ?? [];
  const blogEvidence = idx.byPageType.get('blog') ?? [];
  const gtmEvidence = [...homepageEvidence, ...integrationsEvidence, ...blogEvidence];

  if (gtmEvidence.length > 0) {
    dossier.gtm_model = {
      sales_motion: { value: '', is_inferred: true, confidence: 'low' },
      acquisition_channels: enrichment?.fields.acquisition_channels ?? [],
      buyer_journey_notes: [],
      distribution_model: [],
      territory_or_market_focus: [],
      growth_signals: [],
      hiring_signals: [],
      content_and_positioning_hooks: [],
      gtm_observations: [],     // TODO: extract GTM observations from homepage
      evidence_ids: gtmEvidence.map(e => e.evidence_id),
      confidence: sectionConfidence(gtmEvidence.length),
    };
  }

  // --- 10. Populate customer_and_personas ---
  const caseStudyEvidence = [
    ...(idx.byPageType.get('customers') ?? []),
    ...(idx.byPageType.get('case-studies') ?? []),
  ];
  const communityEvidence = [...communityEvidenceMap.values()];
  const customerEvidence = [...caseStudyEvidence, ...idx.reviewEvidence, ...communityEvidence];

  if (customerEvidence.length > 0) {
    dossier.customer_and_personas = {
      ideal_customer_profile: {
        company_size: [],
        industries: [],
        geographies: [],
        traits: [],
        is_inferred: true,
        evidence_ids: customerEvidence.map(e => e.evidence_id),
      },
      buyer_personas: [],
      end_user_personas: [],
      customer_pain_themes: enrichment?.fields.customer_pain_themes ?? [],
      customer_outcome_themes: [],
      case_study_signals: caseStudyEvidence.map(e => truncate(e.excerpt, 100)),
      evidence_ids: customerEvidence.map(e => e.evidence_id),
      confidence: sectionConfidence(customerEvidence.length),
    };
  }

  // --- 11. Populate competitors ---
  const enrichedCompetitors = enrichment?.fields.competitors ?? [];
  if (idx.competitorEvidence.length > 0 || enrichedCompetitors.length > 0) {
    // Prefer enriched competitors (have names/domains); fall back to evidence-based entries
    const directCompetitors = enrichedCompetitors.length > 0
      ? enrichedCompetitors.map(c => ({
          name: c.name,
          domain: c.domain,
          why_included: 'extracted by enrichment (LLM)',
          positioning_summary: '',
          comparison_notes: [],
          evidence_ids: idx.competitorEvidence.map(e => e.evidence_id),
        }))
      : idx.competitorEvidence.map(ev => ({
          name: '',
          domain: '',
          why_included: 'found in competitor search results',
          positioning_summary: truncate(ev.excerpt, 150),
          comparison_notes: [],
          evidence_ids: [ev.evidence_id],
        }));

    dossier.competitors = {
      direct_competitors: directCompetitors,
      adjacent_competitors: [],
      substitutes: [],
      claimed_differentiators: [],
      positioning_overlaps: [],
      competitive_gaps: [],
      competitive_observations: [],
      evidence_ids: idx.competitorEvidence.map(e => e.evidence_id),
      confidence: sectionConfidence(idx.competitorEvidence.length),
    };
  }

  // --- 12. Populate signals ---
  const fundingEvIds = idx.fundingEvidence.map(e => e.evidence_id);
  const pressEvIds = idx.pressEvidence.map(e => e.evidence_id);

  if (fundingEvIds.length > 0 || pressEvIds.length > 0) {
    dossier.signals = {
      funding: idx.fundingEvidence.map(ev => ({
        date: '',       // TODO: extract date from excerpt
        amount: '',     // TODO: extract amount from excerpt
        round: '',      // TODO: extract round type
        investors: [],  // TODO: extract investor names
        evidence_ids: [ev.evidence_id],
      })),
      product_launches: [],
      leadership_changes: [],
      press_and_content: idx.pressEvidence.map(ev => ({
        date: '',       // TODO: extract date from excerpt
        type: 'press',
        title: truncate(ev.excerpt, 80),
        summary: truncate(ev.excerpt, 200),
        evidence_ids: [ev.evidence_id],
      })),
      notable_hiring: [],
      signal_summary: [],
      confidence: sectionConfidence(fundingEvIds.length + pressEvIds.length),
    };
  }

  // --- 13. Populate narrative_intelligence ---
  // company_claimed_value: one entry per site page (captures company's own language)
  const companyClaims = idx.siteEvidence
    .filter(ev => {
      const page = corpus.site_pages.find(p => p.url === corpus.site_pages.find(
        pp => ev.evidence_id === pageEvidenceMap.get(pp.url)?.evidence_id,
      )?.url);
      return page != null;
    })
    .map(ev => ({
      theme: ev.summary,
      description: truncate(ev.excerpt, 150),
      language_examples: [truncate(ev.excerpt, 80)],
      evidence_ids: [ev.evidence_id],
    }));

  // customer_expressed_value: one entry per review
  const customerExpressed = idx.reviewEvidence.map(ev => ({
    theme: 'customer review',
    description: truncate(ev.excerpt, 150),
    language_examples: [truncate(ev.excerpt, 80)],
    source_types: [ev.evidence_type],
    evidence_ids: [ev.evidence_id],
  }));

  const narrativeEvidence = [...idx.siteEvidence, ...idx.reviewEvidence, ...communityEvidence];

  if (narrativeEvidence.length > 0) {
    dossier.narrative_intelligence = {
      company_claimed_value: companyClaims,
      customer_expressed_value: customerExpressed,
      customer_language_patterns: [],  // TODO: NLP extraction
      narrative_gaps: (enrichment?.fields.narrative_gaps ?? []).map(gap => ({
        ...gap,
        evidence_ids: gap.evidence_ids
          .map(id => enrichmentIdMap.get(id))
          .filter((id): id is string => id !== undefined),
      })),
      negative_signals: allEvidence
        .filter(ev => (ev.tags ?? []).some(t => t === 'friction' || t === 'complaint'))
        .map(ev => ({
          signal: truncate(ev.excerpt, 150),
          category: inferSignalCategory(ev.excerpt),
          severity: ((ev.tags ?? []).includes('buyer_disappointment') ? 'high' : 'medium') as Confidence,
          frequency: 'isolated' as const,
          evidence_ids: [ev.evidence_id],
        })),
      value_alignment_summary: (enrichment?.fields.value_alignment_summary ?? []).map(entry => ({
        ...entry,
        evidence_ids: entry.evidence_ids
          .map(id => enrichmentIdMap.get(id))
          .filter((id): id is string => id !== undefined),
      })),
      hidden_differentiators: [],
      messaging_opportunities: [],
      narrative_summary: '',           // TODO: synthesise from claims vs customer evidence
      confidence: sectionConfidence(narrativeEvidence.length),
    };
  }

  // --- 14. confidence_and_gaps ---
  const emptySections: string[] = [];
  if (profileEvidence.length === 0) emptySections.push('company_profile');
  if (productEvidence.length === 0) emptySections.push('product_and_offer');
  if (idx.reviewEvidence.length === 0) emptySections.push('customer_voice');

  dossier.confidence_and_gaps = {
    high_confidence_findings: [],
    medium_confidence_findings: [],
    low_confidence_findings: emptySections.map(s => `${s}: no evidence collected`),
    missing_data: emptySections,
    conflicting_evidence: [],
    sections_with_weak_support: emptySections,
    overall_confidence: allEvidence.length >= 5 ? 'medium' : 'low',
  };

  // --- 15. Populate sources and evidence ---
  dossier.sources = sources;
  dossier.evidence = allEvidence;

  // --- 16. Validate evidence link integrity ---
  const evidenceIds = new Set(allEvidence.map(e => e.evidence_id));
  const sourceIds = new Set(sources.map(s => s.source_id));

  // Validate all evidence records reference valid sources
  for (const ev of allEvidence) {
    if (!sourceIds.has(ev.source_id)) {
      throw new Error(
        `ERR_DOSSIER_INVALID: evidence ${ev.evidence_id} references unknown source_id ${ev.source_id}`,
      );
    }
  }

  // Validate all evidence_ids referenced in sections exist
  function checkEvidenceIds(obj: unknown, path: string): void {
    if (obj === null || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach((item, i) => checkEvidenceIds(item, `${path}[${i}]`));
      return;
    }
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key === 'evidence_ids' && Array.isArray(value)) {
        for (const id of value) {
          if (typeof id === 'string' && !evidenceIds.has(id)) {
            throw new Error(
              `ERR_DOSSIER_INVALID: ${path}.evidence_ids references unknown evidence_id ${id}`,
            );
          }
        }
      } else if (key !== 'sources' && key !== 'evidence') {
        checkEvidenceIds(value, `${path}.${key}`);
      }
    }
  }

  checkEvidenceIds(dossier, 'dossier');

  return dossier;
}
