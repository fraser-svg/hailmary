/**
 * Writer adapter factory.
 *
 * Returns the appropriate SectionWriter based on the configured mode.
 * Applies universal post-processing (sanitisation) regardless of writer.
 *
 * Modes:
 *   - "template" (default): deterministic template-based prose
 *   - "skill": prose generated externally by Claude Code / skill layer
 *   - "llm": LLM-backed prose generation (placeholder)
 */

import type { ReportPlan } from '../pipeline/plan-report.js';
import type {
  SectionInputPack,
  SectionWriter,
  WriterMode,
  SkillSectionResponse,
} from './types.js';
import { createTemplateWriter } from './template-writer.js';
import { createLlmWriter } from './llm-writer.js';
import { createSkillWriter } from './skill-writer.js';

// ---------------------------------------------------------------------------
// Text sanitisation (applied to all writer output)
// ---------------------------------------------------------------------------

/** Replace em dashes with comma-separated clauses per style rules. */
function sanitiseText(text: string): string {
  return text.replace(/\u2014/g, ',');
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Create a writer adapter that wraps the underlying writer with
 * universal post-processing (sanitisation).
 *
 * For skill mode, pass skillResponses to serve pre-generated prose.
 * If skill mode is used without responses, the writer returns error markers.
 */
export function createWriterAdapter(
  mode: WriterMode = 'template',
  skillResponses?: SkillSectionResponse[],
  summaryMarkdown?: string,
): SectionWriter {
  let inner: SectionWriter;

  switch (mode) {
    case 'skill':
      inner = createSkillWriter(skillResponses ?? [], summaryMarkdown);
      break;
    case 'llm':
      inner = createLlmWriter();
      break;
    case 'template':
    default:
      inner = createTemplateWriter();
      break;
  }

  return {
    async generateSection(
      sectionId: string,
      plan: ReportPlan,
      pack: SectionInputPack,
    ): Promise<string> {
      const raw = await inner.generateSection(sectionId, plan, pack);
      return sanitiseText(raw);
    },

    async generateSummary(plan: ReportPlan): Promise<string> {
      const raw = await inner.generateSummary(plan);
      return sanitiseText(raw);
    },
  };
}
