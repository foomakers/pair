# Task: 69-04 — Backup, atomic write, and rollback system

Parent Story: #69 — CLI Link Update & Validation Command

What
- Implement safe file modification flow: create backups, write changes atomically, support rollback on critical errors
- Backup path format: `./.pair/backups/links-<timestamp>/...`

Where
- `packages/content-ops/src/file-updates.ts`

How
- Implement write-with-backup API: snapshot original file -> write temp -> move into place
- On failure, restore from backups
- Respect `--dry-run` option to skip writes and backups

Standards & References
- Follow file-safety patterns in `.pair/knowledge/guidelines/infrastructure/` and project conventions

Definition of Done
- Backups created for every modified file
- Rollback restores original files on simulated critical failures (covered by tests)

Estimate: 1.5 days
Dependencies: 69-02, 69-03

---
