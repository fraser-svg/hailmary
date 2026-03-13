/**
 * Core validation logic for dossier files.
 * Importable module — no CLI, no process.exit, no side effects.
 *
 * Checks:
 * 1. JSON parse
 * 2. Schema validation (ajv)
 * 3. Evidence ID resolution (every referenced evidence_id exists)
 * 4. Source ID resolution (every evidence record's source_id exists)
 * 5. Confidence enum validity
 * 6. Evidence type vocabulary
 * 7. Inference labeling (warning for missing evidence_ids on inferred items)
 * 8. Narrative gap evidence requirements (hard check)
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import _Ajv from 'ajv';
import _addFormats from 'ajv-formats';

// Handle CJS default export under NodeNext resolution
const Ajv = _Ajv as unknown as typeof _Ajv.default;
const addFormats = _addFormats as unknown as typeof _addFormats.default;
import { EVIDENCE_TYPES } from './types/evidence.js';

// --- Constants ---

/** The 10 content sections of a dossier (excludes company_input, run_metadata, sources, evidence). */
export const CONTENT_SECTIONS = [
  'company_profile',
  'product_and_offer',
  'gtm_model',
  'customer_and_personas',
  'competitors',
  'market_and_macro',
  'signals',
  'narrative_intelligence',
  'strategic_risks',
  'confidence_and_gaps',
] as const;

// --- Types ---

export interface ValidationReport {
  valid: boolean;
  schema_valid: boolean;
  evidence_links_valid: boolean;
  source_links_valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    source_count: number;
    evidence_count: number;
    sections_populated: number;
    sections_empty: number;
    evidence_ids_referenced: number;
    evidence_ids_resolved: number;
    source_ids_referenced: number;
    source_ids_resolved: number;
  };
}

// --- Helpers ---

/** Recursively find all values for a given key in a nested object. */
export function collectValues(obj: unknown, key: string): unknown[] {
  const results: unknown[] = [];
  if (obj === null || typeof obj !== 'object') return results;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      results.push(...collectValues(item, key));
    }
  } else {
    const record = obj as Record<string, unknown>;
    for (const [k, v] of Object.entries(record)) {
      if (k === key) {
        if (Array.isArray(v)) {
          results.push(...v);
        } else {
          results.push(v);
        }
      } else {
        results.push(...collectValues(v, key));
      }
    }
  }
  return results;
}

/** Check if a dossier section has any populated (non-empty) content. */
export function isSectionPopulated(section: unknown): boolean {
  if (section === null || section === undefined) return false;
  if (typeof section === 'string') return section.length > 0;
  if (typeof section === 'number') return true;
  if (Array.isArray(section)) return section.length > 0;
  if (typeof section === 'object') {
    for (const [key, value] of Object.entries(section as Record<string, unknown>)) {
      if (key === 'confidence' || key === 'is_inferred') continue;
      if (isSectionPopulated(value)) return true;
    }
  }
  return false;
}

// --- Main ---

export function validate(dossierPath: string): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. JSON parse
  let dossier: Record<string, unknown>;
  try {
    const raw = readFileSync(dossierPath, 'utf-8');
    dossier = JSON.parse(raw);
  } catch (e) {
    return {
      valid: false,
      schema_valid: false,
      evidence_links_valid: false,
      source_links_valid: false,
      errors: [`JSON parse error: ${(e as Error).message}`],
      warnings: [],
      stats: {
        source_count: 0,
        evidence_count: 0,
        sections_populated: 0,
        sections_empty: 0,
        evidence_ids_referenced: 0,
        evidence_ids_resolved: 0,
        source_ids_referenced: 0,
        source_ids_resolved: 0,
      },
    };
  }

  // 2. Schema validation
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  const schemaPath = join(import.meta.dirname ?? process.cwd(), '..', 'schemas', 'company-dossier.schema.json');
  const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
  const validateSchema = ajv.compile(schema);
  const schemaValid = validateSchema(dossier);

  if (!schemaValid && validateSchema.errors) {
    for (const err of validateSchema.errors) {
      errors.push(`Schema: ${err.instancePath || '/'} ${err.message} ${err.params ? JSON.stringify(err.params) : ''}`);
    }
  }

  // 3. Build lookup sets
  const sources = (dossier.sources as Array<Record<string, unknown>>) ?? [];
  const evidence = (dossier.evidence as Array<Record<string, unknown>>) ?? [];

  const sourceIdSet = new Set(sources.map((s) => s.source_id as string));
  const evidenceIdSet = new Set(evidence.map((e) => e.evidence_id as string));

  // 4. Collect all evidence_id references from dossier (excluding the evidence array itself)
  const dossierWithoutEvidence = { ...dossier };
  delete dossierWithoutEvidence.evidence;
  delete dossierWithoutEvidence.sources;

  const referencedEvidenceIds = new Set(
    collectValues(dossierWithoutEvidence, 'evidence_ids').filter(
      (v): v is string => typeof v === 'string',
    ),
  );

  // 5. Validate evidence ID resolution
  let evidenceLinksValid = true;
  for (const refId of referencedEvidenceIds) {
    if (!evidenceIdSet.has(refId)) {
      errors.push(`Evidence link: referenced evidence_id "${refId}" not found in evidence array`);
      evidenceLinksValid = false;
    }
  }

  // 6. Validate source ID resolution
  let sourceLinksValid = true;
  for (const ev of evidence) {
    const sourceId = ev.source_id as string;
    if (!sourceIdSet.has(sourceId)) {
      errors.push(`Source link: evidence "${ev.evidence_id}" references source_id "${sourceId}" not found in sources array`);
      sourceLinksValid = false;
    }
  }

  // 7. Validate confidence values
  const allConfidenceValues = collectValues(dossier, 'confidence');
  for (const conf of allConfidenceValues) {
    if (typeof conf === 'string' && !['low', 'medium', 'high'].includes(conf)) {
      errors.push(`Confidence: invalid value "${conf}" (must be low/medium/high)`);
    }
  }

  // 8. Validate evidence types
  for (const ev of evidence) {
    const evType = ev.evidence_type as string;
    if (!EVIDENCE_TYPES.includes(evType)) {
      warnings.push(`Evidence type: "${evType}" on ${ev.evidence_id} is not in controlled vocabulary`);
    }
  }

  // 9. Inference labeling check
  for (const ev of evidence) {
    if (ev.is_inferred === true) {
      const evIds = ev.evidence_ids as string[] | undefined;
      if (!evIds || evIds.length === 0) {
        warnings.push(`Inference: evidence "${ev.evidence_id}" is inferred but has no supporting evidence_ids`);
      }
    }
  }

  // 10. Narrative gap evidence requirements (hard check)
  const narrativeIntelligence = dossier.narrative_intelligence as Record<string, unknown> | undefined;
  if (narrativeIntelligence) {
    const gaps = (narrativeIntelligence.narrative_gaps as Array<Record<string, unknown>>) ?? [];
    for (const gap of gaps) {
      const gapName = gap.gap_name as string;
      const companyLang = gap.company_language as string[];
      const customerLang = gap.customer_language as string[];
      const gapEvIds = gap.evidence_ids as string[];
      const confidence = gap.confidence as string;

      if (confidence !== 'low') {
        if (!companyLang || companyLang.length < 1) {
          errors.push(`Narrative gap "${gapName}": needs >=1 company_language entry for ${confidence} confidence`);
        }
        if (!customerLang || customerLang.length < 2) {
          errors.push(`Narrative gap "${gapName}": needs >=2 customer_language entries for ${confidence} confidence`);
        }
        if (!gapEvIds || gapEvIds.length === 0) {
          errors.push(`Narrative gap "${gapName}": needs evidence_ids for ${confidence} confidence`);
        }
      }
    }
  }

  // 11. Orphan evidence (not referenced by any section)
  for (const ev of evidence) {
    const evId = ev.evidence_id as string;
    if (!referencedEvidenceIds.has(evId)) {
      warnings.push(`Orphan evidence: "${evId}" is not referenced by any section's evidence_ids`);
    }
  }

  // 12. Unused sources (not referenced by any evidence record)
  const referencedSourceIds = new Set(evidence.map((e) => e.source_id as string));
  for (const src of sources) {
    const srcId = src.source_id as string;
    if (!referencedSourceIds.has(srcId)) {
      warnings.push(`Unused source: "${srcId}" is not referenced by any evidence record`);
    }
  }

  // 13. Single-source confidence ceiling
  const evidenceById = new Map(evidence.map((e) => [e.evidence_id as string, e]));
  for (const sectionName of CONTENT_SECTIONS) {
    const section = dossier[sectionName] as Record<string, unknown> | undefined;
    if (!section) continue;
    const sectionEvIds = (section.evidence_ids as string[]) ?? [];
    if (sectionEvIds.length === 0) continue;
    const sectionConfidence = section.confidence as string;
    if (sectionConfidence === 'low') continue;

    const sourcesForSection = new Set<string>();
    for (const evId of sectionEvIds) {
      const ev = evidenceById.get(evId);
      if (ev) sourcesForSection.add(ev.source_id as string);
    }
    if (sourcesForSection.size === 1) {
      warnings.push(`Single-source confidence: "${sectionName}" has confidence "${sectionConfidence}" but all evidence comes from 1 source`);
    }
  }

  // 14. Tier-ceiling: all evidence from Tier 4-5 sources + confidence > "low"
  const sourceTierById = new Map(sources.map((s) => [s.source_id as string, s.source_tier as number]));
  for (const sectionName of CONTENT_SECTIONS) {
    const section = dossier[sectionName] as Record<string, unknown> | undefined;
    if (!section) continue;
    const sectionEvIds = (section.evidence_ids as string[]) ?? [];
    if (sectionEvIds.length === 0) continue;
    const sectionConfidence = section.confidence as string;
    if (sectionConfidence === 'low') continue;

    const tiers = sectionEvIds
      .map((evId) => evidenceById.get(evId))
      .filter(Boolean)
      .map((ev) => sourceTierById.get(ev!.source_id as string) ?? 0);

    if (tiers.length > 0 && tiers.every((t) => t >= 4)) {
      warnings.push(`Tier-ceiling: "${sectionName}" has confidence "${sectionConfidence}" but all evidence comes from Tier 4-5 sources`);
    }
  }

  // 15. Customer-truth tier: narrative gap customer evidence only from Tier 4-5
  const CUSTOMER_EVIDENCE_TYPES = new Set([
    'testimonial_record', 'review_record', 'customer_language_record', 'customer_value_record',
    'case_study_record', 'pain_point_record', 'outcome_record', 'persona_signal_record',
  ]);
  if (narrativeIntelligence) {
    const gaps = (narrativeIntelligence.narrative_gaps as Array<Record<string, unknown>>) ?? [];
    for (const gap of gaps) {
      const gapName = gap.gap_name as string;
      const gapEvIds = gap.evidence_ids as string[] ?? [];

      const customerEvRecords = gapEvIds
        .map((evId) => evidenceById.get(evId))
        .filter((ev): ev is Record<string, unknown> => ev !== undefined && CUSTOMER_EVIDENCE_TYPES.has(ev.evidence_type as string));

      if (customerEvRecords.length > 0) {
        const customerTiers = customerEvRecords
          .map((ev) => sourceTierById.get(ev.source_id as string) ?? 0);
        if (customerTiers.every((t) => t >= 4)) {
          warnings.push(`Customer-truth tier: narrative gap "${gapName}" customer evidence comes only from Tier 4-5 sources`);
        }
      }
    }
  }

  // 16. Source-quality consistency: source_quality "high" but source is Tier 4-5
  for (const ev of evidence) {
    const sourceQuality = ev.source_quality as string;
    if (sourceQuality === 'high') {
      const tier = sourceTierById.get(ev.source_id as string) ?? 0;
      if (tier >= 4) {
        warnings.push(`Source-quality consistency: evidence "${ev.evidence_id}" has source_quality "high" but source is Tier ${tier}`);
      }
    }
  }

  // --- Phase 4: Narrative gap traceability warnings ---

  const COMPANY_EVIDENCE_TYPES = new Set([
    'company_claim_record', 'positioning_record', 'content_record',
  ]);
  const GAP_CUSTOMER_EVIDENCE_TYPES = new Set([
    'testimonial_record', 'review_record', 'customer_language_record', 'customer_value_record',
  ]);

  if (narrativeIntelligence) {
    const gaps = (narrativeIntelligence.narrative_gaps as Array<Record<string, unknown>>) ?? [];
    for (const gap of gaps) {
      const gapName = gap.gap_name as string;
      const gapEvIds = (gap.evidence_ids as string[]) ?? [];
      const companyLang = (gap.company_language as string[]) ?? [];
      const customerLang = (gap.customer_language as string[]) ?? [];

      const gapEvRecords = gapEvIds
        .map((evId) => evidenceById.get(evId))
        .filter((ev): ev is Record<string, unknown> => ev !== undefined);

      // 18. Gap company evidence link
      const hasCompanyEvidence = gapEvRecords.some((ev) =>
        COMPANY_EVIDENCE_TYPES.has(ev.evidence_type as string));
      if (!hasCompanyEvidence) {
        warnings.push(`Narrative gap "${gapName}": narrative gap missing company-side evidence`);
      }

      // 19. Gap customer evidence link
      const customerEvCount = gapEvRecords.filter((ev) =>
        GAP_CUSTOMER_EVIDENCE_TYPES.has(ev.evidence_type as string)).length;
      if (customerEvCount < 2) {
        warnings.push(`Narrative gap "${gapName}": narrative gap missing sufficient customer evidence`);
      }

      // 20. Gap language traceability
      const allExcerpts = gapEvRecords.map((ev) => (ev.excerpt as string).toLowerCase());
      const allLangStrings = [...companyLang, ...customerLang];
      for (const lang of allLangStrings) {
        const langLower = lang.toLowerCase();
        if (!allExcerpts.some((excerpt) => excerpt.includes(langLower))) {
          warnings.push(`Narrative gap "${gapName}": narrative gap language not traceable to evidence excerpts`);
          break; // one warning per gap is sufficient
        }
      }

      // 21. Gap evidence role separation
      const companyEvIds = new Set(
        gapEvRecords
          .filter((ev) => allExcerpts.length > 0) // only check if we have excerpts
          .filter((ev) => {
            const excerpt = (ev.excerpt as string).toLowerCase();
            return companyLang.some((lang) => excerpt.includes(lang.toLowerCase()));
          })
          .map((ev) => ev.evidence_id as string),
      );
      const customerEvIds = new Set(
        gapEvRecords
          .filter((ev) => {
            const excerpt = (ev.excerpt as string).toLowerCase();
            return customerLang.some((lang) => excerpt.includes(lang.toLowerCase()));
          })
          .map((ev) => ev.evidence_id as string),
      );
      if (companyEvIds.size > 0 && customerEvIds.size > 0) {
        const overlap = [...companyEvIds].some((id) => customerEvIds.has(id));
        if (overlap) {
          warnings.push(`Narrative gap "${gapName}": narrative gap contradiction supported by same evidence source`);
        }
      }
    }
  }

  // 17. Section stats
  let sectionsPopulated = 0;
  let sectionsEmpty = 0;
  for (const section of CONTENT_SECTIONS) {
    if (isSectionPopulated(dossier[section])) {
      sectionsPopulated++;
    } else {
      sectionsEmpty++;
    }
  }

  const report: ValidationReport = {
    valid: errors.length === 0,
    schema_valid: schemaValid as boolean,
    evidence_links_valid: evidenceLinksValid,
    source_links_valid: sourceLinksValid,
    errors,
    warnings,
    stats: {
      source_count: sources.length,
      evidence_count: evidence.length,
      sections_populated: sectionsPopulated,
      sections_empty: sectionsEmpty,
      evidence_ids_referenced: referencedEvidenceIds.size,
      evidence_ids_resolved: [...referencedEvidenceIds].filter((id) => evidenceIdSet.has(id)).length,
      source_ids_referenced: new Set(evidence.map((e) => e.source_id)).size,
      source_ids_resolved: [...new Set(evidence.map((e) => e.source_id as string))].filter((id) => sourceIdSet.has(id)).length,
    },
  };

  return report;
}
