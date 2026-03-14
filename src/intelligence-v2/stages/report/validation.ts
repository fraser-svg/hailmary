/**
 * Report V2 — Post-generation validation
 *
 * Runs after the LLM has produced prose. Checks structural and content rules.
 * Validation errors cause the report to be returned as null — the markdown
 * is still returned so the caller can inspect what went wrong.
 */

import type { ReportV2, ValidationError } from './types.js'
import { BANNED_PHRASES } from './prompt.js'

const MAX_WORDS_PER_SECTION = 500
const MAX_TOTAL_WORDS = 1500
const REQUIRED_SECTION_TITLES = ['The Diagnosis', 'Why This Happens', 'The Opportunity']

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length
}

export function validateReport(report: ReportV2): ValidationError[] {
  const errors: ValidationError[] = []

  // Check 1: Exactly 3 sections with correct titles
  if (report.sections.length !== 3) {
    errors.push({
      check: 'section_count',
      message: `Expected 3 sections, got ${report.sections.length}`,
    })
  }

  for (const required of REQUIRED_SECTION_TITLES) {
    if (!report.sections.some(s => s.title === required)) {
      errors.push({
        check: 'required_sections',
        message: `Missing required section: "${required}"`,
      })
    }
  }

  // Check 2: No empty sections
  for (const section of report.sections) {
    if (section.markdown.trim().length === 0) {
      errors.push({
        check: 'non_empty_sections',
        message: `Section "${section.title}" has empty content`,
      })
    }
  }

  // Check 3: Section word limits (500 words max each)
  for (const section of report.sections) {
    const words = countWords(section.markdown)
    if (words > MAX_WORDS_PER_SECTION) {
      errors.push({
        check: 'section_word_limit',
        message: `Section "${section.title}" exceeds ${MAX_WORDS_PER_SECTION} words (${words} words)`,
      })
    }
  }

  // Check 4: Total word limit (~3 pages)
  const totalWords = report.sections.reduce((n, s) => n + countWords(s.markdown), 0)
  if (totalWords > MAX_TOTAL_WORDS) {
    errors.push({
      check: 'total_word_limit',
      message: `Report exceeds ${MAX_TOTAL_WORDS} total words (${totalWords} words)`,
    })
  }

  // Check 5: No em dashes
  const fullMarkdown = report.markdown
  if (fullMarkdown.includes('\u2014')) {
    errors.push({
      check: 'no_em_dashes',
      message: 'Em dash found in report output',
      details: 'Use commas, semicolons, or full stops instead',
    })
  }

  // Check 6: Banned phrases
  const lowerMarkdown = fullMarkdown.toLowerCase()
  for (const phrase of BANNED_PHRASES) {
    if (lowerMarkdown.includes(phrase.toLowerCase())) {
      errors.push({
        check: 'banned_phrases',
        message: `Banned phrase found: "${phrase}"`,
      })
    }
  }

  // Check 7: Diagnosis ID present on the report
  if (!report.diagnosis_id) {
    errors.push({
      check: 'diagnosis_id_present',
      message: 'Report is missing diagnosis_id',
    })
  }

  // Check 8: Evidence refs populated
  if (report.evidence_refs.length === 0) {
    errors.push({
      check: 'evidence_refs_populated',
      message: 'Report has no evidence_refs — traceability chain is broken',
    })
  }

  return errors
}
