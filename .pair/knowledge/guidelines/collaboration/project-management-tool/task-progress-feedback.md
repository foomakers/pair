# Task-Progress Feedback — checklist ticks + one batched comment

A story broken down by `/pair-process-plan-tasks` carries its tasks **inline**, as a checklist in its own body. This guideline defines what happens to that checklist while `/pair-process-implement` works through it: the completed item is **ticked**, the outcome is **queued**, and the run posts **one batched comment** carrying a line per task. That is the whole of the feedback loop — progress is visible at task granularity, on the item itself, without anyone watching a terminal.

It exists because an unattended run is otherwise silent between "In Progress" and a pull request. The story that is on task 3 of 4 and the story that failed on task 2 look identical on the board, and the only witness to the difference is a session that no longer exists.

## Scope — one mechanism, one owner

The call sites belong to `/pair-process-implement` — Step 2.8 (per task) and its closing phase (the flush). **`/pair-process-implement` is also the only caller**: a supervised run reaches this loop through `/pair-loop` → `/implement-batch` → `/pair-process-implement`, so the manual and the supervised path run the same code path by construction, not by two implementations kept in agreement. An automation layer that posted its own per-task progress comment would double every line this one already carries.

What this guideline owns: the locator, the tick, the batch, its format, and the fallbacks when a write does not land. What it does not own:

- **The transport.** The tick and the comment are both written through `/pair-capability-write-issue` — write mode for the body, `$mode: comment` for the batch — and every per-tool mechanic (which API call, which flag) stays in that skill and the implementation guide it resolves.
- **The board state.** Ticking an item is not a state transition. `In Progress` is written once, at Step 0.1b, and this loop never touches a board field.
- **The task model.** Tasks are inline checklist items; **no separate task issues are created**, and none are created here either — a tick is an edit to one line of one body.

## The task-ID locator

The item to tick is found by its **task ID**, never by its position and never by its title. The match is **anchored on the task ID token** — `T` followed by the task's number, with an optional hyphen and optional bold markers — so that every rendering the corpus actually produces resolves to the same item:

| Rendering | Where it comes from |
| --- | --- |
| `- [ ] **T-3**: Comment batcher` | `/pair-process-plan-tasks`' canonical checklist line |
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

1. **The transport is a full-body overwrite.** `/pair-capability-write-issue`'s write mode replaces the body with what the caller passes, so the caller must pass the current body with the one line patched — read, patch, write. Nothing about the transport prevents a re-rendered body from replacing the story's acceptance criteria; the caller's own care is the only thing that does.
2. **The write is diff-checked before it is sent.** Compare the patched body against the body just read: the diff must be exactly one line, and that line must differ only in its checkbox marker. A diff of any other shape is a bug in the patch, and the write is **abandoned** (recorded as `patch-rejected` in the batch), never sent hopefully.
3. **The patch never unticks.** An item **already ticked** (`[x]`) is already in the target state: no body write is sent at all, and the task is reported as ticked. That is what makes a re-run — a resumed story, a re-invocation after a context reset — free of writes and free of noise.

Definition-of-Done boxes are patched by the same rule when a task factually satisfies one; boxes that need a reviewer's judgment stay unticked.
