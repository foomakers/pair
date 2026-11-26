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
