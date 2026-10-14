---
'@pair/pair-cli': minor
---

`pair-cli run`: run pair's delivery from the console on any engine:

- `pair-cli run` executes a skill headless inside `pi`, `opencode` or `claude -p`, re-invoking it until the stop condition is met. The engine is chosen by `--engine`, then `pair.config.json`, then the default, and the resolved command is printed before anything runs (#459).
- `--card <id>` drives one card through the whole delivery cycle (`--pr`, `--rounds`, `--run-id`) (#504).
- `--root <id> --parallel <n>` fans out over a subtree. Parallelism is bounded by dependencies, `## Max Parallelism` and the flag (#511).
- Portable loop: `--watch`/`--interval`, a fresh selection every iteration, `--filter`/`--assignee`/`--status`/`--max-iterations`, and a clean Ctrl-C (#526).
- Autonomy flags `--until`, `--prepare`, `--merge` select how far a card goes and which gates allow refinement or merge. Exit codes distinguish `escalated` from `target-ready` (#525, #529).
- `--profile`/`--workflow-config` pick the engine, model, effort and context per stage (#517).
- `--card --card-tags` routes tagged cards to the workflow named in `## Workflows`. Untagged cards are left alone (#474).
- `--autonomous` also passes `$approval=auto` to composed skills that declare an approval round (#465).
- `--engine pi` without pi installed points to `/pair-capability-setup-harness` (#512).
