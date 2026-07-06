---
"@pair/pair-cli": minor
"@pair/content-ops": minor
"@pair/knowledge-hub": minor
---

`.pair/working/` (checkpoints, reports) is now hard-excluded from every KB asset registry (D14): `pair install`/`pair update` never create, modify, or delete anything under it, and it is never scaffolded. Override the path with a top-level `working_path` in `pair.config.json`; `pair validate-config` now errors when a registry overlaps with the (default or overridden) working path in either direction.
