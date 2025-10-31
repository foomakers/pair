# Task: 69-09 — Performance tuning & benchmarks

Parent Story: #69 — CLI Link Update & Validation Command

What
- Ensure performance target: process 1000+ links within 30 seconds in typical env
- Add benchmark harness and optimize parser and IO operations

Where
- `packages/content-ops/benchmarks/` and CI workflow `/.github/workflows/benchmarks.yml`

How
- Implement benchmark script that runs on representative fixtures
- Optimize by batching IO, using async FS, and avoiding redundant path operations

Definition of Done
- Benchmarks demonstrate target on a representative machine (document hardware used)
- CI job added to run benchmarks on-demand

Estimate: 1 day
Dependencies: 69-02, 69-04

---
