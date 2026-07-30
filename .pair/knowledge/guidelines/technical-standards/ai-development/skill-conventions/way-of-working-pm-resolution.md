# Way-of-Working / PM-Tool + Code-Host Resolution

How any skill that needs the project's tooling determines **which tool it is and how to reach it** — the **PM tool** for backlog items and state, the **code host** for branches, pull requests and reviews — and how it translates board-specific state into the canonical vocabulary the corpus uses.

The two are the **same tool by default** — for the PM tools that can host code. A project splits them by declaring `code-host`, and a PM tool that hosts no code (Linear, Jira, `filesystem`) must declare it (see [Code-host resolution](#code-host-resolution)). Either way no skill re-derives the routing rule: it reads the table below.

## PM tool discovery

1. **Check**: Read [way-of-working.md](../../../../../../.pair/adoption/tech/way-of-working.md) and identify the adopted PM tool (GitHub Projects, Jira, Linear, etc.) and its access method.
2. **Skip**: If found, proceed with that tool.
3. **Act**: If no PM tool is configured, **HALT**:

   > No PM tool configured in `way-of-working.md`. Configure via `/pair-capability-setup-pm`, or manually set the PM tool in way-of-working.md.

4. **Verify**: PM tool identified and reachable (or the HALT above has been surfaced).

## State resolution (macrostates)

Skills refer to **canonical macrostates** (`Draft`, `Ready`, `In Progress`, `Review`, `Done`) — never board-specific column/label names. Resolve an item's actual board state to a macrostate via the `## State Mapping` section in way-of-working.md; if that section is omitted, canonical names are assumed (zero-configuration default, not a degradation). See [canonical-states.md](../../../../../../.pair/knowledge/guidelines/collaboration/project-management-tool/canonical-states.md) for the full resolution rule, including the **Readiness Fallback**: when a board can't distinguish `Draft` from `Ready` (no dedicated Ready column), evaluate Definition-of-Ready criteria against the item instead of guessing from the board-state name.

## Code-host resolution

The **code host** is the tool that owns repositories, branches, pull requests and code reviews. It is resolved the same deterministic way the PM tool is, from the `## Git Workflow` section of way-of-working.md.

**Which PM tools can be the code host.** A PM tool is only a valid implicit code host if it actually hosts repositories, branches and pull requests. Two families:

| PM tool family                                            | Hosts code? | `code-host` when omitted                            |
| --------------------------------------------------------- | ----------- | --------------------------------------------------- |
| Repository-hosting trackers — e.g. GitHub Projects, Azure DevOps, GitLab | Yes         | Resolves to the PM tool (the zero-configuration default) |
| Trackers that **host no code** — e.g. Linear, Jira, **`filesystem`** | No          | Cannot resolve — must be declared (step 3 below)     |

`filesystem` belongs to the second family: it tracks item state in files and has no repositories, branches or pull requests of its own, so a filesystem-tracked project still needs `code-host` declared before any PR operation.

1. **Check**: Read [way-of-working.md](../../../../../../.pair/adoption/tech/way-of-working.md) → `## Git Workflow` → `code-host` (plus `base-branch`, default `main`).
2. **Skip**: If `code-host` is **absent and the PM tool hosts code** (first family above) **⇒ the code host is the PM tool**. This is the zero-configuration default, not a degradation: a single-tool project behaves exactly as it did before the field existed, and nothing needs to be declared.
3. **Act**: If `code-host` is **absent and the PM tool hosts no code** (Linear, Jira, `filesystem`), there is nothing to fall back to: **HALT before any code-host operation** with a setup pointer —

   > `<pm-tool>` hosts no repositories or pull requests. Declare `code-host` in `way-of-working.md` → `## Git Workflow` (schema: the **Code-host resolution** section of this convention — `.pair/adoption/` is user-owned, so an adoption that predates the field does not carry it), or re-run `/pair-capability-setup-pm`, which backfills the section.

   PM-side operations (issue writes, state transitions) are unaffected and keep working — only branch/PR/review work is blocked.

   **Upgrading an existing adoption**: this HALT is the one behavior change for a project that already tracks on a hosts-no-code tool (`linear`, `jira`, `filesystem`) and never had the field. Such a project declares `code-host` **once** — by hand in `## Git Workflow`, or by re-running `/pair-capability-setup-pm`, which backfills it — and is then permanently in the zero-configuration path again. Repository-hosting trackers need nothing.
4. **Act**: If `code-host` names the **same** tool as `pm-tool`, treat it exactly as if it were omitted — single-tool, **no dual-write**, no cross-linking step. **Identifier equality is per product, not per spelling**: compare the two values case- and separator-insensitively after resolving them through the canonical aliases below, so a PM-tool value and a code-host value naming the same product always collapse to the single-tool path.

   | Product      | Equivalent identifiers                                             |
   | ------------ | ------------------------------------------------------------------ |
   | GitHub       | `github`, `github-projects`, `github-enterprise`                    |
   | Azure DevOps | `azure-devops`, `azure-boards`, `azure-repos`                       |
   | GitLab       | `gitlab`, `gitlab-issues`                                          |

   Anything outside one alias row is a **different product** ⇒ the split is active (`Refs:` slot + back-link comment). An adoption never relies on prose to say "these two are the same tool" — the alias row is what makes it so.
5. **Act**: If `code-host` names a **different** tool, resolve its access method (CLI/MCP/API) from the same section and route per the table below.
6. **Verify**: The code host is identified and reachable. If a declared code host is **unreachable or unauthenticated**, **HALT** with a setup pointer — and note that **PM-side work already done is not rolled back** (state transitions and issue writes are the PM tool's, they stay committed; re-invocation is idempotent and picks up at the code-host step).

**Section ownership** (so no skill has to guess which git-concerned section to read): `## Git Workflow` owns *where the code lives and where a branch starts* — `code-host`, `base-branch`. `## Merge Strategy` owns *how a PR ends* — merge method, commit format, branch cleanup, merge confirmation. They are deliberately siblings, not nested; a skill that spans both (`/pair-capability-publish-pr`) reads both.

## Routing table (which field an operation reads)

Skills route by field, never by assumption. The `Reads` column names the field each operation class resolves; the one operation whose side depends on its **target** (classification, which writes a card in refinement and a PR in review) has its own row and says so.

| Operation class                                                                  | Reads       | Examples                                                                          |
| -------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------- |
| Create/update a backlog **item/issue** (initiative, epic, story, bug, task checklist) | `pm-tool` | `/pair-capability-write-issue`, `/plan-*`, `/pair-process-refine-story`                                       |
| Read an **issue** — its hierarchy, its labels/tags, its **state**                 | `pm-tool`   | `/pair-next`, `/pair-capability-estimate`, `/pair-capability-classify`, `/pair-capability-verify-done`                                  |
| **State transitions** (macrostate writes: `Ready`, `In Progress`, `Review`, `Done`) | `pm-tool`   | `/pair-process-refine-story`, `/pair-process-implement`, `/pair-capability-publish-pr` (board step), `/pair-process-review` (merge step)  |
| Close an item                                                                    | `pm-tool`   | `/pair-process-review` merge cascade                                                           |
| Branches and pushes, **pull request** create/update/read (body, tier, approvals)   | `code-host` | `/pair-capability-publish-pr`, `/pair-process-implement`, `/pair-capability-verify-done` (PR tier + approval count, Step 3)     |
| PR **labels/tags** and required checks (CI gate)                                  | `code-host` | `/pair-capability-verify-quality` (tier from the PR), `/pair-capability-setup-gates`, `/pair-capability-classify` (in review context — the target is the PR) |
| **Classification** matrix + chromatic tags — written on whichever side the target is | both, by target | `/pair-capability-classify`: refinement ⇒ the **card** (`pm-tool`); review ⇒ the **PR** (`code-host`) |
| Code **review** submission (approve / request-changes / comment) and PR **merge**  | `code-host` | `/pair-process-review`, `/pair-process-review` merge cascade                                                |
| Open-PR detection                                                                | `code-host` | `/pair-next`                                                                           |

Invariants this table encodes:

- **State transitions always happen on the PM tool.** PR states (draft/ready/approved/merged) live on the code host and are never mirrored onto the board — the board sees the outcome through the linked PR reference, so no state is duplicated.
- The pair review check registers **on the code host only** — that is where it gates the merge.
- A single-tool project resolves both columns to the same tool, so the table is a no-op there.

## Cross-linking convention (split configuration)

When PM tool and code host differ, the link between an item and its PR is **text-convention based** — no native integration is required or assumed. Native automations (e.g. a PM tool's own VCS integration) may coexist, but no skill depends on one:

1. **Item → PR direction**: the PR body carries `Refs: <issue-id>` — the PM tool's own item identifier (e.g. `Refs: ENG-412`), written by `/pair-capability-publish-pr` from the story it was handed. The token is written **plain, at the start of its own line** — never bolded or otherwise decorated — because the consumers read it back by matching that literal. The PR template's conditional `Refs:` slot is the canonical rendering (resolved override-first, as every template is).
2. **PR → item direction**: the PR URL is posted **back on the PM item as a comment** (or a link/URL field when the tool has one), completing the bidirectional link. `/pair-capability-publish-pr` does this right after the PR exists, through `/pair-capability-write-issue $mode: comment` — the **non-destructive** path: one comment, no template render, no body write, so the item's AC/DoD/task breakdown is untouched. Where `/pair-capability-write-issue` isn't installed, the same comment goes through the PM tool's implementation guide directly — each supported guide documents its own mechanism (Linear `commentCreate`, `gh issue comment`, the Azure DevOps work-item comments endpoint, the `filesystem` item file's `## Activity Log` append). A back-link is **never** written as a body update. Because a comment has no identifier, posting it is **not** self-deduplicating: the writer **checks for an existing comment carrying this PR URL first** and skips when it is already there, so a re-publish (fix round, HALT recovery) never accretes a second one.
3. **Item id not found** on the PM tool when linking back (or the PM tool errors): the **PR is still created** (it is already valid work) — surface a warning with the manual-link instruction rather than failing the publish. The back-link path therefore **warns, it never HALTs**; comment mode is specified with that exception so the non-blocking behavior survives the composition.
4. `<issue-id>` is whatever the PM tool calls its item:

   | PM tool      | `<issue-id>`                     | Resolution                                                                 |
   | ------------ | -------------------------------- | -------------------------------------------------------------------------- |
   | GitHub       | `#412`                           | the issue number                                                            |
   | Linear       | `ENG-412`                        | the issue `identifier`                                                      |
   | Jira         | `PROJ-412`                       | the issue key                                                               |
   | `filesystem` | the item file's **stem** (`01-01-001`) | the file name without `.md` and without its status directory — the id must survive the file MOVING between `not-started/`, `in-progress/`, … , so resolve it by **glob across the status directories** (`**/01-01-001*.md`), never by path |

   `filesystem` is the tracker where this slot is **always** required (it hosts no code, so the split is mandatory), and it is also the one whose item has no native id — hence the stem rule above, which is what `/pair-capability-write-issue $mode: comment $id: …` resolves to locate the item file's `## Activity Log`. Skills copy the id verbatim; they never reformat it.

## What stays in the skill (the delta)

Most skills only need a short pointer where they read/write the PM tool — e.g. "Read the story from the PM tool (resolution: see [way-of-working-pm-resolution.md](way-of-working-pm-resolution.md))" — because `/pair-capability-write-issue` is the actual PM-tool writer for creation/update flows and already implements the discovery+HALT logic above in full. A skill only needs to **restate** the full discovery+HALT block (Steps 1-4 above) if it talks to the PM tool directly rather than delegating to `/pair-capability-write-issue` — keep that as the delta; everything else points here.

The same applies to the code host: a skill states **which side of the routing table** an operation is on (e.g. "create the PR on the code host") and points here. It never restates the resolution steps, the `absent ⇒ PM tool` default, or the cross-linking convention — those live only in this file, so a change to the split model is a one-file change.
