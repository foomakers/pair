# Strict TypeScript domain pilot

## Post-migration baseline

Card [#750](https://github.com/foomakers/pair/issues/750) starts at `e2dac9e3b5b303636e9f4cabf793abca0f08cbc4`, which contains the #693 merge `0811d0a9f1f5cbd2116f42347d03763af3cd2fe1`. At that revision the workspace pinned Oxlint 1.95.0, TypeScript 5.4.5 and pnpm 10.15.0. CI used Node 20. Baseline samples ran on Darwin arm64 with Node 24.15.0. `pnpm --filter @pair/content-ops exec tsc --showConfig` resolved `baseUrl` to `../../tools/ts-config` and enabled `strictNullChecks`, `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.

Three consecutive cold/warm pairs ran `pnpm exec turbo lint --filter=@pair/content-ops --filter=@pair/pair-cli --cache=local:rw --cache-dir=<pair-cache> --output-logs=errors-only`. Each cold run used a fresh local cache and each warm run reused its preceding cache. All runs passed with zero lint findings.

| Run | Cold wall time (s) | Warm wall time (s) |
| --- | ---: | ---: |
| 1 | 6.15 | 1.74 |
| 2 | 4.91 | 1.69 |
| 3 | 4.52 | 1.49 |
| Median | 4.91 | 1.69 |

The original content-ops retry suite passed 11/11. The [#748 frozen matrix](https://github.com/foomakers/pair/issues/748#issuecomment-7169280644) passed 16/16 through the built CLI wrapper on the merged tree, including option forwarding, transport arguments, timer requests, handler messages and rejection identity. The fractional budget `0.5` made one attempt, requested 1000 ms and rejected with the original cause. The generic adapter passed the caller's options object by identity.

## Inventory

| Path and symbols | Disposition |
| --- | --- |
| `packages/content-ops/src/http/retryable-download.ts` retry loop, normalized settings and last error | Extract into a private sibling. The old loop carries `Error \| undefined` in local state and asserts caught errors once. |
| `packages/content-ops/src/http/retryable-download.ts` `RetryOptions`, `isRetryableError` and `downloadWithRetry` | Public boundary. Normalize absent options and preserve the legacy message-based classifier and rejection identity. |
| `packages/content-ops/src/http/resume-manager.ts` `DownloadContext`, `ResumeDecision` | Deferred internal models. `DownloadContext` has two optional properties with explicit undefined unions. `ResumeDecision` has none. |
| `packages/content-ops/src/http/download-manager.ts` `WriteOptions`, `ProgressReporterContext` | Deferred internal models. Two and three optional properties respectively, all with explicit undefined unions. |
| `packages/content-ops/src/http/resume-manager.ts` `ContentLengthProbeOptions` | Public probe options. `getContentLength` applies defaults at entry. |
| `packages/content-ops/src/http/download-manager.ts` `DownloadOptions`, `DownloadErrorHandler`, transport helpers | Caller DTO, handler protocol and transport adapter. Preserve optional dependencies and nullable handler return. |
| `apps/pair-cli/src/kb-manager/download-manager.ts` `KBDownloadOptions` | CLI ingress. Wrapper adds the KB label and error handler before forwarding. |
| Build output, declarations, KB/skill mirrors | Excluded from findings. Imported declarations can still supply type information. |

The frozen deferred inventory is seven optional-property findings and seven explicit undefined findings. The existing hygiene scan reports no first-party ESLint or Oxlint disable directives, TypeScript ignores or TypeScript nochecks. Ten legacy TypeScript expect-error directives occur in CLI run tests (`card-entry-prepare`, `cards-lifecycle-4`, `cycle`, `workflow-facts` and six in `workflow-host`).

## Typed Oxlint probes

On the #693 baseline, Node 20.20.2, Oxlint 1.95.0 and oxlint-tsgolint 7.0.2008 were exercised together. From `packages/content-ops`, `oxlint -c .oxlintrc.json --tsconfig tsconfig.json --type-aware -D typescript/switch-exhaustiveness-check <file>` used the actual package config. One fixture omitted a union case and the other covered both cases. Both exited 1 with `typescript(tsconfig-error)` at `tsconfig.json:3:3` because the typed runner rejected inherited `baseUrl`. The failure occurred before rule evaluation.

After merging #757, native `tsc` 7.0.2 shows no `baseUrl` in the effective content-ops project. The same switch command and runner versions loaded that project successfully. The switch missing the `failure` case exited 1 with `typescript(switch-exhaustiveness-check)` at `2:11`. The complete switch exited 0 with zero diagnostics. Keep the compiler-checked `never` witness at the retry dispatch.

A separate custom JS plugin probe on the merged configuration still exited 1 at `1:1` for both the nullable alias and the non-null control. The probe reported its own missing-checker finding because `context.sourceCode.parserServices` supplied no TypeScript program. The custom semantic rule therefore uses the compiler API fallback.

The scoped syntax and independent suppression suite passed 18/18 on Node 20. Failed syntax fixtures matched their specific rule and source position. The existing base and React controls and twelve hygiene unit tests also passed. Legacy TypeScript suppressions are frozen by exact Git grep record. A moved or changed directive requires removal of the suppression.

## Compiler API fallback

The content-ops lint route uses the TypeScript 6.0.3 compiler API from `@typescript/typescript6` 6.0.2 on the same pilot paths as the syntax override. `pair-domain/nullable-domain-property` locates checker-resolved null or undefined at the model property. The syntax visitors own optional properties and directly written nullish types. TypeScript declarations outside the scan can still be resolved as imports.

Eight Node 20 fixtures passed through the package's `pnpm lint` command. Local, imported, transitive and inferred nullish fields each produced one semantic finding at their property, including with duplicate file operands. The clean control accepted non-null aliases, opaque causes and nested nullable element types, and left an ingress DTO outside the model check. Broken config and an unresolved transitive import returned exit 2 with project diagnostics.

A cold clean run of `turbo lint --filter=@pair/content-ops` warmed the cache. The same command hit that result on the second run. Changing only the imported alias from `string` to `string | null` missed the cache and reported one semantic finding at `src/http/retry.domain.ts:3:3`. The CI `pnpm lint` command reported the same single finding. This was recorded while the pilot was in warning mode.

## Retry parity and boundaries

The private `retry.domain.ts` uses `success`, `transient` and `permanent` variants. Both failures preserve the original `unknown` cause. `resolveRetryConfig` converts caller `RetryOptions` to a required `RetryPolicy`, while `classifyRejection` classifies a transport rejection once and retains the original value. The public download adapters still pass caller options, dependencies and reporting behavior through their existing entry points.

The real strict TypeScript project passed the fresh success, exhaustive consumer, normalized ingress and bidirectional Promise signature controls. The isolated negatives reported TS2353 for extra success data, TS2532 for unchecked indexing, TS2741 for a raw option shape and TS2322 for raw rejection input and for an additional variant at the live `never` assignment. The compile runner checked exit status, diagnostic code and source location.

Node 20 passed the 11 original retry tests, the 16 frozen CLI rows and the fractional-budget witness through the rebuilt CLI. Checked fields include arguments, supplied options and reporter identity, handler messages, timer requests and rejection identity. An extra field on a structurally typed alias can still pass TypeScript, and a caller can still discard a result. The pilot constructs each variant in place and consumes each outcome at the exhaustive dispatch.

Separate macOS and Linux destination controls verify that the CLI passes the exact argument through both attempts. The compiler, semantic and baseline tests use disposable real files because the subprocesses resolve their projects and Git trees from disk. Their three exact filesystem entries are recorded in the [inventory](direct-fs-inventory.json).

## Enforcement and rollout

The pilot produced zero findings after promotion to errors. The separate, uncached `pnpm domain:check` reports fourteen reviewed findings across two legacy files. It verifies the baseline against the merge base, uses Git-verified renames and counts each occurrence. Temporary repositories proved unchanged debt, line movement, rename, a new finding in an existing model, a new model file, the DTO and generated exclusions, retirement, and rejection of growth in either snapshot. Negative fixtures report the expected rule and location. Tool and project loading errors have exit status 2.

| Run | Cold wall time (s) | Warm wall time (s) | Uncached domain ratchet (s) |
| --- | ---: | ---: | ---: |
| 1 | 4.23 | 1.57 | 1.82 |
| 2 | 4.41 | 1.83 | 1.72 |
| 3 | 4.26 | 1.71 | 1.71 |
| Median | 4.26 | 1.71 | 1.72 |

The lint samples use the same workspace package selection, Node and Turbo cache procedure as the baseline. The warm median changed from 1.69 s to 1.71 s. The pilot adds a separate read of repository-wide policy that took a median of 1.72 s. The [post-#693 CI baseline](https://github.com/foomakers/pair/actions/runs/45832282802) recorded 10 s for lint and 2 s for hygiene. The PR's CI run records the new baseline step separately from lint and hygiene.

The rollback rehearsal applied and reversed the story diff in a detached worktree. Git confirmed the exact baseline tree. With Node 20, the original retry suite passed 11/11, CLI smoke reported `0.5.2`, and CLI and content-ops each reported zero #693 lint findings. Roll back the private retry model, scope, compiler checker, baseline, suppression policy and CI wiring together.

`resume-manager.ts` and `download-manager.ts` remain candidates for individual domain and boundary inventories. For each candidate, baseline warnings, migrate one private slice, replay behavior, then widen the strict allowlist. Pause expansion on parity loss, false positives or unexplained gate-cost increases.
