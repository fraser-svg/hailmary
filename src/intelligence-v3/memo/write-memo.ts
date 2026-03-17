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

const DEFAULT_MODEL = "claude-opus-4-6";
const DEFAULT_MAX_TOKENS = 2500;
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
  "the_pattern",
  "what_this_means",
  "why_this_happens",
  "what_this_changes",
  "next_step",
];

const SECTION_HEADINGS: Record<MemoSectionName, string> = {
  observation: "## Observation",
  the_pattern: "## The Pattern",
  what_this_means: "## What This Means",
  why_this_happens: "## Why This Happens",
  what_this_changes: "## What This Changes",
  next_step: "## Next Step",
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
  const bannedSample = brief.banned_phrases.slice(0, 25).join(", ");
  const caveats =
    brief.confidence_caveats.length > 0
      ? `\nDo not assert the following as established fact: ${brief.confidence_caveats.join("; ")}.`
      : "";

  // V4 system prompt additions — included when synthesis fields are active
  const synthActive =
    brief.synthesised_thesis !== undefined &&
    brief.mechanism_narratives !== undefined &&
    brief.argument_skeleton !== undefined;

  const v4Rules = synthActive
    ? `\n- The COMPANY-SPECIFIC DIAGNOSTIC STATEMENT names the GTM condition AND its commercial consequence. Use it as-is or paraphrase — do not generalise.\n- The CAUSAL MECHANISMS are company-specific. Render them; do not rewrite into generic descriptions.\n- The SUGGESTED ARGUMENT FLOW orders evidence into the strongest logical sequence. Follow unless a superior structure presents itself.\n- The HOOK STRATEGY tells you what tension to create. Honor the tension_type.`
    : "";

  const hedgingBan =
    brief.adjudication_mode === "full_confidence" || brief.adjudication_mode === "conditional"
      ? `\nHEDGING BAN: Do not use "likely", "may indicate", "could be", "might", "it is possible", "the evidence leaves this open". State findings with the confidence the evidence warrants.`
      : "";

  return `You are writing a Dean & Wiseman strategic diagnostic — a short document sent directly to a company founder. It must read like an internal strategy memo, not outreach or marketing.

PURPOSE: Demonstrate that someone has studied this company with unusual care and reached a specific, evidence-grounded conclusion about a narrative gap in its go-to-market. The founder's reaction must be: "How do these people understand our company this well?"

THE THREE EFFECTS — every memo must produce all three:
1. RECOGNITION: The founder instantly recognises the pattern. "That is exactly what's happening."
2. SURPRISE: The memo frames the issue in a way they have not articulated. "I've never seen it described like that."
3. CURIOSITY: The memo implies a solution without fully explaining it. "What do they mean by that intervention?"

VOICE:
- Internal strategy document tone. Restrained. Precise. Analytical.
- No hype, no flattery, no urgency, no marketing language.
- No first person ("we", "our", "us") anywhere except the final "next_step" section.
- Every sentence must contain company-specific information. If a sentence could appear in a memo about another company, cut it.
- Present causality as plain observation. Do not label structure ("Two forces...", "First: ... Second: ..."). The structure should be felt, not announced.
- This is research, not interpretation. Use specific signals ("Multiple reviews emphasise onboarding speed") not opinion ("Customers seem to value speed").

THE CORE INSIGHT — the Narrative Gap:
The memo revolves around the difference between how the company positions its product and how the market actually experiences it. The "the_pattern" section must make this gap explicit and unmistakable:
  Product experienced as X.
  Product positioned as Y.

HARD RULES:
1. Do not invent any facts. Every claim must come from the evidence in the brief.
2. Do not invent customers, pricing, competitors, or metrics not in the brief.
3. Do not use these banned phrases: ${bannedSample}.
4. Do not use internal labels ("diagnosis", "mechanism", "intervention", "evidence_spine") in the text.
5. Do not open with a compliment, question, or "I wanted to reach out" phrasing.
6. Do not name specific pricing, product tiers, or implementation costs.
7. "why_this_happens" must present exactly 2 causal forces — but do NOT label or number them. Weave into a single analytical narrative.
8. "what_this_changes" must reveal the strategic lever but NEVER fully explain the solution. Preserve curiosity. The founder should think: "What exactly do they mean?" — not "I understand the whole playbook."
9. "next_step" must not feel like a meeting request. It should feel like continuing the analysis.${caveats}${v4Rules}

EVIDENCE REQUIREMENT:
The memo must reference at least three concrete external signals from the brief. Signals should be specific fragments when possible: review excerpts, developer comments, community discussion, documentation signals, pricing structure, competitor positioning. If fewer than three signals appear, the memo is invalid.

THE_PATTERN RULE:
The "the_pattern" section must be expressed in no more than 4 sentences. It must clearly show: customers experience X, company positions Y. Example: "Customers describe the product as a speed tool. The company positions it as procurement infrastructure. That difference shifts evaluation from operators to procurement teams." This is the memo's moment of recognition. Do not overcomplicate it.

OPENING PARAGRAPH REQUIREMENT:
The "observation" section must contain: (1) a concrete signal about the company, (2) a signal about how the market perceives the product, and (3) a tension between the two. Without tension, the memo reads like research instead of strategy.

SOLUTION LEAKAGE BAN:
The "what_this_changes" section must describe the strategic lever only. Do NOT explain: how to implement it, messaging frameworks, GTM playbooks, or execution steps. Reveal the lever. Do not describe the playbook.

READABILITY RULE:
Each paragraph must contain at least one simple declarative sentence. Example: "The pattern is easy to miss." "The market describes the product differently than the company." Dense analytical paragraphs without plain statements lose authority.

${framingInstruction(brief.adjudication_mode)}
${hedgingBan}

WORD BUDGET: Target ${brief.word_budget.target_min}–${brief.word_budget.target_max} words total. Hard maximum: ${brief.word_budget.hard_max}.
Section targets: observation (100–150w), the_pattern (60–100w), what_this_means (120–180w), why_this_happens (120–180w), what_this_changes (80–120w), next_step (40–60w).

OUTPUT FORMAT: Return valid JSON only. No markdown code fences. No text outside the JSON object.
The JSON must have exactly these 6 keys (all required, none empty):
{
  "observation": "...",
  "the_pattern": "...",
  "what_this_means": "...",
  "why_this_happens": "...",
  "what_this_changes": "...",
  "next_step": "..."
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

  // V4 context blocks — built when synthesis fields are present in brief
  const synthActive =
    brief.synthesised_thesis !== undefined &&
    brief.mechanism_narratives !== undefined &&
    brief.argument_skeleton !== undefined &&
    brief.hook_strategy !== undefined;

  const hookStrategyBlock = synthActive
    ? `\nHOOK STRATEGY — understand the strategic intent before rendering:
  Evidence anchor: ${brief.hook_strategy!.evidence_id}
  Tension type: ${brief.hook_strategy!.tension_type}
  Framing instruction: ${brief.hook_strategy!.framing}
  Why this matters to the founder: ${brief.hook_strategy!.why_it_matters}`
    : "";

  const thesisBlock = synthActive
    ? `COMPANY-SPECIFIC DIAGNOSTIC STATEMENT — use this as the thesis:
  ${brief.synthesised_thesis!}
  (This names the specific GTM condition, anchored in an observable company fact,
   and its commercial consequence. Use it as the basis for "what_this_means".
   Do not generalise it.)`
    : `THESIS — the central commercial claim to argue:
${brief.thesis}`;

  const mechanismsBlock =
    synthActive && brief.mechanism_narratives!.length >= 2
      ? `\nCAUSAL MECHANISMS — use these company-specific narratives in "why_this_is_happening":
  Force 1 (${brief.mechanism_narratives![0].mechanism_type}): ${brief.mechanism_narratives![0].company_specific_narrative}
    Evidence: ${brief.mechanism_narratives![0].evidence_refs.join(", ")}
  Force 2 (${brief.mechanism_narratives![1].mechanism_type}): ${brief.mechanism_narratives![1].company_specific_narrative}
    Evidence: ${brief.mechanism_narratives![1].evidence_refs.join(", ")}`
      : "";

  const skeletonBlock =
    synthActive && brief.argument_skeleton!.length > 0
      ? `\nSUGGESTED ARGUMENT FLOW — structure the argument in this order (advisory):\n${
          brief.argument_skeleton!
            .map(
              s =>
                `  Step ${s.step_order} [${s.logical_role}]: Evidence ${s.evidence_id} — ${s.purpose}${s.connector ? ` (${s.connector})` : ""}`
            )
            .join("\n")
        }\n  (The step marked [diagnosis] connects observation and mechanisms into the thesis.)`
      : "";

  let prompt = `Write a 6-section Dean & Wiseman strategic diagnostic for the following company.

COMPANY: ${brief.target_company}
${founderLine}
OPENING HOOK — anchor the Observation section with this:
Excerpt: "${brief.hook.excerpt}"
Framing instruction: ${brief.hook.framing_instruction}
${hookStrategyBlock}

${thesisBlock}

NARRATIVE GAP — the "the_pattern" section must name this explicitly:
The evidence shows what the market experiences. The thesis names what the company claims or positions.
Make the gap unmistakable in 2-3 sentences. Format:
  "[Company]'s customers describe the product as [X]. The company positions it as [Y]."

EVIDENCE SPINE — the only facts you may use (do not invent beyond these):
${spineLines}
${mechanismsBlock}
${skeletonBlock}

INTERVENTION FRAMING — for the "what_this_changes" section:
${brief.intervention_framing}

CTA — use verbatim or paraphrase without changing the ask:
${brief.cta}

---
Write the 6 sections. Return JSON only.`;

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
    the_pattern: (obj["the_pattern"] as string).trim(),
    what_this_means: (obj["what_this_means"] as string).trim(),
    why_this_happens: (obj["why_this_happens"] as string).trim(),
    what_this_changes: (obj["what_this_changes"] as string).trim(),
    next_step: (obj["next_step"] as string).trim(),
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
  if (wordCount > 1100) {
    throw new Error(
      `ERR_MEMO_TOO_LONG: memo word count is ${wordCount} (hard max 1100)`
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
