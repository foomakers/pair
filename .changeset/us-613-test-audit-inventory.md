---
'@pair/dev-tools': minor
'@pair/pair-cli': patch
---

Test audit and gates (US-613): `pnpm --filter @pair/dev-tools test-audit` regenerates `test-audit/` (baseline from 3 seeded runs, U1–U8 classification with `not measured` for unsupported signals, reconciled per-module/level report, removal plan); gates G1–G8 with one config (`docs/testing/test-policy.config.json`), staged rollout (report-only default) and bypass labels. KB: behavior-first test guideline, Testing rules in AGENTS.md, Test plan section in the user-story template. Seven no-assertion tests gained explicit assertions; three order-dependent tests quarantined.
