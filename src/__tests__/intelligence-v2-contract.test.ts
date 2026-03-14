/**
 * Intelligence V2 — Output Contract Tests
 *
 * Tests the structural output contract of the deterministic v2 stages:
 *   - selectDiagnosis: returns exactly one Diagnosis
 *   - generateMechanisms: returns 2–3 Mechanisms
 *   - selectIntervention: returns exactly one InterventionOpportunity
 *
 * Also tests traceability (IDs link correctly across stages) and contract
 * assertions in the pipeline orchestrator.
 *
 * LLM not required. All tests use deterministic stages only.
 */

import { describe, it, expect } from 'vitest'
import { selectDiagnosis } from '../intelligence-v2/stages/diagnosis/index.js'
import { generateMechanisms } from '../intelligence-v2/stages/mechanisms/index.js'
import { selectIntervention } from '../intelligence-v2/stages/intervention/index.js'
import type { Pattern, PatternArchetype } from '../intelligence-v2/types/pattern.js'
import type { Tension } from '../intelligence-v2/types/tension.js'
import type { Diagnosis } from '../intelligence-v2/types/diagnosis.js'
import type { Mechanism } from '../intelligence-v2/types/mechanism.js'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makePattern(
  id: string,
  archetype: PatternArchetype,
  tensionIds: string[] = ['t_001'],
  evidenceRefs: string[] = ['ev_001', 'ev_002'],
): Pattern {
  return {
    id,
    company_id: 'test_co',
    archetype,
    title: `Pattern: ${archetype}`,
    description: `Test pattern for ${archetype}`,
    tension_ids: tensionIds,
    signal_ids: [],
    evidence_refs: evidenceRefs,
    confidence: 'medium',
    weight: 2,
  }
}

function makeTension(id: string): Tension {
  return {
    id,
    company_id: 'test_co',
    type: 'enterprise_narrative_vs_founder_distribution',
    title: 'Test tension',
    statement: 'Founder drives all demand but company claims enterprise distribution.',
    signal_ids: [],
    evidence_refs: ['ev_001'],
    confidence: 'medium',
    severity: 'medium',
  }
}

function makeDiagnosis(
  type: Diagnosis['type'] = 'founder_led_sales_ceiling',
  patternId = 'p_001',
): Diagnosis {
  return {
    id: 'diag_001',
    company_id: 'test_co',
    type,
    statement: `Test diagnosis: ${type}`,
    confidence: 'medium',
    supporting_pattern_ids: [patternId],
    counterevidence_refs: [],
    evidence_refs: ['ev_001', 'ev_002'],
  }
}

function makeMechanism(id: string, diagnosisId = 'diag_001'): Mechanism {
  return {
    id,
    company_id: 'test_co',
    type: 'founder_lock_in',
    statement: 'Test mechanism statement.',
    plausibility: 'high',
    explains_diagnosis_id: diagnosisId,
    evidence_refs: ['ev_001'],
  }
}

// ---------------------------------------------------------------------------
// selectDiagnosis — output contract
// ---------------------------------------------------------------------------

describe('selectDiagnosis — output contract', () => {
  it('returns exactly one Diagnosis object (not an array)', () => {
    const patterns = [makePattern('p_001', 'founder_led_sales_ceiling')]
    const tensions = [makeTension('t_001')]
    const result = selectDiagnosis('test_co', patterns, tensions)
    expect(result).toBeDefined()
    expect(Array.isArray(result)).toBe(false)
    expect(typeof result.id).toBe('string')
    expect(typeof result.type).toBe('string')
    expect(typeof result.statement).toBe('string')
  })

  it('throws when patterns is empty', () => {
    expect(() => selectDiagnosis('test_co', [], [])).toThrow()
  })

  it('produces a non-empty statement', () => {
    const patterns = [makePattern('p_001', 'distribution_fragility')]
    const result = selectDiagnosis('test_co', patterns, [])
    expect(result.statement.length).toBeGreaterThan(0)
  })

  it('populates supporting_pattern_ids from winning patterns', () => {
    const patterns = [
      makePattern('p_001', 'founder_led_sales_ceiling'),
      makePattern('p_002', 'distribution_fragility'),
    ]
    const result = selectDiagnosis('test_co', patterns, [])
    expect(result.supporting_pattern_ids.length).toBeGreaterThan(0)
  })

  it('populates evidence_refs from winning patterns', () => {
    const patterns = [makePattern('p_001', 'services_disguised_as_saas', ['t_001'], ['ev_007', 'ev_008'])]
    const result = selectDiagnosis('test_co', patterns, [])
    expect(result.evidence_refs.length).toBeGreaterThan(0)
    expect(result.evidence_refs).toContain('ev_007')
  })

  it('selects the correct archetype when one archetype dominates', () => {
    const patterns = [
      makePattern('p_001', 'founder_led_sales_ceiling', ['t_001'], ['ev_001']),
      makePattern('p_002', 'founder_led_sales_ceiling', ['t_002'], ['ev_002']),
    ]
    const result = selectDiagnosis('test_co', patterns, [])
    expect(result.type).toBe('founder_led_sales_ceiling')
  })
})

// ---------------------------------------------------------------------------
// generateMechanisms — output contract
// ---------------------------------------------------------------------------

describe('generateMechanisms — output contract', () => {
  const diagnosis = makeDiagnosis('founder_led_sales_ceiling')
  const pattern = makePattern('p_001', 'founder_led_sales_ceiling')
  const tension = makeTension('t_001')

  it('returns 3 mechanisms when evidence pool is sufficient', () => {
    const result = generateMechanisms('test_co', diagnosis, [pattern], [tension])
    expect(result.length).toBe(3)
  })

  it('returns 2 mechanisms when evidence pool has fewer than 2 refs', () => {
    const sparsePattern = makePattern('p_001', 'founder_led_sales_ceiling', ['t_001'], [])
    const sparseTension: Tension = { ...tension, evidence_refs: [] }
    const sparseDiagnosis: Diagnosis = { ...diagnosis, evidence_refs: [] }
    const result = generateMechanisms('test_co', sparseDiagnosis, [sparsePattern], [sparseTension])
    expect(result.length).toBe(2)
  })

  it('never returns more than 3 mechanisms', () => {
    const result = generateMechanisms('test_co', diagnosis, [pattern], [tension])
    expect(result.length).toBeLessThanOrEqual(3)
  })

  it('never returns fewer than 2 mechanisms', () => {
    const sparseDiagnosis: Diagnosis = { ...diagnosis, evidence_refs: ['ev_001'] }
    const result = generateMechanisms('test_co', sparseDiagnosis, [], [])
    expect(result.length).toBeGreaterThanOrEqual(2)
  })

  it('all mechanisms reference the same diagnosis id', () => {
    const result = generateMechanisms('test_co', diagnosis, [pattern], [tension])
    for (const mech of result) {
      expect(mech.explains_diagnosis_id).toBe(diagnosis.id)
    }
  })

  it('all mechanisms have non-empty evidence_refs', () => {
    const result = generateMechanisms('test_co', diagnosis, [pattern], [tension])
    for (const mech of result) {
      expect(mech.evidence_refs.length).toBeGreaterThan(0)
    }
  })

  it('generates mechanisms for all 6 diagnosis archetypes', () => {
    const archetypes: Diagnosis['type'][] = [
      'founder_led_sales_ceiling',
      'services_disguised_as_saas',
      'developer_adoption_without_buyer_motion',
      'enterprise_theatre',
      'distribution_fragility',
      'narrative_distribution_mismatch',
    ]
    for (const archetype of archetypes) {
      const d = makeDiagnosis(archetype)
      const p = makePattern('p_001', archetype)
      const result = generateMechanisms('test_co', d, [p], [tension])
      expect(result.length).toBeGreaterThanOrEqual(2)
      expect(result.length).toBeLessThanOrEqual(3)
    }
  })
})

// ---------------------------------------------------------------------------
// selectIntervention — output contract
// ---------------------------------------------------------------------------

describe('selectIntervention — output contract', () => {
  it('returns exactly one InterventionOpportunity (not an array)', () => {
    const diagnosis = makeDiagnosis()
    const mechs = [makeMechanism('m_001'), makeMechanism('m_002')]
    const result = selectIntervention('test_co', diagnosis, mechs)
    expect(result).toBeDefined()
    expect(Array.isArray(result)).toBe(false)
    expect(typeof result.id).toBe('string')
    expect(typeof result.type).toBe('string')
  })

  it('throws when mechanisms is empty', () => {
    const diagnosis = makeDiagnosis()
    expect(() => selectIntervention('test_co', diagnosis, [])).toThrow()
  })

  it('throws when more than 3 mechanisms are provided', () => {
    const diagnosis = makeDiagnosis()
    const mechs = [
      makeMechanism('m_001'),
      makeMechanism('m_002'),
      makeMechanism('m_003'),
      makeMechanism('m_004'),
    ]
    expect(() => selectIntervention('test_co', diagnosis, mechs)).toThrow()
  })

  it('intervention diagnosis_id matches input diagnosis id', () => {
    const diagnosis = makeDiagnosis()
    const mechs = [makeMechanism('m_001'), makeMechanism('m_002')]
    const result = selectIntervention('test_co', diagnosis, mechs)
    expect(result.diagnosis_id).toBe(diagnosis.id)
  })

  it('intervention mechanism_ids includes all input mechanism ids', () => {
    const diagnosis = makeDiagnosis()
    const mechs = [makeMechanism('m_001'), makeMechanism('m_002'), makeMechanism('m_003')]
    const result = selectIntervention('test_co', diagnosis, mechs)
    for (const mech of mechs) {
      expect(result.mechanism_ids).toContain(mech.id)
    }
  })

  it('intervention evidence_refs is non-empty', () => {
    const diagnosis = makeDiagnosis()
    const mechs = [makeMechanism('m_001'), makeMechanism('m_002')]
    const result = selectIntervention('test_co', diagnosis, mechs)
    expect(result.evidence_refs.length).toBeGreaterThan(0)
  })

  it('intervention rationale is non-empty', () => {
    const diagnosis = makeDiagnosis()
    const mechs = [makeMechanism('m_001'), makeMechanism('m_002')]
    const result = selectIntervention('test_co', diagnosis, mechs)
    expect(result.rationale.length).toBeGreaterThan(0)
  })

  it('selects the correct intervention type for each diagnosis archetype', () => {
    const mapping: Array<[Diagnosis['type'], string]> = [
      ['founder_led_sales_ceiling', 'founder_gtm_transition'],
      ['services_disguised_as_saas', 'positioning_reset'],
      ['developer_adoption_without_buyer_motion', 'sales_motion_redesign'],
      ['enterprise_theatre', 'icp_redefinition'],
      ['distribution_fragility', 'distribution_strategy_reset'],
      ['narrative_distribution_mismatch', 'positioning_reset'],
    ]
    for (const [diagType, expectedIntervType] of mapping) {
      const diagnosis = makeDiagnosis(diagType)
      const mechs = [makeMechanism('m_001'), makeMechanism('m_002')]
      const result = selectIntervention('test_co', diagnosis, mechs)
      expect(result.type).toBe(expectedIntervType)
    }
  })
})

// ---------------------------------------------------------------------------
// Full chain traceability
// ---------------------------------------------------------------------------

describe('full chain traceability', () => {
  it('IDs link correctly across diagnosis → mechanisms → intervention', () => {
    const patterns = [makePattern('p_001', 'distribution_fragility')]
    const tensions = [makeTension('t_001')]

    const diagnosis = selectDiagnosis('test_co', patterns, tensions)
    const mechanisms = generateMechanisms('test_co', diagnosis, patterns, tensions)
    const intervention = selectIntervention('test_co', diagnosis, mechanisms)

    // All mechanisms point to the diagnosis
    for (const m of mechanisms) {
      expect(m.explains_diagnosis_id).toBe(diagnosis.id)
    }

    // Intervention points to diagnosis
    expect(intervention.diagnosis_id).toBe(diagnosis.id)

    // Intervention references all mechanism IDs
    for (const m of mechanisms) {
      expect(intervention.mechanism_ids).toContain(m.id)
    }

    // Diagnosis supporting_pattern_ids reference real patterns
    for (const pid of diagnosis.supporting_pattern_ids) {
      expect(patterns.some(p => p.id === pid)).toBe(true)
    }
  })
})
