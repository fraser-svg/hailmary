# TODOS

## P2 — Structured log on send gate genericity failure

**What:** When `runSendGate` fails with `genericity` reason, emit a structured log
with evidence spine records (ev_IDs, roles, scores) that triggered the failure.

**Why:** Currently you know the gate failed but not which spine records caused it.
Triage requires re-running the full pipeline. One log line makes it instant.

**Where:** `src/intelligence-v3/memo/run-send-gate.ts` — add to gate failure branch.
`MemoBrief` (passed to gate) already contains `evidence_spine`.

**Effort:** S | **Depends on:** nothing
