#!/usr/bin/env tsx
/**
 * Batch analysis runner for ICP companies.
 *
 * Loads dossiers from runs/{slug}/, runs the full deterministic pipeline,
 * and writes structured outputs to reports/{slug}/.
 *
 * Usage:
 *   npx tsx src/report/runner/batch-analyse.ts           # all companies with dossiers
 *   npx tsx src/report/runner/batch-analyse.ts attio      # single company
 *
 * Prerequisites:
 *   Dossiers must exist at runs/{slug}/dossier.json.
 *   Use /build-company-dossier to generate dossiers first.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { Dossier } from '../../types/index.js';
import type { Signal } from '../pipeline/extract-signals.js';
import type { Tension } from '../pipeline/detect-tensions.js';
import type { Pattern } from '../pipeline/detect-patterns.js';
import type { Hypothesis } from '../pipeline/generate-hypotheses.js';
import type { Implication } from '../pipeline/generate-implications.js';
import type { ReportPlan } from '../pipeline/plan-report.js';
import type { WriteReportResult, SkillBundleResult } from '../pipeline/write-report.js';

import { extractSignals } from '../pipeline/extract-signals.js';
import { detectTensions } from '../pipeline/detect-tensions.js';
import { detectPatterns } from '../pipeline/detect-patterns.js';
import { generateHypotheses } from '../pipeline/generate-hypotheses.js';
import { stressTestHypotheses } from '../pipeline/stress-test-hypotheses.js';
import { generateImplications } from '../pipeline/generate-implications.js';
import { planReport } from '../pipeline/plan-report.js';
import {
  writeReport,
  exportSkillBundle,
} from '../pipeline/write-report.js';

import { companies } from './company-list.js';
import { slugify, writeJson, writeMarkdown } from './output-manager.js';

// ---------------------------------------------------------------------------
// Dossier loader
// ---------------------------------------------------------------------------

const RUNS_DIR = resolve(process.cwd(), 'runs');

async function loadDossier(slug: string): Promise<Dossier | null> {
  const path = resolve(RUNS_DIR, slug, 'dossier.json');
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw) as Dossier;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Insight summary generator
// ---------------------------------------------------------------------------

function buildInsightSummary(
  tensions: Tension[],
  patterns: Pattern[],
  hypotheses: Hypothesis[],
  implications: Implication[],
): string {
  const topTension = tensions
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0];
  const topPattern = patterns
    .sort((a, b) => importanceRank(b.strategic_weight) - importanceRank(a.strategic_weight))[0];
  const topHypothesis = hypotheses
    .filter(h => h.status === 'survives')
    .sort((a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence))[0];
  const topImplication = implications
    .sort((a, b) => impactRank(b.impact) - impactRank(a.impact))[0];

  const lines: string[] = [];
  lines.push('Core tension:');
  lines.push(topTension?.title ?? 'None detected');
  lines.push('');
  lines.push('Dominant pattern:');
  lines.push(topPattern?.title ?? 'None detected');
  lines.push('');
  lines.push('Most plausible hypothesis:');
  lines.push(topHypothesis?.title ?? 'None survived stress testing');
  lines.push('');
  lines.push('Highest-impact implication:');
  lines.push(topImplication?.title ?? 'None generated');

  return lines.join('\n');
}

function severityRank(c: string): number {
  return c === 'high' ? 3 : c === 'medium' ? 2 : 1;
}
function importanceRank(c: string): number {
  return c === 'high' ? 3 : c === 'medium' ? 2 : 1;
}
function confidenceRank(c: string): number {
  return c === 'high' ? 3 : c === 'medium' ? 2 : 1;
}
function impactRank(c: string): number {
  return c === 'high' ? 3 : c === 'medium' ? 2 : 1;
}

// ---------------------------------------------------------------------------
// Single company pipeline
// ---------------------------------------------------------------------------

interface AnalysisResult {
  slug: string;
  signalCount: number;
  tensionCount: number;
  patternCount: number;
  hypothesisCount: number;
  implicationCount: number;
  reportErrors: number;
}

async function analyseCompany(
  name: string,
  slug: string,
): Promise<AnalysisResult | null> {
  console.log(`\nAnalysing: ${name}`);

  // 1. Load dossier
  const dossier = await loadDossier(slug);
  if (!dossier) {
    console.log(`  ✗ No dossier found at runs/${slug}/dossier.json — skipping`);
    return null;
  }
  console.log(`  ✓ dossier loaded`);

  // 2. Run deterministic reasoning pipeline
  const signals: Signal[] = extractSignals(dossier);
  const tensions: Tension[] = detectTensions(signals);
  const patterns: Pattern[] = detectPatterns(tensions, signals);
  const hypotheses = generateHypotheses(patterns, tensions, signals);
  const stressTested = stressTestHypotheses(hypotheses, patterns, tensions, signals);
  const implications = generateImplications(stressTested, patterns, tensions, signals);
  console.log(`  ✓ reasoning pipeline complete (${signals.length} signals, ${tensions.length} tensions, ${patterns.length} patterns, ${stressTested.length} hypotheses, ${implications.length} implications)`);

  // 3. Generate report plan
  const plan: ReportPlan = planReport(implications, stressTested, patterns, tensions, signals);
  console.log(`  ✓ report plan generated`);

  // 4. Write template report
  const result: WriteReportResult = await writeReport(
    plan, implications, stressTested, patterns, tensions, signals,
    { writerMode: 'template' },
  );
  console.log(`  ✓ template report written${result.errors.length > 0 ? ` (${result.errors.length} validation errors)` : ''}`);

  // 5. Export skill bundle
  const skillResult: SkillBundleResult = exportSkillBundle(
    plan, implications, stressTested, patterns, tensions, signals,
  );
  console.log(`  ✓ skill bundle exported (${skillResult.bundle.sections.length} sections)`);

  // 6. Write all outputs
  await writeJson(slug, 'dossier.json', dossier);
  await writeJson(slug, 'signals.json', signals);
  await writeJson(slug, 'tensions.json', tensions);
  await writeJson(slug, 'patterns.json', patterns);
  await writeJson(slug, 'hypotheses.json', stressTested);
  await writeJson(slug, 'implications.json', implications);
  await writeJson(slug, 'report-plan.json', plan);
  await writeMarkdown(slug, 'report-template.md', result.markdown);
  await writeJson(slug, 'skill-bundle.json', skillResult.bundle);

  // 7. Write insight summary
  const insightSummary = buildInsightSummary(tensions, patterns, stressTested, implications);
  await writeMarkdown(slug, 'insight-summary.md', insightSummary);
  console.log(`  ✓ insight summary written`);

  return {
    slug,
    signalCount: signals.length,
    tensionCount: tensions.length,
    patternCount: patterns.length,
    hypothesisCount: stressTested.length,
    implicationCount: implications.length,
    reportErrors: result.errors.length,
  };
}

// ---------------------------------------------------------------------------
// Batch runner
// ---------------------------------------------------------------------------

async function main() {
  const filterArg = process.argv[2];

  let targets: Array<{ name: string; slug: string }>;

  if (filterArg) {
    // Check company list first, then treat as raw slug
    const match = companies.find(c => slugify(c.name) === filterArg);
    if (match) {
      targets = [{ name: match.name, slug: slugify(match.name) }];
    } else {
      // Allow arbitrary slug for dossiers not in the ICP list
      targets = [{ name: filterArg, slug: filterArg }];
    }
  } else {
    targets = companies.map(c => ({ name: c.name, slug: slugify(c.name) }));
  }

  console.log(`Batch analysis: ${targets.length} companies`);
  console.log('─'.repeat(50));

  const results: AnalysisResult[] = [];
  const failures: string[] = [];

  for (const company of targets) {
    try {
      const result = await analyseCompany(company.name, company.slug);
      if (result) {
        results.push(result);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ FAILED: ${message}`);
      failures.push(`${company.name}: ${message}`);
    }
  }

  // Summary
  console.log('\n' + '─'.repeat(50));
  console.log(`\nBatch complete: ${results.length} analysed, ${failures.length} failed, ${targets.length - results.length - failures.length} skipped`);

  if (results.length > 0) {
    console.log('\nResults:');
    for (const r of results) {
      console.log(`  ${r.slug}: ${r.signalCount} signals, ${r.tensionCount} tensions, ${r.patternCount} patterns, ${r.hypothesisCount} hypotheses, ${r.implicationCount} implications${r.reportErrors > 0 ? ` (${r.reportErrors} report errors)` : ''}`);
    }
    console.log(`\nOutputs written to: reports/`);
  }

  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) {
      console.log(`  ${f}`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
