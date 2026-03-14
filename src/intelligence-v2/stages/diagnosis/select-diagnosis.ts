/**
 * Stage: Select Diagnosis
 *
 * Consumes patterns and tensions. Produces exactly ONE Diagnosis.
 *
 * Input:  Pattern[]   — from the patterns stage
 *         Tension[]   — from the tensions stage (used for coverage scoring)
 * Output: Diagnosis   — single primary commercial diagnosis
 *
 * Algorithm:
 *   1. Score every pattern archetype group (see scoring.ts)
 *   2. Select the highest-scoring candidate
 *   3. Build a deterministic statement from templates (see statements.ts)
 *   4. Collect evidence from winning patterns; counterevidence from losers
 */

import type { Diagnosis, Pattern, Tension } from './types.js'
import { scoreCandidates, pickWinner } from './scoring.js'
import { buildStatement } from './statements.js'

function unique(ids: string[]): string[] {
  return [...new Set(ids)]
}

// Counterevidence: evidence refs from patterns that did NOT win.
// These represent the strongest alternative explanations — useful for calibration.
function collectCounterEvidence(allPatterns: Pattern[], winnerType: string): string[] {
  return unique(
    allPatterns.filter(p => p.archetype !== winnerType).flatMap(p => p.evidence_refs),
  )
}

let _counter = 0

function nextId(): string {
  return `diag_${String(++_counter).padStart(3, '0')}`
}

export function selectDiagnosis(
  companyId: string,
  patterns: Pattern[],
  tensions: Tension[],
): Diagnosis {
  _counter = 0

  if (patterns.length === 0) {
    throw new Error(`selectDiagnosis [${companyId}]: no patterns provided`)
  }

  const candidates = scoreCandidates(patterns, tensions)
  const winner = pickWinner(candidates)

  if (!winner) {
    throw new Error(`selectDiagnosis [${companyId}]: scoring produced no candidates`)
  }

  const statement = buildStatement(winner.type, {
    patternCount: winner.patterns.length,
    tensionCount: winner.tension_ids.length,
  })

  return {
    id: nextId(),
    company_id: companyId,
    type: winner.type,
    statement,
    confidence: winner.max_confidence,
    supporting_pattern_ids: winner.patterns.map(p => p.id),
    counterevidence_refs: collectCounterEvidence(patterns, winner.type),
    evidence_refs: unique(winner.patterns.flatMap(p => p.evidence_refs)),
  }
}
