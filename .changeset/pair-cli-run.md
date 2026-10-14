---
'@pair/pair-cli': minor
---

`pair-cli run`: run pair's delivery from the console on any engine:

- `pair-cli run` executes a skill headless inside `pi`, `opencode` or `claude -p`, re-invoking it until the stop condition is met. The engine comes from `--engine`, then `pair.config.json`, then the default, and the resolved command is printed before anything runs (#451, #459).
- `--card <id>` coordinates one card through the whole delivery cycle stage by stage, with a fresh engine process per stage. It resumes from the step that is due. A card that is not ready falls back to preparation. `--pr <n>` enters at fix and review, and `--rounds` and `--run-id` are also available (#487, #504).
- `--root <id> --parallel <n>` fans out over a subtree as separate `run --card` processes. The limit is min(dependencies, `## Max Parallelism`, the flag), printed with every excluded card and the reason. Mutex resources are locked and released on Ctrl-C (#491, #511).
- Portable loop: `--watch`/`--interval` (default 10m, floor 60s) runs a fresh selection every iteration. `--filter`, `--assignee`, `--status` and `--max-iterations` work with `--parallel`, and `--root` is optional when `--filter` is set. Escalated and locked cards are skipped. The loop stops at the Stop Predicate, the iteration cap or Ctrl-C (exit 130/143), printing one line per iteration and writing an audit trail (#522, #526).
- Autonomy flags `--until`, `--prepare` and `--merge` set how far a card goes and which gates allow refinement or merge. The policy is printed once with its sources before any card is touched. Exit codes tell `escalated` (1) apart from `target-ready` (0) (#521, #523, #525, #529).
- `--profile`/`--workflow-config` pick the engine, model, effort and context per stage (#488, #517). Cycle Hooks run around each stage (#489, #519).
- `--card --card-tags` routes tagged cards to the workflow named in `## Workflows`. Untagged cards are left alone (#217, #474).
- `--autonomous` also passes `$approval=auto` to composed skills that declare an approval round (#464, #465).
- `--engine pi` without pi installed points to `/pair-capability-setup-harness` (#503, #512).
