# Decision: named Claude and Codex workflow profiles

## Date

2026-11-07

## Status

Active

## Category

Tooling Preference

## Context

The maintainer requested explicit economical and recovery profile names after
trialling Sol and Astra during delivery recovery.

## Decision

- Rename `cheap-green` to `claude-cheap`; retain its pilot Claude stage settings.
- Rename `codex` to `codex-cheap` and keep its settings and project default.
  Engine and model remain inherited (`codex` / `gpt-6-sol` in `pair.config.json`):
  low effort by default, medium for prepare/implement, high for verify.
- Add `codex-max`, reproducing the recovery configuration: Codex engine, Astra
  high by default; Sol high for implement/green. Its name selects a profile,
  not the reasoning-effort value `max`.
- Explicit `--workflow-config` takes precedence over `--profile`, which takes
  precedence over the project default. These profiles govern delivery-cycle
  stages; standalone preparation skills do not inherit them.

## Alternatives Considered

- Keep generic names: rejected because the engine and intended use were unclear.
- Make recovery the default: rejected; retain the economical default.

## Consequences

Use `--profile claude-cheap`, `--profile codex-cheap` or `--profile codex-max`.
Existing commands naming `cheap-green` or `codex` must use the new names.

## Adoption Impact

`pair.config.json` selects `codex-cheap`; JSON files in
`.pair/adoption/tech/workflow-profiles/` define the three profiles.
