/**
 * Prompt builder for LLM-backed section writing.
 *
 * Constructs structured prompts that pass only the relevant analytical objects
 * to the LLM for each section. The LLM must follow the report plan and style
 * rules without inventing new reasoning.
 */

import type { ReportPlan } from '../pipeline/plan-report.js';
import type { SectionInputPack } from './types.js';

// ---------------------------------------------------------------------------
// Style rules (enforced via prompt instructions)
// ---------------------------------------------------------------------------

const STYLE_RULES = `Style rules (you must follow these exactly):
- Use British English spelling throughout.
- Never use em dashes. Use commas, semicolons, or full stops instead.
- Each paragraph must contain 2 to 4 sentences.
- Use a calm, forensic tone. Avoid dramatic rhetoric or exaggerated claims.
- Avoid marketing or consulting language.
- Never use these phrases: "well positioned", "robust value proposition", "dynamic market landscape", "innovative solution", "leveraging synergies", "industry leading", "cutting edge", "best-in-class", "strong traction".`;

const CONSTRAINT_RULES = `Constraints (do not violate these):
- Do not introduce new hypotheses, implications, or evidence.
- Do not reinterpret evidence beyond what is provided.
- Do not perform new research or reasoning.
- Write only from the inputs provided below.
- Follow the section plan precisely.`;

// ---------------------------------------------------------------------------
// Section-specific instructions
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
Use confidence-appropriate language: "The evidence strongly suggests" for high confidence, "There are signs that" for medium, "This may indicate" for low.
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
// Input serialisation
// ---------------------------------------------------------------------------

function serialiseInputs(pack: SectionInputPack): string {
  const parts: string[] = [];

  if (pack.hypotheses.length > 0) {
    parts.push('## Hypotheses');
    for (const h of pack.hypotheses) {
      parts.push(`- **${h.title}** (confidence: ${h.confidence}, severity: ${h.severity}, status: ${h.status})`);
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

  if (pack.implications.length > 0) {
    parts.push('## Implications');
    for (const i of pack.implications) {
      parts.push(`- **${i.title}** (impact: ${i.impact}, urgency: ${i.urgency}, confidence: ${i.confidence})`);
      parts.push(`  Statement: ${i.statement}`);
      if (i.key_questions.length > 0) {
        parts.push(`  Key questions: ${i.key_questions.join('; ')}`);
      }
    }
    parts.push('');
  }

  if (pack.patterns.length > 0) {
    parts.push('## Patterns');
    for (const p of pack.patterns) {
      parts.push(`- **${p.title}** (weight: ${p.strategic_weight})`);
      parts.push(`  Summary: ${p.summary}`);
    }
    parts.push('');
  }

  if (pack.tensions.length > 0) {
    parts.push('## Tensions');
    for (const t of pack.tensions) {
      parts.push(`- **${t.title}** (severity: ${t.severity})`);
      parts.push(`  Statement: ${t.statement}`);
    }
    parts.push('');
  }

  if (pack.signals.length > 0) {
    parts.push('## Signals');
    for (const s of pack.signals) {
      parts.push(`- **${s.title}** (relevance: ${s.relevance}, kind: ${s.kind})`);
      parts.push(`  Statement: ${s.statement}`);
    }
    parts.push('');
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the prompt for a single report section.
 * Includes only the analytical objects relevant to that section.
 */
export function buildSectionPrompt(
  sectionId: string,
  plan: ReportPlan,
  pack: SectionInputPack,
): string {
  const instruction = SECTION_INSTRUCTIONS[sectionId] ?? 'Write this section based on the provided inputs.';
  const inputs = serialiseInputs(pack);

  return `You are writing a section of a strategic analysis report.

Section title: "${pack.sectionPlan.title}"
Section purpose: ${pack.sectionPlan.purpose}

${instruction}

Core thesis: ${plan.core_thesis}

Tone profile: ${plan.tone_profile.style}, directness=${plan.tone_profile.directness}, skepticism=${plan.tone_profile.skepticism}

${STYLE_RULES}

${CONSTRAINT_RULES}

# Inputs

${inputs}

Write the section now. Output only the section body in markdown. Do not include the section heading.`;
}

/**
 * Build the prompt for the executive summary.
 */
export function buildSummaryPrompt(plan: ReportPlan): string {
  return `You are writing a one-paragraph executive summary for a strategic analysis report.

Core thesis: ${plan.core_thesis}

Key findings (${plan.key_findings.length}):
${plan.key_findings.map(f => `- ${f}`).join('\n')}

Sections: ${plan.section_plan.length}

Write a single concise paragraph that states the core thesis, mentions the number of key findings, and describes the report structure (evidence, tensions, hypotheses, implications).

${STYLE_RULES}

${CONSTRAINT_RULES}

Output only the summary paragraph. No heading.`;
}
