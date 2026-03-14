/**
 * Stage: Render Report
 *
 * The only stage in the intelligence-v2 pipeline that uses an LLM.
 * All prior stages are deterministic. This stage renders their output into prose.
 *
 * Input:  Diagnosis, Mechanism[], InterventionOpportunity
 * Output: WriteReportResult — { report, markdown, errors }
 *
 * Structure (exactly 3 sections, max 3 pages):
 *   1. The Diagnosis       — core structural finding
 *   2. Why This Happens    — mechanisms (2–3 causal forces)
 *   3. The Opportunity     — single intervention
 *
 * The LLM receives structured data and renders it as prose.
 * It does not reason. It does not invent. It renders.
 */

import type {
  Diagnosis,
  InterventionOpportunity,
  Mechanism,
  ReportSectionV2,
  ReportSections,
  ReportV2,
  WriteReportResult,
} from './types.js'
import { renderProse } from './writer.js'
import { validateReport } from './validation.js'

function unique(ids: string[]): string[] {
  return [...new Set(ids)]
}

let _reportCounter = 0

function nextReportId(): string {
  return `rptv2_${String(++_reportCounter).padStart(3, '0')}`
}

function assembleMarkdown(companyId: string, sections: ReportSections): string {
  const lines: string[] = []
  lines.push(`# GTM Diagnosis: ${companyId}`)
  lines.push('')
  for (const section of sections) {
    lines.push(`## ${section.title}`)
    lines.push('')
    lines.push(section.markdown.trim())
    lines.push('')
  }
  return lines.join('\n')
}

export async function renderReport(
  companyId: string,
  diagnosis: Diagnosis,
  mechanisms: Mechanism[],
  intervention: InterventionOpportunity,
): Promise<WriteReportResult> {
  _reportCounter = 0

  const allEvidenceRefs = unique([
    ...diagnosis.evidence_refs,
    ...mechanisms.flatMap(m => m.evidence_refs),
    ...intervention.evidence_refs,
  ])

  // LLM renders structured reasoning into prose
  let parsed: Awaited<ReturnType<typeof renderProse>>
  try {
    parsed = await renderProse(diagnosis, mechanisms, intervention)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      report: null,
      markdown: '',
      errors: [{ check: 'llm_call', message: `LLM prose rendering failed: ${message}` }],
    }
  }

  const sections: ReportSections = [
    {
      id: 'sec_diagnosis',
      title: 'The Diagnosis',
      markdown: parsed.diagnosis_section,
      evidence_refs: diagnosis.evidence_refs,
    },
    {
      id: 'sec_mechanisms',
      title: 'Why This Happens',
      markdown: parsed.mechanisms_section,
      evidence_refs: unique(mechanisms.flatMap(m => m.evidence_refs)),
    },
    {
      id: 'sec_intervention',
      title: 'The Opportunity',
      markdown: parsed.intervention_section,
      evidence_refs: intervention.evidence_refs,
    },
  ]

  const markdown = assembleMarkdown(companyId, sections)

  const report: ReportV2 = {
    report_id: nextReportId(),
    company_id: companyId,
    generated_at: new Date().toISOString(),
    diagnosis_id: diagnosis.id,
    mechanism_ids: mechanisms.map(m => m.id),
    intervention_id: intervention.id,
    sections,
    markdown,
    evidence_refs: allEvidenceRefs,
  }

  const errors = validateReport(report)

  return {
    report: errors.length === 0 ? report : null,
    markdown,
    errors,
  }
}
