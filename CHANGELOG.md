# Changelog

All notable changes to this project will be documented in this file.

## [0.1.6] - 2026-03-18

### Added
- Rory Sutherland review stage (V3-M5b): LLM evaluation of memo strategic interestingness using Opus 4.6
- 4 scoring dimensions: reframe_quality, behavioural_insight, asymmetric_opportunity, memorability (0-5 each, pass >= 3)
- Pub Test: binary pass/fail — "Would Rory bring this up at the pub?"
- Rory revision loop: if verdict is "revise", injects rewrite notes and produces one more write attempt
- 7th send gate criterion: rory_approval (hard fail when Rory rejects after revision)
- Additive quality score bonus: 0-10 pts from Rory's 4 dimensions, capped at 100
- `roryReviewEnabled` flag on V3PipelineInput (default true, set false to skip)
- 44 new tests across rory-review, send-gate, pipeline, and write-memo

### Changed
- `MarkdownMemo.attempt_number` widened from `1 | 2` to `1 | 2 | 3` (attempt 3 = Rory revision)
- `GateCriterion` union type expanded with `"rory_approval"`
- `GateSummary.total_criteria` changed from `6` to `6 | 7`
- `attemptWrite` helper hoisted above structural loop for reuse by Rory revision loop
- Pipeline structured logging uses JSON format for Rory review events

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
