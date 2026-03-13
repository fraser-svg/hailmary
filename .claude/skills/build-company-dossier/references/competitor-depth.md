# Competitor Depth Analysis

This reference guides Step 5 (Competitors) of the research workflow. The goal is to move beyond listing competitors toward understanding how narratives overlap, diverge, and create openings.

## Four Analysis Dimensions

### 1. Messaging Overlap
Where does the target company sound the same as competitors?

Look for:
- Shared taglines or value proposition structures ("all-in-one", "enterprise-grade", "AI-powered")
- Identical benefit claims ("saves time", "reduces cost", "increases productivity")
- Category positioning that could apply to any competitor

Record in: `competitors.positioning_overlaps`

### 2. Undifferentiated Positioning
Where do multiple competitors claim the same value with no evidence of superiority?

Look for:
- Multiple companies claiming the same differentiator
- "Best in class" claims without supporting evidence
- Feature parity across competitors where no one has a clear edge

Record in: `competitors.competitive_gaps`

### 3. Narrative Winners
Where does a competitor have stronger customer evidence for a shared claim?

Look for:
- Competitor with more customer testimonials for the same benefit
- Competitor whose customer language matches their positioning (alignment)
- Competitor that owns a specific keyword or category in customer perception

Record in: `competitors.competitive_observations`

### 4. Accidental Differentiation
Where does the target company have a wedge that customers love but the company doesn't emphasize?

Look for:
- Customer reviews praising something not in the marketing
- Features or behaviors customers mention that competitors lack
- "Hidden gem" language in reviews ("the thing nobody talks about is...")

Record in: `narrative_intelligence.hidden_differentiators` and `competitors.competitive_observations`

## Evidence Typing

| Finding | Evidence Type | Notes |
|---------|--------------|-------|
| Direct competitor identified | `competitor_record` | Include `why_included` |
| Side-by-side comparison found | `comparison_record` | Note source tier |
| Positioning claim | `positioning_record` | Tag with company name |
| Observed differentiator | `differentiation_record` | Note if customer-observed vs company-claimed |

## Source Tier Discipline

Directories and comparison sites (e.g., G2 category pages, Capterra comparisons, "best X tools" listicles) can help **discover** competitors but should not be primary support for strong differentiation claims. These are typically Tier 4 sources.

For differentiation claims to reach medium/high confidence, support them with:
- Tier 1: The competitor's own positioning (confirms what they claim)
- Tier 3: Customer evidence showing how the market actually perceives the difference

## How Competitor Depth Feeds Intelligence

Deep competitor analysis directly improves:

- **narrative_intelligence.narrative_gaps** — if a competitor owns a narrative the target claims, that's a positioning risk
- **strategic_risks.competitive_risks** — undifferentiated positioning is a strategic vulnerability
- **narrative_intelligence.messaging_opportunities** — accidental differentiation is an untapped opportunity
- **confidence_and_gaps** — competitor research quality affects confidence in positioning claims
