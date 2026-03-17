/**
 * Shared utilities for the V3 memo module.
 */

/** Count words in a text string (whitespace-split, empty-filtered). */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}
