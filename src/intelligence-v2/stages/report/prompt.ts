/**
 * Report Prompt Builder
 *
 * Constructs the LLM prompt from structured analytical objects.
 * The prompt passes only the content the LLM needs to render prose:
 * diagnosis type + statement, mechanism types + statements, intervention.
 *
 * Evidence IDs and internal scores are NOT passed — they are internal
 * accounting and would add noise without improving prose quality.
 *
 * The prompt is designed to prevent the LLM from:
 *   - inventing new claims
 *   - softening the diagnosis
 *   - using consulting clichés
 *   - exceeding section word limits
 */

import type { Diagnosis, InterventionOpportunity, Mechanism } from './types.js'

export const BANNED_PHRASES = [
  'well positioned',
  'robust value proposition',
  'dynamic market landscape',
  'innovative solution',
  'leveraging synergies',
  'industry leading',
  'cutting edge',
  'best-in-class',
  'strong traction',
  'paradigm shift',
  'key takeaway',
  "it's worth noting",
  'at the end of the day',
  'value add',
  'strategic fit',
  'low-hanging fruit',
  'move the needle',
  'holistic approach',
  'ecosystem',
  'synergy',
  'game-changer',
  'disruptive',
  'transformative',
  'actionable insights',
]

export const SYSTEM_PROMPT = `You are a GTM analyst writing a diagnostic report for a B2B company founder.

You have been given structured analytical output produced by a deterministic reasoning pipeline.
Your job is to render that output as clean, direct prose.

Critical rules:
- Do not invent any new claims. Every sentence must come from the structured input.
- Write directly to the founder. No hedging, no academic qualifiers.
- Short sentences. Active voice.
- No em dashes (—). Use commas, semicolons, or full stops instead.
- Maximum 350 words per section. Total report must not exceed 900 words. This is a physical mail report — brevity is not optional.
- Do not use these phrases: ${BANNED_PHRASES.join(', ')}.

Return valid JSON only. No markdown code fences. No additional text outside the JSON.`

export function buildPrompt(
  diagnosis: Diagnosis,
  mechanisms: Mechanism[],
  intervention: InterventionOpportunity,
): string {
  const mechanismBlocks = mechanisms
    .map(
      (m, i) =>
        `MECHANISM ${i + 1} [${m.type}] [plausibility: ${m.plausibility}]\n${m.statement}`,
    )
    .join('\n\n')

  return `You are rendering a GTM diagnostic report from structured analytical input.

---
DIAGNOSIS [type: ${diagnosis.type}] [confidence: ${diagnosis.confidence}]

${diagnosis.statement}

---
MECHANISMS (${mechanisms.length} total — these explain why the diagnosis exists)

${mechanismBlocks}

---
INTERVENTION [type: ${intervention.type}] [expected_impact: ${intervention.expected_impact}]

Statement: ${intervention.statement}

Rationale: ${intervention.rationale}

---

Write exactly three sections in this order:

SECTION 1 — "The Diagnosis"
State the core finding directly. What is structurally true about how this company operates in the market.
2 to 3 short paragraphs. Reference the specific structural conditions from the diagnosis.
Do not soften. If there is a ceiling or constraint, name it.

SECTION 2 — "Why This Happens"
Explain the structural forces that produce the diagnosis.
One short paragraph per mechanism. Use simple sequencing ("First," "Second," "Third,").
Each paragraph must feel causal — explain why the force produces the condition, not just what the force is.

SECTION 3 — "The Opportunity"
State what should change and why this is the right lever given the diagnosis.
1 to 2 paragraphs. Name what specifically changes, not just that something must change.
Tie the intervention directly back to the diagnosis — show the logical chain.

Return this exact JSON structure:
{
  "diagnosis_section": "<full markdown for section 1>",
  "mechanisms_section": "<full markdown for section 2>",
  "intervention_section": "<full markdown for section 3>"
}`
}
