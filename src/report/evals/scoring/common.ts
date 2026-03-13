/**
 * Shared scoring utilities — markdown parsing, matching, and scoring.
 */

import { readFile } from 'node:fs/promises';
import type { ExpectationItem, StageExpectations, HypothesisExpectations } from '../types/fixture.js';
import type { StageScore, CategoryScore, ViolationScore, MatchDetail, ViolationDetail } from '../types/eval-result.js';

// ---------------------------------------------------------------------------
// Stage output — the shape each stage must produce for scoring
// ---------------------------------------------------------------------------

export interface StageOutputItem {
  title: string;
  body: string;
}

// ---------------------------------------------------------------------------
// Markdown parser
// ---------------------------------------------------------------------------

/** Parse a standard expected-*.md into StageExpectations. */
export function parseStageExpectations(markdown: string): StageExpectations {
  return {
    must_detect: parseSection(markdown, 'Must Detect'),
    nice_to_detect: parseSection(markdown, 'Nice to Detect'),
    must_avoid: parseSection(markdown, 'Must Avoid'),
  };
}

/** Parse expected-hypotheses.md into HypothesisExpectations. */
export function parseHypothesisExpectations(markdown: string): HypothesisExpectations {
  return {
    must_detect: parseSection(markdown, 'Must Detect'),
    acceptable_alternatives: parseSection(markdown, 'Acceptable Alternatives'),
    must_avoid: parseSection(markdown, 'Must Avoid'),
  };
}

/**
 * Extract items from a ## section. Each ### heading becomes an item.
 * Leading numbering (e.g. "1. ", "A. ") is stripped from titles.
 */
function parseSection(markdown: string, sectionName: string): ExpectationItem[] {
  const sectionRegex = new RegExp(`^## ${escapeRegex(sectionName)}\\s*$`, 'm');
  const match = sectionRegex.exec(markdown);
  if (!match) return [];

  const startIndex = match.index + match[0].length;

  // Slice to the next ## heading or end of file
  const remaining = markdown.slice(startIndex);
  const nextSection = /^## /m.exec(remaining);
  const sectionContent = nextSection
    ? remaining.slice(0, nextSection.index).trim()
    : remaining.trim();

  if (!sectionContent) return [];

  // Collect ### headings with their positions
  const headingRegex = /^### (.+)$/gm;
  const headings: { title: string; bodyStart: number }[] = [];
  let headingMatch;

  while ((headingMatch = headingRegex.exec(sectionContent)) !== null) {
    const rawTitle = headingMatch[1].trim();
    const title = rawTitle.replace(/^[0-9A-Za-z]+\.\s*/, '');
    headings.push({
      title,
      bodyStart: headingMatch.index + headingMatch[0].length,
    });
  }

  // Extract body text between consecutive headings
  const items: ExpectationItem[] = [];
  for (let i = 0; i < headings.length; i++) {
    const bodyEnd = i + 1 < headings.length
      ? headings[i + 1].bodyStart - headings[i + 1].title.length - 5 // rough offset for "### X"
      : sectionContent.length;

    // Safer: find the start of the next ### line
    const safeEnd = i + 1 < headings.length
      ? sectionContent.lastIndexOf('\n###', headings[i + 1].bodyStart)
      : sectionContent.length;

    const body = sectionContent.slice(headings[i].bodyStart, safeEnd > headings[i].bodyStart ? safeEnd : bodyEnd).trim();
    items.push({ title: headings[i].title, body });
  }

  return items;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Text matching
// ---------------------------------------------------------------------------

/** Normalize text for comparison: lowercase, collapse whitespace, drop punctuation. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if a stage output item matches an expected item.
 * Requires >=60% of significant keywords (3+ chars) from the expected title
 * to appear in the actual item's title + body.
 */
export function itemMatches(expected: ExpectationItem, actual: StageOutputItem): boolean {
  const expectedNorm = normalize(expected.title);
  const actualFull = normalize(`${actual.title} ${actual.body}`);

  const keywords = expectedNorm.split(' ').filter(w => w.length >= 3);
  if (keywords.length === 0) return false;

  const threshold = Math.max(1, Math.ceil(keywords.length * 0.6));
  const matched = keywords.filter(kw => actualFull.includes(kw)).length;

  return matched >= threshold;
}

/**
 * Check if a stage output violates a must-avoid rule.
 * Extracts quoted example phrases from the rule body and checks
 * whether the actual output contains them.
 */
export function violationMatches(rule: ExpectationItem, actual: StageOutputItem): boolean {
  const actualFull = normalize(`${actual.title} ${actual.body}`);

  // Extract "quoted phrases" from the rule body
  const quotes = rule.body.match(/"([^"]+)"/g) ?? [];
  for (const rawQuote of quotes) {
    const quote = normalize(rawQuote.replace(/"/g, ''));
    const keywords = quote.split(' ').filter(w => w.length >= 3);
    if (keywords.length === 0) continue;

    const threshold = Math.max(1, Math.ceil(keywords.length * 0.6));
    const matched = keywords.filter(kw => actualFull.includes(kw)).length;
    if (matched >= threshold) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** Score expected items against actual stage outputs. */
export function scoreCategory(
  expected: ExpectationItem[],
  actual: StageOutputItem[],
): CategoryScore {
  const details: MatchDetail[] = expected.map(exp => {
    const match = actual.find(act => itemMatches(exp, act));
    return {
      expected_title: exp.title,
      matched: !!match,
      matched_to: match?.title,
    };
  });

  return {
    expected: expected.length,
    matched: details.filter(d => d.matched).length,
    details,
  };
}

/** Check must-avoid rules against actual outputs. */
export function scoreViolations(
  avoidRules: ExpectationItem[],
  actual: StageOutputItem[],
): ViolationScore {
  const details: ViolationDetail[] = avoidRules.map(rule => {
    const violator = actual.find(act => violationMatches(rule, act));
    return {
      rule: rule.title,
      violated: !!violator,
      violated_by: violator?.title,
    };
  });

  return {
    checked: avoidRules.length,
    violations: details.filter(d => d.violated).length,
    details,
  };
}

/**
 * Build a full StageScore. Pass requires all must-detect matched + zero violations.
 */
export function scoreStage(
  stageName: string,
  expectations: StageExpectations | HypothesisExpectations,
  actual: StageOutputItem[],
): StageScore {
  const secondary = 'nice_to_detect' in expectations
    ? expectations.nice_to_detect
    : expectations.acceptable_alternatives;

  const mustDetect = scoreCategory(expectations.must_detect, actual);
  const niceToDetect = scoreCategory(secondary, actual);
  const mustAvoid = scoreViolations(expectations.must_avoid, actual);

  const passed = mustDetect.matched === mustDetect.expected && mustAvoid.violations === 0;

  return {
    stage: stageName,
    must_detect: mustDetect,
    nice_to_detect: niceToDetect,
    must_avoid: mustAvoid,
    passed,
  };
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

export async function loadText(path: string): Promise<string> {
  return readFile(path, 'utf-8');
}
