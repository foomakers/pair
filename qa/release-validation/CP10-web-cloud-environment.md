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
| GitHub access path  | `gh auth status` **if `gh` is installed**; otherwise, ask the assistant to report GitHub access through its own tools (e.g. `mcp__github__*`) | Either `gh auth status` exits 0 and names a logged-in account, **or** the assistant confirms a working GitHub MCP tool is available and names it |
| GitHub write access | `gh repo view --json viewerPermission` **if `gh` is installed**; otherwise, a GitHub MCP tool call that reads the same field (e.g. get-repository / repo metadata) | `WRITE`, `MAINTAIN` or `ADMIN` |
| MCP availability    | List the session's MCP servers in the UI/session | Recorded as present or absent — **absence is an observation, not a failure** |

**Corrected 2026-08-20** — the first real execution of this path found `gh` absent from the Claude Code Web environment (`gh: command not found`, exit 127): the CLI-based checks as originally written cannot pass in the one environment this case exists to test, a structural false negative rather than an auth finding. GitHub access in that environment is exclusively through the `mcp__github__*` MCP tools. The table above now accepts either path; do not treat a missing `gh` binary alone as a failed precondition — check whether a GitHub MCP tool is present and working before concluding access is absent.

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
- A working GitHub access path is confirmed — either `gh auth status` exits 0, **or** a GitHub MCP tool is present and named (see the corrected Auth Preconditions table above). If neither holds, MT-CP1003 cannot complete: go to MT-CP1005
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
4. Invoke a skill that **writes a file** (e.g. `/pair-capability-checkpoint $mode=write $story=$STORY`, which writes under `.pair/working/checkpoints/`) and note the path it reports — **`$story` must be passed explicitly**: a Claude Code Web session's auto-generated branch name (e.g. `claude/beautiful-cerf-1tl9l6`) does not match the `feature/#<id>-*` pattern the skill's story-context resolution expects, so an invocation without `$story` HALTs cleanly with "Cannot detect story context" instead of writing anything. This is the skill behaving correctly (it refuses to guess), not a defect — but it means this step's own example command was incomplete as originally written
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
4. Exercise the mitigation **in this environment**: first try the documented CLI one-liner —

   ```bash
   pnpm --filter @pair/website exec playwright screenshot http://localhost:3000/docs /tmp/cp10-preview.png
   ```

   **Do not run `playwright install chromium` to "fix" a failure here** — a prior draft of this step recommended it, but real execution (2026-08-20) showed it fails with a `403` (the browser-download CDN is not on this environment's network allowlist) and is unnecessary: Claude Code Web ships Chromium pre-installed, with `PLAYWRIGHT_BROWSERS_PATH` already pointing at it (check `echo $PLAYWRIGHT_BROWSERS_PATH`). If the CLI command instead fails with a **browser-revision mismatch** (the project's `playwright-core` version expecting a newer revision than the one pre-installed), fall back to a small script that launches the pre-installed binary directly:

   ```bash
   node -e "
   const { chromium } = require('@playwright/test');
   (async () => {
     const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_BROWSERS_PATH + '/chromium' });
     const page = await browser.newPage();
     await page.goto('http://localhost:3000/docs');
     await page.screenshot({ path: '/tmp/cp10-preview.png' });
     await browser.close();
   })();
   "
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
| 2026-08-20 | Claude Code Web | foomakers/pair (private) | — (not reached) | — (not reached) | `BLOCKED (browser UI) — session was actually ready` | **Corrected finding — supersedes this row's own earlier text.** Three attempts in the **browser tab** (claude.ai) all appeared stalled forever at the first of four provisioning steps ("Configurazione di un container cloud"), varying network trust ("Attendibili" vs full access) and prompt content across attempts, with no visible progress in any of them. **Opening the third attempt's same session from the desktop app told a different story**: "Sessione ripresa" with all three steps checked — Container cloud ripristinato ✓, Repository aggiornato ✓, Claude Code avviato ✓ — and Claude answered a real question about the repo correctly (branch `claude/ambiente-skill-esecuzione-emtl3g`, `.pair/` contents: adoption, knowledge, llms.txt — verified accurate). **The environment had provisioned successfully; the browser tab's progress stepper simply never reflected it.** Root cause is a status-sync/display bug in the claude.ai browser client for cloud sessions, not a provisioning failure and not (as the two earlier drafts of this row concluded) a platform-wide or account-side block. Network policy and prompt content were correctly ruled out as causes, but the underlying premise — that the session was actually stuck — was wrong for at least this attempt; attempts 1-2 were never checked from a second client and their true state is unknown. |
| 2026-08-20 | Claude Code Web | foomakers/pair (private) | — (not reached) | — (not reached) | `MT-CP1001 PASS (with a doc defect found)` | **Attempt 4, clean redo, isolates the causation question left open above.** Fresh session, network access "Attendibili", real MT-CP1001 prompt sent immediately (the prompt itself is what starts provisioning — it does not start on session creation alone). Stalled again at step 1/4. This time: **reloaded the browser tab only, app never opened.** The reload alone showed all three steps complete and returned the command output — settling the open causation question: **a plain reload is sufficient; the desktop app was never necessary.** Command results: `git config user.email` → `noreply@anthropic.com`, exit 0. `gh auth status` and `gh repo view --json viewerPermission` → both `gh: command not found`, exit 127 — **`gh` is not installed in Claude Code Web at all.** GitHub access in this environment is exclusively through `mcp__github__*` MCP tools (confirmed present and named `github` in the session's MCP list, alongside Gmail, Google Calendar, Google Drive, Linear, Slack, Learnn, Notion, PostHog, Pricelabs). This is a **genuine defect in this case's own Auth Preconditions table**, not an auth or environment failure (MT-CP1006 bucket: genuine defect, not by-design limit) — the table as originally written could never pass in the one environment it exists to test. Corrected in the Auth Preconditions table above and in this case's Expected Result to accept either `gh` or a named GitHub MCP tool. |
| 2026-08-20 | Claude Code Web | foomakers/pair (private) | #414 (not yet started) | — (not reached) | `MT-CP1002 PASS (4/4, after one doc fix)` | Same session as MT-CP1001 above (`$STORY` = #414, chosen before the run per the Variables table). Skill listing: **pass** — 40 skills discovered under `.claude/skills/`, `pair-next` plus 38 `pair-capability-*`/`pair-process-*` skills, all under installed names. `/pair-next`: **pass, strong evidence** — returned `PROJECT_STATE`/`RECOMMENDATION` derived from this repo's real state (PRD/Bootstrap/Subdomains/Bounded Contexts populated, PM Tool `GitHub Projects (foomakers/pair, Kanban)`, **the exact 6 open PRs** #447/#446/#445/#444/#443/#442 plus 53 open issues, recommending `/pair-process-review` with a correct tie-break reason) — not a generic answer by any reading. Write-mode skill, first try: **HALTed** — `/pair-capability-checkpoint $mode=write` (no `$story`, as this case's Step 4 was originally worded) returned "Cannot detect story context — pass `$story` explicitly": the session's auto-generated branch (`claude/beautiful-cerf-1tl9l6`) doesn't match `feature/#<id>-*`, so the skill correctly refused to write rather than guess. **Genuine documentation defect**, not a skill bug (MT-CP1006: the skill's refusal is correct by-design; this case's own example command omitted a required argument) — corrected above to `$mode=write $story=$STORY`. **Re-run with the fix: pass.** `/pair-capability-checkpoint $mode=write $story=414` created `.pair/working/checkpoints/414.md` (checkpoint template read, no existing task breakdown or commits found on #414, initial checkpoint written). Verified per this case's own corrected guidance — `ls -l` confirmed the file at 1698 bytes created just now, `cat` confirmed its content matches exactly what the skill reported writing; `git status` was correctly **not** used (`.pair/working/` is gitignored). |
| 2026-08-20 | Claude Code Web | foomakers/pair (private) | #414 (not yet started) | — (not reached) | `MT-CP1004 PASS — expected result confirmed, mitigation corrected` | Same session. **Secondary observation, not this case's subject**: `pnpm --filter @pair/website dev` failed on first try — `node_modules` was not installed (`next: not found`) despite "Esegui script di configurazione" having reported complete during session provisioning; a masking `\|\| true` on cleanup made the failed start look like exit 0. `pnpm install` first, then the dev server started for real. Worth a maintainer's attention (does the provisioning setup script actually run a full install for this monorepo?) but out of scope for this case. **Dev-server reachability (the actual subject)**: up on port 3000 (`0.0.0.0`), `GET /docs` → `HTTP 200`. Next.js also reports a container-internal address `192.0.2.2:3000` (TEST-NET-1 range) alongside `localhost`. **Confirmed not reachable from outside the session** — no tunnel, no exposed public port; this is the expected result per the ADL, not a failure. **Mitigation, real result — differs from the previously-drafted guidance**: `playwright install chromium` **fails with a `403`** (`cdn.playwright.dev` not on this session's network allowlist) and is **unnecessary** — Chromium ships pre-installed at `/opt/pw-browsers` with `PLAYWRIGHT_BROWSERS_PATH` already set. The documented CLI one-liner (`playwright screenshot ...`) then failed too, but for a *different* reason: a browser-revision mismatch (the project's `playwright-core@1.58.2` expects revision 1208; only 1194 is pre-installed). Worked around with a small Node script launching the pre-installed binary directly via `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })` (import from `@playwright/test`, not a direct project dependency). Screenshot produced: `/tmp/cp10-preview.png`, 97990 bytes, `PNG image data, 1280 x 720, 8-bit/color RGB, non-interlaced` — confirmed via `ls -l` and `file`. **Corrected both `web-cloud-environments.mdx` and this case's own Step 4** to the verified-working guidance (do not run `playwright install`; fall back to the `executablePath` script on a revision mismatch) — a prior draft of both had recommended `playwright install chromium` as the fix, which real execution shows is actively wrong (it 403s) rather than merely unneeded. |
| 2026-08-20 | Claude Code Web | foomakers/pair (private) | **#414** | **[#454](https://github.com/foomakers/pair/pull/454)** | `MT-CP1003 PASS — primary evidence produced` | **The primary evidence this whole path exists to produce.** `$STORY` = #414 (chosen before the run, per Variables). A branch-collision was caught first: the session had started from `feature/US-225-claude-code-web` (this same execution's own fix commits), which would have mixed #414's PR with nine unrelated commits — corrected by branching fresh off `origin/main` (`git merge-base HEAD origin/main` confirmed equal to `origin/main`'s tip before proceeding). `/pair-process-plan-tasks 414` generated an 8-task breakdown (10/10 AC coverage verified against the story's real acceptance criteria) since #414 had none yet. `/pair-process-implement 414` then ran the full cycle **entirely inside the web session, no local terminal**: TDD discipline followed throughout (each test confirmed red before implementing), 8/8 tasks plus one unplanned fix (the formatting sweep step broke the mirror-guard toward `packages/knowledge-hub/dataset/.workflows/`; caught and fixed with the same exclusion pattern this story's own AC7 already established for `.pair/knowledge/**`), 9 commits, checkpoint (`.pair/working/checkpoints/414.md`) maintained across the run. Quality gate green except the Playwright component-test step in `pnpm --filter @pair/website test` — the identical sandbox limitation MT-CP1004 above already documented (Chromium revision mismatch, `cdn.playwright.dev` not on the network allowlist) — confirmed pre-existing on a clean baseline *before* touching #414's diff, so not a regression. The local pre-push hook (which runs the full `quality-gate` including that step) was bypassed with `--no-verify` **twice, both with explicit maintainer authorization**, reasoning that GitHub Actions CI — unlike this sandbox — has real network access and will exercise Playwright for real; documented transparently in the PR body both times, per this story's own AC7/MT-CP1006 discipline. **Result**: branch `feature/414-format-check-full-repo-coverage`, PR **#454** open, visible on GitHub, `secret-scan`/`build`/`smoke` checks green as of this note. Independent review (this repo's own `publish-pr` flow, dispatched to a clean-context subagent) ran once: `CHANGES-REQUESTED` on one Major — a CI-only flaky timeout in `run-format.test.ts` (subprocess round-trips at 6059ms against vitest's 5000ms default, passing locally at ~1.1s) — fixed with an explicit 15000ms timeout on the two affected AC4 tests, verified green locally, pushed. **Nothing in the flow required a local terminal outside the web session.** `$STORY` and `$PR` are both named here, per this case's own bar for evidence over claim. **Closed the loop**: a second independent review round (fresh clean-context reviewer, blind to the first round and to the fix's own description) re-verified the whole PR from scratch after the timeout fix — `APPROVED`, 0 new findings at any severity, 10/10 AC confirmed, CI `build` green on the fix commit. PR #454 **merged** by the maintainer (squash `07d4430`, 2026-08-21T11:56:17Z) onto `main`; story #414 closed. This is CP10's full life cycle observed once, end to end — assessed, then verified, then delivered — the exact chain AC2 asks for.

### Notes

- **The browser progress stepper is not reliable ground truth for a cloud session's actual state.** A "stuck" spinner in the claude.ai browser tab, even for 16+ minutes with no error, does not prove the container failed to provision — cross-check via the desktop/mobile app (or reload the tab) before concluding `BLOCKED`. This session's own history is the evidence: attempt 3 showed dead-stopped at step 1/4 in the browser indefinitely, while the app showed all three steps complete and a working, repo-aware Claude Code session underneath.
- **Corrective action taken**: this row was rewritten rather than left standing, because the earlier text stated a specific, actionable-sounding conclusion ("Claude Code Web platform-side provisioning fault... reported to the maintainer... not fixable from this codebase") that the new evidence shows was not established. Two commits on this branch carried that premature conclusion before this correction (`3ae6dc06`, `864c4b02`, `6f5b456b`) — left in branch history as the record of how the finding evolved, corrected here rather than rewritten away.
- **Causation resolved (attempt 4)**: a plain browser tab reload, with the desktop app never opened, resolved a fresh stuck session on its own. **The app was never necessary — reload the tab before concluding `BLOCKED`.** The earlier open question (reload-alone vs app-triggered-resume) is settled in favor of reload-alone; the app's "Sessione ripresa" wording in the prior attempt was not evidence of an app-specific action, just that client's own framing of picking up the already-current state.
- **Real defect found, not just a platform quirk**: MT-CP1001, once actually run (attempt 4), surfaced that this case's own Auth Preconditions table assumed `gh` is installed in Claude Code Web. It is not — GitHub access there is exclusively via `mcp__github__*` MCP tools. The table and this case's Expected Result are corrected above to accept either path.
- **Resolved**: whether attempts 1 and 2 (different network settings, before the causation was understood) would also have resolved on a reload is moot — attempt 4 established the general remedy going forward. MT-CP1002, MT-CP1003 and MT-CP1004 have since all been executed from that confirmed-working session and are recorded in their own rows above; this row covers MT-CP1001 only.
- Re-run at each release, alongside the rest of the suite. The point of a critical path over a one-off report is that the answer stays current.

---

## Changelog

- Added for #225 (verify & document pair on Claude Code Web): MT-CP1001..1006.
