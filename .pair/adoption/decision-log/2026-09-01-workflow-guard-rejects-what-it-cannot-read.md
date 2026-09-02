# Decision: the format-workflow guard REJECTS the YAML spellings it cannot read, instead of parsing them or waving them through

## Date

2026-09-01

## Status

Active

## Category

Convention Adoption

## Context

`packages/dev-tools/src/quality-gates/format-workflow-composition.ts` asserts the shape
of `.github/workflows/format.yml` with a hand-rolled, line-based reader (`blockUnder`
collects the lines indented deeper than a key). It understands ONE of YAML's two
spellings for a mapping.

That made every trigger rule fail **open**. A flow mapping sits entirely on its key's
own line, so it yields an EMPTY block; `listValueOf` then finds no key inside it and
returns `null`, which for a trigger filter means "no filter, therefore every value".
Four one-line edits, all valid YAML GitHub honours, left `checkFormatWorkflow`
returning `ok=true` on the shipped workflow (measured, PR #477 review round 5):

- `pull_request: { branches: [main], paths-ignore: ['**/*.md'] }` — a markdown-only PR
  runs no formatting check, asserted green by the guard whose entire reason for
  existing is that key;
- `pull_request: { branches: [release] }` — no PR targeting `main` is ever checked and
  the `format` context never reports;
- `pull_request: { branches: [main], types: [closed] }` — the check runs only once the
  PR is closed;
- `push: { branches: [release] }` — post-merge drift on `main` invisible (AC7).

Anchors, aliases and merge keys (`pull_request: *filters`, `<<: *filters`, `- *step`)
are the same class: they relocate content the line reader cannot follow, with the same
"absent ⇒ no filter" reading, and an alias under `steps:` hides a whole step from the
write-mode scan.

**Review round 6 found the same class in YAML's OTHER node position**, and it is
recorded here because it is the evidence that bounds the decision below. The first pass
rejected unreadable spellings on mapping KEYS only. A step is a sequence ITEM: `- {
name: Fix, run: npx prettier --write . }` is a step GitHub executes, `stepsOf` accepts
the line as a step, and then both readers that look INSIDE a step want their key at line
start (`scalarAt(step, 'uses', …)`, `extractRunBlocks`) and find none — so the step was
invisible to `usesProblems` and to the write-mode scan at once. Measured on the shipped
workflow, `ok=true` on each of `- { name: Fix, run: npx prettier --write . }`,
`- {run: prettier --write .}`, `- { uses: creyD/prettier_action@v4 }`,
`- { uses: stefanzweifel/git-auto-commit-action@v5 }` and the JSON spelling; also on
`- [a, b]`, `- &fixer run: …` and a bare `-` with the node on the next line. Placed
before the checking step, each rewrites the runner's checkout and `pnpm format:check`
passes on unformatted code with the `format` context green — the AC6 loss both of those
rules exist to prevent.

ADL [2026-07-29](./2026-07-29-yaml-parser-for-generated-yaml-tests.md) already adopted
`yaml@2.8.2` and rejected hand-rolled YAML checkers with an argument that lands
squarely here: "a parser written to the same (mis)understanding as the generator
validates nothing".

## Decision

The guard **rejects** any spelling it does not read, rather than parsing it or
defaulting it to "absent".

Concretely, on **both** of YAML's node positions:

- every structural KEY it reads as a block (`on`, each trigger under `on`,
  `concurrency`, `jobs`, each job, `steps`) must carry a BLOCK value — nothing after
  the colon on its own line;
- every sequence ITEM it walks into must be a BLOCK MAPPING (`- key: value`) or a plain
  scalar (`- main`, under a trigger filter). `- {`, `- [`, `- *alias`, `- &anchor` and a
  bare `-` are rejected — the contents of `steps:` are read by walking into each item,
  so an item the reader cannot follow is a whole step out of view.

Anchors, aliases and merge keys are rejected anywhere in the file — on every key the reader
touches, with a message that names the alias (round 12: `branches: *shared` had fallen
through to the list reader and was reported as "no branch", the wrong cause; it is now
`aliasProblems`' finding, once). An unsupported spelling is a reported problem, not a
vacuous pass.

And "block style" means what YAML means by it: an **indentless** block sequence (a `-` item at
the parent key's own indent — `branches:\n- main`, `steps:\n- name: …`) is block style,
parses identically to the indented form (`yaml@2.8.2`, measured) and is honoured by GitHub
(probe run on PR #477). Round 12 taught `blockUnder`/`listValueOf` to read it — the reader
was reporting a CORRECT workflow as "does not cover `main` (no branch)" and "no failure-path
step names the remedy". The bound stays: a spelling the reader cannot follow is rejected by
name; a spelling it can follow is read.

This is the direction change, not the rule count: **the reader's incompleteness fails
CLOSED**. The same shape is why the module's other rules are allow-lists — `if:` (no
condition on a job, none on the checking step, only a scoped `failure()` elsewhere),
`uses:` (the three actions the job needs), and the checking command (an equality on
`pnpm format:check`, not a mention). Each is a narrow canonical spelling; everything
else is a deliberate edit to the guard.

The bound is deliberate: spellings the reader DOES read correctly stay accepted —
`branches: [main]` (a flow sequence read by `listValueOf`), `permissions: { contents:
read }` (read inline by `permissionProblems`), and the body of a `run:` block scalar,
which is shell and not YAML at all (a line there may legitimately begin `- {` or `- [`;
`withoutBlockScalars` masks it before the line-level rules, and `extractRunBlocks` is
the reader that owns it). A guard that fails a correct workflow is the kind that gets
weakened or deleted.

## Alternatives Considered

- **Parse with `yaml` and drop the hand-rolled reader** (the reviewer's stated
  alternative, and the direction ADL 2026-07-29 points): not taken **now**, and it
  stays the right end state. It replaces every structural rule at once — indent
  arithmetic disappears and the whole class of "spelling X is invisible" goes with it
  — but it is a rewrite of the canonical module and its 190 tests, landed at review
  round 6 of a `risk:green` story whose findings' own recommendation was, both times,
  the narrow rejection.

  **The trigger written here at round 5 — "the NEXT finding of this class" — fired at
  round 6** (the sequence-item hole above), and is recorded as fired rather than
  quietly re-set. It was answered by closing the second node position instead of
  migrating, because that is what the finding recommended and because keys and sequence
  items are the whole structural surface a line reader walks: with both rejected, a
  spelling is either one the reader follows or a reported problem. What remains open is
  a judgement the human makes at the merge gate, not a new card. Anything that still
  fails OPEN, or the first rule needing real structure (nested `with:`, matrix jobs),
  flips it without further argument. `yaml@2.8.2` is already a catalog entry, so the
  cost is one devDependency line in `@pair/dev-tools`.

  **Round 12, for the human at the merge gate.** Two of its findings touched the reader,
  neither fail-open: indentless sequences and filter-level aliases were **misdiagnosed** (a
  correct file reported with the wrong cause), and both are now read or named. The other
  four were rule gaps again (`with:` inputs, `working-directory`/`defaults`, remedy
  conjuncts, anchored `cancel-in-progress`/`group`). One honest note: the trigger text above
  names "nested `with:`" as a flip condition, and round 12 added a `with:` rule — it landed
  as a key-NAME allow-list one level under `with:`, read by the same `blockUnder` + `keysAt`
  every other rule uses (no values, no nesting beyond that), so no new structure was needed.
  Whether that counts as the trigger firing is recorded here as the human's call, not
  quietly re-set.

  **Round 13, for the same human.** Three more reader false-fails on CORRECT workflows,
  each a spelling GitHub resolves identically to the shipped one (probe run 33676806439 on
  PR #477): a quoted `run: "pnpm format:check"` (red, "runs `\"pnpm format:check\"`"); the
  file with CRLF line endings (red with the WRONG cause, "spells `on:` as a list of
  events"); `permissions:` at workflow level with none on the job (red, "declares no
  `permissions:`" — the token log shows the job inherits the workflow scope, and a job's
  own block replaces it). Patched in place — `normalizeCommand` unquotes, `stripComments`
  normalises line breaks, `permissionProblems` reads both levels — because each is one
  line and the finding's recommendation offered the patch as the first option. They are
  recorded here as what they are: the third, fourth and fifth instance of the class the
  trigger names, on top of round 12's two. The same round also closed the LAST deny-list
  in the module (the shell of the non-check, non-remedy steps, now the toolchain
  allow-list `SETUP_COMMAND_LINES`) — a rule gap, not a reader gap, and one a parser would
  not have caught. The call stays where round 9 put it: accept the line reader, or require
  the `yaml@2.8.2` migration before merge.

  **Rounds 7–9 did not fire it.** Their findings were RULE gaps — semantics GitHub
  defines (a tags-only `push` filter fires for tag refs only; `concurrency.group` must
  be keyed on the ref; the check context is the job's DISPLAY name, so `name:` and a
  matrix rename it) — read correctly by the line reader and simply unasserted. A parser
  would not have caught any of them; it would delete the ~600 lines of spelling
  rejection this ADL records. Round 9 surfaced that trade explicitly for the human at
  the merge gate: accept the line reader with the trigger above, or require the
  migration before merge. That is where the call sits.
- **Teach `blockUnder` to parse flow mappings**: rejected — a second reader to keep in
  step with the first, and the next spelling neither knows fails open again. It is
  exactly the "hand-rolled checker" ADL 2026-07-29 rejected, with the failure mode this
  round measured.
- **Keep parsing block style only, and pattern-match the flow spelling into the
  existing rules** (e.g. widen the `paths`/`paths-ignore` regex to drop its `^\s*`
  anchor): rejected — it fixes the one key a reviewer happened to name and leaves
  `branches`, `types` and every future trigger key reading as "no filter".

## Consequences

- Any contributor rewriting `format.yml` in flow style — a trigger key or a step —
  gets a red `pnpm test` with a message naming the spelling and the block-style fix;
  the workflow's own header comment says so before they start.
- Anchors and merge keys are unavailable in this one file. It is ~100 lines with one
  job; nothing in it wants an anchor.
- The hand-rolled reader stays, and stays incomplete — but incomplete in the safe
  direction. The parser migration is a known, costed follow-on rather than an open
  hole.

## Adoption Impact

- `.pair/adoption/tech/way-of-working.md` — the `format` required-check bullet records
  the block-style requirement alongside the `uses:` allow-list, the exact checking
  command and the asserted job id.
- No tech-stack change: no dependency is added by this decision (the parser
  alternative, if later taken, adds `yaml` as a `@pair/dev-tools` devDependency).
