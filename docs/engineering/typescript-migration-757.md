# TypeScript migration for #757

## Baseline

Source revision `e2dac9e3b5b303636e9f4cabf793abca0f08cbc4`, frozen install,
TypeScript 5.4.5, Node 24.15.0, pnpm 10.15.0, macOS arm64 Mac17,2
(10 logical cores, 24 GiB). Measurements are serial wall-clock seconds,
three cold/warm pairs per command, with identical inputs within each pair.
They invoke the workspace compiler directly, bypassing Turbo. Cold means
compiler outputs and build info cleared for reference builds, and check
build info cleared for standalone checks. Warm repeats the same command
after the cold pass. The OS filesystem cache is left alone.

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

## Matched compiler timings

Both toolchains used the T-3 source revision
`b74a05a0581a5f02f1ccf68fa40fb8fb1b583afa`, the same frozen lockfile,
pre-generated website inputs and the environment above. The timings use
one compiler command at a time and alternate compiler order across
rounds. They include compiler startup and exclude Turbo entirely.
The Node API compatibility version and Node type inputs stay fixed.
T-3 predates the explicit side-effect option that 5.4.5 cannot parse,
and 7.0.2 still enforces it by default.

The initial concurrent native build of the three roots emitted 236
diagnostics on each cold run. The CLI build config did not declare its
own references, so its program could read before the dependencies
produced their declarations. Turbo's workspace ordering hid that
dependency. The CLI build config now explicitly references the
content-ops and workflows build configs. Both clean single-root and
clean multi-root builds pass after this correction. The measured
reference samples below rerun both compilers with that one config change.

```sh
legacy=tools/oxlint-config/node_modules/typescript/bin/tsc
native=apps/pair-cli/node_modules/.bin/tsc
# Run the same baseline commands above with each of these compiler paths.
# For the references comparison, use the final CLI tsconfig.build.json.
# Clear workspaces' generated *.tsbuildinfo files before each cold pass.
```

Times are seconds. Each cell shows three samples followed by the median.
All 96 measured commands in this table exited 0 with zero diagnostics.

| Entry point | 5.4.5 cold | 5.4.5 warm | 7.0.2 cold | 7.0.2 warm |
| --- | --- | --- | --- | --- |
| Reference builds | 3.242 / 3.167 / 3.176 (3.176) | 0.175 / 0.171 / 0.174 (0.174) | 0.435 / 0.438 / 0.400 (0.435) | 0.094 / 0.099 / 0.138 (0.099) |
| Content ops | 0.874 / 0.839 / 0.899 (0.874) | 0.585 / 0.595 / 0.709 (0.595) | 0.158 / 0.159 / 0.162 (0.159) | 0.135 / 0.135 / 0.132 (0.135) |
| Workflows | 0.908 / 0.949 / 0.981 (0.949) | 0.491 / 0.492 / 0.663 (0.492) | 0.167 / 0.165 / 0.164 (0.165) | 0.112 / 0.115 / 0.113 (0.113) |
| CLI | 3.796 / 3.649 / 3.638 (3.649) | 1.238 / 1.257 / 1.403 (1.257) | 0.553 / 0.529 / 0.552 (0.552) | 0.298 / 0.207 / 0.206 (0.207) |
| Brand | 0.675 / 0.680 / 0.654 (0.675) | 0.421 / 0.466 / 0.423 (0.423) | 0.159 / 0.156 / 0.155 (0.156) | 0.113 / 0.111 / 0.112 (0.112) |
| Dev tools | 1.240 / 1.249 / 1.218 (1.240) | 1.225 / 1.815 / 1.268 (1.268) | 0.212 / 0.209 / 0.204 (0.209) | 0.216 / 0.204 / 0.207 (0.207) |
| Knowledge hub | 1.084 / 1.082 / 1.053 (1.082) | 0.519 / 0.716 / 0.509 (0.519) | 0.205 / 0.208 / 0.199 (0.205) | 0.118 / 0.120 / 0.114 (0.118) |
| Website | 1.921 / 1.783 / 1.683 (1.783) | 1.210 / 1.584 / 1.225 (1.225) | 0.314 / 0.320 / 0.309 (0.314) | 0.266 / 0.280 / 0.279 (0.279) |

## Compatibility findings

- The native compiler owns all seven workspace `ts:check` commands and
  the three TypeScript reference builds. Next 15 builds with SWC, generates
  MDX and route types, and retains its JavaScript TypeScript preflight.
  Turbo runs the native website check after generation.
- TypeScript 7 rejects the legacy `baseUrl` pattern. Paths now resolve
  relative to their declaring project. Website build and component tests,
  Brand Vite build and tests, and CLI source and compiled entries exercised
  the real resolution paths.
- The initial cutover hit Node type declaration conflicts in dev tools
  and knowledge hub with `@types/node` 24.3.0. The Node preset uses the
  ES2022 library and the catalog pins 24.19.4. The UI preset keeps DOM types.
  The native compiler and built CLI ran on Node 20.20.2, 22.23.2 and 24.15.0.
- `ts-node`, Next 15, the compiler-API scripts, and ncc use the scoped
  JavaScript API from `@typescript/typescript6` 6.0.2 (TypeScript 6.0.3
  in the frozen lock). ts-node and ncc needed explicit source roots for
  transpile-only paths. The guard fixture now uses NodeNext resolution
  instead of the deprecated node10 default.
- New compiler output required regeneration of the standalone workflow
  bundle, coverage ratchet, and mirror realignment assets. Both shipped
  copies follow their generators. The workflow bundle schema command runs
  standalone, and the workflow kinds and schema reference output remains
  byte-identical.
- The manual release smoke packages the prebuilt, type-checked JS with
  ncc's `--transpile-only`. This avoids ncc rechecking unrelated test
  sources. Both the normal declaration build and a forced
  `dts-bundle-generator` failure produced executable ZIPs. The smoke
  asserted that `package.json#types` agrees with the actual declaration
  file. CLI development, built JS, and both ZIP wrappers report `0.5.2`.
- The retained TypeScript ESLint compatibility plugin resolves 5.4.5
  locally within `@pair/oxlint-config`. `vite-tsconfig-paths` also advertises
  an older optional compiler peer via `tsconfck`. The actual Vite, Vitest
  and package lint routes passed with the new pins.

### Declarations

All 358 baseline declaration files are still emitted at the same paths
(226 CLI, 65 content ops, 67 workflows). Native emit changes 65 files,
predominantly quote style, ordering, alias reuse and automatically
generated Node references. The old declarations' implicit Node references
were significant for consumers with `types: []`. Nine consumer cases
cover every supported package export or subpath. Six initially failed
with missing Node declarations and passed once the producers preserved
explicit references. Workflows' `hasResultFacts` keeps its baseline
boolean signature. The platform smoke gate still requires platform tests
for runtime edits and allows the exact declaration-only reference additions.

## Enforcement evidence

Eleven actual check and build configs resolve the shared strict flags.
Each paired fixture accepts the clean control, rejects the existing-source
fixture at all nine expected diagnostic locations, and rejects the new
source at `new-source.ts(1,8)` with TS2882. Both handwritten code and
generated declaration consumers exercise null, optional-property and
unchecked-index constraints.

| Constraint | Witness diagnostic |
| --- | --- |
| Assign null to a string | TS2322 |
| Supply undefined for an optional property | TS2375 |
| Dereference an unchecked index | TS2532 |
| Fall off a return path | TS7030 |
| Fall through a nonempty switch case | TS7029 |
| Import an unresolved module for its side effects | TS2882 |

The shared base now explicitly requires side-effect imports to resolve.
TypeScript 5.4.5 accepted an unresolved CSS import in the same minimal
fixture where 7.0.2 reported TS2882. The other five constraints were
already enabled. The CLI `isolatedDeclarations` trial produced 190
diagnostics requiring a broader public annotation pass, so it remains
disabled.

The CSS guard allows the exact stylesheet module declarations listed in
the [compiler adoption decision](../../.pair/adoption/decision-log/2026-11-26-native-typescript-compiler.md).
Deleting a backed stylesheet, adding an unreviewed declaration, and
adding a wildcard declaration each failed the guard in a disposable checkout.
The native compiler rejects unresolved side-effect imports. Next's ambient
CSS module types can still resolve a missing `.module.css` import, so the guard
also checks that local stylesheet imports point to files.

```sh
pnpm --filter @pair/dev-tools test src/quality-gates/typescript-declarations.test.ts
pnpm --filter @pair/dev-tools test src/quality-gates/typescript-enforcement.test.ts
pnpm --filter @pair/brand exec vite build --outDir /tmp/pair-brand-757-vite
pnpm --filter @pair/pair-cli dev --version
node apps/pair-cli/dist/cli.js --version
bash scripts/smoke-tests/scenarios/00-create-install-package.sh
```

## Final replay

```sh
pnpm install --frozen-lockfile
pnpm ts:check
pnpm build
TURBO_CONCURRENCY=1 pnpm gate:increment
pnpm gate:pr
node --test scripts/dev/oxlint-policy.test.mjs
```

The Oxlint replay uses [#693](https://github.com/foomakers/pair/issues/693)
as merged in PR [#751](https://github.com/foomakers/pair/pull/751).
The dev-scripts portion of the PR gate executes the same rule-policy
witnesses. The test additions cover nine downstream declaration entry
points, twelve compiler and CSS cases, and one declaration-only control
for the platform smoke gate. Mutation testing was not measured.

## Rollback

Revert the migration together with its lockfile, presets, package manifests
and generated assets. Run `pnpm install --frozen-lockfile` and rebuild from
clean compiler outputs and build info. Then repeat the workspace type
checks, release smoke and PR gate on the reverted tree.
