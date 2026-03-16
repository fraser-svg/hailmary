#!/usr/bin/env tsx
/**
 * V3 vs V4 Memo Intelligence Comparison Harness
 *
 * Loads a fixture dossier, runs the same pipeline twice — once with
 * memoIntelligenceVersion: "v3", once with "v4" — and emits a paired
 * result artifact plus a compact comparison summary.
 *
 * Usage:
 *   npx tsx src/report/evals/compare-v3-v4.ts [slug] [--mode=mock|live] [--output=path]
 *
 * Modes:
 *   mock (default): Injects pre-canned clients for writer, critic, and synthesis.
 *                   Fully deterministic. Safe for CI and regression checks.
 *   live:           Uses ANTHROPIC_API_KEY. Costs real tokens. Run manually only.
 *
 * Output:
 *   results/compare-<slug>-<timestamp>.json   (or --output path)
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { Dossier } from "../../types/dossier.js";
import { runV3Pipeline } from "../../intelligence-v3/pipeline/run-v3-pipeline.js";
import type { V3PipelineResult } from "../../intelligence-v3/pipeline/run-v3-pipeline.js";
import type { WriteMemoConfig } from "../../intelligence-v3/memo/write-memo.js";
import type { CriticConfig } from "../../intelligence-v3/memo/criticise-memo.js";
import type { SynthesiseArgumentConfig } from "../../intelligence-v3/memo/synthesise-argument.js";
import type { ArgumentSynthesis } from "../../intelligence-v3/types/argument-synthesis.js";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface ComparisonSummary {
  // ── Thesis ─────────────────────────────────────────────────────────────
  /** Template thesis from V3 brief (diagnosis.statement) */
  v3_thesis: string;
  /** Synthesised thesis when active, otherwise same template as v3 */
  v4_thesis: string;
  /** True when synthesis ran and fallback_to_template = false */
  v4_synthesis_active: boolean;
  v4_fallback_to_template: boolean;
  v4_synthesis_confidence: "high" | "medium" | "low" | null;
  v4_diagnosis_fit: "strong" | "adequate" | "strained" | null;

  // ── Argument structure ─────────────────────────────────────────────────
  v4_mechanism_count: number;
  v4_argument_skeleton_length: number;
  /** "synthesis" when hookStrategy.framing was used, otherwise "template" */
  v4_hook_framing_source: "synthesis" | "template";
  /** The actual framing instruction used in the brief */
  v4_hook_framing: string;

  // ── Critic dimensions ──────────────────────────────────────────────────
  v3_genericity_result: "pass" | "fail" | null;
  v4_genericity_result: "pass" | "fail" | null;
  v3_commercial_sharpness: number | null;
  v4_commercial_sharpness: number | null;
  v3_critic_overall_pass: boolean | null;
  v4_critic_overall_pass: boolean | null;

  // ── Send gate ──────────────────────────────────────────────────────────
  v3_send_gate_result: "pass" | "fail" | null;
  v4_send_gate_result: "pass" | "fail" | null;
  v3_quality_score: number | null;
  v4_quality_score: number | null;

  // ── Memo ───────────────────────────────────────────────────────────────
  v3_word_count: number | null;
  v4_word_count: number | null;

  // ── Heuristics (deterministic, computed from synthesis output) ─────────
  /** Thesis contains at least one capitalised word that reads as a proper noun */
  v4_thesis_has_company_proper_noun: boolean;
  /** Thesis contains consequence-language token (limits, costing, prevents, etc.) */
  v4_thesis_has_consequence_language: boolean;
  /** Mechanism narratives have different mechanism_type AND Jaccard ≤ 0.60 */
  v4_mechanisms_appear_distinct: boolean;
  /** Result of distinctness_check.passed from synthesis */
  v4_distinctness_check_passed: boolean | null;
  v4_distinctness_notes: string[] | null;
}

export interface RunComparison {
  slug: string;
  timestamp: string;
  mode: "mock" | "live";
  v3: V3PipelineResult;
  v4: V3PipelineResult;
  comparison: ComparisonSummary;
}

// ---------------------------------------------------------------------------
// Heuristics
// ---------------------------------------------------------------------------

const CONSEQUENCE_TOKENS = [
  "which means", "meaning", "costing", "limits", "prevents", "blocks",
  "constraining", "ceiling", "at risk", "fragility", "loss of",
  "cannot scale", "constrains", "bottleneck", "cap on", "capped by",
];

export function hasConsequenceLanguage(text: string): boolean {
  const lower = text.toLowerCase();
  return CONSEQUENCE_TOKENS.some(t => lower.includes(t));
}

const GENERIC_STOP_WORDS = new Set([
  "the", "a", "an", "this", "that", "these", "those",
  "its", "their", "our", "your", "his", "her", "we", "they",
  "is", "are", "was", "were", "has", "have", "had",
  "in", "on", "at", "by", "for", "with", "about", "without",
  "and", "or", "but", "if", "when", "while", "because",
  "not", "no", "so", "as", "be", "it", "to", "of", "from",
  "ai", "saas", "b2b", "crm", "gtm", "erp", "api", "llm",
]);

/**
 * Heuristic: does the text contain a word that looks like a proper noun?
 * Looks for capitalised words (2+ chars) not in the generic stop-word list.
 * False positives are acceptable — this is a soft diagnostic signal.
 * Note: position-0 words are NOT excluded because thesis paragraphs often
 * start with the company name (e.g. "AutoFlow AI's mandatory fee…").
 */
export function hasCompanyProperNoun(text: string): boolean {
  const words = text.split(/\s+/);
  return words.some((raw) => {
    const stripped = raw.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, ""); // strip punctuation
    if (stripped.length < 2) return false;
    const first = stripped[0];
    // Must start with uppercase letter
    if (first !== first.toUpperCase() || first === first.toLowerCase()) return false;
    const lower = stripped.toLowerCase();
    // Common sentence-starters and generic terms are filtered via stop-word list
    if (GENERIC_STOP_WORDS.has(lower)) return false;
    return true;
  });
}

/**
 * Heuristic: are the two mechanism narratives meaningfully distinct?
 * Checks: different mechanism_type AND Jaccard evidence overlap ≤ 0.60.
 */
export function mechanismsAppearDistinct(synthesis: ArgumentSynthesis): boolean {
  if (synthesis.mechanism_narratives.length < 2) return false;
  const [m1, m2] = synthesis.mechanism_narratives;
  if (m1.mechanism_type === m2.mechanism_type) return false;
  const refs1 = new Set(m1.evidence_refs);
  const refs2 = new Set(m2.evidence_refs);
  const intersectionSize = [...refs1].filter(r => refs2.has(r)).length;
  const unionSize = new Set([...refs1, ...refs2]).size;
  if (unionSize === 0) return true; // no refs at all: assume distinct
  return intersectionSize / unionSize <= 0.60;
}

// ---------------------------------------------------------------------------
// Comparison summary builder
// ---------------------------------------------------------------------------

export function buildComparisonSummary(
  v3: V3PipelineResult,
  v4: V3PipelineResult
): ComparisonSummary {
  const synthesis = v4.argumentSynthesis;
  const synthActive = synthesis !== undefined && !synthesis.fallback_to_template;

  const v3Thesis = v3.memoBrief?.thesis ?? "(no brief — adjudication aborted)";
  const v4Thesis = synthActive
    ? synthesis.company_specific_thesis
    : v4.memoBrief?.thesis ?? "(no brief — adjudication aborted)";

  const v4HookFramingSource: "synthesis" | "template" = synthActive ? "synthesis" : "template";
  const v4HookFraming = v4.memoBrief?.hook?.framing_instruction ?? "";

  return {
    // Thesis
    v3_thesis: v3Thesis,
    v4_thesis: v4Thesis,
    v4_synthesis_active: synthActive,
    v4_fallback_to_template: synthesis?.fallback_to_template ?? false,
    v4_synthesis_confidence: synthesis?.synthesis_confidence ?? null,
    v4_diagnosis_fit: synthesis?.diagnosis_fit ?? null,

    // Structure
    v4_mechanism_count: synthesis?.mechanism_narratives.length ?? 0,
    v4_argument_skeleton_length: synthesis?.argument_skeleton.length ?? 0,
    v4_hook_framing_source: v4HookFramingSource,
    v4_hook_framing: v4HookFraming,

    // Critic
    v3_genericity_result: v3.criticResult?.genericity_test.result ?? null,
    v4_genericity_result: v4.criticResult?.genericity_test.result ?? null,
    v3_commercial_sharpness: v3.criticResult?.dimensions.commercial_sharpness.score ?? null,
    v4_commercial_sharpness: v4.criticResult?.dimensions.commercial_sharpness.score ?? null,
    v3_critic_overall_pass: v3.criticResult?.overall_pass ?? null,
    v4_critic_overall_pass: v4.criticResult?.overall_pass ?? null,

    // Send gate
    v3_send_gate_result: v3.sendGate?.result ?? null,
    v4_send_gate_result: v4.sendGate?.result ?? null,
    v3_quality_score: v3.sendGate?.memo_quality_score ?? null,
    v4_quality_score: v4.sendGate?.memo_quality_score ?? null,

    // Memo
    v3_word_count: v3.memo?.word_count ?? null,
    v4_word_count: v4.memo?.word_count ?? null,

    // Heuristics
    v4_thesis_has_company_proper_noun: synthActive
      ? hasCompanyProperNoun(synthesis.company_specific_thesis)
      : false,
    v4_thesis_has_consequence_language: synthActive
      ? hasConsequenceLanguage(synthesis.company_specific_thesis)
      : false,
    v4_mechanisms_appear_distinct: synthActive
      ? mechanismsAppearDistinct(synthesis)
      : false,
    v4_distinctness_check_passed: synthesis?.distinctness_check.passed ?? null,
    v4_distinctness_notes: synthesis?.distinctness_check.notes ?? null,
  };
}

// ---------------------------------------------------------------------------
// Mock client factory
// ---------------------------------------------------------------------------

/**
 * Returns an Anthropic-compatible object that always responds with the
 * given JSON text. Satisfies the messages.create() contract used by
 * writeMemo, criticiseMemo, and synthesiseArgument.
 */
export function makeMockAnthropicClient(responseText: string): object {
  return {
    messages: {
      create: async (_params: unknown) => ({
        content: [{ type: "text", text: responseText }],
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Mock response JSON — writer
// ---------------------------------------------------------------------------

/** Pre-canned writer response: ~520 words, passes all validation checks */
export const MOCK_WRITER_JSON = JSON.stringify({
  observation:
    "AutoFlow AI's pricing page charges $10,000–$25,000 in implementation fees " +
    "on top of its monthly subscription, and the company has six simultaneous " +
    "job postings for Implementation Specialists whose duties include manually " +
    "building sequences, configuring integrations, and training customers on-site. " +
    "A G2 reviewer wrote: 'The product is decent but honestly our onboarding " +
    "specialist did most of the heavy lifting.' A Capterra reviewer said the " +
    "real value was 'having experts configure everything' over the first two months. " +
    "This pattern — customer outcomes attributed to human specialists, not to AI — " +
    "appears consistently across reviews, a company-published case study describing " +
    "a 12-week consulting engagement, and a Glassdoor employee who described the " +
    "company as 'a consulting company that happens to have a software product.'",

  what_this_means:
    "AutoFlow is not a software business with an onboarding cost centre. " +
    "It is a consulting operation with a software interface, and the revenue " +
    "line is partly services-grade. When customers credit the human team rather " +
    "than the product for their outcomes, the competitive moat is in service " +
    "quality and implementation expertise — not in the AI models. " +
    "The commercial consequence is direct: customer retention depends on service " +
    "continuity, margin is constrained by headcount, and growth requires " +
    "proportional hiring of people rather than compute.",

  why_this_is_happening:
    "Two forces are reinforcing this structure. First, the product does not " +
    "deliver on its zero-touch automation claim without human configuration — " +
    "customers cannot progress through onboarding without specialist intervention, " +
    "which is why the pricing page monetises the specialist access separately. " +
    "Second, the company is scaling its services capacity faster than its product: " +
    "13 open services-oriented roles at a 110-person company represents roughly " +
    "12 percent headcount growth in the delivery layer alone. This is a structural " +
    "commitment, not an onboarding ramp.",

  what_we_would_change:
    "Stop positioning implementation as a cost to be minimised and reframe it " +
    "as the core product. The implementation team is already what customers are " +
    "buying — the pricing page already reflects this. Give it a named product line " +
    "with its own sales motion, renewal framework, and expansion pricing. " +
    "The automation software becomes the delivery platform for the consulting " +
    "service, not an autonomous product that sells itself. This shift unlocks " +
    "the margin improvement that cannot come from engineering headcount alone.",

  cta:
    "Reply with a 20-minute window this week — there is a specific repositioning " +
    "structure worth walking through before the next funding conversation.",
});

// ---------------------------------------------------------------------------
// Mock response JSON — critic
// ---------------------------------------------------------------------------

/** Pre-canned critic response: all 4 dimensions pass, genericity pass */
export const MOCK_CRITIC_JSON = JSON.stringify({
  evidence_grounding: {
    score: 4,
    notes:
      "All claims trace to specific evidence: G2 quote, pricing page fee, job postings, case study. " +
      "Minor generalisation on 'margin is constrained by headcount' (inferred, not cited directly).",
  },
  commercial_sharpness: {
    score: 4,
    notes:
      "Company-specific throughout — $10,000–$25,000 fee, 13 open roles, 110 headcount, " +
      "12-week consulting engagement. One generic sentence in what_we_would_change.",
  },
  cta_clarity: {
    score: 5,
    notes: "Single clear action, not a question. Tied to a specific conversation context.",
  },
  tone_compliance: {
    score: 5,
    notes:
      "Direct throughout. No jargon, no hedging, no feature-selling. Commercial advisor register maintained.",
  },
  genericity_test: {
    result: "pass",
    reasoning:
      "This memo cannot be sent unchanged to another company. The G2 quote, " +
      "$10,000-$25,000 implementation fee, 13 open services roles at 110 headcount, " +
      "and 12-week case study engagement are specific to AutoFlow AI and would " +
      "be factually wrong for any other company.",
  },
  founder_pushback_test: {
    most_vulnerable_claim:
      "The product does not deliver on its zero-touch automation claim without human configuration.",
    likely_objection:
      "Post-onboarding the platform operates autonomously for most customers — " +
      "the implementation fee is just for a smooth start.",
    severity: "medium",
  },
});

// ---------------------------------------------------------------------------
// Mock synthesis responses — fixture-specific
// ---------------------------------------------------------------------------

/**
 * Pre-canned synthesis responses keyed by fixture slug.
 * Evidence IDs must match what the fixture dossier's evidence pack will produce.
 * For unknown slugs, synthesis will fall back to template (mock client returns garbage).
 */
export const FIXTURE_SYNTH_MOCKS: Record<string, object> = {
  "001-ai-services": {
    company_specific_thesis:
      "AutoFlow AI's mandatory $10,000–$25,000 implementation fee (ev_007) and " +
      "13 simultaneous services-role openings at 110 headcount (ev_008) expose a " +
      "consulting business operating under an automation brand, meaning revenue " +
      "cannot scale at SaaS margins without proportional headcount growth.",
    mechanism_narratives: [
      {
        mechanism_id: "mech_001",
        mechanism_type: "investor_signalling",
        company_specific_narrative:
          "AutoFlow's homepage claims zero-touch AI automation (ev_001), but its " +
          "pricing page charges $10,000–$25,000 for mandatory implementation (ev_007), " +
          "creating a structural contradiction that reveals the actual delivery model " +
          "to any buyer who compares marketing copy to the pricing page.",
        evidence_refs: ["ev_001", "ev_007"],
      },
      {
        mechanism_id: "mech_002",
        mechanism_type: "category_gravity",
        company_specific_narrative:
          "Customers consistently credit the implementation team rather than the AI " +
          "for their outcomes (ev_003, ev_004), which means renewal and expansion " +
          "depend on service quality continuity — not on product stickiness or AI model improvement.",
        evidence_refs: ["ev_003", "ev_004"],
      },
    ],
    argument_skeleton: [
      {
        step_order: 1,
        evidence_id: "ev_003",
        logical_role: "observation",
        connector: "which reveals",
        purpose:
          "Establishes that customers credit human specialists, not the AI, for their outcomes.",
      },
      {
        step_order: 2,
        evidence_id: "ev_007",
        logical_role: "mechanism",
        connector: "because",
        purpose:
          "Shows pricing structure encodes service dependency as mandatory revenue — the automation claim is structurally contradicted.",
      },
      {
        step_order: 3,
        evidence_id: "ev_005",
        logical_role: "diagnosis",
        connector: "meaning",
        purpose:
          "Connects automation narrative gap to structural services bottleneck: scaling requires headcount, not compute.",
      },
      {
        step_order: 4,
        evidence_id: "ev_008",
        logical_role: "consequence",
        connector: "so",
        purpose:
          "Shows 13 open services roles at 110 headcount confirm the constraint is already embedded in hiring.",
      },
    ],
    hook_strategy: {
      evidence_id: "ev_003",
      tension_type: "customer_signal",
      framing:
        "Open with the customer's own words crediting the onboarding specialist, not the AI, for the outcome.",
      why_it_matters:
        "AutoFlow sells zero-touch AI automation; a customer publicly crediting their human implementation team " +
        "is a commercial strategy problem, not a UX issue — it signals the actual source of value delivery.",
    },
    evidence_refs: ["ev_001", "ev_003", "ev_004", "ev_005", "ev_007", "ev_008"],
    synthesis_confidence: "high",
    diagnosis_fit: "strong",
  },
};

// ---------------------------------------------------------------------------
// Config factories for mock mode
// ---------------------------------------------------------------------------

export function makeMockWriterConfig(): WriteMemoConfig {
  return {
    client: makeMockAnthropicClient(MOCK_WRITER_JSON) as unknown as import("@anthropic-ai/sdk").default,
  };
}

export function makeMockCriticConfig(): CriticConfig {
  return {
    client: makeMockAnthropicClient(MOCK_CRITIC_JSON) as unknown as import("@anthropic-ai/sdk").default,
  };
}

/** Returns undefined for unknown slugs — synthesis will fail validation and use fallback */
export function makeMockSynthConfig(slug: string): SynthesiseArgumentConfig | undefined {
  const mock = FIXTURE_SYNTH_MOCKS[slug];
  if (!mock) return undefined;
  return {
    client: makeMockAnthropicClient(JSON.stringify(mock)) as unknown as import("@anthropic-ai/sdk").default,
  };
}

// ---------------------------------------------------------------------------
// Core runner
// ---------------------------------------------------------------------------

export interface EvalConfig {
  slug: string;
  mode: "mock" | "live";
  outputPath?: string;
  /** Override fixture directory (for testing) */
  fixturesDir?: string;
}

export async function runComparison(config: EvalConfig): Promise<RunComparison> {
  const fixturesDir =
    config.fixturesDir ?? resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");

  // Load fixture dossier
  const dossierPath = resolve(fixturesDir, config.slug, "dossier.json");
  const dossierRaw = await readFile(dossierPath, "utf-8");
  const dossier: Dossier = JSON.parse(dossierRaw);

  const companyName =
    dossier.company_input?.resolved_company_name ??
    dossier.company_input?.company_name ??
    config.slug;
  const domain =
    dossier.company_input?.resolved_domain ??
    dossier.company_input?.primary_domain ??
    `${config.slug}.example.com`;

  // Resolve configs
  const writerConfig: WriteMemoConfig | undefined =
    config.mode === "mock" ? makeMockWriterConfig() : undefined;
  const criticConfig: CriticConfig | undefined =
    config.mode === "mock" ? makeMockCriticConfig() : undefined;
  const synthConfig: SynthesiseArgumentConfig | undefined =
    config.mode === "mock" ? makeMockSynthConfig(config.slug) : undefined;

  // Run V3
  const v3 = await runV3Pipeline({
    company: companyName,
    domain,
    dossier,
    memoIntelligenceVersion: "v3",
    writerConfig,
    criticConfig,
    // No synthConfig for v3 — synthesis is skipped
  });

  // Run V4
  const v4 = await runV3Pipeline({
    company: companyName,
    domain,
    dossier,
    memoIntelligenceVersion: "v4",
    writerConfig,
    criticConfig,
    synthConfig,
  });

  const comparison = buildComparisonSummary(v3, v4);
  const timestamp = new Date().toISOString();

  return { slug: config.slug, timestamp, mode: config.mode, v3, v4, comparison };
}

// ---------------------------------------------------------------------------
// CLI output formatting
// ---------------------------------------------------------------------------

function fmt(label: string, value: unknown): string {
  const str =
    value === null ? "—" : value === undefined ? "—" : String(value);
  return `  ${label.padEnd(36)} ${str}`;
}

export function printComparisonTable(result: RunComparison): void {
  const c = result.comparison;
  console.log(`\n${"─".repeat(60)}`);
  console.log(`Fixture:  ${result.slug}`);
  console.log(`Mode:     ${result.mode}`);
  console.log(`Time:     ${result.timestamp}`);
  console.log(`${"─".repeat(60)}`);

  console.log("\nTHESIS");
  console.log(fmt("V3 (template):", c.v3_thesis.substring(0, 80) + (c.v3_thesis.length > 80 ? "…" : "")));
  console.log(fmt("V4:", c.v4_thesis.substring(0, 80) + (c.v4_thesis.length > 80 ? "…" : "")));
  console.log(fmt("V4 synthesis active:", c.v4_synthesis_active));
  console.log(fmt("V4 fallback to template:", c.v4_fallback_to_template));
  console.log(fmt("V4 synthesis confidence:", c.v4_synthesis_confidence));
  console.log(fmt("V4 diagnosis fit:", c.v4_diagnosis_fit));

  console.log("\nARGUMENT STRUCTURE");
  console.log(fmt("V4 mechanism count:", c.v4_mechanism_count));
  console.log(fmt("V4 skeleton length:", c.v4_argument_skeleton_length));
  console.log(fmt("V4 hook framing source:", c.v4_hook_framing_source));

  console.log("\nCRITIC");
  console.log(fmt("V3 genericity:", c.v3_genericity_result));
  console.log(fmt("V4 genericity:", c.v4_genericity_result));
  console.log(fmt("V3 commercial sharpness:", c.v3_commercial_sharpness));
  console.log(fmt("V4 commercial sharpness:", c.v4_commercial_sharpness));
  console.log(fmt("V3 overall pass:", c.v3_critic_overall_pass));
  console.log(fmt("V4 overall pass:", c.v4_critic_overall_pass));

  console.log("\nSEND GATE");
  console.log(fmt("V3 gate result:", c.v3_send_gate_result));
  console.log(fmt("V4 gate result:", c.v4_send_gate_result));
  console.log(fmt("V3 quality score:", c.v3_quality_score));
  console.log(fmt("V4 quality score:", c.v4_quality_score));

  console.log("\nMEMO");
  console.log(fmt("V3 word count:", c.v3_word_count));
  console.log(fmt("V4 word count:", c.v4_word_count));

  console.log("\nHEURISTICS (V4 synthesis only)");
  console.log(fmt("Thesis has proper noun:", c.v4_thesis_has_company_proper_noun));
  console.log(fmt("Thesis has consequence language:", c.v4_thesis_has_consequence_language));
  console.log(fmt("Mechanisms appear distinct:", c.v4_mechanisms_appear_distinct));
  console.log(fmt("Distinctness check passed:", c.v4_distinctness_check_passed));
  if (c.v4_distinctness_notes?.length) {
    console.log(fmt("Distinctness notes:", c.v4_distinctness_notes.join("; ")));
  }
  console.log(`${"─".repeat(60)}\n`);
}

// ---------------------------------------------------------------------------
// CLI entry — only runs when executed directly
// ---------------------------------------------------------------------------

const isMainModule =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  (() => {
    try {
      return process.argv[1] === fileURLToPath(import.meta.url);
    } catch {
      return false;
    }
  })();

if (isMainModule) {
  const args = process.argv.slice(2);
  const slug = args.find(a => !a.startsWith("--")) ?? "001-ai-services";
  const modeArg = args.find(a => a.startsWith("--mode="))?.split("=")[1];
  const mode: "mock" | "live" = modeArg === "live" ? "live" : "mock";
  const outputArg = args.find(a => a.startsWith("--output="))?.split("=")[1];

  const resultsDir = resolve(dirname(fileURLToPath(import.meta.url)), "results");
  const outputPath =
    outputArg ?? resolve(resultsDir, `compare-${slug}-${Date.now()}.json`);

  console.log(`\nV3 vs V4 Comparison — ${slug} (${mode} mode)`);

  runComparison({ slug, mode, outputPath })
    .then(async result => {
      printComparisonTable(result);

      await mkdir(resultsDir, { recursive: true });
      await writeFile(outputPath, JSON.stringify(result, null, 2), "utf-8");
      console.log(`Result written: ${outputPath}\n`);
    })
    .catch(err => {
      console.error("Comparison failed:", err);
      process.exit(1);
    });
}
