# Working Area Convention

## Overview

`.pair/working/` is the **operational area**: where AI capabilities persist state produced *during* execution — checkpoints and reports. It is operational data, not knowledge, so it stays outside every KB asset registry by design (D14). `pair install` and `pair update` never create, modify, or delete anything under it.

This is distinct from the other two `.pair/` areas:

| Area | Contents | Owner | Touched by `pair update`? |
| --- | --- | --- | --- |
| `.pair/knowledge/` | Upstream guidelines and how-to | pair KB | Yes (mirror) |
| `.pair/adoption/` | Project decisions | Project | Add-only (new files) |
| `.pair/working/` | Checkpoints, reports | Skills, at runtime | Never |

## Structure

```text
.pair/working/
├── checkpoints/           # Resumable state for multi-task flows (e.g. /implement)
└── reports/
    └── <category>/        # Generated reports, grouped by category (e.g. quality, monitoring)
```

Both subdirectories are created **on demand** by the skill that first needs them — a checkpoint capability creates `checkpoints/` the first time it writes state, a reporting capability creates `reports/<category>/` the first time it writes a report. `pair install` does not scaffold this structure.

## Exclusion Rule (D14)

The working area is excluded from asset registries at two levels:

1. **By convention**: no registry's `source` or `target` should ever point at the working area or an ancestor of it.
2. **By hard rule in `pair-cli`**: every registry copy/mirror operation excludes the resolved working-area path unconditionally, regardless of registry configuration. A registry accidentally configured to mirror an ancestor of the working area (e.g. the whole `.pair/` root) cannot reach inside it — the nested working subtree is skipped during traversal.

The hard rule exists as defense-in-depth on top of validation (see below): even a config that somehow bypasses `pair validate-config` cannot cause `pair install`/`pair update` to touch the working area.

## Overriding the Path

The default path is `.pair/working`. A project can override it by declaring `working_path` at the top level of `pair.config.json` (sibling to `asset_registries`, not inside it):

```json
{
  "working_path": ".pair/scratch",
  "asset_registries": { "...": "..." }
}
```

When overridden:

- The override — not the default — is what gets excluded from registry operations.
- Skills reading or writing checkpoints/reports must resolve the same override (read `working_path` from `pair.config.json`; fall back to `.pair/working` when absent) so the two sides never disagree on where the working area lives.
- The override is still validated against every registry (see below) — an override is not a way to opt out of the exclusion, only to relocate it.

## Validation

`pair validate-config` fails the config with a clear error in both of these cases:

- **A registry overlaps the working area**: a registry's `source` or `target` equals, contains, or is contained by the (default or overridden) working path.
- **An override lands inside a registry-managed directory**: the same overlap check, triggered from the override side.

Both cases are the same rule checked from either direction — a registry accidentally covering the working area, and a working-area override that lands inside a registry.

## Convention for External KBs

This rule is not specific to the `foomakers/pair` KB — any KB dataset consumed by `pair-cli` inherits the same guarantee, because the exclusion is enforced by `pair-cli` itself (`buildCopyOptions`, `doCopyAndUpdateLinks`, `validateAllRegistries`), not by anything the dataset declares. A custom or organization-specific KB does not need to do anything special to get this protection — it only needs to avoid declaring a registry whose `source`/`target` overlaps the working area, which `pair validate-config` will catch anyway.

## Integration with Skills

| Skill / Area | Interaction |
| --- | --- |
| Checkpoint capability (e.g. `pair-capability-checkpoint`) | Writes/reads `.pair/working/checkpoints/` |
| Reporting capabilities (e.g. quality, monitoring) | Write `.pair/working/reports/<category>/` |
| `pair install` | Never scaffolds or touches the working area |
| `pair update` | Never modifies or deletes anything under the working area |
| `pair validate-config` | Errors on any registry/working-area overlap |
