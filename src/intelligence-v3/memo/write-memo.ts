/**
 * Write Memo — V3-M4
 * Spec: docs/specs/intelligence-engine-v3/005_memo_spec.md (Sub-Stage B)
 *
 * Generates the founder-facing strategic memo from the MemoBrief.
 * LLM stage — the writer is a renderer, not a reasoner.
 * All reasoning has been done upstream; the LLM renders it into prose.
 *
 * Model: claude-haiku-4-5-20251001
 * Max tokens: 1500
 * Temperature: 0.3
 *
 * Required sections (in order):
 *   1. observation         — specific hook + commercial signal
 *   2. what_this_means     — structural diagnosis + commercial consequence
 *   3. why_this_is_happening — exactly 2 causal forces
 *   4. what_we_would_change — intervention framed as value delivery
 *   5. cta                 — exactly one clear ask (not a question)
 *
 * Errors:
 *   ERR_ADJUDICATION_ABORT  — adjudication_mode is "abort"
 *   ERR_MEMO_PARSE          — LLM response is not valid JSON or missing sections
 *   ERR_MEMO_MISSING_SECTIONS — one or more required sections absent
 *   ERR_MEMO_TOO_LONG       — word_count > 850
 *   ERR_MEMO_TOO_SHORT      — word_count < 300
 *   ERR_MEMO_EVIDENCE_EMPTY — evidence_ids is empty
 *   ERR_BANNED_PHRASE       — banned phrase detected in output
 */

import Anthropic from "@anthropic-ai/sdk";
import type { MemoBrief, MemoSectionName } from "../types/memo-brief.js";
import type { MarkdownMemo, MemoSection } from "../types/memo.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_TOKENS = 1500;
const DEFAULT_TEMPERATURE = 0.3;

export interface WriteMemoConfig {
  model?: string;
  max_tokens?: number;
  temperature?: number;
  /** Injected Anthropic client — used in tests to avoid live API calls */
  client?: Anthropic;
}

// ---------------------------------------------------------------------------
// Section ordering and headings
// ---------------------------------------------------------------------------

const SECTION_ORDER: MemoSectionName[] = [
  "observation",
  "what_this_means",
  "why_this_is_happening",
  "what_we_would_change",
  "cta",
];

const SECTION_HEADINGS: Record<MemoSectionName, string> = {
  observation: "## Observation",
  what_this_means: "## What this means",
  why_this_is_happening: "## Why this is happening",
  what_we_would_change: "## What we would change",
  cta: "## Next step",
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

function findBannedPhrase(text: string, bannedPhrases: string[]): string | null {
  const lower = text.toLowerCase();
  for (const phrase of bannedPhrases) {
    if (lower.includes(phrase.toLowerCase())) {
      return phrase;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Framing instruction by adjudication_mode
// ---------------------------------------------------------------------------

function framingInstruction(mode: string): string {
  switch (mode) {
    case "full_confidence":
      return "State the diagnosis directly as established fact. Do not hedge. The evidence is strong.";
    case "conditional":
      return "State the diagnosis with confidence, but qualify briefly where evidence is inferred. Be direct where evidence is strong.";
    case "exploratory":
      return "Frame the diagnosis as a hypothesis. Use language like 'the evidence suggests', 'this may indicate', or 'there are signs that'. Do not state anything as established fact.";
    default:
      return "State the diagnosis with care appropriate to the evidence available.";
  }
}

// ---------------------------------------------------------------------------
// System prompt (exported for testing)
// ---------------------------------------------------------------------------

export function buildSystemPrompt(brief: MemoBrief): string {
  // Pass first 20 banned phrases to avoid token bloat; the validation layer
  // catches any that slip through regardless.
  const bannedSample = brief.banned_phrases.slice(0, 20).join(", ");
  const caveats =
    brief.confidence_caveats.length > 0
      ? `\n10. Do not assert the following as established fact: ${brief.confidence_caveats.join("; ")}.`
      : "";

  return `You are a commercial writing specialist producing a founder-facing strategic memo. You are a renderer, not a reasoner — all analysis has been completed upstream. Your job is to render the supplied brief into specific, commercially grounded prose.

HARD RULES — violating any of these makes the output unusable:
1. Do not invent any facts. Every claim must come from the evidence items in the brief.
2. Do not invent customers, pricing, competitors, or metrics not present in the brief.
3. Do not use these banned phrases (partial list): ${bannedSample}.
4. Do not use internal analytical labels such as "diagnosis", "mechanism", "intervention", "evidence_spine", "hook_type", or similar taxonomy language in the memo text.
5. Do not open with a compliment, question, or "I wanted to reach out" type phrasing.
6. Do not name specific pricing, product tiers, or implementation costs.
7. Every section must contain company-specific facts — not generic advice that applies to any SaaS company.
8. Name exactly 2 causal forces in the "why_this_is_happening" section — not 1, not 3.
9. The CTA must not be a question and must contain exactly one action for the founder to take.${caveats}

TONE FRAMING: ${framingInstruction(brief.adjudication_mode)}

WORD BUDGET: Target ${brief.word_budget.target_min}–${brief.word_budget.target_max} words total. Hard maximum: ${brief.word_budget.hard_max} words. Do not exceed the hard maximum.

OUTPUT FORMAT: Return valid JSON only. No markdown code fences. No text outside the JSON object.
The JSON must have exactly these 5 keys (all required, none empty):
{
  "observation": "...",
  "what_this_means": "...",
  "why_this_is_happening": "...",
  "what_we_would_change": "...",
  "cta": "..."
}
Each value is the full prose for that section (plain text, use \\n\\n for paragraph breaks within a section).`;
}

// ---------------------------------------------------------------------------
// User prompt (exported for testing)
// ---------------------------------------------------------------------------

export function buildUserPrompt(brief: MemoBrief): string {
  const founderLine = brief.founder_name
    ? `Founder: ${brief.founder_name}${brief.founder_title ? `, ${brief.founder_title}` : ""}\n`
    : "";

  const spineLines = brief.evidence_spine
    .map((r, i) => `  [${i + 1}] "${r.excerpt}"\n      Section guidance: ${r.usage_instruction}`)
    .join("\n");

  let prompt = `Write a 5-section strategic memo for the following company.

COMPANY: ${brief.target_company}
${founderLine}
OPENING HOOK — anchor the Observation section with this:
Excerpt: "${brief.hook.excerpt}"
Framing instruction: ${brief.hook.framing_instruction}

THESIS — the central commercial claim to argue:
${brief.thesis}

EVIDENCE SPINE — the only facts you may use (do not invent beyond these):
${spineLines}

INTERVENTION FRAMING — for the "what_we_would_change" section:
${brief.intervention_framing}

CTA — use verbatim or paraphrase without changing the ask:
${brief.cta}

---
Write the 5 sections. Return JSON only.`;

  if (brief.revision_instructions) {
    const rev = brief.revision_instructions;
    const issues = rev.specific_issues.map(i => `- ${i}`).join("\n");
    prompt += `\n\nREVISION REQUIRED — Attempt ${rev.attempt_number + 1}. Your previous memo failed quality review. Fix these specific issues:\n${issues}\n\nFounder pushback to address: ${rev.founder_pushback_context}`;
  }

  return prompt;
}

// ---------------------------------------------------------------------------
// LLM client
// ---------------------------------------------------------------------------

function getClient(injected?: Anthropic): Anthropic {
  if (injected) return injected;
  const key = process.env["ANTHROPIC_API_KEY"];
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY is not set — cannot write memo");
  }
  return new Anthropic({ apiKey: key });
}

// ---------------------------------------------------------------------------
// Response parsing (exported for testing)
// ---------------------------------------------------------------------------

type RawSections = Record<MemoSectionName, string>;

export function parseResponse(text: string): RawSections {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `ERR_MEMO_PARSE: LLM response was not valid JSON.\n\nResponse received:\n${text.slice(0, 500)}`
    );
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("ERR_MEMO_PARSE: LLM response is not a JSON object");
  }

  const obj = parsed as Record<string, unknown>;
  const missing = SECTION_ORDER.filter(
    s => typeof obj[s] !== "string" || (obj[s] as string).trim().length === 0
  );
  if (missing.length > 0) {
    throw new Error(
      `ERR_MEMO_MISSING_SECTIONS: LLM response is missing required sections: ${missing.join(", ")}`
    );
  }

  return {
    observation: (obj["observation"] as string).trim(),
    what_this_means: (obj["what_this_means"] as string).trim(),
    why_this_is_happening: (obj["why_this_is_happening"] as string).trim(),
    what_we_would_change: (obj["what_we_would_change"] as string).trim(),
    cta: (obj["cta"] as string).trim(),
  };
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

function assembleSections(raw: RawSections): MemoSection[] {
  return SECTION_ORDER.map(name => ({
    name,
    markdown: raw[name],
    word_count: countWords(raw[name]),
  }));
}

function assembleMarkdown(sections: MemoSection[]): string {
  return sections
    .map(s => `${SECTION_HEADINGS[s.name]}\n\n${s.markdown}`)
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateMemo(
  wordCount: number,
  evidenceIds: string[],
  markdown: string,
  bannedPhrases: string[]
): void {
  if (wordCount < 300) {
    throw new Error(
      `ERR_MEMO_TOO_SHORT: memo word count is ${wordCount} (minimum 300)`
    );
  }
  if (wordCount > 850) {
    throw new Error(
      `ERR_MEMO_TOO_LONG: memo word count is ${wordCount} (hard max 850)`
    );
  }
  if (evidenceIds.length === 0) {
    throw new Error("ERR_MEMO_EVIDENCE_EMPTY: evidence_ids is empty");
  }
  const hit = findBannedPhrase(markdown, bannedPhrases);
  if (hit) {
    throw new Error(`ERR_BANNED_PHRASE: banned phrase detected in memo: "${hit}"`);
  }
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * Generate the founder-facing strategic memo from the brief.
 *
 * LLM stage — the writer is a renderer, not a reasoner.
 *
 * @param brief      - MemoBrief produced by buildMemoBrief()
 * @param attemptNumber - 1 (first attempt) or 2 (revision after critic)
 * @param config     - Optional model/client overrides; inject client in tests
 *
 * Throws:
 *   ERR_ADJUDICATION_ABORT    — brief.adjudication_mode === "abort"
 *   ERR_MEMO_PARSE            — LLM response is not parseable JSON
 *   ERR_MEMO_MISSING_SECTIONS — one or more required sections absent
 *   ERR_MEMO_TOO_LONG         — word_count > 850
 *   ERR_MEMO_TOO_SHORT        — word_count < 300
 *   ERR_MEMO_EVIDENCE_EMPTY   — evidence_ids is empty
 *   ERR_BANNED_PHRASE         — banned phrase detected in output
 */
export async function writeMemo(
  brief: MemoBrief,
  attemptNumber: 1 | 2 = 1,
  config: WriteMemoConfig = {}
): Promise<MarkdownMemo> {
  if (brief.adjudication_mode === "abort") {
    throw new Error(
      `ERR_ADJUDICATION_ABORT: cannot write memo for company '${brief.company_id}' — adjudication mode is 'abort'`
    );
  }

  const client = getClient(config.client);
  const model = config.model ?? DEFAULT_MODEL;
  const maxTokens = config.max_tokens ?? DEFAULT_MAX_TOKENS;
  const temperature = config.temperature ?? DEFAULT_TEMPERATURE;

  const systemPrompt = buildSystemPrompt(brief);
  const userPrompt = buildUserPrompt(brief);

  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const content = message.content[0];
  if (!content || content.type !== "text") {
    throw new Error("ERR_MEMO_PARSE: LLM returned no text content");
  }

  const raw = parseResponse(content.text);
  const sections = assembleSections(raw);
  const markdown = assembleMarkdown(sections);
  const wordCount = countWords(markdown);

  // evidence_ids are populated from the brief's evidence_spine (deterministic — not from LLM)
  const evidenceIds = brief.evidence_spine.map(r => r.evidence_id);

  validateMemo(wordCount, evidenceIds, markdown, brief.banned_phrases);

  const timestamp = Date.now();
  return {
    memo_id: `memo_${brief.company_id}_${timestamp}`,
    company_id: brief.company_id,
    brief_id: brief.brief_id,
    adjudication_mode: brief.adjudication_mode,
    diagnosis_id: brief.diagnosis_id,
    intervention_id: brief.intervention_id,
    evidence_ids: evidenceIds,
    word_count: wordCount,
    attempt_number: attemptNumber,
    sections,
    markdown,
    generated_at: new Date().toISOString(),
  };
}
