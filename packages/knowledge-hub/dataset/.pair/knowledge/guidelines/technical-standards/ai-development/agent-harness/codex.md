# Codex

The OpenAI Codex CLI. MCP-native, reads `AGENTS.md`, discovers skills under `.agents/skills`, and — relevant to pair's delivery cycle — exposes an in-session sub-agent primitive (`collaboration.*`) that `pair-workflow-cycle` binds as its `codex` realization.

## 1. Config File Locations

| Path | What | Committable |
| --- | --- | --- |
| `~/.codex/config.toml` | User config: `model`, `model_reasoning_effort`, `approval_policy`, `sandbox_mode`, `[features]`, `[mcp_servers.*]` | No (per developer) |
| `~/.codex/auth.json` | Login state | Never |
| `~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-*.jsonl` | One transcript per session, sub-agent sessions included | No |

Any `config.toml` key can be overridden per run with `-c key=value` (e.g. `-c model_reasoning_effort=low`).

## 2. Skill-Path Declaration

Codex discovers skills under `.agents/skills/<name>/SKILL.md`. pair ships them under `.claude/skills/`; a symlink `.agents/skills -> ../.claude/skills` makes every pair skill visible to Codex with no copy. Observed: a Codex session and its sub-agents loaded `pair-workflow-cycle` and `pair-workflow-implement-phase` through that link (2026-09-28).

## 3. Project Context Loading

Codex reads `AGENTS.md` at startup and injects it into every sub-agent it spawns as well (observed: each spawned agent's first message is the repository's `AGENTS.md` block, followed by the task). No duplication with `CLAUDE.md` handling is needed on Codex's side.

## 4. Authentication

`codex login` — a ChatGPT subscription login (`codex login status` → `Logged in using ChatGPT`) is the **local-interactive path**; its usage counts against the ChatGPT plan. For CI, use an API-key login as Codex's own docs describe. No credential ever passes through this KB or `/pair-capability-setup-harness`.

## 5. Access Paths

**MCP yes**: servers declared under `[mcp_servers.*]` in `config.toml`, plus Codex's built-in app connectors (observed: `codex_apps` → `github.fetch_issue`). CLI remains the baseline pair's skills are written against; a failing MCP server (e.g. one needing OAuth) only logs an error and does not stop the session.

## 6. Model Provider Configuration

`model` in `config.toml` or `-m <model>` per run; reasoning effort via `model_reasoning_effort` / `-c model_reasoning_effort=<low|medium|high>`. Observed working for this guide: `gpt-6-luna` at `low` (probes) and `medium` (a cycle run). `spawn_agent` accepts its own `model` and `reasoning_effort`, so a coordinator can run stages on a different model than itself.

## 7. Headless Execution

`codex exec "<prompt>"` — always with **stdin closed** (`< /dev/null`): with an open stdin it waits for "additional input from stdin".

- `-o <file>` writes the final message; `--json` streams events (sub-agent spawns appear only in the session rollout, `~/.codex/sessions/...`, not in the `--json` stream).
- `--output-schema <file>` holds the final message to a JSON Schema — the hook for validating a stage's structured result against the same step contract the other realizations use.
- `-s <read-only|workspace-write|danger-full-access>`: the delivery cycle needs `danger-full-access` (worktrees outside the repo, `git push`, `gh` network).

### In-session sub-agents (the `codex` realization)

With the `multi_agent` feature on (`codex features list`: `multi_agent stable true`), a session exposes, under the `collaboration` namespace:

| Tool | Parameters | Use in the cycle |
| --- | --- | --- |
| `spawn_agent` | `task_name`, `message`, `fork_turns?`, `model?`, `reasoning_effort?` | dispatch a **fresh** stage (no `fork_turns` ⇒ no inherited session) |
| `followup_task` | `target`, `message` | resume the **same** agent (`next.context: reuse`); triggers a turn if it is idle |
| `wait_agent` | `timeout_ms?` | wait for a mailbox update — returns **no content**; the coordinator reads the stage's published handoff |
| `send_message` | `target`, `message` | message without a new turn |
| `interrupt_agent` | `target` | stop a stalled stage (the cycle's one stall resume / dead-dispatch retry) |
| `list_agents` | `path_prefix?` | list live agents |

**Resume, proven (#441, 2026-09-28):** a spawned agent (`/root/reuse_probe`) was given a secret; a later `followup_task` to the same target made it repeat the secret without reading any file, and `list_agents` showed no second agent — the same agent, the same session. That is what `next.context: reuse` needs.

### In-session vs `pair-cli run --engine codex` (#441 go/no-go)

Same card, same stage (`verify / first / r0` on PR #516), 2026-09-28, `gpt-6-luna`:

| | Codex in-session (`pair-workflow-cycle`) | `pair-cli run --card 441 --pr 516 --engine codex` |
| --- | --- | --- |
| Wall time | 18 min (coordinator start → second `resolve`) | 21 min (start → handoff) |
| Processes | one `codex exec`; the stage is a sub-agent inside it | one new `codex exec` per stage |
| `reuse` transitions | same agent via `followup_task` | not possible — every stage is a new process |
| Result | CHANGES-REQUESTED, same two findings | CHANGES-REQUESTED, same two findings |

Both realizations drive the same state (`cycle-state.mjs`): `pair-cli` even adopted the run the in-session coordinator had left (`prepare r1-g1`) and continued it. **Go:** the in-session realization is the one that honours `next.context: reuse` and spawns no extra process per stage; `pair-cli` stays the fallback when a session has no sub-agent primitive.

`pair-workflow-cycle` binds these by probing the session's tool list (`cycle-dispatch.mjs realizations`), never by product name: the `codex` row carries `collaboration.spawn_agent` / `collaboration.followup_task` plus aliases for the namespaces Codex has used before (`multi_agent_v1__*`).

## 8. What Codex Does NOT Support

- **`resume_agent` / `send_input` / `close_agent`** are absent in 0.157.1 (they existed under earlier namespaces); resume is `followup_task`.
- **`wait_agent` returns no result content** — a stage's outcome is its published handoff, read through `cycle-state.mjs resolve`, never the agent's chat.
- A spawned agent has the same tools as its parent, including `spawn_agent`; the cycle still dispatches one level only.

## 9. Verified-Against Version

`codex-cli 0.157.1`, observed 2026-09-28 on macOS, model `gpt-6-luna`: two probe sessions (tool list and `collaboration.*` signatures) and two `pair-workflow-cycle` runs coordinated by Codex (#441) — realization bound, `resolve` → `packet` → `collaboration.spawn_agent` (fresh) → the stage's structured result and published handoff (a real `verify` on PR #516), the dead-dispatch retry and `interrupt_agent` on a stall, all as in the Claude realization — plus a `followup_task` resume probe and a same-stage comparison with `pair-cli run --engine codex`.
