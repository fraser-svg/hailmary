/**
 * Source record — Spec 002 §15 + Spec 003 Layer 1.
 * Describes the origin of evidence.
 */
export interface SourceRecord {
  source_id: string;
  url: string;
  source_type: string;
  title: string;
  publisher_or_owner: string;
  captured_at: string; // ISO 8601
  relevance_notes: string[];
}
