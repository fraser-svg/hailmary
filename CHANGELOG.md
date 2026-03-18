# Changelog

All notable changes to this project will be documented in this file.

## [0.1.7] - 2026-03-18

### Added
- 20 Golden Rules of exceptional writing encoded in memo system prompt (20 Laws as named directives)
- Dynamic company-specific section headers: LLM returns optional `_header` fields per section; rendered as `## {header}` or omitted when blank
- 90+ hard-banned phrases enforced at generation time, organised by category (AI vocabulary fingerprints, AI phrase patterns, structural AI patterns, performative balance)
- Structured `banned_phrase_hit` log event emitted on `ERR_BANNED_PHRASE` with `company_id`, `attempt_number`, and matched phrase
- `header?: string` field on `MemoSection` type for downstream consumers

### Changed
- System prompt rewritten around 20 Laws: conviction (Law 4), rhythm variance (Law 3, 15), contractions required (Law 13), no tricolon (Law 18), slippery slide (Law 14), honesty as persuasion (Law 17), physical object rule (Law 20)
- WRITING ANTI-PATTERNS section added to system prompt with dead vocabulary list and forbidden phrase patterns
- `tone_compliance` critic rubric expanded: now explicitly tests tricolon detection, sentence length variance, contractions-as-AI-tell, honesty/acknowledgment
- Full banned phrase list now appears in system prompt reinforcement (removed accidental `.slice(0, 25)` cap)
- Rory Sutherland review stage removed (superseded by 20 Golden Rules approach)

### Fixed
- Banned phrase sample in system prompt was silently truncated to first 25 entries; all 90+ entries now included

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
- Pipeline resilience: site corpus acquisition failures (homepage fetch, Playwright errors) now degrade gracefully instead of crashing the pipeline
- Writer prompt: 7 CEO memo doctrine principles added — scenario-before-naming, hedging split (diagnosis vs implication), network effect costs, deployable phrases, CTA variation, thesis compression, no-bloat rule
- Hedging mode split: `full_confidence` keeps full HEDGING BAN, `conditional` gets nuanced HEDGING RULE (hedge diagnosis, assert implication)
- CTA instruction changed from "use verbatim or paraphrase" to company-specific variation guidance
- Critic rubric updated: pattern_clarity now evaluates scenario demonstration, commercial_sharpness checks network effect costs, cta_clarity checks deployable phrases
- Genericity revision feedback strengthened with actionable rewrite instructions
- Banned phrase retry: pipeline injects targeted reinforcement into confidence_caveats on ERR_BANNED_PHRASE
- JSON parse fallback: writer response parser now extracts JSON from LLM preamble text
- `MarkdownMemo.attempt_number` widened from `1 | 2` to `1 | 2 | 3` (attempt 3 = Rory revision)
- `GateCriterion` union type expanded with `"rory_approval"`
- `GateSummary.total_criteria` changed from `6` to `6 | 7`
- `attemptWrite` helper hoisted above structural loop for reuse by Rory revision loop
- Pipeline structured logging uses JSON format for Rory review events

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
