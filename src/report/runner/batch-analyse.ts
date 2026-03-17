#!/usr/bin/env tsx
/**
 * Batch analysis runner for ICP companies.
 *
 * Loads dossiers from runs/{slug}/, runs the full deterministic pipeline,
 * and writes structured outputs to reports/{slug}/.
 *
 * Usage:
 *   npx tsx src/report/runner/batch-analyse.ts                          # all companies from legacy list
 *   npx tsx src/report/runner/batch-analyse.ts attio                    # single company
 *   npx tsx src/report/runner/batch-analyse.ts --discovery <file.json>  # from discovery run
 *
 * Feature flags:
 *   USE_INTELLIGENCE_V2=true  — run intelligence-v2 pipeline (diagnosis/mechanisms/intervention)
 *   (default: legacy pipeline with hypotheses/implications)
 *
 * Prerequisites:
 *   Dossiers must exist at runs/{slug}/dossier.json.
 *   Use /build-company-dossier to generate dossiers first.
 */

import { readFile, access } from 'node:fs/promises';
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

import { runV2Pipeline } from '../../intelligence-v2/pipeline.js';
import type { V2PipelineResult } from '../../intelligence-v2/pipeline.js';

import type { DiscoveryRun } from '../../types/icp.js';
import { companies } from './company-list.js';
import { slugify, writeJson, writeMarkdown } from './output-manager.js';

// ---------------------------------------------------------------------------
// Discovery run loader
// ---------------------------------------------------------------------------

export async function loadDiscoveryRun(
  filePath: string,
): Promise<Array<{ name: string; slug: string }>> {
  const absPath = resolve(process.cwd(), filePath);

  // Check file exists — throw clear error if not
  await access(absPath).catch(() => {
    throw new Error(`Discovery file not found: ${absPath}`);
  });

  const raw = await readFile(absPath, 'utf-8');
  let run: DiscoveryRun;
  try {
    run = JSON.parse(raw) as DiscoveryRun;
  } catch {
    throw new Error(`Discovery file is not valid JSON: ${absPath}`);
  }

  if (!Array.isArray(run.companies)) {
    throw new Error(`Discovery file missing 'companies' array: ${absPath}`);
  }

  const qualified = run.companies.filter(c => c.score?.qualified === true);

  if (qualified.length === 0) {
    console.log(
      `⚠ No candidates met qualification threshold (${run.qualification_threshold ?? '?'}/12) ` +
      `in ${filePath}. Consider adjusting criteria or adding investors.`,
    );
    return [];
  }

  console.log(
    `Discovery: ${qualified.length} qualified of ${run.companies.length} candidates ` +
    `(threshold: ${run.qualification_threshold ?? '?'}/12)`,
  );

  return qualified.map(c => ({ name: c.name, slug: slugify(c.name) }));
}

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

const USE_V2 = process.env.USE_INTELLIGENCE_V2 === 'true';

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
// Insight summary generator (legacy pipeline)
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
// Single company pipeline — legacy (hypotheses/implications)
// ---------------------------------------------------------------------------

interface AnalysisResult {
  slug: string;
  pipeline: 'legacy' | 'v2';
  signalCount: number;
  tensionCount: number;
  patternCount: number;
  hypothesisCount: number;
  implicationCount: number;
  diagnosisType?: string;
  mechanismCount?: number;
  reportErrors: number;
}

async function analyseCompanyLegacy(
  name: string,
  slug: string,
  dossier: Dossier,
): Promise<AnalysisResult> {
  // 1. Run deterministic reasoning pipeline
  const signals: Signal[] = extractSignals(dossier);
  const tensions: Tension[] = detectTensions(signals);
  const patterns: Pattern[] = detectPatterns(tensions, signals);
  const hypotheses = generateHypotheses(patterns, tensions, signals);
  const stressTested = stressTestHypotheses(hypotheses, patterns, tensions, signals);
  const implications = generateImplications(stressTested, patterns, tensions, signals);
  console.log(`  ✓ reasoning pipeline complete (${signals.length} signals, ${tensions.length} tensions, ${patterns.length} patterns, ${stressTested.length} hypotheses, ${implications.length} implications)`);

  // 2. Generate report plan
  const plan: ReportPlan = planReport(implications, stressTested, patterns, tensions, signals);
  console.log(`  ✓ report plan generated`);

  // 3. Write template report
  const result: WriteReportResult = await writeReport(
    plan, implications, stressTested, patterns, tensions, signals,
    { writerMode: 'template' },
  );
  console.log(`  ✓ template report written${result.errors.length > 0 ? ` (${result.errors.length} validation errors)` : ''}`);

  // 4. Export skill bundle
  const skillResult: SkillBundleResult = exportSkillBundle(
    plan, implications, stressTested, patterns, tensions, signals,
  );
  console.log(`  ✓ skill bundle exported (${skillResult.bundle.sections.length} sections)`);

  // 5. Write all outputs
  await writeJson(slug, 'dossier.json', dossier);
  await writeJson(slug, 'signals.json', signals);
  await writeJson(slug, 'tensions.json', tensions);
  await writeJson(slug, 'patterns.json', patterns);
  await writeJson(slug, 'hypotheses.json', stressTested);
  await writeJson(slug, 'implications.json', implications);
  await writeJson(slug, 'report-plan.json', plan);
  await writeMarkdown(slug, 'report-template.md', result.markdown);
  await writeJson(slug, 'skill-bundle.json', skillResult.bundle);

  // 6. Write insight summary
  const insightSummary = buildInsightSummary(tensions, patterns, stressTested, implications);
  await writeMarkdown(slug, 'insight-summary.md', insightSummary);
  console.log(`  ✓ insight summary written`);

  return {
    slug,
    pipeline: 'legacy',
    signalCount: signals.length,
    tensionCount: tensions.length,
    patternCount: patterns.length,
    hypothesisCount: stressTested.length,
    implicationCount: implications.length,
    reportErrors: result.errors.length,
  };
}

// ---------------------------------------------------------------------------
// Single company pipeline — intelligence-v2 (diagnosis/mechanisms/intervention)
// ---------------------------------------------------------------------------

async function analyseCompanyV2(
  name: string,
  slug: string,
  dossier: Dossier,
): Promise<AnalysisResult> {
  const companyId = dossier.company_input?.company_name ?? slug;
  const v2: V2PipelineResult = await runV2Pipeline(companyId, dossier);

  console.log(
    `  ✓ v2 pipeline complete (${v2.signals.length} signals, ${v2.tensions.length} tensions, ` +
    `${v2.patterns.length} patterns, diagnosis: ${v2.diagnosis.type}, ` +
    `${v2.mechanisms.length} mechanisms, intervention: ${v2.intervention.type})`,
  );

  // Write all outputs
  await writeJson(slug, 'dossier.json', dossier);
  await writeJson(slug, 'signals.json', v2.signals);
  await writeJson(slug, 'gtm-analysis.json', v2.gtm_analysis);
  await writeJson(slug, 'tensions.json', v2.tensions);
  await writeJson(slug, 'patterns.json', v2.patterns);
  await writeJson(slug, 'v2-patterns.json', v2.v2_patterns);
  await writeJson(slug, 'diagnosis.json', v2.diagnosis);
  await writeJson(slug, 'mechanisms.json', v2.mechanisms);
  await writeJson(slug, 'intervention.json', v2.intervention);

  if (v2.report.errors.length > 0) {
    // Hard fail: report budget and structural violations must not be silently swallowed.
    // A null report means the company's run failed — log clearly and re-throw.
    console.log(`  ✗ v2 report validation failed (${v2.report.errors.length} errors):`);
    for (const err of v2.report.errors) {
      console.log(`    - ${err.check}: ${err.message}`);
    }
    // Write the raw markdown for debugging even when validation fails
    if (v2.report.markdown) {
      await writeMarkdown(slug, 'report-v2-debug.md', v2.report.markdown);
      console.log(`  ⚠ debug markdown written to report-v2-debug.md`);
    }
    throw new Error(`v2 report validation failed with ${v2.report.errors.length} errors (see above)`);
  }

  if (v2.report.markdown) {
    await writeMarkdown(slug, 'report-v2.md', v2.report.markdown);
    console.log(`  ✓ v2 report written`);
  }

  if (v2.report.report) {
    await writeJson(slug, 'report-v2.json', v2.report.report);
  }

  return {
    slug,
    pipeline: 'v2',
    signalCount: v2.signals.length,
    tensionCount: v2.tensions.length,
    patternCount: v2.patterns.length,
    hypothesisCount: 0,
    implicationCount: 0,
    diagnosisType: v2.diagnosis.type,
    mechanismCount: v2.mechanisms.length,
    reportErrors: v2.report.errors.length,
  };
}

// ---------------------------------------------------------------------------
// Single company dispatcher
// ---------------------------------------------------------------------------

async function analyseCompany(
  name: string,
  slug: string,
): Promise<AnalysisResult | null> {
  console.log(`\nAnalysing: ${name}${USE_V2 ? ' [v2]' : ''}`);

  const dossier = await loadDossier(slug);
  if (!dossier) {
    console.log(`  ✗ No dossier found at runs/${slug}/dossier.json — skipping`);
    return null;
  }
  console.log(`  ✓ dossier loaded`);

  if (USE_V2) {
    return analyseCompanyV2(name, slug, dossier);
  }
  return analyseCompanyLegacy(name, slug, dossier);
}

// ---------------------------------------------------------------------------
// Batch runner
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const discoveryIdx = args.indexOf('--discovery');

  let targets: Array<{ name: string; slug: string }>;

  if (discoveryIdx !== -1) {
    // --discovery <file.json> mode
    const discoveryFile = args[discoveryIdx + 1];
    if (!discoveryFile) {
      throw new Error('--discovery requires a file path argument');
    }
    targets = await loadDiscoveryRun(discoveryFile);
    if (targets.length === 0) {
      return; // Warning already logged by loadDiscoveryRun
    }
  } else {
    const filterArg = args[0];
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
  }

  console.log(`Batch analysis: ${targets.length} companies (pipeline: ${USE_V2 ? 'intelligence-v2' : 'legacy'})`);
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
      if (r.pipeline === 'v2') {
        console.log(`  ${r.slug}: ${r.signalCount} signals, ${r.tensionCount} tensions, ${r.patternCount} patterns, diagnosis: ${r.diagnosisType}, ${r.mechanismCount} mechanisms${r.reportErrors > 0 ? ` (${r.reportErrors} report errors)` : ''}`);
      } else {
        console.log(`  ${r.slug}: ${r.signalCount} signals, ${r.tensionCount} tensions, ${r.patternCount} patterns, ${r.hypothesisCount} hypotheses, ${r.implicationCount} implications${r.reportErrors > 0 ? ` (${r.reportErrors} report errors)` : ''}`);
      }
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
