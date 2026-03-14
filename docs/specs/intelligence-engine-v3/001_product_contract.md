# Spec 001 — V3 Product Contract

## Purpose

Define the V3 product goal, success metric, behavioral contract, and system-level input/output surface.
All other V3 specs must satisfy the constraints in this document.

---

## Product Goal

Generate founder-facing strategic memos that are:

1. **Specific** — every factual claim traces to a real evidence record from researched sources
2. **Commercially sharp** — the memo reads like it was written by someone who understands the company's GTM, not a generic consultant
3. **Evidence-grounded** — the argument rests on observed signals, not analyst language
4. **Good enough for physical outreach** — the memo could be printed and handed to a founder at an event

The memo is the product. Everything else — research ingestion, V2 reasoning spine, evidence curation, adjudication — exists to make the memo better.

---

## Primary Objective

**Founder-conversion**: a founder reads the memo, believes the sender understands their business, and responds.

All design decisions in V3 must be evaluated against this objective. Analytical completeness and research breadth are secondary. A shorter, sharper, more specific memo beats a comprehensive but generic one every time.

---

## Scope

### V3 includes:
- Upstream research acquisition (site corpus, external research, corpus merge)
- Evidence normalization into V2-compatible Dossier via CorpusToDossierAdapter
- V2 reasoning spine (signals → GTM → tensions → patterns → diagnosis → mechanisms → intervention), preserved where possible
- Evidence pack curation (post-V2 reasoning)
- Diagnosis adjudication
- Memo brief construction
- Memo generation (LLM)
- Memo critique (adversarial LLM)
- Send gate (binary pass/fail + quality score)

### V3 does not include:
- Changes to existing V2 pipeline stages or types
- Changes to the dossier schema (schemas/company-dossier.schema.json)
- CRM integration or delivery infrastructure
- Human-in-the-loop review tooling (defined as a path; implementation deferred)
- Multi-company batch processing at V3 pipeline level

---

## Inputs

```typescript
interface V3PipelineInput {
  company: string;           // Company name, e.g. "Stripe"
  domain: string;            // Primary domain, e.g. "stripe.com"
  founderContext?: {          // Optional enrichment for personalized hook
    name?: string;           // Founder's name
    title?: string;          // e.g. "CEO", "Co-Founder"
    known_content?: string;  // Snippet from founder's public writing/posts
    linkedin_url?: string;   // For reference only (not fetched in V3)
  };
  crawl_config?: {
    optional_pages?: SitePageType[];  // Override default optional page selection
    max_pages?: number;               // Override ≤10 default
    max_tokens?: number;              // Override ≤20k default
  };
}
```

---

## Outputs

```typescript
interface V3PipelineResult {
  pipeline_version: "v3";
  company_id: string;
  run_id: string;
  generated_at: string;          // ISO 8601

  // Research layer
  corpus: ResearchCorpus;        // Raw research corpus (4 buckets)
  dossier: Dossier;              // V2-compatible dossier from CorpusToDossierAdapter

  // V2 reasoning layer (unchanged types)
  v2Result: V2PipelineResult;    // signals, gtm, tensions, patterns, diagnosis, mechanisms, intervention

  // V3 memo layer
  evidencePack: EvidencePack;
  adjudication: AdjudicationResult;
  memoBrief: MemoBrief;
  memo: MarkdownMemo;
  criticResult: MemoCriticResult;
  sendGate: SendGateResult;
}
```

---

## Behavioral Constraints

1. **V2 reasoning spine must not be modified.** V3 feeds it richer inputs; V3 consumes its outputs differently. The stage interfaces remain unchanged.
2. **No invented facts.** Every claim in the memo must trace to an evidence record in the EvidencePack. The LLM writer is fully constrained by the MemoBrief.
3. **Unknown is better than guessed.** If research yields insufficient evidence to support a diagnosis, adjudication must abort rather than produce a speculative memo.
4. **One memo per run.** V3 produces exactly one memo per company run. It is either `ready_to_send` (pass) or blocked (fail) with explicit reasons.
5. **The memo must not be generic.** A memo that could plausibly be sent to any SaaS company fails the critic's genericity test and is blocked at the send gate.
6. **Evidence provenance is mandatory.** Every memo section must reference at least one EvidencePack record. Sections with zero evidence references are a hard failure.

---

## Acceptance Criteria

The V3 system passes acceptance when:

1. A run from `company/domain` input produces a `V3PipelineResult` with all fields populated
2. The send gate passes on at least one of: Stripe, Trigger.dev, or Omnea (known V2 eval companies)
3. The generated memo is rejected (correctly) by the send gate when the evidence pack is below quality threshold (inject a degraded corpus in eval)
4. The memo contains ≥ 3 company-specific facts not in the thesis statement
5. No banned phrase appears in the final memo
6. The memo for each eval company is demonstrably different in content (specificity test)
7. The full pipeline completes in ≤ 5 minutes for a standard company run

---

## Hard Failure Conditions

The system must surface an error (not produce a memo) if:

| Condition | Error code |
|-----------|------------|
| Site corpus fetch returns 0 pages | `ERR_CORPUS_EMPTY` |
| CorpusToDossierAdapter produces a Dossier that fails schema validation | `ERR_DOSSIER_INVALID` |
| V2 pipeline returns no diagnosis | `ERR_V2_NO_DIAGNOSIS` |
| Adjudication mode = `abort` | `ERR_ADJUDICATION_ABORT` |
| EvidencePack has < 5 scoreable records | `ERR_EVIDENCE_PACK_INSUFFICIENT` |
| Memo writer exhausts revision loop (2 attempts) and still fails critic | `ERR_MEMO_CRITIC_FAIL` |
| Send gate blocks on hard failure (genericity test fail or banned phrase) | `ERR_SEND_GATE_HARD_BLOCK` |

---

## Version

- Spec version: 001
- Pipeline version: v3
- V2 spine version: v2 (unchanged)
- Compatible with dossier schema: Spec 002 (V1)
