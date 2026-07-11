# ADR-009: assess-* Skills Are Output-Only; record-decision Is the Sole Adoption Writer

## Status

Accepted

## Date

2026-07-12

## Context

- Story #224 (Epic #209). The execution-layer dogfood surfaced an ambiguity in the `assess-*` capability skills: each skill both *assessed* a domain (produced a recommendation) **and** *persisted* the outcome (wrote its adoption file/section and composed `/record-decision`). Assessing therefore had side effects.
- `assess-debt` additionally risked backlog pollution: its remediation step composed `/record-decision`, and the broader design allowed auto-conversion of debt findings into tracked items. R7.2 requires that technical debt **never blocks a PR** and is surfaced without polluting the backlog.
- Two writers of adoption existed in practice (each assess-* skill + `/record-decision`), making "who owns the write" unclear and mirror/adoption drift easy to introduce.
- The system needs a clean separation between *assessing* (read + recommend) and *deciding/persisting* (write), so assessments are safe to run anywhere and persistence is explicit and gated.

## Options Considered

### Option 1: Keep assess-* as writers (status quo)

- **Description**: Each assess-* skill continues to write its adoption file/section and compose `/record-decision`.
- **Pros**: No change; fewer orchestration steps at call sites.
- **Cons**: Assessing has side effects; two effective writers; backlog-pollution risk via scan/auto-conversion; harder to run an assessment "just to see" without mutating the project.

### Option 2: assess-* output-only; record-decision as the sole adoption writer

- **Description**: Every `assess-*` skill becomes output-only — it produces a proposal (`{ content, target, decision-metadata }`) plus a human-facing report and writes nothing. The caller (a process skill such as `/bootstrap`/`/review`, or a human/agent) persists the proposal by composing `/record-decision(content, target)`. `record-decision` stays generic: it writes `content` to `target` and records the ADR/ADL, with no per-domain rendering logic. `assess-debt` loses any `$mode:scan` and never auto-creates items; debt is reported and never blocks (R7.2). Deliberate promotion to the backlog goes through `/write-issue` with a `tech-debt` label.
- **Pros**: Assessing has zero side effects; a single adoption writer (`record-decision`); no backlog pollution; clear contract (assess renders content, record-decision persists, caller orchestrates); mirror/adoption drift is easier to reason about.
- **Cons**: Composing flows must be rewired to persist proposals; a small orchestration step moves from the assess skill to the caller.

## Decision

Adopt **Option 2**. `assess-*` skills are **output-only**; `/record-decision` is the **single writer** of adoption files.

Contract (assess output → record-decision input):

- **assess-\*** output = `{ proposal }` carrying the **rendered adoption content + target** (the ready-to-write section/file body and which adoption file/section it belongs to), plus the human-facing report. It performs **no write**.
- **record-decision** input = `{ content, target, decision-metadata }`. It is a **generic persister**: writes `content` to `target` and records the ADR/ADL. It has no knowledge of tech-stack vs architecture vs testing formatting — that lives in each assess-* output.
- **Orchestration** = the **caller** wires the two: `assess-* (produce content+target) → [accept] → record-decision (write)`. In `bootstrap`/`review` the caller is the process skill; standalone, it is the human/agent.

Additional rules:

- `assess-debt` has **no `$mode:scan`** and performs **no auto-creation** of tech-debt items. Debt is **reported**, never blocks a PR (R7.2).
- `pair-process-review` reports newly introduced debt in its output and never auto-creates an issue nor blocks on debt grounds.
- Deliberate promotion of a debt/quality finding to the backlog is a manual, selective act via `/write-issue` with the `tech-debt` label — never a 100% auto-conversion.

## Consequences

### Benefits

- **No side effects when assessing** — assessments are safe to run for information only.
- **Single adoption writer** (`record-decision`) — one place owns adoption writes; the invariant "only record-decision touches adoption files; only assess-* renders its own content" is explicit.
- **No backlog pollution** — debt is surfaced without auto-creating cards; promotion is deliberate.
- **Debt never blocks PRs** (R7.2) is enforced by the review flow.

### Trade-offs and Limitations

- Composing flows (`bootstrap`, `review`) carry the persistence step (compose `/record-decision` per accepted proposal). This is a minor orchestration cost.
- If `/record-decision` is not installed, assess-* proposals cannot be persisted automatically — the proposal stands as a report and adoption stays unchanged until an explicit decision is made.
- `/implement` still composes `/assess-stack` for new dependencies; persistence there flows through its existing `/record-decision` step. The assess-stack composition wording in `/implement` is unaffected functionally.

## Adoption Impact

- `packages/knowledge-hub/dataset/.skills/capability/assess-*/SKILL.md` and their installed mirrors (`.claude/skills/pair-capability-assess-*/SKILL.md`) — rewritten to output-only (proposal + report; no writes; no `assess-debt` scan-mode).
- `packages/knowledge-hub/dataset/.skills/capability/record-decision/SKILL.md` (+ mirror) — documented as the sole adoption writer; accepts pre-rendered `{content, target}` (generic persist path).
- `packages/knowledge-hub/dataset/.skills/process/bootstrap/SKILL.md` and `.../process/review/SKILL.md` (+ mirrors) — rewired to persist assess-* proposals via `/record-decision`; review reports debt without creating issues or blocking.
- `packages/knowledge-hub/dataset/.skills/capability/write-issue/SKILL.md` (+ mirror) — retains a `tech-debt` topical label (`$labels`) for deliberate promotion.
- `apps/website/content/docs/reference/skills-catalog.mdx` — descriptions updated to reflect the output-only contract.
