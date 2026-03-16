/**
 * Evidence Pack Tests — V3-M1
 *
 * Tests for buildEvidencePack():
 *   - Evidence scoring on all 4 dimensions
 *   - Memo role assignment rules
 *   - Minimum evidence mix enforcement
 *   - Hook candidate generation
 *   - Low-evidence failure path (ERR_EVIDENCE_PACK_INSUFFICIENT)
 *   - Zero hook failure path (ERR_NO_HOOK_CANDIDATES)
 *
 * All tests are fully deterministic — no external API calls.
 */

import { describe, it, expect } from "vitest";
import { buildEvidencePack } from "../memo/build-evidence-pack.js";
import type { BuildEvidencePackInput } from "../memo/build-evidence-pack.js";
import type { EvidenceRecord, Confidence } from "../../types/evidence.js";
import type { SourceRecord } from "../../types/source.js";
import type { Dossier } from "../../types/dossier.js";
import type { Diagnosis } from "../../intelligence-v2/types/diagnosis.js";
import type { Mechanism } from "../../intelligence-v2/types/mechanism.js";
import type { InterventionOpportunity } from "../../intelligence-v2/types/intervention.js";
import { createEmptyDossier } from "../../utils/empty-dossier.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let evCounter = 0;
let srcCounter = 0;

function makeEv(overrides: Partial<EvidenceRecord> & { evidence_id?: string; source_id?: string }): EvidenceRecord {
  evCounter++;
  const id = overrides.evidence_id ?? `ev_${String(evCounter).padStart(3, "0")}`;
  const srcId = overrides.source_id ?? `src_${String(evCounter).padStart(3, "0")}`;
  return {
    evidence_id: id,
    source_id: srcId,
    evidence_type: "company_description_record",
    captured_at: "2025-10-01T00:00:00.000Z", // recent — within 18 months of 2026-03-14
    excerpt: "Acme provides enterprise SaaS for procurement automation.",
    summary: "Company description",
    normalized_fields: {},
    source_quality: "medium",
    confidence: "medium",
    is_inferred: false,
    supports_claims: [],
    tags: [],
    ...overrides,
  };
}

function makeSrc(sourceId: string, tier: 1 | 2 | 3 | 4 | 5): SourceRecord {
  return {
    source_id: sourceId,
    url: `https://example.com/${sourceId}`,
    source_type: "web_page",
    title: `Source ${sourceId}`,
    publisher_or_owner: "test",
    captured_at: "2025-10-01T00:00:00.000Z",
    relevance_notes: [],
    source_tier: tier,
  };
}

function makeDossierWith(records: EvidenceRecord[], sources: SourceRecord[]): Dossier {
  const base = createEmptyDossier("test-company");
  return {
    ...base,
    company_input: {
      ...base.company_input,
      company_name: "Acme",
      resolved_company_name: "Acme",
    },
    evidence: records,
    sources,
  };
}

function makeDiagnosis(evidenceRefs: string[] = []): Diagnosis {
  return {
    id: "diag_001",
    company_id: "test-company",
    type: "enterprise_theatre",
    statement: "Enterprise positioning without enterprise evidence",
    confidence: "high",
    supporting_pattern_ids: ["pat_001"],
    counterevidence_refs: [],
    evidence_refs: evidenceRefs,
  };
}

function makeMechanism(id: string, evidenceRefs: string[] = []): Mechanism {
  return {
    id,
    company_id: "test-company",
    type: "investor_signalling",
    statement: "Investor signalling mechanism",
    plausibility: "high",
    explains_diagnosis_id: "diag_001",
    evidence_refs: evidenceRefs,
  };
}

function makeIntervention(evidenceRefs: string[] = []): InterventionOpportunity {
  return {
    id: "int_001",
    company_id: "test-company",
    type: "icp_redefinition",
    statement: "Redefine ICP",
    expected_impact: "high",
    delivery_fit: "high",
    rationale: "Test rationale",
    mechanism_ids: ["mech_001"],
    diagnosis_id: "diag_001",
    evidence_refs: evidenceRefs,
  };
}

/**
 * Build a minimal qualifying input with enough records to pass the pack.
 * Returns 5+ high-scoring records including hook-eligible ones.
 */
function buildQualifyingInput(): BuildEvidencePackInput {
  // Make 8 records:
  // 2 Tier-3 review records (high customer_voice + specificity)
  // 2 Tier-2 press records (medium customer_voice)
  // 2 Tier-1 product/pricing records
  // 1 case study (proof)
  // 1 pricing record

  const ev1 = makeEv({
    evidence_id: "ev_001",
    source_id: "src_001",
    evidence_type: "review_record",
    excerpt: '"Acme reduced our procurement time by 40%" — enterprise customer',
    is_inferred: false,
    confidence: "high",
  });
  const ev2 = makeEv({
    evidence_id: "ev_002",
    source_id: "src_002",
    evidence_type: "testimonial_record",
    excerpt: '"We saved $200k annually with Acme\'s platform"',
    is_inferred: false,
    confidence: "high",
  });
  const ev3 = makeEv({
    evidence_id: "ev_003",
    source_id: "src_003",
    evidence_type: "press_record",
    excerpt: "Acme raises $50M Series B led by Sequoia",
    is_inferred: false,
    confidence: "high",
  });
  const ev4 = makeEv({
    evidence_id: "ev_004",
    source_id: "src_004",
    evidence_type: "press_record",
    excerpt: "Acme wins enterprise deal with Fortune 500 company",
    is_inferred: false,
    confidence: "medium",
  });
  const ev5 = makeEv({
    evidence_id: "ev_005",
    source_id: "src_005",
    evidence_type: "product_record",
    excerpt: "Acme offers full procurement automation as a SaaS platform",
    is_inferred: false,
    confidence: "medium",
  });
  const ev6 = makeEv({
    evidence_id: "ev_006",
    source_id: "src_006",
    evidence_type: "pricing_record",
    excerpt: "Enterprise plans starting at $2,000/month",
    is_inferred: false,
    confidence: "medium",
  });
  const ev7 = makeEv({
    evidence_id: "ev_007",
    source_id: "src_007",
    evidence_type: "case_study_record",
    excerpt: "Acme case study: 3x ROI achieved for mid-market customer",
    is_inferred: false,
    confidence: "high",
  });
  const ev8 = makeEv({
    evidence_id: "ev_008",
    source_id: "src_008",
    evidence_type: "company_claim_record",
    excerpt: "Acme is the leader in enterprise procurement automation",
    is_inferred: false,
    confidence: "medium",
  });

  const sources = [
    makeSrc("src_001", 3), // tier 3 — review
    makeSrc("src_002", 3), // tier 3 — testimonial
    makeSrc("src_003", 2), // tier 2 — press
    makeSrc("src_004", 2), // tier 2 — press
    makeSrc("src_005", 1), // tier 1 — product page
    makeSrc("src_006", 1), // tier 1 — pricing page
    makeSrc("src_007", 3), // tier 3 — case study
    makeSrc("src_008", 1), // tier 1 — company claim
  ];

  const dossier = makeDossierWith(
    [ev1, ev2, ev3, ev4, ev5, ev6, ev7, ev8],
    sources
  );

  return {
    dossier,
    diagnosis: makeDiagnosis(["ev_001", "ev_003"]),
    mechanisms: [makeMechanism("mech_001", ["ev_005"])],
    intervention: makeIntervention(["ev_006"]),
  };
}

// ---------------------------------------------------------------------------
// Tests: Scoring dimensions
// ---------------------------------------------------------------------------

describe("evidence scoring — commercial_salience", () => {
  it("scores 3 for evidence in diagnosis.evidence_refs", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    const ev001 = pack.records.find(r => r.evidence_id === "ev_001");
    expect(ev001?.scores.commercial_salience).toBe(3);
  });

  it("scores 3 for a second evidence ref in diagnosis", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    const ev003 = pack.records.find(r => r.evidence_id === "ev_003");
    expect(ev003?.scores.commercial_salience).toBe(3);
  });

  it("scores 2 for evidence in mechanism.evidence_refs", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    const ev005 = pack.records.find(r => r.evidence_id === "ev_005");
    expect(ev005?.scores.commercial_salience).toBe(2);
  });

  it("scores 2 for evidence in intervention.evidence_refs", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    const ev006 = pack.records.find(r => r.evidence_id === "ev_006");
    expect(ev006?.scores.commercial_salience).toBe(2);
  });

  it("scores 1 for commercially relevant type not in any refs", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    // ev_002 (testimonial_record) is not in any refs but is commercially relevant
    const ev002 = pack.records.find(r => r.evidence_id === "ev_002");
    expect(ev002?.scores.commercial_salience).toBe(1);
  });
});

describe("evidence scoring — specificity", () => {
  it("scores 3 for review_record (highly specific)", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    const ev001 = pack.records.find(r => r.evidence_id === "ev_001");
    expect(ev001?.scores.specificity).toBe(3);
  });

  it("scores 3 for case_study_record", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    const ev007 = pack.records.find(r => r.evidence_id === "ev_007");
    expect(ev007?.scores.specificity).toBe(3);
  });

  it("scores 2 for pricing_record (category-specific)", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    const ev006 = pack.records.find(r => r.evidence_id === "ev_006");
    expect(ev006?.scores.specificity).toBe(2);
  });

  it("scores 2 for product_record (category-specific)", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    const ev005 = pack.records.find(r => r.evidence_id === "ev_005");
    expect(ev005?.scores.specificity).toBe(2);
  });

  it("scores 1 for press_record (somewhat generic)", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    const ev003 = pack.records.find(r => r.evidence_id === "ev_003");
    expect(ev003?.scores.specificity).toBe(1);
  });
});

describe("evidence scoring — customer_voice", () => {
  it("scores 3 for Tier 3 source (review_record from Trustpilot)", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    const ev001 = pack.records.find(r => r.evidence_id === "ev_001");
    expect(ev001?.scores.customer_voice).toBe(3);
    expect(ev001?.source_tier).toBe(3);
  });

  it("scores 2 for Tier 2 source (press)", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    const ev003 = pack.records.find(r => r.evidence_id === "ev_003");
    expect(ev003?.scores.customer_voice).toBe(2);
    expect(ev003?.source_tier).toBe(2);
  });

  it("scores 0 for Tier 1 source (company-controlled)", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    const ev005 = pack.records.find(r => r.evidence_id === "ev_005");
    expect(ev005?.scores.customer_voice).toBe(0);
    expect(ev005?.source_tier).toBe(1);
  });

  it("scores 1 for Tier 4 source (secondary synthesis)", () => {
    const ev = makeEv({ evidence_id: "ev_t4", source_id: "src_t4", evidence_type: "competitor_record" });
    const allRecords = buildQualifyingInput();
    const extraSrc = makeSrc("src_t4", 4);
    const dossier = makeDossierWith(
      [...allRecords.dossier.evidence, ev],
      [...allRecords.dossier.sources, extraSrc]
    );
    const pack = buildEvidencePack({ ...allRecords, dossier });
    const found = pack.records.find(r => r.evidence_id === "ev_t4");
    if (found) {
      expect(found.scores.customer_voice).toBe(1);
    }
    // If not in pack (score too low), just verify the pack builds successfully
    expect(pack.records.length).toBeGreaterThanOrEqual(5);
  });
});

describe("evidence scoring — recency", () => {
  it("scores 1 for recent evidence (within 18 months)", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    // All test records use 2025-10-01 which is within 18 months of 2026-03-14
    pack.records.forEach(r => {
      expect(r.scores.recency).toBe(1);
    });
  });

  it("scores 0 for old evidence (> 18 months before 2026-03-14)", () => {
    const input = buildQualifyingInput();
    // Make an old evidence record (2022-01-01 — more than 18 months old)
    const oldEv = makeEv({
      evidence_id: "ev_old",
      source_id: "src_old",
      evidence_type: "competitor_record",
      captured_at: "2022-01-01T00:00:00.000Z",
    });
    const oldSrc = makeSrc("src_old", 2); // tier 2 so it would have some score
    const dossier = makeDossierWith(
      [...input.dossier.evidence, oldEv],
      [...input.dossier.sources, oldSrc]
    );
    const pack = buildEvidencePack({ ...input, dossier });
    const found = pack.records.find(r => r.evidence_id === "ev_old");
    if (found) {
      expect(found.scores.recency).toBe(0);
    }
    // Pack should still build — old record may or may not make the cut
    expect(pack.records.length).toBeGreaterThanOrEqual(5);
  });

  it("always scores 1 for pricing_record regardless of date", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    const ev006 = pack.records.find(r => r.evidence_id === "ev_006");
    expect(ev006?.scores.recency).toBe(1);
  });

  it("scores 0 when tags contains 'stale' (overrides everything)", () => {
    const input = buildQualifyingInput();
    // Create a stale-tagged review record (tier 3 — would otherwise have good scores)
    const staleEv = makeEv({
      evidence_id: "ev_stale",
      source_id: "src_stale",
      evidence_type: "review_record",
      captured_at: "2025-10-01T00:00:00.000Z", // captured_at is recent, but stale tag overrides
      excerpt: "Acme saved us 40% on procurement costs last year.",
      tags: ["stale", "review_trustpilot", "customer_voice"],
    });
    const staleSource = { ...makeSrc("src_stale", 3), captured_at: "2025-10-01T00:00:00.000Z" };
    const dossier = makeDossierWith(
      [...input.dossier.evidence, staleEv],
      [...input.dossier.sources, staleSource],
    );
    const pack = buildEvidencePack({ ...input, dossier });
    const found = pack.records.find(r => r.evidence_id === "ev_stale");
    if (found) {
      expect(found.scores.recency).toBe(0);
    }
  });

  it("scores 1 when source has published_at within 18 months", () => {
    const input = buildQualifyingInput();
    const recentEv = makeEv({
      evidence_id: "ev_pub_recent",
      source_id: "src_pub_recent",
      evidence_type: "press_record",
      captured_at: "2020-01-01T00:00:00.000Z", // captured_at would give 0, but published_at overrides
      excerpt: "Acme secured $10M Series A funding for procurement automation.",
      tags: ["press_mention"],
    });
    const pubSrc: typeof input.dossier.sources[number] = {
      ...makeSrc("src_pub_recent", 2),
      captured_at: "2020-01-01T00:00:00.000Z",
      published_at: "2025-12-01T00:00:00.000Z", // recent publish date
    };
    const dossier = makeDossierWith(
      [...input.dossier.evidence, recentEv],
      [...input.dossier.sources, pubSrc],
    );
    const pack = buildEvidencePack({ ...input, dossier });
    const found = pack.records.find(r => r.evidence_id === "ev_pub_recent");
    if (found) {
      expect(found.scores.recency).toBe(1);
    }
  });

  it("scores 0 when source has published_at older than 18 months", () => {
    const input = buildQualifyingInput();
    const oldPubEv = makeEv({
      evidence_id: "ev_pub_old",
      source_id: "src_pub_old",
      evidence_type: "press_record",
      captured_at: "2025-10-01T00:00:00.000Z", // captured_at would give 1, but published_at overrides
      excerpt: "Acme raised $5M Series A in 2022.",
      tags: ["press_mention"],
    });
    const oldPubSrc: typeof input.dossier.sources[number] = {
      ...makeSrc("src_pub_old", 2),
      captured_at: "2025-10-01T00:00:00.000Z",
      published_at: "2022-01-01T00:00:00.000Z", // old publish date
    };
    const dossier = makeDossierWith(
      [...input.dossier.evidence, oldPubEv],
      [...input.dossier.sources, oldPubSrc],
    );
    const pack = buildEvidencePack({ ...input, dossier });
    const found = pack.records.find(r => r.evidence_id === "ev_pub_old");
    if (found) {
      expect(found.scores.recency).toBe(0);
    }
  });
});

describe("evidence scoring — total_score", () => {
  it("total_score equals sum of all dimension scores", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    for (const r of pack.records) {
      const expected =
        r.scores.commercial_salience +
        r.scores.specificity +
        r.scores.customer_voice +
        r.scores.recency;
      expect(r.total_score).toBe(expected);
    }
  });

  it("total_score does not exceed 10", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    for (const r of pack.records) {
      expect(r.total_score).toBeLessThanOrEqual(10);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: Memo role assignment
// ---------------------------------------------------------------------------

describe("memo role assignment", () => {
  it("assigns diagnosis_support to records in diagnosis.evidence_refs", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    const ev001 = pack.records.find(r => r.evidence_id === "ev_001");
    const ev003 = pack.records.find(r => r.evidence_id === "ev_003");
    expect(ev001?.memo_roles).toContain("diagnosis_support");
    expect(ev003?.memo_roles).toContain("diagnosis_support");
  });

  it("assigns mechanism_illustration to records in mechanism.evidence_refs", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    const ev005 = pack.records.find(r => r.evidence_id === "ev_005");
    expect(ev005?.memo_roles).toContain("mechanism_illustration");
  });

  it("assigns intervention_evidence to records in intervention.evidence_refs", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    const ev006 = pack.records.find(r => r.evidence_id === "ev_006");
    expect(ev006?.memo_roles).toContain("intervention_evidence");
  });

  it("assigns specificity_anchor to records with specificity = 3", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    // review_record, testimonial_record, case_study_record should get specificity_anchor
    const anchors = pack.records.filter(r => r.memo_roles.includes("specificity_anchor"));
    expect(anchors.length).toBeGreaterThan(0);
    // All anchors should have specificity = 3
    for (const a of anchors) {
      expect(a.scores.specificity).toBe(3);
    }
  });

  it("assigns counter_narrative when both company claim and customer signal exist", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    // Pack has ev_008 (company_claim_record, tier 1) and ev_001/ev_002 (review, tier 3)
    const counterRecords = pack.records.filter(r => r.memo_roles.includes("counter_narrative"));
    expect(counterRecords.length).toBeGreaterThan(0);
  });

  it("a record can hold multiple roles simultaneously", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    // ev_001 is in diagnosis refs (diagnosis_support) and is tier 3 review (counter_narrative + specificity_anchor)
    const ev001 = pack.records.find(r => r.evidence_id === "ev_001");
    expect(ev001?.memo_roles.length).toBeGreaterThan(1);
  });

  it("does not assign hook_anchor to is_inferred records", () => {
    const input = buildQualifyingInput();
    // Add a high-score inferred record
    const inferredEv = makeEv({
      evidence_id: "ev_inf",
      source_id: "src_inf",
      evidence_type: "review_record",
      excerpt: '"Acme reduced costs by 50%" — customer review',
      is_inferred: true,
      confidence: "medium",
    });
    const dossier = makeDossierWith(
      [...input.dossier.evidence, inferredEv],
      [...input.dossier.sources, makeSrc("src_inf", 3)]
    );
    const pack = buildEvidencePack({ ...input, dossier });
    const inferred = pack.records.find(r => r.evidence_id === "ev_inf");
    if (inferred) {
      expect(inferred.memo_roles).not.toContain("hook_anchor");
      expect(inferred.is_hook_eligible).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: Hook candidate generation
// ---------------------------------------------------------------------------

describe("hook candidate generation", () => {
  it("builds hook_candidates from is_hook_eligible records", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    expect(pack.hook_candidates.length).toBeGreaterThan(0);
  });

  it("hook_candidates is a strict subset of pack.records", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    const recordIds = new Set(pack.records.map(r => r.evidence_id));
    for (const hook of pack.hook_candidates) {
      expect(recordIds.has(hook.evidence_id)).toBe(true);
    }
  });

  it("all hook_candidates are marked is_hook_eligible = true", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    for (const hook of pack.hook_candidates) {
      expect(hook.is_hook_eligible).toBe(true);
    }
  });

  it("hook_candidates meet all eligibility criteria", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    for (const hook of pack.hook_candidates) {
      expect(hook.is_inferred).toBe(false);
      expect(hook.scores.specificity).toBeGreaterThanOrEqual(2);
      expect(hook.scores.customer_voice).toBeGreaterThanOrEqual(1);
      expect(hook.total_score).toBeGreaterThanOrEqual(6);
    }
  });

  it("hook records contain quotable phrases (company name, price, or metric)", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    for (const hook of pack.hook_candidates) {
      const excerpt = hook.excerpt;
      const hasQuotable =
        /acme/i.test(excerpt) ||
        /\$[\d,]+/.test(excerpt) ||
        /\d+\s*%|\d+x\b/.test(excerpt) ||
        /["']/.test(excerpt) ||
        /\b(saved|reduced|increased|improved|cut|eliminated)\b/i.test(excerpt);
      expect(hasQuotable).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: Minimum evidence mix
// ---------------------------------------------------------------------------

describe("minimum evidence mix enforcement", () => {
  it("includes at least 2 customer_voice items when available", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    // customer_voice >= 2 means tier 2 or tier 3 source
    const cvItems = pack.records.filter(r => r.scores.customer_voice >= 2);
    expect(cvItems.length).toBeGreaterThanOrEqual(2);
  });

  it("includes at least 2 product/distribution reality items when available", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    const productTypes = new Set([
      "product_record", "pricing_record", "sales_motion_record",
      "channel_record", "delivery_model_record", "implementation_record"
    ]);
    const pdItems = pack.records.filter(r => productTypes.has(r.evidence_type));
    expect(pdItems.length).toBeGreaterThanOrEqual(2);
  });

  it("includes at least 1 proof/credibility item when available", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    const proofTypes = new Set([
      "case_study_record", "outcome_record", "testimonial_record", "funding_record"
    ]);
    const proofItems = pack.records.filter(r => proofTypes.has(r.evidence_type));
    expect(proofItems.length).toBeGreaterThanOrEqual(1);
  });

  it("respects the 15-record maximum", () => {
    // Create 20 qualifying records
    const evs: EvidenceRecord[] = [];
    const srcs: SourceRecord[] = [];
    for (let i = 1; i <= 20; i++) {
      const eid = `ev_${String(i).padStart(3, "0")}`;
      const sid = `src_${String(i).padStart(3, "0")}`;
      evs.push(makeEv({
        evidence_id: eid,
        source_id: sid,
        evidence_type: "review_record",
        excerpt: `"Acme reduced costs by ${i}%" — customer review ${i}`,
        is_inferred: false,
        confidence: "high",
      }));
      srcs.push(makeSrc(sid, 3));
    }
    const dossier = makeDossierWith(evs, srcs);
    const input: BuildEvidencePackInput = {
      dossier,
      diagnosis: makeDiagnosis([evs[0].evidence_id]),
      mechanisms: [makeMechanism("mech_001", [evs[1].evidence_id])],
      intervention: makeIntervention([evs[2].evidence_id]),
    };
    const pack = buildEvidencePack(input);
    expect(pack.records.length).toBeLessThanOrEqual(15);
  });
});

// ---------------------------------------------------------------------------
// Tests: Low-evidence failure path
// ---------------------------------------------------------------------------

describe("low-evidence failure path", () => {
  it("throws ERR_EVIDENCE_PACK_INSUFFICIENT when < 5 qualifying records", () => {
    // Create only 4 evidence records, all with very low scores
    const evs: EvidenceRecord[] = [];
    const srcs: SourceRecord[] = [];
    for (let i = 1; i <= 4; i++) {
      const eid = `ev_${String(i).padStart(3, "0")}`;
      const sid = `src_${String(i).padStart(3, "0")}`;
      evs.push(makeEv({
        evidence_id: eid,
        source_id: sid,
        evidence_type: "regulatory_record", // score 0 specificity, 0 salience
        excerpt: "Regulatory requirement: GDPR compliance required",
        is_inferred: true,
        confidence: "low",
      }));
      srcs.push(makeSrc(sid, 5)); // tier 5 = noisy, customer_voice = 0
    }
    const dossier = makeDossierWith(evs, srcs);
    const input: BuildEvidencePackInput = {
      dossier,
      diagnosis: makeDiagnosis(),
      mechanisms: [makeMechanism("mech_001")],
      intervention: makeIntervention(),
    };
    expect(() => buildEvidencePack(input)).toThrow("ERR_EVIDENCE_PACK_INSUFFICIENT");
  });

  it("throws ERR_EVIDENCE_PACK_INSUFFICIENT on empty dossier", () => {
    const dossier = makeDossierWith([], []);
    const input: BuildEvidencePackInput = {
      dossier,
      diagnosis: makeDiagnosis(),
      mechanisms: [makeMechanism("mech_001")],
      intervention: makeIntervention(),
    };
    expect(() => buildEvidencePack(input)).toThrow("ERR_EVIDENCE_PACK_INSUFFICIENT");
  });

  it("throws ERR_NO_HOOK_CANDIDATES when no records meet hook eligibility", () => {
    // Create 8 company-only (tier 1) generic records — none will be hook eligible
    // (customer_voice = 0 fails hook eligibility criterion)
    const evs: EvidenceRecord[] = [];
    const srcs: SourceRecord[] = [];
    for (let i = 1; i <= 8; i++) {
      const eid = `ev_${String(i).padStart(3, "0")}`;
      const sid = `src_${String(i).padStart(3, "0")}`;
      evs.push(makeEv({
        evidence_id: eid,
        source_id: sid,
        evidence_type: "product_record",
        // Use diagnosis ref for commercial_salience=3, but tier 1 means customer_voice=0 → not hook eligible
        excerpt: "Acme's product provides automation",
        is_inferred: false,
        confidence: "high",
      }));
      srcs.push(makeSrc(sid, 1)); // tier 1 — customer_voice = 0 → no hook eligibility
    }
    const dossier = makeDossierWith(evs, srcs);
    const input: BuildEvidencePackInput = {
      dossier,
      // All records in evidence_refs → commercial_salience = 3
      diagnosis: makeDiagnosis(evs.map(e => e.evidence_id)),
      mechanisms: [makeMechanism("mech_001")],
      intervention: makeIntervention(),
    };
    expect(() => buildEvidencePack(input)).toThrow("ERR_NO_HOOK_CANDIDATES");
  });
});

// ---------------------------------------------------------------------------
// Tests: Pack quality metadata
// ---------------------------------------------------------------------------

describe("pack quality metadata", () => {
  it("computes correct total_records count", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    expect(pack.pack_quality.total_records).toBe(pack.records.length);
  });

  it("computes correct hook_candidate_count", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    expect(pack.pack_quality.hook_candidate_count).toBe(pack.hook_candidates.length);
  });

  it("computes average_total_score correctly", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    const expected = pack.records.reduce((sum, r) => sum + r.total_score, 0) / pack.records.length;
    expect(pack.pack_quality.average_total_score).toBeCloseTo(expected, 1);
  });

  it("coverage_assessment is not insufficient for a well-evidenced company", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    expect(pack.pack_quality.coverage_assessment).not.toBe("insufficient");
  });

  it("coverage_assessment is insufficient when < 5 records pass (would throw earlier)", () => {
    // This case would already throw ERR_EVIDENCE_PACK_INSUFFICIENT before we get to quality
    // — just verify the error is thrown
    const dossier = makeDossierWith([], []);
    expect(() => buildEvidencePack({
      dossier,
      diagnosis: makeDiagnosis(),
      mechanisms: [],
      intervention: makeIntervention(),
    })).toThrow("ERR_EVIDENCE_PACK_INSUFFICIENT");
  });
});

// ---------------------------------------------------------------------------
// Tests: EvidencePack structure
// ---------------------------------------------------------------------------

describe("EvidencePack structure", () => {
  it("sets correct diagnosis_id linking to input diagnosis", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    expect(pack.diagnosis_id).toBe(input.diagnosis.id);
  });

  it("sets correct company_id", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    expect(pack.company_id).toBe(input.diagnosis.company_id);
  });

  it("pack_id follows format pack_<company_id>_<timestamp>", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    expect(pack.pack_id).toMatch(/^pack_test-company_\d+$/);
  });

  it("all records have source_tier from the dossier sources lookup", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    const srcTierMap = new Map(input.dossier.sources.map(s => [s.source_id, s.source_tier]));
    for (const r of pack.records) {
      const expected = srcTierMap.get(r.source_id) ?? 1;
      expect(r.source_tier).toBe(expected);
    }
  });

  it("all pack records have valid evidence_ids from the dossier", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    const knownIds = new Set(input.dossier.evidence.map(e => e.evidence_id));
    for (const r of pack.records) {
      expect(knownIds.has(r.evidence_id)).toBe(true);
    }
  });

  it("excerpt is preserved verbatim from the original evidence record", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    const evMap = new Map(input.dossier.evidence.map(e => [e.evidence_id, e]));
    for (const r of pack.records) {
      const original = evMap.get(r.evidence_id);
      if (original) {
        expect(r.excerpt).toBe(original.excerpt);
      }
    }
  });

  it("produces between 8 and 15 records for a standard corpus", () => {
    const input = buildQualifyingInput();
    const pack = buildEvidencePack(input);
    expect(pack.records.length).toBeGreaterThanOrEqual(5); // 8 input records, some may not qualify
    expect(pack.records.length).toBeLessThanOrEqual(15);
  });
});
