// Report is the final rendered artifact: one diagnosis, 2–3 mechanisms,
// one intervention. All analytical content is referenced by ID.
// Prose sections are populated by the LLM write stage.

export interface ReportSection {
  id: string
  title: string
  body: string
}

export interface Report {
  report_id: string
  company_id: string
  generated_at: string              // ISO 8601

  // Structural references — all IDs trace to typed analytical objects
  diagnosis_id: string
  mechanism_ids: string[]           // length: 2–3
  intervention_id: string

  // Rendered prose sections — produced by the LLM write stage
  sections: ReportSection[]

  // Top-level evidence provenance for the full report
  evidence_refs: string[]
}
