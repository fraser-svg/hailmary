---
description: Discovers ICP-fit companies by searching VC portfolio pages, scoring each candidate against 6 dimensions, and writing a scored company list for downstream pipeline use.
trigger: discover-icp-companies
arguments: investor_names (comma-separated)
allowed-tools: WebSearch, WebFetch, Read, Write, Bash, Glob, Grep
---

# Discover ICP Companies

You are identifying companies that match the Columbus ICP (Ideal Customer Profile) by browsing VC portfolio pages. The output is a scored company list for downstream pipeline consumption.

## Input

- Investor names: `$ARGUMENTS` (comma-separated, e.g. "GTMfund, Frontline Ventures, Bessemer")

Parse the arguments: split on commas, trim whitespace. Each entry is a VC firm name.

If no arguments provided, use the default investor list:
1. GTMfund (gtmfund.com)
2. Forum Ventures (forumvc.com)
3. Frontline Ventures (frontline.vc)
4. Bessemer Venture Partners (bvp.com)
5. Entourage (entourage.vc)

## Output

Write to: `discovery/<run-id>/scored-companies.json`

The run-id is an ISO date slug: `YYYY-MM-DD` (one run per day is sufficient).

Use `mkdir -p discovery/<run-id>` first.

## ICP Criteria

Score each dimension 0-2: miss / partial / match.

| Dimension | Match (2) | Partial (1) | Miss (0) |
|-----------|-----------|-------------|----------|
| Geography | UK, Ireland | Nordics, Netherlands, Germany | Outside Europe |
| ARR range | £500k–£10M (or $600k–$12M) | £100k–£500k or £10M–£20M | Outside range or unknown |
| Stage | Seed, Series A, early Series B | Late Series B | Series C+ or pre-seed |
| Category | B2B SaaS, devtools | Software infra, vertical SaaS | Consumer, hardware, marketplace |
| Messy growth | 2+ signals: narrative evolving, founder-led sales, hiring sales/marketing, enterprise-vs-SMB tension, product-vs-services | 1 signal | No signals visible |
| Evidence depth | Trustpilot/G2 presence + case studies + press coverage | 2 of 3 | None visible |

**Qualification threshold:** total >= 7 out of 12

**Scoring guidance:**
- ARR is rarely public. Use funding round size as proxy: Seed ($1-5M) → likely £500k-£2M ARR. Series A ($5-20M) → likely £2M-£8M ARR. Score "unknown" as 0 with a note.
- "Messy growth" signals come from: homepage messaging changes (check web archive if available), job postings (sales/marketing hiring), case study mix (SMB vs enterprise), product page language (platform vs tool).
- Evidence depth: a quick WebSearch for `"<company>" trustpilot OR g2 OR review` reveals presence.

## Research Steps

### Step 1: Investor Portfolio Discovery

For each investor, run 2-3 WebSearch queries:
- `"<investor>" portfolio companies`
- `"<investor>" portfolio B2B SaaS`
- `"<investor>" portfolio startups list`

If the investor has a portfolio page, try WebFetch. If blocked (403, JS-rendered), use search snippets — they're sufficient.

Extract: company name + domain for each portfolio company found.

### Step 2: Deduplicate

Merge candidates across all investors. If the same company appears in multiple portfolios, note all source investors but score once.

Cap at 30 candidates. If more than 30 found, prioritize:
1. Companies appearing in multiple portfolios
2. Companies with clearer B2B SaaS signals from snippets
3. Companies with European presence signals

### Step 3: Candidate Qualification

For each candidate (up to 30), run 1-2 WebSearch queries:
- `"<company>" <domain>` — basic identity, geography, category
- `"<company>" funding series stage` — funding stage, round size

Score against the 6 ICP dimensions. Record rationale in `notes` array — one note per dimension explaining the score.

**Be honest about unknowns.** If you can't determine ARR range or stage from public data, score 0 and note "insufficient public data." Do not guess.

### Step 4: Write Output

Build the JSON output matching the `DiscoveryRun` type from `src/types/icp.ts`:

```json
{
  "run_id": "2026-03-17",
  "discovered_at": "<ISO timestamp>",
  "investors_searched": ["GTMfund", "Frontline Ventures", ...],
  "candidates_found": 28,
  "candidates_qualified": 12,
  "qualification_threshold": 7,
  "companies": [
    {
      "name": "Example Corp",
      "domain": "example.com",
      "source_investor": "Frontline Ventures",
      "source_url": "https://frontline.vc/portfolio",
      "score": {
        "geography": 2,
        "arr_range": 1,
        "stage": 2,
        "category": 2,
        "messy_growth": 1,
        "evidence_depth": 1,
        "total": 9,
        "qualified": true,
        "confidence": "medium",
        "notes": [
          "Geography: UK-based (London HQ) → 2",
          "ARR: Series A ($8M), estimated £2-5M ARR → 1 (uncertain)",
          "Stage: Series A (2024) → 2",
          "Category: B2B SaaS for procurement → 2",
          "Messy growth: hiring 2 sales roles, product page says 'platform' → 1",
          "Evidence depth: Trustpilot page exists, no G2, 1 case study → 1"
        ]
      },
      "discovered_at": "<ISO timestamp>",
      "raw_signals": {
        "funding": "Series A, $8M, 2024",
        "hq": "London, UK",
        "category": "procurement automation"
      }
    }
  ]
}
```

Sort companies by `score.total` descending (highest-fit first).

Write to `discovery/<run-id>/scored-companies.json`.

### Step 5: Report Summary

After writing the file, report to the user:
- Total candidates found across all investors
- Number qualified (score >= 7)
- Top 10 by score with one-line summaries
- Any investors where portfolio page was blocked (and what you fell back to)
- If 0 qualified: "No candidates met threshold 7/12. Consider adjusting criteria or adding investors."

## Search Budget

Target: ~50-75 WebSearch calls total.
- ~10-15 for investor portfolio discovery (2-3 per investor)
- ~40-60 for candidate qualification (1-2 per candidate)

No WebFetch needed for candidates — search snippets are sufficient for qualification scoring.

## Error Handling

- Blocked investor portfolio page → fall back to search snippets. Log the block.
- Company not found in search → score 0 on all dimensions, confidence "low", note "company not found in public search."
- Ambiguous company match (multiple companies with similar names) → include with notes explaining ambiguity, lower confidence.
- Never silently skip a candidate. Every candidate gets a score, even if all zeros.

## Excluding Known Companies

Before scoring, check if the company already exists in `src/report/runner/company-list.ts`. If it does, still include it in the output but add a note: "Already in legacy ICP list." This helps validate the scoring rubric against known-good companies.
