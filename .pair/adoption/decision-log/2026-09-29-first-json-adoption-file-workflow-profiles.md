# Decision: workflow profiles are the first JSON under `.pair/adoption/`

## Date

2026-09-29

## Status

Active

## Category

Tooling Preference

## Context

Story #488 declares which engine, model, effort and context each delivery-cycle stage uses. The shape is structured (per-stage overrides over defaults, a model-class map) and is read by two programs (`pair-workflow-cycle`'s scripts and `pair-cli run --card`). Every file under `.pair/adoption/` is markdown today.

## Decision

- **Profiles are JSON**, one or more named files under `.pair/adoption/tech/workflow-profiles/<name>.json`, reached from `pair.config.json` (`workflowProfiles.default | files | inline`). Indexed by each file's own `name`, never its filename. Adoption stays delta-only (D21): no file, no block, no flag ⇒ the KB default, and the cycle runs as before.
- **The KB ships the schema and an example, never a profile for the project** (`.pair/knowledge/guidelines/collaboration/automation/workflow-profiles.md`).
- **Schema: closed, fail-closed.** Unknown key, stage or field is `profile-invalid`; an unknown or unreadable name is `profile-unresolved`, never a fallback.
- **One resolver**, `workflow-profile.mjs` beside `pair-workflow-cycle`'s scripts; `pair-cli` spawns it. `context` is validated by asking `cycle-state.mjs` (`contextReuseAdmissibleInto`), never by restating its table.
- **Model classes**: `cheap | balanced | frontier` per #450; a class resolves through the profile's own `modelClasses` map; `by-tier` reads `## Model Policy`. Concrete ids live in the profile, never in the KB.
- **Audit, not input**: name + hash stamped into every handoff from the run's `.workflow-profile.json`; never an effective input.

## Alternatives Considered

- **Markdown section in `tech/automation.md`** (like `## Model Policy`). Rejected: nested per-stage overrides and a class map are awkward in the line grammar every reader of that file re-implements; a JSON file validates with one parser.
- **YAML.** Rejected: a new dependency for a dependency-free script.
- **Resolver in TypeScript, imported by the skill.** Rejected: the skill's scripts ship without a build step; a TS resolver would force a second implementation there.

## Consequences

- Positive: one schema, one validator, two consumers that cannot drift; changing a profile mid-cycle invalidates nothing.
- Negative: the first JSON under `adoption/` is a precedent; the reader for `pair.config.json` lives in the script, not in `pair-cli validate-config` (not yet surfaced there).
- Known limits, stated rather than papered over: no engine's effort flag has been verified, so `effort` is recorded and printed but sent to no engine (`EngineDefinition.effortFlag` exists, unset); `pair-cli` spawns a new process per stage, so `context: reuse` is reported and run fresh there.
