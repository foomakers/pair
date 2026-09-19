---
name: pair-workflow-cycle
description: "In-session coordinator for pair's delivery cycle: drives ONE card through prepare → validate → implement → green → verify, one stage per subagent, from an interactive Claude Code or Codex session — no dependency on Claude Code's Workflow tool. Enters on a fresh card ($card) or straight into fix & review on an existing PR ($pr). Holds zero cycle rules: every transition, budget and freshness decision comes from cycle-state.mjs resolve, every argument packet and worktree from cycle-dispatch.mjs. Binds its harness by PROBING for a subagent primitive, never by product name, and HALTs realization-unavailable with the pair-cli fallback when none is present. Never decides merge."
version: 0.1.0
author: Foomakers
---

# /pair-workflow-cycle — One Card, One Stage at a Time, From Inside a Session

The delivery cycle is a state machine that already exists; this skill is one way to turn its crank. It asks the durable state what is due, dispatches exactly that stage to a subagent, forgets everything but the answer, and asks again. It classifies nothing, judges nothing and selects nothing — every decision it acts on was already taken by `cycle-state.mjs`, and every packet it hands out was rendered by `cycle-dispatch.mjs`.

Two entries, one cycle: a refined card with no PR runs the whole thing; a PR that already exists enters at its first verification and runs fix & review. You never merge, and you never review.

## Arguments

| Argument    | Required | Description                                                                                                                                                                                 |
| ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$card`     | One of   | Card (issue) number. The fresh-card entry: `resolve` yields `prepare / initial / a0`. Give `$card` or `$pr`, never both and never neither.                                                    |
| `$pr`       | One of   | PR number — the fix & review entry: `resolve` yields `verify / first / r0` and NO preparation runs before it. The card is read from the PR's linked issue.                                     |
| `$rounds`   | No       | How many remediation rounds THIS invocation may spend. Default: the policy's `maxFixRounds`. It only ever narrows: a `$rounds` above `maxFixRounds` is **clamped** to the policy value and the clamp is reported — it can never widen the ceiling, because the ceiling is the cycle's, not the invocation's. |
| `$runId`    | No       | Run directory to drive: `.pair/working/runs/$runId/<card>/`. Default `story-<card>` — the batch engine's own convention, so a cycle started by `pair-implement-batch` resumes here and back.    |
| `$notes`    | No       | Scope directive from the card; threaded into every stage packet, overriding the issue body where they conflict.                                                                              |
| `$profile`  | No       | The execution profile. JSON object; today carries `effort` (one of `low \| medium \| high \| xhigh \| max`, mirrors `pair-implement-batch.js`'s own `agent()` effort dial) — applied to every stage's dispatch instruction. Enforced for Codex (`-c model_reasoning_effort=<value>` on the dispatch call); a best-effort PROMPT REQUEST only for Claude, whose `Agent` tool exposes no effort parameter at all — never claim it is enforced there. Per-stage `context`/model roles remain reserved (#488). Unresolvable ⇒ HALT `profile-unresolved`; never a silent default; absent ⇒ today's behavior, unchanged.                                                         |

Everything else a stage receives — `$run $story $branch $worktree $base $stacked $entry $policy $inputs $workflowVersion` and the phase-specific arguments — is **rendered by the script**, never composed here in prose.

## Algorithm

### Step 0: Bind the realization (mandatory, before any dispatch)

**Check.** Read the table as data and probe your OWN toolset for its dispatch primitive:

```bash
node "$SKILL_DIR/scripts/cycle-dispatch.mjs" realizations --tools '<JSON array of the tool names you actually have>'
```

**Skip.** Never. A realization bound in a previous turn is re-probed: the toolset is a property of this session, not of the task.

**Act.** The script returns `bound` and the row it bound:

| Row      | Dispatch primitive | Resume primitive              | How the role travels                       |
| -------- | ------------------ | ----------------------------- | ------------------------------------------ |
| `claude` | `Agent`            | `SendMessage`                 | `agentType` — the stage's agent definition  |
| `codex`  | `collaboration.spawn_agent` \| `multi_agent_v1__spawn_agent` | `collaboration.followup_task` \| `multi_agent_v1__resume_agent` | the agent `.md` body + the skill reference  |

Report which realization won and which primitives it bound to, in one line.

**Verify.** The row is bound by the PRIMITIVE the probe found, never by a product name or a version string: a name is a claim about the host, a present tool is evidence of it. No row applies ⇒ HALT `realization-unavailable` (below) **before any dispatch** — including the case where this skill is itself running inside a subagent and the host forbids nesting.

### Step 1: Resolve what is due

**Check.** Ask the one authority, from the MAIN checkout:

```bash
WV="$(node "$SKILL_DIR/scripts/cycle-state.mjs" version)"
node "$SKILL_DIR/scripts/cycle-state.mjs" resolve --dir ".pair/working/runs/$runId/$card" \
  --workflowVersion "$WV" --policy '<policy JSON>' --entry <fresh|pr> [--pr $pr] \
  --story $card --inputs <digest> --runsRoot .pair/working/runs [--redirects <n>]
```

The workflow version is never typed: `cycle-state.mjs version` prints the one value this cycle speaks, and every command below is handed that capture. A version outside `<major>.<minor>.<patch>` is refused by whichever command receives it, before it does any work — so a literal remembered from a previous session fails the run rather than mints an identity nothing downstream accepts.

The digest is the script's own — never computed by hand, because both realizations must agree on it:

```bash
node "$SKILL_DIR/scripts/cycle-state.mjs" inputs --story '<card JSON>' --workflowVersion "$WV"
```

**Skip.** Nothing here is skippable, on any turn, including the first.

**Act.** Read `next` and nothing else. `status: other-run` ⇒ the cycle already lives under that run id: adopt it and resolve again. `incompatible` ⇒ stop and report (a legacy run directory is pointed at `migrate-acknowledge`, never migrated in place). `invalid` ⇒ stop and report.

**Verify.** `next.step` is `done` or `blocked` ⇒ go to Step 5. Otherwise it names the one stage due now.

### Step 2: Put the stage's worktree in place

**Check.** The authoring chain runs in the persistent story worktree; the final verifier gets a detached throwaway one.

```bash
node "$SKILL_DIR/scripts/cycle-dispatch.mjs" worktree --main "$PWD" --story $card \
  --branch <card branch> --base <base ref> --worktree-root <root>
```

**Skip.** Already present on the same branch ⇒ the script answers `reused: true` and adds nothing. Run it anyway: it is the idempotency, not a check you make yourself.

**Act.** Nothing by hand. The script creates or reuses.

**Verify.** `halt: worktree-conflict` or `halt: worktree-root-invalid` ⇒ HALT (below). Every path segment and git ref this script is handed is validated BEFORE anything is created, so a refused root leaves no directory and registers no worktree. The developer's own checkout is never touched, and no worktree is ever `--force`d or switched.

### Step 3: Render the packet and dispatch exactly one stage

**Check.**

```bash
node "$SKILL_DIR/scripts/cycle-dispatch.mjs" packet --next '<next JSON>' --card '<card JSON>' \
  --policy '<policy JSON>' --run "$runId" --workflow-version "$WV"
```

**Skip.** Never compose a stage prompt yourself, not even "the obvious one": the packet is byte-identical to what the batch engine composes, and a hand-written variant is a second process wearing the same name.

**Act.** Dispatch `prompt` under `agentType` (Claude) or as the row's role packet (Codex), honouring `next.context`:

- `fresh` — spawn a NEW subagent. This is the KB default on every transition, and it is **mandatory** into `validate` and `verify`: an independent verifier that inherits the author's context is not independent.
- `reuse` — **resume** the previous subagent of that same role instead of spawning one (`SendMessage` on Claude, whichever of `collaboration.followup_task` / `multi_agent_v1__resume_agent` the probe actually bound on Codex — its own tool namespace has renamed twice in one day, so never hardcode either name yourself; read it from the bound realization). `cycle-state.mjs` returns `reuse` only for `prepare→prepare`, `implement→green` and `green→green`; it is never this skill's call. `cycle-dispatch.mjs context-table` prints the table.
- `$profile.effort`, when given: for Codex, pass it as a real dispatch-call parameter (`-c model_reasoning_effort=<value>`), never only as prose — the packet's `effort` field names the value, this skill applies it to the primitive. For Claude, there is no such parameter to set: the packet's prompt already carries the request in text (rendered by `cycle-dispatch.mjs`); do nothing further, and never report it as enforced.

**Verify.** `halt: pipeline-invalid` ⇒ HALT (below): every `--pipeline` value is held to the same grammar the batch engine holds it to, and no packet is rendered from a refused one. Otherwise one stage, one dispatch. Keep only the compact `resolve` output; never read a handoff whole into this session, and never retain a subagent's transcript.

### Step 4: Decide from the file, never from the return value

**Check.** The stage has ended, however it ended. Re-run Step 1.

**Skip.** Nothing. In particular, do not skip the re-resolve because the subagent returned something that looks conclusive — and do not treat a missing or malformed return as a failure on its own.

**Act.** Compare the durable state with what it was before the dispatch:

- the handoff ADVANCED ⇒ the stage succeeded, whatever it printed;
- the handoff did NOT advance ⇒ a **dead dispatch**: re-dispatch the SAME prompt once (every stage is re-entrant, so the retry resumes), then a second unadvanced handoff ends the cycle `failed-<step>`. The budget is `policy.deadDispatchRetries` from `resolve`, defaulted to 1 — it is data, not a number written here.

**Verify.** Count the remediation rounds spent against `$rounds` (clamped to `maxFixRounds`). At the bound, stop and print the `next` step the cycle would take — do not spend another round. Otherwise loop to Step 2.

### Step 5: Report the terminal state

**Check.** `next.step` is `done` or `blocked`.

**Skip.** Never.

**Act.** Report exactly what `resolve` said: `ready-for-merge` when the cycle converged, `escalate` when a human decision is owed, `failed-<stage>` otherwise — with the run directory, the PR and the reviewed head.

**Verify.** You have not merged, not closed the card, not deleted a branch and not posted a review. A converged cycle is a card ready for a human; the `merge` stage is another story's, and `resolve` returns it only when the project's auto-advance policy admits the card's tier.

## HALT Conditions

| HALT                     | When                                                                                   | What you print                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `realization-unavailable`| No row's dispatch primitive is present — no subagent primitive, or nesting is forbidden | The probed toolset and the fallback command `pair-cli run --card N [--pr P]` (the `--pr` half only when a PR exists) |
| `worktree-conflict`      | `<root>/<card>` exists on another branch, or is not a registered worktree               | Both branch names and the path; resolve it by hand — never `--force`, never a checkout switch |
| `worktree-root-invalid`  | `--worktree-root` is not an absolute path nor a relative one of safe segments with at most one leading `..` | The value, refused verbatim — nothing is created and no worktree is registered |
| `pipeline-invalid`       | A `--pipeline` key or value is outside the grammar the batch engine enforces on it      | The offending key and why — no argument packet and no prompt are rendered                   |
| `workflow-version-invalid` | `--workflow-version` is not `<major>.<minor>.<patch>` — the grammar `publish` already enforces | The value, refused verbatim — no argument packet and no prompt are rendered from it. Pass the `version` command's output, never a remembered literal |
| `profile-unresolved`     | `$profile` was given and cannot be read or does not validate                            | What was asked for and why it did not resolve                                              |
| `usage`                  | `$card` and `$pr` both given, or neither                                                | The two valid entries                                                                      |

An unrecognized `resolve` output is a HALT too, never a silent degradation: this skill fails closed everywhere.

## Graceful Degradation

- **No subagent primitive** (pi, opencode, a nested dispatch): HALT `realization-unavailable` and hand over the `pair-cli run --card` line. Nothing is half-run.
- **A Codex dispatch returns nothing structured**: irrelevant by construction — the handoff on disk is the contract, and Step 4 reads it.
- **The remote head moved between stages**: `resolve` reports `failed-resume`. Stop and report; a rebase is never repaired here.
- **A legacy (pre-schema-3) run directory**: `resolve` reports `incompatible`. Stop and point at `migrate-acknowledge`; never write into the legacy directory.
- **A run directory at the per-story ceiling**: `resolve` returns `blocked` / `failed-resume` with `cap: dispatchesPerStory`. It counts the PUBLISHED HANDOFFS in that directory, cumulatively across every resume, so it never clears by retrying — report the detail as it comes, `migrate-acknowledge` included.
- **A long cycle growing this session's context**: only `resolve` outputs are retained. When it still grows, the cycle is resumable — re-invoke on the same `$runId` and it continues from the first incomplete step, re-running no completed stage and opening no second PR.

## Output Format

`{ status, card, pr, runId, realization, terminal, reviewedHead?, roundsSpent, roundsBound, stages: [{ step, phase, context, dispatches, outcome }], halt?, detail? }` — `terminal` is one of `ready-for-merge | escalate | failed-preparation | failed-contract | failed-implement | failed-fix | failed-verify | failed-resume | awaiting-scope-decision`, copied from `resolve`, never synthesized.

## Notes

- This skill is an opt-in execution layer. `/pair-process-implement`, `/pair-process-review` and `/pair-capability-publish-pr` keep working exactly as before, step by step, and none of them changes signature because this exists.
- It owns no cycle rule: caps, budgets, the effective-inputs composition and the freshness table are `cycle-state.mjs`'s data, and the argument packets are `cycle-dispatch.mjs`'s rendering. If you find yourself about to write a number here, it belongs in one of those two files.
- No new agent type: the four existing roles are reused as `agentType` (Claude) or role packet (Codex).
- It never merges, never closes a card, never deletes a branch, never files an issue and never posts a review comment.
