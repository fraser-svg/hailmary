/**
 * Diagnosis — Selection Heuristic
 *
 * Scores every pattern group (by archetype) to select the one primary diagnosis.
 *
 * Heuristic (in priority order):
 *   1. tension_coverage  — number of unique tensions the archetype explains (weight ×3)
 *   2. max_confidence    — highest pattern confidence in the group (weight ×2)
 *   3. actionability     — commercial actionability of the diagnosis type (weight ×1)
 *
 * The winner is the highest-scoring candidate.
 * Ties are broken by actionability, then by alphabetical type (deterministic).
 */

import type { Confidence, DiagnosisType, Pattern, Tension } from './types.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 }

// Commercially actionable = has a specific, agency-deliverable intervention.
// Higher score = more actionable.
const ACTIONABILITY: Record<DiagnosisType, number> = {
  founder_led_sales_ceiling: 3,              // clear ceiling, clear intervention path
  services_disguised_as_saas: 3,            // clear repositioning opportunity
  distribution_fragility: 2,                // actionable but intervention is broader
  narrative_distribution_mismatch: 2,       // positioning work, specific scope
  developer_adoption_without_buyer_motion: 2, // GTM motion development
  enterprise_theatre: 1,                    // actionable but often requires large structural change
}

// ---------------------------------------------------------------------------
// Candidate type
// ---------------------------------------------------------------------------

export interface DiagnosisCandidate {
  type: DiagnosisType
  patterns: Pattern[]
  tension_ids: string[]     // unique tension IDs covered by all patterns in this group
  max_confidence: Confidence
  score: number
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export function scoreCandidates(
  patterns: Pattern[],
  tensions: Tension[],
): DiagnosisCandidate[] {
  // Build a set of all known tension IDs for validation
  const knownTensionIds = new Set(tensions.map(t => t.id))

  // Group patterns by archetype (which maps 1:1 to DiagnosisType)
  const groups = new Map<DiagnosisType, Pattern[]>()
  for (const pattern of patterns) {
    const type = pattern.archetype as DiagnosisType
    const existing = groups.get(type) ?? []
    groups.set(type, [...existing, pattern])
  }

  const candidates: DiagnosisCandidate[] = []

  for (const [type, group] of groups) {
    // Unique tension IDs covered by this archetype group.
    // Only count tensions that exist in the provided tension list (no phantom IDs).
    const tension_ids = [
      ...new Set(group.flatMap(p => p.tension_ids).filter(id => knownTensionIds.has(id))),
    ]

    // Highest confidence across the pattern group
    const maxRank = Math.max(...group.map(p => CONFIDENCE_RANK[p.confidence]))
    const max_confidence = (['low', 'medium', 'high'] as Confidence[])[maxRank]

    // Weighted score
    const tension_coverage = tension_ids.length
    const confidence_score = maxRank
    const actionability_score = ACTIONABILITY[type] ?? 1
    const score = tension_coverage * 3 + confidence_score * 2 + actionability_score * 1

    candidates.push({ type, patterns: group, tension_ids, max_confidence, score })
  }

  // Sort descending by score, then actionability, then type (fully deterministic)
  return candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const aAction = ACTIONABILITY[a.type] ?? 1
    const bAction = ACTIONABILITY[b.type] ?? 1
    if (bAction !== aAction) return bAction - aAction
    return a.type.localeCompare(b.type)
  })
}

export function pickWinner(candidates: DiagnosisCandidate[]): DiagnosisCandidate | null {
  return candidates[0] ?? null
}
