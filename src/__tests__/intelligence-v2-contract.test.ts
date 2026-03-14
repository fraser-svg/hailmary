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
import { adaptPatterns } from '../intelligence-v2/adapter.js'
import { analyseGtm } from '../intelligence-v2/stages/gtm-analysis/index.js'
import type { Pattern, PatternArchetype } from '../intelligence-v2/types/pattern.js'
import type { Tension } from '../intelligence-v2/types/tension.js'
import type { Diagnosis } from '../intelligence-v2/types/diagnosis.js'
import type { Mechanism } from '../intelligence-v2/types/mechanism.js'
import type { GTMAnalysis } from '../intelligence-v2/types/gtm-analysis.js'
import type { Pattern as ReportPattern } from '../report/pipeline/detect-patterns.js'
import type { Tension as ReportTension } from '../report/pipeline/detect-tensions.js'
import type { Signal } from '../report/pipeline/extract-signals.js'

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

// ---------------------------------------------------------------------------
// Adapter — SPEC 005 D4: founder_led GTM boost
//
// When sales_motion.mode === "founder_led", the adapter must add +2 to
// founder_led_sales_ceiling in the archetype scoring.
//
// Test design: use a tension with brand_vs_customer_language type, which
// carries affinity only to narrative_distribution_mismatch (+1). With neutral
// GTM, narrative_distribution_mismatch wins. With founder_led GTM and the
// +2 boost applied, founder_led_sales_ceiling (2) beats it (1).
// ---------------------------------------------------------------------------

function makeReportTension(id: string, type: ReportTension['type']): ReportTension {
  return {
    tension_id: id,
    company_id: 'test_co',
    type,
    title: 'Test tension',
    statement: 'Test statement.',
    signal_ids: [],
    evidence_ids: ['ev_001'],
    source_ids: [],
    confidence: 'medium',
    severity: 'medium',
    strategic_relevance: 'medium',
  }
}

function makeReportPattern(id: string, tensionId: string): ReportPattern {
  return {
    pattern_id: id,
    company_id: 'test_co',
    pattern_type: 'contradiction',
    title: 'Test pattern',
    summary: 'Test summary.',
    tension_ids: [tensionId],
    signal_ids: [],
    evidence_ids: ['ev_001'],
    source_ids: [],
    importance: 'medium',
    confidence: 'medium',
    strategic_weight: 'medium',
  }
}

function makeNeutralGtm(): GTMAnalysis {
  return {
    company_id: 'test_co',
    sales_motion: { mode: 'hybrid', confidence: 'low', rationale: '', evidence_refs: [] },
    buyer_structure: {
      primary_user: null, economic_buyer: null, champion: null,
      user_buyer_mismatch: false, confidence: 'low', rationale: '', evidence_refs: [],
    },
    distribution_architecture: {
      primary_channel: 'unknown', secondary_channels: [], fragility_score: 0,
      fragility_reasons: [], confidence: 'low', evidence_refs: [],
    },
    founder_dependency: {
      narrative_dependency: false, demand_dependency: false, sales_dependency: false,
      risk_score: 0, rationale: '', evidence_refs: [],
    },
    service_dependency: {
      onboarding_complexity: 'low', implementation_required: false,
      hidden_services_risk: 0, rationale: '', evidence_refs: [],
    },
    pricing_delivery_fit: {
      pricing_model: 'unknown', roi_clarity: 'unknown',
      delivery_fit_tension: false, rationale: '', evidence_refs: [],
    },
    evidence_refs: [],
  }
}

describe('adapter — SPEC 005 D4: founder_led sales_motion GTM boost', () => {
  it('classifies as founder_led_sales_ceiling when sales_motion is founder_led with neutral tensions', () => {
    // brand_vs_customer_language → narrative_distribution_mismatch: 1 (no founder affinity)
    // Without the founder_led boost: narrative_distribution_mismatch wins (1 > 0)
    // With the +2 boost: founder_led_sales_ceiling (2) beats narrative_distribution_mismatch (1)
    const tension = makeReportTension('t_001', 'brand_vs_customer_language')
    const pattern = makeReportPattern('p_001', 't_001')
    const gtm: GTMAnalysis = {
      ...makeNeutralGtm(),
      sales_motion: { mode: 'founder_led', confidence: 'high', rationale: '', evidence_refs: [] },
    }

    const result = adaptPatterns([pattern], [tension], gtm)
    expect(result[0].archetype).toBe('founder_led_sales_ceiling')
  })

  it('does not produce founder_led_sales_ceiling from the founder_led boost when mode is not founder_led', () => {
    // Same neutral tension, no founder_led mode — narrative_distribution_mismatch must win
    const tension = makeReportTension('t_001', 'brand_vs_customer_language')
    const pattern = makeReportPattern('p_001', 't_001')
    const gtm = makeNeutralGtm() // mode: 'hybrid'

    const result = adaptPatterns([pattern], [tension], gtm)
    expect(result[0].archetype).toBe('narrative_distribution_mismatch')
  })
})

// ---------------------------------------------------------------------------
// analyseGtm — SPEC 005 D10: delivery_fit_tension must use specific conditions
//
// Current (broken): delivery_fit_tension = pricingSignals.length > 0 && deliverySignals.length > 0
// Correct (SPEC 005): only true when:
//   - pricing_model === "seat" AND onboarding_complexity === "high", OR
//   - pricing_model === "usage" AND implementation_required === true, OR
//   - roi_clarity === "low" AND pricing_model !== "custom"
//
// The "custom pricing + delivery signals" case exposes the current bug:
// current code returns true, spec requires false (no spec condition is satisfied).
// ---------------------------------------------------------------------------

function makeSignal(
  kind: Signal['kind'],
  statement: string,
  tags: string[] = [],
): Signal {
  return {
    signal_id: `sig_${Math.random().toString(36).slice(2, 8)}`,
    company_id: 'test_co',
    kind,
    title: statement.slice(0, 40),
    statement,
    claim_ids: [],
    evidence_ids: ['ev_001'],
    source_ids: [],
    inference_label: 'direct',
    confidence: 'medium',
    relevance: 'medium',
    novelty: 'medium',
    polarity: 'neutral',
    tags,
  }
}

// ---------------------------------------------------------------------------
// Adapter — Calibration 1: positioning_vs_customer_base now weights ET:2, NDM:2
//
// Previously: { enterprise_theatre: 3 } — dominated all other archetypes unilaterally.
// Now:        { enterprise_theatre: 2, narrative_distribution_mismatch: 2 }
//
// This means:
//   - Alone: ET=2, NDM=2 → tie → alphabetical ('e' < 'n') → ET wins
//   - With positioning_vs_market_fit (NDM:+2): ET=2, NDM=4 → NDM wins
//   - With ambition_vs_proof (ET:+2, NDM:+1): ET=4, NDM=3 → ET wins (Omnea-like)
// ---------------------------------------------------------------------------

describe('adapter — Calibration 1: positioning_vs_customer_base weight split ET:2 NDM:2', () => {
  it('alone: tie at 2-2, ET wins alphabetically (e < n)', () => {
    // Only positioning_vs_customer_base: ET=2, NDM=2 → tie → 'e' < 'n' → ET wins
    const tension = makeReportTension('t_001', 'positioning_vs_customer_base')
    const pattern = makeReportPattern('p_001', 't_001')
    const gtm = makeNeutralGtm()

    const result = adaptPatterns([pattern], [tension], gtm)
    expect(result[0].archetype).toBe('enterprise_theatre')
  })

  it('with positioning_vs_market_fit: NDM wins (ET=2, NDM=4)', () => {
    // positioning_vs_customer_base: ET=2, NDM=2
    // positioning_vs_market_fit: NDM=+2 → NDM=4
    // ET=2 loses to NDM=4 — this is the trigger-dev / form3 scenario after calibration
    const tension1 = makeReportTension('t_001', 'positioning_vs_customer_base')
    const tension2 = makeReportTension('t_002', 'positioning_vs_market_fit')
    const pattern = { ...makeReportPattern('p_001', 't_001'), tension_ids: ['t_001', 't_002'] }
    const gtm = makeNeutralGtm()

    const result = adaptPatterns([pattern], [tension1, tension2], gtm)
    expect(result[0].archetype).toBe('narrative_distribution_mismatch')
  })

  it('with ambition_vs_proof: ET wins decisively (ET=4, NDM=3) — Omnea scenario', () => {
    // positioning_vs_customer_base: ET=2, NDM=2
    // ambition_vs_proof: ET=+2, NDM=+1 → ET=4, NDM=3
    // ET wins — companies with both tensions still correctly classified as enterprise_theatre
    const tension1 = makeReportTension('t_001', 'positioning_vs_customer_base')
    const tension2 = makeReportTension('t_002', 'ambition_vs_proof')
    const pattern = { ...makeReportPattern('p_001', 't_001'), tension_ids: ['t_001', 't_002'] }
    const gtm = makeNeutralGtm()

    const result = adaptPatterns([pattern], [tension1, tension2], gtm)
    expect(result[0].archetype).toBe('enterprise_theatre')
  })
})

// ---------------------------------------------------------------------------
// Adapter — SPEC 005 D5: delivery_fit_tension → +1 to services_disguised_as_saas
//
// When pricing_delivery_fit.delivery_fit_tension === true, the adapter must add
// +1 to services_disguised_as_saas in the archetype scoring.
//
// Test design: two tensions create a 3-3 tie between services_disguised_as_saas
// and narrative_distribution_mismatch at baseline:
//   - claim_vs_reality: services +2, narrative +1
//   - vision_vs_execution: narrative +2, services +1
// At 3-3 tie, alphabetical tiebreaker picks narrative_distribution_mismatch ('n' < 's').
// With delivery_fit_tension=true adding +1: services reaches 4, narrative stays 3 → services wins.
// ---------------------------------------------------------------------------

describe('adapter — SPEC 005 D5: delivery_fit_tension → +1 to services_disguised_as_saas', () => {
  it('classifies as services_disguised_as_saas when delivery_fit_tension is true (breaks tie)', () => {
    // Base scores without boost: both at 3 → narrative wins alphabetically
    // With +1 boost: services at 4, narrative at 3 → services wins
    const tension1 = makeReportTension('t_001', 'claim_vs_reality')    // services +2, narrative +1
    const tension2 = makeReportTension('t_002', 'vision_vs_execution')  // narrative +2, services +1
    const pattern = { ...makeReportPattern('p_001', 't_001'), tension_ids: ['t_001', 't_002'] }
    const gtm: GTMAnalysis = {
      ...makeNeutralGtm(),
      pricing_delivery_fit: {
        pricing_model: 'seat',
        roi_clarity: 'unknown',
        delivery_fit_tension: true,
        rationale: '',
        evidence_refs: [],
      },
    }

    const result = adaptPatterns([pattern], [tension1, tension2], gtm)
    expect(result[0].archetype).toBe('services_disguised_as_saas')
  })

  it('classifies as narrative_distribution_mismatch when delivery_fit_tension is false (control)', () => {
    // Same tensions, same pattern, delivery_fit_tension=false → no +1 boost
    // 3-3 tie → alphabetical tiebreaker → narrative_distribution_mismatch wins
    const tension1 = makeReportTension('t_001', 'claim_vs_reality')
    const tension2 = makeReportTension('t_002', 'vision_vs_execution')
    const pattern = { ...makeReportPattern('p_001', 't_001'), tension_ids: ['t_001', 't_002'] }
    const gtm = makeNeutralGtm() // delivery_fit_tension: false

    const result = adaptPatterns([pattern], [tension1, tension2], gtm)
    expect(result[0].archetype).toBe('narrative_distribution_mismatch')
  })
})

// ---------------------------------------------------------------------------
// Adapter — Calibration 2: sales_motion.mode === 'plg' → +2 to DAWBM
//
// When sales_motion.mode === "plg", the adapter adds +2 to
// developer_adoption_without_buyer_motion — symmetric with the founder_led boost.
//
// Test design: use brand_vs_customer_language, which carries affinity only to
// narrative_distribution_mismatch (+1). No DAWBM affinity at baseline.
//   - Without PLG boost: NDM wins (1 > 0)
//   - With PLG boost (+2): DAWBM (2) beats NDM (1) → DAWBM wins
// ---------------------------------------------------------------------------

describe('adapter — Calibration 2: plg sales_motion → +2 to DAWBM', () => {
  it('classifies as developer_adoption_without_buyer_motion when sales_motion is plg with neutral tensions', () => {
    // brand_vs_customer_language → narrative_distribution_mismatch: 1 (no DAWBM affinity)
    // Without the plg boost: NDM wins (1 > 0)
    // With the +2 boost: DAWBM (2) beats NDM (1) → DAWBM wins
    const tension = makeReportTension('t_001', 'brand_vs_customer_language')
    const pattern = makeReportPattern('p_001', 't_001')
    const gtm: GTMAnalysis = {
      ...makeNeutralGtm(),
      sales_motion: { mode: 'plg', confidence: 'medium', rationale: '', evidence_refs: [] },
    }

    const result = adaptPatterns([pattern], [tension], gtm)
    expect(result[0].archetype).toBe('developer_adoption_without_buyer_motion')
  })

  it('does not boost DAWBM when sales_motion is not plg (control)', () => {
    // Same tension, mode is hybrid → no PLG boost → NDM wins
    const tension = makeReportTension('t_001', 'brand_vs_customer_language')
    const pattern = makeReportPattern('p_001', 't_001')
    const gtm = makeNeutralGtm() // mode: 'hybrid'

    const result = adaptPatterns([pattern], [tension], gtm)
    expect(result[0].archetype).toBe('narrative_distribution_mismatch')
  })
})

// ---------------------------------------------------------------------------
// Adapter — Calibration 3: distribution_architecture.primary_channel === 'product' → +2 to DAWBM
//
// A company whose primary distribution channel is the product itself is the
// defining characteristic of DAWBM (product-led distribution).
//
// Test design: use brand_vs_customer_language, which carries affinity only to
// narrative_distribution_mismatch (+1). sales_motion is hybrid (no PLG boost).
//   - Without product channel boost: NDM wins (1 > 0)
//   - With product channel boost (+2): DAWBM (2) beats NDM (1) → DAWBM wins
//
// For Trigger.dev: PLG boost (+2) + product channel boost (+2) → DAWBM=4 ties NDM=4,
// wins alphabetically ('d' < 'n').
// ---------------------------------------------------------------------------

describe('adapter — Calibration 3: primary_channel=product → +2 to DAWBM', () => {
  it('classifies as developer_adoption_without_buyer_motion when primary_channel is product with neutral tensions', () => {
    // brand_vs_customer_language → narrative_distribution_mismatch: 1 (no DAWBM affinity)
    // sales_motion is hybrid (no PLG boost)
    // With product channel +2 boost: DAWBM (2) beats NDM (1) → DAWBM wins
    const tension = makeReportTension('t_001', 'brand_vs_customer_language')
    const pattern = makeReportPattern('p_001', 't_001')
    const gtm: GTMAnalysis = {
      ...makeNeutralGtm(),
      distribution_architecture: {
        primary_channel: 'product',
        secondary_channels: [],
        fragility_score: 0,
        fragility_reasons: [],
        confidence: 'medium',
        evidence_refs: [],
      },
    }

    const result = adaptPatterns([pattern], [tension], gtm)
    expect(result[0].archetype).toBe('developer_adoption_without_buyer_motion')
  })

  it('does not boost DAWBM when primary_channel is not product (control)', () => {
    // Same tension, primary_channel is unknown → no product boost → NDM wins
    const tension = makeReportTension('t_001', 'brand_vs_customer_language')
    const pattern = makeReportPattern('p_001', 't_001')
    const gtm = makeNeutralGtm() // primary_channel: 'unknown'

    const result = adaptPatterns([pattern], [tension], gtm)
    expect(result[0].archetype).toBe('narrative_distribution_mismatch')
  })
})

// ---------------------------------------------------------------------------
// Adapter — Calibration 4: positioning_vs_market_fit now carries ET:+1
//
// Previously: { narrative_distribution_mismatch: 2 }
// Now:        { narrative_distribution_mismatch: 2, enterprise_theatre: 1 }
//
// Rationale: positioning_vs_market_fit describes the gap between company
// positioning and customer perception — a component of enterprise theatre when
// customers fail to perceive the enterprise-readiness the company claims.
//
// The change only affects classification when positioning_vs_market_fit
// co-occurs with ET-dominant tensions (positioning_vs_customer_base +
// ambition_vs_proof). Alone, ET:1 loses to NDM:2. The fix tips the
// 3-tension pattern (pvc + abp + pvm) into a tie (ET:5 = NDM:5),
// resolved alphabetically in favour of enterprise_theatre ('e' < 'n').
//
// Test design (Omnea case: 3 tensions):
//   tension: positioning_vs_customer_base → ET:2, NDM:2
//   tension: ambition_vs_proof → ET:2, NDM:1
//   tension: positioning_vs_market_fit → ET:1 (new), NDM:2
//   One pattern covering all 3:
//     Total: ET=5, NDM=5 → tie → 'e' < 'n' → enterprise_theatre wins
//
// Control (Form3-like: 2 tensions, no ambition_vs_proof):
//   tension: positioning_vs_customer_base → ET:2, NDM:2
//   tension: positioning_vs_market_fit → ET:1, NDM:2
//   Total: ET=3, NDM=4 → NDM wins (no change)
// ---------------------------------------------------------------------------

describe('adapter — Calibration 4: positioning_vs_market_fit carries ET:+1 (Omnea case)', () => {
  it('classifies as enterprise_theatre when pvc+abp+pvm tensions all present (3-tension ET pattern)', () => {
    // pvc: ET:2 NDM:2 | abp: ET:2 NDM:1 | pvm: ET:1 NDM:2
    // Total: ET=5, NDM=5 → tie → 'e' < 'n' → enterprise_theatre
    const tension1 = makeReportTension('t_001', 'positioning_vs_customer_base')
    const tension2 = makeReportTension('t_002', 'ambition_vs_proof')
    const tension3 = makeReportTension('t_003', 'positioning_vs_market_fit')
    const pattern = {
      ...makeReportPattern('p_001', 't_001'),
      tension_ids: ['t_001', 't_002', 't_003'],
    }
    const gtm = makeNeutralGtm()

    const result = adaptPatterns([pattern], [tension1, tension2, tension3], gtm)
    expect(result[0].archetype).toBe('enterprise_theatre')
  })

  it('classifies as narrative_distribution_mismatch when only pvc+pvm present (no ambition_vs_proof)', () => {
    // pvc: ET:2 NDM:2 | pvm: ET:1 NDM:2
    // Total: ET=3, NDM=4 → NDM wins (Form3-like, no change)
    const tension1 = makeReportTension('t_001', 'positioning_vs_customer_base')
    const tension2 = makeReportTension('t_002', 'positioning_vs_market_fit')
    const pattern = {
      ...makeReportPattern('p_001', 't_001'),
      tension_ids: ['t_001', 't_002'],
    }
    const gtm = makeNeutralGtm()

    const result = adaptPatterns([pattern], [tension1, tension2], gtm)
    expect(result[0].archetype).toBe('narrative_distribution_mismatch')
  })
})

describe('analyseGtm — SPEC 005 D10: delivery_fit_tension specificity', () => {
  it('is false when pricing is custom and delivery signals are present (condition 3 exempts custom)', () => {
    // Current code: both pricing and delivery signals exist → returns true (bug)
    // Correct: pricing_model = "custom"; condition 1 needs seat, condition 2 needs usage,
    // condition 3 needs roi_clarity = "low" which is "unknown" here → false
    const signals = [
      makeSignal('pricing', 'Enterprise — contact us for custom pricing'),
      makeSignal('operations', 'Full implementation assistance from our team', ['service_model']),
    ]
    const result = analyseGtm('test_co', signals)
    expect(result.pricing_delivery_fit.delivery_fit_tension).toBe(false)
  })

  it('is true when pricing is seat AND onboarding complexity is high', () => {
    // seat pricing + high onboarding (2 service delivery signals + 1 hiring service signal)
    const signals = [
      makeSignal('pricing', 'Pricing is 50 dollars per seat per month'),
      makeSignal('operations', 'Full implementation support from our team', ['service_model']),
      makeSignal('operations', 'Dedicated onboarding specialist assigned', ['consulting']),
      makeSignal('talent', 'Hiring implementation engineers to scale delivery', ['service_scaling']),
    ]
    const result = analyseGtm('test_co', signals)
    expect(result.pricing_delivery_fit.delivery_fit_tension).toBe(true)
  })

  it('is false when pricing is seat AND onboarding complexity is low', () => {
    // seat pricing but no service delivery signals → onboarding_complexity = "low"
    const signals = [
      makeSignal('pricing', 'Pricing is 50 dollars per seat per month'),
    ]
    const result = analyseGtm('test_co', signals)
    expect(result.pricing_delivery_fit.delivery_fit_tension).toBe(false)
  })
})
