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
The 189 remaining entries are `migration-candidate` until their operation,
consumer, test category, and any OS-guarantee or standalone-script exception
are reviewed. The reviewed `os-guarantee` entries exercise real symlink,
atomic rename, git-clone, or binary disk behavior in temporary directories. The
`boundary-adapter` entry is the real service implementation itself; six
`standalone-script` entries ship without a workspace package dependency.
**T-1 is incomplete.**

The 189 candidate rows now record `sourceSymbols` from their import,
`require`, or literal dynamic-import declarations. These are the source's
imported names, not a decision that every use of the name performs IO.
The operation, consumer, disposition, and proving test category still need
per-path review.

The content-ops pass classified six more paths: three `Dirent`/`Stats` type
contracts, one temporary-directory byte-mode integration test, and two
production migration targets. `integrity-validator.ts` has a direct stream
fallback consumed by the CLI checksum manager; `lazy-loader.ts` exposes the
native module to its test. Their operation, consumer, decision and proving
test category are recorded per path in the JSON ledger. The three type
imports should become explicit `import type` declarations in T-3.

The published `word-limits.mjs` helpers (publish-pr, write-issue, review),
`next/control-state.mjs`, and `mirror-realign.cjs` are five more exact-path
`standalone-script` exceptions. Their skill or asset consumers invoke them with
Node in an installed project; no workspace package is available there.

The scan recognizes static imports, re-exports, TypeScript import-equals,
`require('...')`, and literal `import('...')` for `fs`, `node:fs`,
`fs/promises`, and `node:fs/promises`. It scans tracked JS/TS extensions under
`apps/`, `packages/`, and `scripts/`, excluding generated and third-party
directories. Nonliteral dynamic imports are outside this static scan.
Identical source hashes identify copied files; the first tracked path is the
provisional producer and needs mirror provenance review before T-1 completes.

Baseline: `pnpm --filter @pair/content-ops test` passed: 51 files, 677 tests,
1.86 s Vitest duration. On this branch, `pnpm --filter @pair/dev-tools test`
passed 47 files and 893 tests (98.43 s; one pre-existing skip);
`pnpm --filter @pair/knowledge-hub test` passed 82 files and 6,853 tests
(6.19 s Vitest duration; two pre-existing skips), and both dataset and root
link checks passed. `pnpm --filter @pair/pair-cli test` passed 278 files and
4,244 tests (404.95 s). `pnpm --filter @pair/website test` passed its Vitest
and component suites (26 Chromium component tests). A repository-wide
`pnpm test` baseline was interrupted after over two minutes without a final
result. Its status is unknown.
