# Spec 008: Repository Structure and Implementation Plan

## Status

Draft v1

## Purpose

Define the repository structure, the role of each major folder and file, how Claude Code should use them, and the implementation sequence for building the Company Intelligence Engine.

This spec exists to stop the project from becoming:

* a pile of prompts
* a vague Claude playground
* an unstructured agent experiment
* a repo where product logic, workflow logic, and validation logic are mixed together

The goal is a repo that is:

* clear
* modular
* spec-driven
* easy for Claude Code to navigate
* easy for you to review and control

---

## Core principle

The repo should reflect the product architecture.

That means:

* **specs** define truth
* **schemas** define contracts
* **code** implements deterministic behavior
* **skills** implement reusable Claude workflows
* **agents** define specialist AI roles
* **tests/evals** judge quality
* **runs** store generated artifacts

The structure should make that obvious.

---

## Repository design goals

The repo should:

1. make the product easy to understand at a glance
2. separate source-of-truth docs from implementation
3. separate deterministic code from AI workflow files
4. keep evaluation first-class
5. make Claude Code easy to steer
6. support future growth without rework

---

# Recommended repository structure

```text
/company-intelligence-engine
  CLAUDE.md
  .mcp.json
  package.json
  tsconfig.json
  README.md

  /docs
    /specs
      001-product-thesis.md
      002-dossier-schema.md
      003-evidence-model.md
      004-source-priority-and-inference-rules.md
      005-agent-contracts.md
      006-skill-contracts.md
      007-evaluation-and-acceptance-criteria.md
      008-repository-structure-and-implementation-plan.md
    /architecture
      system-overview.md
      pipeline-diagram.md
      agent-map.md
      skill-map.md
      source-priority.md
      confidence-scoring.md
    /decisions
      001-output-is-ai-first.md
      002-public-sources-only-v1.md
      003-evidence-before-inference.md

  /schemas
    company-dossier.schema.json
    source-record.schema.json
    evidence-record.schema.json
    company-profile.schema.json
    product-and-offer.schema.json
    gtm-model.schema.json
    customer-and-personas.schema.json
    competitors.schema.json
    market-and-macro.schema.json
    narrative-intelligence.schema.json
    strategic-risks.schema.json
    confidence-and-gaps.schema.json

  /src
    /types
      dossier.ts
      evidence.ts
      source.ts
      agents.ts

    /orchestrator
      run-company-research.ts
      execution-order.ts
      merge-agent-outputs.ts

    /collectors
      collect-company-pages.ts
      collect-signals.ts
      collect-competitor-pages.ts
      collect-customer-evidence.ts

    /normalizers
      normalize-source-record.ts
      normalize-evidence-record.ts
      dedupe-evidence.ts

    /agents
      identity-resolution.ts
      company-profile.ts
      gtm-intelligence.ts
      competitor-intelligence.ts
      narrative-intelligence.ts
      market-and-risk.ts
      dossier-synthesizer.ts

    /validation
      validate-dossier.ts
      validate-evidence-links.ts
      validate-inference-labels.ts
      validate-thresholds.ts
      detect-contradictions.ts

    /utils
      ids.ts
      timestamps.ts
      enums.ts
      logging.ts

  /.claude
    /skills
      company-basics-research/
        SKILL.md
        references/
        scripts/
      pricing-and-sales-motion-signals/
        SKILL.md
        references/
        scripts/
      customer-language-extraction/
        SKILL.md
        references/
        scripts/
      competitor-mapping/
        SKILL.md
        references/
        scripts/
      market-macro-scan/
        SKILL.md
        references/
        scripts/
      signal-detection/
        SKILL.md
        references/
        scripts/
      narrative-gap-analysis/
        SKILL.md
        references/
        scripts/
      dossier-validation/
        SKILL.md
        references/
        scripts/

    /agents
      identity-resolution.md
      company-profile.md
      gtm-intelligence.md
      competitor-intelligence.md
      narrative-intelligence.md
      market-and-risk.md
      dossier-synthesizer.md

    /rules
      dossier-rules.md
      evidence-rules.md
      inference-rules.md
      source-priority-rules.md
      validation-rules.md

  /tests
    /unit
    /fixtures
    /goldens
    /evals
      benchmark-companies.json
      scorecard-template.json
      review-rubric.md
      gates.md

  /runs
    /<company-slug>/
      raw/
      normalized/
      outputs/
        dossier.json
        validation-report.json
        scorecard.json
        trace.json
```

---

# File and folder responsibilities

## `CLAUDE.md`

This is the project constitution.

It should tell Claude Code:

* what the product does
* what the canonical output is
* what rules must never be broken
* what order to work in
* what commands to run for validation

It should be short, sharp, and operational.

It should **not** contain all the specs pasted in full.

---

## `.mcp.json`

This should define project-level MCP tools and shared integrations if you use them.

Use it for:

* shared servers
* controlled project tooling
* team-consistent setup

Do not bury product rules in here.

---

## `/docs/specs`

This is the source of truth for product behavior.

These specs should be written before implementation changes.

Rule:
If the behavior changes, update the spec first.

---

## `/docs/architecture`

This is where you explain how the system fits together.

These docs are for:

* navigation
* onboarding
* high-level design
* keeping Claude Code aligned

These are not the primary source of truth. The specs are.

---

## `/docs/decisions`

Use this for small architecture decision records.

Examples:

* why output is AI-first
* why V1 is public-source only
* why evidence is separate from sources

This prevents forgetting why you chose something.

---

## `/schemas`

This is where the canonical JSON contracts live.

These are used by:

* validators
* type generation
* synthesis
* test fixtures

Every major dossier section should eventually have its own schema file.

---

## `/src`

This is deterministic implementation code.

Important rule:
If something can be done reliably in code, do it in code.

Use code for:

* orchestration
* ID generation
* validation
* merging
* deduplication
* serialization
* thresholds
* contradiction detection

Do not push deterministic logic into skills if it belongs here.

---

## `/.claude/skills`

This is the reusable Claude workflow layer.

Each skill should map back to Spec 006.

Skills are for:

* repeatable research workflows
* evidence extraction patterns
* structured analysis steps
* domain-specific operating instructions

Not for owning the whole product.

---

## `/.claude/agents`

These files define each specialist agent’s behavior and responsibilities.

Each agent file should align with Spec 005.

These should be narrow and contract-driven.

---

## `/.claude/rules`

These are small operational rule files that Claude can reference.

Examples:

* inference rules
* evidence rules
* validation rules

These help keep `CLAUDE.md` compact.

---

## `/tests`

This is where confidence is built.

You need:

* unit tests for deterministic logic
* fixtures for known data
* goldens for stable expected outputs
* evals for full-run quality

This folder should grow early, not late.

---

## `/runs`

This stores per-company artifacts.

Useful for:

* debugging
* comparing runs
* reviewing evidence flow
* evaluating regressions

Do not mix run artifacts into source folders.

---

# What goes in `CLAUDE.md`

Your `CLAUDE.md` should include:

## 1. Product summary

A short explanation of the engine.

## 2. Non-negotiable rules

Examples:

* output must follow canonical dossier schema
* all major claims require evidence IDs
* inference must be labeled
* narrative gaps require company-side and customer-side support
* unknown is better than guessed

## 3. Build workflow

Examples:

* read specs before implementation
* update spec before changing behavior
* run validation after edits
* do not collapse missing sections

## 4. Important commands

Examples:

* test
* validate schemas
* run benchmark suite

## 5. Repo landmarks

Examples:

* where specs live
* where schemas live
* where skills live
* where evals live

Keep it useful. Keep it brief.

---

# What belongs in code vs skills vs agents

## Code

Use for:

* schema validation
* evidence-link checks
* ID creation
* object merging
* contradiction detection
* threshold enforcement
* output writing

## Skills

Use for:

* reusable research workflows
* extraction procedures
* narrative analysis processes
* competitor discovery workflow

## Agents

Use for:

* domain ownership
* specialist interpretation
* structured section outputs
* disciplined handoffs

## Specs

Use for:

* product rules
* contracts
* required behavior
* acceptance standards

This separation matters a lot.

---

# Implementation sequence

Build this in phases.

---

## Phase 1: Foundation

### Goal

Create the minimum structure and contracts.

### Deliverables

* repo scaffold
* `CLAUDE.md`
* specs 001–008 saved
* schema folder created
* base TypeScript types created
* empty dossier template created

### Tickets

* initialize repo
* create docs/specs structure
* create schema placeholders
* create base dossier type
* create base source and evidence types
* write `README.md`
* write initial `CLAUDE.md`

### Exit condition

The repo has clear structure and canonical product docs.

---

## Phase 2: Schema and validation core

### Goal

Make the dossier contract real.

### Deliverables

* dossier schema files
* evidence schema
* source schema
* schema validator
* empty dossier generator
* evidence-link validator stub

### Tickets

* implement `company-dossier.schema.json`
* implement `source-record.schema.json`
* implement `evidence-record.schema.json`
* build schema validation command
* build empty dossier template generator
* build confidence enum and shared types

### Exit condition

You can generate and validate an empty but correct dossier.

---

## Phase 3: Orchestrator and core pipeline skeleton

### Goal

Create the run flow without deep intelligence yet.

### Deliverables

* orchestrator
* execution order
* run artifact writer
* agent result merger
* trace file generation

### Tickets

* create `run-company-research.ts`
* define agent execution order
* define base agent interfaces
* create `merge-agent-outputs.ts`
* write dossier and trace outputs to `/runs`

### Exit condition

A run can execute end-to-end with placeholder agents.

---

## Phase 4: Company profile and identity

### Goal

Build the first real intelligence slice.

### Deliverables

* Identity Resolution Agent
* Company Profile Agent
* company-basics skill
* source normalization for company basics

### Tickets

* write identity agent contract code
* write company profile agent contract code
* create `company-basics-research` skill
* create first evidence records
* test identity ambiguity handling

### Exit condition

The system can produce company basics in structured form.

---

## Phase 5: Narrative intelligence core

### Goal

Build your differentiator early.

### Deliverables

* customer-language extraction
* narrative-gap analysis
* narrative section output
* support thresholds for gaps

### Tickets

* create `customer-language-extraction` skill
* create `narrative-gap-analysis` skill
* implement narrative evidence types
* implement narrative threshold validator
* create 3 benchmark companies for narrative testing

### Exit condition

The system can produce a low- to medium-confidence narrative section with evidence links.

---

## Phase 6: GTM and signals

### Goal

Add commercial context.

### Deliverables

* GTM Intelligence Agent
* pricing/sales motion skill
* signal-detection skill
* buyer persona support

### Tickets

* implement GTM section schema logic
* implement pricing record normalization
* implement hiring signal normalization
* create GTM agent tests
* add signal records to dossier

### Exit condition

The system can infer a credible GTM model with explicit support.

---

## Phase 7: Competitors

### Goal

Add competitive landscape.

### Deliverables

* Competitor Intelligence Agent
* competitor mapping skill
* competitor rationale model
* overlap and gap logic

### Tickets

* implement competitor evidence types
* implement competitor agent
* create competitor ambiguity handling
* create competitor eval fixtures

### Exit condition

The system can return plausible evidence-backed competitors without padding.

---

## Phase 8: Market, macro, and risk

### Goal

Add external context carefully.

### Deliverables

* Market and Risk Agent
* market-macro skill
* strategic risk section
* contradiction reporting improvements

### Tickets

* implement macro evidence types
* create market and risk agent
* add economic/regulatory exposure handling
* add risk observation logic

### Exit condition

The system can provide external context without becoming speculative.

---

## Phase 9: Validation and evaluation hardening

### Goal

Make the engine trustworthy.

### Deliverables

* unsupported-claim checker
* contradiction checker
* benchmark runner
* scorecard generator
* acceptance gates

### Tickets

* build eval runner
* build scorecard output
* create 10 benchmark companies
* implement regression checks
* create gates.md workflow

### Exit condition

You can measure whether the system is actually improving.

---

## Phase 10: Skill and agent refinement

### Goal

Improve reliability and maintainability.

### Deliverables

* cleaned-up skill descriptions
* agent prompt hardening
* reduced overlap
* better tool restrictions
* improved confidence calibration

### Exit condition

The system feels disciplined, modular, and ready for broader use.

---

# First implementation tickets I would create

These are the first concrete tickets I’d put into the backlog.

## Foundation

1. Initialize repo structure
2. Add specs 001–008 to `/docs/specs`
3. Create initial `CLAUDE.md`
4. Create empty schema files
5. Create base TypeScript interfaces for dossier, source, and evidence

## Core contracts

6. Implement canonical dossier JSON schema
7. Implement source record schema
8. Implement evidence record schema
9. Implement empty dossier generator
10. Implement schema validation command

## Pipeline skeleton

11. Create orchestrator entrypoint
12. Define agent base contract
13. Define run artifact writer
14. Define merge function for agent outputs
15. Create placeholder agents that return valid empty sections

## First intelligence

16. Build Identity Resolution Agent
17. Build Company Profile Agent
18. Create `company-basics-research` skill
19. Create first benchmark fixture
20. Create first validation report format

---

# Definition of done for V1 foundation

The foundation is done when:

* repo structure exists
* specs are present and versioned
* canonical schemas validate
* an empty dossier can be generated
* placeholder pipeline runs end-to-end
* one or two real agents populate valid sections
* validation artifacts are written
* the project is steerable through Claude Code without confusion

---

# Rules for future changes

## Rule 1

Change the spec before changing behavior.

## Rule 2

Do not add new dossier fields casually.
Update schema and validation first.

## Rule 3

Do not add a new skill unless it solves a repeated workflow.

## Rule 4

Do not move deterministic logic into prompts when it belongs in code.

## Rule 5

Do not accept impressive prose as proof of product quality.

## Rule 6

Every meaningful new behavior should come with:

* schema consideration
* validation consideration
* eval consideration

---

# Success criteria

Spec 008 is successful when:

* the repo structure reflects the product architecture
* Claude Code can navigate the repo cleanly
* the separation between specs, schemas, code, skills, agents, and evals is obvious
* implementation can proceed phase by phase without chaos
* you can tell at any moment what to build next

---

# Failure modes

This spec fails if:

* specs are written but not connected to code
* CLAUDE.md becomes a dumping ground
* skills replace proper implementation
* agents overlap heavily
* evals are treated as optional
* run artifacts are not preserved
* the repo grows without a clear contract structure

---

# What you should do with this spec

Save it as:

```text
/docs/specs/008-repository-structure-and-implementation-plan.md
```

Then immediately create:

```text
/docs/architecture/system-overview.md
/docs/architecture/pipeline-diagram.md
/docs/architecture/agent-map.md
/docs/architecture/skill-map.md
CLAUDE.md
README.md
```

Then scaffold the actual repo folders before writing more prompts.

---

# What you should do with all the specs now

Now that you have Specs 001–008, here is the right move:

## 1. Create the repo skeleton

Make the folders exactly as defined in Spec 008.

## 2. Save every spec as a real markdown file

Do not keep them in chat only.

## 3. Create a backlog from the specs

Turn each spec into tickets.

## 4. Write `CLAUDE.md`

Use the specs to create project rules.

## 5. Start with foundation, schema, and validation

Not with “smart agents.”

## 6. Build one thin vertical slice

Best choice:

* identity
* company profile
* evidence records
* dossier output
* validation

## 7. Add narrative intelligence early

Because that is your wedge and core differentiator.

---
