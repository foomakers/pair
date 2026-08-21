# CP10 — Web / Cloud Environment (Claude Code Web)

**Priority**: P1
**Scope**: pair running from a cloud/web coding environment — Claude Code Web. Skills visible and executable, a full story carried end-to-end to a pull request, and the known dev-server limit (no public preview — [ADL: no public dev-server preview from cloud sessions](../../.pair/adoption/decision-log/2026-08-20-no-public-dev-server-preview-from-cloud-sessions.md)) observed as the by-design result it is
**Preconditions**: A Claude Code Web session with this repository open. `gh` reachable inside that session. **Nothing is installed from this file** — CP10 exercises the environment, not the release artifacts, so it needs no `$CLI` build and no `$WORKDIR`.

**Why P1 and not P0**: the web environment is a **channel**, not the released artifact. A red here tells the team a channel regressed; it must not block release sign-off.

**Who executes this**: a human, or an assistant running **inside** the Claude Code Web session. This is the one path in the suite that **cannot** be executed from a local CLI — the environment is the subject under test, so a local run would observe the wrong thing and report a green for it.

---

## Variables

| Variable      | How to resolve                                                                              |
| ------------- | -------------------------------------------------------------------------------------------- |
| `$REPO`       | The repository the web session has open, with its visibility (`private` or `public`)          |
| `$STORY`      | A story in the `Ready` state, picked before the run — the one carried end-to-end in MT-CP1003 |
| `$PR`         | The pull request MT-CP1003 produces — the run's primary evidence                              |
| `$SESSION_AT` | The date the session ran (`date -u +%Y-%m-%d`), recorded in the execution log                 |

---

## Auth Preconditions — checks, never secrets

The web environment supplies its own credentials. This path **verifies that authentication is present**; it never describes how to supply one, and no token, key or secret is written down here or in the report.

| Precondition        | Verifiable check                                | Present when                                                       |
| ------------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| Git identity        | `git config user.email`                         | A non-empty value is printed                                        |
| GitHub CLI auth     | `gh auth status`                                | Exit code 0, and the account line names a logged-in account         |
| GitHub write access | `gh repo view --json viewerPermission`           | `WRITE`, `MAINTAIN` or `ADMIN`                                      |
| MCP availability    | List the session's MCP servers in the UI/session | Recorded as present or absent — **absence is an observation, not a failure** |

If a check fails, do **not** improvise a fix: record what was reachable and follow the degraded path in MT-CP1005.

---

## MT-CP1001: Preconditions are verifiable inside the web session

**Priority**: P1
**Preconditions**: A Claude Code Web session with `$REPO` open
**Category**: Environment

### Steps

1. Record `$REPO` and its visibility (`private` or `public`), and `$SESSION_AT`
2. Run each check in the Auth Preconditions table above, in order
3. Record the MCP servers the session exposes, or `none`

### Expected Result

- Every check produces a recorded observation — a value or an explicit `absent`
- `gh auth status` exits 0 (if it does not, MT-CP1003 cannot complete: go to MT-CP1005)
- No credential value is transcribed into the report: the evidence is the **check's outcome**, never its input
- Repository visibility is recorded, because access differences downstream are explained by it

---

## MT-CP1002: Skills are visible and executable, and a write takes effect

**Priority**: P1
**Preconditions**: MT-CP1001 recorded
**Category**: Environment

### Steps

1. List the skills the session discovers (`.claude/skills/` is the canonical directory)
2. Confirm the pair skills appear under their installed names (`/pair-next`, `/pair-process-implement`, …)
3. Invoke `/pair-next` — a read-only skill — and observe that it reads the adoption files
4. Invoke a skill that **writes a file** (e.g. `/pair-capability-checkpoint $mode=write`, which writes under `.pair/working/checkpoints/`) and note the path it reports
5. Verify that path on the **filesystem**: `ls -l <path>` (the file exists, non-zero size) and read it back (`cat <path>`) — its content is what the skill said it wrote

> **Do not use `git status` as the evidence here.** `.pair/working/` is gitignored on purpose — `git check-ignore -v .pair/working/checkpoints/x.md` prints `.gitignore:35 .pair/working`. A successful checkpoint write therefore leaves `git status --short` **empty**, and an executor who expects a line there records a red for a working write. If you want a git-visible write instead, pick a skill that writes under `.pair/adoption/` (e.g. `/pair-capability-record-decision`) — and then `git status` is the right check.

### Expected Result

- The pair skills are listed and invocable by name from the web session
- `/pair-next` returns a recommendation derived from this repository's adoption files, not a generic answer
- The write-mode skill **actually creates or updates its file**: `ls -l` shows it at the reported path with a non-zero size, and its content reads back. Whether git sees it depends on where the skill writes — that is not what this case measures
- Any skill that degrades (because an MCP server or a tool is unavailable) is named with **what** degraded and **why**, per MT-CP1005

---

## MT-CP1003: A Ready story goes end-to-end to a pull request

**Priority**: P1
**Preconditions**: MT-CP1001 passed, MT-CP1002 passed, `$STORY` selected and in `Ready`
**Category**: Delivery

This is the path's primary evidence: not "the tool opened", but "the work shipped".

### Steps

1. Record `$STORY` (number and title)
2. In the web session, run `/pair-process-implement $STORY` and carry it through its task cycle
3. `git log --oneline -1` and `git branch --show-current` — record the branch and the commit
4. Let the flow publish the pull request (or run `/pair-capability-publish-pr`)
5. `gh pr view --json number,url,state` — record `$PR`
6. Open `$PR` in the browser and confirm the PR page renders with the branch's commits

### Expected Result

- A feature branch exists, with at least one commit authored from the web session
- A pull request exists, is visible on GitHub, and carries those commits
- `$STORY` and `$PR` are both **named in the execution log** — a claim of "it worked" without the two references is not evidence
- Nothing in the flow required a local terminal outside the web session

### Notes

- Do **not** merge as part of this path. The merge is a human act governed by the PR state flow, and it is not what CP10 is measuring.

---

## MT-CP1004: No live preview of the dev server — the expected result, and its mitigation

**Priority**: P1
**Preconditions**: MT-CP1001 recorded
**Category**: Environment limit

A cloud session exposes **no public dev server**, by design on both sides: the environment isolates the session's network, and pair does not tunnel around it — recorded in [ADL: no public dev-server preview from cloud sessions](../../.pair/adoption/decision-log/2026-08-20-no-public-dev-server-preview-from-cloud-sessions.md). This case exists to record that limit as an **expected result, not a failure**, and to establish whether the documented mitigation actually holds in this environment.

### Steps

1. Start the web app's dev server inside the session: `pnpm --filter @pair/website dev`
2. Attempt to reach it from **outside** the session — a browser on your own machine, on the port the server printed
3. Record what happened (no public URL / connection refused / a session-internal proxy only)
4. Exercise the mitigation **in this environment**: drive the same local URL headlessly and capture a screenshot, e.g.

   ```bash
   pnpm --filter @pair/website exec playwright screenshot http://localhost:3000/docs /tmp/cp10-preview.png
   ```

5. Confirm the screenshot file exists and is a non-empty PNG (`ls -l /tmp/cp10-preview.png`, `file /tmp/cp10-preview.png`)

### Expected Result

- **There is no live preview: the dev server is not reachable from outside the session. This is the expected result, not a failure** — the [ADL](../../.pair/adoption/decision-log/2026-08-20-no-public-dev-server-preview-from-cloud-sessions.md) excludes it deliberately, and recording it as a red would report a decision as a defect
- The dev server **is** reachable from inside the session, so the app can still be exercised
- The mitigation is recorded **as observed here, not as assumed**: either the headless screenshot is produced inside the web environment (mitigation holds), or it is not, and the real state is written down — a mitigation that only works on a dev machine is not a mitigation for this environment
- If the mitigation does **not** hold, that is a finding for the maintainer and a correction to the docs page, not a rewrite of this expected result

---

## MT-CP1005: Degraded paths and partial runs are recorded honestly

**Priority**: P1
**Preconditions**: Reached whenever any earlier case cannot complete
**Category**: Edge case

A path that only describes the happy run leaves the executor to improvise the moment the environment misbehaves. Each row below has a defined stop.

### Steps

1. `gh` not authenticated (`gh auth status` non-zero): **stop at MT-CP1003**. Record every case that was reachable and mark MT-CP1003 `BLOCKED — gh unauthenticated`
2. MCP servers unavailable: continue, and record **which** skills degrade as a consequence (the ones whose PM-tool or code-host access routes through MCP), as an **environment limit**, not a test failure
3. Playwright headless unavailable: MT-CP1004's mitigation step is recorded `FAILED — mitigation unavailable in this environment`, while MT-CP1004's dev-server observation stays an expected result
4. Session interrupted or timed out mid-story: record the run as **PARTIAL**, naming the last case reached and its state. Do not re-label it a pass
5. Repository private and some operation is refused for that reason: record the visibility and the refused operation together

### Expected Result

- Every degraded outcome above is written down with its **stop point** and its **cause**
- A truncated run is reported as `PARTIAL`, never as a pass
- A by-design limit and an environment gap are labelled differently, so the report distinguishes "we chose this" from "this is missing here"
- No case is silently skipped: an unreached case is recorded as `NOT REACHED`

---

## MT-CP1006: Genuine defects are reported, not smoothed over

**Priority**: P2
**Preconditions**: Any case produced an unexpected observation
**Category**: Reporting

### Steps

1. Separate the observation into one of two buckets: **by-design limit** (the [absent public dev-server preview](../../.pair/adoption/decision-log/2026-08-20-no-public-dev-server-preview-from-cloud-sessions.md), and anything else an adopted decision excludes) or **genuine defect**
2. For a genuine defect, write the observed result into the execution log **as observed**
3. Report it to the maintainer. Do **not** file a backlog card as part of executing this path — the maintainer decides whether it becomes one

### Expected Result

- The execution log keeps the **real observed result**; evidence is never adjusted to make a run look clean
- By-design limits and genuine defects are distinguishable in the log
- No card is created by the executor on their own initiative

---

## Execution Log

One row per execution. `$STORY` and `$PR` are what make a run evidence rather than a claim; a run without them is `PARTIAL` at best.

| Date | Environment | Repo (visibility) | `$STORY` | `$PR` | Result | Notes |
| ---- | ----------- | ----------------- | -------- | ----- | ------ | ----- |
| 2026-08-20 | Claude Code Web | foomakers/pair (private) | — (not reached) | — (not reached) | `BLOCKED — session provisioning did not complete` | Session creation stalled at the first of four provisioning steps ("Configurazione di un container cloud") for 16+ minutes with no error surfaced and no progress to "Clona repository". The chat input became typeable, but no command executed inside it produced output — the container itself never came up. MT-CP1001 could not start: no auth check, no skill check, nothing pair-specific was exercised. This is an environment-provisioning failure, not a `gh auth`/permissions failure (MT-CP1005 row 1) and not a repository-visibility refusal (row 5) — neither existing degraded-path row names it. Recorded per MT-CP1005 ("no case is silently skipped... a truncated run is reported as PARTIAL, never as a pass"): this run is `BLOCKED`, not `PARTIAL`, because no case body ever ran.

### Notes

- **This path has been attempted once and did not complete.** The 2026-08-20 run above never got past environment provisioning — see its Notes for the stall point. `pair`'s web support therefore remains _assessed, not verified_: no row above yet carries a `$STORY`/`$PR` pair, so AC1, AC2 and AC7 of the story that authored this path stay unmet. Re-attempt in a fresh session (a new cloud environment, not a retry inside the stalled one) rather than waiting indefinitely on a provisioning step that shows no progress.
- **MT-CP1005 gap surfaced by this run**: none of its five degraded-path rows name "session/container provisioning never completes" as a stop condition — they all assume the container is up and something *inside* it fails (`gh` unauthenticated, MCP unavailable, Playwright unavailable, mid-run interruption, a refused operation). A provisioning stall precedes all of those. Consider adding a sixth row for it if a second occurrence confirms this is not a one-off.
- Re-run at each release, alongside the rest of the suite. The point of a critical path over a one-off report is that the answer stays current.

---

## Changelog

- Added for #225 (verify & document pair on Claude Code Web): MT-CP1001..1006.
