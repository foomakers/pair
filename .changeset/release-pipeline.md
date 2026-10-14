---
'@pair/pair-cli': minor
---

Release pipeline:

- Every PR carries a changeset. `pnpm release <pre|rc|final> [--version X.Y.Z] [--dry-run]` plans a release on the pre, rc or final channel, and `version.yml`/`release.yml` run only on dispatch. Obsolete prereleases are cleaned up after a successful publish (#541).
- Internal: gate scripts moved into tested modules (`@pair/dev-tools`, `@pair/release-tools`). `format:check` covers the whole repo in CI and the pre-push hook. Gates for `llms.txt` drift, mirror equality and skill-local scripts. Smoke tests run pre-merge, including cross-platform and remote-source scenarios. Audit tech-debt cleared (#330, #333, #334, #311, #412, #454, #477, #475, #377, #406, #531, #424, #500, #505).
