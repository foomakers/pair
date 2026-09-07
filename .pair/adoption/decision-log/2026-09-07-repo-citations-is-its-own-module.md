# Decision: The docs-site repo-citation resolver is its own module, re-exported by the gate

## Date

2026-09-07

## Status

Active

## Category

Convention Adoption

## Context

`apps/website/lib/docs-staleness-check.ts` grew from 878 to 1609 lines and from 33 to 38
exported functions on PR #471 (`git show origin/main:… | wc -l` vs the worktree). The
~730 added lines form ONE separable seam that changes for a single reason — how a link
on a rendered docs page is read and where it lands — and none of it moves when a skill
is added, a catalog row changes or a CLI command is renamed:

- the rendered link surface (`nextCodeSpan`, `maskLiteralConstructs`, `linkSurface`);
- the repo-citation resolver (`REPO_BLOB_RE`, `parseCitation`, `isPinnedRef`,
  `findDeadRepoLinks`, `findDeadLinks`);
- the github.com slugger (`renderedHeadingText`, `slugifyHeading`, `headingSlugAdder`,
  `collectHeadingSlugs`, `EXPLICIT_ANCHOR_RE`);
- the lossless diagnostics (`escapeForDiagnostic`, `editDistance`, `nearest`,
  `renderCandidate`, `deadPathError`, `replaceSegment`).

That is the design-rules "god module" shape (DR-1): the file's one-line summary needed
three "and"s, and the next Check-5b fix would land in a 1600-line module whose unit test
is 2280 lines — the drift surface ADR-024 was written to shrink.

## Decision

The seam is `apps/website/lib/repo-citations.ts`. `docs-staleness-check.ts` keeps the
orchestration (skill counts, catalog, CLI commands, list-targets samples,
`runAllChecks`, `main`), imports `findDeadLinks` / `findDeadRepoLinks` from the new
module, and **re-exports the same bindings** (`LINK_RE`, `HREF_RE`, `REPO_BLOB_RE`,
`findDeadLinks`, `findDeadRepoLinks`, `isPinnedRef`, `slugifyHeading`,
`collectHeadingSlugs`, `parseCitation`) so every existing import keeps working and there
is exactly one implementation — `repo-citations.test.ts` asserts identity of the
bindings, not just their presence.

Measured after the split: `docs-staleness-check.ts` 878 lines / 32 `export function`,
`repo-citations.ts` 789 lines / 6 `export function`; every website `lib/` test passes
unchanged in count (497), `pnpm docs:staleness` still `PASS — 44 skills, 11 commands in
sync`.

The existing `describe` blocks for the moved functions stay in
`docs-staleness-check.test.ts`: they were recorded by the sealed RED snapshot of this
review cycle and cannot be moved without rewriting a sealed artifact. They exercise the
moved code through the re-exported bindings, which the identity test proves are the
same functions.

## Alternatives Considered

- **Leave the module as is**: rejected — the DR-1 recognition criteria were met by this
  PR's diff, not merely inherited, and the review named it.
- **Split further (catalog / batch-engine / list-targets each their own module)**:
  rejected for this PR — those checks did not grow here and share the gate's I/O helpers;
  the 32 remaining exports are the pre-existing gate surface (33 on `origin/main`), not
  this PR's growth. A later card may split them.
- **Move the tests to `repo-citations.test.ts` now**: rejected — sealed RED snapshot
  (see above).

## Consequences

- A Check-5b change touches `repo-citations.ts` and its callers only; the gate's
  orchestration file no longer changes for a citation rule.
- Consumers importing from `docs-staleness-check` (`anchor-oracle-selection.test.ts`,
  the gate's own tests) are unaffected: same bindings, same paths.
- New tests for citation behaviour should be written against `repo-citations` directly.

## Adoption Impact

- `adoption/tech/way-of-working.md` § Quality Gates — the docs-site link-gate bullet
  names the module and this record.
