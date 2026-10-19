---
'@pair/pair-cli': patch
---

Fixes from v0.5.0-pre.2 validation (#552):

- `update --persist-backup` and auto-rollback now cover copy targets such as `CLAUDE.md`, not only `AGENTS.md`.
- KB 404 message keeps the prerelease (`KB v0.5.0-pre.1 not found (404)`).
- Release CLI prunes tags deleted on origin before planning.
