# Direct filesystem inventory for US-621

Base: `a453ad7f5996d73d87b8bd61c78b16dd43c26e2b` (`origin/main` at scan time).

The path-level AST scan is in [direct-fs-inventory.json](direct-fs-inventory.json):
1,051 tracked JS/TS files scanned; 438 files contain a literal direct filesystem
dependency; 403 distinct contents. The prior 419-file estimate is stale on this
base. Of the 438 files, 122 are in `apps/pair-cli/src/commands/run/` and 101
are in the two knowledge-hub workflow zones. Those 223 paths are individually
marked `in-flight-churn` with the Scope Limit decision and root-guard test
category. Eleven other imports are type-only `Dirent`/`Stats` contracts; these
have exact-path `type-contract` exceptions because they perform no runtime IO.
The 144 remaining entries are `migration-candidate` until their operation,
consumer, test category, and any OS-guarantee or standalone-script exception
are reviewed. The reviewed `os-guarantee` entries exercise real symlink,
atomic rename, git-clone, subprocess, installed artifact, or binary disk
behavior in temporary directories. The
`boundary-adapter` entry is the real service implementation itself; six
`standalone-script` entries ship without a workspace package dependency.
**T-1 is incomplete.**

Five CLI paths have now been reviewed: the build helper, CLI startup manifest
read, version export, and git-clone cleanup are migration targets. The shared
CLI entry test helper remains a real-process exception because it selects the
compiled artifact for subprocess tests. Its callers and the four migration
consumers are recorded in the ledger.

Eight more CLI paths are classified. The dispatcher executable-stub test and
tokens pipe test retain real process and file-descriptor integration; the
link-rewriter import supplies only a `Dirent` type. The git-clone cleanup mock,
command manifest and three config/risk-matrix fixture reads are migration
targets. Their consumers, decisions and proving categories are recorded per
path in the JSON ledger.

Ten further CLI tests are classified. The workflow-preset install, package
round-trip, token CLI, and board-authorization install tests retain narrow
real subprocess or distributed-artifact proof. The KB handler tests retain
real ZIP interoperability cases while their ordinary setup is a migration
target. The CLI end-to-end test, ZIP creator unit cases, checked-in release
script read, and registry config read are migration targets; the CLI test's
run-zone lock assertions remain real-OS proof under the Scope Limit. The
ledger records each path's consumer and decision.

The candidate rows record `sourceSymbols` from their import,
`require`, or literal dynamic-import declarations. These are the source's
imported names, not a decision that every use of the name performs IO.
The operation, consumer, disposition, and proving test category still need
per-path review.

For the candidates, `observedOperations` records direct calls found by
following static `fs` imports and `require` bindings in each file. It is
populated for 185 paths by the static pass. Four missing cases were reviewed:
`git-clone.test.ts` mocks and asserts `rmSync`; `layout.test.ts` uses `Dirent`
only as a type; `source.test.ts` reads a checked-in fixture; and
`audit.test.ts` writes temporary configuration. These rows now record their
consumer, and the type-only import in `layout.test.ts` is explicit. The other
three remain migration candidates. This field is call-site evidence, not a
decision or proof that every runtime filesystem call was found.

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

Website and root-script pass (21 paths): eight website tests that read checked-in
repo files are `repo-contract` exceptions (the real files are the asserted subject);
`docs-staleness-check.ts`, `get-llm-text.ts` and two temp-dir tests are `migrate`;
two landing-video scripts and two `rtk-*` hooks are `standalone-script`; three chmod/
subprocess tests and two packaged-artifact witnesses are `os-guarantee`. Three root
script tests stay `migration-candidate`.

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

## Status at close of this PR

Registry: 373 exact-path rows (338 distinct contents), all dispositioned; `pnpm direct-fs:check`
(in `pnpm quality-gate`) passes. 0 `deferred-migration`, 0 `migration-candidate`.
226 `in-flight-churn` (Scope Limit zones), 95 `repo-contract`, 25 `os-guarantee`,
13 `standalone-script`, 13 `type-contract`, 1 `boundary-adapter`.
Ordinary fs use was migrated to `FileSystemService`; the guard stops growth and flags an entry
stale once its file stops using `fs`. The scan figures above (1,051 / 438 / 403, "144 remaining",
"T-1 is incomplete", `migration-candidate`) describe the base scan and are superseded by this section.

## Real-service tests (real OS is the subject)

Tests below keep the real `fileSystemService` on purpose; they are not in the registry because they no
longer import `fs` (the guard is import-based). Every other former `deferred-migration` test seeds an
`InMemoryFileSystemService` and injects it into the system under test.

- `os-guarantee` (real process, git, symlink, chmod or shell over a tmp tree):
  `packages/dev-tools/src/quality-gates/{dev-scripts-gate,format-paths,regenerate-mirrors,run-format}.test.ts`,
  `packages/dev-tools/src/release/{release-origin,release-publish,release-remediation}.test.ts`,
  `packages/dev-tools/src/test-audit/{suites,suites-junit,suites-junit-attr,suites-junit-attr-control,suites-junit-control}.test.ts`,
  `packages/dev-tools/src/test-audit/inventory.policy.consumers.test.ts` (case w-r0-4e only),
  `apps/pair-cli/src/commands/kb-verify/handler.test.ts` (real zip archive parsed by AdmZip).
- `repo-contract` (real checked-in files or the real git history are the subject):
  `apps/website/lib/skills-catalog-merge-coherence.test.ts`,
  `packages/knowledge-hub/src/tools/{workflow-mirror,skills-conformance-check}.test.ts` (real-corpus cases only).
