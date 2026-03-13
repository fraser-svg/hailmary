/**
 * Stage 8: Write Report
 *
 * Converts the structured report plan into a human-readable strategic report.
 * The writer expresses existing analytical insights clearly and precisely.
 * It must not generate new insights or reinterpret evidence.
 *
 * Architecture: hybrid deterministic + LLM.
 *   - Deterministic: section input assembly, lineage resolution, validation
 *   - LLM adapter: prose generation (V1 uses template-based placeholder)
 *
 * V1: Deterministic template-based prose. No LLM calls.
 */

import type { Signal } from './extract-signals.js';
import type { Tension } from './detect-tensions.js';
import type { Pattern } from './detect-patterns.js';
import type { Hypothesis } from './generate-hypotheses.js';
import type { Implication } from './generate-implications.js';
import type { ReportPlan, SectionPlan } from './plan-report.js';
import type { Confidence } from '../../types/evidence.js';

// ---------------------------------------------------------------------------
// Report types
// ---------------------------------------------------------------------------

export interface ReportSection {
  section_id: string;
  title: string;
  markdown: string;
  hypothesis_ids: string[];
  pattern_ids: string[];
  tension_ids: string[];
  signal_ids: string[];
  evidence_ids: string[];
  source_ids: string[];
}

export interface Report {
  report_id: string;
  company_id: string;
  generated_at: string;
  plan: ReportPlan;
  sections: ReportSection[];
  summary: string;
}

export interface ValidationError {
  check: string;
  message: string;
  details?: string;
}

export interface WriteReportResult {
  report: Report | null;
  markdown: string;
  errors: ValidationError[];
}

// ---------------------------------------------------------------------------
// Section input packs
// ---------------------------------------------------------------------------

interface SectionInputPack {
  sectionPlan: SectionPlan;
  hypotheses: Hypothesis[];
  implications: Implication[];
  patterns: Pattern[];
  tensions: Tension[];
  signals: Signal[];
}

/**
 * Assemble the input pack for each section. Maps section purpose to
 * the relevant analytical objects from upstream stages.
 */
function assembleSectionInputs(
  plan: ReportPlan,
  allImplications: Implication[],
  allHypotheses: Hypothesis[],
  allPatterns: Pattern[],
  allTensions: Tension[],
  allSignals: Signal[],
): SectionInputPack[] {
  // Build lookup maps
  const hypMap = new Map(allHypotheses.map(h => [h.hypothesis_id, h]));
  const impMap = new Map(allImplications.map(i => [i.implication_id, i]));

  // Partition hypotheses
  const surviving = allHypotheses.filter(h => h.status === 'survives');
  const weak = allHypotheses.filter(h => h.status === 'weak');

  return plan.section_plan.map(sp => {
    // Resolve hypotheses and implications assigned to this section
    const sectionHyps = sp.hypothesis_ids
      .map(id => hypMap.get(id))
      .filter((h): h is Hypothesis => h != null);
    const sectionImps = sp.implication_ids
      .map(id => impMap.get(id))
      .filter((i): i is Implication => i != null);

    switch (sp.section_id) {
      case 'sec_01': // Executive Overview -- uses primary hyps + top implications for context
        return {
          sectionPlan: sp,
          hypotheses: plan.primary_hypothesis_ids.map(id => hypMap.get(id)).filter((h): h is Hypothesis => h != null),
          implications: plan.implication_ids.slice(0, 3).map(id => impMap.get(id)).filter((i): i is Implication => i != null),
          patterns: allPatterns,
          tensions: [],
          signals: [],
        };

      case 'sec_02': // What the Evidence Shows -- signals and patterns
        return {
          sectionPlan: sp,
          hypotheses: [],
          implications: [],
          patterns: allPatterns,
          tensions: [],
          signals: allSignals,
        };

      case 'sec_03': // Where the Tensions Are
        return {
          sectionPlan: sp,
          hypotheses: [],
          implications: [],
          patterns: [],
          tensions: allTensions,
          signals: [],
        };

      case 'sec_04': // What May Really Be Happening -- surviving hypotheses
        return {
          sectionPlan: sp,
          hypotheses: sectionHyps.length > 0 ? sectionHyps : surviving,
          implications: [],
          patterns: allPatterns,
          tensions: [],
          signals: [],
        };

      case 'sec_05': // Strategic Implications
        return {
          sectionPlan: sp,
          hypotheses: [],
          implications: sectionImps.length > 0 ? sectionImps : allImplications.slice(0, 8),
          patterns: [],
          tensions: [],
          signals: [],
        };

      case 'sec_06': // What Remains Uncertain -- weak hypotheses
        return {
          sectionPlan: sp,
          hypotheses: sectionHyps.length > 0 ? sectionHyps : weak,
          implications: [],
          patterns: [],
          tensions: [],
          signals: [],
        };

      default:
        return {
          sectionPlan: sp,
          hypotheses: sectionHyps,
          implications: sectionImps,
          patterns: [],
          tensions: [],
          signals: [],
        };
    }
  });
}

// ---------------------------------------------------------------------------
// Lineage resolution
// ---------------------------------------------------------------------------

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

/** Collect full lineage IDs from the analytical objects in a section. */
function resolveLineage(pack: SectionInputPack): {
  hypothesis_ids: string[];
  pattern_ids: string[];
  tension_ids: string[];
  signal_ids: string[];
  evidence_ids: string[];
  source_ids: string[];
} {
  // Implications reference a parent hypothesis_id; pull that into lineage
  const impHypIds = pack.implications.map(i => i.hypothesis_id);

  const hypothesis_ids = unique([
    ...pack.hypotheses.map(h => h.hypothesis_id),
    ...impHypIds,
  ]);
  const pattern_ids = unique([
    ...pack.patterns.map(p => p.pattern_id),
    ...pack.hypotheses.flatMap(h => h.pattern_ids),
  ]);
  const tension_ids = unique([
    ...pack.tensions.map(t => t.tension_id),
    ...pack.hypotheses.flatMap(h => h.tension_ids),
    ...pack.patterns.flatMap(p => p.tension_ids),
  ]);
  const signal_ids = unique([
    ...pack.signals.map(s => s.signal_id),
    ...pack.hypotheses.flatMap(h => h.signal_ids),
    ...pack.patterns.flatMap(p => p.signal_ids),
    ...pack.tensions.flatMap(t => t.signal_ids),
  ]);
  const evidence_ids = unique([
    ...pack.hypotheses.flatMap(h => h.evidence_ids),
    ...pack.implications.flatMap(i => i.evidence_ids),
    ...pack.patterns.flatMap(p => p.evidence_ids),
    ...pack.tensions.flatMap(t => t.evidence_ids),
    ...pack.signals.flatMap(s => s.evidence_ids),
  ]);
  const source_ids = unique([
    ...pack.hypotheses.flatMap(h => h.source_ids),
    ...pack.implications.flatMap(i => i.source_ids),
    ...pack.patterns.flatMap(p => p.source_ids),
    ...pack.tensions.flatMap(t => t.source_ids),
    ...pack.signals.flatMap(s => s.source_ids),
  ]);

  return { hypothesis_ids, pattern_ids, tension_ids, signal_ids, evidence_ids, source_ids };
}

// ---------------------------------------------------------------------------
// Text sanitisation
// ---------------------------------------------------------------------------

/** Replace em dashes with comma-separated clauses per style rules. */
function sanitiseText(text: string): string {
  return text.replace(/\u2014/g, ',');
}

// ---------------------------------------------------------------------------
// Confidence language
// ---------------------------------------------------------------------------

function confidencePhrase(confidence: Confidence): string {
  switch (confidence) {
    case 'high': return 'The evidence strongly suggests';
    case 'medium': return 'There are signs that';
    case 'low': return 'This may indicate';
  }
}

function confidenceQualifier(confidence: Confidence): string {
  switch (confidence) {
    case 'high': return 'consistently';
    case 'medium': return 'in several instances';
    case 'low': return 'in limited observations';
  }
}

// ---------------------------------------------------------------------------
// Writer adapter (V1: deterministic template-based prose)
// ---------------------------------------------------------------------------

/**
 * Generate markdown for the Executive Overview section.
 * Summarises core thesis, key findings, and critical implications.
 */
function generateExecutiveOverview(
  plan: ReportPlan,
  pack: SectionInputPack,
): string {
  const lines: string[] = [];

  // Core thesis
  lines.push(plan.core_thesis);
  lines.push('');

  // Key findings
  if (plan.key_findings.length > 0) {
    lines.push('The analysis identifies several key observations:');
    lines.push('');
    for (const finding of plan.key_findings) {
      lines.push(`- ${finding}`);
    }
    lines.push('');
  }

  // Top implications summary
  if (pack.implications.length > 0) {
    const topImp = pack.implications[0];
    lines.push(
      `${confidencePhrase(topImp.confidence)} ${topImp.statement.split(/\.\s/)[0].toLowerCase().replace(/\.+$/, '')}.`
    );
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate markdown for the Evidence section.
 * Presents observable signals and structural patterns.
 */
function generateEvidenceSection(pack: SectionInputPack): string {
  const lines: string[] = [];

  // Group signals by kind for structured presentation
  const kindGroups = new Map<string, typeof pack.signals>();
  for (const sig of pack.signals) {
    const existing = kindGroups.get(sig.kind) ?? [];
    existing.push(sig);
    kindGroups.set(sig.kind, existing);
  }

  // Present top signals by relevance
  const topSignals = [...pack.signals]
    .sort((a, b) => {
      const rank: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };
      return rank[b.relevance] - rank[a.relevance];
    })
    .slice(0, 8);

  if (topSignals.length > 0) {
    for (const sig of topSignals) {
      lines.push(`**${sig.title}.** ${sig.statement}`);
      lines.push('');
    }
  }

  // Patterns
  if (pack.patterns.length > 0) {
    lines.push('Several structural patterns emerge from these observations:');
    lines.push('');
    for (const pat of pack.patterns) {
      lines.push(`**${pat.title}.** ${pat.summary}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Generate markdown for the Tensions section.
 * Describes structural contradictions and misalignments.
 */
function generateTensionsSection(pack: SectionInputPack): string {
  const lines: string[] = [];

  // Sort by severity
  const sorted = [...pack.tensions].sort((a, b) => {
    const rank: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };
    return rank[b.severity] - rank[a.severity];
  });

  for (const tension of sorted) {
    lines.push(`**${tension.title}.** ${tension.statement}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate markdown for the Hypotheses section.
 * Presents surviving hypotheses with appropriate confidence language.
 */
function generateHypothesesSection(pack: SectionInputPack): string {
  const lines: string[] = [];

  // Separate primary from supporting based on confidence/severity ranking
  const sorted = [...pack.hypotheses].sort((a, b) => {
    const rank: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };
    return (rank[b.confidence] * 3 + rank[b.severity] * 2) -
           (rank[a.confidence] * 3 + rank[a.severity] * 2);
  });

  for (const hyp of sorted) {
    lines.push(`**${hyp.title}.** ${confidencePhrase(hyp.confidence)} ${hyp.statement.charAt(0).toLowerCase()}${hyp.statement.slice(1)}`);
    lines.push('');

    // Strongest support points if available
    if (hyp.strongest_support && hyp.strongest_support.length > 0) {
      lines.push(`This is supported ${confidenceQualifier(hyp.confidence)} by the following:`);
      lines.push('');
      for (const support of hyp.strongest_support.slice(0, 3)) {
        lines.push(`- ${support}`);
      }
      lines.push('');
    }

    // Residual uncertainty
    if (hyp.residual_uncertainty) {
      lines.push(`However, ${hyp.residual_uncertainty.charAt(0).toLowerCase()}${hyp.residual_uncertainty.slice(1)}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Generate markdown for the Implications section.
 * Translates hypotheses into strategic consequences.
 */
function generateImplicationsSection(pack: SectionInputPack): string {
  const lines: string[] = [];

  // Sort by impact then urgency
  const sorted = [...pack.implications].sort((a, b) => {
    const rank: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };
    return (rank[b.impact] * 3 + rank[b.urgency] * 2) -
           (rank[a.impact] * 3 + rank[a.urgency] * 2);
  });

  for (const imp of sorted) {
    lines.push(`**${imp.title}.** ${imp.statement}`);
    lines.push('');

    if (imp.key_questions.length > 0) {
      lines.push('Key questions:');
      lines.push('');
      for (const q of imp.key_questions.slice(0, 3)) {
        lines.push(`- ${q}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Generate markdown for the Uncertainty section.
 * Acknowledges weak hypotheses and evidence gaps.
 */
function generateUncertaintySection(pack: SectionInputPack): string {
  const lines: string[] = [];

  if (pack.hypotheses.length === 0) {
    lines.push('All hypotheses generated by the analysis survived stress testing.');
    lines.push('No major areas of analytical uncertainty were identified.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('The following hypotheses did not meet the threshold for confident inclusion in the analysis. They remain plausible but lack sufficient evidence.');
  lines.push('');

  for (const hyp of pack.hypotheses) {
    lines.push(`**${hyp.title}.** This may indicate ${hyp.statement.charAt(0).toLowerCase()}${hyp.statement.slice(1)}`);
    lines.push('');

    if (hyp.missing_evidence && hyp.missing_evidence.length > 0) {
      lines.push('Evidence that would strengthen or refute this:');
      lines.push('');
      for (const missing of hyp.missing_evidence.slice(0, 3)) {
        lines.push(`- ${missing}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Generate section markdown using the appropriate template.
 * V1: deterministic template-based generation.
 * Future: replace with LLM adapter.
 */
function generateSectionMarkdown(
  sectionId: string,
  plan: ReportPlan,
  pack: SectionInputPack,
): string {
  let raw: string;
  switch (sectionId) {
    case 'sec_01': raw = generateExecutiveOverview(plan, pack); break;
    case 'sec_02': raw = generateEvidenceSection(pack); break;
    case 'sec_03': raw = generateTensionsSection(pack); break;
    case 'sec_04': raw = generateHypothesesSection(pack); break;
    case 'sec_05': raw = generateImplicationsSection(pack); break;
    case 'sec_06': raw = generateUncertaintySection(pack); break;
    default: raw = ''; break;
  }
  return sanitiseText(raw);
}

/**
 * Generate the executive summary from the report plan.
 * V1: deterministic synthesis from plan fields.
 * Future: replace with LLM adapter.
 */
function generateExecutiveSummary(plan: ReportPlan): string {
  const parts: string[] = [];
  parts.push(plan.core_thesis);

  if (plan.key_findings.length > 0) {
    parts.push(`The analysis surfaces ${plan.key_findings.length} key findings.`);
  }

  const sectionCount = plan.section_plan.length;
  parts.push(`This report is structured in ${sectionCount} sections, progressing from observable evidence through tension analysis and hypothesis formation to strategic implications.`);

  return sanitiseText(parts.join(' '));
}

// ---------------------------------------------------------------------------
// Post-generation validation
// ---------------------------------------------------------------------------

const REQUIRED_SECTION_TITLES = [
  'Executive Overview',
  'What the Evidence Shows',
  'Where the Tensions Are',
  'What May Really Be Happening',
  'Strategic Implications',
  'What Remains Uncertain',
];

const BANNED_PHRASES = [
  'well positioned',
  'robust value proposition',
  'dynamic market landscape',
  'innovative solution',
  'leveraging synergies',
  'industry leading',
  'cutting edge',
  'best-in-class',
  'strong traction',
];

function validateReport(
  report: Report,
  allHypotheses: Hypothesis[],
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check 1: Required section titles exist
  const sectionTitles = report.sections.map(s => s.title);
  for (const required of REQUIRED_SECTION_TITLES) {
    if (!sectionTitles.includes(required)) {
      errors.push({
        check: 'required_sections',
        message: `Missing required section: ${required}`,
      });
    }
  }

  // Check 2: No discarded hypotheses appear
  const discardedIds = new Set(
    allHypotheses.filter(h => h.status === 'discarded').map(h => h.hypothesis_id)
  );
  for (const section of report.sections) {
    for (const hid of section.hypothesis_ids) {
      if (discardedIds.has(hid)) {
        errors.push({
          check: 'no_discarded_hypotheses',
          message: `Discarded hypothesis ${hid} appears in section "${section.title}"`,
        });
      }
    }
  }

  // Check 3: Weak hypotheses only in uncertainty section
  const weakIds = new Set(
    allHypotheses.filter(h => h.status === 'weak').map(h => h.hypothesis_id)
  );
  for (const section of report.sections) {
    if (section.title === 'What Remains Uncertain') continue;
    for (const hid of section.hypothesis_ids) {
      if (weakIds.has(hid)) {
        errors.push({
          check: 'weak_hypothesis_placement',
          message: `Weak hypothesis ${hid} appears outside uncertainty section, in "${section.title}"`,
        });
      }
    }
  }

  // Check 4: No em dashes in output
  const fullMarkdown = report.sections.map(s => s.markdown).join('\n') + '\n' + report.summary;
  if (fullMarkdown.includes('\u2014')) {
    errors.push({
      check: 'no_em_dashes',
      message: 'Em dash character found in report output',
      details: 'Use commas, semicolons, or full stops instead of em dashes',
    });
  }

  // Check 5: Banned phrases absent
  const lowerMarkdown = fullMarkdown.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (lowerMarkdown.includes(phrase.toLowerCase())) {
      errors.push({
        check: 'banned_phrases',
        message: `Banned phrase found: "${phrase}"`,
      });
    }
  }

  // Check 6: Sections are non-empty
  for (const section of report.sections) {
    if (section.markdown.trim().length === 0) {
      errors.push({
        check: 'non_empty_sections',
        message: `Section "${section.title}" has empty markdown`,
      });
    }
  }

  // Check 7: Lineage fields populated (at least one section must have lineage)
  const hasAnyLineage = report.sections.some(s =>
    s.hypothesis_ids.length > 0 ||
    s.pattern_ids.length > 0 ||
    s.tension_ids.length > 0 ||
    s.signal_ids.length > 0 ||
    s.evidence_ids.length > 0 ||
    s.source_ids.length > 0
  );
  if (!hasAnyLineage) {
    errors.push({
      check: 'lineage_populated',
      message: 'No section has any lineage references',
    });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

function renderMarkdown(report: Report): string {
  const lines: string[] = [];

  lines.push(`# Intelligence Report: ${report.company_id}`);
  lines.push('');
  lines.push(`*Generated: ${report.generated_at}*`);
  lines.push('');

  for (const section of report.sections) {
    lines.push(`## ${section.title}`);
    lines.push('');
    lines.push(section.markdown);
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export function writeReport(
  reportPlan: ReportPlan,
  implications: Implication[],
  hypotheses: Hypothesis[],
  patterns: Pattern[],
  tensions: Tension[],
  signals: Signal[],
): WriteReportResult {
  // 1. Assemble section input packs
  const sectionPacks = assembleSectionInputs(
    reportPlan, implications, hypotheses, patterns, tensions, signals,
  );

  // 2. Generate each section
  const sections: ReportSection[] = sectionPacks.map(pack => {
    const markdown = generateSectionMarkdown(pack.sectionPlan.section_id, reportPlan, pack);
    const lineage = resolveLineage(pack);

    return {
      section_id: pack.sectionPlan.section_id,
      title: pack.sectionPlan.title,
      markdown,
      ...lineage,
    };
  });

  // 3. Generate executive summary
  const summary = generateExecutiveSummary(reportPlan);

  // 4. Assemble report
  const report: Report = {
    report_id: reportPlan.report_id,
    company_id: reportPlan.company_id,
    generated_at: new Date().toISOString(),
    plan: reportPlan,
    sections,
    summary,
  };

  // 5. Post-generation validation
  const errors = validateReport(report, hypotheses);

  // 6. Render markdown
  const markdown = renderMarkdown(report);

  return {
    report: errors.length === 0 ? report : null,
    markdown,
    errors,
  };
}
