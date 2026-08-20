# Decision: install reports three outcomes — absent is not failed — and the exit code follows the failures

## Date

2026-08-19

## Status

Active

## Category

Convention Adoption

## Context

`pair install` classified every registry as ok or not-ok. A source that legitimately does
not ship a registry — every external KB ships `knowledge` + `skills` and never `adoption`
— therefore ended on:

```text
! Installation finished with errors (2 ok, 3 failed, 79ms)
```

with **exit code 0**. Two defects in one line: absent was reported as failed, and the text
disagreed with the status code, so neither a human nor a script could act on it. Both were
documented as known limitations on three separate documents rather than fixed
(`external-kb.mdx`, the scaffolded KB README, the seed skill).

The same story (#396, consolidating #397) made `install --source` honour the source KB's
own `pair.config.json`, which introduces a second reason a registry may not be installed:
the source declares one this CLI has no definition for.

## Decision

**Install classifies every registry as `ok`, `skipped` or `failed`, and derives the exit
code from that same tally.**

- **Absent is not failed.** A registry the source does not contain is `skipped` with the
  reason `not shipped by this source`. It is named in the summary, never counted as a
  failure, and never affects the exit code.
- **`skipped` never masks a real failure.** A registry that IS shipped and breaks stays
  `failed`, is reported with its error, and makes the command exit non-zero.
- **One broken registry does not abort the ones after it.** A per-registry error is caught,
  reported, and carried out through the exit code, instead of throwing past the summary.
  The reader gets the whole picture in one run rather than one failure at a time.
- **Exit code = f(tally), computed once**, and published as such in the CLI's Exit Code
  Contract (`reference/specs/cli-contracts.mdx`) — `1` is no longer "validation error"
  alone for these two commands. Non-zero when anything failed, **or** when the
  run installed nothing at all (a source that ships nothing installable is a no-op, and
  "success" is the wrong answer to it). Zero otherwise, including with any number of
  skips.
- **The summary text and the log line are built from the same tally AND the same verdict**
  (`ui/summary.ts`), so the three renderings — console headline, detail lines, diagnostics
  log — cannot drift apart or from the status code. The log line says
  `finished with errors` / `did nothing` / `complete` exactly as the headline does; a log
  line reading `complete` for a failed run is the same disagreement one channel down.
- **A no-op is REPORTED, not thrown.** A source that ships nothing installable produces a
  summary — every registry named with its resolved source → target and its skip reason,
  `Nothing to install (0 ok, N skipped — not shipped by this source)`, exit 1 — instead of
  the pre-flight error `Dataset root has no content for configured registries` that used to
  abort before any summary existed. That pre-flight (`validateDatasetContent`) is removed:
  it made the story's own edge case reachable in unit tests and nowhere in the product, and
  its information (which paths were expected) is on screen either way, per registry. Two
  properties keep the no-op from touching the project: a registry whose source is absent is
  decided BEFORE `ensureDir`, so no empty parent directories are created, and the project
  index (`.pair/llms.txt`) is written only when something was installed.
- **A run that applied nothing records no version marker.** `recordInstalledVersion` is
  gated on `ok > 0` in BOTH commands, not only on `failed === 0`. A marker written after a
  run that changed nothing reports the project as running that KB version and silences the
  drift hint the marker exists to raise.
- **The summary is the LAST thing both commands print.** Everything that can still fail and
  roll the run back has run by then. `update` printed it inside `updateRegistries`, before
  the link transformation, the project index, the marker and the backup commit — so a
  failing post-copy step put `✓ Update complete` on screen immediately above
  `Rolling back...` and a non-zero exit, the exact text-vs-status disagreement this decision
  removes. (`applyLinkTransformation`, `writeProjectLlmsTxt` and `recordInstalledVersion`
  swallow their own errors; `BackupService.commit` does not, which is the reachable path.)
- **The exit code has to survive the process, not just the handler.** The CLI entry point
  force-exits (open HTTP handles from a KB download otherwise hang it), and Node's
  `process.exit(0)` with an EXPLICIT code overrides a previously assigned
  `process.exitCode`. `main()` therefore forwards `finalExitCode(process.exitCode)`.
  Returning the code from the handler is necessary and not sufficient: without the forward,
  every command routed through `dispatchWithExitCode` — `install`, `update`, `kb-verify`,
  `kb-info`, `kb-cache` — printed its failure and exited 0. Only a test that observes the
  REAL process can see this, so the smoke suite asserts a non-zero status on a failing
  install; unit tests see the handler's return value, which was correct all along.

## Alternatives Considered

- **Keep absent registries as failures and only fix the wording.** Rejected: the count
  itself is the lie. "3 failed" in a green-path install trains the reader to ignore the
  summary, which is what happened — the workaround was documented three times instead.
- **Treat a registry-level failure as fatal (the previous behaviour).** Rejected: it
  reports one failure per run on a command whose whole job is a batch of independent
  copies, and it hid the summary entirely — the very artifact the exit code now agrees
  with. The partial-write blast radius is unchanged either way: the throw already happened
  after some files were written.
- **Exit 0 when everything is skipped.** Rejected: a run that installed nothing looks
  identical to a successful one to any script reading only the status code, which is the
  disagreement this decision exists to remove.
- **Make the skip reason free text at each call site.** Rejected: reasons are the grouping
  key of the summary's detail lines, so they are exported constants
  (`SKIP_NOT_SHIPPED`, `SKIP_UNKNOWN_REGISTRY`); a typo would otherwise split one group
  into two.

## Consequences

- **`RegistryResult.ok: boolean` is replaced by `status: 'ok' | 'skipped' | 'failed'`**, with
  `reason` for skips. Both readers (`install`, `update`) and the presenter moved together;
  keeping `ok` alongside `status` would have created two fields that can disagree.
- **The contract is the same for `install` and `update`** — the outcome model, the exit
  code, and the source-KB declaration (see the sibling ADL). Both skip a registry the source
  does not ship, both return an exit code, and both are dispatched through
  `dispatchWithExitCode`, like the `kb-*` commands already were. Neither command's status
  code is "0 unless it threw" any more, and `pair update --source <external KB>` no longer
  reports registries the source does not ship as updated.
- **The FAILURE PATH, however, is deliberately not shared.** `install` continues past a
  broken registry and carries the failure out in the tally; `update` keeps its
  rollback-then-rethrow semantics, so a per-registry error propagates out of
  `updateRegistries`, restores the backup and rethrows. A partial update therefore never
  reaches the version marker at all, and update's exit code can only be 1 through the no-op
  branch (`total > 0 && ok === 0`), never through `failed > 0`. Update therefore guards the
  marker on `ok > 0` only — a `failed === 0` guard there would read as continue-on-failure
  parity the command does not have.
- **`update`'s user-visible exit code changed** and is documented as such in
  `external-kb.mdx`: a source shipping none of the installed registries now exits non-zero
  where it used to exit 0.
- **A partial run — and an empty one — records no version marker.**
  `recordInstalledVersion` is skipped when anything failed OR when nothing was installed:
  a `.pair/.kb-version.json` written in either case says the KB is fully installed,
  silencing the drift hint while content is missing and leaving the re-run to abort on
  "target already exists".
- **Behaviour change pinned by an existing test that had to be amended**: a flatten name
  collision no longer rejects out of the handler — it is reported as a failed registry with
  the collision message and exit 1. The guarantee the old test asserted (install does not
  silently succeed, the collision is named) is preserved; what changed is the channel.
- **The three documents that described the workaround are part of this change**, not a
  follow-up: a reader applying a workaround to a fixed defect is worse served than one
  reading about a real one.
- **The per-registry steps the two commands share are one module** (`commands/registry-run.ts`:
  `finalizeRegistryCopy`, `reportNotShipped`, `declaredButUnknownResults`). The loops stay
  separate because the failure paths differ; only what must not drift is shared. Extracted
  here rather than left as a third round of copy-paste between the two handlers.
- The scaffold-kb smoke scenario now asserts the green summary, a non-zero PROCESS exit on a
  failing install, and fails if absent registries are reported as errors again — the defect was invisible to unit tests for a
  release because nothing exercised the summary end to end.

## Adoption Impact

- No `tech/` adoption file changes: this decides how our own CLI behaves, not what the
  project adopts.
- `apps/website/content/docs/customization/external-kb.mdx` — the "counted as failed"
  caveat is replaced by the real output.
- Sibling record: the source-declaration precedence this story also introduces — and the
  trust boundary it opens — is decided in
  [2026-08-20-source-kb-declaration-is-validated-not-trusted.md](2026-08-20-source-kb-declaration-is-validated-not-trusted.md)
  and documented for users in `apps/website/content/docs/reference/configuration.mdx`
  (Resolution Order), where the config schema lives.
