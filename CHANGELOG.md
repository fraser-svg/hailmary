# Changelog

All notable changes to this project will be documented in this file.

## [0.1.6] - 2026-03-18

### Changed
- Pipeline resilience: site corpus acquisition failures (homepage fetch, Playwright errors) now degrade gracefully instead of crashing the pipeline
- Writer prompt: 7 CEO memo doctrine principles added — scenario-before-naming, hedging split (diagnosis vs implication), network effect costs, deployable phrases, CTA variation, thesis compression, no-bloat rule
- Hedging mode split: `full_confidence` keeps full HEDGING BAN, `conditional` gets nuanced HEDGING RULE (hedge diagnosis, assert implication)
- CTA instruction changed from "use verbatim or paraphrase" to company-specific variation guidance
- Critic rubric updated: pattern_clarity now evaluates scenario demonstration, commercial_sharpness checks network effect costs, cta_clarity checks deployable phrases
- Genericity revision feedback strengthened with actionable rewrite instructions
- Banned phrase retry: pipeline injects targeted reinforcement into confidence_caveats on ERR_BANNED_PHRASE
- JSON parse fallback: writer response parser now extracts JSON from LLM preamble text

### Fixed
- Banned phrase truncation: removed `.slice(0, 25)` cap that silently dropped banned phrases beyond index 25
- Revision prompt: added "Output JSON only" instruction to prevent LLM preamble on retry attempts

### Removed
- `CTA_BY_INTERVENTION` deprecated map and its 3 regression tests (dead code — all 6 entries pointed to UNIVERSAL_CTA)

## [0.1.5] - 2026-03-17

### Changed
- ICP discovery: geography scoring tightened to UK-only (UK=2, everything else=0)
- ICP discovery: default investor list replaced with 5 UK seed-stage VCs (Seedcamp, Notion Capital, LocalGlobe, Frontline Ventures, Stride.VC)
- ICP discovery: evidence_depth dimension redefined for seed-stage signals (blog/content, customer logos, press/funding) instead of Trustpilot/G2

## [0.1.4] - 2026-03-17

### Changed
- Memo structure rewritten to Dean & Wiseman 7-section format (title_block, executive_thesis, what_we_observed, the_pattern, what_this_means, what_this_changes, cta)
- Word budget raised from 650-850 to 900-1100 (hard max 1400) for richer, more substantive memos
- Evidence spine density increased from 3-5 to 5-8 records per memo
- System prompt fully rewritten: 70% generative guidance, 30% constraints
- LLM config: temperature 0.5 (was 0.3), max_tokens 4000 (was 2500), model claude-opus-4-6
- Critic rubric: signal_density expects 5-7 signals, commercial_sharpness requires per-paragraph density
- Send gate thresholds aligned to new word range (400-1400)
- Title block now generated deterministically in code, not by LLM

### Added
- Shared `countWords` utility in `memo/utils.ts` (DRY: replaces 3 local implementations)
- `LLMSectionName` type (6 values, excludes deterministic title_block)
- Structured memo-quality log line after generation

## [0.1.3] - 2026-03-10

- ICP discovery skill + scored company targeting
- Parallel U1+U2 acquisition, community routing, negative signals, V3-U3.5 enrichment
- Dean & Wiseman memo doctrine + pipeline infrastructure
- Counter-narrative acquisition (Spec 008)
- V4 synthesis layer + acquisition providers + eval harness (671 tests)
