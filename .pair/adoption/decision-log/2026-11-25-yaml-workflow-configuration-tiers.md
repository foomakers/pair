# Decision: select YAML workflow configurations by card label

## Date

2026-11-25

## Status

Active

## Category

Convention Adoption

## Context

Story #707 brings risk-based configuration selection to YAML workflows. The legacy workflow profile resolver exposes `byTier` stage settings. YAML workflows already use named configurations with step aliases. See [ADR-034](../tech/adr/adr-034-workflow-configuration-files.md).

## Decision

Put a label-to-configuration map in `pair.config.json` under `workflows.<workflow>.tiers`. Use the default tier map when there is no named workflow entry. A tier can name one configuration or map engines to configuration names. After an explicit `--config`, the first matching tier in file order takes precedence over the workflow configuration and the default. The CLI records the card labels used at the start and prints the selection source.

## Alternatives Considered

- **Put tiers in workflow YAML**. This would couple workflow steps to the project's model and effort choices.
- **Map tiers independently for each alias**. This would recreate legacy per-stage selection alongside the existing configuration precedence.

## Consequences

The same workflow can run at different costs using the six shipped configurations. A card without a matching label uses the existing default. A failed label lookup warns and uses that fallback.

## Adoption Impact

- `pair.config.json` and the install defaults map `risk:red`, `risk:yellow` and `risk:green` for Claude and Codex.
- `tech/automation.md` records the project's order and the transition from legacy `byTier` for YAML workflows.
