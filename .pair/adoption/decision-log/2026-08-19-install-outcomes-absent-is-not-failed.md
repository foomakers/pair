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
- **Exit code = f(tally), computed once.** Non-zero when anything failed, **or** when the
  run installed nothing at all (a source that ships nothing installable is a no-op, and
  "success" is the wrong answer to it). Zero otherwise, including with any number of
  skips.
- **The summary text and the log line are built from the same tally** (`ui/summary.ts`), so
  the three renderings — console headline, detail lines, diagnostics log — cannot drift
  apart or from the status code.

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
- **`handleInstallCommand` returns the exit code** and the dispatcher routes it through
  `dispatchWithExitCode`, like the `kb-*` commands already did. The command is no longer
  the only one whose status code is "0 unless it threw".
- **Behaviour change pinned by an existing test that had to be amended**: a flatten name
  collision no longer rejects out of the handler — it is reported as a failed registry with
  the collision message and exit 1. The guarantee the old test asserted (install does not
  silently succeed, the collision is named) is preserved; what changed is the channel.
- **The three documents that described the workaround are part of this change**, not a
  follow-up: a reader applying a workaround to a fixed defect is worse served than one
  reading about a real one.
- The scaffold-kb smoke scenario now asserts the green summary and fails if absent
  registries are reported as errors again — the defect was invisible to unit tests for a
  release because nothing exercised the summary end to end.

## Adoption Impact

- No `tech/` adoption file changes: this decides how our own CLI behaves, not what the
  project adopts.
- `apps/website/content/docs/customization/external-kb.mdx` — the "counted as failed"
  caveat is replaced by the real output.
- Sibling record: the source-declaration precedence this story also introduces is
  documented in `apps/website/content/docs/reference/configuration.mdx` (Resolution
  Order), where the config schema lives.
