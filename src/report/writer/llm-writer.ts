/**
 * LLM-backed section writer.
 *
 * Generates report sections by passing structured analytical objects
 * to an LLM via the prompt builder. The LLM must follow the report plan
 * and must not invent new reasoning.
 *
 * V1: Placeholder adapter that returns deterministic text.
 * When a real LLM provider is available, replace generateText().
 */

import type { ReportPlan } from '../pipeline/plan-report.js';
import type { SectionInputPack, SectionWriter } from './types.js';
import { buildSectionPrompt, buildSummaryPrompt } from './prompt-builder.js';

// ---------------------------------------------------------------------------
// LLM adapter (placeholder)
// ---------------------------------------------------------------------------

/**
 * Generate text from a prompt using an LLM.
 *
 * Placeholder implementation returns deterministic text so the system
 * compiles and passes validation. Replace this with a real provider
 * (OpenAI, Claude, etc.) when available.
 */
async function generateText(prompt: string): Promise<string> {
  // Extract section title from the prompt for deterministic placeholder output
  const titleMatch = prompt.match(/Section title: "([^"]+)"/);
  const title = titleMatch?.[1] ?? 'Unknown Section';

  // Return minimal valid placeholder text per section
  return `This section presents the analysis for "${title}". The findings are derived from the structured analytical pipeline and grounded in the available evidence.`;
}

// ---------------------------------------------------------------------------
// LLM writer implementation
// ---------------------------------------------------------------------------

export function createLlmWriter(): SectionWriter {
  return {
    async generateSection(
      sectionId: string,
      plan: ReportPlan,
      pack: SectionInputPack,
    ): Promise<string> {
      const prompt = buildSectionPrompt(sectionId, plan, pack);
      return generateText(prompt);
    },

    async generateSummary(plan: ReportPlan): Promise<string> {
      const prompt = buildSummaryPrompt(plan);
      return generateText(prompt);
    },
  };
}
