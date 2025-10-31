# Task: 69-05 — Integrate with existing install/update KB resolution

Parent Story: #69 — CLI Link Update & Validation Command

What
- Wire the link workflow to reuse KB detection logic from `install` and `update` commands
- Ensure adoption-specific content paths are also processed

Where
- `apps/pair-cli/src/commands/install.ts` (read for reference)
- Integration code in `apps/pair-cli/src/commands/update-link.ts` calling content-ops resolution helpers

How
- Extract KB resolution into shared utility if needed
- Ensure the update-link command honors the same detection rules and supports manual override

Definition of Done
- Update-link uses same KB detection rules as install/update
- Tests cover adoption-specific content directories

Estimate: 1 day
Dependencies: 69-03

---
