# Decision: autonomy preset `full`, blocking floor `Minor`, tiered Claude/Codex workflow profiles

## Date

2026-11-15

## Status

Active

## Category

Process Decision

## Context

The maintainer explicitly authorized (2026-11-15) running pair's own delivery fully unattended, up to merge, and naming one workflow profile per engine and cost tier. Until now `automation.md` declared the legacy `## Eligibility risk:green` + `## Auto-Advance (none)` (translated to `filter: risk:green`, `merge: hold-always`), and the operative rule was "risk:red merges only with an explicit human approval". Profiles were `claude-cheap` (pilot, stage-mapped), `codex-cheap` (default) and `codex-max`.

## Decision

- `## Autonomy` → `preset: full` (filter `*`, prepare `hold-never`, merge `hold-never`, until `merged`), with no explicit key contradicting it. The legacy `## Eligibility` and `## Auto-Advance` sections are removed: an explicit key (translated legacy included) wins over the preset, and a differing translation coexisting with `## Autonomy` HALTs.
- **Supersedes** the operative rule "risk:red merge only with an explicit human approval": `merge: hold-never` waives `pair-explicit-approval` on `risk:red` (and untagged) PRs. Still mandatory on every merge: `pair-review` = success, remote head = `reviewedHead`, CI green, tier gate green. A rejected approval still halts.
- `## Blocking Severities` → `Minor` (equal to the KB default; declared on purpose so the floor is explicit and survives a KB default change).
- Six per-stage profiles in `.pair/adoption/tech/workflow-profiles/` (`defaults` + `modelClasses` + `stages`, context `fresh` unless noted). Resolved by `workflow-profile.mjs` (model / effort per stage):

  | profile | contract | prepare | validate | implement | green | verify | merge |
  | --- | --- | --- | --- | --- | --- | --- | --- |
  | `claude-cheap` | haiku / med | sonnet / med, reuse | sonnet / med | sonnet / med | haiku / med, reuse | sonnet / high | haiku / med |
  | `claude-medium` | haiku / med | sonnet / med | sonnet / med | sonnet / med | sonnet / med | opus / high | haiku / med |
  | `claude-high` | opus / high | opus / high | opus / high | opus / high | opus / high | opus / high | opus / high |
  | `codex-cheap` | sol / low | sol / med | sol / low | sol / med | sol / low | sol / high | sol / low |
  | `codex-medium` | astra / med | sol / med | astra / med | sol / med | sol / med | astra / high | sol / low |
  | `codex-high` | astra / high | astra / high | astra / high | sol / high | sol / high | astra / high | astra / high |

  Claude classes: cheap `claude-haiku-5-5`, balanced `claude-sonnet-5-5`, frontier `claude-opus-5-5`. Codex: `gpt-6-sol`, `gpt-6-astra`. `claude-cheap` is reconciled in place (verify drops from frontier to balanced, prepare/validate from frontier to balanced). `codex-cheap` is unchanged (engine/model inherited from `pair.config.json`: codex / `gpt-6-sol`). `codex-high` replaces `codex-max` (same content, tier name); `codex-max.json` is deleted: only these six profiles exist.
- `workflowProfiles.default` → `codex-medium` (global engine stays `codex`). A per-engine default (claude → `claude-medium`) is wanted but not expressible: `workflowProfiles.default` is a single string and any other key under `workflowProfiles` is `profile-invalid` (`workflow-profile.mjs` / `apps/pair-cli/src/commands/run/workflow-profile.ts`). Claude runs pass `--profile claude-medium`.

## Alternatives Considered

- **`preset: full` keeping `## Eligibility risk:green`**: rejected — the legacy key would override the preset's `filter: *`.
- **`preset: escalate-red`**: rejected by the maintainer; full autonomy chosen, guarded by review, head binding, CI and tier gate.
- **Flat profiles (one model/effort per tier)**: rejected — judgment stages (verify) need a stronger model than relay stages (contract, merge).
- **Per-engine default**: wanted, not supported by the loader (see Decision).

## Consequences

- Unattended runs pick every card in scope (untagged included), prepare Draft cards autonomously and merge review-approved PRs, `risk:red` included, with no human approval.
- `## Stop Predicate tag:risk:red ⇒ Done` is unchanged.
- The pilot `claude-cheap` stage mapping no longer exists in this repo; the KB guideline's example still documents it. `claude-cheap-profile.test.ts` (reads this repo's `claude-cheap.json`) now pins verify = `claude-sonnet-5-5`.

## Adoption Impact

- `.pair/adoption/tech/automation.md`: `## Autonomy` (`preset: full`) and `## Blocking Severities` (`Minor`) added; `## Eligibility`, `## Auto-Advance` removed.
- `.pair/adoption/tech/workflow-profiles/*.json`: `claude-cheap` reconciled; `claude-medium`, `claude-high`, `codex-medium`, `codex-high` added; `codex-cheap` unchanged; `codex-max` removed (replaced by `codex-high`).
- `pair.config.json`: `workflowProfiles.default` = `codex-medium`.
- Supersedes `2026-11-07-codex-workflow-profile.md` (default profile and `codex-max`); `--profile codex-max` now fails `profile-unresolved`, use `--profile codex-high`.
