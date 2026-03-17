/**
 * V3 Pipeline Orchestration Tests
 *
 * Tests for runV3Pipeline():
 *   - Pre-built dossier mode (skip acquisition)
 *   - Corpus acquisition mode (fixture/manual pages + external sources)
 *   - V3PipelineResult structure verification
 *   - Evidence pack is built from the pipeline
 *   - V3-M5 criticiseMemo wiring
 *   - V3-M6 runSendGate wiring
 *
 * All tests are fully deterministic — no external API calls.
 * The V2 pipeline (runV2Pipeline) is mocked to avoid LLM calls.
 * V3-M4 write-memo, V3-M5 criticise-memo, and V3-M6 run-send-gate are mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the V2 pipeline BEFORE importing run-v3-pipeline
// This prevents LLM calls in the renderReport stage
vi.mock("../../intelligence-v2/pipeline.js", () => ({
  runV2Pipeline: vi.fn(),
}));

// Mock write-memo BEFORE importing run-v3-pipeline
// V3-M4 makes LLM calls — mock it to keep pipeline tests deterministic
vi.mock("../memo/write-memo.js", () => ({
  writeMemo: vi.fn().mockResolvedValue({
    memo_id: "memo_test-company_123456",
    company_id: "test-company",
    brief_id: "brief_test-company_123456",
    adjudication_mode: "full_confidence",
    diagnosis_id: "diag_001",
    intervention_id: "int_001",
    evidence_ids: ["ev_001", "ev_002", "ev_003"],
    word_count: 520,
    attempt_number: 1,
    sections: [
      { name: "observation", markdown: "TestCo observation.", word_count: 2 },
      { name: "the_pattern", markdown: "TestCo pattern.", word_count: 2 },
      { name: "what_this_means", markdown: "TestCo meaning.", word_count: 2 },
      { name: "why_this_happens", markdown: "TestCo cause.", word_count: 2 },
      { name: "what_this_changes", markdown: "TestCo change.", word_count: 2 },
      { name: "next_step", markdown: "Reply to this letter.", word_count: 4 },
    ],
    markdown: "## Observation\n\nTestCo observation.\n\n## The Pattern\n\nTestCo pattern.",
    generated_at: new Date().toISOString(),
  }),
}));

// Mock criticise-memo BEFORE importing run-v3-pipeline
// V3-M5 makes LLM calls — mock it to keep pipeline tests deterministic
vi.mock("../memo/criticise-memo.js", () => ({
  criticiseMemo: vi.fn().mockResolvedValue({
    critic_id: "critic_test-company_123456",
    memo_id: "memo_test-company_123456",
    evaluated_at: new Date().toISOString(),
    attempt_number: 1,
    dimensions: {
      evidence_grounding: { score: 4, pass: true, notes: "Solid." },
      commercial_sharpness: { score: 4, pass: true, notes: "Specific." },
      pattern_clarity: { score: 4, pass: true, notes: "Gap clear." },
      signal_density: { score: 4, pass: true, notes: "Good signals." },
      cta_clarity: { score: 5, pass: true, notes: "Clear." },
      tone_compliance: { score: 5, pass: true, notes: "Clean." },
    },
    genericity_test: { result: "pass", reasoning: "Company-specific." },
    founder_pushback_test: {
      most_vulnerable_claim: "Pricing is misaligned.",
      likely_objection: "Win rate is fine.",
      severity: "low",
    },
    overall_pass: true,
  }),
}));

// Mock run-send-gate BEFORE importing run-v3-pipeline
// V3-M6 is deterministic but we mock it to control the result in pipeline tests
vi.mock("../memo/run-send-gate.js", () => ({
  runSendGate: vi.fn().mockReturnValue({
    gate_id: "gate_test-company_123456",
    company_id: "test-company",
    memo_id: "memo_test-company_123456",
    evaluated_at: new Date().toISOString(),
    result: "pass",
    memo_quality_score: 82,
    passed_at: new Date().toISOString(),
    ready_to_send: true,
    has_hard_failures: false,
    gate_summary: {
      total_criteria: 6,
      criteria_passed: 6,
      criteria_failed: 0,
      hard_failures: 0,
      conditional_failures: 0,
      memo_quality_score: 82,
      recommendation: "Memo passed all 6 criteria with quality score 82/100. Ready to send.",
    },
    criteria_results: [],
  }),
}));

import { runV3Pipeline } from "../pipeline/run-v3-pipeline.js";
import { runV2Pipeline as mockRunV2Pipeline } from "../../intelligence-v2/pipeline.js";
import { writeMemo as mockWriteMemoFn } from "../memo/write-memo.js";
import { criticiseMemo as mockCriticiseMemoFn } from "../memo/criticise-memo.js";
import type { V2PipelineResult } from "../../intelligence-v2/pipeline.js";
import type { CorpusPage, ExternalSource } from "../types/research-corpus.js";
import { createEmptyDossier } from "../../utils/empty-dossier.js";
import type { EvidenceRecord } from "../../types/evidence.js";
import type { SourceRecord } from "../../types/source.js";
import type { Dossier } from "../../types/dossier.js";
import type { MarkdownMemo } from "../types/memo.js";
import type { MemoCriticResult } from "../types/memo-critic.js";

// ---------------------------------------------------------------------------
// V2 mock result factory
// ---------------------------------------------------------------------------

/**
 * Minimal valid V2PipelineResult for testing purposes.
 * Contains enough data for buildEvidencePack() to produce a valid pack.
 */
function makeMockV2Result(evidenceIds: string[]): V2PipelineResult {
  return {
    signals: [],
    gtm_analysis: {
      company_id: "test-company",
      founder_dependency: { risk_score: 0.3, signal_count: 0, signals: [] },
      service_dependency: { hidden_services_risk: 0.2, signal_count: 0, signals: [] },
      sales_motion: { mode: "outbound", signal_count: 0, signals: [] },
      buyer_structure: { user_buyer_mismatch: false, signal_count: 0, signals: [] },
      distribution_architecture: {
        primary_channel: "outbound",
        fragility_score: 0.3,
        signal_count: 0,
        signals: [],
      },
      pricing_delivery_fit: {
        delivery_fit_tension: false,
        signal_count: 0,
        signals: [],
      },
    },
    tensions: [],
    patterns: [],
    v2_tensions: [],
    v2_patterns: [],
    diagnosis: {
      id: "diag_001",
      company_id: "test-company",
      type: "enterprise_theatre",
      statement: "Enterprise positioning without enterprise evidence",
      confidence: "high",
      supporting_pattern_ids: [],
      counterevidence_refs: [],
      evidence_refs: evidenceIds.slice(0, 2), // first 2 evidence_ids as refs
    },
    mechanisms: [
      {
        id: "mech_001",
        company_id: "test-company",
        type: "investor_signalling",
        statement: "Investor signalling drives positioning choices",
        plausibility: "high",
        explains_diagnosis_id: "diag_001",
        evidence_refs: evidenceIds.slice(2, 4), // next 2 as mechanism refs
      },
      {
        id: "mech_002",
        company_id: "test-company",
        type: "category_gravity",
        statement: "Category gravity pulls toward enterprise framing",
        plausibility: "medium",
        explains_diagnosis_id: "diag_001",
        evidence_refs: [],
      },
    ],
    intervention: {
      id: "int_001",
      company_id: "test-company",
      type: "icp_redefinition",
      statement: "Redefine ICP to SMB reality",
      expected_impact: "high",
      delivery_fit: "high",
      rationale: "ICP mismatch is addressable",
      mechanism_ids: ["mech_001", "mech_002"],
      diagnosis_id: "diag_001",
      evidence_refs: evidenceIds.slice(4, 5), // 5th as intervention ref
    },
    report: {
      model: "claude-haiku-4-5-20251001",
      sections: [
        {
          name: "diagnosis",
          title: "What's Actually Happening",
          content: "Mock diagnosis section",
          evidence_ids: [],
        },
        {
          name: "mechanisms",
          title: "Why This Is Happening",
          content: "Mock mechanisms section",
          evidence_ids: [],
        },
        {
          name: "intervention",
          title: "What We Would Do",
          content: "Mock intervention section",
          evidence_ids: [],
        },
      ],
      generated_at: new Date().toISOString(),
    },
  } as V2PipelineResult;
}

// ---------------------------------------------------------------------------
// Helpers for building fixture dossiers
// ---------------------------------------------------------------------------

function makeEv(id: string, srcId: string, override?: Partial<EvidenceRecord>): EvidenceRecord {
  return {
    evidence_id: id,
    source_id: srcId,
    evidence_type: "review_record",
    captured_at: "2025-10-01T00:00:00.000Z",
    excerpt: `"Acme delivered 40% cost savings" — customer review ${id}`,
    summary: `Review evidence ${id}`,
    normalized_fields: {},
    source_quality: "medium",
    confidence: "high",
    is_inferred: false,
    supports_claims: [],
    tags: [],
    ...override,
  };
}

function makeSrc(id: string, tier: 1 | 2 | 3 | 4 | 5): SourceRecord {
  return {
    source_id: id,
    url: `https://example.com/${id}`,
    source_type: "web_page",
    title: `Source ${id}`,
    publisher_or_owner: "test",
    captured_at: "2025-10-01T00:00:00.000Z",
    relevance_notes: [],
    source_tier: tier,
  };
}

/**
 * Build a minimal valid dossier with enough evidence for the pack to succeed.
 * Includes: tier-3 reviews (hook eligible), tier-1 company claims,
 * tier-2 press records, and product records.
 */
function buildTestDossier(): Dossier {
  const base = createEmptyDossier("test-company");
  const evidence: EvidenceRecord[] = [
    makeEv("ev_001", "src_001", { evidence_type: "review_record" }),
    makeEv("ev_002", "src_002", { evidence_type: "testimonial_record" }),
    makeEv("ev_003", "src_003", { evidence_type: "press_record" }),
    makeEv("ev_004", "src_004", { evidence_type: "press_record" }),
    makeEv("ev_005", "src_005", {
      evidence_type: "product_record",
      excerpt: "Acme offers full procurement automation as SaaS",
      is_inferred: false,
    }),
    makeEv("ev_006", "src_006", {
      evidence_type: "pricing_record",
      excerpt: "Enterprise plans from $2,000/month",
      is_inferred: false,
    }),
    makeEv("ev_007", "src_007", {
      evidence_type: "case_study_record",
      excerpt: '"Acme 3x ROI in 6 months" — Fortune 500 customer',
    }),
    makeEv("ev_008", "src_008", {
      evidence_type: "company_claim_record",
      excerpt: "Acme is the leading enterprise procurement platform",
      is_inferred: false,
    }),
  ];
  const sources: SourceRecord[] = [
    makeSrc("src_001", 3),
    makeSrc("src_002", 3),
    makeSrc("src_003", 2),
    makeSrc("src_004", 2),
    makeSrc("src_005", 1),
    makeSrc("src_006", 1),
    makeSrc("src_007", 3),
    makeSrc("src_008", 1),
  ];

  return {
    ...base,
    company_input: {
      ...base.company_input,
      company_name: "Acme",
      resolved_company_name: "Acme",
      primary_domain: "acme.com",
      resolved_domain: "acme.com",
    },
    evidence,
    sources,
  };
}

// ---------------------------------------------------------------------------
// Corpus page fixtures
// ---------------------------------------------------------------------------

function makeCorpusPage(pageType: CorpusPage["page_type"], text: string): CorpusPage {
  return {
    url: `https://acme.com/${pageType === "homepage" ? "" : pageType}`,
    page_type: pageType,
    fetched_at: new Date().toISOString(),
    raw_text: text,
    token_count: 0, // computed automatically
    fetch_success: true,
    source_tier: 1,
  };
}

function makeExternalSource(type: ExternalSource["source_type"], suffix = ""): ExternalSource {
  // Each source needs a unique excerpt to survive content-hash deduplication in mergeResearchCorpus
  const excerpts: Record<string, string> = {
    review_trustpilot: `Acme reduced our procurement cycle by 60%. Exceptional value — enterprise customer${suffix}.`,
    press_mention: `Acme raises $50M Series B to expand enterprise procurement automation${suffix}.`,
    competitor_search_snippet: `Acme vs Coupa: Acme wins on mid-market usability${suffix}.`,
    funding_announcement: `Acme secures $25M Series A funding from Sequoia Capital${suffix}.`,
    review_g2_snippet: `Acme is rated 4.7/5 on G2 for procurement automation${suffix}.`,
    review_capterra_snippet: `Acme Capterra review: saved us $100k annually${suffix}.`,
    linkedin_snippet: `Acme | Enterprise Procurement Automation | LinkedIn${suffix}.`,
    investor_mention: `Acme portfolio company — Sequoia Capital${suffix}.`,
  };
  return {
    url: `https://reviews.example.com/${type}`,
    source_type: type,
    gathered_at: new Date().toISOString(),
    excerpt: excerpts[type] ?? `External source content for ${type}${suffix}.`,
    token_count: 40,
    source_tier: type.startsWith("review_") ? 3 : 2,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const mockV2 = vi.mocked(mockRunV2Pipeline);
const mockWriter = vi.mocked(mockWriteMemoFn);
const mockCritic = vi.mocked(mockCriticiseMemoFn);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests: Pre-built dossier mode
// ---------------------------------------------------------------------------

describe("runV3Pipeline — pre-built dossier mode", () => {
  it("runs successfully with a pre-built dossier (skips acquisition)", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);
    mockV2.mockResolvedValueOnce(makeMockV2Result(evidenceIds));

    const result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      dossier,
    });

    expect(result.pipeline_version).toBe("v3");
    expect(result.dossier).toBe(dossier); // same reference — no acquisition
    expect(result.corpus).toBeUndefined();  // no corpus when dossier is pre-built
  });

  it("populates v2Result from V2 pipeline", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);
    const v2Result = makeMockV2Result(evidenceIds);
    mockV2.mockResolvedValueOnce(v2Result);

    const result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      dossier,
    });

    expect(result.v2Result).toBe(v2Result);
    expect(result.v2Result.diagnosis.type).toBe("enterprise_theatre");
  });

  it("produces a valid EvidencePack from the dossier + V2 output", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);
    mockV2.mockResolvedValueOnce(makeMockV2Result(evidenceIds));

    const result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      dossier,
    });

    expect(result.evidencePack).toBeDefined();
    expect(result.evidencePack.records.length).toBeGreaterThanOrEqual(5);
    expect(result.evidencePack.hook_candidates.length).toBeGreaterThan(0);
    expect(result.evidencePack.diagnosis_id).toBe("diag_001");
  });

  it("passes correct company_id to runV2Pipeline", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);
    mockV2.mockResolvedValueOnce(makeMockV2Result(evidenceIds));

    await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      dossier,
    });

    expect(mockV2).toHaveBeenCalledWith(
      expect.stringMatching(/acme/i), // slugified company name
      dossier
    );
  });

  it("result has run_id and generated_at timestamps", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);
    mockV2.mockResolvedValueOnce(makeMockV2Result(evidenceIds));

    const result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      dossier,
    });

    expect(result.run_id).toBeTruthy();
    expect(result.generated_at).toBeTruthy();
    expect(new Date(result.generated_at).getFullYear()).toBeGreaterThan(2020);
  });

  it("adjudication and memoBrief are now populated (V3-M2 and V3-M3 implemented)", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);
    mockV2.mockResolvedValueOnce(makeMockV2Result(evidenceIds));

    const result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      dossier,
    });

    // V3-M2: adjudication is always present
    expect(result.adjudication).toBeDefined();
    expect(result.adjudication.adjudication_mode).toMatch(/full_confidence|conditional|exploratory|abort/);
    expect(result.adjudication.recommended_memo_framing).toMatch(/assertive|indicative|hypothesis|blocked/);

    // V3-M3: memoBrief present when adjudication is not abort
    if (result.adjudication.adjudication_mode !== "abort") {
      expect(result.memoBrief).toBeDefined();
      expect(result.memoBrief!.hook).toBeDefined();
      expect(result.memoBrief!.thesis).toBeTruthy();
      expect(result.memoBrief!.evidence_spine.length).toBeGreaterThanOrEqual(1);
    }

    // V3-M4 is implemented — memo is present when adjudication is not abort
    if (result.adjudication.adjudication_mode !== "abort") {
      expect(result.memo).toBeDefined();
      expect(result.memo!.brief_id).toBeDefined();
      expect(result.memo!.attempt_number).toBe(1);
    }
    // V3-M5 and V3-M6 are now implemented
    if (result.adjudication.adjudication_mode !== "abort") {
      expect(result.criticResult).toBeDefined();
      expect(result.sendGate).toBeDefined();
    }
  });

  it("adjudication.diagnosis_id matches V2 diagnosis.id", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);
    mockV2.mockResolvedValueOnce(makeMockV2Result(evidenceIds));

    const result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      dossier,
    });

    expect(result.adjudication.diagnosis_id).toBe(result.v2Result.diagnosis.id);
  });

  it("memoBrief.adjudication_mode matches adjudication.adjudication_mode", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);
    mockV2.mockResolvedValueOnce(makeMockV2Result(evidenceIds));

    const result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      dossier,
    });

    if (result.memoBrief) {
      expect(result.memoBrief.adjudication_mode).toBe(result.adjudication.adjudication_mode);
      expect(result.memoBrief.memo_framing).toBe(result.adjudication.recommended_memo_framing);
    }
  });

  it("memoBrief.target_company is set from pipeline input.company", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);
    mockV2.mockResolvedValueOnce(makeMockV2Result(evidenceIds));

    const result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      dossier,
    });

    if (result.memoBrief) {
      expect(result.memoBrief.target_company).toBe("Acme");
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: Corpus acquisition mode (fixture/manual)
// ---------------------------------------------------------------------------

describe("runV3Pipeline — corpus acquisition mode (fixture)", () => {
  it("produces a corpus and dossier from fixture site pages + external sources", async () => {
    const fixture_site_pages: CorpusPage[] = [
      makeCorpusPage("homepage", "Acme: enterprise procurement automation. Trusted by leading companies."),
      makeCorpusPage("pricing", "Starter: $500/mo. Enterprise: $2,000/mo with SSO and SLAs."),
      makeCorpusPage("about", "Acme was founded in 2019 to modernize enterprise procurement."),
    ];
    const fixture_external_sources: ExternalSource[] = [
      makeExternalSource("review_trustpilot"),
      makeExternalSource("press_mention"),
    ];

    // Set up mock to return a valid result regardless of what dossier is produced
    mockV2.mockImplementationOnce(async (_companyId: string, dossier: Dossier) => {
      const evidenceIds = dossier.evidence.map(e => e.evidence_id);
      return makeMockV2Result(evidenceIds);
    });

    const result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      fixture_site_pages,
      fixture_external_sources,
    });

    expect(result.corpus).toBeDefined();
    expect(result.corpus!.site_pages.length).toBeGreaterThan(0);
    expect(result.corpus!.external_sources.length).toBeGreaterThan(0);
    expect(result.dossier).toBeDefined();
    expect(result.dossier.evidence.length).toBeGreaterThan(0);
  });

  it("corpus site_pages includes all provided fixture pages", async () => {
    const fixture_site_pages: CorpusPage[] = [
      makeCorpusPage("homepage", "Acme homepage content with Acme product details."),
      makeCorpusPage("pricing", "Pricing: $1,000/month for teams."),
      makeCorpusPage("about", "About Acme: founded 2019 in San Francisco."),
    ];
    // Add 2 external sources to reach 5 total corpus items (minimum for evidence pack)
    const fixture_external_sources: ExternalSource[] = [
      makeExternalSource("review_trustpilot"),
      makeExternalSource("press_mention"),
    ];

    mockV2.mockImplementationOnce(async (_companyId: string, dossier: Dossier) => {
      const evidenceIds = dossier.evidence.map(e => e.evidence_id);
      return makeMockV2Result(evidenceIds);
    });

    const result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      fixture_site_pages,
      fixture_external_sources,
    });

    expect(result.corpus!.site_pages).toHaveLength(3);
  });

  it("dossier from acquisition passes through to V2 pipeline", async () => {
    const fixture_site_pages: CorpusPage[] = [
      makeCorpusPage("homepage", "Acme homepage."),
      makeCorpusPage("pricing", "Pricing starts at $500/month."),
      makeCorpusPage("about", "About us: founded 2019."),
    ];
    // Add 2 external sources to ensure 5+ qualifying evidence records
    const fixture_external_sources: ExternalSource[] = [
      makeExternalSource("review_trustpilot"),
      makeExternalSource("press_mention"),
    ];

    let capturedDossier: Dossier | null = null;
    mockV2.mockImplementationOnce(async (_companyId: string, dossier: Dossier) => {
      capturedDossier = dossier;
      const evidenceIds = dossier.evidence.map(e => e.evidence_id);
      return makeMockV2Result(evidenceIds);
    });

    const result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      fixture_site_pages,
      fixture_external_sources,
    });

    // V2 was called with the dossier produced by acquisition
    expect(capturedDossier).not.toBeNull();
    expect(result.dossier).toBe(capturedDossier);
  });

  it("pipeline_version is always 'v3'", async () => {
    const fixture_site_pages: CorpusPage[] = [
      makeCorpusPage("homepage", "Acme homepage content."),
      makeCorpusPage("pricing", "Pricing: $2,000/month"),
      makeCorpusPage("about", "About Acme: enterprise procurement automation."),
    ];
    // Add 2 external sources to ensure 5+ qualifying evidence records
    const fixture_external_sources: ExternalSource[] = [
      makeExternalSource("review_trustpilot"),
      makeExternalSource("press_mention"),
    ];

    mockV2.mockImplementationOnce(async (_companyId: string, dossier: Dossier) => {
      const ids = dossier.evidence.map(e => e.evidence_id);
      return makeMockV2Result(ids);
    });

    const result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      fixture_site_pages,
      fixture_external_sources,
    });

    expect(result.pipeline_version).toBe("v3");
  });

  it("throws ERR_CORPUS_EMPTY if homepage is missing from fixture", async () => {
    // No homepage in fixture — siteCorpusAcquisition will throw ERR_CORPUS_EMPTY
    const fixture_site_pages: CorpusPage[] = [
      makeCorpusPage("pricing", "Pricing: $1,000/month"),
      makeCorpusPage("about", "About Acme."),
    ];

    await expect(
      runV3Pipeline({
        company: "Acme",
        domain: "acme.com",
        fixture_site_pages,
        fixture_external_sources: [],
      })
    ).rejects.toThrow("ERR_CORPUS_EMPTY");
  });
});

// ---------------------------------------------------------------------------
// Tests: V3PipelineResult structure
// ---------------------------------------------------------------------------

describe("V3PipelineResult structure", () => {
  it("contains all required top-level fields", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);
    mockV2.mockResolvedValueOnce(makeMockV2Result(evidenceIds));

    const result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      dossier,
    });

    expect(result).toMatchObject({
      pipeline_version: "v3",
      company_id: expect.any(String),
      run_id: expect.any(String),
      generated_at: expect.any(String),
      dossier: expect.any(Object),
      v2Result: expect.any(Object),
      evidencePack: expect.any(Object),
    });
  });

  it("company_id is derived from company name (slugified)", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);
    mockV2.mockResolvedValueOnce(makeMockV2Result(evidenceIds));

    const result = await runV3Pipeline({
      company: "Acme Corp",
      domain: "acme.com",
      dossier,
    });

    // company_id derived from resolved_company_name (slugified) = "acme"
    expect(result.company_id).toMatch(/^[a-z0-9-]+$/); // valid slug
  });

  it("evidencePack.company_id matches pipeline company_id", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);
    mockV2.mockResolvedValueOnce(makeMockV2Result(evidenceIds));

    const result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      dossier,
    });

    // Evidence pack company_id comes from diagnosis.company_id
    expect(result.evidencePack.company_id).toBe("test-company");
  });
});

// ---------------------------------------------------------------------------
// Tests: V3-M4 pipeline wiring
// ---------------------------------------------------------------------------

describe("runV3Pipeline — V3-M4 writeMemo wiring", () => {
  it("result.memo is defined when adjudication is not abort", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);
    mockV2.mockResolvedValueOnce(makeMockV2Result(evidenceIds));

    const result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      dossier,
    });

    // The write-memo module is mocked, so memo is always populated for non-abort
    if (result.adjudication.adjudication_mode !== "abort") {
      expect(result.memo).toBeDefined();
    }
  });

  it("result.memo.company_id matches pipeline company_id (from mock)", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);
    mockV2.mockResolvedValueOnce(makeMockV2Result(evidenceIds));

    const result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      dossier,
    });

    if (result.memo) {
      expect(result.memo.attempt_number).toBe(1);
      expect(result.memo.brief_id).toBeTruthy();
    }
  });

  it("result.memo is undefined when adjudication mode is abort", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);

    // Force an abort result by providing empty evidence pack (insufficient coverage)
    // We achieve abort by returning a V2 result with no evidence_refs
    mockV2.mockResolvedValueOnce({
      ...makeMockV2Result(evidenceIds),
      diagnosis: {
        id: "diag_abort",
        company_id: "test-company",
        type: "enterprise_theatre",
        statement: "Statement",
        confidence: "low",       // low confidence
        supporting_pattern_ids: [],
        counterevidence_refs: [],
        evidence_refs: [],        // no evidence refs → weak evidence pack
      },
    });

    const result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      dossier,
    });

    // When adjudication = abort, memoBrief is undefined and memo is never called
    if (result.adjudication.adjudication_mode === "abort") {
      expect(result.memoBrief).toBeUndefined();
      expect(result.memo).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: V3-M5 + V3-M6 pipeline wiring
// ---------------------------------------------------------------------------

describe("runV3Pipeline — V3-M5 criticiseMemo + V3-M6 runSendGate wiring", () => {
  it("result.criticResult is defined when memo is produced", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);
    mockV2.mockResolvedValueOnce(makeMockV2Result(evidenceIds));

    const result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      dossier,
    });

    if (result.adjudication.adjudication_mode !== "abort") {
      expect(result.criticResult).toBeDefined();
      expect(result.criticResult!.overall_pass).toBe(true);
    }
  });

  it("result.sendGate is defined when criticResult is produced", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);
    mockV2.mockResolvedValueOnce(makeMockV2Result(evidenceIds));

    const result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      dossier,
    });

    if (result.adjudication.adjudication_mode !== "abort") {
      expect(result.sendGate).toBeDefined();
      expect(result.sendGate!.result).toMatch(/^(pass|fail)$/);
      expect(typeof result.sendGate!.memo_quality_score).toBe("number");
    }
  });

  it("result.criticResult and result.sendGate are undefined when adjudication is abort", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);

    mockV2.mockResolvedValueOnce({
      ...makeMockV2Result(evidenceIds),
      diagnosis: {
        id: "diag_abort",
        company_id: "test-company",
        type: "enterprise_theatre",
        statement: "Statement",
        confidence: "low",
        supporting_pattern_ids: [],
        counterevidence_refs: [],
        evidence_refs: [],
      },
    });

    const result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      dossier,
    });

    if (result.adjudication.adjudication_mode === "abort") {
      expect(result.criticResult).toBeUndefined();
      expect(result.sendGate).toBeUndefined();
    }
  });

  it("V3PipelineResult contains all 9 memo-layer fields in result shape", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);
    mockV2.mockResolvedValueOnce(makeMockV2Result(evidenceIds));

    const result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      dossier,
    });

    // These 4 are always present
    expect(result.evidencePack).toBeDefined();
    expect(result.adjudication).toBeDefined();

    // These 5 are present only for non-abort adjudication
    if (result.adjudication.adjudication_mode !== "abort") {
      expect(result.memoBrief).toBeDefined();
      expect(result.memo).toBeDefined();
      expect(result.criticResult).toBeDefined();
      expect(result.sendGate).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: Revision loop
// ---------------------------------------------------------------------------

/** Failing critic result with revision_instructions. */
function makeFailingCriticResult(overrides: Partial<MemoCriticResult> = {}): MemoCriticResult {
  return {
    critic_id: "critic_test-company_111111",
    memo_id: "memo_test-company_111111",
    evaluated_at: new Date().toISOString(),
    attempt_number: 1,
    dimensions: {
      evidence_grounding: { score: 2, pass: false, notes: "Unsupported claims present." },
      commercial_sharpness: { score: 2, pass: false, notes: "Too generic — could be any SaaS." },
      cta_clarity: { score: 5, pass: true, notes: "Clear single ask." },
      tone_compliance: { score: 5, pass: true, notes: "No violations." },
    },
    genericity_test: { result: "fail", reasoning: "Could apply to any SaaS company unchanged." },
    founder_pushback_test: {
      most_vulnerable_claim: "Enterprise positioning is wrong.",
      likely_objection: "We have paying enterprise customers.",
      severity: "high",
    },
    overall_pass: false,
    revision_instructions: {
      attempt_number: 1,
      failing_dimensions: ["evidence_grounding", "commercial_sharpness", "genericity_test"],
      specific_issues: [
        "Evidence grounding (score 2/5): Unsupported claims present.",
        "Commercial sharpness (score 2/5): Too generic — could be any SaaS.",
        "Genericity test failed: Could apply to any SaaS company unchanged.",
      ],
      founder_pushback_context:
        'Most vulnerable claim: "Enterprise positioning is wrong.". Likely objection: "We have paying enterprise customers.". Severity: high.',
    },
    ...overrides,
  };
}

/** Attempt-2 memo (same shape as the default mock but with attempt_number: 2). */
function makeAttempt2Memo(): MarkdownMemo {
  return {
    memo_id: "memo_test-company_222222",
    company_id: "test-company",
    brief_id: "brief_test-company_123456",
    adjudication_mode: "full_confidence",
    diagnosis_id: "diag_001",
    intervention_id: "int_001",
    evidence_ids: ["ev_001", "ev_002", "ev_003"],
    word_count: 540,
    attempt_number: 2,
    sections: [
      { name: "observation", markdown: "TestCo revised observation.", word_count: 3 },
      { name: "the_pattern", markdown: "TestCo revised pattern.", word_count: 3 },
      { name: "what_this_means", markdown: "TestCo revised meaning.", word_count: 3 },
      { name: "why_this_happens", markdown: "TestCo revised cause.", word_count: 3 },
      { name: "what_this_changes", markdown: "TestCo revised change.", word_count: 3 },
      { name: "next_step", markdown: "Reply to confirm a 20-minute call.", word_count: 6 },
    ],
    markdown:
      "## Observation\n\nTestCo revised observation.\n\n## The Pattern\n\nTestCo revised pattern.",
    generated_at: new Date().toISOString(),
  };
}

describe("runV3Pipeline — revision loop", () => {
  it("single-pass success: no revision when critic passes on attempt 1", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);
    mockV2.mockResolvedValueOnce(makeMockV2Result(evidenceIds));
    // Default mocks: writeMemo → passing memo, criticiseMemo → overall_pass: true

    const result = await runV3Pipeline({ company: "Acme", domain: "acme.com", dossier });

    // writeMemo called exactly once; criticiseMemo called exactly once
    expect(mockWriter).toHaveBeenCalledTimes(1);
    expect(mockCritic).toHaveBeenCalledTimes(1);

    // No revision metadata
    expect(result.firstAttemptMemo).toBeUndefined();
    expect(result.firstCriticResult).toBeUndefined();

    // Final memo is attempt 1
    expect(result.memo).toBeDefined();
    expect(result.criticResult!.overall_pass).toBe(true);
  });

  it("revise-then-pass: second attempt passes, revision metadata populated", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);
    mockV2.mockResolvedValueOnce(makeMockV2Result(evidenceIds));

    const failingCritic = makeFailingCriticResult();
    const attempt2Memo = makeAttempt2Memo();

    // Attempt 1: write → fail critic
    mockWriter.mockResolvedValueOnce({
      memo_id: "memo_test-company_111111",
      company_id: "test-company",
      brief_id: "brief_test-company_123456",
      adjudication_mode: "full_confidence",
      diagnosis_id: "diag_001",
      intervention_id: "int_001",
      evidence_ids: ["ev_001", "ev_002", "ev_003"],
      word_count: 490,
      attempt_number: 1,
      sections: [
        { name: "observation", markdown: "Generic observation.", word_count: 2 },
        { name: "the_pattern", markdown: "Generic pattern.", word_count: 2 },
        { name: "what_this_means", markdown: "Generic meaning.", word_count: 2 },
        { name: "why_this_happens", markdown: "Generic cause.", word_count: 2 },
        { name: "what_this_changes", markdown: "Generic change.", word_count: 2 },
        { name: "next_step", markdown: "Reply to this letter.", word_count: 4 },
      ],
      markdown: "## Observation\n\nGeneric observation.",
      generated_at: new Date().toISOString(),
    });
    mockCritic.mockResolvedValueOnce(failingCritic);

    // Attempt 2: write → pass critic (falls through to default passing mock)
    mockWriter.mockResolvedValueOnce(attempt2Memo);
    // mockCritic falls through to default overall_pass: true

    const result = await runV3Pipeline({ company: "Acme", domain: "acme.com", dossier });

    // Both write and critic called twice
    expect(mockWriter).toHaveBeenCalledTimes(2);
    expect(mockCritic).toHaveBeenCalledTimes(2);

    // Revision metadata populated with attempt 1 artifacts
    expect(result.firstAttemptMemo).toBeDefined();
    expect(result.firstCriticResult).toBeDefined();
    expect(result.firstCriticResult!.overall_pass).toBe(false);

    // Final result is attempt 2
    expect(result.memo!.attempt_number).toBe(2);
    expect(result.criticResult!.overall_pass).toBe(true);

    // Send gate runs on the final (passing) memo
    expect(result.sendGate).toBeDefined();
  });

  it("revise-then-fail: second attempt also fails, final state preserved", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);
    mockV2.mockResolvedValueOnce(makeMockV2Result(evidenceIds));

    const failingCritic1 = makeFailingCriticResult({ attempt_number: 1 });
    const failingCritic2 = makeFailingCriticResult({ attempt_number: 2, critic_id: "critic_test-company_222222" });
    const attempt2Memo = makeAttempt2Memo();

    mockWriter.mockResolvedValueOnce({
      ...attempt2Memo,
      memo_id: "memo_test-company_111111",
      attempt_number: 1,
    });
    mockCritic.mockResolvedValueOnce(failingCritic1);
    mockWriter.mockResolvedValueOnce(attempt2Memo);
    mockCritic.mockResolvedValueOnce(failingCritic2);

    const result = await runV3Pipeline({ company: "Acme", domain: "acme.com", dossier });

    // Revision loop ran: both memos recorded
    expect(result.firstAttemptMemo).toBeDefined();
    expect(result.firstCriticResult!.overall_pass).toBe(false);

    // Final memo is still attempt 2 (revision ran), critic still failing
    expect(result.memo!.attempt_number).toBe(2);
    expect(result.criticResult!.overall_pass).toBe(false);

    // Send gate still runs on the final memo (gate scores it deterministically)
    expect(result.sendGate).toBeDefined();
  });

  it("abort skips revision: writeMemo never called when adjudication is abort", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);

    mockV2.mockResolvedValueOnce({
      ...makeMockV2Result(evidenceIds),
      diagnosis: {
        id: "diag_abort",
        company_id: "test-company",
        type: "enterprise_theatre" as const,
        statement: "Statement",
        confidence: "low" as const,
        supporting_pattern_ids: [],
        counterevidence_refs: [],
        evidence_refs: [],
      },
    });

    const result = await runV3Pipeline({ company: "Acme", domain: "acme.com", dossier });

    if (result.adjudication.adjudication_mode === "abort") {
      expect(mockWriter).not.toHaveBeenCalled();
      expect(mockCritic).not.toHaveBeenCalled();
      expect(result.memo).toBeUndefined();
      expect(result.firstAttemptMemo).toBeUndefined();
      expect(result.firstCriticResult).toBeUndefined();
    }
  });

  it("attempt_number increments: first call gets 1, second call gets 2", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);
    mockV2.mockResolvedValueOnce(makeMockV2Result(evidenceIds));

    const failingCritic = makeFailingCriticResult();
    const attempt2Memo = makeAttempt2Memo();

    mockWriter.mockResolvedValueOnce({
      ...attempt2Memo,
      memo_id: "memo_test-company_111111",
      attempt_number: 1,
    });
    mockCritic.mockResolvedValueOnce(failingCritic);
    mockWriter.mockResolvedValueOnce(attempt2Memo);

    await runV3Pipeline({ company: "Acme", domain: "acme.com", dossier });

    // First writeMemo call: attemptNumber arg = 1
    expect(mockWriter.mock.calls[0]![1]).toBe(1);
    // Second writeMemo call: attemptNumber arg = 2
    expect(mockWriter.mock.calls[1]![1]).toBe(2);

    // Second call's MemoBrief has revision_instructions set
    const revisedBrief = mockWriter.mock.calls[1]![0];
    expect(revisedBrief.revision_instructions).toBeDefined();
    expect(revisedBrief.revision_instructions!.failing_dimensions).toContain("genericity_test");
  });
});

// ---------------------------------------------------------------------------
// Tests: V4 synthesis fallback integration
// ---------------------------------------------------------------------------

describe("runV3Pipeline — V4 synthesis fallback path", () => {
  it("when synthesis returns fallback_to_template=true, memoBrief is still built with V3 template logic", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);
    mockV2.mockResolvedValueOnce(makeMockV2Result(evidenceIds));

    // Inject a mock synth client that returns invalid JSON → forces fallback
    const badSynthClient = {
      messages: {
        create: async () => ({
          content: [{ type: "text", text: "not valid json {{{{" }],
        }),
      },
    };

    const result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      dossier,
      memoIntelligenceVersion: "v4",
      synthConfig: {
        client: badSynthClient as unknown as import("@anthropic-ai/sdk").default,
      },
    });

    // Synthesis ran but fell back
    expect(result.argumentSynthesis).toBeDefined();
    expect(result.argumentSynthesis?.fallback_to_template).toBe(true);

    // Brief is still built (adjudication is not abort for this dossier)
    if (result.adjudication.adjudication_mode !== "abort") {
      expect(result.memoBrief).toBeDefined();
      // V4 synthesis fields must be absent when fallback is true
      expect(result.memoBrief?.synthesised_thesis).toBeUndefined();
      expect(result.memoBrief?.mechanism_narratives).toBeUndefined();
      expect(result.memoBrief?.argument_skeleton).toBeUndefined();
      expect(result.memoBrief?.hook_strategy).toBeUndefined();
      // Template thesis is still set
      expect(result.memoBrief?.thesis).toBeTruthy();
    }
  });

  it("when synthesis succeeds (mock client), brief contains all V4 fields", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);
    mockV2.mockResolvedValueOnce(makeMockV2Result(evidenceIds));

    // Build a valid synthesis JSON using the test dossier's evidence IDs
    const validSynthJSON = JSON.stringify({
      company_specific_thesis:
        "Acme's enterprise positioning without customer proof limits pipeline velocity (ev_001), " +
        "meaning deals stall at the proof-of-concept stage and sales cycles lengthen past 90 days.",
      mechanism_narratives: [
        {
          mechanism_id: "mech_001",
          mechanism_type: "investor_signalling",
          company_specific_narrative:
            "Acme's investor-driven enterprise framing (ev_003) positions it above " +
            "its actual deal size, creating a category mismatch that repels the SMB " +
            "buyers who would convert fastest.",
          evidence_refs: ["ev_003"],
        },
        {
          mechanism_id: "mech_002",
          mechanism_type: "category_gravity",
          company_specific_narrative:
            "Case study pricing signals ($2,000/month enterprise plans, ev_006) attract " +
            "procurement scrutiny the product cannot yet survive, extending close rates past 90 days.",
          evidence_refs: ["ev_006"],
        },
      ],
      argument_skeleton: [
        {
          step_order: 1,
          evidence_id: "ev_001",
          logical_role: "observation",
          connector: "which means",
          purpose: "Shows enterprise claim from customer review — the observable surface-level signal.",
        },
        {
          step_order: 2,
          evidence_id: "ev_003",
          logical_role: "mechanism",
          connector: "because",
          purpose: "Investor signalling explains WHY the company adopted enterprise framing without evidence.",
        },
        {
          step_order: 3,
          evidence_id: "ev_006",
          logical_role: "diagnosis",
          connector: "meaning",
          purpose: "Connects the claim gap to commercial consequence: pricing creates approval overhead.",
        },
      ],
      hook_strategy: {
        evidence_id: "ev_001",
        tension_type: "contradiction",
        framing: "Open with the customer review that names the enterprise positioning directly.",
        why_it_matters:
          "The founder believes enterprise positioning is an asset; this customer review shows it is creating qualification friction.",
      },
      evidence_refs: ["ev_001", "ev_003", "ev_006"],
      synthesis_confidence: "high",
      diagnosis_fit: "strong",
    });

    const goodSynthClient = {
      messages: {
        create: async () => ({
          content: [{ type: "text", text: validSynthJSON }],
        }),
      },
    };

    const result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      dossier,
      memoIntelligenceVersion: "v4",
      synthConfig: {
        client: goodSynthClient as unknown as import("@anthropic-ai/sdk").default,
      },
    });

    // Synthesis ran and succeeded
    expect(result.argumentSynthesis).toBeDefined();
    expect(result.argumentSynthesis?.fallback_to_template).toBe(false);

    // Brief contains all V4 synthesis fields
    if (result.adjudication.adjudication_mode !== "abort") {
      expect(result.memoBrief).toBeDefined();
      expect(result.memoBrief?.synthesised_thesis).toBeTruthy();
      expect(result.memoBrief?.mechanism_narratives).toHaveLength(2);
      expect(result.memoBrief?.argument_skeleton).toBeDefined();
      expect(result.memoBrief?.argument_skeleton?.length).toBeGreaterThanOrEqual(3);
      expect(result.memoBrief?.hook_strategy).toBeDefined();
      // Hook framing_instruction should come from synthesis
      expect(result.memoBrief?.hook?.framing_instruction).toBe(
        "Open with the customer review that names the enterprise positioning directly."
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: V4 rollout flag — Phase 1 scaffolding
// ---------------------------------------------------------------------------

describe("runV3Pipeline — memoIntelligenceVersion flag (Phase 1)", () => {
  it("defaults to 'v4' when memoIntelligenceVersion is not provided", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);
    mockV2.mockResolvedValueOnce(makeMockV2Result(evidenceIds));

    const result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      dossier,
    });

    expect(result.memo_intelligence_version).toBe("v4");
  });

  it("propagates 'v4' when explicitly set", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);
    mockV2.mockResolvedValueOnce(makeMockV2Result(evidenceIds));

    const result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      dossier,
      memoIntelligenceVersion: "v4",
    });

    expect(result.memo_intelligence_version).toBe("v4");
  });

  it("propagates 'v3' when explicitly set", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);
    mockV2.mockResolvedValueOnce(makeMockV2Result(evidenceIds));

    const result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      dossier,
      memoIntelligenceVersion: "v3",
    });

    expect(result.memo_intelligence_version).toBe("v3");
  });

  it("v4 mode: argumentSynthesis is present in result (fallback when no API key)", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);
    mockV2.mockResolvedValueOnce(makeMockV2Result(evidenceIds));

    const result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      dossier,
      memoIntelligenceVersion: "v4",
    });

    // synthesiseArgument is called; without API key it returns fallback_to_template = true
    expect(result.argumentSynthesis).toBeDefined();
    expect(result.argumentSynthesis?.fallback_to_template).toBe(true);
  });

  it("v3 mode: argumentSynthesis is undefined (synthesis skipped)", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);
    mockV2.mockResolvedValueOnce(makeMockV2Result(evidenceIds));

    const result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      dossier,
      memoIntelligenceVersion: "v3",
    });

    expect(result.argumentSynthesis).toBeUndefined();
  });

  it("memo behavior is identical for 'v3' and 'v4' in Phase 1 (no synthesis yet)", async () => {
    const dossier = buildTestDossier();
    const evidenceIds = dossier.evidence.map(e => e.evidence_id);

    mockV2.mockResolvedValueOnce(makeMockV2Result(evidenceIds));
    const v3result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      dossier,
      memoIntelligenceVersion: "v3",
    });

    mockV2.mockResolvedValueOnce(makeMockV2Result(evidenceIds));
    const v4result = await runV3Pipeline({
      company: "Acme",
      domain: "acme.com",
      dossier,
      memoIntelligenceVersion: "v4",
    });

    // Memo pipeline behavior is unchanged in Phase 1 — writer and critic called same number of times
    // (2 total for both runs: once per run)
    expect(mockWriter).toHaveBeenCalledTimes(2);
    expect(mockCritic).toHaveBeenCalledTimes(2);

    // memo_intelligence_version differs between runs
    expect(v3result.memo_intelligence_version).toBe("v3");
    expect(v4result.memo_intelligence_version).toBe("v4");

    // Both produce a memo and criticResult (same mock)
    expect(v3result.memo).toBeDefined();
    expect(v4result.memo).toBeDefined();
  });
});
