#!/usr/bin/env tsx
/**
 * Eval harness runner — loads a fixture, runs stage stubs, scores outputs.
 *
 * Usage: npx tsx src/report/evals/runner/run-fixture.ts [fixture-id]
 * Default fixture: 001-ai-services
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Dossier } from '../../../types/index.js';
import type { FixtureExpectations } from '../types/fixture.js';
import type { FixtureResult, StageScore } from '../types/eval-result.js';

import {
  parseStageExpectations,
  parseHypothesisExpectations,
  loadText,
} from '../scoring/common.js';
import { scoreSignals } from '../scoring/score-signals.js';
import { scoreTensions } from '../scoring/score-tensions.js';
import { scorePatterns } from '../scoring/score-patterns.js';
import { scoreHypotheses } from '../scoring/score-hypotheses.js';
import { scoreImplications } from '../scoring/score-implications.js';
import {
  extractSignals,
  detectTensions,
  detectPatterns,
  generateHypotheses,
  generateImplications,
  planReport,
} from '../stubs/stages.js';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../fixtures');
const RESULTS_DIR = resolve(__dirname, '../results');

// ---------------------------------------------------------------------------
// Fixture loader
// ---------------------------------------------------------------------------

async function loadFixture(fixtureId: string) {
  const dir = resolve(FIXTURES_DIR, fixtureId);

  const [dossierRaw, signalsMd, tensionsMd, patternsMd, hypothesesMd, implicationsMd] =
    await Promise.all([
      loadText(resolve(dir, 'dossier.json')),
      loadText(resolve(dir, 'expected-signals.md')),
      loadText(resolve(dir, 'expected-tensions.md')),
      loadText(resolve(dir, 'expected-patterns.md')),
      loadText(resolve(dir, 'expected-hypotheses.md')),
      loadText(resolve(dir, 'expected-implications.md')),
    ]);

  const dossier: Dossier = JSON.parse(dossierRaw);

  const expectations: FixtureExpectations = {
    signals: parseStageExpectations(signalsMd),
    tensions: parseStageExpectations(tensionsMd),
    patterns: parseStageExpectations(patternsMd),
    hypotheses: parseHypothesisExpectations(hypothesesMd),
    implications: parseStageExpectations(implicationsMd),
  };

  return { dossier, expectations };
}

// ---------------------------------------------------------------------------
// Terminal output
// ---------------------------------------------------------------------------

const SECONDARY_LABELS: Record<string, string> = {
  signals: 'Nice to detect',
  tensions: 'Nice to detect',
  patterns: 'Nice to detect',
  hypotheses: 'Acceptable alternatives matched',
  implications: 'Nice to detect',
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function printStageScore(score: StageScore): void {
  const label = SECONDARY_LABELS[score.stage] ?? 'Nice to detect';
  console.log(`\n${capitalize(score.stage)}:`);
  console.log(`  Must detect: ${score.must_detect.matched} / ${score.must_detect.expected}`);
  console.log(`  ${label}: ${score.nice_to_detect.matched} / ${score.nice_to_detect.expected}`);
  console.log(`  Must avoid violations: ${score.must_avoid.violations}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function runFixture(fixtureId: string): Promise<FixtureResult> {
  console.log(`\nFixture: ${fixtureId}`);
  console.log('='.repeat(40));

  const { dossier, expectations } = await loadFixture(fixtureId);

  // Run stage stubs (replace with real implementations as they're built)
  const signals = extractSignals(dossier);
  const tensions = detectTensions(dossier, signals);
  const patterns = detectPatterns(dossier, tensions);
  const hypotheses = generateHypotheses(dossier, patterns);
  const implications = generateImplications(dossier, hypotheses);

  // Run plan-report (not scored yet — just verify it runs without errors)
  const plan = planReport(dossier);
  console.log('\nReport Plan:');
  console.log(`  Core thesis: ${plan.core_thesis.substring(0, 100)}...`);
  console.log(`  Key findings: ${plan.key_findings.length}`);
  console.log(`  Primary hypotheses: ${plan.primary_hypothesis_ids.length}`);
  console.log(`  Supporting hypotheses: ${plan.supporting_hypothesis_ids.length}`);
  console.log(`  Selected implications: ${plan.implication_ids.length}`);
  console.log(`  Sections: ${plan.section_plan.length}`);
  console.log(`  Tone: ${plan.tone_profile.style} / directness=${plan.tone_profile.directness} / skepticism=${plan.tone_profile.skepticism}`);

  // Score each stage
  const stages: StageScore[] = [
    scoreSignals(expectations.signals, signals),
    scoreTensions(expectations.tensions, tensions),
    scorePatterns(expectations.patterns, patterns),
    scoreHypotheses(expectations.hypotheses, hypotheses),
    scoreImplications(expectations.implications, implications),
  ];

  // Print results
  for (const stage of stages) {
    printStageScore(stage);
  }

  const passed = stages.every(s => s.passed);
  console.log(`\nOverall:\n  ${passed ? 'PASS' : 'FAIL'}\n`);

  // Write machine-readable result
  const result: FixtureResult = {
    fixture_id: fixtureId,
    ran_at: new Date().toISOString(),
    stages,
    passed,
  };

  await mkdir(RESULTS_DIR, { recursive: true });
  const resultPath = resolve(RESULTS_DIR, `${fixtureId}-${Date.now()}.json`);
  await writeFile(resultPath, JSON.stringify(result, null, 2));
  console.log(`Result written: ${resultPath}`);

  return result;
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

const fixtureId = process.argv[2] ?? '001-ai-services';

runFixture(fixtureId).catch(err => {
  console.error('Eval failed:', err);
  process.exit(1);
});
