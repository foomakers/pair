# Decision: the format-workflow guard PARSES `format.yml` with `yaml@2.8.2`, and every rule is an allow-list over the parsed document

## Date

2026-09-01 (amended 2026-09-03)

## Status

Active (amended 2026-09-03 — the decision this file recorded on 2026-09-01, "the guard REJECTS
the YAML spellings it cannot read", is **superseded in place**: the parser migration it listed as
a costed follow-on is TAKEN, and **has landed in PR #477** — the module imports `yaml@2.8.2`,
`@pair/dev-tools` declares the catalog entry, the line reader and the four spelling-rejection rule
families are deleted, and the suite is migrated. The superseded text is kept below, marked as
superseded. Filename unchanged deliberately — history, the way-of-working link and the
`.pair/llms.txt` entry point at this path.)

## Category

Convention Adoption

## Context

`packages/dev-tools/src/quality-gates/format-workflow-composition.ts` asserts the shape of
`.github/workflows/format.yml`. Until this decision it used a hand-rolled line reader
(`blockUnder` collects the lines indented deeper than a key; `listValueOf`, `scalarAt`, `keysAt`,
`stepsOf`, `withoutBlockScalars` read inside it) that understood a subset of YAML — a subset that
moved every time a reviewer measured it. The evidence is kept in full; on 2026-09-03 only the
conclusion changed.

### Round 5 — the reader failed OPEN on flow mappings (mapping-KEY position)

A flow mapping sits on its key's line, so it yields an EMPTY block; `listValueOf` returns `null`,
which for a trigger filter means "no filter". Four valid one-line edits GitHub honours left
`checkFormatWorkflow` returning `ok=true` (measured, PR #477 review round 5):

- `pull_request: { branches: [main], paths-ignore: ['**/*.md'] }` — a markdown-only PR runs no
  formatting check;
- `pull_request: { branches: [release] }` — no PR targeting `main` is checked and the `format`
  context never reports;
- `pull_request: { branches: [main], types: [closed] }` — runs only once the PR is closed;
- `push: { branches: [release] }` — post-merge drift on `main` invisible (AC7).

Anchors, aliases and merge keys (`pull_request: *filters`, `<<: *filters`, `- *step`) are the same
class, and an alias under `steps:` hides a whole step from the write-mode scan.

### Round 6 — the same class in YAML's OTHER node position (sequence ITEM)

Round 5 rejected unreadable spellings on mapping KEYS only. `- { name: Fix, run: npx prettier --write . }`
is a step GitHub executes; `stepsOf` accepts it, but `scalarAt(step, 'uses', …)` and
`extractRunBlocks` want their key at line start, so the step was invisible to `usesProblems` and
the write-mode scan. Measured `ok=true` on each of `- { name: Fix, run: npx prettier --write . }`,
`- {run: prettier --write .}`, `- { uses: creyD/prettier_action@v4 }`,
`- { uses: stefanzweifel/git-auto-commit-action@v5 }`, the JSON spelling, `- [a, b]`,
`- &fixer run: …` and a bare `-` with the node on the next line. Placed before the checking step,
each rewrites the checkout and `pnpm format:check` passes on unformatted code — the AC6 loss.

### Rounds 12–14 — the reader failed CLOSED, five times, on CORRECT workflows

With the rejection bound in place the failures inverted — each a spelling GitHub resolves
identically to the shipped one, measured:

- **Round 12** — an **indentless** block sequence (`branches:\n- main`, `steps:\n- name: …`)
  parses identically to the indented form (`yaml@2.8.2`) and is honoured by GitHub (probe run on
  PR #477); the reader reported "does not cover `main` (no branch)" and "no failure-path step
  names the remedy". A filter-level alias (`branches: *shared`) was reported as "no branch" — the
  wrong cause.
- **Round 13** (probe [run 33676806439](https://github.com/foomakers/pair/actions/runs/33676806439)
  on PR #477) — quoted `run: "pnpm format:check"` (red, "runs `\"pnpm format:check\"`"); CRLF line
  endings (red, wrong cause, "spells `on:` as a list of events"); workflow-level `permissions:`
  with none on the job (red, "declares no `permissions:`" — the token log shows the job inherits
  the workflow scope, and a job's own block replaces it).
- **Round 14** — `isSetupCommand` did not `unquote` while `normalizeCommand` (same round-13 commit)
  did: `run: "pnpm install"` went red with the "toolchain install" cause.

Each was patched in place, one line at a time, as each finding recommended: nine measured
instances across five rounds, in **both** directions. The recurring property: the guard
re-implements a YAML reader, and the re-implementation is never finished.

ADL [2026-07-29](./2026-07-29-yaml-parser-for-generated-yaml-tests.md) already adopted `yaml@2.8.2`
and rejected hand-rolled YAML checkers: "a parser written to the same (mis)understanding as the
generator validates nothing" — read for a guard, a reader written to the rule set's understanding
asserts only what its author imagined.

## Decision

**The guard PARSES `.github/workflows/format.yml` with `yaml@2.8.2`, and expresses every rule as an
allow-list over the parsed document. The hand-rolled line reader is retired.**

**This has landed** (PR #477); each clause below now describes the shipped module:

- **One parse, at the top.** A parse error is itself a reported problem, so an unparseable file is
  red — the superseded decision's fail-closed direction survives, enforced by the parser.
- **Every rule reads nodes, not lines.** `blockUnder`, `listValueOf`, `scalarAt`, `keysAt`,
  `stepsOf`, `withoutBlockScalars`, `isIndentlessItem`, `blockItems` and their callers are deleted.
- **The four spelling-rejection rule families go with the reader** — `flowStyleProblems`,
  `relocationProblems`, `aliasProblems`, `eventListProblem`. Flow mappings, JSON-spelled steps,
  indentless sequences, anchors, aliases and merge keys are resolved by the parser to the same
  document GitHub runs, so they are READ and subject to every semantic rule.
- **Every SEMANTIC rule survives over the parsed document, and stays an ALLOW-LIST.** Trigger set
  and filters (`paths`/`paths-ignore` banned, base branch, `types`, `branches-ignore`, tags-only
  `push`, `pull_request_target`); `concurrency.group` keyed on the ref and `cancel-in-progress`
  scoped to `pull_request`; `permissions` at both levels with no write scope; job identity — the
  host job, its display name, no `strategy:`, no `needs:`, no `if:`, no `defaults:`; the step
  allow-lists — `uses:`, the checkout's `with:` inputs, the checking-command EQUALITY on
  `pnpm format:check`, the remedy's scope-and-`decides()` contract, and `SETUP_COMMAND_LINES`; and
  the write-mode formatter/auto-commit ban. None relaxed: an equality stays an equality, on the
  resolved value.
- **`run:` bodies stay shell, not YAML.** The parser hands each `run:` scalar over as a string and
  `extractRunBlocks`' consumers scan it as shell — the boundary `withoutBlockScalars` hand-
  maintained. (`#` comments in that body are still stripped quote-aware — the SHELL's rule; YAML
  comments never reach it.)

**One clause of this contract was WRONG, and the boundary probe corrected it.** Merge keys are
not "resolved by the parser to the same document GitHub runs", in either direction: `yaml@2.8.2`
leaves `<<` unmerged by default (a literal `<<` key), and GitHub **refuses to run the file** —
probe run [33724280781](https://github.com/foomakers/pair/actions/runs/33724280781) on PR #477, a
`jobs:` block using `<<: *base`: zero jobs, "invalid workflow file". So `<<` stays rejected, by the
job/workflow key allow-list, with the producer's verdict behind it. The same series settled the
rest empirically — flow trigger mapping
([33724282425](https://github.com/foomakers/pair/actions/runs/33724282425)), anchors
([33724282478](https://github.com/foomakers/pair/actions/runs/33724282478)), an alias DECIDING a
trigger ([33724282535](https://github.com/foomakers/pair/actions/runs/33724282535)), a JSON step
([33724282504](https://github.com/foomakers/pair/actions/runs/33724282504)) and a job-level `env:`
reaching a step ([33724282486](https://github.com/foomakers/pair/actions/runs/33724282486)) all
RAN; an unknown top-level key
([33724281525](https://github.com/foomakers/pair/actions/runs/33724281525)) was rejected with the
merge key. The allow-lists agree with the producer on every row.

- **The test suite migrates with the module, it is not rewritten.** A mutation that was RED stays
  RED with the same cause. Cases asserting the REJECTION of a legal spelling INVERT — a flow
  trigger mapping, a JSON step, an anchored `cancel-in-progress`, an aliased `branches:`, a CRLF
  file, a quoted `run:` go GREEN, with the semantic rule still enforced on the resolved value
  (`pull_request: { branches: [release] }` stays RED — for being off the base branch, not for
  being flow).

**Why now, and on whose authority.** The superseded version's flip trigger — "anything that still
fails OPEN, or the first rule needing real structure (nested `with:`, matrix jobs)" — **FIRED at
round 12**, when the guard gained a `with:` rule for the checkout's inputs, but that version left
the consequence as "the human's call at the merge gate". The maintainer made that call at the
merge gate on **2026-09-02 and again on 2026-09-03**: take the migration, in this PR. Recorded as
taken and binding so no later reading re-derives "defer" — that framing produced two rounds of
re-deferral against a decision already made.

### Superseded — the decision recorded here on 2026-09-01 (reject rather than parse)

**No longer in force.** Kept in substance, because it is what shipped between rounds 5 and 14:

> ~~The guard **rejects** any spelling it does not read, rather than parsing it or defaulting it to
> "absent".~~ Concretely, on **both** of YAML's node positions: ~~every structural KEY it reads as a
> block (`on`, each trigger under `on`, `concurrency`, `jobs`, each job, `steps`) must carry a BLOCK
> value — nothing after the colon on its own line; every sequence ITEM it walks into must be a BLOCK
> MAPPING (`- key: value`) or a plain scalar (`- main`, under a trigger filter). `- {`, `- [`,
> `- *alias`, `- &anchor` and a bare `-` are rejected — the contents of `steps:` are read by walking
> into each item, so an item the reader cannot follow is a whole step out of view. Anchors, aliases
> and merge keys are rejected anywhere in the file.~~
>
> ~~And "block style" means what YAML means by it: an **indentless** block sequence is block style
> and is read (round 12). The bound: a spelling the reader cannot follow is rejected by name; a
> spelling it can follow is read.~~
>
> The part that SURVIVES the supersession, because it was never about the reader: **the guard's
> incompleteness must fail CLOSED**, and the module's rules are ALLOW-LISTS, not deny-lists —
> `if:`, `uses:`, `with:`, the checking command, the setup commands. Each is a narrow canonical
> spelling; everything else is a deliberate edit to the guard. The parser changes what "a spelling
> the guard can follow" means; it does not license a deny-list.
>
> ~~The bound is deliberate: spellings the reader DOES read correctly stay accepted — `branches:
> [main]`, `permissions: { contents: read }`, and the body of a `run:` block scalar. A guard that
> fails a correct workflow is the kind that gets weakened or deleted.~~ The last sentence stands on
> its own terms, and rounds 12–14 are five instances of the guard doing exactly that.

## Alternatives Considered

- **Keep the hand-rolled reader under the "reject what you cannot read" bound** (the superseded
  2026-09-01 decision): **rejected on 2026-09-03**, after nine rounds as the adopted decision. It
  closed the fail-open class at the cost of five fail-closed findings of its own (rounds 12–14) and
  a reader extended for every new spelling. Its trade — ~~"the parser migration is a known, costed
  follow-on rather than an open hole"~~, ~~"what remains open is a judgement the human makes at the
  merge gate, not a new card"~~ — is **superseded**: the judgement was made, the migration lands in
  this PR. Audit trail of how the call was reached, struck rather than deleted:

  - ~~**Round 6**: the round-5 trigger ("the NEXT finding of this class") fired and was answered by
    closing the second node position instead of migrating, because that is what the finding
    recommended.~~
  - **Rounds 7–9 did not fire it.** Their findings were RULE gaps — semantics GitHub defines (a
    tags-only `push` filter fires for tag refs only; `concurrency.group` must be keyed on the ref;
    the check context is the job's DISPLAY name, so `name:` and a matrix rename it) — read
    correctly by the line reader and unasserted. **This survives the supersession and bounds what
    the migration buys**: a parser would have caught none of them. Round 13's
    `SETUP_COMMAND_LINES` (the last deny-list, replaced by a toolchain allow-list) is the same kind.
    Parsing closes the spelling class, nothing in the rule class.
  - ~~**Round 12, for the human at the merge gate**: the trigger text names "nested `with:`" as a
    flip condition and round 12 added a `with:` rule; whether that counts as the trigger firing is
    recorded as the human's call.~~ **It counted.**
  - ~~**Round 13, for the same human**: three more reader false-fails, patched in place because
    each was one line. The call stays where round 9 put it: accept the line reader, or require the
    `yaml@2.8.2` migration before merge.~~ **The call is made: require the migration.**
- **Defer the migration to a follow-up card**: rejected. Per ADL
  [2026-08-12](./2026-08-12-implementation-never-files-a-card-it-extends-the-story.md),
  implementation extends the story; deferring would ship the guard on the reader whose
  incompleteness is why the rules exist, with the trigger already fired.
- **Teach `blockUnder` to parse flow mappings**: rejected — a second reader to keep in step; the
  next unknown spelling fails open again. Exactly the "hand-rolled checker" ADL 2026-07-29
  rejected.
- **Parse block style only and pattern-match the flow spelling into existing rules** (e.g. widen
  the `paths`/`paths-ignore` regex to drop its `^\s*` anchor): rejected — fixes the one key a
  reviewer named, leaving `branches`, `types` and future trigger keys reading as "no filter".
- **A different parser (`js-yaml`, a GitHub-Actions-specific schema validator)**: rejected —
  `yaml@2.8.2` is already the adopted parser (ADL 2026-07-29) and a catalog entry. An Actions
  schema validator asserts the file is a valid workflow, nothing about this guard's properties.

## Consequences

- **Tech-stack impact: `yaml` gains a second consumer.** `@pair/dev-tools` declares
  `"yaml": "catalog:"` (the catalog already pins `yaml: 2.8.2` in `pnpm-workspace.yaml` for
  `apps/pair-cli`): no new package resolved, the lockfile delta is a workspace entry. Dev-only:
  `@pair/dev-tools` is `private: true` and the module runs under `ts-node` from
  `format-workflow:check` and `pnpm test`. This widens ADL 2026-07-29's rule ("generated YAML is
  asserted by parsing") to its mirror image: **consumed YAML is asserted by parsing too**.
- **The module is expected to shrink** — 1984 lines at `37cf84b4`, minus the reader helpers and
  the four rule families. An expectation, not an acceptance criterion: the criterion is that every
  semantic rule keeps its mutation test and every RED mutation stays RED.
- **A correct workflow stops being red for its spelling.** Flow style, anchors, merge keys,
  indentless sequences, CRLF and quoted scalars are the contributor's choice again; the workflow
  header comment and module header no longer advertise a block-style requirement.
- **The class that closes is "spelling X is invisible / spelling X false-fails".** The class that
  remains is a MISSING RULE (rounds 7–9, round 12's rule gaps, round 13's setup-command
  allow-list), which no parser prevents — why the allow-list discipline is carried forward.
- **The migration's risk is carried by the test suite**, hence migrated rather than rewritten: 321
  tests over the shipped workflow and its mutations before; measured after: 362 tests, every RED
  mutation still RED with the same cause, legal-spelling rejections inverted to GREEN with the
  semantic rule asserted on the resolved value.
- **An allow-list over ELEMENTS is not an allow-list over the VALUE** (added 2026-09-03, review
  round 17). `runs-on` accepted any sequence of allow-listed labels, but GitHub **ANDs** a list's
  labels and no hosted image carries two image labels, so `[ubuntu-latest, ubuntu-22.04]` names NO
  machine: probe run [33782665948](https://github.com/foomakers/pair/actions/runs/33782665948) on
  PR #477 left `d8-two-ubuntu` and `d8-three-ubuntu` `queued`, never started, while
  `[ubuntu-latest]` and `[ubuntu-latest, ubuntu-latest]` (GitHub dedupes) completed. The rule now
  COUNTS: exactly one label. Deliberately narrower than the producer on one measured row — the
  duplicate-label spelling runs on GitHub and is rejected here, the one place this module fails a
  workflow GitHub would honour — accepted because it is a false RED naming the one-label spelling,
  never a false green, and dedupe-before-counting buys a spelling nobody writes at the cost of a
  second acceptance path.
- **Two surfaces became allow-lists in the same change, both the "relocation" shape.** (a) The
  WORKFLOW's own keys and every JOB's, because a job-level `env:` reaches the checking step
  whatever the step allow-list says: measured end to end, `NODE_OPTIONS=--require=<one-line shim>`
  makes the repo's pinned prettier 3.6.2 print the offending filename and exit **0**, so
  `pnpm format:check` names the file and `format` reports SUCCESS on unformatted code — the
  `with: ref: main` loss class spelled as a job key. `container:`/`services:` are the `uses:`
  third-party-code argument one level up. (b) The REMEDY's shell, the last deny-list: a formatter
  no offender list names (`npx dprint fmt`) and a `git commit -am style && git push` beside the
  required message were both green. The remedy's shell is now quoted `echo`/`printf` only. With
  those two, the module header's claim that every surface is an allow-list is true.

## Adoption Impact

- `.pair/adoption/tech/way-of-working.md` — the `format` required-check bullet listed "the
  block-style requirement" among asserted properties. **Edited**: replaced by the key allow-lists;
  the ADL reference states the guard parses and an unparseable file is itself a problem.
- `.pair/adoption/tech/tech-stack.md` — the `yaml v2.8.2` entry read "(devDependency) for parsing
  generated YAML in tests". **Edited**: covers YAML this repo generates OR consumes and names both
  declaring packages (`packages/dev-tools/package.json` declares `"yaml": "catalog:"`).
- ADL [2026-07-29](./2026-07-29-yaml-parser-for-generated-yaml-tests.md) is **extended, not
  superseded** — same parser, same argument, second consumer.
- `.pair/llms.txt` — regenerated with the production generator (the title of this record changed).
