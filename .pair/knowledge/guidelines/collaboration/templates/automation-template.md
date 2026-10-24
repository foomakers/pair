# Automation Policy

Project delta for unattended runs (`pair run`, `/pair-loop`, `/pair-workflow-cycle`). The schema and every key are documented in [automation-policy.md](../automation/automation-policy.md). Copy this file to `.pair/adoption/tech/automation.md`.

The table under `## Autonomy` documents the presets — a table row is not a declaration. An explicit key under `preset:` (e.g. `merge: hold-always`) overrides the preset's value, with a warning naming both.

## Autonomy

preset: escalate-red

| preset         | filter             | prepare       | merge                      | until    |
| -------------- | ------------------ | ------------- | -------------------------- | -------- |
| `full`         | `*`                | `hold-never`  | `hold-never`               | `merged` |
| `escalate-red` | `*`                | `hold-never`  | `hold-when; has: risk:red` | `merged` |
| `supervised`   | `*`                | `hold-always` | `hold-always`              | `merged` |
| `custom`       | explicit keys only |               |                            |          |

## Working Cleanup

cleanup: after 7d
