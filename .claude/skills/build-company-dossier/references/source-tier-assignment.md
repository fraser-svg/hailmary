# Source Tier Assignment

Every source record must include a `source_tier` field (integer 1-5). This tier drives validator warnings and confidence calibration.

## Tier Definitions

| Tier | Label | Description | Examples |
|------|-------|-------------|----------|
| 1 | Company-controlled | Published by the company itself | Official website, pricing page, docs, blog, press releases, investor decks |
| 2 | Authoritative external | Published by credible third parties | Investors, established media (TechCrunch, WSJ), regulatory filings, Crunchbase |
| 3 | Customer/market | Customer voice or market feedback | G2/Capterra reviews, testimonials with named speaker, customer case studies, Reddit/HN threads with identifiable users |
| 4 | Secondary synthesis | Aggregated or second-hand analysis | Directory listings, analyst blog posts, comparison sites without primary research |
| 5 | Noisy | Low-signal or unverifiable | Scraped fragments, unattributed reposts, SEO content farms, anonymous claims |

## Assignment Rules

1. **Assign tier based on the publisher, not the content.** A company blog post about customers is Tier 1 (company-controlled), not Tier 3.
2. **Customer voice embedded in company content is Tier 1.** A testimonial quote on the company homepage is Tier 1 because the company selected and may have edited it. A G2 review with the same quote is Tier 3.
3. **Named speakers with verifiable roles upgrade a source.** An anonymous Reddit post is Tier 4-5. A Reddit post from a user whose profile confirms they work at a customer company is Tier 3.
4. **News outlets that do original reporting are Tier 2.** News outlets that aggregate press releases are Tier 4.

## Interpretation Rules

- **Tier 4-5 sources are for discovery only.** They can suggest hypotheses but must not be the sole support for medium/high confidence claims.
- **Customer claims should be supported by Tier 3 sources.** Company-curated testimonials (Tier 1) are weaker evidence of customer truth than independent reviews (Tier 3).
- **The validator warns when:**
  - All evidence for a section comes from Tier 4-5 and confidence > "low"
  - Narrative gap customer evidence comes only from Tier 4-5
  - Evidence has `source_quality: "high"` but the source is Tier 4-5

## Source Record Template

```json
{
  "source_id": "src_001",
  "url": "https://...",
  "source_type": "company_homepage",
  "title": "...",
  "publisher_or_owner": "...",
  "captured_at": "<ISO timestamp>",
  "relevance_notes": ["..."],
  "source_tier": 1
}
```
