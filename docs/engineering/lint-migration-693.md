# Lint migration baseline for #693

Baseline `f646df6b443afde421fc9ef461894ff8626818b1` on Darwin arm64 (Apple M5), Node 24.15.0, pnpm 10.15.0 and Turbo 2.5.6. The workspace uses ESLint 9.34.0 and typescript-eslint 8.41.0. The React overlay uses React plugin 7.37.2, Hooks 5.1.0 and JSX a11y 6.10.2.

## ESLint routes

| Workspace                | Package lint and fix | Direct discovery | Files checked |
| ------------------------ | -------------------- | ---------------- | ------------: |
| `apps/pair-cli`          | Base                 | Base             |           567 |
| `apps/website`           | Website              | Website          |            52 |
| `packages/brand`         | Base                 | React            |            53 |
| `packages/content-ops`   | Base                 | Base             |           118 |
| `packages/dev-tools`     | Base                 | Base             |            77 |
| `packages/knowledge-hub` | Base                 | Base             |           112 |
| `packages/workflows`     | Base                 | Base             |            84 |

All 1,063 files passed with zero warnings. To recover the file inventory, run the package script's ESLint command with JSON output from each workspace. The base command is `pnpm exec eslint . --config ../../tools/eslint-config/eslint.config.cjs --format json`. In the website use `pnpm exec eslint . --config eslint.config.cjs --format json`. For each direct route run `pnpm exec eslint --print-config path/to/file` from that workspace. Supply the same explicit config as the package script to inspect its route.

The rule matrix in [#693](https://github.com/foomakers/pair/issues/693) accounts for 153 configured rows from the base block (92), test and CommonJS overrides (one each) and React overlay (59). The baseline resolves test TSX to a disabled function-length rule on base routes and 100 lines on React routes. JSX-only files match only the React route and inherit the default parser there. `dist/` is ignored at the workspace root and `deep/dist/` is linted. The workspace Git ignore files and the shared legacy `.eslintignore` do not define the flat config's scope. The website adds `.source`, `.next`, `next-env.d.ts` and `postcss.config.js` to the shared ignores.

Nineteen controls captured complexity at 10/11, depth and parameters at 4/5, function length at 50/51 and React TSX test length at 100/101. They also covered underscore parameters and locals, `require` in JS/CJS/scripts, hook dependency warnings versus order errors, and implicit JSX runtime.

The seven package check and fix scripts gave the same result on temporary fixtures. `export let value = 1` produced `prefer-const` in check mode and changed to `export const value = 1` on the first fix. `export const value: any = 1` produced `@typescript-eslint/no-explicit-any` and remained byte-identical, as did the same source in an ignored root `*.config.ts` fixture. The second fix made zero changes and exit remained 1 for the diagnostic-only file. Direct ESLint agreed on the clean and diagnostic-only fixtures with absolute and relative paths. Check mode left every fixture unchanged.

## Gate routes

| Route                        | ESLint baseline                                                                                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`, `pnpm lint:fix` | Turbo selects the same seven workspace scripts. Fix mode passes `--fix` through the workspace command.                                                                                       |
| `gate:increment`             | Turbo selects test and lint from `HEAD~1`, followed by `prettier:check`.                                                                                                                     |
| `gate:push`                  | Turbo selects type check, push tests and lint from the upstream ref or the main merge base.                                                                                                  |
| `gate:review`                | Turbo uses the main merge base and adds skill conformance and docs staleness checks.                                                                                                         |
| `gate:pr`, CI, release       | The PR and release run `quality-gate` with serial type check, test and lint before downstream checks. CI runs `pnpm lint` directly.                                                          |
| Pre-commit and pre-push      | Pre-commit checks type and staleness conditionally. Pre-push delegates to `gate:push`.                                                                                                       |
| Composition and hygiene      | The composition guard rejects lint fix wrappers and raw ESLint `--fix` in a gate. The hygiene guard flags ESLint suppression markers.                                                        |
| RED seal                     | The package lint subprocess runs in the workspace CWD. The sealer accepts a failing report scoped outside the listed tests only when it recognizes the ESLint summary and diagnostic format. |

`pnpm exec turbo run lint --dry=json` and its `lint:fix` twin show the selected task commands. `--filter='[HEAD~1]'` selected knowledge-hub, pair-cli, website and workflows on the baseline. `--filter='[origin/main]'` selected no packages because the branch was at main.

`pnpm gate:pr` passed with 26 successful Turbo tasks and zero tracked changes. The composition, hygiene and RED snapshot checks ran through the gate's existing suites. The increment, push and review targets also passed with the baseline selection described above.

For each timing pair, run `pnpm lint --concurrency=1 --cache-dir="$scratch/cache-$run" --cache=local:rw` against a fresh cache, then repeat against that cache. All seven lint tasks ran cold and were cache hits warm. The three cold samples were 16.840, 17.139 and 17.174 seconds (median 17.139). The three warm samples were 1.961, 1.705 and 1.531 seconds (median 1.705).

## Oxlint compatibility probes

Oxlint 1.95.0 was installed in a temporary directory with the pinned Cloudflare preset. This base config isolates the directives under test.

```json
{
  "plugins": [],
  "categories": { "correctness": "off" },
  "options": { "reportUnusedDisableDirectives": "warn" },
  "rules": { "no-throw-literal": "error", "complexity": ["error", 10] }
}
```

From a scratch directory, run the checkout's `tools/eslint-config/node_modules/.bin/eslint --config /path/to/checkout/tools/eslint-config/eslint.config.cjs --format json sample.js` and the scratch `node_modules/.bin/oxlint --config base.json --format json sample.js`. Write each sample to its own `.js` file with the comment on the first line and the expression or declaration on the second.

| Sample                                                                                      | ESLint                     | Oxlint                           |
| ------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------- |
| `throw "message"`                                                                           | Error, exit 1              | Error, exit 1                    |
| `throw new Error("message")`                                                                | Clean, exit 0              | Clean, exit 0                    |
| `/* eslint no-throw-literal: "off" */` then `throw "message"`                               | Clean, exit 0              | Error, exit 1                    |
| `/* eslint no-throw-literal: "warn" */` then `throw "message"`                              | Warning, exit 0            | Error, exit 1                    |
| `/* eslint complexity: ["error", 1] */` then `export const size = (value) => value ? 1 : 0` | Error, exit 1              | Clean, exit 0                    |
| `/* eslint-disable missing/nonexistent-rule */` then `export const value = 1`               | Unknown rule error, exit 1 | Unused directive warning, exit 0 |
| `export const annotated: string = "ok"`                                                     | Clean, exit 0              | Parse errors, exit 1             |

Oxlint exposes file-pattern overrides and disable comments. The direct CLI has no inline rule-option or parser override. A lint plugin runs after parsing and cannot restore the `.js` parser behavior. Emulating the other differences would require an additional layer that reads and applies inline config before linting, including at the direct-file entry point. The card requires a maintainer decision before cutover when rule behavior has no equivalent. [Oxlint inline comments](https://oxc.rs/docs/guide/usage/linter/ignore-comments) · [Oxlint JS plugin support](https://oxc.rs/docs/guide/usage/linter/js-plugins)

The initial native mapping also reported three new `no-unsafe-optional-chaining` errors in pair-cli, all on an optional chain wrapped in a TypeScript assertion. These need a rule-level compatibility test independently of the parser and directive decision.

## Cloudflare preset

The standalone export of `@cloudflare/oxlint-config` 0.2.0 declares 228 top-level rules and five overlays, with `@nkzw/oxlint-config` 4.1.0 and three JS plugin entries. It uses a broader global environment and only a node_modules ignore, upgrades unused directive reports to errors, changes array and import style, and disables explicit-any in its TypeScript test overlay. Its typed runner failed on Pair's `baseUrl` and path mappings in a pair-cli trial. The full preset would change policy and requires Node 22.18+ while Pair's CI and release use Node 20. Keep the preset out of the cutover. Individual settings still require parity evidence. [Cloudflare preset](https://github.com/cloudflare/oxlint-config)
