---
'@pair/pair-cli': minor
---

Delivery cycle: one state machine, many realizations:

- New `/pair-workflow-cycle` drives one card through prepare → validate → implement → green → verify, one stage per subagent, from Claude Code, Codex or pi. It can also enter on an existing PR for fix and review only (#494, #512, #516).
- The delivery workflow is rebuilt as a coordinator plus phase skills (`red-spec`, `red-verify`, `green-fix`, `implement-phase`, `review-phase`), with deterministic seal and custody scripts (#480).
- **Breaking (cycle contract):** a fresh card starts at test-first implement with no up-front contract. Open review findings must carry a reproducer or a failure scenario. `red-snapshot.mjs seal` requires `--static-gates` (#509).
- `merge` is a cycle stage. It re-verifies tier, head, review and approval live, then squash-merges and closes the card with its parent cascade (#520).
- Adoption decides what blocks (`## Blocking Severities`, optional `max-dispatches`) (#515). Cycle Hooks run before and after each stage, before and after the cycle, and on halt (#519). Per-stage profiles set engine, model, effort and context (#517).
- PM and code-host adapters (GitHub, Azure DevOps) with an extension guide. The scripts no longer call `gh` directly (#513).
- Autonomy model: `until`, `prepare` and `merge` gates are shared by the CLI, the cycle, the batch and the loop. Autonomous prepare runs refinement and task breakdown under the prepare gate. Batch is the cycle on N cards, and the loop only selects (#525, #527, #529).
- The four cycle agents default to `sonnet` (#498). A custody check can be waived only by an explicit, attributed override (#497). Machine contracts are derived from KB templates and cached by hash (#318).
- Fixes: every remediation group gets its own findings. red-spec refuses unformatted test artifacts. red-verify lists every gap in one rejection. implement-phase moves the card to `In Progress` and lists external AC as pending live verification. An external-only block can always be answered with `decide`. A bare `eslint` inside a package finds the shared config (#542).
- Fixes: every stage resolves with `--acHash`. Re-review after a decided external blocker. The worktree checks out an existing card branch. Post-merge closure resolves the repo slug and deletes the branch via the host API. Review noise is reduced across escalations and resumes (#374).
