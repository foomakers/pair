---
'@pair/pair-cli': minor
---

Agent harnesses: pair runs on pi, opencode, Claude Code and Codex:

- New `/pair-capability-setup-harness` makes any supported harness a valid pair environment. It resolves the harness, checks it against the project's needs and sets up skill paths, project context and model provider. It never touches credentials and only confirms on re-run. Bootstrap offers it at the end (#450).
- KB agent-harness guides for pi, opencode, Claude Code and Codex, one fixed 9-section index each, written from real installs (#450, #441).
- `tech/automation.md` gains `## Harness` (supported harnesses, optional `Requires: <access-path>`) and `## Model Policy` (model class per risk tier) (#450).
- `/pair-workflow-cycle` runs in-session on each harness. Claude Code uses subagents, Codex uses `spawn_agent` (#441), and pi uses a pinned `pi-subagents` bridge (`pi ≥ 0.86.1`, `pi-subagents@0.71.0`). Setup-harness installs these only after an explicit yes. A pi stage resumes only inside its own session, otherwise it starts fresh and says so (#503).
- A harness with no subagent primitive HALTs with `realization-unavailable` and points to `pair-cli run` (#486).
- Pair is verified and documented on Claude Code Web (#225).
