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

ADL [2026-07-29](./2026-07-29-yaml-parser-for-generated-yaml-tests.md) already adopted
`yaml@2.8.2` and rejected hand-rolled YAML checkers with an argument that lands
squarely here: "a parser written to the same (mis)understanding as the generator
validates nothing".

## Decision

The guard **rejects** any spelling it does not read, rather than parsing it or
defaulting it to "absent".

Concretely: every structural key it reads as a block (`on`, each trigger under `on`,
`concurrency`, `jobs`, each job, `steps`) must carry a BLOCK value — nothing after the
colon on its own line — and anchors, aliases and merge keys are rejected anywhere in
the file. An unsupported spelling is now a reported problem, not a vacuous pass.

This is the direction change, not the rule count: **the reader's incompleteness fails
CLOSED**. The same shape is why the module's other rules are allow-lists — `if:` (no
condition on a job, none on the checking step, only a scoped `failure()` elsewhere),
`uses:` (the three actions the job needs), and the checking command (an equality on
`pnpm format:check`, not a mention). Each is a narrow canonical spelling; everything
else is a deliberate edit to the guard.

The bound is deliberate: spellings the reader DOES read correctly stay accepted —
`branches: [main]` (a flow sequence read by `listValueOf`) and
`permissions: { contents: read }` (read inline by `permissionProblems`). A guard that
fails a correct workflow is the kind that gets weakened or deleted.

## Alternatives Considered

- **Parse with `yaml` and drop the hand-rolled reader** (the reviewer's stated
  alternative, and the direction ADL 2026-07-29 points): not taken **now**, and it
  stays the right end state. It replaces every structural rule at once — indent
  arithmetic disappears and the whole class of "spelling X is invisible" goes with it
  — but it is a rewrite of the canonical module and its 118 tests, landed at review
  round 5 of a `risk:green` story whose primary recommendation was the rejection. The
  trigger to flip: the NEXT finding of this class, or the first rule that needs real
  structure (nested `with:`, matrix jobs). `yaml@2.8.2` is already a catalog entry, so
  the cost is one devDependency line in `@pair/dev-tools`.
- **Teach `blockUnder` to parse flow mappings**: rejected — a second reader to keep in
  step with the first, and the next spelling neither knows fails open again. It is
  exactly the "hand-rolled checker" ADL 2026-07-29 rejected, with the failure mode this
  round measured.
- **Keep parsing block style only, and pattern-match the flow spelling into the
  existing rules** (e.g. widen the `paths`/`paths-ignore` regex to drop its `^\s*`
  anchor): rejected — it fixes the one key a reviewer happened to name and leaves
  `branches`, `types` and every future trigger key reading as "no filter".

## Consequences

- Any contributor rewriting `format.yml` in flow style gets a red `pnpm test` with a
  message naming the spelling and the block-style fix; the workflow's own header
  comment says so before they start.
- Anchors and merge keys are unavailable in this one file. It is 110 lines with one
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
