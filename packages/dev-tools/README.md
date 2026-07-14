# @pair/dev-tools

Pair's own gate/tooling scripts, as tested TypeScript modules — the reference pattern for repo quality gates (per [ADL 2026-07-13-gate-tooling-code-in-tested-modules](../../.pair/adoption/decision-log/2026-07-13-gate-tooling-code-in-tested-modules.md)).

## Tools

| Script                | Module                        | Purpose                                                                 |
| --------------------- | ----------------------------- | ------------------------------------------------------------------------ |
| `code-hygiene:check`  | `src/code-hygiene-check.ts`   | Fails if suppression markers (`@ts-ignore`, `eslint-disable`, `.skip`) are committed |
| `sync-version`        | `src/sync-version-in-docs.ts` | Detects/rewrites hardcoded CLI version strings across `.md`/`.mdx` docs |

Both are runnable via the repo-root scripts (`pnpm hygiene:check`, `pnpm sync-version -- <old-version>`), which delegate here (`pnpm --filter @pair/dev-tools <script>`).

## Scope

This package owns the genuinely **repo-wide, no-package-affinity** gates. Three related tools — `docs-staleness-check` (`apps/website/lib/`), `skills-conformance-check` and `check-broken-links` (`packages/knowledge-hub/src/tools/`) — stay in their owning packages: each needs that package's own context (the website's docs tree, knowledge-hub's dataset) and moving them here would trade a clean path resolution for a deep relative reach into a sibling package's internals. `scripts/perf/benchmark-update-link.js` also stays put (perf benchmark, not a correctness gate).

## Conventions

Every module here follows the shape: logic as exported, unit-tested pure functions; a thin `main()` CLI wrapper behind a `require.main === module` guard. Tests are white-box (import the module directly) and never spawn the script as a subprocess — see the ADL linked above.
