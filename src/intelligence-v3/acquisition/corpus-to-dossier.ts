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

import type { Dossier } from '../../types/dossier.js';
import type { EvidenceRecord, EvidenceType, Confidence } from '../../types/evidence.js';
import type { SourceRecord } from '../../types/source.js';
import type {
  ResearchCorpus,
  CorpusPage,
  ExternalSource,
  SitePageType,
  ExternalSourceType,
} from '../types/research-corpus.js';
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
  // Staleness and acquisition provenance tags
  if (source.is_stale) tags.push('stale');
  if (source.acquisition_method === 'perplexity') tags.push('acquisition_perplexity');

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
  const reviewCount = evidence.filter(
    e => e.evidence_type === 'review_record' || e.evidence_type === 'testimonial_record',
  ).length;

  return {
    total_sources: sources.length,
    total_evidence: evidence.length,
    by_source_tier: byTier,
    by_evidence_category: byCategory,
    inferred_count: inferred,
    direct_count: evidence.length - inferred,
    customer_voice_depth: (reviewCount >= 3 ? 'rich' : reviewCount >= 1 ? 'thin' : 'none') as
      'none' | 'thin' | 'moderate' | 'rich',
    negative_signal_depth: 'none' as const,
  };
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export function corpusToDossierAdapter(corpus: ResearchCorpus): Dossier {
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

  // --- 2. Build evidence records ---
  let evCounter = 0;
  const allEvidence: EvidenceRecord[] = [];

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
      category: '',   // TODO: extract category via NLP / keyword matching
      subcategories: [],
      founded_year: null, // TODO: extract year from about page
      company_stage: { value: '', is_inferred: true, confidence: 'low' },
      headquarters: '',   // TODO: extract from about page or footer
      geographic_presence: [],
      leadership: [],     // TODO: extract leadership names from about page
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
      pricing_signals: [],      // TODO: extract pricing keywords
      delivery_model: [],       // TODO: extract delivery model from pricing/docs
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
      acquisition_channels: [], // TODO: extract channel keywords
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
  const customerEvidence = [...caseStudyEvidence, ...idx.reviewEvidence];

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
      customer_pain_themes: [], // TODO: extract pain keywords from reviews
      customer_outcome_themes: [],
      case_study_signals: caseStudyEvidence.map(e => truncate(e.excerpt, 100)),
      evidence_ids: customerEvidence.map(e => e.evidence_id),
      confidence: sectionConfidence(customerEvidence.length),
    };
  }

  // --- 11. Populate competitors ---
  if (idx.competitorEvidence.length > 0) {
    dossier.competitors = {
      direct_competitors: idx.competitorEvidence.map(ev => ({
        name: '',       // TODO: extract competitor name from excerpt
        domain: '',     // TODO: extract competitor domain from source URL
        why_included: 'found in competitor search results',
        positioning_summary: truncate(ev.excerpt, 150),
        comparison_notes: [],
        evidence_ids: [ev.evidence_id],
      })),
      adjacent_competitors: [],
      substitutes: [],
      claimed_differentiators: [], // TODO: extract from homepage
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

  const narrativeEvidence = [...idx.siteEvidence, ...idx.reviewEvidence];

  if (narrativeEvidence.length > 0) {
    dossier.narrative_intelligence = {
      company_claimed_value: companyClaims,
      customer_expressed_value: customerExpressed,
      customer_language_patterns: [],  // TODO: NLP extraction
      narrative_gaps: [],              // TODO: gap detection from claim/customer divergence
      negative_signals: [],            // TODO: extract negative signals from reviews
      value_alignment_summary: [],     // TODO: cross-reference company vs customer themes
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
