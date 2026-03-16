/**
 * Synthesise Argument — V4-M2a
 * Spec: docs/specs/v4-001-memo-intelligence.md §4
 *
 * AI reasoning stage that constructs company-specific diagnostic argument
 * material from the evidence pack and V2 reasoning outputs. Runs before
 * buildMemoBrief() when memoIntelligenceVersion = "v4".
 *
 * Model: claude-sonnet-4-6
 * Max tokens: 1200
 * Temperature: 0.2
 *
 * Never throws — returns ArgumentSynthesis with fallback_to_template = true
 * on any error (LLM error, parse error, timeout, validation failure,
 * distinctness retry exhausted).
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Diagnosis } from "../../intelligence-v2/types/diagnosis.js";
import type { Mechanism } from "../../intelligence-v2/types/mechanism.js";
import type { EvidencePack, EvidencePackRecord } from "../types/evidence-pack.js";
import type {
  ArgumentSynthesis,
  MechanismNarrative,
  HookStrategy,
  ArgumentStep,
} from "../types/argument-synthesis.js";
import { slugify } from "../../utils/ids.js";
import { now } from "../../utils/timestamps.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 1200;
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_TIMEOUT_MS = 20000;

export interface SynthesiseArgumentConfig {
  model?: string;
  max_tokens?: number;
  temperature?: number;
  /** Milliseconds before aborting the LLM call → fallback_to_template = true */
  timeout_ms?: number;
  /** Inject Anthropic client in tests to avoid live API calls */
  client?: Anthropic;
}

export interface SynthesiseArgumentInput {
  company_id: string;
  /** Human-readable company name */
  company: string;
  diagnosis: Diagnosis;
  /** First 2 mechanisms used; extra entries are ignored */
  mechanisms: Mechanism[];
  evidencePack: EvidencePack;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

/** Select best hook from pack — same logic as buildMemoBrief */
function pickBestHook(pack: EvidencePack): EvidencePackRecord | undefined {
  if (pack.hook_candidates.length > 0) {
    return [...pack.hook_candidates].sort((a, b) => b.total_score - a.total_score)[0];
  }
  if (pack.records.length > 0) {
    return [...pack.records].sort((a, b) => b.total_score - a.total_score)[0];
  }
  return undefined;
}

/** Evidence type → hook type label for user prompt */
const EVIDENCE_TYPE_TO_HOOK_LABEL: Record<string, string> = {
  review_record: "customer_quote",
  testimonial_record: "customer_quote",
  customer_language_record: "customer_quote",
  pain_point_record: "customer_quote",
  outcome_record: "customer_quote",
  customer_value_record: "customer_quote",
  pricing_record: "pricing_signal",
  product_record: "product_gap",
  competitor_record: "competitive_signal",
  founding_record: "founder_statement",
  leadership_record: "founder_statement",
};

function hookTypeLabel(evidenceType: string): string {
  return EVIDENCE_TYPE_TO_HOOK_LABEL[evidenceType] ?? "metric_observation";
}

// ---------------------------------------------------------------------------
// Stop words for Check 3 word-overlap
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of",
  "with", "by", "from", "as", "is", "was", "are", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
  "may", "might", "this", "that", "these", "those", "it", "its", "they", "their",
  "them", "we", "us", "our", "you", "your", "he", "she", "his", "her", "not",
  "no", "so", "if", "then", "when", "where", "which", "who", "what", "how",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 0 && !STOP_WORDS.has(w));
}

function wordOverlapScore(text1: string, text2: string): number {
  const words1 = new Set(tokenize(text1));
  const words2 = new Set(tokenize(text2));
  if (words1.size === 0 && words2.size === 0) return 0;
  let intersection = 0;
  for (const w of words1) {
    if (words2.has(w)) intersection++;
  }
  const union = new Set([...words1, ...words2]).size;
  return union === 0 ? 0 : intersection / union;
}

function jaccardScore(refs1: string[], refs2: string[]): number {
  const set1 = new Set(refs1);
  const set2 = new Set(refs2);
  let intersection = 0;
  for (const id of set1) {
    if (set2.has(id)) intersection++;
  }
  const union = new Set([...refs1, ...refs2]).size;
  return union === 0 ? 0 : intersection / union;
}

/** Check 4: does narrative_2 appear to be a downstream consequence of mechanism_1? */
const CAUSAL_LINK_PATTERNS = [
  "as a result",
  "consequently,",
  "therefore,",
  "because of this",
  "this leads to",
  "this results in",
  "which causes",
  "resulting from this",
  "stemming from this",
  "due to this",
];

function isCausallyDependent(narrative2: string): boolean {
  const start = narrative2.slice(0, 150).toLowerCase();
  return CAUSAL_LINK_PATTERNS.some(p => start.includes(p));
}

function lowerConfidence(c: "high" | "medium" | "low"): "high" | "medium" | "low" {
  if (c === "high") return "medium";
  if (c === "medium") return "low";
  return "low";
}

// ---------------------------------------------------------------------------
// LLM client
// ---------------------------------------------------------------------------

function getClient(injected?: Anthropic): Anthropic {
  if (injected) return injected;
  const key = process.env["ANTHROPIC_API_KEY"];
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey: key });
}

async function callLLMWithTimeout(
  client: Anthropic,
  model: string,
  maxTokens: number,
  temperature: number,
  systemPrompt: string,
  userPrompt: string,
  timeoutMs: number
): Promise<string> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("TIMEOUT")), timeoutMs)
  );
  const apiPromise = client.messages
    .create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    })
    .then(msg => {
      const content = msg.content[0];
      if (!content || content.type !== "text") {
        throw new Error("LLM returned no text content");
      }
      return content.text;
    });
  return Promise.race([apiPromise, timeoutPromise]);
}

// ---------------------------------------------------------------------------
// System prompt (exported for testing)
// ---------------------------------------------------------------------------

export function buildSynthesisSystemPrompt(): string {
  return `You are a commercial argument constructor for GTM intelligence memos.

Your job is to synthesize company-specific diagnostic argument material from a structured evidence pack and V2 reasoning outputs. You are NOT writing the memo. You are constructing the logical skeleton the memo writer will use.

RULES:
1. Every claim must trace to a specific evidence_id from the pack. Cite evidence_ids inline: claim text (ev_003).
2. Do not invent metrics, quotes, customers, pricing, or facts not in the evidence. If evidence supports only a weaker claim, make the weaker claim.
3. Produce exactly 2 mechanism_narratives — one per mechanism provided. The two mechanisms must be materially distinct: different mechanism_type, different evidence base, different causal chain. Do not reframe the same force twice. Mechanism 2 must be an independent causal force — not a downstream consequence of Mechanism 1.
4. company_specific_thesis must contain THREE elements:
   (a) the company-specific GTM condition — what is structurally constrained or failing at THIS company (not the archetype)
   (b) the commercial consequence or commercial risk — what this costs in deals lost, growth ceiling, margin compression, or strategic optionality
   (c) at least one observable company fact anchoring the GTM condition — this must be a concrete, specific signal from the evidence pack, e.g. pricing structure, onboarding flow, hiring pattern, product architecture, customer quote, positioning claim, or product behavior. Do not anchor only in abstract GTM language.
   Do not describe the company. Diagnose it. These are not the same thing.
5. mechanism_narratives must explain WHY THIS COMPANY has this problem. Prefer contradictions, bottlenecks, and demand-conversion failures over vague structural abstractions. Use evidence. Be specific.
6. hook_strategy must identify the specific evidence record (evidence_id) that anchors the hook, the tension type, and explain why this specific observation matters to this founder — not a generic framing instruction. framing must be ≤ 30 words.
7. argument_skeleton orders 3–6 evidence records into a logical chain. Exactly one step must have logical_role = "diagnosis" — this step connects the observation and mechanisms into the thesis. This is required. Each step must include a one-sentence purpose explaining its logical role.
8. diagnosis_fit and diagnosis_tension_note reflect your honest assessment of how well the evidence supports the selected diagnosis rhetorically. These do not change the diagnosis. They are diagnostics only.

HALLUCINATION CONTROLS:
- If you cannot ground a claim in a specific evidence_id, omit it.
- If evidence is insufficient to support a company-specific claim, make the weaker version or mark synthesis_confidence as "low".
- Never write a mechanism_narrative longer than 2 sentences (60 words max).
- company_specific_thesis max 70 words, min 20 words.
- Every evidence_id you cite must appear in the pack provided.
- Do not use the diagnosis archetype name in the company_specific_thesis. Name the company's actual condition.
- hook_strategy.framing must be ≤ 30 words.

OUTPUT FORMAT: Return valid JSON only. No markdown code fences. No text outside the JSON object.
{
  "company_specific_thesis": "...",
  "mechanism_narratives": [
    {
      "mechanism_id": "mech_XXX",
      "mechanism_type": "...",
      "company_specific_narrative": "... (ev_XXX)",
      "evidence_refs": ["ev_XXX"]
    },
    {
      "mechanism_id": "mech_YYY",
      "mechanism_type": "...",
      "company_specific_narrative": "... (ev_YYY)",
      "evidence_refs": ["ev_YYY"]
    }
  ],
  "argument_skeleton": [
    {
      "step_order": 1,
      "evidence_id": "ev_XXX",
      "logical_role": "observation",
      "connector": "which means",
      "purpose": "..."
    }
  ],
  "hook_strategy": {
    "evidence_id": "ev_XXX",
    "tension_type": "contradiction",
    "framing": "...",
    "why_it_matters": "..."
  },
  "evidence_refs": ["ev_XXX"],
  "synthesis_confidence": "high",
  "diagnosis_fit": "strong",
  "diagnosis_tension_note": ""
}`;
}

// ---------------------------------------------------------------------------
// User prompt (exported for testing)
// ---------------------------------------------------------------------------

export function buildSynthesisUserPrompt(
  input: SynthesiseArgumentInput
): string {
  const { company, diagnosis, mechanisms, evidencePack } = input;
  const mech1 = mechanisms[0];
  const mech2 = mechanisms[1];

  const bestHook = pickBestHook(evidencePack);
  const hookSection = bestHook
    ? `OPENING HOOK (grounds the opening observation):
  Evidence ID: ${bestHook.evidence_id}
  Excerpt: "${bestHook.excerpt.slice(0, 200)}"
  Hook type: ${hookTypeLabel(bestHook.evidence_type)}`
    : `OPENING HOOK: No hook candidate available — select the most striking evidence from the pack.`;

  // Evidence pack — sorted by total_score desc, max 20 records
  const sortedRecords = [...evidencePack.records]
    .sort((a, b) => b.total_score - a.total_score)
    .slice(0, 20);

  const evidenceLines = sortedRecords
    .map(
      r =>
        `  ${r.evidence_id} (Tier ${r.source_tier}, ${r.evidence_type}, score=${r.total_score}):\n    "${r.excerpt.slice(0, 250)}"\n    Roles: ${r.memo_roles.join(", ")}`
    )
    .join("\n");

  return `Construct a company-specific diagnostic argument for ${company}.

DIAGNOSIS:
  Type: ${diagnosis.type}
  Statement: ${diagnosis.statement}
  Confidence: ${diagnosis.confidence}
  Evidence refs: ${diagnosis.evidence_refs.join(", ")}

MECHANISMS (synthesise exactly 2 company-specific narratives):
  [1] ID: ${mech1.id}
      Type: ${mech1.type}
      Template statement: ${mech1.statement}
      Evidence refs: ${mech1.evidence_refs.join(", ")}

  [2] ID: ${mech2.id}
      Type: ${mech2.type}
      Template statement: ${mech2.statement}
      Evidence refs: ${mech2.evidence_refs.join(", ")}

${hookSection}

EVIDENCE PACK (all facts you may use — cite by evidence_id):
${evidenceLines}

---
Synthesise a company-specific argument. Return JSON only.`;
}

// ---------------------------------------------------------------------------
// Retry prompt (exported for testing)
// ---------------------------------------------------------------------------

export function buildRetryPrompt(
  failReason: string,
  mech1: MechanismNarrative
): string {
  return `Your two mechanism_narratives are too similar: ${failReason}. Mechanism 2 must describe a materially different causal force from Mechanism 1. Mechanism 1 (keep unchanged): type="${mech1.mechanism_type}", refs=${mech1.evidence_refs.join(",")}. Provide ONLY a new Mechanism 2 with a different mechanism_type and different evidence base. Return JSON only:
{
  "mechanism_id": "...",
  "mechanism_type": "...",
  "company_specific_narrative": "... (ev_XXX)",
  "evidence_refs": ["ev_XXX"]
}`;
}

// ---------------------------------------------------------------------------
// Raw LLM output shape (pre-validation)
// ---------------------------------------------------------------------------

interface RawSynthesis {
  company_specific_thesis: string;
  mechanism_narratives: unknown[];
  argument_skeleton: unknown[];
  hook_strategy: unknown;
  evidence_refs: unknown[];
  synthesis_confidence: unknown;
  diagnosis_fit: unknown;
  diagnosis_tension_note?: unknown;
}

// ---------------------------------------------------------------------------
// JSON parsing (exported for testing)
// ---------------------------------------------------------------------------

export function parseSynthesisResponse(text: string): RawSynthesis {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`PARSE_ERROR: not valid JSON — ${text.slice(0, 200)}`);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("PARSE_ERROR: response is not a JSON object");
  }

  const obj = parsed as Record<string, unknown>;
  const required = [
    "company_specific_thesis",
    "mechanism_narratives",
    "argument_skeleton",
    "hook_strategy",
    "evidence_refs",
    "synthesis_confidence",
    "diagnosis_fit",
  ] as const;

  for (const key of required) {
    if (!(key in obj)) {
      throw new Error(`PARSE_ERROR: missing required key "${key}"`);
    }
  }

  return {
    company_specific_thesis: String(obj["company_specific_thesis"] ?? ""),
    mechanism_narratives: Array.isArray(obj["mechanism_narratives"])
      ? (obj["mechanism_narratives"] as unknown[])
      : [],
    argument_skeleton: Array.isArray(obj["argument_skeleton"])
      ? (obj["argument_skeleton"] as unknown[])
      : [],
    hook_strategy: obj["hook_strategy"],
    evidence_refs: Array.isArray(obj["evidence_refs"])
      ? (obj["evidence_refs"] as unknown[])
      : [],
    synthesis_confidence: obj["synthesis_confidence"],
    diagnosis_fit: obj["diagnosis_fit"],
    diagnosis_tension_note:
      typeof obj["diagnosis_tension_note"] === "string"
        ? obj["diagnosis_tension_note"]
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// Mechanism parse/validate (also used for retry)
// ---------------------------------------------------------------------------

function parseMechanism(
  raw: unknown,
  packIds: Set<string>,
  index: number
): MechanismNarrative {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`VALIDATION_ERROR: mechanism_narratives[${index}] is not an object`);
  }
  const obj = raw as Record<string, unknown>;

  const mechanism_id = String(obj["mechanism_id"] ?? "").trim();
  const mechanism_type = String(obj["mechanism_type"] ?? "").trim();
  const company_specific_narrative = String(
    obj["company_specific_narrative"] ?? ""
  ).trim();
  const evidence_refs = Array.isArray(obj["evidence_refs"])
    ? (obj["evidence_refs"] as unknown[]).map(String)
    : [];

  if (!mechanism_id) {
    throw new Error(`VALIDATION_ERROR: mechanism_narratives[${index}].mechanism_id is empty`);
  }
  if (!mechanism_type) {
    throw new Error(`VALIDATION_ERROR: mechanism_narratives[${index}].mechanism_type is empty`);
  }
  if (!company_specific_narrative) {
    throw new Error(
      `VALIDATION_ERROR: mechanism_narratives[${index}].company_specific_narrative is empty`
    );
  }
  if (evidence_refs.length === 0) {
    throw new Error(
      `VALIDATION_ERROR: mechanism_narratives[${index}].evidence_refs is empty`
    );
  }
  for (const ref of evidence_refs) {
    if (!packIds.has(ref)) {
      throw new Error(
        `VALIDATION_ERROR: mechanism_narratives[${index}].evidence_refs contains unknown id "${ref}"`
      );
    }
  }

  return { mechanism_id, mechanism_type, company_specific_narrative, evidence_refs };
}

// ---------------------------------------------------------------------------
// Full validation (exported for testing)
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  errorMessage?: string;
  mechanisms?: [MechanismNarrative, MechanismNarrative];
  skeleton?: ArgumentStep[];
  hookStrategy?: HookStrategy;
  synthesisConfidence: "high" | "medium" | "low";
  diagnosisFit: "strong" | "adequate" | "strained";
  diagnosisTensionNote?: string;
  evidenceRefs: string[];
  thesis: string;
  softNotes: string[];
}

const VALID_TENSION_TYPES = new Set([
  "contradiction",
  "commercial_cost",
  "hidden_pattern",
  "customer_signal",
]);

const CONSEQUENCE_TOKENS = [
  "which means",
  "meaning",
  "costing",
  "limits",
  "prevents",
  "blocks",
  "constraining",
  "ceiling",
  "at risk",
  "fragility",
  "loss of",
];

const EVIDENCE_ID_PATTERN = /\bev_[a-z0-9_]+\b/i;

export function validateSynthesis(
  raw: RawSynthesis,
  packIds: Set<string>
): ValidationResult {
  const softNotes: string[] = [];

  // ── thesis ──────────────────────────────────────────────────────────────
  const thesis = (typeof raw.company_specific_thesis === "string"
    ? raw.company_specific_thesis
    : ""
  ).trim();
  const thesisWords = countWords(thesis);

  if (!thesis) {
    return { valid: false, errorMessage: "VALIDATION_ERROR: company_specific_thesis is empty", synthesisConfidence: "low", diagnosisFit: "strained", evidenceRefs: [], thesis: "", softNotes };
  }
  if (thesisWords < 20) {
    return { valid: false, errorMessage: `VALIDATION_ERROR: company_specific_thesis too short (${thesisWords} words, min 20)`, synthesisConfidence: "low", diagnosisFit: "strained", evidenceRefs: [], thesis, softNotes };
  }
  if (thesisWords > 70) {
    return { valid: false, errorMessage: `VALIDATION_ERROR: company_specific_thesis too long (${thesisWords} words, max 70)`, synthesisConfidence: "low", diagnosisFit: "strained", evidenceRefs: [], thesis, softNotes };
  }

  // ── initial confidence/fit ───────────────────────────────────────────────
  const validConfidences = new Set(["high", "medium", "low"]);
  const validFits = new Set(["strong", "adequate", "strained"]);

  let synthesisConfidence: "high" | "medium" | "low" = validConfidences.has(
    String(raw.synthesis_confidence)
  )
    ? (raw.synthesis_confidence as "high" | "medium" | "low")
    : "medium";

  const diagnosisFit: "strong" | "adequate" | "strained" = validFits.has(
    String(raw.diagnosis_fit)
  )
    ? (raw.diagnosis_fit as "strong" | "adequate" | "strained")
    : "strained";

  const diagnosisTensionNote =
    raw.diagnosis_tension_note
      ? String(raw.diagnosis_tension_note).trim() || undefined
      : undefined;

  // ── soft thesis checks ───────────────────────────────────────────────────
  const thesisLower = thesis.toLowerCase();
  const hasConsequenceToken = CONSEQUENCE_TOKENS.some(t => thesisLower.includes(t));
  if (!hasConsequenceToken) {
    softNotes.push("thesis_missing_consequence_language");
    synthesisConfidence = lowerConfidence(synthesisConfidence);
  }

  const hasEvidenceRef =
    EVIDENCE_ID_PATTERN.test(thesis) ||
    // Fallback: look for proper noun patterns (capital letter word not at sentence start)
    /\s[A-Z][a-z]{2,}/.test(thesis);
  if (!hasEvidenceRef) {
    softNotes.push("thesis_missing_observable_fact_anchor");
    synthesisConfidence = lowerConfidence(synthesisConfidence);
  }

  // ── mechanism_narratives ─────────────────────────────────────────────────
  if (raw.mechanism_narratives.length !== 2) {
    return {
      valid: false,
      errorMessage: `VALIDATION_ERROR: mechanism_narratives must have exactly 2 items, got ${raw.mechanism_narratives.length}`,
      synthesisConfidence,
      diagnosisFit,
      evidenceRefs: [],
      thesis,
      softNotes,
    };
  }

  let mech1: MechanismNarrative;
  let mech2: MechanismNarrative;
  try {
    mech1 = parseMechanism(raw.mechanism_narratives[0], packIds, 0);
    mech2 = parseMechanism(raw.mechanism_narratives[1], packIds, 1);
  } catch (err) {
    return {
      valid: false,
      errorMessage: String(err instanceof Error ? err.message : err),
      synthesisConfidence,
      diagnosisFit,
      evidenceRefs: [],
      thesis,
      softNotes,
    };
  }

  // ── argument_skeleton ────────────────────────────────────────────────────
  if (
    !Array.isArray(raw.argument_skeleton) ||
    raw.argument_skeleton.length < 3 ||
    raw.argument_skeleton.length > 6
  ) {
    return {
      valid: false,
      errorMessage: `VALIDATION_ERROR: argument_skeleton must have 3–6 steps, got ${raw.argument_skeleton?.length ?? 0}`,
      synthesisConfidence,
      diagnosisFit,
      evidenceRefs: [],
      thesis,
      softNotes,
    };
  }

  const VALID_ROLES = new Set([
    "observation",
    "mechanism",
    "consequence",
    "contrast",
    "diagnosis",
  ]);

  const skeleton: ArgumentStep[] = [];
  for (let i = 0; i < raw.argument_skeleton.length; i++) {
    const s = raw.argument_skeleton[i];
    if (typeof s !== "object" || s === null) {
      return { valid: false, errorMessage: `VALIDATION_ERROR: argument_skeleton[${i}] is not an object`, synthesisConfidence, diagnosisFit, evidenceRefs: [], thesis, softNotes };
    }
    const obj = s as Record<string, unknown>;
    const evidenceId = String(obj["evidence_id"] ?? "").trim();
    const logicalRole = String(obj["logical_role"] ?? "").trim();
    const purpose = String(obj["purpose"] ?? "").trim();
    const stepOrder =
      typeof obj["step_order"] === "number" ? obj["step_order"] : i + 1;
    const connector =
      typeof obj["connector"] === "string" ? obj["connector"].trim() : undefined;

    if (!evidenceId || !packIds.has(evidenceId)) {
      return { valid: false, errorMessage: `VALIDATION_ERROR: argument_skeleton[${i}].evidence_id "${evidenceId}" not in pack`, synthesisConfidence, diagnosisFit, evidenceRefs: [], thesis, softNotes };
    }
    if (!VALID_ROLES.has(logicalRole)) {
      return { valid: false, errorMessage: `VALIDATION_ERROR: argument_skeleton[${i}].logical_role "${logicalRole}" is invalid`, synthesisConfidence, diagnosisFit, evidenceRefs: [], thesis, softNotes };
    }
    if (!purpose) {
      return { valid: false, errorMessage: `VALIDATION_ERROR: argument_skeleton[${i}].purpose is empty`, synthesisConfidence, diagnosisFit, evidenceRefs: [], thesis, softNotes };
    }
    if (countWords(purpose) > 30) {
      return { valid: false, errorMessage: `VALIDATION_ERROR: argument_skeleton[${i}].purpose exceeds 30 words`, synthesisConfidence, diagnosisFit, evidenceRefs: [], thesis, softNotes };
    }

    skeleton.push({
      step_order: stepOrder,
      evidence_id: evidenceId,
      logical_role: logicalRole as ArgumentStep["logical_role"],
      connector: connector || undefined,
      purpose,
    });
  }

  // Must contain exactly one "diagnosis" step
  const diagnosisSteps = skeleton.filter(s => s.logical_role === "diagnosis");
  if (diagnosisSteps.length !== 1) {
    return {
      valid: false,
      errorMessage: `VALIDATION_ERROR: argument_skeleton must contain exactly one "diagnosis" step, found ${diagnosisSteps.length}`,
      synthesisConfidence,
      diagnosisFit,
      evidenceRefs: [],
      thesis,
      softNotes,
    };
  }

  // ── hook_strategy ────────────────────────────────────────────────────────
  if (typeof raw.hook_strategy !== "object" || raw.hook_strategy === null) {
    return { valid: false, errorMessage: "VALIDATION_ERROR: hook_strategy is not an object", synthesisConfidence, diagnosisFit, evidenceRefs: [], thesis, softNotes };
  }
  const hs = raw.hook_strategy as Record<string, unknown>;
  const hookEvidenceId = String(hs["evidence_id"] ?? "").trim();
  const tensionType = String(hs["tension_type"] ?? "").trim();
  const framing = String(hs["framing"] ?? "").trim();
  const whyItMatters = String(hs["why_it_matters"] ?? "").trim();

  if (!hookEvidenceId || !packIds.has(hookEvidenceId)) {
    return { valid: false, errorMessage: `VALIDATION_ERROR: hook_strategy.evidence_id "${hookEvidenceId}" not in pack`, synthesisConfidence, diagnosisFit, evidenceRefs: [], thesis, softNotes };
  }
  if (!VALID_TENSION_TYPES.has(tensionType)) {
    return { valid: false, errorMessage: `VALIDATION_ERROR: hook_strategy.tension_type "${tensionType}" is invalid`, synthesisConfidence, diagnosisFit, evidenceRefs: [], thesis, softNotes };
  }
  if (!framing) {
    return { valid: false, errorMessage: "VALIDATION_ERROR: hook_strategy.framing is empty", synthesisConfidence, diagnosisFit, evidenceRefs: [], thesis, softNotes };
  }
  if (countWords(framing) > 30) {
    return { valid: false, errorMessage: `VALIDATION_ERROR: hook_strategy.framing exceeds 30 words (${countWords(framing)})`, synthesisConfidence, diagnosisFit, evidenceRefs: [], thesis, softNotes };
  }
  if (!whyItMatters) {
    return { valid: false, errorMessage: "VALIDATION_ERROR: hook_strategy.why_it_matters is empty", synthesisConfidence, diagnosisFit, evidenceRefs: [], thesis, softNotes };
  }

  const hookStrategy: HookStrategy = {
    evidence_id: hookEvidenceId,
    tension_type: tensionType as HookStrategy["tension_type"],
    framing,
    why_it_matters: whyItMatters,
  };

  // ── evidence_refs ────────────────────────────────────────────────────────
  const evidenceRefs = Array.isArray(raw.evidence_refs)
    ? (raw.evidence_refs as unknown[]).map(String).filter(id => packIds.has(id))
    : [];

  return {
    valid: true,
    mechanisms: [mech1, mech2],
    skeleton,
    hookStrategy,
    synthesisConfidence,
    diagnosisFit,
    diagnosisTensionNote,
    evidenceRefs,
    thesis,
    softNotes,
  };
}

// ---------------------------------------------------------------------------
// Distinctness checks (exported for testing)
// ---------------------------------------------------------------------------

export interface DistinctnessResult {
  passed: boolean;
  /** Populated when Check 1 or 2 fails (hard failure → needs retry) */
  hardFailReason?: string;
  notes: string[];
  updatedConfidence: "high" | "medium" | "low";
}

export function runDistinctnessChecks(
  m1: MechanismNarrative,
  m2: MechanismNarrative,
  confidence: "high" | "medium" | "low"
): DistinctnessResult {
  const notes: string[] = [];
  let updatedConfidence = confidence;

  // Check 1 (hard): mechanism_type must differ
  if (m1.mechanism_type === m2.mechanism_type) {
    return {
      passed: false,
      hardFailReason: `mechanism_types are identical: "${m1.mechanism_type}"`,
      notes: ["mechanism_types identical"],
      updatedConfidence: lowerConfidence(updatedConfidence),
    };
  }

  // Check 2 (hard): Jaccard evidence overlap ≤ 0.60
  const jaccard = jaccardScore(m1.evidence_refs, m2.evidence_refs);
  if (jaccard > 0.6) {
    const jStr = jaccard.toFixed(2);
    return {
      passed: false,
      hardFailReason: `evidence_refs overlap too heavily (Jaccard: ${jStr})`,
      notes: [`evidence_overlap: ${jStr}`],
      updatedConfidence: lowerConfidence(updatedConfidence),
    };
  }

  // Check 3 (soft): word overlap ≤ 0.60
  const overlap = wordOverlapScore(
    m1.company_specific_narrative,
    m2.company_specific_narrative
  );
  if (overlap > 0.6) {
    notes.push(`word_overlap: ${overlap.toFixed(2)}`);
    updatedConfidence = lowerConfidence(updatedConfidence);
  }

  // Check 4 (soft): causal independence
  if (isCausallyDependent(m2.company_specific_narrative)) {
    notes.push("causal_dependence: mechanism_2 may be downstream of mechanism_1");
    updatedConfidence = lowerConfidence(updatedConfidence);
  }

  return { passed: true, notes, updatedConfidence };
}

// ---------------------------------------------------------------------------
// Fallback synthesis object
// ---------------------------------------------------------------------------

function makeFallback(
  input: SynthesiseArgumentInput,
  timestamp: number
): ArgumentSynthesis {
  return {
    synthesis_id: `syn_${input.company_id}_${timestamp}`,
    company_id: input.company_id,
    synthesised_at: now(),
    company_specific_thesis: "",
    mechanism_narratives: [],
    argument_skeleton: [],
    hook_strategy: {
      evidence_id: "",
      tension_type: "contradiction",
      framing: "",
      why_it_matters: "",
    },
    evidence_refs: [],
    synthesis_confidence: "low",
    diagnosis_fit: "strained",
    distinctness_check: { passed: false },
    fallback_to_template: true,
  };
}

// ---------------------------------------------------------------------------
// Main entry (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Synthesise a company-specific diagnostic argument.
 *
 * Runs as V4-M2a before buildMemoBrief() when memoIntelligenceVersion = "v4".
 * Never throws — returns with fallback_to_template = true on any failure.
 *
 * @param input  - Company, diagnosis, mechanisms, evidence pack
 * @param config - Optional model/client overrides; inject client in tests
 */
export async function synthesiseArgument(
  input: SynthesiseArgumentInput,
  config: SynthesiseArgumentConfig = {}
): Promise<ArgumentSynthesis> {
  const timestamp = Date.now();

  // Guard: need at least 2 mechanisms
  if (input.mechanisms.length < 2) {
    return makeFallback(input, timestamp);
  }

  const client = (() => {
    try {
      return getClient(config.client);
    } catch {
      return null;
    }
  })();

  if (!client) {
    return makeFallback(input, timestamp);
  }

  const model = config.model ?? DEFAULT_MODEL;
  const maxTokens = config.max_tokens ?? DEFAULT_MAX_TOKENS;
  const temperature = config.temperature ?? DEFAULT_TEMPERATURE;
  const timeoutMs = config.timeout_ms ?? DEFAULT_TIMEOUT_MS;

  const packIds = new Set(input.evidencePack.records.map(r => r.evidence_id));
  const systemPrompt = buildSynthesisSystemPrompt();
  const userPrompt = buildSynthesisUserPrompt(input);

  // ── Attempt 1 ─────────────────────────────────────────────────────────────
  let raw1: RawSynthesis;
  try {
    const text = await callLLMWithTimeout(
      client, model, maxTokens, temperature, systemPrompt, userPrompt, timeoutMs
    );
    raw1 = parseSynthesisResponse(text);
  } catch {
    return makeFallback(input, timestamp);
  }

  const val1 = validateSynthesis(raw1, packIds);
  if (!val1.valid || !val1.mechanisms || !val1.skeleton || !val1.hookStrategy) {
    return makeFallback(input, timestamp);
  }

  let [mech1, mech2] = val1.mechanisms;
  let synthesisConfidence = val1.synthesisConfidence;
  let distinctNotes: string[] = val1.softNotes;

  // ── Distinctness checks ───────────────────────────────────────────────────
  let distinct = runDistinctnessChecks(mech1, mech2, synthesisConfidence);
  synthesisConfidence = distinct.updatedConfidence;
  distinctNotes = [...distinctNotes, ...distinct.notes];

  if (!distinct.passed && distinct.hardFailReason) {
    // ── Attempt 2 (retry for mechanism_2 only) ──────────────────────────────
    const retryPrompt = buildRetryPrompt(distinct.hardFailReason, mech1);
    let retryText: string;
    try {
      retryText = await callLLMWithTimeout(
        client, model, maxTokens, temperature, systemPrompt, retryPrompt, timeoutMs
      );
    } catch {
      return makeFallback(input, timestamp);
    }

    // Parse just the mechanism_2 from retry response
    let newMech2: MechanismNarrative;
    try {
      const cleaned = retryText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;
      // Support both array wrapper and single object
      const rawMech = Array.isArray(parsed) ? parsed[1] : parsed;
      newMech2 = parseMechanism(rawMech, packIds, 1);
    } catch {
      return makeFallback(input, timestamp);
    }

    mech2 = newMech2;
    distinct = runDistinctnessChecks(mech1, mech2, synthesisConfidence);
    synthesisConfidence = distinct.updatedConfidence;
    distinctNotes = [...val1.softNotes, ...distinct.notes];

    if (!distinct.passed) {
      // Second attempt also failed — fallback
      return {
        ...makeFallback(input, timestamp),
        distinctness_check: {
          passed: false,
          notes: distinctNotes.length > 0 ? distinctNotes : undefined,
        },
      };
    }
  }

  // ── Assemble final synthesis ──────────────────────────────────────────────
  return {
    synthesis_id: `syn_${input.company_id}_${timestamp}`,
    company_id: input.company_id,
    synthesised_at: now(),
    company_specific_thesis: val1.thesis,
    mechanism_narratives: [mech1, mech2],
    argument_skeleton: val1.skeleton,
    hook_strategy: val1.hookStrategy,
    evidence_refs: val1.evidenceRefs,
    synthesis_confidence: synthesisConfidence,
    diagnosis_fit: val1.diagnosisFit,
    diagnosis_tension_note: val1.diagnosisTensionNote,
    distinctness_check: {
      passed: true,
      notes: distinctNotes.length > 0 ? distinctNotes : undefined,
    },
    fallback_to_template: false,
  };
}
