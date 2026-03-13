/**
 * Company Context Extractor
 *
 * Extracts structured, company-specific context from upstream pipeline
 * objects (signals, tensions, patterns) for use in hypothesis and
 * implication text generation.
 *
 * The goal: make it structurally difficult for two different companies
 * to produce identical hypothesis/implication text.
 *
 * All extraction is deterministic. No LLM calls.
 */

import type { Signal } from './extract-signals.js';
import type { Tension } from './detect-tensions.js';
import type { Pattern } from './detect-patterns.js';

// ---------------------------------------------------------------------------
// CompanyContext — structured upstream summary for text interpolation
// ---------------------------------------------------------------------------

export interface CompanyContext {
  /** Human-readable company name (e.g. "Trigger.dev", "Omnea") */
  companyName: string;
  /** Raw company_id from pipeline (e.g. "trigger.dev", "omnea.co") */
  companyId: string;
  /** Inferred product domain (e.g. "background job infrastructure", "procurement orchestration") */
  productDomain: string;
  /** Dominant narrative claim (what the company says about itself) */
  narrativeClaim: string;
  /** Strongest customer reality (what customers actually experience/say) */
  customerReality: string;
  /** Inferred customer segment (e.g. "individual developers and small teams") */
  customerSegment: string;
  /** Specific capability or category the company emphasizes */
  positionedCapability: string;
  /** What buyers actually scrutinize or value */
  buyerScrutinyArea: string;
  /** Growth constraint type inferred from tensions/patterns */
  growthConstraint: string;
  /** Key normalised phrases for deduplication */
  keyPhrases: string[];
}

// ---------------------------------------------------------------------------
// Name derivation
// ---------------------------------------------------------------------------

/** Convert domain-style company_id to a human-readable name. */
function deriveCompanyName(companyId: string): string {
  // "trigger.dev" → "Trigger.dev", "omnea.co" → "Omnea", "gendo.ai" → "Gendo"
  const parts = companyId.split('.');
  if (parts.length < 2) return capitalise(companyId);

  const name = parts[0];
  const tld = parts.slice(1).join('.');

  // Preserve stylised TLDs that are part of the brand
  const brandTlds = ['dev', 'ai', 'io', 'so'];
  if (brandTlds.includes(tld)) {
    return `${capitalise(name)}.${tld}`;
  }

  return capitalise(name);
}

function capitalise(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Text extraction helpers
// ---------------------------------------------------------------------------

/** Extract the first significant clause from signal statements. */
function extractClause(text: string, maxLen = 120): string {
  // Take content before first period that is long enough
  const sentences = text.split(/\.\s+/);
  for (const s of sentences) {
    const trimmed = s.trim();
    if (trimmed.length >= 20 && trimmed.length <= maxLen) {
      return trimmed;
    }
  }
  // Fallback: truncate
  return text.slice(0, maxLen).replace(/\s+\S*$/, '').trim();
}

/**
 * Extract company language from signal statements.
 * Signals often contain patterns like "Company language emphasizes X"
 * and "customer language describes Y".
 */
function extractCompanyLanguage(statement: string): string | null {
  const match = statement.match(
    /[Cc]ompany\s+(?:language\s+)?emphasize?s?\s+(.+?)(?:,\s+while|\.)/,
  );
  return match?.[1]?.trim() ?? null;
}

function extractCustomerLanguage(statement: string): string | null {
  const match = statement.match(
    /customer\s+language\s+describes?\s+(.+?)(?:\.|$)/i,
  );
  return match?.[1]?.trim() ?? null;
}

/** Extract product domain from signal titles and statements. */
function inferProductDomain(signals: Signal[]): string {
  // Look in narrative gap signal titles first — they often contain the product domain
  for (const sig of signals) {
    if (sig.kind !== 'positioning') continue;

    // Pattern: "Narrative gap: X vs Y" — X is usually the company's framing
    const gapMatch = sig.title.match(/[Nn]arrative gap:\s*(.+?)\s+vs\.?\s+/);
    if (gapMatch) {
      return gapMatch[1].trim().toLowerCase();
    }
  }

  // Try company language from statements
  for (const sig of signals) {
    if (sig.kind !== 'positioning') continue;
    const compLang = extractCompanyLanguage(sig.statement);
    if (compLang && compLang.length < 80) {
      return compLang.toLowerCase();
    }
  }

  return 'its stated market category';
}

/** Extract what customers say they value. */
function inferCustomerReality(signals: Signal[]): string {
  // Customer-kind signals with buyer_language or customer_voice tags
  const customerSignals = signals.filter(
    s => s.kind === 'customer' && s.tags.some(t => /buyer_language|customer_voice/.test(t)),
  );

  for (const sig of customerSignals) {
    const custLang = extractCustomerLanguage(sig.statement);
    if (custLang && custLang.length < 120) return custLang;

    // Fallback: use the title's divergence phrase
    const divMatch = sig.title.match(/diverges?\s+.+?\s+toward\s+(.+)/i);
    if (divMatch) return divMatch[1].trim().toLowerCase();
  }

  // Last resort: check narrative gap signals for customer language
  for (const sig of signals) {
    if (sig.kind !== 'positioning') continue;
    const custLang = extractCustomerLanguage(sig.statement);
    if (custLang && custLang.length < 120) return custLang;
  }

  return 'observable customer behaviour';
}

/** Extract the dominant narrative claim the company makes. */
function inferNarrativeClaim(signals: Signal[]): string {
  for (const sig of signals) {
    if (sig.kind !== 'positioning') continue;
    const compLang = extractCompanyLanguage(sig.statement);
    if (compLang && compLang.length < 100) return compLang;
  }

  return 'its primary positioning narrative';
}

/** Infer customer segment from segment-related signals. */
function inferCustomerSegment(signals: Signal[]): string {
  // Look for segment_evidence, smb_signal, customer_concentration tags
  const segmentSignals = signals.filter(s =>
    s.tags.some(t => /segment_evidence|smb_signal|customer_concentration|segment_alignment/.test(t)),
  );

  for (const sig of segmentSignals) {
    // Pricing signals often describe the segment directly
    if (sig.kind === 'pricing' && sig.statement.length < 200) {
      return extractClause(sig.statement, 80);
    }
  }

  // Check customer signals for segment cues
  for (const sig of signals) {
    if (sig.kind !== 'customer') continue;
    const divMatch = sig.title.match(/diverges?\s+.+?\s+toward\s+(.+)/i);
    if (divMatch) return divMatch[1].trim().toLowerCase();
  }

  return 'the currently observable customer base';
}

/** Extract positioned capability — what the company claims as its differentiator. */
function inferPositionedCapability(signals: Signal[]): string {
  for (const sig of signals) {
    if (sig.kind !== 'positioning') continue;

    // "Narrative gap: X vs Y" — extract X as the positioned capability
    const gapMatch = sig.title.match(/[Nn]arrative gap:\s*(.+?)\s+vs\.?\s+(.+)/);
    if (gapMatch) {
      return gapMatch[1].trim().toLowerCase();
    }
  }

  return 'its stated capability';
}

/** Infer what buyers will scrutinise based on tensions. */
function inferBuyerScrutinyArea(tensions: Tension[]): string {
  // Map tension types to scrutiny areas
  const scrutinyMap: Record<string, string> = {
    positioning_vs_customer_base: 'alignment between positioning and customer evidence',
    ambition_vs_proof: 'evidence supporting growth claims',
    positioning_vs_market_fit: 'product-market fit evidence in the positioned segment',
    automation_vs_service: 'automation maturity vs service dependency',
    claim_vs_reality: 'consistency between claims and delivery reality',
    positioning_vs_delivery: 'gap between marketing narrative and actual delivery',
    vision_vs_execution: 'execution capability relative to stated vision',
    credibility_vs_claim: 'credibility of investment and technology claims',
    founder_credibility_vs_institutional_depth: 'institutional depth and team resilience',
    narrative_authority_vs_operational_scale: 'organizational maturity relative to narrative authority',
    leadership_concentration_vs_scaling: 'leadership capacity to scale beyond current operations',
  };

  // Use highest-severity tension
  const sorted = [...tensions].sort((a, b) => {
    const r = (c: string) => c === 'high' ? 3 : c === 'medium' ? 2 : 1;
    return r(b.severity) - r(a.severity);
  });

  for (const t of sorted) {
    if (scrutinyMap[t.type]) return scrutinyMap[t.type];
  }

  return 'evidence behind positioning claims';
}

/** Infer growth constraint type from patterns/tensions. */
function inferGrowthConstraint(patterns: Pattern[], tensions: Tension[]): string {
  // Pattern-level: more precise
  for (const p of patterns) {
    switch (p.pattern_type) {
      case 'dependency': return 'service delivery dependency';
      case 'misalignment': return 'narrative-operating model misalignment';
      case 'concentration': return 'credibility or capability concentration';
      case 'overextension': return 'positioning exceeding observable adoption';
      case 'gap': return 'institutional depth lagging company ambition';
      case 'fragility': return 'structural fragility in operating model';
    }
  }

  // Tension-level fallback
  if (tensions.some(t => t.type === 'automation_vs_service')) return 'service scaling dependency';
  if (tensions.some(t => t.type === 'positioning_vs_customer_base')) return 'segment alignment gap';
  if (tensions.some(t => t.type === 'ambition_vs_proof')) return 'evidence gap relative to ambition';
  if (tensions.some(t => t.type.includes('founder'))) return 'founder bandwidth constraint';

  return 'observable operational constraint';
}

/** Build normalised key phrases for deduplication. */
function buildKeyPhrases(ctx: Omit<CompanyContext, 'keyPhrases'>): string[] {
  const phrases: string[] = [];

  // Company name is always a key phrase
  phrases.push(normalise(ctx.companyName));

  // Product domain
  if (ctx.productDomain !== 'its stated market category') {
    phrases.push(normalise(ctx.productDomain));
  }

  // Customer segment
  if (ctx.customerSegment !== 'the currently observable customer base') {
    phrases.push(normalise(ctx.customerSegment));
  }

  // Growth constraint
  if (ctx.growthConstraint !== 'observable operational constraint') {
    phrases.push(normalise(ctx.growthConstraint));
  }

  // Positioned capability
  if (ctx.positionedCapability !== 'its stated capability') {
    phrases.push(normalise(ctx.positionedCapability));
  }

  return phrases;
}

/** Normalise text for comparison: lowercase, strip stop words, sort. */
function normalise(text: string): string {
  const stops = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'may',
    'might', 'must', 'can', 'could', 'of', 'in', 'to', 'for', 'with', 'on', 'at', 'from',
    'by', 'about', 'as', 'into', 'through', 'during', 'before', 'after', 'and', 'but', 'or',
    'not', 'no', 'its', 'it', 'that', 'this', 'than', 'vs', 'versus']);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !stops.has(w))
    .sort()
    .join(' ');
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export function extractCompanyContext(
  signals: Signal[],
  tensions: Tension[],
  patterns: Pattern[],
): CompanyContext {
  const companyId = signals[0]?.company_id ?? tensions[0]?.company_id ?? 'unknown';
  const companyName = deriveCompanyName(companyId);
  const productDomain = inferProductDomain(signals);
  const narrativeClaim = inferNarrativeClaim(signals);
  const customerReality = inferCustomerReality(signals);
  const customerSegment = inferCustomerSegment(signals);
  const positionedCapability = inferPositionedCapability(signals);
  const buyerScrutinyArea = inferBuyerScrutinyArea(tensions);
  const growthConstraint = inferGrowthConstraint(patterns, tensions);

  const partial = {
    companyName,
    companyId,
    productDomain,
    narrativeClaim,
    customerReality,
    customerSegment,
    positionedCapability,
    buyerScrutinyArea,
    growthConstraint,
  };

  return {
    ...partial,
    keyPhrases: buildKeyPhrases(partial),
  };
}

// Re-export normalise for use in deduplication
export { normalise };
