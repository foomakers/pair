# Task: 69-01 — Core CLI command implementation (entry point)

Parent Story: #69 — CLI Link Update & Validation Command

What
- Implement the `pair update-link` CLI command handler and options parsing.
- Support flags: `--relative` (default), `--absolute`, `--dry-run`, `--verbose`.

Where
- `apps/pair-cli/src/commands/update-link.ts` (or appropriate CLI command module)
- Bounded Context: pair CLI package

How
- Add a new command module that wires into existing `pair` CLI dispatcher
- Command should detect KB root using existing utilities and call the link-management workflow engine (implemented by other tasks)
- Respect `--dry-run` to avoid file writes

Standards & References
- Follow CLI patterns used in `apps/pair-cli/src/commands/*`
- Use coding standards in `.pair/knowledge/guidelines/code-design/` and CLI packaging conventions

Definition of Done
- Command accepts and validates flags
- Invokes link engine with proper options
- Exposes helpful `--help` text
- Unit tests cover flag parsing and dry-run behavior

Estimate: 1.5 days
Dependencies: 69-02, 69-03, 69-04, 69-05

---
