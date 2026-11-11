---
'@pair/dev-tools': minor
---

Test-audit measurement for the speed card (US-625): `test-audit:baseline` now also runs the `node:test` suites (`.claude/workflows`, `scripts`, `qa`) and the Playwright targets (brand-ct, website-ct, website-e2e) and reports per-file and per-suite-type durations (`baseline.ts summary`); `test-audit:prepush` times each step of the root `quality-gate` (the pre-push hook). Fixes the raw store not being created on a root where no vitest package ran first.
