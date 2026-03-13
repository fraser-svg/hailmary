/**
 * Skill-layer section writer.
 *
 * Does NOT call any API. Instead provides two capabilities:
 *
 * A. Build a SkillWriterBundle — serialisable payload that Claude Code /
 *    the skill layer consumes to generate section prose externally.
 *
 * B. Accept pre-generated SkillSectionResponse[] and return a SectionWriter
 *    that serves those responses, allowing TypeScript to validate and
 *    assemble the final Report object.
 *
 * Workflow:
 *   1. Run deterministic pipeline through plan-report
 *   2. Call buildSkillBundle() to export the section-writing payload
 *   3. Claude Code writes each section from the bundle
 *   4. Call createSkillWriter(responses) to get a SectionWriter
 *   5. TypeScript validates and assembles the final report
 */

import type { ReportPlan } from '../pipeline/plan-report.js';
import type {
  SectionInputPack,
  SectionWriter,
  SkillSectionRequest,
  SkillSectionResponse,
  SkillWriterBundle,
  SkillStyleRules,
  SkillAnalyticalContext,
  SkillImplicationContext,
  SkillPatternContext,
  SkillTensionContext,
  SkillSignalContext,
} from './types.js';
import type { Hypothesis } from '../pipeline/generate-hypotheses.js';
import type { Implication } from '../pipeline/generate-implications.js';
import type { Pattern } from '../pipeline/detect-patterns.js';
import type { Tension } from '../pipeline/detect-tensions.js';
import type { Signal } from '../pipeline/extract-signals.js';

// ---------------------------------------------------------------------------
// Shared style rules
// ---------------------------------------------------------------------------

const BANNED_PHRASES = [
  'well positioned',
  'robust value proposition',
  'dynamic market landscape',
  'innovative solution',
  'leveraging synergies',
  'industry leading',
  'cutting edge',
  'best-in-class',
  'strong traction',
];

function buildStyleRules(): SkillStyleRules {
  return {
    language: 'British English spelling throughout',
    paragraph_length: '2 to 4 sentences per paragraph',
    tone: 'Forensic, precise, and calm. Avoid consulting fluff and dramatic rhetoric.',
    banned_phrases: BANNED_PHRASES,
    confidence_language: {
      high: 'The evidence strongly suggests',
      medium: 'There are signs that',
      low: 'This may indicate',
    },
    constraints: [
      'Do not introduce new hypotheses, implications, or evidence.',
      'Do not reinterpret evidence beyond what is provided.',
      'Do not perform new research or reasoning.',
      'Write only from the inputs provided.',
      'Follow the section plan precisely.',
      'Never use em dashes. Use commas, semicolons, or full stops instead.',
      'Do not invent arguments beyond the supplied analytical objects.',
    ],
  };
}

// ---------------------------------------------------------------------------
// Section instructions (mirrors prompt-builder.ts)
// ---------------------------------------------------------------------------

const SECTION_INSTRUCTIONS: Record<string, string> = {
  sec_01: `Write the Executive Overview section.
Summarise the core thesis and key findings for decision-makers.
Frame the report by referencing the most critical implications.
Keep this section concise and authoritative.`,

  sec_02: `Write the "What the Evidence Shows" section.
Present the observable signals and structural patterns.
Establish the factual foundation without interpretation.
Order signals by relevance. Group patterns after individual signals.`,

  sec_03: `Write the "Where the Tensions Are" section.
Describe the structural contradictions and misalignments found in the evidence.
Explain each tension clearly and concisely.
Order by severity, highest first.`,

  sec_04: `Write the "What May Really Be Happening" section.
Present the surviving hypotheses as plausible explanations for observed tensions.
Use confidence-appropriate language from the style_rules.confidence_language field.
Include supporting evidence points and residual uncertainty where available.`,

  sec_05: `Write the "Strategic Implications" section.
Translate the hypotheses into concrete strategic consequences for stakeholders.
Use conditional framing: "If X, then Y may..."
Include key questions where available.
Order by impact and urgency.`,

  sec_06: `Write the "What Remains Uncertain" section.
Acknowledge hypotheses that lack sufficient evidence for confident inclusion.
For each, describe what evidence would strengthen or refute it.
Frame everything with appropriate uncertainty language.`,
};

// ---------------------------------------------------------------------------
// Context serialisers
// ---------------------------------------------------------------------------

function toHypothesisContext(h: Hypothesis): SkillAnalyticalContext {
  return {
    hypothesis_id: h.hypothesis_id,
    title: h.title,
    statement: h.statement,
    confidence: h.confidence,
    status: h.status,
    strongest_support: h.strongest_support,
    residual_uncertainty: h.residual_uncertainty,
    missing_evidence: h.missing_evidence,
  };
}

function toImplicationContext(i: Implication): SkillImplicationContext {
  return {
    implication_id: i.implication_id,
    title: i.title,
    statement: i.statement,
    impact: i.impact,
    urgency: i.urgency,
    confidence: i.confidence,
    key_questions: i.key_questions,
  };
}

function toPatternContext(p: Pattern): SkillPatternContext {
  return {
    pattern_id: p.pattern_id,
    title: p.title,
    summary: p.summary,
    strategic_weight: p.strategic_weight,
  };
}

function toTensionContext(t: Tension): SkillTensionContext {
  return {
    tension_id: t.tension_id,
    title: t.title,
    statement: t.statement,
    severity: t.severity,
  };
}

function toSignalContext(s: Signal): SkillSignalContext {
  return {
    signal_id: s.signal_id,
    title: s.title,
    statement: s.statement,
    relevance: s.relevance,
    kind: s.kind,
  };
}

// ---------------------------------------------------------------------------
// Bundle builder (Path A: export for external generation)
// ---------------------------------------------------------------------------

/**
 * Build a SkillSectionRequest from a section input pack.
 */
export function buildSectionRequest(
  plan: ReportPlan,
  pack: SectionInputPack,
): SkillSectionRequest {
  const sectionId = pack.sectionPlan.section_id;
  return {
    section_id: sectionId,
    title: pack.sectionPlan.title,
    purpose: pack.sectionPlan.purpose,
    report_context: {
      core_thesis: plan.core_thesis,
      tone_style: plan.tone_profile.style,
      tone_directness: plan.tone_profile.directness,
      tone_skepticism: plan.tone_profile.skepticism,
    },
    relevant_hypotheses: pack.hypotheses.map(toHypothesisContext),
    relevant_implications: pack.implications.map(toImplicationContext),
    relevant_patterns: pack.patterns.map(toPatternContext),
    relevant_tensions: pack.tensions.map(toTensionContext),
    relevant_signals: pack.signals.map(toSignalContext),
    style_rules: buildStyleRules(),
    section_instructions: SECTION_INSTRUCTIONS[sectionId]
      ?? 'Write this section based on the provided inputs.',
  };
}

/**
 * Build the full SkillWriterBundle from a report plan and section input packs.
 * This is Path A: export the bundle so Claude Code can generate prose externally.
 */
export function buildSkillBundle(
  plan: ReportPlan,
  sectionPacks: SectionInputPack[],
): SkillWriterBundle {
  return {
    report_id: plan.report_id,
    company_id: plan.company_id,
    generated_at: new Date().toISOString(),
    sections: sectionPacks.map(pack => buildSectionRequest(plan, pack)),
    summary_request: {
      core_thesis: plan.core_thesis,
      key_findings: plan.key_findings,
      section_count: plan.section_plan.length,
      style_rules: buildStyleRules(),
    },
  };
}

// ---------------------------------------------------------------------------
// Response validation
// ---------------------------------------------------------------------------

/**
 * Validate that all requested sections have been fulfilled.
 * Returns an array of error messages (empty = valid).
 */
export function validateSkillResponses(
  bundle: SkillWriterBundle,
  responses: SkillSectionResponse[],
): string[] {
  const errors: string[] = [];
  const responseMap = new Map(responses.map(r => [r.section_id, r]));

  for (const req of bundle.sections) {
    const resp = responseMap.get(req.section_id);
    if (!resp) {
      errors.push(`Missing response for section ${req.section_id} ("${req.title}")`);
    } else if (resp.markdown.trim().length === 0) {
      errors.push(`Empty markdown for section ${req.section_id} ("${req.title}")`);
    }
  }

  // Check for unexpected sections
  const requestedIds = new Set(bundle.sections.map(s => s.section_id));
  for (const resp of responses) {
    if (!requestedIds.has(resp.section_id)) {
      errors.push(`Unexpected section response: ${resp.section_id}`);
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Skill writer (Path B: assemble from pre-generated responses)
// ---------------------------------------------------------------------------

/**
 * Create a SectionWriter that serves pre-generated skill responses.
 * The writer looks up the response by section_id and returns the markdown.
 * If no response exists for a section, it returns a placeholder error marker.
 */
export function createSkillWriter(
  responses: SkillSectionResponse[],
  summaryMarkdown?: string,
): SectionWriter {
  const responseMap = new Map(responses.map(r => [r.section_id, r.markdown]));

  return {
    async generateSection(
      sectionId: string,
      _plan: ReportPlan,
      _pack: SectionInputPack,
    ): Promise<string> {
      const markdown = responseMap.get(sectionId);
      if (markdown != null) {
        return markdown;
      }
      return `[SKILL ERROR: No response received for section ${sectionId}]`;
    },

    async generateSummary(_plan: ReportPlan): Promise<string> {
      if (summaryMarkdown != null) {
        return summaryMarkdown;
      }
      return '[SKILL ERROR: No summary response received]';
    },
  };
}

// ---------------------------------------------------------------------------
// Prompt helper (turns a SkillSectionRequest into prompt-ready text)
// ---------------------------------------------------------------------------

/**
 * Convert a SkillSectionRequest into a prompt string suitable for
 * Claude Code to use when generating section prose.
 */
export function sectionRequestToPrompt(req: SkillSectionRequest): string {
  const parts: string[] = [];

  parts.push(`You are writing a section of a strategic analysis report.`);
  parts.push('');
  parts.push(`Section title: "${req.title}"`);
  parts.push(`Section purpose: ${req.purpose}`);
  parts.push('');
  parts.push(req.section_instructions);
  parts.push('');
  parts.push(`Core thesis: ${req.report_context.core_thesis}`);
  parts.push(`Tone: ${req.report_context.tone_style}, directness=${req.report_context.tone_directness}, skepticism=${req.report_context.tone_skepticism}`);
  parts.push('');

  // Style rules
  parts.push(`Style rules:`);
  parts.push(`- ${req.style_rules.language}`);
  parts.push(`- ${req.style_rules.paragraph_length}`);
  parts.push(`- ${req.style_rules.tone}`);
  parts.push(`- Never use these phrases: ${req.style_rules.banned_phrases.join(', ')}`);
  parts.push('');

  // Confidence language
  parts.push(`Confidence language:`);
  parts.push(`- high: "${req.style_rules.confidence_language.high}"`);
  parts.push(`- medium: "${req.style_rules.confidence_language.medium}"`);
  parts.push(`- low: "${req.style_rules.confidence_language.low}"`);
  parts.push('');

  // Constraints
  parts.push(`Constraints:`);
  for (const c of req.style_rules.constraints) {
    parts.push(`- ${c}`);
  }
  parts.push('');

  // Analytical inputs
  parts.push('# Inputs');
  parts.push('');

  if (req.relevant_hypotheses.length > 0) {
    parts.push('## Hypotheses');
    for (const h of req.relevant_hypotheses) {
      parts.push(`- **${h.title}** (confidence: ${h.confidence}, status: ${h.status})`);
      parts.push(`  Statement: ${h.statement}`);
      if (h.strongest_support && h.strongest_support.length > 0) {
        parts.push(`  Strongest support: ${h.strongest_support.join('; ')}`);
      }
      if (h.residual_uncertainty) {
        parts.push(`  Residual uncertainty: ${h.residual_uncertainty}`);
      }
      if (h.missing_evidence && h.missing_evidence.length > 0) {
        parts.push(`  Missing evidence: ${h.missing_evidence.join('; ')}`);
      }
    }
    parts.push('');
  }

  if (req.relevant_implications.length > 0) {
    parts.push('## Implications');
    for (const i of req.relevant_implications) {
      parts.push(`- **${i.title}** (impact: ${i.impact}, urgency: ${i.urgency}, confidence: ${i.confidence})`);
      parts.push(`  Statement: ${i.statement}`);
      if (i.key_questions.length > 0) {
        parts.push(`  Key questions: ${i.key_questions.join('; ')}`);
      }
    }
    parts.push('');
  }

  if (req.relevant_patterns.length > 0) {
    parts.push('## Patterns');
    for (const p of req.relevant_patterns) {
      parts.push(`- **${p.title}** (weight: ${p.strategic_weight})`);
      parts.push(`  Summary: ${p.summary}`);
    }
    parts.push('');
  }

  if (req.relevant_tensions.length > 0) {
    parts.push('## Tensions');
    for (const t of req.relevant_tensions) {
      parts.push(`- **${t.title}** (severity: ${t.severity})`);
      parts.push(`  Statement: ${t.statement}`);
    }
    parts.push('');
  }

  if (req.relevant_signals.length > 0) {
    parts.push('## Signals');
    for (const s of req.relevant_signals) {
      parts.push(`- **${s.title}** (relevance: ${s.relevance}, kind: ${s.kind})`);
      parts.push(`  Statement: ${s.statement}`);
    }
    parts.push('');
  }

  parts.push('Write the section now. Output only the section body in markdown. Do not include the section heading.');

  return parts.join('\n');
}
