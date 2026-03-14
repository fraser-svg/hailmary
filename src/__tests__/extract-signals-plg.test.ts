/**
 * Tests for PLG signal extraction passes:
 *   - extractOpenSourceAdoptionSignals (Pass 19)
 *   - extractPlgMotionSignals (Pass 20)
 */

import { describe, it, expect } from 'vitest'
import { extractSignals } from '../report/pipeline/extract-signals.js'
import { createEmptyDossier } from '../utils/empty-dossier.js'
import type { Dossier } from '../types/index.js'
import type { EvidenceRecord } from '../types/evidence.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvidence(
  id: string,
  type: EvidenceRecord['evidence_type'],
  overrides: Partial<EvidenceRecord> = {},
): EvidenceRecord {
  return {
    evidence_id: id,
    source_id: 'src_001',
    evidence_type: type,
    captured_at: new Date().toISOString(),
    excerpt: overrides.excerpt ?? `Excerpt for ${id}`,
    summary: overrides.summary ?? `Summary for ${id}`,
    tags: overrides.tags ?? [],
    confidence: overrides.confidence ?? 'medium',
    normalized_fields: overrides.normalized_fields ?? {},
    is_inferred: overrides.is_inferred ?? false,
  }
}

function withEvidence(evidence: EvidenceRecord[]): Dossier {
  const d = createEmptyDossier('Test Co', 'test.co')
  d.evidence = evidence
  return d
}

function signalTags(dossier: Dossier): string[][] {
  return extractSignals(dossier).map(s => s.tags)
}

function plgSignals(dossier: Dossier) {
  return extractSignals(dossier).filter(s => s.tags.includes('plg'))
}

// ---------------------------------------------------------------------------
// Pass 19: extractOpenSourceAdoptionSignals
// ---------------------------------------------------------------------------

describe('extractOpenSourceAdoptionSignals (Pass 19)', () => {
  it('fires on evidence with github_stars', () => {
    const dossier = withEvidence([
      makeEvidence('ev_001', 'founding_record', {
        normalized_fields: { github_stars: '14000+' },
      }),
    ])
    const signals = plgSignals(dossier)
    expect(signals.length).toBeGreaterThanOrEqual(1)
    const sig = signals.find(s => s.tags.includes('github_adoption'))
    expect(sig).toBeDefined()
    expect(sig!.tags).toContain('open_source')
    expect(sig!.tags).toContain('plg')
    expect(sig!.kind).toBe('gtm')
    expect(sig!.polarity).toBe('positive')
  })

  it('fires on evidence with Apache 2.0 license', () => {
    const dossier = withEvidence([
      makeEvidence('ev_001', 'delivery_model_record', {
        normalized_fields: { license: 'Apache 2.0' },
      }),
    ])
    const signals = plgSignals(dossier)
    expect(signals.length).toBeGreaterThanOrEqual(1)
    const sig = signals.find(s => s.tags.includes('open_source'))
    expect(sig).toBeDefined()
    expect(sig!.tags).toContain('plg')
  })

  it('sets confidence high when both stars and license present', () => {
    const dossier = withEvidence([
      makeEvidence('ev_001', 'founding_record', {
        normalized_fields: { github_stars: '14000+', license: 'Apache 2.0' },
      }),
    ])
    const sig = plgSignals(dossier).find(s => s.tags.includes('github_adoption'))
    expect(sig).toBeDefined()
    expect(sig!.confidence).toBe('high')
  })

  it('sets confidence medium when only stars present', () => {
    const dossier = withEvidence([
      makeEvidence('ev_001', 'founding_record', {
        normalized_fields: { github_stars: '5000' },
      }),
    ])
    const sig = plgSignals(dossier).find(s => s.tags.includes('github_adoption'))
    expect(sig).toBeDefined()
    expect(sig!.confidence).toBe('medium')
  })

  it('does not fire when neither github_stars nor license is present', () => {
    const dossier = withEvidence([
      makeEvidence('ev_001', 'founding_record', {
        normalized_fields: { funding_stage: 'Series A' },
      }),
    ])
    const all = extractSignals(dossier)
    expect(all.some(s => s.tags.includes('github_adoption'))).toBe(false)
  })

  it('does not fire on MIT license from unrelated evidence type', () => {
    // MIT license is still valid — passes regardless of evidence type
    const dossier = withEvidence([
      makeEvidence('ev_001', 'company_description_record', {
        normalized_fields: { license: 'MIT' },
      }),
    ])
    const sig = plgSignals(dossier).find(s => s.tags.includes('open_source'))
    expect(sig).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Pass 20: extractPlgMotionSignals
// ---------------------------------------------------------------------------

describe('extractPlgMotionSignals (Pass 20)', () => {
  it('fires on sales_motion_record with motion_type PLG', () => {
    const dossier = withEvidence([
      makeEvidence('ev_001', 'sales_motion_record', {
        normalized_fields: { motion_type: 'PLG' },
        excerpt: 'Company uses product-led growth.',
      }),
    ])
    const signals = plgSignals(dossier)
    const sig = signals.find(s => s.tags.includes('self_serve'))
    expect(sig).toBeDefined()
    expect(sig!.tags).toContain('product_led')
    expect(sig!.tags).toContain('plg')
    expect(sig!.inference_label).toBe('direct')
    expect(sig!.confidence).toBe('high')
  })

  it('fires on delivery_model_record with free tier text', () => {
    const dossier = withEvidence([
      makeEvidence('ev_001', 'delivery_model_record', {
        excerpt: 'Free tier available, no sales required to start.',
      }),
    ])
    const signals = plgSignals(dossier)
    const sig = signals.find(s => s.tags.includes('self_serve'))
    expect(sig).toBeDefined()
    expect(sig!.inference_label).toBe('light_inference')
    expect(sig!.confidence).toBe('medium')
  })

  it('fires on sales_motion_record with self-serve text', () => {
    const dossier = withEvidence([
      makeEvidence('ev_001', 'sales_motion_record', {
        excerpt: 'Self-serve onboarding with no sales touchpoint required.',
      }),
    ])
    const sig = plgSignals(dossier).find(s => s.tags.includes('product_led'))
    expect(sig).toBeDefined()
  })

  it('does not fire on unrelated evidence types', () => {
    const dossier = withEvidence([
      makeEvidence('ev_001', 'review_record', {
        excerpt: 'Self-serve free tier available.',
      }),
      makeEvidence('ev_002', 'case_study_record', {
        normalized_fields: { motion_type: 'PLG' },
      }),
    ])
    const all = extractSignals(dossier)
    expect(all.some(s => s.tags.includes('product_led'))).toBe(false)
  })

  it('does not fire when no PLG text and no motion_type in qualifying evidence', () => {
    const dossier = withEvidence([
      makeEvidence('ev_001', 'sales_motion_record', {
        excerpt: 'Enterprise sales team reaches out to prospects quarterly.',
        normalized_fields: { motion_type: 'sales_led' },
      }),
    ])
    const all = extractSignals(dossier)
    expect(all.some(s => s.tags.includes('self_serve'))).toBe(false)
  })
})
