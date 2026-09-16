# Decision: a gate's remedy is a command its audience can run, and the remedy refuses the states its own caution warns about

## Date

2026-09-03

## Status

Active

## Category

Tooling Preference

## Context

`pnpm llms-index:check` (#416) closed every drift report with **"Regenerate with
`pair update` and commit the result."** No `pair` executable exists for that message's
audience:

- `which pair` → not found.
- No `pair` entry in any workspace `node_modules/.bin`; `apps/pair-cli/package.json`
  declares `bin: { "pair-cli": "dist/cli.js" }`, and `README.md` invokes the CLI as
  `npx @foomakers/pair-cli install`.
- No root `package.json` script named `pair`.

The audience is exactly this repository's contributors — `@pair/dev-tools` is
`private: true` and the gate ships in no dataset — so there is no second reading under
which the string resolves.

**Concrete failure.** A contributor adds `.pair/knowledge/guidelines/x.md`,
`pnpm quality-gate` goes red printing that sentence, they type it, and the shell answers
`command not found`. AC-5 of the story ("the failure message alone is enough to fix the
problem") is unmet at the last paragraph, which is the one a contributor scanning for
the fix acts on.

**Resolving it to the nearest real binary is worse than the error.** `pair-cli update`
with no `--source` parses as `resolution: 'default', offline: false`
(`apps/pair-cli/src/commands/update/parser.ts`) and installs the **published** knowledge
base over `.pair/knowledge/**` — reverting the very guideline whose addition reddened
the gate. The PR's own probe table never ran the printed string; it ran
`pair-cli update --offline --source <dataset>`, a different command.

The same mistake is already on record: ADL
[2026-07-31-pre-push-gate-is-check-only.md](./2026-07-31-pre-push-gate-is-check-only.md),
"Resolved Decision (2026-08-05)" — *"The remedy was naming the wrong command …
`pair update` … resolves and installs the published KB; what a mirror divergence needs is
regeneration from the local dataset"*. Its part 2 is "the gate names that command in its
remedy, in all three places, replacing `pair update`". Printing `pair update` in a fourth
place, plus in `DEVELOPMENT.md` and its docs-site twin, re-opened a decision that was
already taken.

**Why not simply reuse #419's command.** Story #419 owns that dedicated command
(`pnpm mirrors:regenerate`, `scripts/regenerate-mirrors.sh`), and it is an **unmerged
in-flight branch** — a gate cannot print a command that is not in the tree. It is also
oversized for this failure: by #419's own description it wraps
`pair-cli update --source <dataset> --offline`, which rewrites `.pair/knowledge/**`,
`.claude/**`, `AGENTS.md`/`CLAUDE.md` and `.github/**`, **deletes** target-only files
under a `mirror`-behaviour registry (an untracked `.pair/knowledge/wip-draft.md` does not
survive the run), and requires a built CLI. Handing that blast radius to someone whose
only problem is a stale 562-line index is not a remedy, it is a trap.

## Decision

**A gate's printed remedy names a command that exists in this repository, and that
command refuses every state the gate's own cautions say not to regenerate on.**

Realized as `pnpm llms-index:regen` → `pnpm --filter @pair/dev-tools llms-index:regen` →
`ts-node -T packages/dev-tools/src/quality-gates/llms-txt-regenerate.ts`.

1. **It is the check's exact inverse, and nothing more.** The same `generateLlmsTxt` over
   the same tree, written to the same `TRACKED_INDEX_PATH` constant the check reads. It
   writes **one file**, `.pair/llms.txt`. Transpile-only for the same reason the check is
   (`-T`): it compiles a source file from `apps/pair-cli`, and a remedy that dies with
   `TS2307` on a fresh `pnpm install` is no remedy.
2. **It refuses rather than regenerates when the check's message carries a
   precondition.** The report's call to action reads "Once the checkout is normalized to
   LF …" / "Once the tree is complete …" precisely because on those states regenerating
   either cannot work (git rewrites the terminators straight back) or destroys what the
   caution protects (a sparse checkout's absent section, committed as a deletion). So the
   command runs the CHECK first and writes only on the verdict "stale index, complete,
   readable tree"; every other outcome is reported with the gate's **own message** —
   never a second wording — and exits 1. The refusal set is closed over `DriftReport`:
   `broken-setup`, `unreadable-index`, an unreadable tree, `trackedCarriesCr`, and
   `emptiedSections`. `trackedCarriesBom` is deliberately NOT in it: regeneration is the
   fix for a BOM.
3. **It is on the write-mode offender list.** `llms-index:regen` and
   `llms-txt-regenerate` are entries in `pre-push-gate-composition`'s
   `WRITE_MODE_FORMATTERS`, per the standing rule that adding a write script to this repo
   means adding it to that list. The coupling is sharper here than for the other writers:
   this script is the remedy the gate prints, and a gate that ran its own remedy would
   silently fix the drift it exists to reveal.
4. **The assertion on the remedy is on the string's CONTENT, not on the constant.** The
   suite's AC-5 test asserted `result.message).toContain(REGENERATION_COMMAND)` — the
   constant compared against itself, green for any value it could hold, which is how
   `pair update` passed a 110-case suite and five manual probe tables. It now asserts the
   literal a contributor types, and a second test resolves that literal's script name
   against the **real root `package.json`** (the same technique `pre-push-gate-composition`
   uses for `pnpm format`), so a renamed or deleted script reddens here instead of in
   someone's shell.

**This does not pre-empt #419.** The two commands are complementary and differently
scoped: `mirrors:regenerate` realigns the dataset mirrors and is what the mirror-equality
guards name; `llms-index:regen` regenerates the one byte-compared index this gate
compares. When #419 merges, `mirrors:regenerate` will also rewrite `.pair/llms.txt` as a
side effect of running the real update transform — that is a superset, not a conflict,
and whether this gate should then point at it is a decision for that merge, not for this
one.

## Alternatives Considered

- **Point the remedy at `pair-cli update --offline --source packages/knowledge-hub/dataset`
  (the reviewer's literal recommendation, wrapped in a root script).** Rejected on blast
  radius, not on shape: by #419's own measurement that command deletes untracked
  target-only files under the `mirror` registries and rewrites four trees. Telling a
  contributor to run it because an index line is stale makes the advice unsafe to obey
  blindly, which is the property the whole finding is about. It also needs a built CLI
  (`turbo run build --filter=@pair/pair-cli...`), reintroducing the build dependency `-T`
  was chosen to remove.
- **Wait for #419 and print `pnpm mirrors:regenerate`.** Rejected: it is unmerged, so the
  gate would ship naming a command not in the tree — the same defect in a new spelling.
- **Keep a CLI-shaped string but spell it `pair-cli update`.** Rejected: `pair-cli` is not
  on `PATH` either (it is a published `bin`, not a workspace one), and without `--source`
  the command installs the published KB over the local one.
- **Drop the command from the message and describe the fix in prose.** Rejected: the
  reason the command is named at all is that a report without one teaches contributors to
  hand-edit the artifact, which is how it went stale twice.
- **Let the remedy regenerate unconditionally and rely on the printed caution.** Rejected:
  the caution is a paragraph above the imperative, and the failure mode this whole gate
  was shaped around is a contributor acting on the LAST paragraph. A command that
  cheerfully commits the deletion of a section on a sparse checkout is the caution's own
  damage, delivered by the fix.

## Consequences

- Two new root/package scripts (`llms-index:regen`), one new module
  (`packages/dev-tools/src/quality-gates/llms-txt-regenerate.ts`) and its suite
  (11 rows: the write path, idempotence, BOM strip, and one row per refusal state).
- `REGENERATION_COMMAND` is `pnpm llms-index:regen`. Every place that quoted the old
  string moved with it: the gate's cautions and call to action, `DEVELOPMENT.md`, its
  docs-site twin `development-setup.mdx`, the `way-of-working.md` gate entry, and the
  suite's comments.
- `WRITE_MODE_FORMATTERS` grows by two entries, with a test asserting the check beside it
  (`llms-index:check`) is NOT matched — the `:regen` suffix is the whole discriminator.
- The gate and its remedy can no longer disagree about a state: both read the same
  `DriftReport`, and the refusal branches print the check's message verbatim.
- Verified end to end in the repo itself: with `.pair/llms.txt` deliberately drifted,
  `pnpm llms-index:check` printed the message, the printed command was typed verbatim,
  and the re-run gate went green with `git status` clean.

## Adoption Impact

- [way-of-working.md](../tech/way-of-working.md) — the "KB index drift" Quality Gates
  entry names `pnpm llms-index:regen`, states that the remedy is on the write-mode
  offender list, and records why it is neither `pair update` nor a mirror realignment.
- [DEVELOPMENT.md](../../../DEVELOPMENT.md) and its published twin
  `apps/website/content/docs/contributing/development-setup.mdx` — the quality-gate
  paragraph names the new command in both copies (the two are kept byte-identical for
  that paragraph, per the pre-push ADL's consequence).
- `packages/dev-tools/README.md` — the tools table gains the `llms-index:regen` row.
- No `tech-stack.md` change: no dependency enters or leaves.
- No ADR: this is a remedy-naming and tooling convention, not a boundary or a pattern.
