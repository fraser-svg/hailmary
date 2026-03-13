import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { validate, collectValues, isSectionPopulated, CONTENT_SECTIONS } from '../validate-core.js';
import { createEmptyDossier } from '../utils/empty-dossier.js';
import type { Dossier } from '../types/index.js';

// --- Test helpers ---

const tmpDir = join(process.cwd(), 'runs', '__test_validate__');

function writeDossier(name: string, dossier: unknown): string {
  const dir = join(tmpDir, name);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'dossier.json');
  writeFileSync(path, JSON.stringify(dossier, null, 2) + '\n');
  return path;
}

function makeSource(id: string, tier: number = 1) {
  return {
    source_id: id,
    url: `https://example.com/${id}`,
    source_type: 'website',
    title: `Source ${id}`,
    publisher_or_owner: 'Example',
    captured_at: new Date().toISOString(),
    relevance_notes: ['test'],
    source_tier: tier,
  };
}

function makeEvidence(id: string, sourceId: string, type = 'company_description_record') {
  return {
    evidence_id: id,
    source_id: sourceId,
    evidence_type: type,
    captured_at: new Date().toISOString(),
    excerpt: `Excerpt for ${id}`,
    summary: `Summary for ${id}`,
    normalized_fields: {},
    source_quality: 'medium',
    confidence: 'medium',
    is_inferred: false,
    supports_claims: [],
    tags: [],
  };
}

beforeAll(() => {
  mkdirSync(tmpDir, { recursive: true });
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// --- collectValues ---

describe('collectValues', () => {
  it('finds values in flat objects', () => {
    expect(collectValues({ name: 'foo' }, 'name')).toEqual(['foo']);
  });

  it('finds values in nested objects', () => {
    const obj = { a: { b: { target: 'found' } } };
    expect(collectValues(obj, 'target')).toEqual(['found']);
  });

  it('spreads array values', () => {
    const obj = { evidence_ids: ['ev_001', 'ev_002'] };
    expect(collectValues(obj, 'evidence_ids')).toEqual(['ev_001', 'ev_002']);
  });

  it('collects from multiple nested locations', () => {
    const obj = {
      a: { evidence_ids: ['ev_001'] },
      b: { evidence_ids: ['ev_002', 'ev_003'] },
    };
    const result = collectValues(obj, 'evidence_ids');
    expect(result).toContain('ev_001');
    expect(result).toContain('ev_002');
    expect(result).toContain('ev_003');
    expect(result).toHaveLength(3);
  });

  it('traverses arrays of objects', () => {
    const obj = { items: [{ x: 1 }, { x: 2 }] };
    expect(collectValues(obj, 'x')).toEqual([1, 2]);
  });

  it('returns empty for null/undefined/primitives', () => {
    expect(collectValues(null, 'key')).toEqual([]);
    expect(collectValues(undefined, 'key')).toEqual([]);
    expect(collectValues(42, 'key')).toEqual([]);
    expect(collectValues('str', 'key')).toEqual([]);
  });
});

// --- isSectionPopulated ---

describe('isSectionPopulated', () => {
  it('returns false for null/undefined', () => {
    expect(isSectionPopulated(null)).toBe(false);
    expect(isSectionPopulated(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isSectionPopulated('')).toBe(false);
  });

  it('returns true for non-empty string', () => {
    expect(isSectionPopulated('hello')).toBe(true);
  });

  it('returns true for numbers', () => {
    expect(isSectionPopulated(0)).toBe(true);
    expect(isSectionPopulated(42)).toBe(true);
  });

  it('returns false for empty array', () => {
    expect(isSectionPopulated([])).toBe(false);
  });

  it('returns true for non-empty array', () => {
    expect(isSectionPopulated([1])).toBe(true);
  });

  it('skips confidence and is_inferred keys', () => {
    expect(isSectionPopulated({ confidence: 'low', is_inferred: false })).toBe(false);
  });

  it('detects populated nested values', () => {
    expect(isSectionPopulated({ confidence: 'low', name: 'hello' })).toBe(true);
  });
});

// --- CONTENT_SECTIONS ---

describe('CONTENT_SECTIONS', () => {
  it('contains exactly 10 sections', () => {
    expect(CONTENT_SECTIONS).toHaveLength(10);
  });

  it('does not include metadata sections', () => {
    const sections = [...CONTENT_SECTIONS];
    expect(sections).not.toContain('company_input');
    expect(sections).not.toContain('run_metadata');
    expect(sections).not.toContain('sources');
    expect(sections).not.toContain('evidence');
  });
});

// --- validate() ---

describe('validate', () => {
  it('accepts a valid empty dossier', () => {
    const dossier = createEmptyDossier('Test', 'test.com');
    const path = writeDossier('valid-empty', dossier);
    const report = validate(path);

    expect(report.valid).toBe(true);
    expect(report.schema_valid).toBe(true);
    expect(report.evidence_links_valid).toBe(true);
    expect(report.source_links_valid).toBe(true);
    expect(report.errors).toHaveLength(0);
  });

  it('returns error for invalid JSON', () => {
    const dir = join(tmpDir, 'bad-json');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'dossier.json');
    writeFileSync(path, '{ not valid json }');

    const report = validate(path);
    expect(report.valid).toBe(false);
    expect(report.errors[0]).toContain('JSON parse error');
  });

  it('detects broken evidence links', () => {
    const dossier = createEmptyDossier('Test', 'test.com') as unknown as Record<string, unknown>;
    // Add a reference to an evidence_id that does not exist in evidence[]
    (dossier.company_profile as Record<string, unknown>).evidence_ids = ['ev_999'];
    const path = writeDossier('broken-ev-link', dossier);

    const report = validate(path);
    expect(report.valid).toBe(false);
    expect(report.evidence_links_valid).toBe(false);
    expect(report.errors.some((e) => e.includes('ev_999'))).toBe(true);
  });

  it('detects broken source links', () => {
    const dossier = createEmptyDossier('Test', 'test.com') as unknown as Record<string, unknown>;
    // Add evidence that references a non-existent source
    (dossier as Record<string, unknown>).evidence = [makeEvidence('ev_001', 'src_999')];
    (dossier.company_profile as Record<string, unknown>).evidence_ids = ['ev_001'];
    const path = writeDossier('broken-src-link', dossier);

    const report = validate(path);
    expect(report.valid).toBe(false);
    expect(report.source_links_valid).toBe(false);
    expect(report.errors.some((e) => e.includes('src_999'))).toBe(true);
  });

  it('detects invalid confidence values', () => {
    const dossier = createEmptyDossier('Test', 'test.com') as unknown as Record<string, unknown>;
    (dossier.company_profile as Record<string, unknown>).confidence = 'very_high';
    const path = writeDossier('bad-confidence', dossier);

    const report = validate(path);
    expect(report.errors.some((e) => e.includes('very_high'))).toBe(true);
  });

  it('warns on invalid evidence types', () => {
    const dossier = createEmptyDossier('Test', 'test.com') as unknown as Record<string, unknown>;
    const src = makeSource('src_001');
    const ev = makeEvidence('ev_001', 'src_001', 'made_up_record');
    (dossier as Record<string, unknown>).sources = [src];
    (dossier as Record<string, unknown>).evidence = [ev];
    (dossier.company_profile as Record<string, unknown>).evidence_ids = ['ev_001'];
    const path = writeDossier('bad-ev-type', dossier);

    const report = validate(path);
    expect(report.warnings.some((w) => w.includes('made_up_record'))).toBe(true);
    // Should be warning, not error — validation still passes
    expect(report.errors.some((e) => e.includes('made_up_record'))).toBe(false);
  });

  it('warns on inferred evidence without supporting evidence_ids', () => {
    const dossier = createEmptyDossier('Test', 'test.com') as unknown as Record<string, unknown>;
    const src = makeSource('src_001');
    const ev = {
      ...makeEvidence('ev_001', 'src_001'),
      is_inferred: true,
      // no evidence_ids field
    };
    (dossier as Record<string, unknown>).sources = [src];
    (dossier as Record<string, unknown>).evidence = [ev];
    (dossier.company_profile as Record<string, unknown>).evidence_ids = ['ev_001'];
    const path = writeDossier('inferred-no-support', dossier);

    const report = validate(path);
    expect(report.warnings.some((w) => w.includes('inferred'))).toBe(true);
  });

  describe('narrative gap checks', () => {
    function makeDossierWithGap(gap: Record<string, unknown>) {
      const dossier = createEmptyDossier('Test', 'test.com') as unknown as Record<string, unknown>;
      const src = makeSource('src_001');
      const ev1 = makeEvidence('ev_001', 'src_001', 'company_claim_record');
      const ev2 = makeEvidence('ev_002', 'src_001', 'testimonial_record');
      const ev3 = makeEvidence('ev_003', 'src_001', 'review_record');
      (dossier as Record<string, unknown>).sources = [src];
      (dossier as Record<string, unknown>).evidence = [ev1, ev2, ev3];
      (dossier.narrative_intelligence as Record<string, unknown>).narrative_gaps = [gap];
      return dossier;
    }

    it('accepts low-confidence gaps without evidence', () => {
      const gap = {
        gap_name: 'test gap',
        company_language: [],
        customer_language: [],
        gap_description: 'test',
        likely_business_impact: [],
        suggested_repositioning_direction: '',
        evidence_ids: [],
        confidence: 'low',
      };
      const dossier = makeDossierWithGap(gap);
      const path = writeDossier('gap-low-ok', dossier);
      const report = validate(path);
      // Low confidence gaps bypass the check
      expect(report.errors.filter((e) => e.includes('Narrative gap'))).toHaveLength(0);
    });

    it('errors on medium-confidence gap missing company_language', () => {
      const gap = {
        gap_name: 'test gap',
        company_language: [],
        customer_language: ['signal1', 'signal2'],
        gap_description: 'test',
        likely_business_impact: [],
        suggested_repositioning_direction: '',
        evidence_ids: ['ev_001'],
        confidence: 'medium',
      };
      const dossier = makeDossierWithGap(gap);
      const path = writeDossier('gap-no-company', dossier);
      const report = validate(path);
      expect(report.errors.some((e) => e.includes('company_language'))).toBe(true);
    });

    it('errors on medium-confidence gap with <2 customer_language', () => {
      const gap = {
        gap_name: 'test gap',
        company_language: ['claim1'],
        customer_language: ['only_one'],
        gap_description: 'test',
        likely_business_impact: [],
        suggested_repositioning_direction: '',
        evidence_ids: ['ev_001'],
        confidence: 'medium',
      };
      const dossier = makeDossierWithGap(gap);
      const path = writeDossier('gap-few-customer', dossier);
      const report = validate(path);
      expect(report.errors.some((e) => e.includes('customer_language'))).toBe(true);
    });

    it('errors on medium-confidence gap with no evidence_ids', () => {
      const gap = {
        gap_name: 'test gap',
        company_language: ['claim1'],
        customer_language: ['signal1', 'signal2'],
        gap_description: 'test',
        likely_business_impact: [],
        suggested_repositioning_direction: '',
        evidence_ids: [],
        confidence: 'medium',
      };
      const dossier = makeDossierWithGap(gap);
      const path = writeDossier('gap-no-evidence', dossier);
      const report = validate(path);
      expect(report.errors.some((e) => e.includes('evidence_ids'))).toBe(true);
    });

    it('accepts a well-formed medium-confidence gap', () => {
      const gap = {
        gap_name: 'test gap',
        company_language: ['we are the best'],
        customer_language: ['easy deploys', 'fast previews'],
        gap_description: 'messaging mismatch',
        likely_business_impact: ['lost conversions'],
        suggested_repositioning_direction: 'emphasize deploys',
        evidence_ids: ['ev_001', 'ev_002', 'ev_003'],
        confidence: 'medium',
      };
      const dossier = makeDossierWithGap(gap);
      const path = writeDossier('gap-valid', dossier);
      const report = validate(path);
      expect(report.errors.filter((e) => e.includes('Narrative gap'))).toHaveLength(0);
    });
  });

  it('reports correct section stats for empty dossier', () => {
    const dossier = createEmptyDossier('Test', 'test.com');
    const path = writeDossier('stats-empty', dossier);
    const report = validate(path);

    // confidence_and_gaps has overall_confidence: 'low' which is a non-empty string
    // isSectionPopulated skips 'confidence' key but not 'overall_confidence'
    expect(report.stats.sections_populated).toBe(1);
    expect(report.stats.sections_empty).toBe(9);
    expect(report.stats.source_count).toBe(0);
    expect(report.stats.evidence_count).toBe(0);
  });

  it('reports correct stats with sources and evidence', () => {
    const dossier = createEmptyDossier('Test', 'test.com') as unknown as Record<string, unknown>;
    const src = makeSource('src_001');
    const ev = makeEvidence('ev_001', 'src_001');
    (dossier as Record<string, unknown>).sources = [src];
    (dossier as Record<string, unknown>).evidence = [ev];
    (dossier.company_profile as Record<string, unknown>).evidence_ids = ['ev_001'];
    const path = writeDossier('stats-populated', dossier);
    const report = validate(path);

    expect(report.stats.source_count).toBe(1);
    expect(report.stats.evidence_count).toBe(1);
    expect(report.stats.evidence_ids_referenced).toBe(1);
    expect(report.stats.evidence_ids_resolved).toBe(1);
    expect(report.stats.source_ids_referenced).toBe(1);
    expect(report.stats.source_ids_resolved).toBe(1);
  });

  // --- Phase 1d: New warning checks ---

  describe('orphan evidence warning', () => {
    it('warns when evidence is not referenced by any section', () => {
      const dossier = createEmptyDossier('Test', 'test.com') as unknown as Record<string, unknown>;
      const src = makeSource('src_001');
      const ev = makeEvidence('ev_001', 'src_001');
      (dossier as Record<string, unknown>).sources = [src];
      (dossier as Record<string, unknown>).evidence = [ev];
      // ev_001 exists but no section references it
      const path = writeDossier('orphan-evidence', dossier);
      const report = validate(path);

      expect(report.warnings.some((w) => w.includes('Orphan') && w.includes('ev_001'))).toBe(true);
      // Should be warning, not error
      expect(report.valid).toBe(true);
    });

    it('does not warn when all evidence is referenced', () => {
      const dossier = createEmptyDossier('Test', 'test.com') as unknown as Record<string, unknown>;
      const src = makeSource('src_001');
      const ev = makeEvidence('ev_001', 'src_001');
      (dossier as Record<string, unknown>).sources = [src];
      (dossier as Record<string, unknown>).evidence = [ev];
      (dossier.company_profile as Record<string, unknown>).evidence_ids = ['ev_001'];
      const path = writeDossier('no-orphan', dossier);
      const report = validate(path);

      expect(report.warnings.some((w) => w.includes('Orphan'))).toBe(false);
    });
  });

  describe('unused sources warning', () => {
    it('warns when a source is not referenced by any evidence', () => {
      const dossier = createEmptyDossier('Test', 'test.com') as unknown as Record<string, unknown>;
      const src1 = makeSource('src_001');
      const src2 = makeSource('src_002');
      const ev = makeEvidence('ev_001', 'src_001');
      (dossier as Record<string, unknown>).sources = [src1, src2];
      (dossier as Record<string, unknown>).evidence = [ev];
      (dossier.company_profile as Record<string, unknown>).evidence_ids = ['ev_001'];
      const path = writeDossier('unused-source', dossier);
      const report = validate(path);

      expect(report.warnings.some((w) => w.includes('Unused') && w.includes('src_002'))).toBe(true);
      expect(report.valid).toBe(true);
    });

    it('does not warn when all sources are referenced', () => {
      const dossier = createEmptyDossier('Test', 'test.com') as unknown as Record<string, unknown>;
      const src = makeSource('src_001');
      const ev = makeEvidence('ev_001', 'src_001');
      (dossier as Record<string, unknown>).sources = [src];
      (dossier as Record<string, unknown>).evidence = [ev];
      (dossier.company_profile as Record<string, unknown>).evidence_ids = ['ev_001'];
      const path = writeDossier('all-sources-used', dossier);
      const report = validate(path);

      expect(report.warnings.some((w) => w.includes('Unused'))).toBe(false);
    });
  });

  describe('single-source confidence ceiling warning', () => {
    it('warns when a section has all evidence from one source and confidence > low', () => {
      const dossier = createEmptyDossier('Test', 'test.com') as unknown as Record<string, unknown>;
      const src = makeSource('src_001');
      const ev1 = makeEvidence('ev_001', 'src_001');
      const ev2 = makeEvidence('ev_002', 'src_001');
      (dossier as Record<string, unknown>).sources = [src];
      (dossier as Record<string, unknown>).evidence = [ev1, ev2];
      (dossier.company_profile as Record<string, unknown>).evidence_ids = ['ev_001', 'ev_002'];
      (dossier.company_profile as Record<string, unknown>).confidence = 'medium';
      const path = writeDossier('single-source-ceiling', dossier);
      const report = validate(path);

      expect(report.warnings.some((w) => w.includes('Single-source') && w.includes('company_profile'))).toBe(true);
      expect(report.valid).toBe(true);
    });

    it('does not warn when confidence is low', () => {
      const dossier = createEmptyDossier('Test', 'test.com') as unknown as Record<string, unknown>;
      const src = makeSource('src_001');
      const ev1 = makeEvidence('ev_001', 'src_001');
      (dossier as Record<string, unknown>).sources = [src];
      (dossier as Record<string, unknown>).evidence = [ev1];
      (dossier.company_profile as Record<string, unknown>).evidence_ids = ['ev_001'];
      (dossier.company_profile as Record<string, unknown>).confidence = 'low';
      const path = writeDossier('single-source-low', dossier);
      const report = validate(path);

      expect(report.warnings.some((w) => w.includes('Single-source'))).toBe(false);
    });

    it('does not warn when evidence comes from multiple sources', () => {
      const dossier = createEmptyDossier('Test', 'test.com') as unknown as Record<string, unknown>;
      const src1 = makeSource('src_001');
      const src2 = makeSource('src_002');
      const ev1 = makeEvidence('ev_001', 'src_001');
      const ev2 = makeEvidence('ev_002', 'src_002');
      (dossier as Record<string, unknown>).sources = [src1, src2];
      (dossier as Record<string, unknown>).evidence = [ev1, ev2];
      (dossier.company_profile as Record<string, unknown>).evidence_ids = ['ev_001', 'ev_002'];
      (dossier.company_profile as Record<string, unknown>).confidence = 'high';
      const path = writeDossier('multi-source-high', dossier);
      const report = validate(path);

      expect(report.warnings.some((w) => w.includes('Single-source'))).toBe(false);
    });
  });

  // --- Phase 2: Tier-aware warning checks ---

  describe('source_tier schema validation', () => {
    it('accepts source with valid source_tier', () => {
      const dossier = createEmptyDossier('Test', 'test.com') as unknown as Record<string, unknown>;
      const src = makeSource('src_001', 3);
      const ev = makeEvidence('ev_001', 'src_001');
      (dossier as Record<string, unknown>).sources = [src];
      (dossier as Record<string, unknown>).evidence = [ev];
      (dossier.company_profile as Record<string, unknown>).evidence_ids = ['ev_001'];
      const path = writeDossier('tier-valid', dossier);
      const report = validate(path);

      expect(report.schema_valid).toBe(true);
    });

    it('rejects source without source_tier', () => {
      const dossier = createEmptyDossier('Test', 'test.com') as unknown as Record<string, unknown>;
      const { source_tier: _, ...srcNoTier } = makeSource('src_001', 1);
      const ev = makeEvidence('ev_001', 'src_001');
      (dossier as Record<string, unknown>).sources = [srcNoTier];
      (dossier as Record<string, unknown>).evidence = [ev];
      (dossier.company_profile as Record<string, unknown>).evidence_ids = ['ev_001'];
      const path = writeDossier('tier-missing', dossier);
      const report = validate(path);

      expect(report.schema_valid).toBe(false);
    });
  });

  describe('tier-ceiling warning', () => {
    it('warns when all evidence from tier 4-5 sources and confidence > low', () => {
      const dossier = createEmptyDossier('Test', 'test.com') as unknown as Record<string, unknown>;
      const src = makeSource('src_001', 5);
      const ev1 = makeEvidence('ev_001', 'src_001');
      const ev2 = makeEvidence('ev_002', 'src_001');
      (dossier as Record<string, unknown>).sources = [src];
      (dossier as Record<string, unknown>).evidence = [ev1, ev2];
      (dossier.company_profile as Record<string, unknown>).evidence_ids = ['ev_001', 'ev_002'];
      (dossier.company_profile as Record<string, unknown>).confidence = 'medium';
      const path = writeDossier('tier-ceiling-warn', dossier);
      const report = validate(path);

      expect(report.warnings.some((w) => w.includes('Tier-ceiling') && w.includes('company_profile'))).toBe(true);
      expect(report.valid).toBe(true);
    });

    it('does not warn when confidence is low', () => {
      const dossier = createEmptyDossier('Test', 'test.com') as unknown as Record<string, unknown>;
      const src = makeSource('src_001', 5);
      const ev = makeEvidence('ev_001', 'src_001');
      (dossier as Record<string, unknown>).sources = [src];
      (dossier as Record<string, unknown>).evidence = [ev];
      (dossier.company_profile as Record<string, unknown>).evidence_ids = ['ev_001'];
      (dossier.company_profile as Record<string, unknown>).confidence = 'low';
      const path = writeDossier('tier-ceiling-low', dossier);
      const report = validate(path);

      expect(report.warnings.some((w) => w.includes('Tier-ceiling'))).toBe(false);
    });

    it('does not warn when evidence includes tier 1-3 sources', () => {
      const dossier = createEmptyDossier('Test', 'test.com') as unknown as Record<string, unknown>;
      const src1 = makeSource('src_001', 5);
      const src2 = makeSource('src_002', 2);
      const ev1 = makeEvidence('ev_001', 'src_001');
      const ev2 = makeEvidence('ev_002', 'src_002');
      (dossier as Record<string, unknown>).sources = [src1, src2];
      (dossier as Record<string, unknown>).evidence = [ev1, ev2];
      (dossier.company_profile as Record<string, unknown>).evidence_ids = ['ev_001', 'ev_002'];
      (dossier.company_profile as Record<string, unknown>).confidence = 'high';
      const path = writeDossier('tier-ceiling-mixed', dossier);
      const report = validate(path);

      expect(report.warnings.some((w) => w.includes('Tier-ceiling'))).toBe(false);
    });
  });

  describe('customer-truth tier warning', () => {
    function makeDossierWithGapAndTiers(customerEvTiers: number[]) {
      const dossier = createEmptyDossier('Test', 'test.com') as unknown as Record<string, unknown>;
      const sources: Record<string, unknown>[] = [];
      const evidenceArr: Record<string, unknown>[] = [];

      // Company-side evidence (tier 1 — always valid)
      sources.push(makeSource('src_100', 1));
      evidenceArr.push(makeEvidence('ev_100', 'src_100', 'company_claim_record'));

      // Customer-side evidence with specified tiers
      customerEvTiers.forEach((tier, i) => {
        const srcId = `src_${String(i + 1).padStart(3, '0')}`;
        const evId = `ev_${String(i + 1).padStart(3, '0')}`;
        sources.push(makeSource(srcId, tier));
        evidenceArr.push(makeEvidence(evId, srcId, 'testimonial_record'));
      });

      (dossier as Record<string, unknown>).sources = sources;
      (dossier as Record<string, unknown>).evidence = evidenceArr;

      const allEvIds = evidenceArr.map((e) => e.evidence_id as string);
      (dossier.narrative_intelligence as Record<string, unknown>).narrative_gaps = [
        {
          gap_name: 'test gap',
          company_language: ['we are innovative'],
          customer_language: ['easy to use', 'simple deploys'],
          gap_description: 'messaging mismatch',
          likely_business_impact: ['lost conversions'],
          suggested_repositioning_direction: 'emphasize simplicity',
          evidence_ids: allEvIds,
          confidence: 'medium',
        },
      ];
      return dossier;
    }

    it('warns when gap customer evidence only from tier 4-5', () => {
      const dossier = makeDossierWithGapAndTiers([4, 5]);
      const path = writeDossier('customer-tier-warn', dossier);
      const report = validate(path);

      expect(report.warnings.some((w) => w.includes('Customer-truth tier'))).toBe(true);
      expect(report.valid).toBe(true);
    });

    it('does not warn when gap customer evidence includes tier 3', () => {
      const dossier = makeDossierWithGapAndTiers([3, 5]);
      const path = writeDossier('customer-tier-ok', dossier);
      const report = validate(path);

      expect(report.warnings.some((w) => w.includes('Customer-truth tier'))).toBe(false);
    });
  });

  describe('source-quality consistency warning', () => {
    it('warns when evidence has source_quality high but source is tier 4-5', () => {
      const dossier = createEmptyDossier('Test', 'test.com') as unknown as Record<string, unknown>;
      const src = makeSource('src_001', 5);
      const ev = { ...makeEvidence('ev_001', 'src_001'), source_quality: 'high' };
      (dossier as Record<string, unknown>).sources = [src];
      (dossier as Record<string, unknown>).evidence = [ev];
      (dossier.company_profile as Record<string, unknown>).evidence_ids = ['ev_001'];
      const path = writeDossier('quality-consistency-warn', dossier);
      const report = validate(path);

      expect(report.warnings.some((w) => w.includes('Source-quality') && w.includes('ev_001'))).toBe(true);
      expect(report.valid).toBe(true);
    });

    it('does not warn when source_quality high and source is tier 1', () => {
      const dossier = createEmptyDossier('Test', 'test.com') as unknown as Record<string, unknown>;
      const src = makeSource('src_001', 1);
      const ev = { ...makeEvidence('ev_001', 'src_001'), source_quality: 'high' };
      (dossier as Record<string, unknown>).sources = [src];
      (dossier as Record<string, unknown>).evidence = [ev];
      (dossier.company_profile as Record<string, unknown>).evidence_ids = ['ev_001'];
      const path = writeDossier('quality-consistency-ok', dossier);
      const report = validate(path);

      expect(report.warnings.some((w) => w.includes('Source-quality'))).toBe(false);
    });
  });
});
