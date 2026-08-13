# Decision: The agent execution layer ships in the dataset, because a workflow without its agents cannot run

## Date

2026-08-13

## Status

Active

## Category

Convention Adoption

## Context

`2026-07-11-agent-execution-layer.md` states, in its Consequences:

> This layer lives under `.claude/` in this repo as an opt-in dogfood execution layer; it is
> **not part of the shipped dataset/KB**. Downstream projects continue to use the skills
> directly; the execution layer is offered separately once #255/#256/#219 formalize it.

That clause named this story as the point where the question would be reopened. US-219 is that
story: it turns `implement-batch` from pair's private orchestrator into a product artifact
installed by `pair install`.

The layer cannot stay unshipped once the workflow does. The workflow spawns subagents **by
type** — `agentType: 'implementer'`, `'reviewer'`, `'contract-generator'` — and those types
resolve against `.claude/agents/*.md`. An adopter who installs the workflow alone gets a file
that dispatches to definitions that are not there. The failure does not surface at install: it
surfaces at the first batch, as an unresolvable agent type, long after the install reported
success and with nothing in the output pointing at the missing half.

## Decision

**The agent execution layer ships.** `packages/knowledge-hub/dataset/.agents/` is installed into
`.claude/agents/` by an `agent-definitions` registry, alongside the `workflows` registry that
installs the engine itself. The ADL clause above is amended by this record rather than edited in
place: it was true when written, and the reasoning that made it true is still worth reading.

Three properties come with it:

- **Both install unconditionally, with no tool-gating** (ADR-017 §5). Workflows are
  Claude-Code-specific and inert under any other tool. Gating on a detected tool would make the
  artifact absent precisely where a later `pair update` could not add it back without re-running
  detection, and an inert file costs an adopter nothing.
- **The pair is the unit.** A guard scans the workflows' real dispatch sites and fails if a
  spawned `agentType` has no shipped definition, so the two registries cannot drift into a
  half-installed engine. `general-purpose` is exempt: it is a host built-in, not dataset content.
- **The dogfood copy and the shipped copy are one artifact.** Byte-equality guard in both
  directions — a fix applied only to `.claude/` would ship to nobody, and one applied only to the
  dataset would leave this repo running an older engine while claiming to dogfood the new one.

## Consequences

- **`pair install` now writes two directories it did not write before.** Both are `overwrite`
  registries, so an adopter's hand-edits to a shipped workflow are replaced on update. That is
  the same contract the skills registry already has, and the reason configuration lives in
  `args.pipeline` rather than in edits to the file.
- **The engine's behaviour becomes an adopter-visible contract.** The measured defaults it
  carries — the severity floor, `MAX_FIX_ROUNDS`, the deferred `needsHumanDecision` escalation,
  the one-first-review + one-final-remediation comment policy — each record a specific observed
  failure. They may be parameterized; removing one is now a breaking change for someone else,
  not a refactor.
- **Non-Claude-Code adopters carry inert files.** The cost is a few kilobytes and a directory
  they will not use. The docs note (AC8) is the only user-facing signal, derived from the
  dataset so the staleness gate keeps it true.
- **A second consumer now exists for the return contract.** `pair-loop` (#250) codes against
  `{ cards, maxParallelism, ... } -> { contracts, batch, died, note }`. Renaming a field there
  is no longer a local edit.

## Alternatives considered

- **Ship the workflow, leave the agents out.** Rejected: it is the half-installed state the
  guard above exists to make impossible. The adopter would get a file that cannot run and an
  error message pointing at a type, not at a missing install.
- **Gate the install on the detected tool.** Rejected per ADR-017 §5, and for a practical
  reason: detection at install time is a snapshot, and a user who switches tools later would
  need a re-install rather than an update to acquire files that were always harmless to have.
- **Keep the layer private and have adopters copy it.** Rejected: it is the status quo this
  story exists to end, and a copied artifact has no mirror guard — the drift this repo has
  measured repeatedly in its own mirrors would move to every adopter.

## Related

- Amends: `.pair/adoption/decision-log/2026-07-11-agent-execution-layer.md` (Consequences, final bullet)
- ADR-017 — automation loop (`pair-loop` over atom), §3 context isolation, §5 install policy, §6 parallelism cap
- #219 (this story) · #250 (`pair-loop`, the first external consumer)
