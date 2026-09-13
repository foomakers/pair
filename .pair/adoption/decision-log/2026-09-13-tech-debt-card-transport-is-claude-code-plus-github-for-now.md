# Decision: tech debt — the engine's card transport is Claude Code + GitHub (`gh`) for now, recorded with its exit path

## Date

2026-09-13

## Status

Active

## Category

Process Decision

## Context

`cycle-state.mjs` reads and writes the story card through the GitHub CLI directly: `ac-hash` reads
the body (`gh issue view`), `apply-scope-decisions` edits it in place (`gh issue edit`, the
`extend-current-card` action) and opens the deferred card (`gh issue create`, `new-card`), and
`pr-comment.mjs` / `pr-state.mjs` / `cycle-runtime.mjs finalize` speak to the PR through `gh api`.
The adopted PM-tool resolution makes `/pair-capability-write-issue` the tool-agnostic writer, and
S5's `new-card` row says "use adopted issue writer and read back backlink". Nothing recorded the
coupling (T-9 fourth round, t9d-28 — a review HALT condition).

The maintainer's rule for this finding: route through the adopted writer if the change is contained;
otherwise record the debt. It is not contained: the writer is an agent skill (a judgment step with a
template, a cascade and a board update), while the six call sites are inside a deterministic script
that must run without an agent (`publish`, `apply-scope-decisions`) and whose whole point is that
no agent re-derives what it does (S1, canary v4/v5). Routing them through a skill would either put
an agent back inside the mechanical path or require a scripted, tool-agnostic issue API that does
not exist yet in the KB.

## Decision

1. **Constraint, stated:** the delivery workflow (`pair-implement-batch` 4.x) supports **GitHub as
   the code host AND the PM tool**, driven from **Claude Code**. Every card and PR write the engine
   performs is `gh` (`issue view|edit|create`, `api …/comments`, `api …/statuses`, `api …/labels`).
   An adopter on Jira/Linear/GitLab gets no card writes from the engine: `ac-hash` fails with a
   typed `gh … failed` error and the cycle refuses to prepare — it never pretends.
2. **Exit path:** a scripted issue transport behind one seam — `cardTransport({ read, edit, create,
   comment })` in `cycle-state.mjs` selected by the adoption's PM-tool/code-host resolution
   (way-of-working `## Assignment` / PM-tool section), GitHub being the first implementation and
   the `gh` calls moving behind it unchanged. The tool-agnostic `/pair-capability-write-issue`
   remains the human/agent-facing writer; the engine's transport mirrors its read-back discipline
   (write, then read the card back before claiming the state).
3. **Tracked as tech debt:** to be promoted by the maintainer to a `tech-debt` issue (this record is
   the source; the worker that wrote it opens no issues by rule). Until then this ADL is where the
   repository tracks it, next to the code it describes.

## Alternatives Considered

- **Route the six call sites through `/pair-capability-write-issue` now**: rejected — an agent
  inside the deterministic path, and a skill cannot be invoked from `cycle-state.mjs`.
- **Leave it undocumented**: rejected — the review HALT condition is exactly that.

## Consequences

- `batch-engine.mdx` and ADR-024 amendment (w) name the constraint; `pr-comment.mjs:17` already
  documents its own coupling.
- No behaviour change in this decision; the seam is the first task of the follow-up.

## References

- `.claude/skills/pair-workflow-*/scripts/cycle-state.mjs` (`cardHash`, `applyScopeDecisions`, `ensureDeferredIssue`)
- `.pair/knowledge/guidelines/technical-standards/coding-standards/technical-debt.md`
- ADR-024 amendment (w)
