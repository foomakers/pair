# TypeScript migration for #757

## Baseline

Source revision `e2dac9e3b5b303636e9f4cabf793abca0f08cbc4`, frozen install,
TypeScript 5.4.5, Node 24.15.0, pnpm 10.15.0, macOS arm64 Mac17,2
(10 logical cores, 24 GiB). Measurements are serial wall-clock seconds,
three cold/warm pairs per command, with identical inputs within each pair.
They invoke the workspace compiler directly, bypassing Turbo. Cold means
compiler outputs and build info cleared for reference builds, and check
build info cleared for standalone checks. Warm repeats the same command
immediately. The OS filesystem cache is left alone.

```sh
pnpm install --frozen-lockfile
tsc=apps/pair-cli/node_modules/.bin/tsc
set -- packages/content-ops/tsconfig.build.json packages/workflows/tsconfig.build.json apps/pair-cli/tsconfig.build.json
"$tsc" -b --clean "$@"
"$tsc" -b "$@" --pretty false
# Repeat without cleaning for the warm build. For each check workspace:
workspace=apps/pair-cli
"$workspace/node_modules/.bin/tsc" -p "$workspace/tsconfig.json" --noEmit --pretty false
```

| Entry point | Cold samples | Cold median | Warm samples | Warm median |
| --- | --- | ---: | --- | ---: |
| Reference builds | 3.679 / 3.457 / 3.483 | 3.483 | 0.210 / 0.208 / 0.210 | 0.210 |
| Content ops | 1.103 / 0.993 / 1.091 | 1.091 | 0.719 / 0.692 / 0.738 | 0.719 |
| Workflows | 1.193 / 1.056 / 1.059 | 1.059 | 0.619 / 0.620 / 0.614 | 0.619 |
| CLI | 4.053 / 4.029 / 5.957 | 4.053 | 1.339 / 1.353 / 1.500 | 1.353 |
| Brand | 0.853 / 0.733 / 0.762 | 0.762 | 0.464 / 0.474 / 0.541 | 0.474 |
| Dev tools | 1.821 / 1.712 / 2.208 | 1.821 | 1.719 / 1.729 / 2.336 | 1.729 |
| Knowledge hub | 1.720 / 1.600 / 2.399 | 1.720 | 0.614 / 0.622 / 0.652 | 0.622 |
| Website | 2.160 / 1.834 / 2.258 | 2.160 | 1.300 / 1.382 / 1.443 | 1.382 |

All 48 invocations exited successfully with zero diagnostics. The three
reference build outputs contain 358 `.d.ts` files for comparison.

The compiler checks seven workspaces. CLI, content ops and workflows emit
through `tsconfig.build.json`; knowledge hub's package build copies its
dataset. Next builds the website and generates route declarations. Its
type-check follows that build in Turbo so MDX-generated sources are stable.
Brand exercises its aliases through Vite and Vitest.

Compatibility inventory: `ts-node` drives CLI development, release and
guard commands, and workflow/knowledge generators. Dev tools and knowledge
hub also import the compiler API directly. Next 15 loads the JavaScript
compiler to verify its config and types. Oxlint's compatibility rules
load the TypeScript ESLint plugin. The manual CLI uses ncc and optionally
bundles declarations. The repository supports Node 20.19.0 and later.

The first increment-gate run hit workflow test timeouts under concurrent
load. The standalone bundle still matched byte-for-byte and its isolated
test passed on a warm retry. The serial retry used
`TURBO_CONCURRENCY=1 pnpm gate:increment` with the original compiler.
