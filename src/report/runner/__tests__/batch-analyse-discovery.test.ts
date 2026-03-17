import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadDiscoveryRun } from '../batch-analyse.js';
import type { DiscoveryRun } from '../../../types/icp.js';

const TMP_DIR = resolve(process.cwd(), '.tmp-test-discovery');

function makeDiscoveryRun(overrides?: Partial<DiscoveryRun>): DiscoveryRun {
  return {
    run_id: '2026-03-17',
    discovered_at: '2026-03-17T12:00:00Z',
    investors_searched: ['TestVC'],
    candidates_found: 3,
    candidates_qualified: 2,
    qualification_threshold: 7,
    companies: [
      {
        name: 'QualifiedCo',
        domain: 'qualified.com',
        source_investor: 'TestVC',
        source_url: 'https://testvc.com/portfolio',
        score: {
          geography: 2, arr_range: 1, stage: 2, category: 2,
          messy_growth: 1, evidence_depth: 1,
          total: 9, qualified: true, confidence: 'medium',
          notes: ['test'],
        },
        discovered_at: '2026-03-17T12:00:00Z',
        raw_signals: { funding: 'Series A' },
      },
      {
        name: 'AnotherQualified',
        domain: 'another.io',
        source_investor: 'TestVC',
        source_url: 'https://testvc.com/portfolio',
        score: {
          geography: 2, arr_range: 2, stage: 2, category: 2,
          messy_growth: 0, evidence_depth: 0,
          total: 8, qualified: true, confidence: 'medium',
          notes: ['test'],
        },
        discovered_at: '2026-03-17T12:00:00Z',
        raw_signals: {},
      },
      {
        name: 'UnqualifiedCo',
        domain: 'unqualified.com',
        source_investor: 'TestVC',
        source_url: 'https://testvc.com/portfolio',
        score: {
          geography: 0, arr_range: 0, stage: 1, category: 1,
          messy_growth: 0, evidence_depth: 0,
          total: 2, qualified: false, confidence: 'low',
          notes: ['test'],
        },
        discovered_at: '2026-03-17T12:00:00Z',
        raw_signals: {},
      },
    ],
    ...overrides,
  };
}

describe('loadDiscoveryRun', () => {
  beforeEach(async () => {
    await mkdir(TMP_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TMP_DIR, { recursive: true, force: true });
  });

  it('reads valid discovery file and returns only qualified companies', async () => {
    const filePath = resolve(TMP_DIR, 'scored-companies.json');
    await writeFile(filePath, JSON.stringify(makeDiscoveryRun()));

    const targets = await loadDiscoveryRun(filePath);

    expect(targets).toHaveLength(2);
    expect(targets[0].name).toBe('QualifiedCo');
    expect(targets[0].slug).toBe('qualifiedco');
    expect(targets[1].name).toBe('AnotherQualified');
    expect(targets[1].slug).toBe('anotherqualified');
  });

  it('throws clear error when file does not exist', async () => {
    await expect(
      loadDiscoveryRun(resolve(TMP_DIR, 'nonexistent.json')),
    ).rejects.toThrow('Discovery file not found');
  });

  it('returns empty array and logs warning when 0 companies qualify', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const run = makeDiscoveryRun({
      candidates_qualified: 0,
      companies: [
        {
          name: 'LowScore',
          domain: 'low.com',
          source_investor: 'TestVC',
          source_url: 'https://testvc.com/portfolio',
          score: {
            geography: 0, arr_range: 0, stage: 0, category: 0,
            messy_growth: 0, evidence_depth: 0,
            total: 0, qualified: false, confidence: 'low',
            notes: ['test'],
          },
          discovered_at: '2026-03-17T12:00:00Z',
          raw_signals: {},
        },
      ],
    });

    const filePath = resolve(TMP_DIR, 'scored-companies.json');
    await writeFile(filePath, JSON.stringify(run));

    const targets = await loadDiscoveryRun(filePath);

    expect(targets).toHaveLength(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('No candidates met qualification threshold'),
    );

    consoleSpy.mockRestore();
  });

  it('throws on invalid JSON', async () => {
    const filePath = resolve(TMP_DIR, 'bad.json');
    await writeFile(filePath, 'not json at all');

    await expect(loadDiscoveryRun(filePath)).rejects.toThrow(
      'Discovery file is not valid JSON',
    );
  });

  it('throws when companies array is missing', async () => {
    const filePath = resolve(TMP_DIR, 'no-companies.json');
    await writeFile(filePath, JSON.stringify({ run_id: 'test' }));

    await expect(loadDiscoveryRun(filePath)).rejects.toThrow(
      "Discovery file missing 'companies' array",
    );
  });
});
