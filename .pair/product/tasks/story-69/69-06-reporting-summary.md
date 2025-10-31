# Task: 69-06 — Summary generation and reporting

Parent Story: #69 — CLI Link Update & Validation Command

What
- Implement comprehensive summary output: total links processed, fixed counts, remaining issues, files modified, backup path
- Provide machine-readable output (JSON) when `--verbose` or `--output json` is requested

Where
- `packages/content-ops/src/reporting.ts`
- CLI output formatting in `apps/pair-cli/src/output.ts`

How
- Collect stats during the workflow and generate human-friendly and JSON reports
- Include per-file details for remaining issues (file, line, error)

Definition of Done
- Summary exactly matches story spec and sample format
- JSON output validated by integration tests

Estimate: 1 day
Dependencies: 69-02, 69-04, 69-05

---
