/**
 * Dossier validator.
 * Usage: npx tsx src/validate.ts <path-to-dossier.json>
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
 *
 * Writes validation-report.json alongside the dossier.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import _Ajv from 'ajv';
import _addFormats from 'ajv-formats';

// Handle CJS default export under NodeNext resolution
const Ajv = _Ajv as unknown as typeof _Ajv.default;
const addFormats = _addFormats as unknown as typeof _addFormats.default;
import { EVIDENCE_TYPES } from './types/evidence.js';

// --- Types for validation report ---

interface ValidationReport {
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
function collectValues(obj: unknown, key: string): unknown[] {
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
function isSectionPopulated(section: unknown): boolean {
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

function validate(dossierPath: string): ValidationReport {
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

  // 11. Section stats
  const contentSections = [
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
  ];

  let sectionsPopulated = 0;
  let sectionsEmpty = 0;
  for (const section of contentSections) {
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

// --- CLI ---

const dossierPath = process.argv[2];
if (!dossierPath) {
  console.error('Usage: npx tsx src/validate.ts <path-to-dossier.json>');
  process.exit(1);
}

const report = validate(dossierPath);

// Write report next to dossier
const reportPath = join(dirname(dossierPath), 'validation-report.json');
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

// Console output
console.log(`\nValidation Report for: ${dossierPath}`);
console.log(`${'─'.repeat(50)}`);
console.log(`Valid:            ${report.valid ? 'YES' : 'NO'}`);
console.log(`Schema valid:     ${report.schema_valid ? 'YES' : 'NO'}`);
console.log(`Evidence links:   ${report.evidence_links_valid ? 'YES' : 'NO'}`);
console.log(`Source links:     ${report.source_links_valid ? 'YES' : 'NO'}`);
console.log(`Sources:          ${report.stats.source_count}`);
console.log(`Evidence records: ${report.stats.evidence_count}`);
console.log(`Sections populated: ${report.stats.sections_populated} / ${report.stats.sections_populated + report.stats.sections_empty}`);
console.log(`Evidence refs:    ${report.stats.evidence_ids_resolved}/${report.stats.evidence_ids_referenced} resolved`);
console.log(`Source refs:      ${report.stats.source_ids_resolved}/${report.stats.source_ids_referenced} resolved`);

if (report.errors.length > 0) {
  console.log(`\nErrors (${report.errors.length}):`);
  for (const err of report.errors) {
    console.log(`  [ERROR] ${err}`);
  }
}

if (report.warnings.length > 0) {
  console.log(`\nWarnings (${report.warnings.length}):`);
  for (const warn of report.warnings) {
    console.log(`  [WARN]  ${warn}`);
  }
}

console.log(`\nReport written to: ${reportPath}`);
process.exit(report.valid ? 0 : 1);
