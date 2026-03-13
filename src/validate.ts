/**
 * Dossier validator CLI.
 * Usage: npx tsx src/validate.ts <path-to-dossier.json>
 *
 * Thin wrapper around validate-core.ts — all logic lives there.
 * Writes validation-report.json alongside the dossier.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { validate } from './validate-core.js';
import type { ValidationReport } from './validate-core.js';

// --- CLI ---

const dossierPath = process.argv[2];
if (!dossierPath) {
  console.error('Usage: npx tsx src/validate.ts <path-to-dossier.json>');
  process.exit(1);
}

const report: ValidationReport = validate(dossierPath);

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

// Summary
console.log(`\n${'─'.repeat(50)}`);
console.log(`Validation Summary`);
console.log(`  errors:   ${report.errors.length}`);
console.log(`  warnings: ${report.warnings.length}`);

console.log(`\nReport written to: ${reportPath}`);
process.exit(report.valid ? 0 : 1);
