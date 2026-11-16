# ADR-030: Workflow profile over layered run defaults

## Status

Accepted

## Date

2026-11-15

## Context

Story #617 needs one profile to set each workflow stage across CLI and in-session routes. Existing `engine.*` keys must keep working. A runner may need machine-specific command, argv, model and idle timeout without choosing the engine for every stage. `risk:red` validation and all verification require fresh context.

## Options Considered

### Option 1: Per-agent settings as the root

- **Description**: Each agent owns its engine and stage settings.
- **Pros**: A compact machine-local declaration.
- **Cons**: Stage policy and engine choice would be scattered across agents.

### Option 2: Profile as the root, with run fallbacks

- **Description**: Resolve each stage from flags, profile stage, profile defaults, `run.agents.<engine>`, `run.defaults`, legacy `engine.*`, then KB defaults.
- **Pros**: Stage policy stays in one resolver; legacy config remains a fallback.
- **Cons**: The resolver validates unused agent entries and reports more source detail.

## Decision

Choose option 2. `run.agents` may declare `command`, literal `args`, `model` and `idleTimeout`; it cannot choose engine or effort. `run.defaults` may declare `engine`, `model` and `idleTimeout`. An explicit stage engine wins over the run default; the CLI engine flag wins unless it contradicts an explicitly selected profile engine. The shared `workflow-profile.mjs` owns stage precedence and provenance. In-session hosts report incompatible engine or model settings before dispatch.

Context sharing uses a `shared-with` source and a risk condition. `verify` is always fresh. `validate` is fresh for `risk:red`; below red, a declared sharing transition may run. `pair run` continues to start each stage in a fresh process.

`workflowProfiles.default` accepts a legacy profile-name string or an engine-to-profile-name map. Explicit selectors win. Otherwise the actual execution engine selects its mapped entry: CLI engine selection or the in-session host, then configured engine fallbacks. A missing entry uses the KB default; it never selects another engine's entry. Every map key and value is validated before selection. The selected profile is retained in run snapshots and external remedies.

This project uses `codex: codex-medium` and `claude: claude-medium`, with no global profile or engine default. Existing `engine.*` and string defaults remain supported for other configurations; no automatic migration rewrites them.

The official dataset ships its six Claude/Codex profiles through the existing add-only adoption registry. An add-only project-config registry seeds the per-engine medium map on fresh installs. Existing project configuration and customized profiles remain adopter-owned on install and update; missing shipped assets are added. The seed is an install asset, not a runtime default in the CLI's own configuration.

## Consequences

### Benefits

- One stage profile drives cycle, skills and batches.
- Existing `engine.*` configurations remain valid.
- Literal runner argv avoids shell interpretation.

### Trade-offs and Limitations

- In-session batches can dispatch only models and engines supported by their host.
- The resolver must validate every `run.agents` entry, even when a run does not select it.

## Adoption Impact

- `adoption/tech/architecture.md` names the profile-root precedence and context floor.
- `pair.config.json` gains optional `run.defaults` and `run.agents` fields; no migration or rewrite is required.
- The project `pair.config.json` selects medium profiles per execution engine through `workflowProfiles.default` and removes its legacy global engine settings.
