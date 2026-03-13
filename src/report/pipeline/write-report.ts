/**
 * Stage 8: Write Report
 *
 * Converts the structured report plan into a human-readable strategic report.
 * The writer expresses existing analytical insights clearly and precisely.
 * It must not generate new insights or reinterpret evidence.
 *
 * Architecture: hybrid deterministic + writer adapter.
 *   - Deterministic: section input assembly, lineage resolution, validation
 *   - Writer adapter: prose generation (template, skill, or LLM mode)
 *
 * Writer modes:
 *   - "template" (default): deterministic template-based prose, no LLM calls
 *   - "skill": prose generated externally by Claude Code / skill layer
 *   - "llm": LLM-backed prose generation following the report plan
 *
 * Skill mode supports two paths:
 *   A. buildSkillBundle: export section-writing requests for Claude Code
 *   B. writeReport with skillResponses: assemble report from generated prose
 */

import type { Signal } from './extract-signals.js';
import type { Tension } from './detect-tensions.js';
import type { Pattern } from './detect-patterns.js';
import type { Hypothesis } from './generate-hypotheses.js';
import type { Implication } from './generate-implications.js';
import type { ReportPlan, SectionPlan } from './plan-report.js';
import type { Confidence } from '../../types/evidence.js';
import type {
  SectionInputPack,
  WriterOptions,
  SkillWriterBundle,
  SkillSectionResponse,
} from '../writer/types.js';
import { createWriterAdapter } from '../writer/writer-adapter.js';
import { buildSkillBundle as buildBundle } from '../writer/skill-writer.js';

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

/** Result of Path A: skill bundle export. */
export interface SkillBundleResult {
  bundle: SkillWriterBundle;
  sectionPacks: SectionInputPack[];
}

// ---------------------------------------------------------------------------
// Section input packs
// ---------------------------------------------------------------------------

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
// Path A: Export skill bundle
// ---------------------------------------------------------------------------

/**
 * Build a SkillWriterBundle from the report plan and upstream data.
 * This is used when mode is 'skill' and no responses are provided yet.
 * The bundle is serialisable to JSON for the skill layer to consume.
 */
export function exportSkillBundle(
  reportPlan: ReportPlan,
  implications: Implication[],
  hypotheses: Hypothesis[],
  patterns: Pattern[],
  tensions: Tension[],
  signals: Signal[],
): SkillBundleResult {
  const sectionPacks = assembleSectionInputs(
    reportPlan, implications, hypotheses, patterns, tensions, signals,
  );
  const bundle = buildBundle(reportPlan, sectionPacks);
  return { bundle, sectionPacks };
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function writeReport(
  reportPlan: ReportPlan,
  implications: Implication[],
  hypotheses: Hypothesis[],
  patterns: Pattern[],
  tensions: Tension[],
  signals: Signal[],
  options?: WriterOptions,
): Promise<WriteReportResult> {
  const mode = options?.writerMode ?? 'template';

  const writer = createWriterAdapter(
    mode,
    options?.skillResponses,
    // Summary from skill responses (look for a special 'summary' entry)
    options?.skillResponses?.find(r => r.section_id === 'summary')?.markdown,
  );

  // 1. Assemble section input packs
  const sectionPacks = assembleSectionInputs(
    reportPlan, implications, hypotheses, patterns, tensions, signals,
  );

  // 2. Generate each section
  const sections: ReportSection[] = [];
  for (const pack of sectionPacks) {
    const markdown = await writer.generateSection(pack.sectionPlan.section_id, reportPlan, pack);
    const lineage = resolveLineage(pack);

    sections.push({
      section_id: pack.sectionPlan.section_id,
      title: pack.sectionPlan.title,
      markdown,
      ...lineage,
    });
  }

  // 3. Generate executive summary
  const summary = await writer.generateSummary(reportPlan);

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
