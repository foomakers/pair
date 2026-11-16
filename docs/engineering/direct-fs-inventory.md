# Direct filesystem inventory for US-621

Base: `a453ad7f5996d73d87b8bd61c78b16dd43c26e2b` (`origin/main` at scan time).

The path-level AST scan is in [direct-fs-inventory.json](direct-fs-inventory.json):
1,051 tracked JS/TS files scanned; 438 files contain a literal direct filesystem
dependency; 403 distinct contents. The prior 419-file estimate is stale on this
base. Of the 438 files, 122 are in `apps/pair-cli/src/commands/run/` and 101
are in the two knowledge-hub workflow zones. Those 223 paths are individually
marked `in-flight-churn` with the Scope Limit decision and root-guard test
category. Ten other imports are type-only `Dirent`/`Stats` contracts; these
have exact-path `type-contract` exceptions because they perform no runtime IO.
The 194 remaining entries are `migration-candidate` until their operation,
consumer, test category, and any OS-guarantee or standalone-script exception
are reviewed. The reviewed `os-guarantee` entries exercise real symlink,
atomic rename, git-clone, or binary disk behavior in temporary directories. The
`boundary-adapter` entry is the real service implementation itself; the
`standalone-script` entry ships without a workspace package dependency.
**T-1 is incomplete.**

The content-ops pass classified six more paths: three `Dirent`/`Stats` type
contracts, one temporary-directory byte-mode integration test, and two
production migration targets. `integrity-validator.ts` has a direct stream
fallback consumed by the CLI checksum manager; `lazy-loader.ts` exposes the
native module to its test. Their operation, consumer, decision and proving
test category are recorded per path in the JSON ledger. The three type
imports should become explicit `import type` declarations in T-3.

The scan recognizes static imports, re-exports, TypeScript import-equals,
`require('...')`, and literal `import('...')` for `fs`, `node:fs`,
`fs/promises`, and `node:fs/promises`. It scans tracked JS/TS extensions under
`apps/`, `packages/`, and `scripts/`, excluding generated and third-party
directories. Nonliteral dynamic imports are outside this static scan.
Identical source hashes identify copied files; the first tracked path is the
provisional producer and needs mirror provenance review before T-1 completes.

Baseline: `pnpm --filter @pair/content-ops test` passed: 51 files, 677 tests,
1.86 s Vitest duration. A repository-wide `pnpm test` baseline was interrupted
after over two minutes without a final result. Its status is unknown.
