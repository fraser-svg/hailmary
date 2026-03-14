/**
 * Report Writer — LLM prose rendering
 *
 * Uses Claude claude-haiku-4-5 to render structured reasoning into clean prose.
 * Haiku is the right model here: the content is fully specified by the prompt;
 * no deep reasoning is required, only clean prose generation.
 *
 * The LLM does not reason. It renders. All reasoning was done upstream.
 *
 * If ANTHROPIC_API_KEY is not set, or if the API call fails,
 * the function throws — there is no silent fallback. The caller
 * (render-report.ts) handles the error and returns it in ValidationError[].
 */

import Anthropic from '@anthropic-ai/sdk'
import type { Diagnosis, InterventionOpportunity, Mechanism, ParsedSections } from './types.js'
import { buildPrompt, SYSTEM_PROMPT } from './prompt.js'

const MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 2048

function getClient(): Anthropic {
  const key = process.env['ANTHROPIC_API_KEY']
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY is not set — cannot render report prose')
  }
  return new Anthropic({ apiKey: key })
}

function parseResponse(text: string): ParsedSections {
  // Strip markdown code fences if the model added them despite instructions
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(
      `LLM response was not valid JSON.\n\nResponse received:\n${text.slice(0, 500)}`,
    )
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>)['diagnosis_section'] !== 'string' ||
    typeof (parsed as Record<string, unknown>)['mechanisms_section'] !== 'string' ||
    typeof (parsed as Record<string, unknown>)['intervention_section'] !== 'string'
  ) {
    throw new Error(
      'LLM response JSON is missing required fields (diagnosis_section, mechanisms_section, intervention_section)',
    )
  }

  const sections = parsed as Record<string, string>
  return {
    diagnosis_section: sections['diagnosis_section'],
    mechanisms_section: sections['mechanisms_section'],
    intervention_section: sections['intervention_section'],
  }
}

export async function renderProse(
  diagnosis: Diagnosis,
  mechanisms: Mechanism[],
  intervention: InterventionOpportunity,
): Promise<ParsedSections> {
  const client = getClient()
  const userPrompt = buildPrompt(diagnosis, mechanisms, intervention)

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const content = message.content[0]
  if (!content || content.type !== 'text') {
    throw new Error('LLM returned no text content')
  }

  return parseResponse(content.text)
}
