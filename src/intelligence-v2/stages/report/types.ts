export type { Diagnosis, DiagnosisType } from '../../types/index.js'
export type { Mechanism } from '../../types/index.js'
export type { InterventionOpportunity } from '../../types/index.js'

// ---------------------------------------------------------------------------
// Report V2 types
// ---------------------------------------------------------------------------

export interface ReportSectionV2 {
  id: string
  title: string
  markdown: string
  evidence_refs: string[]
}

// Exactly three sections — the tuple enforces the structure constraint.
export type ReportSections = [ReportSectionV2, ReportSectionV2, ReportSectionV2]

export interface ReportV2 {
  report_id: string
  company_id: string
  generated_at: string
  diagnosis_id: string
  mechanism_ids: string[]
  intervention_id: string
  sections: ReportSections
  markdown: string
  evidence_refs: string[]
}

export interface ValidationError {
  check: string
  message: string
  details?: string
}

export interface WriteReportResult {
  report: ReportV2 | null
  markdown: string
  errors: ValidationError[]
}

// Parsed output from the LLM call
export interface ParsedSections {
  diagnosis_section: string
  mechanisms_section: string
  intervention_section: string
}
