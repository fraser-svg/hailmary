/**
 * Intelligence V2 — Report Validation Tests
 *
 * Tests the hard budget and structural gates enforced by validateReport().
 * These gates exist to ensure the output fits on ≤3 pages of physical mail.
 *
 * Test pattern: construct minimal ReportV2 objects that fail specific checks,
 * assert the correct ValidationError is returned.
 */

import { describe, it, expect } from 'vitest'
import { validateReport } from '../intelligence-v2/stages/report/validation.js'
import type { ReportV2, ReportSectionV2 } from '../intelligence-v2/stages/report/types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function words(n: number): string {
  return Array(n).fill('word').join(' ')
}

function makeSection(
  title: ReportSectionV2['title'],
  content: string,
): ReportSectionV2 {
  return {
    id: `sec_${title.toLowerCase().replace(/\s+/g, '_')}`,
    title,
    markdown: content,
    evidence_refs: ['ev_001'],
  }
}

function makeValidReport(overrides: Partial<ReportV2> = {}): ReportV2 {
  const sections: ReportSectionV2[] = [
    makeSection('The Diagnosis', words(150)),
    makeSection('Why This Happens', words(150)),
    makeSection('The Opportunity', words(100)),
  ]
  const markdown = sections.map(s => `## ${s.title}\n\n${s.markdown}`).join('\n\n')
  return {
    report_id: 'rptv2_001',
    company_id: 'test_co',
    generated_at: new Date().toISOString(),
    diagnosis_id: 'diag_001',
    mechanism_ids: ['mech_001', 'mech_002'],
    intervention_id: 'intv_001',
    sections,
    markdown,
    evidence_refs: ['ev_001'],
    ...overrides,
  }
}

function withMarkdown(report: ReportV2): ReportV2 {
  const markdown = report.sections.map(s => `## ${s.title}\n\n${s.markdown}`).join('\n\n')
  return { ...report, markdown }
}

// ---------------------------------------------------------------------------
// Valid report — should produce 0 errors
// ---------------------------------------------------------------------------

describe('validateReport — valid report', () => {
  it('returns no errors for a valid report', () => {
    const errors = validateReport(makeValidReport())
    expect(errors).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Section count gate
// ---------------------------------------------------------------------------

describe('validateReport — section count', () => {
  it('errors when report has fewer than 3 sections', () => {
    const report = makeValidReport()
    report.sections = report.sections.slice(0, 2)
    report.markdown = report.sections.map(s => s.markdown).join('\n')
    const errors = validateReport(report)
    expect(errors.some(e => e.check === 'section_count')).toBe(true)
  })

  it('errors when report has more than 3 sections', () => {
    const report = makeValidReport()
    report.sections = [
      ...report.sections,
      makeSection('The Diagnosis', words(50)), // duplicate, not matching title check
    ]
    report.markdown = report.sections.map(s => s.markdown).join('\n')
    const errors = validateReport(report)
    expect(errors.some(e => e.check === 'section_count')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Required section titles gate
// ---------------------------------------------------------------------------

describe('validateReport — required section titles', () => {
  it('errors when "The Diagnosis" section is missing', () => {
    const report = makeValidReport()
    report.sections[0] = makeSection('Why This Happens', words(100)) // duplicate, replaces diagnosis
    report.sections[1] = makeSection('Why This Happens', words(100))
    report.markdown = report.sections.map(s => s.markdown).join('\n')
    const errors = validateReport(report)
    expect(errors.some(e => e.check === 'required_sections')).toBe(true)
  })

  it('errors when "The Opportunity" section is missing', () => {
    const report = makeValidReport()
    report.sections[2] = { ...report.sections[0], title: 'The Diagnosis' }
    const errors = validateReport(report)
    expect(errors.some(e => e.check === 'required_sections')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Non-empty sections gate
// ---------------------------------------------------------------------------

describe('validateReport — non-empty sections', () => {
  it('errors when a section has empty content', () => {
    const report = makeValidReport()
    report.sections[1] = makeSection('Why This Happens', '')
    report.markdown = report.sections.map(s => s.markdown).join('\n')
    const errors = validateReport(report)
    expect(errors.some(e => e.check === 'non_empty_sections')).toBe(true)
  })

  it('errors when a section has only whitespace', () => {
    const report = makeValidReport()
    report.sections[1] = makeSection('Why This Happens', '   \n  ')
    report.markdown = report.sections.map(s => s.markdown).join('\n')
    const errors = validateReport(report)
    expect(errors.some(e => e.check === 'non_empty_sections')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Section word limit gate (350 words per section)
// ---------------------------------------------------------------------------

describe('validateReport — section word limit (350 words)', () => {
  it('errors when a section exceeds 350 words', () => {
    const report = makeValidReport()
    report.sections[0] = makeSection('The Diagnosis', words(351))
    report.markdown = report.sections.map(s => `## ${s.title}\n\n${s.markdown}`).join('\n\n')
    const errors = validateReport(report)
    expect(errors.some(e => e.check === 'section_word_limit')).toBe(true)
  })

  it('passes when all sections are exactly at the limit (350 words)', () => {
    const report = makeValidReport()
    report.sections = [
      makeSection('The Diagnosis', words(300)),
      makeSection('Why This Happens', words(300)),
      makeSection('The Opportunity', words(200)),
    ]
    report.markdown = report.sections.map(s => `## ${s.title}\n\n${s.markdown}`).join('\n\n')
    const errors = validateReport(report)
    expect(errors.filter(e => e.check === 'section_word_limit')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Total word limit gate (900 words)
// ---------------------------------------------------------------------------

describe('validateReport — total word limit (900 words)', () => {
  it('errors when total words exceed 900', () => {
    const report = makeValidReport()
    // 3 sections of 310 words = 930 words total (each under 350 but total over 900)
    report.sections = [
      makeSection('The Diagnosis', words(310)),
      makeSection('Why This Happens', words(310)),
      makeSection('The Opportunity', words(310)),
    ]
    report.markdown = report.sections.map(s => `## ${s.title}\n\n${s.markdown}`).join('\n\n')
    const errors = validateReport(report)
    expect(errors.some(e => e.check === 'total_word_limit')).toBe(true)
  })

  it('passes when total is exactly at the limit', () => {
    const report = makeValidReport()
    report.sections = [
      makeSection('The Diagnosis', words(300)),
      makeSection('Why This Happens', words(300)),
      makeSection('The Opportunity', words(300)),
    ]
    report.markdown = report.sections.map(s => `## ${s.title}\n\n${s.markdown}`).join('\n\n')
    const errors = validateReport(report)
    expect(errors.filter(e => e.check === 'total_word_limit')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Em dash gate
// ---------------------------------------------------------------------------

describe('validateReport — no em dashes', () => {
  it('errors when em dash is present in any section', () => {
    const report = makeValidReport()
    report.markdown = report.sections.map(s => s.markdown).join('\n') + ' this is a test\u2014em dash'
    const errors = validateReport(report)
    expect(errors.some(e => e.check === 'no_em_dashes')).toBe(true)
  })

  it('passes when hyphens are used instead of em dashes', () => {
    const report = makeValidReport()
    report.markdown = report.sections.map(s => s.markdown).join('\n') + ' this is a test - hyphen'
    const errors = validateReport(report)
    expect(errors.some(e => e.check === 'no_em_dashes')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Banned phrases gate
// ---------------------------------------------------------------------------

describe('validateReport — banned phrases', () => {
  it('errors when "well positioned" appears in the report', () => {
    const report = makeValidReport()
    report.markdown += ' They are well positioned in the market.'
    const errors = validateReport(report)
    expect(errors.some(e => e.check === 'banned_phrases')).toBe(true)
  })

  it('errors when "actionable insights" appears in the report', () => {
    const report = makeValidReport()
    report.markdown += ' We provide actionable insights for growth.'
    const errors = validateReport(report)
    expect(errors.some(e => e.check === 'banned_phrases')).toBe(true)
  })

  it('errors when "disruptive" appears in the report', () => {
    const report = makeValidReport()
    report.markdown += ' This is a disruptive approach.'
    const errors = validateReport(report)
    expect(errors.some(e => e.check === 'banned_phrases')).toBe(true)
  })

  it('is case-insensitive for banned phrase detection', () => {
    const report = makeValidReport()
    report.markdown += ' They are Well Positioned for success.'
    const errors = validateReport(report)
    expect(errors.some(e => e.check === 'banned_phrases')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Diagnosis ID gate
// ---------------------------------------------------------------------------

describe('validateReport — diagnosis_id required', () => {
  it('errors when diagnosis_id is empty string', () => {
    const report = makeValidReport({ diagnosis_id: '' })
    const errors = validateReport(report)
    expect(errors.some(e => e.check === 'diagnosis_id_present')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Evidence refs gate
// ---------------------------------------------------------------------------

describe('validateReport — evidence_refs required', () => {
  it('errors when evidence_refs is empty', () => {
    const report = makeValidReport({ evidence_refs: [] })
    const errors = validateReport(report)
    expect(errors.some(e => e.check === 'evidence_refs_populated')).toBe(true)
  })
})
