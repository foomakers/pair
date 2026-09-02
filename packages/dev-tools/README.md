# @pair/dev-tools

Pair's own automation scripts for development and deployment — gate/tooling scripts and release-pipeline logic — as tested TypeScript modules, organized into folders by tool family (the reference pattern for repo quality gates, per [ADL 2026-07-13-gate-tooling-code-in-tested-modules](../../.pair/adoption/decision-log/2026-07-13-gate-tooling-code-in-tested-modules.md)). `determine-version` was originally a separate `@pair/release-tools` package; folded in here once a bounded-context analysis showed both tool families map onto the same bounded context (see #148) — a package boundary should track a bounded context, not a folder-level tool grouping.

## Tools

| Script                  | Module                                          | Purpose                                                                                                                            | Root script             |
| ----------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `code-hygiene:check`    | `src/quality-gates/code-hygiene-check.ts`       | Fails if suppression markers (`@ts-ignore`, `eslint-disable`, `.skip`) are committed                                                 | `pnpm hygiene:check`    |
| `llms-index:check`      | `src/quality-gates/llms-txt-drift-check.ts`     | Fails if `.pair/llms.txt` is not byte-identical to what `generateLlmsTxt` emits for the tree; prints the missing/extra lines, never writes | `pnpm llms-index:check` |
| `smoke-modes:check`     | `src/quality-gates/smoke-scenario-modes.ts`     | Fails if a `scripts/smoke-tests/` scenario is committed without its executable bit                                                   | `pnpm smoke-modes:check` |
| `pre-push-gate:check`   | `src/quality-gates/pre-push-gate-composition.ts` | Fails if any step reachable from the root `quality-gate` chain writes files (the gate must stay check-mode)                          | `pnpm gate:composition` |
| `sync-version`          | `src/quality-gates/sync-version-in-docs.ts`     | Detects/rewrites hardcoded CLI version strings across `.md`/`.mdx` docs                                                              | `pnpm sync-version -- <old-version>` |
| `benchmark-update-link` | `src/quality-gates/benchmark-update-link.ts`    | Perf gate for the CLI's `update-link` command — thresholds: <30,000ms (large KB), >100 links/sec (every size)                        | `pnpm test:perf`        |
| `determine-version`     | `src/release/determine-version.ts`              | Resolves the release version from `--input-version` > `--release-tag` > `--github-ref` tag pattern, writes GITHUB_OUTPUT/GITHUB_ENV  | — (release workflow)    |

Every root script above delegates here (`pnpm --filter @pair/dev-tools <script>`); `determine-version` has no root alias and is invoked directly by `.github/workflows/release.yml`'s "Determine version" step. `llms-index:check` runs `ts-node -T`, deliberately: it compiles a source file from `apps/pair-cli` whose type imports resolve only in a built tree, and a gate that dies with a compiler error instead of returning a verdict is a gate contributors stop trusting.

## Folder structure

- `src/quality-gates/` — repo-wide dev/CI gates (code hygiene, KB-index drift, smoke-scenario modes, gate composition, doc version sync, perf benchmark).
- `src/release/` — release-pipeline decision logic (currently `determine-version`).

## Scope

This package owns the genuinely **repo-wide, no-package-affinity** gates and release-pipeline logic that nothing in the monorepo imports as a library dependency (each tool here is invoked only as a script, never `import`ed). Three related tools — `docs-staleness-check` (`apps/website/lib/`), `skills-conformance-check` and `check-broken-links` (`packages/knowledge-hub/src/tools/`) — stay in their owning packages: each needs that package's own context (the website's docs tree, knowledge-hub's dataset) and moving them here would trade a clean path resolution for a deep relative reach into a sibling package's internals.

## Conventions

Every module here follows the shape: logic as exported, unit-tested pure functions; a thin `main()` CLI wrapper behind a `require.main === module` guard. Tests are white-box (import the module directly) and never spawn the script as a subprocess — see the ADL linked above.
