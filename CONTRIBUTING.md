# Contributing to Pair

Thank you for your interest in contributing to Pair!

> **Full contributing docs**: [pair.foomakers.com/docs/contributing](https://pair.foomakers.com/docs/contributing) — development setup, architecture, writing skills, writing guidelines, and release process.

## Code Style

- All code must follow the ESLint and Prettier rules defined in the monorepo.
- Run `pnpm lint` to check for lint errors before committing.
- Run `pnpm prettier:check` to ensure code formatting is correct.
- Use the provided configs in `tools/eslint-config` and `tools/prettier-config` for reference.

## Git Hooks (Husky)

- Husky is configured to run lint and format checks on pre-commit, and tests on pre-push.
- Do not bypass hooks unless absolutely necessary (`git commit --no-verify`).
- If hooks are not running, see [DEVELOPMENT.md](DEVELOPMENT.md#husky-git-hooks) for troubleshooting.
- Make sure to run `pnpm install` after cloning to enable hooks.

## Workflow

- All changes must pass `pnpm quality-gate` locally and in CI/CD.
- Follow the guidelines in `.pair/knowledge/guidelines/` for architecture and code design.
- For process and collaboration, see `.pair/adoption/tech/way-of-working.md`.

## Optional: rtk (review stage only)

`./scripts/dev/install-rtk.sh` installs a pinned, checksum-verified [rtk](https://github.com/rtk-ai/rtk) into `.tools/bin` (gitignored). It is **not** installed by `pnpm install`. When installed, a `SessionStart` hook (`scripts/dev/rtk-session-path.mjs`) prepends `.tools/bin` to PATH via `$CLAUDE_ENV_FILE` (created if missing), and a `PreToolUse` Bash hook (`scripts/dev/rtk-review-hook.mjs`) runs `rtk hook claude` only for the `pair-reviewer` subagent (hook input `agent_type`), forwarding only `updatedInput` (command text is never rewritten, `permissionDecision` is dropped so the normal permission flow applies); absent rtk is a no-op. `pair-cli` run stages carry no `agent_type` and are not covered. Review A/B (3 runs/arm, Opus, 2 seeded defects): without rtk S1 2/3, S2 3/3, $0.93; with rtk S1 3/3, S2 3/3, $0.82 (−12%, context −16%). On implementation it saved nothing and truncates large diffs. See `.pair/adoption/decision-log/2026-10-13-ponytail-trial-rtk-review-only.md`.

## ponytail (#433)

The project settings enable the [ponytail](https://ponytail.dev) plugin (pinned `v5.2.0`) for Claude Code: a "least code that works" ruleset injected at session start and into subagents. Adopted after the #433 A/B (−16% production lines, −9% cost, same correctness); removed if a later measurement shows lower correctness or no reduction. Switch it off per session with `/ponytail off`.

## Operational Activities

- For step-by-step instructions on common tasks, see `.pair/knowledge/how-to/`.
- Key guides:
  - **Create tasks:** `.pair/knowledge/how-to/09-how-to-create-tasks.md`
  - **Implement a task:** `.pair/knowledge/how-to/10-how-to-implement-a-task.md`
  - **Code review:** `.pair/knowledge/how-to/11-how-to-code-review.md`
- For testing strategy, see `.pair/knowledge/guidelines/testing/`.
- Always follow the documented process for operational activities to ensure consistency and quality.

## Questions & Support

- For any issues, open a [GitHub issue](https://github.com/foomakers/pair/issues) or ask in [Discussions](https://github.com/foomakers/pair/discussions).
- Refer to the [documentation site](https://pair.foomakers.com/docs) for detailed guides.
