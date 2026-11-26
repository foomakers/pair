# Strict TypeScript domain pilot

## Post-migration baseline

Card [#750](https://github.com/foomakers/pair/issues/750) starts at `e2dac9e3b5b303636e9f4cabf793abca0f08cbc4`, which contains the #693 merge `0811d0a9f1f5cbd2116f42347d03763af3cd2fe1`. The workspace pins Oxlint 1.95.0, TypeScript 5.4.5 and pnpm 10.15.0. CI uses Node 20. Baseline samples ran on Darwin arm64 with Node 24.15.0. `pnpm --filter @pair/content-ops exec tsc --showConfig` resolves `baseUrl` to `../../tools/ts-config` and enables `strictNullChecks`, `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.

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

Node 20.20.2, Oxlint 1.95.0 and oxlint-tsgolint 7.0.2008 were exercised together. From `packages/content-ops`, `oxlint -c .oxlintrc.json --tsconfig tsconfig.json --type-aware -D typescript/switch-exhaustiveness-check <file>` loaded the actual package config. One fixture omitted a union case and the other covered both cases. Both exited 1 with `typescript(tsconfig-error)` at `tsconfig.json:3:3` because the typed runner rejected inherited `baseUrl`. The failure occurred before rule evaluation. Keep the workspace path settings and use a TypeScript `never` witness at each pilot dispatch.

A separate custom JS plugin probe ran against a working NodeNext project without `baseUrl`. The nullable alias and the non-null control both ran the plugin and exited 1 at `1:1` with the probe's own missing-checker finding. `context.sourceCode.parserServices` supplied no TypeScript program. This pins the semantic fallback to the workspace TypeScript compiler API.

The scoped syntax and independent suppression suite passed 18/18 on Node 20. Failed syntax fixtures matched their specific rule and source position. The existing base and React controls and twelve hygiene unit tests also passed. Legacy TypeScript suppressions are frozen by exact Git grep record. A moved or changed directive requires removal of the suppression.

## Compiler API fallback

The content-ops lint route runs the workspace TypeScript 5.4.5 checker on the same pilot paths as the syntax override. `pair-domain/nullable-domain-property` locates checker-resolved null or undefined at the model property. The syntax visitors own optional properties and directly written nullish types. TypeScript declarations outside the scan can still be resolved as imports.

Eight Node 20 fixtures passed through the package's `pnpm lint` command. Local, imported, transitive and inferred nullish fields each produced one semantic finding at their property, including with duplicate file operands. The clean control accepted non-null aliases, opaque causes and nested nullable element types, and left an ingress DTO outside the model check. Broken config and an unresolved transitive import returned exit 2 with project diagnostics.

A cold clean run of `turbo lint --filter=@pair/content-ops` warmed the cache. The same command hit that result on the second run. Changing only the imported alias from `string` to `string | null` missed the cache and reported one semantic finding at `src/http/retry.domain.ts:3:3`. The CI `pnpm lint` command reported the same single finding. This was recorded while the pilot was in warning mode.

## Retry parity and boundaries

The private `retry.domain.ts` uses `success`, `transient` and `permanent` variants. Both failures preserve the original `unknown` cause. `resolveRetryConfig` converts caller `RetryOptions` to a required `RetryPolicy`, while `classifyRejection` classifies a transport rejection once and retains the original value. The public download adapters still pass caller options, dependencies and reporting behavior through their existing entry points.

The real strict TypeScript project passed the fresh success, exhaustive consumer, normalized ingress and bidirectional Promise signature controls. The isolated negatives reported TS2353 for extra success data, TS2532 for unchecked indexing, TS2741 for a raw option shape and TS2322 for raw rejection input and for an additional variant at the live `never` assignment. The compile runner checked exit status, diagnostic code and source location.

Node 20 passed the 11 original retry tests, the 16 frozen CLI rows and the fractional-budget witness through the rebuilt CLI. Checked fields include arguments, supplied options and reporter identity, handler messages, timer requests and rejection identity. An extra field on a structurally typed alias can still pass TypeScript, and a caller can still discard a result. The pilot constructs each variant in place and consumes each outcome at the exhaustive dispatch.
