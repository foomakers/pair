# Decision: a repo citation is checked ref-deep and anchor-deep, not just path-deep

## Date

2026-09-03

## Status

Active

## Category

Convention Adoption

## Context

The docs site cites repo files by GitHub URL (`https://github.com/foomakers/pair/blob/main/<path>`). Check 5b (`findDeadRepoLinks` in `apps/website/lib/docs-staleness-check.ts`, run by `pnpm --filter website docs:staleness`) resolved the **path** and nothing else, in two directions:

- **Ref pinned to `main` in the regex.** A citation under any other ref matched nothing and shipped unchecked. `blob/mian/README.md` (a one-letter typo) and `blob/master/…` (this repo has no `master`) are 404s for every reader that the gate reported as PASS.
- **Fragment stripped and discarded.** Three shipped citations carry one (`skills-guide.md#callers-matrix-scoped-capabilities`, `quality-model.md#6-techrisk-matrixmd--adoption-delta`, `CP10-web-cloud-environment.md#execution-log`). Renaming a cited heading drops every reader at the top of a 200-line file while `docs:staleness` still prints PASS — the same "a repo citation nothing checks" gap Check 5b was written to close, one delimiter further in.

## Decision

Check 5b resolves the whole citation.

**Ref** — captured, then decided per ref:

| ref | verdict |
| --- | --- |
| `main` | resolve the path (and the fragment) against the working tree |
| immutable permalink — 7-40 hex sha, or `v?N(.N)*` tag | **skip**: it is pinned on purpose and may legitimately name a file `main` no longer has |
| anything else (`master`, `develop`, `mian`) | **error** — `use main/ (or an immutable sha/tag permalink)` |

**Fragment** — validated only where a fragment means a heading: `kind === blob` **and** the path ends `.md`/`.mdx`. `tree/` is a directory listing and `raw/` serves bytes, so a fragment on either is skipped; so is GitHub's own line anchor (`#L203`, `#L203C5-L210C9`). Otherwise the file's headings are slugged and the fragment must be among them.

**The slug rule is github.com's, taken from github.com.** Inline markup is reduced to rendered text first (a `[Templates](templates/README.md)` heading anchors as `#templates`, not `#templatestemplatesreadmemd`), then github-slugger's transform: lowercase, drop every character that is not a letter/digit/`_`/`-`/space, spaces to `-`, repeats disambiguated `-1`/`-2`. Every row of the unit table is what `gh api -X POST /markdown` returns for that heading — including the two that are wrong by inspection (`_italic_` slugs as `italic`, `snake_case` keeps its underscore).

Two URL spellings that were false-positive **build breaks** are fixed in the same pass: `<` / `>` are excluded from the path character class (a CommonMark autolink `<…/README.md>` used to capture `README.md>`), and the path is `decodeURIComponent`'d inside a try/catch before it is resolved (`docs/my%20file.md` is the file `docs/my file.md`; a malformed escape resolves literally rather than throwing).

## Alternatives Considered

- **Document the `main`-only scope in a comment and leave the ref pinned**: the cheaper half of the review's recommendation, but it leaves `blob/mian/…` shipping as an unchecked 404 — a comment does not fail a build.
- **Error on every non-`main` ref, permalinks included**: closes the typo hole and simultaneously breaks the build on the one legitimate non-`main` citation form. A permalink names an immutable ref precisely because the file may be gone from `main`; the working tree cannot answer for it.
- **Depend on `github-slugger`**: correct by construction but a new runtime dependency in `apps/website` for ~10 lines, and it would still need the rendered-text reduction on top. Mirrored, and pinned to github's own renderer by test instead.
- **Validate line anchors (`#L203`) too**: a moved line is undetectable and an out-of-range one still renders. No signal, real false-positive risk.

## Consequences

- A docs citation must be spelled `blob|tree|raw/main/<path>` or use an immutable sha/tag permalink; any other ref fails `docs:staleness`.
- Renaming a heading that a docs page cites is now a build break in `docs:staleness`, not a silent reader-facing regression — the citation and the heading move together or CI says so.
- The slug mirror must stay honest: if github changes its anchor rule, the probed rows in `slugifyHeading`'s table are the thing to re-probe (`gh api -X POST /markdown -f text='## <heading>'`).

## Adoption Impact

- `adoption/tech/way-of-working.md` § Quality Gates — the existing "Link gates resolve targets case-sensitively" bullet gains the ref/anchor depth of Check 5b, so the documented gate matches what it enforces.
