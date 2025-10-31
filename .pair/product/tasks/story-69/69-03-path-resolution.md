# Task: 69-03 — Path resolution, root detection, and conversion

Parent Story: #69 — CLI Link Update & Validation Command

What
- Implement KB root detection logic (git root, package.json, .pair markers)
- Provide path resolution utilities: normalize, resolve absolute/relative conversion, adjust for moved projects

Where
- `packages/content-ops/src/path-resolution.ts`
- Bounded Context: content-ops / pair-cli integration

How
- Use multi-strategy root detection: git rev-parse, package.json presence, `.pair/` folder
- Implement conversion helpers: toRelative(base, target) and toAbsolute(base, target)
- Ensure idempotent and deterministic conversions

Standards & References
- Reuse git detection patterns from existing CLI utilities

Definition of Done
- Root detection works in typical project setups and falls back to manual override
- Path conversion utilities tested across common path shapes

Estimate: 1.5 days
Dependencies: 69-02

---
