/**
 * Writer adapter types for the report generation layer.
 *
 * The writer adapter abstracts prose generation behind a common interface,
 * allowing deterministic templates, LLM-backed generation, and skill-layer
 * generation (Claude Code) to coexist.
 */

import type { SectionPlan, ReportPlan } from '../pipeline/plan-report.js';
import type { Signal } from '../pipeline/extract-signals.js';
import type { Tension } from '../pipeline/detect-tensions.js';
import type { Pattern } from '../pipeline/detect-patterns.js';
import type { Hypothesis } from '../pipeline/generate-hypotheses.js';
import type { Implication } from '../pipeline/generate-implications.js';
import type { Confidence } from '../../types/evidence.js';

// ---------------------------------------------------------------------------
// Writer mode
// ---------------------------------------------------------------------------

export type WriterMode = 'template' | 'skill' | 'llm';

export interface WriterOptions {
  writerMode?: WriterMode;

  /**
   * Pre-generated skill responses. When writerMode is 'skill' and this
   * is provided, the writer assembles the report from these responses
   * instead of returning a bundle for external generation.
   */
  skillResponses?: SkillSectionResponse[];
}

// ---------------------------------------------------------------------------
// Section input pack (shared between all writers)
// ---------------------------------------------------------------------------

export interface SectionInputPack {
  sectionPlan: SectionPlan;
  hypotheses: Hypothesis[];
  implications: Implication[];
  patterns: Pattern[];
  tensions: Tension[];
  signals: Signal[];
}

// ---------------------------------------------------------------------------
// Writer interface
// ---------------------------------------------------------------------------

export interface SectionWriter {
  /**
   * Generate markdown for a single report section.
   * The writer receives only the analytical objects relevant to the section.
   */
  generateSection(
    sectionId: string,
    plan: ReportPlan,
    pack: SectionInputPack,
  ): Promise<string>;

  /**
   * Generate the executive summary paragraph.
   */
  generateSummary(plan: ReportPlan): Promise<string>;
}

// ---------------------------------------------------------------------------
// Skill writer contract
// ---------------------------------------------------------------------------
//
// Workflow:
//   1. Run deterministic pipeline through plan-report
//   2. Export SkillWriterBundle (one SkillSectionRequest per section)
//   3. Claude Code / skill layer writes each section from the bundle
//   4. Import SkillSectionResponse[] back into TypeScript
//   5. TypeScript validates and assembles the final Report object
//
// TypeScript controls: section input assembly, lineage, validation, assembly.
// Claude controls: prose generation only.

/** Serialised hypothesis summary for prompt context. */
export interface SkillAnalyticalContext {
  hypothesis_id: string;
  title: string;
  statement: string;
  confidence: Confidence;
  status: string;
  strongest_support?: string[];
  residual_uncertainty?: string;
  missing_evidence?: string[];
}

export interface SkillImplicationContext {
  implication_id: string;
  title: string;
  statement: string;
  impact: Confidence;
  urgency: Confidence;
  confidence: Confidence;
  key_questions: string[];
}

export interface SkillPatternContext {
  pattern_id: string;
  title: string;
  summary: string;
  strategic_weight: Confidence;
}

export interface SkillTensionContext {
  tension_id: string;
  title: string;
  statement: string;
  severity: Confidence;
}

export interface SkillSignalContext {
  signal_id: string;
  title: string;
  statement: string;
  relevance: Confidence;
  kind: string;
}

/** Style and constraint rules embedded in each section request. */
export interface SkillStyleRules {
  language: string;
  paragraph_length: string;
  tone: string;
  banned_phrases: string[];
  confidence_language: Record<Confidence, string>;
  constraints: string[];
}

/** A single section-writing request for the skill layer. */
export interface SkillSectionRequest {
  section_id: string;
  title: string;
  purpose: string;
  report_context: {
    core_thesis: string;
    tone_style: string;
    tone_directness: Confidence;
    tone_skepticism: Confidence;
  };
  relevant_hypotheses: SkillAnalyticalContext[];
  relevant_implications: SkillImplicationContext[];
  relevant_patterns: SkillPatternContext[];
  relevant_tensions: SkillTensionContext[];
  relevant_signals: SkillSignalContext[];
  style_rules: SkillStyleRules;
  section_instructions: string;
}

/** A single section-writing response from the skill layer. */
export interface SkillSectionResponse {
  section_id: string;
  markdown: string;
}

/** The full serialisable bundle for external prose generation. */
export interface SkillWriterBundle {
  report_id: string;
  company_id: string;
  generated_at: string;
  sections: SkillSectionRequest[];
  summary_request: {
    core_thesis: string;
    key_findings: string[];
    section_count: number;
    style_rules: SkillStyleRules;
  };
}
