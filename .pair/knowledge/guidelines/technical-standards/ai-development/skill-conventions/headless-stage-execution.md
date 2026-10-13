# Headless Stage Execution

Single owner of the rules every delivery-stage skill follows when the engine runs it headless (`claude -p` and its siblings): one prompt in, one final message out. Nothing wakes the agent after its turn ends.

## Rules

1. **Never leave a long command in the background and never end the turn while one runs.** A `git push` that triggers a pre-push gate, a full-repo quality gate or a test run can pass the tool's default timeout and be moved to the background; a turn that then ends "waiting for completion" ends the stage with no push, no PR and no handoff — the driver sees "process success, handoff NOT advanced".
2. **Give such a command the maximum tool timeout and poll it to completion in the same turn** (re-read its output file until it exits), then continue to the next step. Scope commands so they stay short; narrate between steps.
3. **Always end with the stage's structured result**, even on partial progress. When the stage cannot finish (a gate or push that will not complete, a step that failed), return `{ status: "failed", reason: "incomplete", detail: <what is done — commits, pushed or not — and what remains>, branch, outputHead }` rather than ending in prose. Commits already on the branch are resumed by the next attempt.

## Applies to

`implement-phase`, `green-fix`, `red-spec`, `red-verify`, `review-phase`, `contract-phase` and the capability `publish-pr` (which pushes and runs the quality gate), and any skill a stage invokes that pushes or runs a gate. A conformance test pins that each references this file.
