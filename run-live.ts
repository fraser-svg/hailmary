#!/usr/bin/env -S npx tsx --env-file=.env
/**
 * Live Pipeline Runner — full end-to-end acquisition + reasoning + memo
 *
 * Usage:
 *   npx tsx --env-file=.env run-live.ts "Company Name" company.com [--v4]
 *
 * Requires:
 *   .env with PERPLEXITY_API_KEY (for external research via Perplexity)
 *   claude CLI installed (for LLM calls via MAX subscription)
 *   playwright installed (for site corpus rendering)
 *
 * What happens:
 *   1. Playwright fetches and renders company site pages (homepage, pricing, about, ...)
 *   2. Perplexity searches for reviews, press, competitors, funding, LinkedIn
 *   3. Corpus merged, deduplicated, tier-classified, adapted to Dossier
 *   4. V2 reasoning: signals → GTM → tensions → patterns → diagnosis → mechanisms → intervention
 *   5. Memo layer: evidence pack → adjudication → brief → write → critic → revision → send gate
 *   6. Results saved to runs/<slug>/
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { runV3Pipeline } from "./src/intelligence-v3/pipeline/run-v3-pipeline.js";
import type { V3PipelineResult } from "./src/intelligence-v3/pipeline/run-v3-pipeline.js";
import { makeClaudeCliClient } from "./src/utils/claude-cli-client.js";
import { slugify } from "./src/utils/ids.js";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const flags = args.filter(a => a.startsWith("--"));
const positional = args.filter(a => !a.startsWith("--"));

const company = positional[0];
const domain = positional[1];
const useV4 = flags.includes("--v4");

if (!company || !domain) {
  console.error('Usage: npx tsx --env-file=.env run-live.ts "Company Name" company.com [--v4]');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Env check
// ---------------------------------------------------------------------------

if (!process.env["PERPLEXITY_API_KEY"]) {
  console.error("PERPLEXITY_API_KEY not set. Create .env with your key.");
  process.exit(1);
}

console.error(`[run-live] Company: ${company}`);
console.error(`[run-live] Domain: ${domain}`);
console.error(`[run-live] Memo version: ${useV4 ? "V4 (synthesis)" : "V3 (template)"}`);
console.error(`[run-live] Perplexity: configured`);
console.error(`[run-live] Site rendering: Playwright (auto)`);
console.error(`[run-live] LLM: claude -p (MAX subscription)`);
console.error("");

// ---------------------------------------------------------------------------
// LLM client (claude -p subprocess)
// ---------------------------------------------------------------------------

const cliClient = makeClaudeCliClient();
const writerConfig = { client: cliClient as never };
const criticConfig = { client: cliClient as never };
const synthConfig = { client: cliClient as never };

// ---------------------------------------------------------------------------
// Run pipeline
// ---------------------------------------------------------------------------

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const slug = slugify(company);

console.error(`[run-live] Starting pipeline for ${company} (${domain})...`);
console.error(`[run-live] Step 1/6: Site corpus acquisition (Playwright)...`);

const startTime = Date.now();

let result: V3PipelineResult;
try {
  result = await runV3Pipeline({
    company,
    domain,
    // NO dossier — triggers live acquisition
    memoIntelligenceVersion: useV4 ? "v4" : "v3",
    writerConfig,
    criticConfig,
    ...(useV4 ? { synthConfig } : {}),
  });
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\n[run-live] PIPELINE FAILED: ${msg}`);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

// ---------------------------------------------------------------------------
// Save results
// ---------------------------------------------------------------------------

const runDir = resolve(PROJECT_ROOT, "runs", slug);
mkdirSync(runDir, { recursive: true });

// Dossier
writeFileSync(
  resolve(runDir, "dossier.json"),
  JSON.stringify(result.dossier, null, 2),
  "utf-8"
);

// Full pipeline result (large — includes all intermediate outputs)
writeFileSync(
  resolve(runDir, "pipeline-result.json"),
  JSON.stringify(result, null, 2),
  "utf-8"
);

// Memo markdown (the product)
if (result.memo) {
  writeFileSync(
    resolve(runDir, "memo.md"),
    result.memo.markdown,
    "utf-8"
  );
}

// Pipeline summary (compact)
const summary = {
  company,
  domain,
  slug,
  generated_at: result.generated_at,
  elapsed_seconds: parseFloat(elapsed),
  memo_intelligence_version: result.memo_intelligence_version,

  // Acquisition
  corpus_pages: result.corpus?.site_pages.length ?? 0,
  corpus_external_sources: result.corpus?.external_sources.length ?? 0,
  corpus_tier_distribution: result.corpus?.merge_metadata.tier_distribution ?? {},

  // Reasoning
  diagnosis_type: result.v2Result.diagnosis?.type ?? null,
  diagnosis_confidence: result.v2Result.diagnosis?.confidence ?? null,
  diagnosis_statement: result.v2Result.diagnosis?.statement ?? null,
  intervention_type: result.v2Result.intervention?.type ?? null,
  pattern_count: result.v2Result.v2_patterns?.length ?? 0,
  tension_count: result.v2Result.tensions?.length ?? 0,

  // Memo
  adjudication_mode: result.adjudication.adjudication_mode,
  memo_word_count: result.memo?.word_count ?? null,
  memo_attempt: result.memo?.attempt_number ?? null,
  critic_overall_pass: result.criticResult?.overall_pass ?? null,
  send_gate_result: result.sendGate?.result ?? null,
  send_gate_quality: result.sendGate?.memo_quality_score ?? null,

  // V4 synthesis (if applicable)
  v4_synthesis_active: result.argumentSynthesis
    ? !result.argumentSynthesis.fallback_to_template
    : false,
  v4_synthesis_confidence: result.argumentSynthesis?.synthesis_confidence ?? null,
};

writeFileSync(
  resolve(runDir, "pipeline-summary.json"),
  JSON.stringify(summary, null, 2),
  "utf-8"
);

// ---------------------------------------------------------------------------
// Print results
// ---------------------------------------------------------------------------

const SEP = "=".repeat(72);
const sep = "-".repeat(72);

console.error(`\n${SEP}`);
console.error(`PIPELINE COMPLETE — ${company} (${elapsed}s)`);
console.error(SEP);

console.error(`\n[ACQUISITION]`);
console.error(`  Site pages:       ${summary.corpus_pages}`);
console.error(`  External sources: ${summary.corpus_external_sources}`);
console.error(`  Tier distribution: ${JSON.stringify(summary.corpus_tier_distribution)}`);

console.error(`\n[REASONING]`);
console.error(`  Diagnosis:   ${summary.diagnosis_type} (${summary.diagnosis_confidence})`);
console.error(`  Statement:   "${summary.diagnosis_statement}"`);
console.error(`  Intervention: ${summary.intervention_type}`);
console.error(`  Patterns: ${summary.pattern_count}, Tensions: ${summary.tension_count}`);

console.error(`\n[MEMO]`);
console.error(`  Adjudication:  ${summary.adjudication_mode}`);
console.error(`  Word count:    ${summary.memo_word_count}`);
console.error(`  Critic pass:   ${summary.critic_overall_pass}`);
console.error(`  Send gate:     ${summary.send_gate_result} (quality: ${summary.send_gate_quality})`);
console.error(`  Version:       ${summary.memo_intelligence_version}`);

if (summary.v4_synthesis_active) {
  console.error(`  Synthesis:     ACTIVE (confidence: ${summary.v4_synthesis_confidence})`);
}

if (result.memo) {
  console.error(`\n${sep}`);
  console.error("MEMO OUTPUT");
  console.error(sep);
  // Print memo to stdout (not stderr) so it can be piped/captured
  console.log(result.memo.markdown);
} else {
  console.error(`\n  (no memo produced — adjudication: ${summary.adjudication_mode})`);
}

console.error(`\n${sep}`);
console.error(`Saved to: ${runDir}/`);
console.error(`  dossier.json, memo.md, pipeline-result.json, pipeline-summary.json`);
console.error(sep);
