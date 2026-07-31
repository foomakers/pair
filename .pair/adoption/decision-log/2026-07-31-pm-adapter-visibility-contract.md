# Decision: item visibility (board membership + assignee) is a gate-enforced PM-tool adapter contract, not a skill rule

## Date

2026-07-31

## Status

Active

## Category

Convention Adoption

## Context

`way-of-working.md` › Assignment requires skills to set an item's assignee "as part of the write, never as a follow-up step". Nothing implemented it: `assignee` appeared zero times in `pair-capability-write-issue/SKILL.md` and zero times across every PM-tool implementation guide. Separately, `/write-issue` Step 7.3 writes the board status field "per the implementation guide", presuming the item was already in the tracked view — on GitHub Projects an issue and a project item are distinct objects, so the item lookup could yield an empty id and either fail hard (`gh: Could not resolve to a node with the global id of ''`) or, worse, be treated as "board write skipped" and reported as success.

Observed 2026-07-30: issues #384 and #372 were open, assigned, green, and absent from the board entirely — invisible in the assignee-filtered view the team reads. No gate caught it. Two questions had to be settled before writing anything: **where** the fix lives, and **how** it stays true for adapters that do not exist yet.

## Decision

1. **The coverage lives in the adapters (`*-implementation.md`), not in the skills.** Each adapter carries a level-3 section `### Item Visibility: Membership and Assignee` stating (a) its board-membership semantics in the pinned form `Board membership is explicit …` / `Board membership is implicit …`, (b) the concrete assignee mechanic set as part of the create, (c) the unresolvable-assignee behaviour (report it, never drop it silently), and (d) for explicit-membership tools, that membership precedes the state write with an explicit branch for an empty lookup — never a silently skipped board write reported as success.

2. **The contract is a stated, gate-enforced requirement**, recorded in `project-management-tool/README.md` › _Adapter Contract — Required Coverage_ and enforced by `packages/knowledge-hub/src/conformance/pm-tool-adapter-contract.test.ts`. The guard is data-driven over the `*-implementation.md` files present in both corpora, so a new adapter is enrolled the moment its file lands and **no adapter count is asserted anywhere**. An omission reddens CI instead of surfacing in production.

3. **The assignee stays out of the shared item templates.** `user-story-template.md` / `task-template.md` gain no `Assignee` slot: on every adapter but one the assignee is a native tracker field (GitHub `assignees`, Azure `--assigned-to`, Linear `assigneeId`), where a template slot would be dead weight and a second source of truth competing with the field the board filters on. The filesystem adapter — which has no native field — owns the convention itself and states the placement rule in its own visibility section.

## Alternatives Considered

- **A generic "add the item to the board first" rule in `/write-issue` (skill layer)**: Rejected. Membership-as-a-separate-step is **GitHub-specific**. On Azure Boards the work item belongs to its team project on create, on Linear `issueCreate` requires `teamId`, and in the filesystem adapter the file's location _is_ its membership — so the generic rule would be false for three adapters out of four, and would invite an agent to invent an `addProjectV2ItemById` equivalent that those tools have no concept of. It is also unnecessary: `/write-issue` Step 7.2 already delegates field mechanics to the guide, so a corrected guide is picked up through the existing delegation with **no skill edit**. This constrains #403: the skill half is limited to the tool-agnostic invariant (`$assignee` in the write contract, membership-precedes-state as a precondition, HALT on an unresolvable item) and never to a tool-shaped step.
- **Prose only, no conformance guard**: Rejected. The gap being closed existed _because_ an adoption rule had no enforcement — repeating that shape for the adapters would have re-created it one layer down.
- **A count-based conformance assertion** ("all four adapters carry the section"): Rejected. It reddens on adapter _addition_ rather than on adapter _omission_, and hardcodes a number that goes stale; disk discovery plus a non-empty guard gives the same protection without the count.
- **Adding an `Assignee` field to the shared templates**: Rejected, per decision 3 above.

## Consequences

- Adding a PM-tool adapter now requires its `Item Visibility: Membership and Assignee` section, at level 3, with the pinned sentence form — otherwise `pm-tool-adapter-contract.test.ts` fails.
- Adapters whose semantics the guard knows are pinned **by name** (`github` explicit; `azure-devops`, `linear`, `filesystem` implicit), so a regression that flips one cannot pass on the loose either-word assertion.
- `gh issue create` recipes are guarded KB-wide for `--assignee`, so the issue-management guides cannot drift back into a second, incomplete create recipe that contradicts the adapter.
- Implicit membership is documented as _not_ equivalent to "cannot be invisible": Azure's area path and, when the adoption names a project view, Linear's `projectId` remain part of visibility.

## Adoption Impact

- [project-management-tool/README.md](../../knowledge/guidelines/collaboration/project-management-tool/README.md): the Adapter Contract section references this ADL by path for the "why the adapter, not the skill" rationale.
- No dataset mirror of this file: sibling ADLs in `adoption/decision-log/` are adoption-only records — the dataset is a curated seed, not an auto-mirror of adoption, and a link into it from the shipped KB would break in a freshly seeded install (which is why the README cites the path rather than linking it).
