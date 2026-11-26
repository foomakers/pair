# @pair/oxlint-config

Pair's workspace lint policy. Run `pnpm lint` or `pnpm lint:fix` at the monorepo root. Within a workspace, use `pnpm lint` for the package policy and `pnpm exec oxlint src/file.ts` for file discovery.

- `base.json` contains the JavaScript and TypeScript rules, including the test and CommonJS overrides.
- `react.json` adds the React, Hooks and accessibility rules on JSX and TSX. The website uses this profile for both routes. Brand uses it for direct lint and selects `oxlint.base.json` for its package commands.
- Each workspace declares its root-relative ignores in `.oxlintrc.json`. The package wrapper includes tracked and untracked sources matched by Git ignores and excludes Vue, Svelte and Astro files.
- `oxlint-plugin-eslint` and the retained JavaScript plugins run inside Oxlint. The package and direct commands invoke the same pinned binary.
- The RED sealer requests the package script's structured output through `PAIR_LINT_REPORT=json`.

See the [migration evidence](../../docs/engineering/lint-migration-693.md) for rule differences and validation.
