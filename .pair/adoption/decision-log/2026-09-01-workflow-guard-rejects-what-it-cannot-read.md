# Decision: the format-workflow guard PARSES `format.yml` with `yaml@2.8.2`, and every rule is an allow-list over the parsed document

## Date

2026-09-01 (amended 2026-09-03)

## Status

Active (amended 2026-09-03 — the decision this file recorded on 2026-09-01, "the guard REJECTS
the YAML spellings it cannot read", is **superseded in place**: the parser migration it listed as
a costed follow-on is TAKEN, and **has landed in PR #477** — the module imports `yaml@2.8.2`,
`@pair/dev-tools` declares the catalog entry, the line reader and the four spelling-rejection rule
families are deleted, and the suite is migrated. The superseded text is kept below, marked as
superseded, not deleted. Filename unchanged deliberately — history, the way-of-working link and
the `.pair/llms.txt` entry all point at this path.)

## Category

Convention Adoption

## Context

`packages/dev-tools/src/quality-gates/format-workflow-composition.ts` asserts the shape of
`.github/workflows/format.yml`. Until this decision it did so with a hand-rolled, line-based
reader (`blockUnder` collects the lines indented deeper than a key; `listValueOf`, `scalarAt`,
`keysAt`, `stepsOf`, `withoutBlockScalars` read inside what it collects). That reader understands
a subset of YAML — and the subset moved, round by round, every time a reviewer measured it.

The evidence below is kept in full: it is the justification for the decision, and it is what a
future reader needs in order not to re-litigate it. What changed on 2026-09-03 is only the
conclusion drawn from it.

### Round 5 — the reader failed OPEN on flow mappings (mapping-KEY position)

Every trigger rule failed **open**. A flow mapping sits entirely on its key's own line, so it
yields an EMPTY block; `listValueOf` then finds no key inside it and returns `null`, which for a
trigger filter means "no filter, therefore every value". Four one-line edits, all valid YAML
GitHub honours, left `checkFormatWorkflow` returning `ok=true` on the shipped workflow (measured,
PR #477 review round 5):

- `pull_request: { branches: [main], paths-ignore: ['**/*.md'] }` — a markdown-only PR runs no
  formatting check, asserted green by the guard whose entire reason for existing is that key;
- `pull_request: { branches: [release] }` — no PR targeting `main` is ever checked and the
  `format` context never reports;
- `pull_request: { branches: [main], types: [closed] }` — the check runs only once the PR is
  closed;
- `push: { branches: [release] }` — post-merge drift on `main` invisible (AC7).

Anchors, aliases and merge keys (`pull_request: *filters`, `<<: *filters`, `- *step`) are the same
class: they relocate content the line reader cannot follow, with the same "absent ⇒ no filter"
reading, and an alias under `steps:` hides a whole step from the write-mode scan.

### Round 6 — the same class in YAML's OTHER node position (sequence ITEM)

The round-5 pass rejected unreadable spellings on mapping KEYS only. A step is a sequence ITEM:
`- { name: Fix, run: npx prettier --write . }` is a step GitHub executes, `stepsOf` accepts the
line as a step, and then both readers that look INSIDE a step want their key at line start
(`scalarAt(step, 'uses', …)`, `extractRunBlocks`) and find none — so the step was invisible to
`usesProblems` and to the write-mode scan at once. Measured on the shipped workflow, `ok=true` on
each of `- { name: Fix, run: npx prettier --write . }`, `- {run: prettier --write .}`,
`- { uses: creyD/prettier_action@v4 }`, `- { uses: stefanzweifel/git-auto-commit-action@v5 }` and
the JSON spelling; also on `- [a, b]`, `- &fixer run: …` and a bare `-` with the node on the next
line. Placed before the checking step, each rewrites the runner's checkout and `pnpm format:check`
passes on unformatted code with the `format` context green — the AC6 loss both of those rules
exist to prevent.

### Rounds 12–14 — the reader failed CLOSED, five times, on CORRECT workflows

Once the rejection bound was in place the failures inverted: the reader started reporting
**correct** workflows red, or red with the wrong cause. Each is a spelling GitHub resolves
identically to the shipped one, and each was measured, not argued:

- **Round 12** — an **indentless** block sequence (`branches:\n- main`, `steps:\n- name: …`) is
  block style, parses identically to the indented form (`yaml@2.8.2`, measured) and is honoured by
  GitHub (probe run on PR #477); the reader reported the shipped workflow as "does not cover
  `main` (no branch)" and "no failure-path step names the remedy". A filter-level alias
  (`branches: *shared`) fell through to the list reader and was reported as "no branch" — the
  wrong cause.
- **Round 13** (probe [run 33676806439](https://github.com/foomakers/pair/actions/runs/33676806439)
  on PR #477) — a quoted `run: "pnpm format:check"` (red, "runs `\"pnpm format:check\"`"); the file
  with CRLF line endings (red with the wrong cause, "spells `on:` as a list of events");
  `permissions:` at workflow level with none on the job (red, "declares no `permissions:`" — the
  token log shows the job inherits the workflow scope, and a job's own block replaces it).
- **Round 14** — `isSetupCommand` did not `unquote` while `normalizeCommand`, added in the same
  round-13 commit, did: `run: "pnpm install"` on the shipped file went red with the "toolchain
  install" cause. A correct workflow turned red by the guard's own previous round.

Each was patched in place, one line at a time, because each finding's own recommendation offered
the patch as the first option. That is nine measured instances across five rounds, in **both**
directions — the reader is silently permissive on spellings it cannot see, and actively wrong on
spellings it half-sees. The property that keeps recurring is not any one rule: it is that the
guard re-implements a YAML reader, and the re-implementation is never finished.

ADL [2026-07-29](./2026-07-29-yaml-parser-for-generated-yaml-tests.md) already adopted `yaml@2.8.2`
and already rejected hand-rolled YAML checkers, with an argument that lands squarely here: "a
parser written to the same (mis)understanding as the generator validates nothing". The same
sentence, read for a guard rather than a generator: a reader written to the same understanding as
the rule set asserts only what its author already imagined.

## Decision

**The guard PARSES `.github/workflows/format.yml` with `yaml@2.8.2`, and expresses every rule as an
allow-list over the parsed document. The hand-rolled line reader is retired.**

**This has landed** (PR #477). The list below is the migration contract as it was written, and
each clause is now a statement about the shipped module rather than an obligation:

- **One parse, at the top.** The workflow text is parsed once with `yaml@2.8.2`. A parse error is
  itself a reported problem, so an unparseable file is red — the fail-closed direction the
  superseded decision established survives the migration unchanged, now enforced by the parser
  rather than by a rejection list.
- **Every rule reads nodes, not lines.** Indent arithmetic goes: `blockUnder`, `listValueOf`,
  `scalarAt`, `keysAt`, `stepsOf`, `withoutBlockScalars`, `isIndentlessItem`, `blockItems` and
  their callers are deleted.
- **The four spelling-rejection rule families go with the reader that needed them** —
  `flowStyleProblems`, `relocationProblems`, `aliasProblems`, `eventListProblem`. Flow mappings,
  JSON-spelled steps, indentless sequences, anchors, aliases and merge keys are resolved by the
  parser to the same document GitHub runs, so they are READ and their resolved values are subject
  to every semantic rule. They stop being problems because they stop being invisible.
- **Every SEMANTIC rule survives, restated over the parsed document, and stays an ALLOW-LIST.**
  Trigger set and filters (`paths`/`paths-ignore` banned, base branch, `types`, `branches-ignore`,
  tags-only `push`, `pull_request_target`); `concurrency.group` keyed on the ref and
  `cancel-in-progress` scoped to `pull_request`; `permissions` at both levels with no write scope;
  job identity — the host job, its display name, no `strategy:`, no `needs:`, no `if:`, no
  `defaults:`; the step allow-lists — `uses:`, the checkout's `with:` inputs, the checking-command
  EQUALITY on `pnpm format:check`, the remedy's scope-and-`decides()` contract, and
  `SETUP_COMMAND_LINES`; and the write-mode formatter/auto-commit ban. None of these is relaxed by
  the migration: a rule that was an equality stays an equality, on the value the parser resolves.
- **`run:` bodies stay shell, not YAML.** The parser hands each `run:` scalar over as a string and
  `extractRunBlocks`' consumers scan it as shell — which is exactly the boundary
  `withoutBlockScalars` was hand-maintaining, now drawn by the parser for free. (`#` comments
  inside that body are still stripped quote-aware: that is the SHELL's comment rule, applied to
  shell text, and YAML's own comments never reach it.)

**One clause of this contract was WRONG, and the boundary probe is what corrected it.** The
contract said merge keys "are resolved by the parser to the same document GitHub runs". They are
not, in either direction: `yaml@2.8.2` leaves `<<` unmerged by default (it surfaces as a literal
`<<` key), and GitHub **refuses to run the file at all** — measured on PR #477, probe run
[33724280781](https://github.com/foomakers/pair/actions/runs/33724280781), a `jobs:` block using
`<<: *base`: zero jobs, "invalid workflow file". So `<<` stays rejected, now by the job/workflow
key allow-list and with the producer's own verdict behind it. The same probe series settled the
rest of the class empirically rather than by reading the spec — flow trigger mapping
([33724282425](https://github.com/foomakers/pair/actions/runs/33724282425)), anchors
([33724282478](https://github.com/foomakers/pair/actions/runs/33724282478)), an alias DECIDING a
trigger ([33724282535](https://github.com/foomakers/pair/actions/runs/33724282535)), a JSON step
([33724282504](https://github.com/foomakers/pair/actions/runs/33724282504)) and a job-level `env:`
reaching a step ([33724282486](https://github.com/foomakers/pair/actions/runs/33724282486)) all
RAN; an unknown top-level key
([33724281525](https://github.com/foomakers/pair/actions/runs/33724281525)) was rejected with the
merge key. The guard's allow-lists agree with the producer on every row.

- **The test suite migrates with the module, it is not rewritten.** Every mutation case is the
  contract and stays: a mutation of the shipped workflow that was RED stays RED with the same
  cause. The cases that asserted the REJECTION of a legal spelling INVERT — a flow trigger mapping,
  a JSON step, an anchored `cancel-in-progress`, an aliased `branches:`, a CRLF file, a quoted
  `run:` are correct workflows and must go GREEN, with the underlying semantic rule still enforced
  on the resolved value (e.g. `pull_request: { branches: [release] }` stays RED — for being off the
  base branch, not for being flow).

**Why now, and on whose authority.** The flip trigger the superseded version wrote down —
"anything that still fails OPEN, or the first rule needing real structure (nested `with:`, matrix
jobs)" — **FIRED at round 12**, when the guard gained a `with:` rule for the checkout's inputs.
That version recorded the firing but left the consequence as "the human's call at the merge gate".
The maintainer has now made that call, at the merge gate, on **2026-09-02 and again on
2026-09-03**: take the migration, in this PR. It is recorded here as taken and binding so that no
later reading of this file re-derives "defer" — the previous framing is exactly what produced two
rounds of re-deferral against a decision already made.

### Superseded — the decision recorded here on 2026-09-01 (reject rather than parse)

**No longer in force.** Kept verbatim in substance, because it is what shipped between rounds 5 and
14 and a reader of that code needs it:

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
  2026-09-01 decision): **rejected on 2026-09-03**, having been the adopted decision for nine
  rounds. It closed the fail-open class at the cost of a rejection surface that then produced five
  fail-closed findings of its own (rounds 12–14 above), and it required the reader to be extended
  every time YAML was spelled differently. The trade it offered — ~~"the parser migration is a
  known, costed follow-on rather than an open hole"~~, ~~"what remains open is a judgement the
  human makes at the merge gate, not a new card"~~ — is **superseded**: the judgement was made, the
  answer is the migration, and it lands in this PR.

  The round-by-round record of that framing is kept because it is the audit trail of how the call
  was reached, and it is struck rather than deleted:

  - ~~**Round 6**: the round-5 trigger ("the NEXT finding of this class") fired and was answered by
    closing the second node position instead of migrating, because that is what the finding
    recommended.~~
  - **Rounds 7–9 did not fire it.** Their findings were RULE gaps — semantics GitHub defines (a
    tags-only `push` filter fires for tag refs only; `concurrency.group` must be keyed on the ref;
    the check context is the job's DISPLAY name, so `name:` and a matrix rename it) — read
    correctly by the line reader and simply unasserted. **This observation survives the
    supersession and is the honest bound on what the migration buys**: a parser would not have
    caught any of them. Round 13's `SETUP_COMMAND_LINES` (the last deny-list in the module,
    replaced by a toolchain allow-list) is the same kind. Parsing closes the spelling class; it
    closes nothing in the rule class.
  - ~~**Round 12, for the human at the merge gate**: the trigger text names "nested `with:`" as a
    flip condition and round 12 added a `with:` rule; whether that counts as the trigger firing is
    recorded as the human's call.~~ **It counted.** The human's call, recorded above: it fired.
  - ~~**Round 13, for the same human**: three more reader false-fails, patched in place because
    each was one line. The call stays where round 9 put it: accept the line reader, or require the
    `yaml@2.8.2` migration before merge.~~ **The call is made: require the migration.**
- **Defer the migration to a follow-up card**: rejected. Per ADL
  [2026-08-12](./2026-08-12-implementation-never-files-a-card-it-extends-the-story.md),
  implementation extends the story rather than filing a card — and deferring would ship the guard
  built on the reader whose incompleteness is the entire reason the rules exist, with the trigger
  already fired.
- **Teach `blockUnder` to parse flow mappings**: rejected — a second reader to keep in step with the
  first, and the next spelling neither knows fails open again. It is exactly the "hand-rolled
  checker" ADL 2026-07-29 rejected, with the failure mode round 5 measured.
- **Keep parsing block style only, and pattern-match the flow spelling into the existing rules**
  (e.g. widen the `paths`/`paths-ignore` regex to drop its `^\s*` anchor): rejected — it fixes the
  one key a reviewer happened to name and leaves `branches`, `types` and every future trigger key
  reading as "no filter".
- **A different parser (`js-yaml`, a GitHub-Actions-specific schema validator)**: rejected —
  `yaml@2.8.2` is already this repo's adopted parser (ADL 2026-07-29) and already a catalog entry,
  so a second one would be an unargued divergence. An Actions schema validator asserts that the
  file is a valid workflow; it asserts nothing about the properties this guard exists to hold.

## Consequences

- **Tech-stack impact: `yaml` gains a second consumer.** `@pair/dev-tools` declares
  `"yaml": "catalog:"` (the catalog already pins `yaml: 2.8.2` in `pnpm-workspace.yaml` for
  `apps/pair-cli`), so no new package is resolved and the lockfile delta is a workspace entry, not
  a download. It stays dev-only: `@pair/dev-tools` is `private: true` and the module runs under
  `ts-node` from `format-workflow:check` and `pnpm test` — nothing ships to an adopting project.
  This widens ADL 2026-07-29's rule ("generated YAML is asserted by parsing") to its mirror image:
  **consumed YAML is asserted by parsing too**.
- **The module is expected to shrink.** It is 1984 lines at `37cf84b4`; the reader helpers and the
  four spelling-rejection rule families come out with the migration. Shrinkage is an expectation,
  not an acceptance criterion — the criterion is that every semantic rule keeps its mutation test
  and every mutation that was RED stays RED.
- **A correct workflow stops being red for its spelling.** Flow style, anchors, merge keys,
  indentless sequences, CRLF and quoted scalars become the contributor's choice again, in this file
  as anywhere else. The workflow header comment and the module header stop advertising a
  block-style requirement, because there is none.
- **The class of finding that closes is "spelling X is invisible / spelling X false-fails".** The
  class that remains open is a MISSING RULE — rounds 7–9, round 12's rule gaps and round 13's
  setup-command allow-list are all of that kind, and no parser prevents them. That is the honest
  scope of this decision, and it is why the allow-list discipline in the superseded text is carried
  forward rather than dropped.
- **The migration's own risk is carried by the test suite**, which is the reason it is migrated
  rather than rewritten: 321 tests over the shipped workflow and its mutations, each naming the
  property it holds. Measured after the migration: 362 tests, every RED mutation still RED with the
  same cause, and the rows that asserted the rejection of a legal spelling inverted to GREEN with
  the semantic rule asserted on the resolved value.
- **Two surfaces became allow-lists in the same change, both of them the "relocation" shape this
  module keeps meeting.** (a) The WORKFLOW's own keys and every JOB's, because a job-level `env:`
  reaches the checking step whatever the step-level allow-list says: measured end to end,
  `NODE_OPTIONS=--require=<one-line shim>` makes the repo's own pinned prettier 3.6.2 print the
  offending filename and exit **0**, so `pnpm format:check` names the file and the `format` context
  reports SUCCESS on unformatted code — the `with: ref: main` loss class spelled as a job key.
  `container:`/`services:` are the `uses:` third-party-code argument one level up. (b) The REMEDY's
  shell, the module's last deny-list: a formatter no offender list names (`npx dprint fmt`) and a
  `git commit -am style && git push` beside the required message were both green. The remedy SAYS
  what to run; its shell is now quoted `echo`/`printf` and nothing else. With those two, the module
  header's claim that every surface is an allow-list is true as written.

## Adoption Impact

- `.pair/adoption/tech/way-of-working.md` — the `format` required-check bullet listed "the
  block-style requirement" among the asserted properties. **Edited**: that clause is gone (there is
  no spelling requirement), replaced by the key allow-lists, and the ADL reference now states that
  the guard parses and that an unparseable file is itself a problem.
- `.pair/adoption/tech/tech-stack.md` — the `yaml v2.8.2` entry read "(devDependency) for parsing
  generated YAML in tests". **Edited**: it now covers YAML this repo generates OR consumes, and
  names both declaring packages. `packages/dev-tools/package.json` declares `"yaml": "catalog:"`;
  the catalog already pinned 2.8.2, so no new package resolves, and `@pair/dev-tools` is
  `private: true`, so it stays dev-only.
- ADL [2026-07-29](./2026-07-29-yaml-parser-for-generated-yaml-tests.md) is **extended, not
  superseded** — same parser, same argument, second consumer.
- `.pair/llms.txt` — regenerated with the production generator (the title of this record changed).
