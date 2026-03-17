/**
 * Corpus Enrichment — V3-U3.5
 *
 * LLM extraction stage that produces structured fields from raw corpus text.
 * Uses Haiku 4.5 for speed/cost, with provenance checking to prevent hallucination.
 *
 * Design:
 *   - Input: ResearchCorpus (raw text from site pages + external sources + community mentions)
 *   - Output: EnrichmentResult with 12 signal-critical fields
 *   - Provenance: case-insensitive substring check against corpus text
 *   - Cap: 20 evidence items, prioritized by source tier (3 → 2 → 1)
 *   - Fallback: empty EnrichmentResult on any failure (never throws)
 *
 * Error handling:
 *   - LLM timeout → fallback
 *   - Malformed JSON → strip markdown fences, retry parse → fallback
 *   - LLM refusal → fallback
 *   - No client / no API key → fallback with WARN_ENRICHMENT_NO_CLIENT
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ResearchCorpus, SourceTier } from '../types/research-corpus.js';
import type { EnrichmentResult } from '../types/enrichment.js';
import { now } from '../../utils/timestamps.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface EnrichCorpusConfig {
  /** Injected Anthropic client — used in tests to avoid live API calls */
  client?: Anthropic;
  model?: string;
  max_tokens?: number;
  timeout_ms?: number;
}

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_MAX_TOKENS = 2000;
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_EVIDENCE_ITEMS = 20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CorpusItem {
  id: string;
  text: string;
  type: string;
  tier: SourceTier;
}

/** Select up to MAX_EVIDENCE_ITEMS corpus items, prioritized by tier (3 → 2 → 1 → 4 → 5). */
function selectEvidenceItems(corpus: ResearchCorpus): CorpusItem[] {
  const items: CorpusItem[] = [];

  for (let i = 0; i < corpus.site_pages.length; i++) {
    const page = corpus.site_pages[i]!;
    items.push({
      id: `site_${i}`,
      text: page.raw_text,
      type: page.page_type,
      tier: page.source_tier,
    });
  }
  for (let i = 0; i < corpus.external_sources.length; i++) {
    const source = corpus.external_sources[i]!;
    items.push({
      id: `ext_${i}`,
      text: source.excerpt,
      type: source.source_type,
      tier: source.source_tier,
    });
  }
  for (let i = 0; i < corpus.community_mentions.length; i++) {
    const mention = corpus.community_mentions[i]!;
    items.push({
      id: `comm_${i}`,
      text: mention.excerpt,
      type: mention.platform,
      tier: mention.source_tier,
    });
  }

  // Priority order: Tier 3 (customer/market) first, then 2, 1, 4, 5
  const tierPriority: Record<number, number> = { 3: 0, 2: 1, 1: 2, 4: 3, 5: 4 };
  items.sort((a, b) => (tierPriority[a.tier] ?? 5) - (tierPriority[b.tier] ?? 5));

  return items.slice(0, MAX_EVIDENCE_ITEMS);
}

/** Collect all raw text from corpus for provenance checking. */
function collectCorpusText(corpus: ResearchCorpus): string[] {
  const texts: string[] = [];
  for (const page of corpus.site_pages) texts.push(page.raw_text);
  for (const source of corpus.external_sources) texts.push(source.excerpt);
  for (const mention of corpus.community_mentions) texts.push(mention.excerpt);
  for (const stmt of corpus.founder_statements) texts.push(stmt.excerpt);
  return texts;
}

/** Case-insensitive substring check against any corpus text. */
function hasProvenance(value: string, corpusTexts: string[]): boolean {
  const lower = value.toLowerCase();
  return corpusTexts.some(text => text.toLowerCase().includes(lower));
}

function makeFallbackResult(model: string, latencyMs: number): EnrichmentResult {
  return {
    extracted_at: now(),
    model,
    latency_ms: latencyMs,
    fallback: true,
    fields: {
      category: null,
      company_stage: null,
      founded_year: null,
      leadership: null,
      competitors: null,
      pricing_signals: null,
      delivery_model: null,
      customer_pain_themes: null,
      acquisition_channels: null,
      narrative_gaps: null,
      value_alignment_summary: null,
    },
    provenance: {
      fields_extracted: 0,
      fields_null: 0,
      fields_rejected_provenance: 0,
      rejected_details: [],
    },
  };
}

/** Strip markdown code fences from LLM response. */
function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\n?/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a structured data extractor. Extract ONLY what is explicitly stated or directly implied in the evidence text. Never invent names, dates, or facts. If a field cannot be extracted, return null for that field.

Output valid JSON matching the exact schema provided. No extra commentary.`;

function buildUserPrompt(
  company: string,
  domain: string,
  items: CorpusItem[],
): string {
  const evidence = items.map(item => ({
    id: item.id,
    text: item.text.slice(0, 2000), // Cap per-item to avoid token overflow
    type: item.type,
    tier: item.tier,
  }));

  return `Extract structured fields from the following evidence about "${company}" (${domain}).

Evidence:
${JSON.stringify(evidence, null, 2)}

Return JSON matching this exact schema:
{
  "category": "<string: company category e.g. 'Developer Tools', 'HR Tech'> or null",
  "company_stage": "<string: e.g. 'seed', 'series-a', 'growth', 'public'> or null",
  "founded_year": "<number: 4-digit year> or null",
  "leadership": [{"name": "<full name>", "role": "<title>"}] or null,
  "competitors": [{"name": "<company name>", "domain": "<domain.com>"}] or null,
  "pricing_signals": ["<string: pricing-related observation>"] or null,
  "delivery_model": ["<string: e.g. 'SaaS', 'on-prem', 'API'>"] or null,
  "customer_pain_themes": ["<string: recurring pain point>"] or null,
  "acquisition_channels": ["<string: e.g. 'organic search', 'PLG', 'outbound sales'>"] or null,
  "narrative_gaps": [{"gap_name": "<string>", "company_language": ["<string>"], "customer_language": ["<string>"], "gap_description": "<string>", "likely_business_impact": ["<string>"], "suggested_repositioning_direction": "<string>", "evidence_ids": ["<id from evidence above>"], "confidence": "low"|"medium"|"high"}] or null,
  "value_alignment_summary": [{"theme": "<string>", "alignment": "aligned"|"divergent"|"company_only"|"customer_only", "company_language": ["<string>"], "customer_language": ["<string>"], "business_implication": "<string>", "evidence_ids": ["<id from evidence above>"], "confidence": "low"|"medium"|"high"}] or null
}`;
}

// ---------------------------------------------------------------------------
// LLM client
// ---------------------------------------------------------------------------

function getClient(injected?: Anthropic): Anthropic | null {
  if (injected) return injected;
  const key = process.env['ANTHROPIC_API_KEY'];
  if (!key) {
    console.warn('WARN_ENRICHMENT_NO_CLIENT: ANTHROPIC_API_KEY not set, skipping enrichment');
    return null;
  }
  return new Anthropic({ apiKey: key });
}

// ---------------------------------------------------------------------------
// Provenance checking
// ---------------------------------------------------------------------------

interface RawFields {
  category?: string | null;
  company_stage?: string | null;
  founded_year?: number | null;
  leadership?: Array<{ name: string; role: string }> | null;
  competitors?: Array<{ name: string; domain: string }> | null;
  pricing_signals?: string[] | null;
  delivery_model?: string[] | null;
  customer_pain_themes?: string[] | null;
  acquisition_channels?: string[] | null;
  narrative_gaps?: unknown[] | null;
  value_alignment_summary?: unknown[] | null;
}

function checkProvenance(
  raw: RawFields,
  corpusTexts: string[],
  evidenceItemIds: Set<string>,
): { fields: EnrichmentResult['fields']; provenance: EnrichmentResult['provenance'] } {
  let fieldsExtracted = 0;
  let fieldsNull = 0;
  let fieldsRejected = 0;
  const rejectedDetails: Array<{ field: string; value: string; reason: string }> = [];

  const countField = (value: unknown) => {
    if (value === null || value === undefined) fieldsNull++;
    else fieldsExtracted++;
  };

  // Simple pass-through fields (type validation only)
  const category = typeof raw.category === 'string' ? raw.category : null;
  countField(category);

  const company_stage = typeof raw.company_stage === 'string' ? raw.company_stage : null;
  countField(company_stage);

  const founded_year = typeof raw.founded_year === 'number' &&
    raw.founded_year >= 1900 && raw.founded_year <= 2030
    ? raw.founded_year : null;
  countField(founded_year);

  // Provenance-checked fields
  let leadership: EnrichmentResult['fields']['leadership'] = null;
  if (Array.isArray(raw.leadership) && raw.leadership.length > 0) {
    const checked = raw.leadership.filter(l => {
      if (!l.name || typeof l.name !== 'string') return false;
      if (hasProvenance(l.name, corpusTexts)) return true;
      fieldsRejected++;
      rejectedDetails.push({ field: 'leadership', value: l.name, reason: 'name not found in corpus' });
      return false;
    });
    leadership = checked.length > 0 ? checked : null;
  }
  countField(leadership);

  let competitors: EnrichmentResult['fields']['competitors'] = null;
  if (Array.isArray(raw.competitors) && raw.competitors.length > 0) {
    const checked = raw.competitors.filter(c => {
      if (!c.name || typeof c.name !== 'string') return false;
      if (hasProvenance(c.name, corpusTexts)) return true;
      fieldsRejected++;
      rejectedDetails.push({ field: 'competitors', value: c.name, reason: 'name not found in corpus' });
      return false;
    }).map(c => ({ name: c.name, domain: c.domain ?? '', evidence_id: '' }));
    competitors = checked.length > 0 ? checked : null;
  }
  countField(competitors);

  const pricing_signals = Array.isArray(raw.pricing_signals) && raw.pricing_signals.length > 0
    ? raw.pricing_signals.filter(s => typeof s === 'string') : null;
  countField(pricing_signals);

  const delivery_model = Array.isArray(raw.delivery_model) && raw.delivery_model.length > 0
    ? raw.delivery_model.filter(s => typeof s === 'string') : null;
  countField(delivery_model);

  const customer_pain_themes = Array.isArray(raw.customer_pain_themes) && raw.customer_pain_themes.length > 0
    ? raw.customer_pain_themes.filter(s => typeof s === 'string') : null;
  countField(customer_pain_themes);

  const acquisition_channels = Array.isArray(raw.acquisition_channels) && raw.acquisition_channels.length > 0
    ? raw.acquisition_channels.filter(s => typeof s === 'string') : null;
  countField(acquisition_channels);

  // Complex fields — validate evidence_ids reference real corpus items
  let narrative_gaps: EnrichmentResult['fields']['narrative_gaps'] = null;
  if (Array.isArray(raw.narrative_gaps) && raw.narrative_gaps.length > 0) {
    const validGaps = (raw.narrative_gaps as Array<Record<string, unknown>>)
      .filter(g => typeof g.gap_name === 'string' && typeof g.gap_description === 'string')
      .map(g => ({
        gap_name: g.gap_name as string,
        company_language: Array.isArray(g.company_language) ? g.company_language as string[] : [],
        customer_language: Array.isArray(g.customer_language) ? g.customer_language as string[] : [],
        gap_description: g.gap_description as string,
        likely_business_impact: Array.isArray(g.likely_business_impact) ? g.likely_business_impact as string[] : [],
        suggested_repositioning_direction: typeof g.suggested_repositioning_direction === 'string'
          ? g.suggested_repositioning_direction : '',
        evidence_ids: Array.isArray(g.evidence_ids)
          ? (g.evidence_ids as string[]).filter(id => evidenceItemIds.has(id))
          : [],
        confidence: (['low', 'medium', 'high'].includes(g.confidence as string)
          ? g.confidence : 'low') as 'low' | 'medium' | 'high',
      }));
    narrative_gaps = validGaps.length > 0 ? validGaps : null;
  }
  countField(narrative_gaps);

  let value_alignment_summary: EnrichmentResult['fields']['value_alignment_summary'] = null;
  if (Array.isArray(raw.value_alignment_summary) && raw.value_alignment_summary.length > 0) {
    const validAlignments = ['aligned', 'divergent', 'company_only', 'customer_only'];
    const validEntries = (raw.value_alignment_summary as Array<Record<string, unknown>>)
      .filter(v => typeof v.theme === 'string' && validAlignments.includes(v.alignment as string))
      .map(v => ({
        theme: v.theme as string,
        alignment: v.alignment as 'aligned' | 'divergent' | 'company_only' | 'customer_only',
        company_language: Array.isArray(v.company_language) ? v.company_language as string[] : [],
        customer_language: Array.isArray(v.customer_language) ? v.customer_language as string[] : [],
        business_implication: typeof v.business_implication === 'string' ? v.business_implication : '',
        evidence_ids: Array.isArray(v.evidence_ids)
          ? (v.evidence_ids as string[]).filter(id => evidenceItemIds.has(id))
          : [],
        confidence: (['low', 'medium', 'high'].includes(v.confidence as string)
          ? v.confidence : 'low') as 'low' | 'medium' | 'high',
      }));
    value_alignment_summary = validEntries.length > 0 ? validEntries : null;
  }
  countField(value_alignment_summary);

  return {
    fields: {
      category,
      company_stage,
      founded_year,
      leadership,
      competitors,
      pricing_signals,
      delivery_model,
      customer_pain_themes,
      acquisition_channels,
      narrative_gaps,
      value_alignment_summary,
    },
    provenance: {
      fields_extracted: fieldsExtracted,
      fields_null: fieldsNull,
      fields_rejected_provenance: fieldsRejected,
      rejected_details: rejectedDetails,
    },
  };
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function enrichCorpus(
  corpus: ResearchCorpus,
  company: string,
  config: EnrichCorpusConfig = {},
): Promise<EnrichmentResult> {
  const model = config.model ?? DEFAULT_MODEL;
  const maxTokens = config.max_tokens ?? DEFAULT_MAX_TOKENS;
  const timeoutMs = config.timeout_ms ?? DEFAULT_TIMEOUT_MS;

  const items = selectEvidenceItems(corpus);

  if (items.length === 0) {
    console.log('ENRICHMENT_SKIP: no evidence items to enrich');
    return makeFallbackResult(model, 0);
  }

  const client = getClient(config.client);
  if (!client) {
    return makeFallbackResult(model, 0);
  }

  const totalChars = items.reduce((sum, item) => sum + item.text.length, 0);
  console.log('ENRICHMENT_START:', JSON.stringify({
    evidence_count: items.length,
    total_chars: totalChars,
    model,
  }));

  const t0 = Date.now();

  try {
    const response = await Promise.race([
      client.messages.create({
        model,
        max_tokens: maxTokens,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: buildUserPrompt(company, corpus.domain, items),
        }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('ENRICHMENT_TIMEOUT')), timeoutMs)
      ),
    ]);

    const latencyMs = Date.now() - t0;

    // Extract text from response
    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      console.warn('ENRICHMENT_FAILURE:', JSON.stringify({ error_type: 'no_text_block', error_message: 'no text in response' }));
      return makeFallbackResult(model, latencyMs);
    }

    const rawText = textBlock.text;

    // Check for LLM refusal
    if (rawText.startsWith('I cannot') || rawText.startsWith("I'm sorry") || rawText.startsWith('I apologize')) {
      console.warn('ENRICHMENT_FAILURE:', JSON.stringify({ error_type: 'llm_refusal', error_message: rawText.slice(0, 100) }));
      return makeFallbackResult(model, latencyMs);
    }

    // Parse JSON — strip markdown fences if present
    let parsed: RawFields;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      try {
        parsed = JSON.parse(stripCodeFences(rawText));
      } catch {
        console.warn('ENRICHMENT_FAILURE:', JSON.stringify({ error_type: 'json_parse', error_message: 'malformed JSON from LLM' }));
        return makeFallbackResult(model, latencyMs);
      }
    }

    // Provenance checking
    const corpusTexts = collectCorpusText(corpus);
    const evidenceItemIds = new Set(items.map(i => i.id));
    const { fields, provenance } = checkProvenance(parsed, corpusTexts, evidenceItemIds);

    console.log('ENRICHMENT_COMPLETE:', JSON.stringify({
      fields_extracted: provenance.fields_extracted,
      fields_null: provenance.fields_null,
      fields_rejected: provenance.fields_rejected_provenance,
      latency_ms: latencyMs,
      fallback: false,
    }));

    return {
      extracted_at: now(),
      model,
      latency_ms: latencyMs,
      fallback: false,
      fields,
      provenance,
    };

  } catch (err) {
    const latencyMs = Date.now() - t0;
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorType = errorMessage === 'ENRICHMENT_TIMEOUT' ? 'timeout' : 'api_error';

    console.warn('ENRICHMENT_FAILURE:', JSON.stringify({
      error_type: errorType,
      error_message: errorMessage,
    }));

    return makeFallbackResult(model, latencyMs);
  }
}

// Exported for testing
export { selectEvidenceItems, checkProvenance, stripCodeFences, hasProvenance };
export type { CorpusItem, RawFields };
