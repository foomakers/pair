---
'@pair/pair-cli': patch
---

Improve CLI reliability, tests and configuration utilities

Summary of changes:

- Add and extend unit and end-to-end tests covering install/update flows and
  configuration parsing (`apps/pair-cli/src/`).
- Centralize CLI argument validation and add deterministic startup checks for
  the `knowledge-hub` dataset in `src/cli.ts`.
- Refactor `install` and `update` command handlers to improve testability and
  support custom install targets used in tests.
- Add test helpers (temporary config wrappers, in-memory FS helpers) and
  update packaging/docs metadata where needed.

Reason: backward-compatible refactor and test coverage improvements; no public
API breaking changes.
