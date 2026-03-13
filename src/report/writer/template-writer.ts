/**
 * Template-based section writer (deterministic).
 *
 * Extracted from the original write-report.ts V1 implementation.
 * Produces identical output to the pre-Phase 16 writer.
 */

import type { ReportPlan } from '../pipeline/plan-report.js';
import type { Confidence } from '../../types/evidence.js';
import type { SectionInputPack, SectionWriter } from './types.js';

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
// Section generators (deterministic templates)
// ---------------------------------------------------------------------------

function generateExecutiveOverview(
  plan: ReportPlan,
  pack: SectionInputPack,
): string {
  const lines: string[] = [];

  lines.push(plan.core_thesis);
  lines.push('');

  if (plan.key_findings.length > 0) {
    lines.push('The analysis identifies several key observations:');
    lines.push('');
    for (const finding of plan.key_findings) {
      lines.push(`- ${finding}`);
    }
    lines.push('');
  }

  if (pack.implications.length > 0) {
    const topImp = pack.implications[0];
    lines.push(
      `${confidencePhrase(topImp.confidence)} ${topImp.statement.split(/\.\s/)[0].toLowerCase().replace(/\.+$/, '')}.`
    );
    lines.push('');
  }

  return lines.join('\n');
}

function generateEvidenceSection(pack: SectionInputPack): string {
  const lines: string[] = [];

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

function generateTensionsSection(pack: SectionInputPack): string {
  const lines: string[] = [];

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

function generateHypothesesSection(pack: SectionInputPack): string {
  const lines: string[] = [];

  const sorted = [...pack.hypotheses].sort((a, b) => {
    const rank: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };
    return (rank[b.confidence] * 3 + rank[b.severity] * 2) -
           (rank[a.confidence] * 3 + rank[a.severity] * 2);
  });

  for (const hyp of sorted) {
    lines.push(`**${hyp.title}.** ${confidencePhrase(hyp.confidence)} ${hyp.statement.charAt(0).toLowerCase()}${hyp.statement.slice(1)}`);
    lines.push('');

    if (hyp.strongest_support && hyp.strongest_support.length > 0) {
      lines.push(`This is supported ${confidenceQualifier(hyp.confidence)} by the following:`);
      lines.push('');
      for (const support of hyp.strongest_support.slice(0, 3)) {
        lines.push(`- ${support}`);
      }
      lines.push('');
    }

    if (hyp.residual_uncertainty) {
      lines.push(`However, ${hyp.residual_uncertainty.charAt(0).toLowerCase()}${hyp.residual_uncertainty.slice(1)}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

function generateImplicationsSection(pack: SectionInputPack): string {
  const lines: string[] = [];

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

function generateExecutiveSummary(plan: ReportPlan): string {
  const parts: string[] = [];
  parts.push(plan.core_thesis);

  if (plan.key_findings.length > 0) {
    parts.push(`The analysis surfaces ${plan.key_findings.length} key findings.`);
  }

  const sectionCount = plan.section_plan.length;
  parts.push(`This report is structured in ${sectionCount} sections, progressing from observable evidence through tension analysis and hypothesis formation to strategic implications.`);

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Template writer implementation
// ---------------------------------------------------------------------------

export function createTemplateWriter(): SectionWriter {
  return {
    async generateSection(
      sectionId: string,
      plan: ReportPlan,
      pack: SectionInputPack,
    ): Promise<string> {
      switch (sectionId) {
        case 'sec_01': return generateExecutiveOverview(plan, pack);
        case 'sec_02': return generateEvidenceSection(pack);
        case 'sec_03': return generateTensionsSection(pack);
        case 'sec_04': return generateHypothesesSection(pack);
        case 'sec_05': return generateImplicationsSection(pack);
        case 'sec_06': return generateUncertaintySection(pack);
        default: return '';
      }
    },

    async generateSummary(plan: ReportPlan): Promise<string> {
      return generateExecutiveSummary(plan);
    },
  };
}
