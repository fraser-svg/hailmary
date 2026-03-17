# Changelog

All notable changes to this project will be documented in this file.

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
