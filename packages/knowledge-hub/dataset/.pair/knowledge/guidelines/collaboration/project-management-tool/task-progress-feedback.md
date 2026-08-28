# Task-Progress Feedback — checklist ticks + one batched comment

A story broken down by `/plan-tasks` carries its tasks **inline**, as a checklist in its own body. This guideline defines what happens to that checklist while `/implement` works through it: the completed item is **ticked**, the outcome is **queued**, and the run posts **one batched comment** carrying a line per task. That is the whole of the feedback loop — progress is visible at task granularity, on the item itself, without anyone watching a terminal.

It exists because an unattended run is otherwise silent between "In Progress" and a pull request. The story that is on task 3 of 4 and the story that failed on task 2 look identical on the board, and the only witness to the difference is a session that no longer exists.

## Scope — one mechanism, one owner

The call sites belong to `/implement` — Step 2.8 (per task) and its closing phase (the flush). **`/implement` is also the only caller**: a supervised run reaches this loop through `/loop` → `/implement-batch` → `/implement`, so the manual and the supervised path run the same code path by construction, not by two implementations kept in agreement. An automation layer that posted its own per-task progress comment would double every line this one already carries.

What this guideline owns: the locator, the tick, the batch, its format, and the fallbacks when a write does not land. What it does not own:

- **The transport.** The tick and the comment are both written through `/write-issue` — write mode for the body, `$mode: comment` for the batch — and every per-tool mechanic (which API call, which flag) stays in that skill and the implementation guide it resolves.
- **The board state.** Ticking an item is not a state transition. `In Progress` is written once, at Step 0.1b, and this loop never touches a board field.
- **The task model.** Tasks are inline checklist items; **no separate task issues are created**, and none are created here either — a tick is an edit to one line of one body.

## The task-ID locator

The item to tick is found by its **task ID**, never by its position and never by its title. The match is **anchored on the task ID token** — `T` followed by the task's number, with an optional hyphen and optional bold markers — so that every rendering the corpus actually produces resolves to the same item:

| Rendering | Where it comes from |
| --- | --- |
| `- [ ] **T-3**: Comment batcher` | `/plan-tasks`' canonical checklist line |
| `- [ ] T3 — Comment batcher` | the story template's Task Breakdown, as hand-written and as refined |
| `- [ ] **T3**: Comment batcher` | the two above, mixed |

Titles are not part of the anchor: a task renamed during implementation still ticks, and a title that happens to contain another task's words never steals the match.

The locator must resolve to **exactly one** unticked-or-ticked checklist line in the `## Task Breakdown` section. Anything else is a mismatch, and a mismatch is **reported, never resolved**:

- **Zero matches** (the body was edited meanwhile, the section was renamed, the ID never existed): record `not-found` for that task in the batch — the comment says which ID was not found in which section — and write nothing to the body.
- **More than one match** (an ambiguous ID, e.g. `T1` also appearing inside `T1`'s own follow-up line): record `ambiguous` with the count, and write nothing to the body.

Both outcomes leave the checklist exactly as it was. **Never guess-tick**: a tick on the wrong line is worse than no tick at all, because the story then reports work that was not done and nothing later contradicts it.

## The tick-only body patch

The patch is a single-line edit. On the matched line, and on nothing else, `[ ]` becomes `[x]`; **every other byte of the body is identical** to the body that was just read — same sections, same ordering, same trailing whitespace, same Definition-of-Done boxes.

Three properties make that a rule rather than an intention:

1. **The transport is a full-body overwrite.** `/write-issue`'s write mode replaces the body with what the caller passes, so the caller must pass the current body with the one line patched — read, patch, write. Nothing about the transport prevents a re-rendered body from replacing the story's acceptance criteria; the caller's own care is the only thing that does.
2. **The write is diff-checked before it is sent.** Compare the patched body against the body just read: the diff must be exactly one line, and that line must differ only in its checkbox marker. A diff of any other shape is a bug in the patch, and the write is **abandoned** (recorded as `patch-rejected` in the batch), never sent hopefully.
3. **The patch never unticks.** An item **already ticked** (`[x]`) is already in the target state: no body write is sent at all, and the task is reported as ticked. That is what makes a re-run — a resumed story, a re-invocation after a context reset — free of writes and free of noise.

Definition-of-Done boxes are patched by the same rule when a task factually satisfies one; boxes that need a reviewer's judgment stay unticked.

## Batching and the comment format (D22)

Ticks are silent. The narrative — what was attempted, what landed, what did not — is **one comment per run iteration**, and a **run iteration is one `/implement` invocation over one story**: a manual session is one iteration, and a supervised run contributes one per card per pass. Pinning the unit is what keeps the two paths on the same cadence instead of one reading it as "per session" and the other as "per loop pass".

Each task's outcome is **queued** as it happens and the queue is **flushed exactly once**, at the end of the invocation — including an invocation that ends early. A run that stops at a HALT has the most to report, so the flush is not a success path: it happens on the way out, whatever the way out is.

The format honours the reading budget (D22): a headline, then **one line per task**, then everything else collapsed.

```markdown
**Task progress — 3 of 4 tasks this iteration** · `feature/US-220-breakdown-task-feedback-loop`

- ✅ T1 — Checklist locator + body patcher
- ✅ T2 — Comment batcher + failure recording
- ❌ T3 — Wiring into implement — quality gate red (unit)

<details>
<summary>Details</summary>

- T3: `pnpm --filter @pair/knowledge-hub test` failed on 2 assertions; run halted before commit, checklist item left unticked.

</details>
```

Rules the shape encodes:

- **One line per task, and the line is the whole story for a reader who does not expand.** Outcome glyph, task ID, title, and — for anything other than a plain success — a short reason on the same line.
- **Everything longer goes in `<details>`**: error output, retry traces, locator mismatch diagnostics. No stack trace, no command transcript, and no diff outside the collapsed block.
- **An empty batch posts nothing.** An invocation that completed no task leaves no comment — a re-run that finds every task already done is silent, which is what keeps an idempotent re-invocation from accreting one "nothing to report" comment per attempt.
- **Never a second comment.** More detail belongs in `<details>`, never in another comment; the loop has no verbosity level that turns one comment into several.

Verbosity and cadence are the defaults, not a law: a project that wants something else declares it in its own adoption. Absent a declaration, this is what runs.

## Outcome vocabulary

Every queued line carries exactly one outcome from this closed set, and the outcome decides the checklist item — never the other way around.

| Outcome | What happened | Checklist item |
| --- | --- | --- |
| `ticked` | The task completed and the patch landed (or the item was already `[x]`) | `[x]` |
| `failed` | The task did not complete — a red gate, an error, a HALT | stays unticked |
| `skipped` | The task was deliberately not attempted this iteration (blocked, deferred, out of scope) | stays unticked |
| `not-found` | The locator matched no line for this ID | stays unticked |
| `ambiguous` | The locator matched more than one line for this ID | stays unticked |
| `patch-rejected` | The patch diff was not a single checkbox-only line change, so the write was abandoned | stays unticked |
| `write-failed` | The body write was attempted and did not land, retries included | stays unticked |

The three write-path outcomes (`not-found`, `ambiguous`, `write-failed`) say nothing about the work: the task may well be done. The line reports the **feedback** failure and names the ID it could not tick, so a human can tick it by hand — and the run carries on.
