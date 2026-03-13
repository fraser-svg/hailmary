/**
 * Output manager for batch analysis runs.
 *
 * Handles directory creation, slugification, and file writing
 * for per-company report output.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Slugify
// ---------------------------------------------------------------------------

/** Convert a company name to a filesystem-safe slug. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// Directory management
// ---------------------------------------------------------------------------

const ROOT = resolve(process.cwd(), 'reports');

/** Resolve the output directory for a company slug. */
export function companyDir(slug: string): string {
  return resolve(ROOT, slug);
}

/** Ensure the output directory exists. */
export async function ensureDir(slug: string): Promise<string> {
  const dir = companyDir(slug);
  await mkdir(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// File writers
// ---------------------------------------------------------------------------

/** Write a JSON file to the company output directory. */
export async function writeJson(
  slug: string,
  filename: string,
  data: unknown,
): Promise<void> {
  const dir = await ensureDir(slug);
  const path = resolve(dir, filename);
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/** Write a markdown file to the company output directory. */
export async function writeMarkdown(
  slug: string,
  filename: string,
  content: string,
): Promise<void> {
  const dir = await ensureDir(slug);
  const path = resolve(dir, filename);
  await writeFile(path, content + '\n', 'utf-8');
}
