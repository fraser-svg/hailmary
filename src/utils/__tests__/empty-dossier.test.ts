import { describe, it, expect, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createEmptyDossier } from '../empty-dossier.js';
import { validate } from '../../validate-core.js';

const REQUIRED_KEYS = [
  'schema_version',
  'generated_at',
  'company_input',
  'run_metadata',
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
  'sources',
  'evidence',
];

// Temp directory for test dossiers
const tmpDir = join(process.cwd(), 'runs', '__test_empty_dossier__');

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('createEmptyDossier', () => {
  const dossier = createEmptyDossier('TestCo', 'testco.com');

  it('has all 16 required top-level keys', () => {
    const keys = Object.keys(dossier);
    for (const key of REQUIRED_KEYS) {
      expect(keys).toContain(key);
    }
    expect(keys).toHaveLength(16);
  });

  it('sets company_input correctly', () => {
    expect(dossier.company_input.company_name).toBe('TestCo');
    expect(dossier.company_input.primary_domain).toBe('testco.com');
  });

  it('has empty sources and evidence arrays', () => {
    expect(dossier.sources).toEqual([]);
    expect(dossier.evidence).toEqual([]);
  });

  it('sets all confidence values to low', () => {
    expect(dossier.company_profile.confidence).toBe('low');
    expect(dossier.product_and_offer.confidence).toBe('low');
    expect(dossier.gtm_model.confidence).toBe('low');
    expect(dossier.customer_and_personas.confidence).toBe('low');
    expect(dossier.competitors.confidence).toBe('low');
    expect(dossier.market_and_macro.confidence).toBe('low');
    expect(dossier.signals.confidence).toBe('low');
    expect(dossier.narrative_intelligence.confidence).toBe('low');
    expect(dossier.strategic_risks.confidence).toBe('low');
    expect(dossier.confidence_and_gaps.overall_confidence).toBe('low');
  });

  it('passes validation with 0 errors', () => {
    // Write to temp file so validate() can read it
    mkdirSync(tmpDir, { recursive: true });
    const path = join(tmpDir, 'dossier.json');
    writeFileSync(path, JSON.stringify(dossier, null, 2) + '\n');

    const report = validate(path);
    expect(report.valid).toBe(true);
    expect(report.errors).toHaveLength(0);
    expect(report.schema_valid).toBe(true);
  });
});
