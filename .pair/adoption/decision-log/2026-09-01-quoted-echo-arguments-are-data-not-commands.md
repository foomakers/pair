# Decision: a workflow guard reads a quoted `echo` argument as data, never as a command

## Date

2026-09-01

## Status

Active

## Category

Convention Adoption

## Context

`.github/workflows/format.yml` (#413) has to satisfy two rules that name the same
literal:

- **AC1** — a failing check must print the remedy, and the remedy is `pnpm format`.
- **AC6 / ADL 2026-07-31** — no step reachable from the gate may WRITE, and
  `pnpm format` expands (through the root scripts) to `prettier:fix`, a writer.

The write-mode scan is a text scan over `run:` blocks, expanded transitively against
the root `package.json` scripts, shared with the pre-push guard next door
(`findWriteModeFormatters` + `expandScriptReferences`). Measured on the shipped
guard before this decision:

| `run:` text | guard verdict |
| --- | --- |
| `pnpm format:check \|\| { echo "... Run pnpm format ..."; exit 1; }` | `ok=false` — "reaches 1 step(s) that WRITE files: prettier:fix" |
| same line with the literal `pnpm format` removed from the message | `ok=true` |

So the guard rejected the obvious spelling of the remedy, and the workflow shipped
with no remedy at all: the CI run for commit `888391cc` printed the offending path
(`packages/dev-tools/src/quality-gates/__fixture-t3/unformatted.ts`) and nothing a
contributor could act on.

## Decision

For the format-workflow guard, a **quoted argument to `echo`/`printf` is data** and
is removed from the text before the "what does this step run" scans (the
`format:check`-is-invoked rule and the write-mode rule). Everything else — the whole
of an unquoted command, and any other step — is still scanned as a command.

The exemption is bounded by execution, not by punctuation: a quoted string
containing `$` or a backtick can still execute (`echo "$(prettier --write .)"` really
does write), so those quotes are **not** stripped. The `${{ … }}` injection scan
reads the raw, unstripped text on purpose — `echo "${{ github.event.pull_request.title }}"`
is the classic sink precisely because it is quoted and echoed.

A separate rule then REQUIRES the remedy: at least one step with an `if:` naming
`failure()` must mention `pnpm format` (word-bounded, so `pnpm format:check` does not
satisfy it).

## Alternatives Considered

- **Word around it in the workflow** (say "run the repo formatter" and never spell
  `pnpm format`): the message stops being copy-pasteable, which is the entire value of
  naming the remedy, and the next author who writes the real command gets a confusing
  gate failure.
- **Exempt the whole `Explain how to fix it` step by name**: a guard keyed on a step's
  NAME is defeated by renaming the step, and it would exempt that step's real commands
  too.
- **Parse the shell** (a real POSIX parser to separate words from operators): correct,
  and out of proportion for a twenty-line workflow — the same trade-off already recorded
  for `stripComments` in this module.
- **Apply the same relaxation to `pre-push-gate-composition`**: not done. That guard
  scans `package.json` script bodies, where there is no equivalent need — a script does
  not print a remedy — and widening a security-adjacent scan with no driving case is how
  the two copies drift.

## Consequences

- The format workflow can print `pnpm format` on the failure path (AC1 satisfied) while
  the write-mode ban stays enforced: `run: pnpm format` still fails the guard, and so
  does `echo "$(prettier --write .)"`.
- A guard asymmetry now exists between the two modules in
  `packages/dev-tools/src/quality-gates/`: the format-workflow guard strips inert quoted
  messages, the pre-push guard does not. Deliberate, and stated here so a later reader
  does not "fix" it by copying the relaxation across.
- Residual gap, same class as the one ADL 2026-07-31 records for the offender list: an
  inert-looking quoted string that a future shell feature makes executable would be
  skipped. Bounded by the `$`/backtick exclusion, which covers every substitution form
  POSIX sh has.

## Adoption Impact

None. This is guard-internal scanning semantics for one module; it changes no adopted
tool, process or gate composition. `adoption/tech/way-of-working.md` already lists
`format` in the required-check inventory (#413) and needs no edit — the check's identity,
trigger and command are unchanged.
