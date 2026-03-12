import { randomUUID } from 'node:crypto';

/** Generate a sequential source ID: src_001, src_002, etc. */
export function makeSourceId(n: number): string {
  return `src_${String(n).padStart(3, '0')}`;
}

/** Generate a sequential evidence ID: ev_001, ev_002, etc. */
export function makeEvidenceId(n: number): string {
  return `ev_${String(n).padStart(3, '0')}`;
}

/** Generate a run ID (UUID v4). */
export function makeRunId(): string {
  return randomUUID();
}

/** Slugify a company name for directory naming. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
