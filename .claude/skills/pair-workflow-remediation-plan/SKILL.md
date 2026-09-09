---
name: pair-workflow-remediation-plan
description: "Phase D0 of the delivery workflow: turns one immutable set of actionable review findings into a frozen remediation plan — owner-aligned groups, one mode each (behavioral, structural or test), exact allowed paths, one authoritative oracle, dependency order — so every finding is remediated exactly once by a bounded RED → seal → GREEN → P3 attempt. Read-only; writes only its handoff. Dispatched by the batch engine (pair-implement-batch); invoke directly to plan a fix cycle by hand ('plan the remediation for PR #42')."
version: 0.1.0
author: Foomakers
---

# /pair-workflow-remediation-plan — Group Findings Before Anyone Edits

Consume the finding set one review produced and emit the plan the remediation attempts follow. The plan is **frozen** once emitted: an attempt may not add, drop or re-scope a finding; a new finding (from P3 or a re-review) opens a new plan revision, never edits this one.

## Arguments

| Argument    | Required | Description                                                                                                             |
| ----------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| `$run`      | Yes      | Run id. Handoffs go under `.pair/working/runs/$run/$story/` in the MAIN checkout the coordinator was started in (the working directory the coordinator was started in, before any `cd`) — never inside a story or review worktree, which may be pruned. |
| `$story`    | Yes      | Story id (issue ref).                                                                                                   |
| `$pr`       | Yes      | PR number the findings were reviewed on.                                                                                |
| `$phase`    | Yes      | Round id, `r<n>`. Groups are numbered `r<n>-g<k>` under it.                                                              |
| `$base`     | Yes      | The 40-hex head the review inspected (`reviewedHead`). Every group starts from it.                                       |
| `$worktree` | Yes      | The story worktree to inspect. Read code there; never `cd` into the main checkout.                                      |
| `$branch`   | Yes      | The story branch.                                                                                                       |
| `$findings` | Yes      | JSON array of the ACTIONABLE findings (`location`, `severity`, `description`, `recommendation`). Questions never arrive. |

## Algorithm

### Step 1: Verify the head

1. **Check**: `git -C $worktree rev-parse origin/$branch` equals `$base`.
2. **Act**: if it does not, return `status: stale` — the findings describe a head that no longer exists. Plan nothing.

### Step 2: Locate every finding's owner

For each finding, read the code at `location` and name the **canonical owner**: the function, event or module that mutates the state the finding is about. A convenience predicate, renderer or consumer beside it is not the owner. Record the **authoritative oracle** — the exact command, fixture or external producer that decides whether the defect is present.

### Step 3: Group

1. Same owner **and** same oracle **and** compatible fix scope ⇒ one group.
2. A behavior repair and an extraction/refactor never share a group: `mode` is `behavioral`, `structural` or `test`, exactly one per group. `test` is the mode for a **guard-strength** finding — the defect is in a test artifact (a positional-blind assertion, an unconsumed fixture, a missing boundary row) while production at `$base` is already correct; such a group declares `allowedPaths: []`, gets no GREEN, and its RED is proven against an injected regression, not against production.
3. `allowedPaths` = the exact production paths (files, or directories with a trailing `/`) the group may change; `[]` for a `test` group. Tests and fixtures are never listed here; RED owns them.
4. `dependsOn` = groups whose GREEN this group needs first. Order groups by dependency, then by highest severity.
5. Every finding appears in **exactly one** group. A finding that fits none becomes its own group.

### Step 4: Write the handoff

Write `.pair/working/runs/$run/$story/$phase-remediation-plan.json`:

```json
{
  "schemaVersion": 1, "run": "$run", "story": "$story", "pr": 7, "phase": "r1",
  "skill": "remediation-plan", "status": "planned", "inputHead": "<$base>",
  "groups": [{ "groupId": "r1-g1", "findings": [0, 2], "owner": "...", "mode": "behavioral",
               "allowedPaths": ["src/x.ts"], "oracle": "...", "dependsOn": [] }],
  "findings": { "received": [0, 1, 2], "planned": [0, 1, 2], "carried": [] },
  "createdAt": "<ISO-8601>"
}
```

`findings[]` in a group are **indices into `$findings`**, so the plan is bound to the exact set it received.

## Output Format

Return exactly `{ status, groups, inputHead }` with `status ∈ planned | stale`. `groups[].findings` are indices; `groups[].mode` is `behavioral | structural | test`; `groups[].allowedPaths` are repository-relative.

## HALT Conditions

- `$findings` is empty or not an array ⇒ HALT (a plan with nothing to plan is a caller error).
- A finding whose `location` cannot be found at `$base` ⇒ HALT naming it; never guess an owner.

## Notes

- Read-only on the repository and the PR. This skill never edits, comments, labels or merges.
- Do not read `.pair/working/` except the run directory named by `$run`; checkpoints and review logs are author context and would bias the grouping.
