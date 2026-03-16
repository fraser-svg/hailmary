#!/usr/bin/env -S npx tsx
/**
 * Phase 3 Live Evaluation — V3 vs V4 memo intelligence
 * Uses `claude -p` subprocess for all LLM calls (MAX subscription auth).
 *
 * Companies: Trigger.dev, Omnea, Pimlico
 * (Resend has no dossier; Stripe fails V2 with no patterns)
 *
 * Constraints per spec v4-001-memo-intelligence.md §7:
 * - Identical dossier inputs for V3 and V4
 * - Identical V2 reasoning (same dossier → same V2 outputs)
 * - Writer/Critic model: Haiku 4.5 (unchanged)
 * - Synthesis (V4 only): Sonnet 4.6 per synthesise-argument DEFAULT_MODEL
 */

import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { runV3Pipeline } from "./src/intelligence-v3/pipeline/run-v3-pipeline.js";
import type { V3PipelineResult } from "./src/intelligence-v3/pipeline/run-v3-pipeline.js";
import {
  buildComparisonSummary,
  printComparisonTable,
  type ComparisonSummary,
  type RunComparison,
} from "./src/report/evals/compare-v3-v4.js";
import type { Dossier } from "./src/types/dossier.js";

// ---------------------------------------------------------------------------
// claude -p LLM client (MAX subscription auth via installed claude CLI)
// ---------------------------------------------------------------------------

/**
 * Duck-typed Anthropic client that calls `claude -p` as a subprocess.
 * Handles very long system/user prompts safely via execFileSync arg array.
 */
function makeClaudeCliClient(): object {
  return {
    messages: {
      create: async (params: {
        model?: string;
        system?: string;
        messages: Array<{ role: string; content: string }>;
        max_tokens?: number;
        temperature?: number;
      }) => {
        const model = params.model ?? "claude-haiku-4-5-20251001";
        const userMsg =
          params.messages.findLast?.((m: { role: string }) => m.role === "user")?.content ??
          params.messages[params.messages.length - 1]?.content ??
          "";
        const system = params.system ?? "";

        const args = ["-p", userMsg, "--model", model];
        if (system) {
          args.push("--system-prompt", system);
        }

        const raw = execFileSync("claude", args, {
          maxBuffer: 8 * 1024 * 1024, // 8 MB
          timeout: 180_000, // 3 min per call
          encoding: "utf-8",
        });

        return {
          content: [{ type: "text" as const, text: raw.trim() }],
        };
      },
    },
  };
}

// ---------------------------------------------------------------------------
// founder_stop_power rubric (spec §7)
// ---------------------------------------------------------------------------

const STOP_POWER_RUBRIC =
  "Score the memo on founder_stop_power (1–5). " +
  "5=MUST READ: names their specific strategic problem. " +
  "4=KEEPS READING: credible and specific. " +
  "3=READS POLITELY: interesting but generic enough to set aside. " +
  "2=SKIMS: could be about any SaaS company. " +
  "1=DISCARDS: boilerplate. " +
  "Return ONLY: {\"score\": N, \"reason\": \"one sentence\"}";

async function scoreFounderStopPower(
  memo: string,
  company: string
): Promise<{ score: number; reason: string }> {
  const client = makeClaudeCliClient() as {
    messages: {
      create: (p: object) => Promise<{ content: Array<{ type: string; text: string }> }>;
    };
  };

  const result = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    system:
      `You are a B2B SaaS founder receiving a cold outreach memo about your company (${company}). ` +
      STOP_POWER_RUBRIC,
    messages: [{ role: "user", content: memo }],
    max_tokens: 150,
    temperature: 0,
  });

  const raw = result.content[0]?.text ?? "";
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`no JSON: ${raw.slice(0, 80)}`);
    return JSON.parse(match[0]) as { score: number; reason: string };
  } catch {
    return { score: 0, reason: `parse error: ${raw.slice(0, 80)}` };
  }
}

// ---------------------------------------------------------------------------
// Detailed output printer
// ---------------------------------------------------------------------------

function printEvalDetail(company: string, v3: V3PipelineResult, v4: V3PipelineResult): void {
  const SEP = "═".repeat(72);
  const sep = "─".repeat(72);

  console.log(`\n${SEP}`);
  console.log(`COMPANY: ${company}`);
  console.log(SEP);

  // V2 reasoning (same for both since identical dossier)
  const v2 = v3.v2Result;
  console.log(`\n[V2 REASONING]`);
  if (v2.diagnosis) {
    console.log(`  diagnosis:    ${v2.diagnosis.type} (${v2.diagnosis.confidence})`);
    console.log(`  statement:    "${v2.diagnosis.statement}"`);
  }
  if (v2.intervention) {
    console.log(`  intervention: ${v2.intervention.type}`);
  }

  // V3 memo
  console.log(`\n${sep}`);
  console.log(`V3 MEMO (template thesis)`);
  console.log(sep);
  if (v3.memo) {
    console.log(v3.memo.markdown);
    console.log(`\n  [word_count: ${v3.memo.word_count}]`);
  } else {
    console.log(`  (no memo — adjudication: ${v3.adjudication?.adjudication_mode ?? "unknown"})`);
  }

  // V3 critic
  console.log(`\n[V3 CRITIC]`);
  if (v3.criticResult) {
    const c = v3.criticResult;
    const dims = c.dimensions;
    console.log(`  overall_pass:       ${c.overall_pass}`);
    console.log(`  genericity:         ${c.genericity_test.result}`);
    console.log(
      `  dims: evidence=${dims.evidence_grounding.score} sharp=${dims.commercial_sharpness.score} cta=${dims.cta_clarity.score} tone=${dims.tone_compliance.score}`
    );
    if (c.revision_instructions) {
      const ri = c.revision_instructions as { failing_dimensions?: string[]; specific_issues?: string[] };
      console.log(`  revision dims: [${(ri.failing_dimensions ?? []).join(", ")}]`);
      if (ri.specific_issues?.length) {
        console.log(`  revision issues: ${(ri.specific_issues ?? []).slice(0, 2).join("; ").slice(0, 120)}`);
      }
    }
  } else {
    console.log(`  (absent)`);
  }

  // V3 send gate
  console.log(`\n[V3 SEND GATE]`);
  if (v3.sendGate) {
    console.log(`  result:       ${v3.sendGate.result}`);
    console.log(`  quality:      ${v3.sendGate.memo_quality_score}`);
    console.log(`  recommend:    ${v3.sendGate.recommendation}`);
  } else {
    console.log(`  (absent)`);
  }

  // Argument synthesis (V4 only)
  console.log(`\n${sep}`);
  console.log(`V4 ARGUMENT SYNTHESIS`);
  console.log(sep);
  const synth = v4.argumentSynthesis;
  if (synth && !synth.fallback_to_template) {
    console.log(`  synthesis_confidence: ${synth.synthesis_confidence}`);
    console.log(`  diagnosis_fit:        ${synth.diagnosis_fit}`);
    console.log(`  distinctness_check:   ${synth.distinctness_check.passed}`);
    console.log(`\n  company_specific_thesis:`);
    console.log(`  "${synth.company_specific_thesis}"`);
    console.log(`\n  mechanism_narratives (${synth.mechanism_narratives.length}):`);
    for (const m of synth.mechanism_narratives) {
      console.log(`    [${m.mechanism_type}]`);
      console.log(`    ${m.company_specific_narrative}`);
    }
    console.log(`\n  argument_skeleton:`);
    for (const step of synth.argument_skeleton) {
      console.log(`    ${step.step_order}. ${step.logical_role} (${step.evidence_id}) → "${step.purpose}"`);
    }
    console.log(`\n  hook_strategy:`);
    console.log(`    tension_type: ${synth.hook_strategy.tension_type}`);
    console.log(`    framing: "${synth.hook_strategy.framing}"`);
    console.log(`    why_it_matters: "${synth.hook_strategy.why_it_matters}"`);
  } else if (synth?.fallback_to_template) {
    console.log(
      `  FALLBACK TO TEMPLATE — confidence=${synth.synthesis_confidence}, fit=${synth.diagnosis_fit}`
    );
    if (synth.distinctness_check.notes?.length) {
      console.log(`  distinctness_notes: ${synth.distinctness_check.notes.join("; ")}`);
    }
  } else {
    console.log(`  (synthesis absent — V4 mode not active or errored)`);
  }

  // V4 memo
  console.log(`\n${sep}`);
  console.log(`V4 MEMO (synthesis thesis)`);
  console.log(sep);
  if (v4.memo) {
    console.log(v4.memo.markdown);
    console.log(`\n  [word_count: ${v4.memo.word_count}]`);
  } else {
    console.log(`  (no memo — adjudication: ${v4.adjudication?.adjudication_mode ?? "unknown"})`);
  }

  // V4 critic
  console.log(`\n[V4 CRITIC]`);
  if (v4.criticResult) {
    const c = v4.criticResult;
    const dims = c.dimensions;
    console.log(`  overall_pass:       ${c.overall_pass}`);
    console.log(`  genericity:         ${c.genericity_test.result}`);
    console.log(
      `  dims: evidence=${dims.evidence_grounding.score} sharp=${dims.commercial_sharpness.score} cta=${dims.cta_clarity.score} tone=${dims.tone_compliance.score}`
    );
    if (c.revision_instructions) {
      const ri = c.revision_instructions as { failing_dimensions?: string[]; specific_issues?: string[] };
      console.log(`  revision dims: [${(ri.failing_dimensions ?? []).join(", ")}]`);
      if (ri.specific_issues?.length) {
        console.log(`  revision issues: ${(ri.specific_issues ?? []).slice(0, 2).join("; ").slice(0, 120)}`);
      }
    }
  } else {
    console.log(`  (absent)`);
  }

  // V4 send gate
  console.log(`\n[V4 SEND GATE]`);
  if (v4.sendGate) {
    console.log(`  result:       ${v4.sendGate.result}`);
    console.log(`  quality:      ${v4.sendGate.memo_quality_score}`);
    console.log(`  recommend:    ${v4.sendGate.recommendation}`);
  } else {
    console.log(`  (absent)`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const COMPANIES = [
  { slug: "omnea", company: "Omnea", domain: "omnea.com" },
  { slug: "gendo", company: "Gendo", domain: "gendo.ai" },
];

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const runsDir = resolve(PROJECT_ROOT, "runs");
const evalResultsDir = resolve(PROJECT_ROOT, "eval-results");
mkdirSync(evalResultsDir, { recursive: true });

const cliClient = makeClaudeCliClient();
// Cast to `never` since the duck type satisfies the interface at runtime
const writerConfig = { client: cliClient as never };
const criticConfig = { client: cliClient as never };
const synthConfig = { client: cliClient as never };

type EvalEntry = {
  company: string;
  slug: string;
  v3: V3PipelineResult;
  v4: V3PipelineResult;
  comparison: ComparisonSummary;
  v3StopPower: { score: number; reason: string };
  v4StopPower: { score: number; reason: string };
};

const allResults: EvalEntry[] = [];

for (const { slug, company, domain } of COMPANIES) {
  console.error(`\n⏳ ${company} — starting...`);

  const dossierPath = resolve(runsDir, slug, "dossier.json");
  const dossier: Dossier = JSON.parse(readFileSync(dossierPath, "utf-8"));

  const resolvedCompany =
    dossier.company_input?.resolved_company_name ??
    dossier.company_input?.company_name ??
    company;
  const resolvedDomain =
    dossier.company_input?.resolved_domain ??
    dossier.company_input?.primary_domain ??
    domain;

  // --- V3 (independent try/catch) ---
  let v3: V3PipelineResult | null = null;
  try {
    console.error(`  V3...`);
    v3 = await runV3Pipeline({
      company: resolvedCompany,
      domain: resolvedDomain,
      dossier,
      memoIntelligenceVersion: "v3",
      writerConfig,
      criticConfig,
    });
  } catch (err) {
    console.error(`  ✗ V3 ERROR for ${company}:`, err instanceof Error ? err.message : err);
  }

  // --- V4 (independent try/catch) ---
  let v4: V3PipelineResult | null = null;
  try {
    console.error(`  V4...`);
    v4 = await runV3Pipeline({
      company: resolvedCompany,
      domain: resolvedDomain,
      dossier,
      memoIntelligenceVersion: "v4",
      writerConfig,
      criticConfig,
      synthConfig,
    });
  } catch (err) {
    console.error(`  ✗ V4 ERROR for ${company}:`, err instanceof Error ? err.message : err);
  }

  if (!v3 && !v4) {
    console.error(`  ✗ Both V3 and V4 failed for ${company} — skipping`);
    continue;
  }

  // Use v3 as fallback for v4 if v4 failed (for comparison purposes only)
  const v3Safe = v3 ?? v4!;
  const v4Safe = v4 ?? v3!;

  console.error(`  Scoring stop power...`);
  const [v3StopPower, v4StopPower] = await Promise.all([
    v3Safe.memo ? scoreFounderStopPower(v3Safe.memo.markdown, company) : Promise.resolve({ score: 0, reason: "no memo" }),
    v4Safe.memo && v4 ? scoreFounderStopPower(v4Safe.memo.markdown, company) : Promise.resolve({ score: 0, reason: v4 ? "no memo" : "pipeline error" }),
  ]);

  try {
    const comparison = buildComparisonSummary(v3Safe, v4Safe);
    allResults.push({ company, slug, v3: v3Safe, v4: v4Safe, comparison, v3StopPower, v4StopPower });

    // Print full eval
    printEvalDetail(company, v3Safe, v4Safe);

    // Comparison table
    const rc: RunComparison = {
      slug,
      timestamp: new Date().toISOString(),
      mode: "live",
      v3: v3Safe,
      v4: v4Safe,
      comparison,
    };
    printComparisonTable(rc);

    console.log(`\n[FOUNDER STOP POWER]`);
    console.log(`  V3: ${v3StopPower.score}/5 — ${v3StopPower.reason}`);
    if (v4) {
      console.log(`  V4: ${v4StopPower.score}/5 — ${v4StopPower.reason}`);
    } else {
      console.log(`  V4: pipeline error — no memo`);
    }

    // Persist
    const outPath = resolve(evalResultsDir, `phase3-${slug}-${Date.now()}.json`);
    writeFileSync(
      outPath,
      JSON.stringify({
        company, slug, ...rc,
        v3StopPower, v4StopPower,
        v3_ok: v3 !== null,
        v4_ok: v4 !== null,
      }, null, 2),
      "utf-8"
    );
    console.error(`  ✓ Saved: ${outPath}`);
  } catch (err) {
    console.error(`  ✗ POST-PIPELINE ERROR for ${company}:`, err instanceof Error ? err.message : err);
  }
}

// ---------------------------------------------------------------------------
// Summary table
// ---------------------------------------------------------------------------

if (allResults.length > 0) {
  console.log(`\n\n${"═".repeat(74)}`);
  console.log(`PHASE 3 EVAL SUMMARY — V3 vs V4`);
  console.log(`${"═".repeat(74)}`);

  const h = (s: string, w: number) => s.slice(0, w).padEnd(w);
  console.log(
    `${h("Company", 13)} ${h("V3 gate", 9)} ${h("V4 gate", 9)} ${h("V3 Q", 6)} ${h("V4 Q", 6)} ${h("V3 fsp", 7)} ${h("V4 fsp", 7)} ${h("Synth", 13)} ${h("V3 generic", 11)} ${h("V4 generic", 11)}`
  );
  console.log(`${"─".repeat(74)}`);

  for (const { company, comparison: c, v3StopPower, v4StopPower } of allResults) {
    console.log(
      `${h(company, 13)} ` +
        `${h(c.v3_send_gate_result ?? "—", 9)} ${h(c.v4_send_gate_result ?? "—", 9)} ` +
        `${h(String(c.v3_quality_score ?? "—"), 6)} ${h(String(c.v4_quality_score ?? "—"), 6)} ` +
        `${h(String(v3StopPower.score), 7)} ${h(String(v4StopPower.score), 7)} ` +
        `${h(String(c.v4_synthesis_active), 13)} ` +
        `${h(c.v3_genericity_result ?? "—", 11)} ${h(c.v4_genericity_result ?? "—", 11)}`
    );
  }
  console.log(`${"─".repeat(74)}`);

  console.log(`\nV4 SYNTHESIS DETAILS:`);
  for (const { company, comparison: c, v3StopPower, v4StopPower } of allResults) {
    const synthDelta =
      v4StopPower.score - v3StopPower.score > 0
        ? `+${v4StopPower.score - v3StopPower.score}`
        : String(v4StopPower.score - v3StopPower.score);
    console.log(`  ${company}:`);
    console.log(
      `    synthesis_active=${c.v4_synthesis_active}, confidence=${c.v4_synthesis_confidence}, fit=${c.v4_diagnosis_fit}`
    );
    console.log(
      `    mechanisms=${c.v4_mechanism_count}, skeleton=${c.v4_argument_skeleton_length}, hook_source=${c.v4_hook_framing_source}`
    );
    console.log(
      `    proper_noun=${c.v4_thesis_has_company_proper_noun}, consequence_lang=${c.v4_thesis_has_consequence_language}, distinct=${c.v4_mechanisms_appear_distinct}`
    );
    console.log(
      `    stop_power: V3=${v3StopPower.score} → V4=${v4StopPower.score} (${synthDelta})`
    );
    if (c.v3_thesis !== c.v4_thesis) {
      console.log(`    V3 thesis: "${c.v3_thesis.slice(0, 90)}..."`);
      console.log(`    V4 thesis: "${c.v4_thesis.slice(0, 90)}..."`);
    } else {
      console.log(`    Both theses identical (synthesis fallback=true or same template)`);
    }
  }
}
