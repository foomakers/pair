# Way-of-Working / PM-Tool + Code-Host Resolution

How any skill that needs the project's tooling determines **which tool it is and how to reach it** — the **PM tool** for backlog items and state, the **code host** for branches, pull requests and reviews — and how it translates board-specific state into the canonical vocabulary the corpus uses.

The two are the **same tool by default**. Only a project that declares `code-host` (see [Code-host resolution](#code-host-resolution)) splits them, and even then no skill re-derives the routing rule: it reads the table below.

## PM tool discovery

1. **Check**: Read [way-of-working.md](../../../../../../.pair/adoption/tech/way-of-working.md) and identify the adopted PM tool (GitHub Projects, Jira, Linear, etc.) and its access method.
2. **Skip**: If found, proceed with that tool.
3. **Act**: If no PM tool is configured, **HALT**:

   > No PM tool configured in `way-of-working.md`. Configure via `/setup-pm`, or manually set the PM tool in way-of-working.md.

4. **Verify**: PM tool identified and reachable (or the HALT above has been surfaced).

## State resolution (macrostates)

Skills refer to **canonical macrostates** (`Draft`, `Ready`, `In Progress`, `Review`, `Done`) — never board-specific column/label names. Resolve an item's actual board state to a macrostate via the `## State Mapping` section in way-of-working.md; if that section is omitted, canonical names are assumed (zero-configuration default, not a degradation). See [canonical-states.md](../../../../../../.pair/knowledge/guidelines/collaboration/project-management-tool/canonical-states.md) for the full resolution rule, including the **Readiness Fallback**: when a board can't distinguish `Draft` from `Ready` (no dedicated Ready column), evaluate Definition-of-Ready criteria against the item instead of guessing from the board-state name.

## Code-host resolution

The **code host** is the tool that owns repositories, branches, pull requests and code reviews. It is resolved the same deterministic way the PM tool is, from the `## Git Workflow` section of way-of-working.md:

1. **Check**: Read [way-of-working.md](../../../../../../.pair/adoption/tech/way-of-working.md) → `## Git Workflow` → `code-host` (plus `base-branch`, default `main`).
2. **Skip**: If `code-host` is **absent ⇒ the code host is the PM tool**. This is the zero-configuration default (D21), not a degradation: a single-tool project behaves exactly as it did before the field existed, and nothing needs to be declared.
3. **Act**: If `code-host` names the **same** tool as `pm-tool`, treat it exactly as if it were omitted — single-tool, **no dual-write**, no cross-linking step.
4. **Act**: If `code-host` names a **different** tool, resolve its access method (CLI/MCP/API) from the same section and route per the table below.
5. **Verify**: The code host is identified and reachable. If a declared code host is **unreachable or unauthenticated**, **HALT** with a setup pointer — and note that **PM-side work already done is not rolled back** (state transitions and issue writes are the PM tool's, they stay committed; re-invocation is idempotent and picks up at the code-host step).

## Routing table (which field an operation reads)

Skills route by field, never by assumption. Everything on the left of the table reads `pm-tool`; everything on the right reads `code-host`.

| Operation class                                                                  | Reads       | Examples                                                                          |
| -------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------- |
| Create/update a backlog **item/issue** (initiative, epic, story, bug, task checklist) | `pm-tool` | `/write-issue`, `/plan-*`, `/refine-story`                                       |
| Read an **issue** — its hierarchy, its labels/tags, its **state**                 | `pm-tool`   | `/next`, `/estimate`, `/classify`, `/verify-done`                                  |
| **State transitions** (macrostate writes: `Ready`, `In Progress`, `Review`, `Done`) | `pm-tool`   | `/refine-story`, `/implement`, `/publish-pr` (board step), `/review` (merge step)  |
| Close an item                                                                    | `pm-tool`   | `/review` merge cascade                                                           |
| Branches and pushes, **pull request** create/update/read                          | `code-host` | `/publish-pr`, `/implement`                                                       |
| PR **labels/tags** and required checks (CI gate)                                  | `code-host` | `/verify-quality` (tier from the PR), `/setup-gates`                              |
| Code **review** submission (approve / request-changes / comment) and PR **merge**  | `code-host` | `/review`, `/review` merge cascade                                                |
| Open-PR detection                                                                | `code-host` | `/next`                                                                           |

Invariants this table encodes:

- **State transitions always happen on the PM tool.** PR states (draft/ready/approved/merged) live on the code host and are never mirrored onto the board — the board sees the outcome through the linked PR reference, so no state is duplicated.
- The pair review check registers **on the code host only** — that is where it gates the merge.
- A single-tool project resolves both columns to the same tool, so the table is a no-op there.

## Cross-linking convention (split configuration)

When PM tool and code host differ, the link between an item and its PR is **text-convention based** — no native integration is required or assumed. Native automations (e.g. a PM tool's own VCS integration) may coexist, but no skill depends on one:

1. **Item → PR direction**: the PR body carries `Refs: <issue-id>` — the PM tool's own item identifier (e.g. `Refs: ENG-412`), written by `/publish-pr` from the story it was handed.
2. **PR → item direction**: the PR URL is posted **back on the PM item** (a comment, or a link/URL field when the tool has one), completing the bidirectional link. `/publish-pr` does this through `/write-issue` right after the PR exists.
3. **Item id not found** on the PM tool when linking back: the **PR is still created** (it is already valid work) — surface a warning with the manual-link instruction rather than failing the publish.
4. `<issue-id>` is whatever the PM tool calls its item (`#412` on GitHub, `ENG-412` on Linear, `PROJ-412` on Jira). Skills copy the id verbatim; they never reformat it.

## What stays in the skill (the delta)

Most skills only need a short pointer where they read/write the PM tool — e.g. "Read the story from the PM tool (resolution: see [way-of-working-pm-resolution.md](way-of-working-pm-resolution.md))" — because `/write-issue` is the actual PM-tool writer for creation/update flows and already implements the discovery+HALT logic above in full. A skill only needs to **restate** the full discovery+HALT block (Steps 1-4 above) if it talks to the PM tool directly rather than delegating to `/write-issue` — keep that as the delta; everything else points here.

The same applies to the code host: a skill states **which side of the routing table** an operation is on (e.g. "create the PR on the code host") and points here. It never restates the resolution steps, the `absent ⇒ PM tool` default, or the cross-linking convention — those live only in this file, so a change to the split model is a one-file change.
