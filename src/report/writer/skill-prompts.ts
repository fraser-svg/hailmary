/**
 * Master prompt system for skill-layer report writing.
 *
 * Converts SkillSectionRequest objects into structured prompts that
 * produce sharp, evidence-aware, forensic prose. The prompt architecture
 * has five layers:
 *
 *   1. Role definition — establishes the analyst persona
 *   2. Writing mechanics — sentence, paragraph, and language rules
 *   3. Section craft — per-section guidance on structure and emphasis
 *   4. Analytical context — the actual objects to write about
 *   5. Output contract — format, constraints, and closing instruction
 *
 * This module does NOT modify the skill bundle contract.
 * It only shapes how prompts are assembled from SkillSectionRequest data.
 */

import type {
  SkillSectionRequest,
  SkillAnalyticalContext,
  SkillImplicationContext,
  SkillPatternContext,
  SkillTensionContext,
  SkillSignalContext,
  SkillStyleRules,
  SkillWriterBundle,
} from './types.js';

// ═══════════════════════════════════════════════════════════════════════════
// Layer 1: Role definition
// ═══════════════════════════════════════════════════════════════════════════

const ROLE_BLOCK = `You are an analyst writing one section of a company intelligence report.

The analytical reasoning has already been performed by a deterministic pipeline. Signals have been extracted, tensions identified, patterns detected, hypotheses generated and stress-tested, and implications derived. None of this is your work. Your task is to explain these findings clearly, precisely, and without embellishment.

You are not a consultant presenting recommendations. You are not a journalist writing a story. You are a structural analyst describing what the evidence reveals, where it conflicts, and what that may mean. Your reader is a decision-maker who values precision over polish.`;

// ═══════════════════════════════════════════════════════════════════════════
// Layer 2: Writing mechanics
// ═══════════════════════════════════════════════════════════════════════════

function buildMechanicsBlock(rules: SkillStyleRules): string {
  const parts: string[] = [];

  parts.push('# Writing Rules');
  parts.push('');

  // Language
  parts.push('## Language');
  parts.push(`- ${rules.language}.`);
  parts.push('- Never use em dashes (the long dash). Use commas, semicolons, or full stops.');
  parts.push('- Prefer concrete nouns and active verbs. Avoid nominalisations (e.g. "utilisation" when "use" works).');
  parts.push('');

  // Sentences
  parts.push('## Sentences');
  parts.push('- Typical sentence length: 12 to 20 words.');
  parts.push('- Hard ceiling: 28 words per sentence. If a sentence exceeds this, split it.');
  parts.push('- Lead with the observation or claim, not with hedging or setup.');
  parts.push('- One idea per sentence. Do not chain clauses with "and" or "while".');
  parts.push('');

  // Paragraphs
  parts.push('## Paragraphs');
  parts.push(`- ${rules.paragraph_length}.`);
  parts.push('- Each paragraph should make exactly one point.');
  parts.push('- Open with the point. Support with evidence or detail. Close or transition.');
  parts.push('');

  // Tone
  parts.push('## Tone');
  parts.push('');
  parts.push('The writing should sound:');
  parts.push('- Forensic: examining evidence methodically.');
  parts.push('- Precise: choosing exact words over approximate ones.');
  parts.push('- Observational: describing what the data shows, not what the writer feels.');
  parts.push('- Strategically curious: noting where patterns are interesting or incomplete.');
  parts.push('');
  parts.push('The writing must NOT sound:');
  parts.push('- Promotional or enthusiastic about the company.');
  parts.push('- Dramatic or alarmist (no "critical", "alarming", "deeply concerning").');
  parts.push('- Smug or knowing (no "unsurprisingly", "as one might expect").');
  parts.push('- MBA-like (no "value creation", "go-to-market motion", "stakeholder alignment").');
  parts.push('- Consulting-like (no "key takeaway", "action item", "strategic lever").');
  parts.push('');

  // Banned phrases
  parts.push('## Banned Phrases');
  parts.push('');
  parts.push('Never use any of these:');
  for (const phrase of rules.banned_phrases) {
    parts.push(`- "${phrase}"`);
  }
  parts.push('');

  // Confidence language
  parts.push('## Confidence Language');
  parts.push('');
  parts.push('Match your hedging to the confidence level of each analytical object:');
  parts.push(`- High confidence: "${rules.confidence_language.high}"`);
  parts.push(`- Medium confidence: "${rules.confidence_language.medium}"`);
  parts.push(`- Low confidence: "${rules.confidence_language.low}"`);
  parts.push('');
  parts.push('Do not upgrade or downgrade confidence. If an object is marked medium, do not write as though it were certain.');

  return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// Layer 3: Section craft
// ═══════════════════════════════════════════════════════════════════════════

interface SectionCraft {
  intent: string;
  structure: string;
  emphasis: string;
  pitfalls: string;
}

const SECTION_CRAFT: Record<string, SectionCraft> = {
  sec_01: {
    intent:
      'Set the frame for the entire report. The reader should understand the core thesis and know what the report will cover within the first paragraph.',
    structure:
      'Open with the core thesis stated plainly. Follow with the key findings as a brief enumeration. Close by signposting what follows, referencing the most critical implications without elaborating.',
    emphasis:
      'Clarity and compression. Every sentence must earn its place. Do not introduce evidence detail here; that belongs in later sections. This section is a map, not the territory.',
    pitfalls:
      'Do not oversell the findings. Do not use phrases like "this report reveals" or "our analysis shows". State the thesis directly, as fact observed, not as a discovery to be announced.',
  },

  sec_02: {
    intent:
      'Build the evidentiary foundation. The reader should see what was observed before any interpretation begins.',
    structure:
      'Present signals in descending order of relevance. For each signal, state what was observed and what category of evidence it belongs to. After individual signals, describe structural patterns that emerge from multiple signals together.',
    emphasis:
      'Observation without interpretation. Describe what the evidence shows, not what it means. The reader draws connections; your job is to lay out the pieces clearly. Use bold for signal titles to create scannable structure.',
    pitfalls:
      'Do not explain why a signal matters. Do not connect signals to hypotheses. Do not use causal language ("because", "therefore", "this shows that"). Keep the epistemic level to pure observation.',
  },

  sec_03: {
    intent:
      'Surface the contradictions. Where the company says one thing and the evidence suggests another, or where two pieces of evidence point in opposite directions, name the gap precisely.',
    structure:
      'Order tensions by severity, highest first. For each tension, name it clearly, then explain the two sides of the contradiction. Be specific about what conflicts with what. After describing the tension, briefly note its severity level.',
    emphasis:
      'Precision in naming the gap. A tension is not "the company could do better." A tension is "the company claims X, but evidence Y indicates the opposite." Name both sides. The reader should feel the structural strain.',
    pitfalls:
      'Do not judge the company for having tensions. Do not suggest how to resolve them. Do not editorialize ("worryingly", "problematically"). Describe the structural misalignment and let the reader feel its weight.',
  },

  sec_04: {
    intent:
      'Present the surviving explanations. These are hypotheses that passed stress testing and represent the most plausible accounts of what is happening beneath the surface.',
    structure:
      'For each hypothesis, open with a confidence-appropriate lead phrase. State the hypothesis clearly. Then present the strongest supporting evidence points. If residual uncertainty exists, state what would need to be true for the hypothesis to be wrong.',
    emphasis:
      'Plausibility, not certainty. These are explanations, not conclusions. The reader should understand that each hypothesis is the best available explanation given current evidence, and that stronger evidence could change the picture.',
    pitfalls:
      'Do not present hypotheses as proven facts. Do not skip the supporting evidence. Do not omit residual uncertainty. The strength of this section comes from showing the reasoning chain, not from asserting conclusions.',
  },

  sec_05: {
    intent:
      'Translate the hypotheses into consequences. If the explanations are correct, what follows for the company, its customers, its investors, or its market position?',
    structure:
      'Order implications by impact and urgency, highest first. For each, use conditional framing: "If [hypothesis] holds, then [consequence] may follow." Include key questions that a decision-maker would want answered.',
    emphasis:
      'Conditional language throughout. Every implication flows from a hypothesis; make that lineage visible. The reader should understand which implications depend on which explanations, and how confident the underlying evidence is.',
    pitfalls:
      'Do not recommend actions. Do not say "the company should" or "stakeholders must." Describe consequences, not prescriptions. The report informs; it does not advise.',
  },

  sec_06: {
    intent:
      'Acknowledge what the analysis cannot yet determine. These are hypotheses that did not survive stress testing with sufficient confidence, and evidence gaps that limit the analysis.',
    structure:
      'For each weak hypothesis, state what it proposed and why the evidence was insufficient. Then describe what evidence would strengthen or refute it. Frame everything with low-confidence language.',
    emphasis:
      'Intellectual honesty. This section exists to prevent the reader from over-indexing on the surviving hypotheses. Uncertainty is not a weakness; it is a boundary that defines the scope of what the analysis can claim.',
    pitfalls:
      'Do not treat uncertainty as failure. Do not dismiss weak hypotheses as wrong; they may simply lack evidence. Do not apologise for gaps. State them directly.',
  },
};

function buildCraftBlock(sectionId: string, instructions: string): string {
  const craft = SECTION_CRAFT[sectionId];
  if (!craft) {
    return `# Section Task\n\n${instructions}`;
  }

  const parts: string[] = [];

  parts.push('# Section Task');
  parts.push('');
  parts.push(instructions);
  parts.push('');
  parts.push(`**Intent:** ${craft.intent}`);
  parts.push('');
  parts.push(`**Structure:** ${craft.structure}`);
  parts.push('');
  parts.push(`**Emphasis:** ${craft.emphasis}`);
  parts.push('');
  parts.push(`**Pitfalls to avoid:** ${craft.pitfalls}`);

  return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// Layer 4: Analytical context
// ═══════════════════════════════════════════════════════════════════════════

function renderHypotheses(items: SkillAnalyticalContext[]): string {
  if (items.length === 0) return '';

  const lines: string[] = ['## Hypotheses', ''];

  for (const h of items) {
    lines.push(`### ${h.title}`);
    lines.push(`- ID: ${h.hypothesis_id}`);
    lines.push(`- Confidence: ${h.confidence}`);
    lines.push(`- Status: ${h.status}`);
    lines.push(`- Statement: ${h.statement}`);

    if (h.strongest_support && h.strongest_support.length > 0) {
      lines.push('- Strongest support:');
      for (const s of h.strongest_support) {
        lines.push(`  - ${s}`);
      }
    }

    if (h.residual_uncertainty) {
      lines.push(`- Residual uncertainty: ${h.residual_uncertainty}`);
    }

    if (h.missing_evidence && h.missing_evidence.length > 0) {
      lines.push('- Missing evidence:');
      for (const m of h.missing_evidence) {
        lines.push(`  - ${m}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

function renderImplications(items: SkillImplicationContext[]): string {
  if (items.length === 0) return '';

  const lines: string[] = ['## Implications', ''];

  for (const i of items) {
    lines.push(`### ${i.title}`);
    lines.push(`- ID: ${i.implication_id}`);
    lines.push(`- Impact: ${i.impact}`);
    lines.push(`- Urgency: ${i.urgency}`);
    lines.push(`- Confidence: ${i.confidence}`);
    lines.push(`- Statement: ${i.statement}`);

    if (i.key_questions.length > 0) {
      lines.push('- Key questions:');
      for (const q of i.key_questions) {
        lines.push(`  - ${q}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

function renderPatterns(items: SkillPatternContext[]): string {
  if (items.length === 0) return '';

  const lines: string[] = ['## Patterns', ''];

  for (const p of items) {
    lines.push(`### ${p.title}`);
    lines.push(`- ID: ${p.pattern_id}`);
    lines.push(`- Strategic weight: ${p.strategic_weight}`);
    lines.push(`- Summary: ${p.summary}`);
    lines.push('');
  }

  return lines.join('\n');
}

function renderTensions(items: SkillTensionContext[]): string {
  if (items.length === 0) return '';

  const lines: string[] = ['## Tensions', ''];

  for (const t of items) {
    lines.push(`### ${t.title}`);
    lines.push(`- ID: ${t.tension_id}`);
    lines.push(`- Severity: ${t.severity}`);
    lines.push(`- Statement: ${t.statement}`);
    lines.push('');
  }

  return lines.join('\n');
}

function renderSignals(items: SkillSignalContext[]): string {
  if (items.length === 0) return '';

  const lines: string[] = ['## Signals', ''];

  for (const s of items) {
    lines.push(`### ${s.title}`);
    lines.push(`- ID: ${s.signal_id}`);
    lines.push(`- Relevance: ${s.relevance}`);
    lines.push(`- Kind: ${s.kind}`);
    lines.push(`- Statement: ${s.statement}`);
    lines.push('');
  }

  return lines.join('\n');
}

function buildAnalyticalContext(req: SkillSectionRequest): string {
  const parts: string[] = [];

  parts.push('# Analytical Inputs');
  parts.push('');
  parts.push('The following objects were produced by the upstream reasoning pipeline. Write only from these inputs.');
  parts.push('');

  const hypotheses = renderHypotheses(req.relevant_hypotheses);
  const implications = renderImplications(req.relevant_implications);
  const patterns = renderPatterns(req.relevant_patterns);
  const tensions = renderTensions(req.relevant_tensions);
  const signals = renderSignals(req.relevant_signals);

  // Render non-empty sections in the order most useful for each section type
  const blocks = [hypotheses, implications, patterns, tensions, signals].filter(b => b.length > 0);

  if (blocks.length === 0) {
    parts.push('(No analytical objects provided for this section.)');
  } else {
    parts.push(blocks.join('\n'));
  }

  return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// Layer 5: Output contract
// ═══════════════════════════════════════════════════════════════════════════

const CONSTRAINTS_BLOCK = `# Constraints

These are hard rules. Violating any of them invalidates the output.

- Do not invent new hypotheses or implications.
- Do not introduce evidence not present in the inputs above.
- Do not reinterpret evidence beyond what the upstream analysis provides.
- Do not perform new research or reasoning.
- Do not recommend actions ("the company should", "stakeholders must").
- Do not add section headings. The system adds the heading.
- Do not add metadata, labels, or commentary outside the prose.
- Do not use em dashes. Use commas, semicolons, or full stops.
- Every claim must trace to an analytical object in the inputs.`;

const OUTPUT_BLOCK = `# Output

Write the section body as plain markdown. Do not include the section heading; the report system adds it. Do not include any preamble or closing commentary. Output only the prose.`;

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a complete prompt for a single report section from a SkillSectionRequest.
 *
 * The prompt assembles five layers:
 *   1. Role definition — analyst persona and purpose
 *   2. Writing mechanics — language, sentence, paragraph, tone rules
 *   3. Section craft — intent, structure, emphasis, pitfalls
 *   4. Analytical context — the objects to write about
 *   5. Output contract — constraints and format
 */
export function buildSkillPrompt(request: SkillSectionRequest): string {
  const parts: string[] = [];

  // Layer 1: Role
  parts.push(ROLE_BLOCK);
  parts.push('');

  // Report context
  parts.push('---');
  parts.push('');
  parts.push(`**Report context**`);
  parts.push(`- Section: "${request.title}"`);
  parts.push(`- Purpose: ${request.purpose}`);
  parts.push(`- Core thesis: ${request.report_context.core_thesis}`);
  parts.push(`- Tone: ${request.report_context.tone_style}, directness=${request.report_context.tone_directness}, skepticism=${request.report_context.tone_skepticism}`);
  parts.push('');

  // Layer 2: Mechanics
  parts.push(buildMechanicsBlock(request.style_rules));
  parts.push('');

  // Layer 3: Craft
  parts.push(buildCraftBlock(request.section_id, request.section_instructions));
  parts.push('');

  // Layer 4: Analytical context
  parts.push(buildAnalyticalContext(request));
  parts.push('');

  // Layer 5: Constraints and output
  parts.push(CONSTRAINTS_BLOCK);
  parts.push('');
  parts.push(OUTPUT_BLOCK);

  return parts.join('\n');
}

/**
 * Build the prompt for the executive summary from a SkillWriterBundle.
 */
export function buildSummaryPrompt(bundle: SkillWriterBundle): string {
  const parts: string[] = [];

  parts.push(ROLE_BLOCK);
  parts.push('');
  parts.push('---');
  parts.push('');
  parts.push('You are writing the executive summary paragraph for this report.');
  parts.push('');
  parts.push(`Core thesis: ${bundle.summary_request.core_thesis}`);
  parts.push('');
  parts.push(`Key findings (${bundle.summary_request.key_findings.length}):`);
  for (const f of bundle.summary_request.key_findings) {
    parts.push(`- ${f}`);
  }
  parts.push('');
  parts.push(`The report contains ${bundle.summary_request.section_count} sections.`);
  parts.push('');
  parts.push(buildMechanicsBlock(bundle.summary_request.style_rules));
  parts.push('');
  parts.push(`# Task`);
  parts.push('');
  parts.push('Write a single paragraph of 3 to 5 sentences.');
  parts.push('State the core thesis directly. Reference the number of key findings. Describe the report structure: evidence, tensions, hypotheses, implications.');
  parts.push('Do not list the findings. Summarise at the level of "what this report is about", not "what this report found".');
  parts.push('');
  parts.push(CONSTRAINTS_BLOCK);
  parts.push('');
  parts.push(OUTPUT_BLOCK);

  return parts.join('\n');
}
