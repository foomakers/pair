# From autonomy policy to workflow steps

Nothing is enforced out of sight: every approval, gate, escalation and merge is a step of the workflow. The engine blocks nothing; the validator warns. See [workflow grammar](workflow-grammar.md) and [step kinds](workflow-kinds.md).

## Becomes a step or a key

| Today in code | Becomes |
| --- | --- |
| Policy `merge: hold-always` (default) | `approval` before `merge`, no `when` |
| `merge: hold-when; has: risk:red` | `approval` with `when: { has: [risk:red] }` |
| `merge: hold-never` | no `approval` step |
| `until: ready \| pr \| merged` | where the workflow ends: without `merge` it stops at the PR |
| Policy `prepare` | `with.mode` of `refine-story` (#678) |
| Tier gate (`verify-quality` before merge) | `gate` with `gates: [quality-gate]` |
| CI wait | `gate` with `checks: [ci-green]` |
| Reviewed head equals remote head | `gate` with `checks: [head-unchanged]` |
| `pair-review` check green | `gate` with `checks: [review-approved]` |
| Prerequisite guard before implement | `gate` with `checks: [prerequisites-done]` |
| Explicit approval on `risk:red` | `approval` with `when`, authorized by the platform |
| Escalation (label and comment) | a run parked by `approval`, by `on-max: escalate` or by a step's `needs-human` |
| Pre / post stage hooks | `gate` steps at the matching point; their commands get a registry key |
| Post-merge closure and cascade | inside `merge` |
| Manual tests after merge | a `generic` step after `merge` |
| Blocking severity floor | `with.blocking` of `review`, `with.severity` of `fix` |

## Deleted, no replacement

| Today | Why |
| --- | --- |
| Presets `full`, `escalate-red`, `supervised`, `custom` and the prompt that writes them | they are different workflows |
| `## Auto-Advance` and its translation | legacy path |
| Five-level precedence chain of autonomy | what remains: command line, configuration, workflow |
| Autonomy decision before every stage | approvals sit where needed, written in the file |
| JSON format of decision comments | replaced by `/approve`, `/reject` and the native review |
| Hooks `on-halt`, `post-cycle` | no "end of run" handler in the grammar |
| Run-wide `max-dispatches` ceiling | each loop has its `max` |

## Not ported; these park the run

Typed answers that choose a path, merge order of stacked PRs, re-opening of finished steps when the head moves, several reviewers on one head.

The autonomy code and its sections stay until #700 deletes them with the cycle that uses them.
