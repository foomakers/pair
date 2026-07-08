# Decision: `pair-capability-grill` Runs Standalone Without Composition Context

## Date

2026-07-08

## Status

Active

## Category

Process Decision

## Context

Story #229 (`pair-capability-grill` — reusable interview engine) needed to decide whether the skill requires a composing caller (`/pair-process-brainstorm`, `/pair-process-refine-story`) to function, or whether it can run directly when a human invokes it standalone (e.g. "grill me on X").

During #229's refinement session this was resolved as an open question (**Q8**) and recorded only in the story body's "Refinement Session Insights" ("Q8 decided — standalone yes, write-free with optional working/ handoff") — never formalized as a decision record, even though the shipped `SKILL.md` cites "decision Q8" inline as if a durable record existed (`.claude/skills/pair-capability-grill/SKILL.md`, Composition Interface § standalone case). This follows the same pattern closed for D21/Q11 in #232 (`2026-07-08-husky-default-hook-manager.md`) — this ADL closes the equivalent gap for Q8.

## Decision

**`pair-capability-grill` runs standalone with no composition context required.** When invoked directly (not composed by another skill), `$mode` defaults to `interview`; if `$topic` is also omitted, the opening question of the interview simply asks for it. `sync` mode is the one exception — it always requires a target story (`$story`), whether composed or standalone, since sync has no meaning without a story to align on.

Standalone sessions remain write-free like composed ones: the synthesis is printed in conversation rather than returned to a caller, and a `.pair/working/` handoff file is offered (not auto-written) on interruption or explicit request.

## Alternatives Considered

- **Require a composing caller always**: rejected — would make grill unusable for a human who just wants an ad-hoc interview (e.g. "grill me on this design before I build it"), which is the skill's most direct, lowest-friction use case and the one explicitly named in the story's own Business Rules.
- **Standalone mode auto-writes a handoff file**: rejected — contradicts the write-free-by-design contract; a human running an ad-hoc interview may not want a file left behind for a quick, disposable exploration. Handoff stays opt-in.

## Consequences

- `pair-capability-grill`'s Step 0 (Detect Mode and Target) does not HALT when no composing skill and no `$context` are present — this is expected, not an error path, for `interview` mode.
- Documentation, examples, and the Composition Interface section must keep the standalone case as a first-class path, not an edge case bolted onto composed usage.

## Adoption Impact

- No adoption file changes required — this is a skill-internal behavioral decision, not a project-level configuration choice.
- `pair-capability-grill` `SKILL.md` (dataset + installed mirror) already documents this decision inline (Composition Interface § standalone: "decision Q8").
