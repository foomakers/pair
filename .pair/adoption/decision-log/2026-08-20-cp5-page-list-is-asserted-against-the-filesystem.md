# Decision: CP5's docs URL list is asserted against the filesystem, not hand-maintained

## Date

2026-08-20

## Status

Active

## Category

Convention Adoption

## Context

CP5 (`qa/release-validation/CP5-website-docs-completeness.md`) sweeps every docs URL for HTTP 200 at
release sign-off. Its list was maintained by hand: each story that added a page was expected to add
a bullet and bump two counts, and CP5's changelog shows exactly that ritual (#278: 60 → 61, #225:
61 → 62).

The ritual drifted. Reviewing PR #442 (US-225), `find apps/website/content/docs -name '*.mdx'`
returned **80** pages against CP5's **62** URLs — 18 live pages had been added over time and never
listed: `/docs`, five Concepts pages (`canonical-states`, `code-host`,
`definition-of-ready-and-done`, `pr-state-flow`, `tag-driven-gates`),
`contributing/writing-migration-pages`, `customization/external-kb`, both Migrations pages,
`pm-tools/azure-devops`, five Reference pages (`batch-engine`, `coupling-model`, `pair-next`,
`quality-gates-configuration`, `quality-model`) and two Tutorials pages (`managing-ai-artifacts`,
`release-testing`). A 404 on any of them passed release sign-off.

US-225 had added a **self-consistency** guard to CP5 (each declared per-section count equals the
bullets under it; the two quoted totals equal the sum). That guard is genuine but closed the wrong
hole: it only fires when an author edits CP5 *partially*. An author who adds a page and never
touches CP5 leaves every count matching — 62 == 62 — while the sweep silently under-covers. That is
the failure that actually happened, eighteen times.

## Decision

**The set of URLs CP5 lists must equal the set of routable pages on disk, and that equality is a
test.**

1. `packages/knowledge-hub/src/conformance/docs-page-coverage.test.ts` derives the expected URL
   set from `apps/website/content/docs/**/*.mdx` (mapping `index.mdx` to its directory URL) and
   asserts it equals the `- $BASE_URL/docs/...` bullets in CP5's MT-CP501. Filesystem is the source
   of truth; CP5 is the projection.
2. CP5's MT-CP501 is backfilled to the full 80 pages, with a `Docs Root` and a `Migrations` section
   added so every routable page falls under a declared section.
3. The self-consistency guard stays. The two are complementary: the new assertion catches the author
   who never touches CP5, the old one catches the author who touches it partially.
4. Consequence for authors: **adding a docs page without listing it in CP5 fails CI.** The page list
   is no longer a document someone remembers to update.

## Alternatives Considered

- **Generate MT-CP501's list from the filesystem at execution time** (a script the executor runs
  instead of a written list): rejected — a critical path is executed by a human or an assistant from
  the written file, and the suite's other paths are readable checklists. Replacing the list with a
  generator would make CP5 unreadable as a test case for the sake of removing a diff.
- **Leave the 18 pages out and only guard the new page**: rejected — the finding is pre-existing but
  the guard added by this story is the natural place to close it, and leaving it open means the
  first re-run of CP5 after this PR still under-sweeps by 18 pages.
- **Assert only a count (80 bullets, 80 files)**: rejected — a count matches while a URL is
  misspelled or a page is swapped for another. Set equality names the exact page that drifted.
- **Put the assertion in the website package instead of knowledge-hub**: rejected for now — the
  conformance file already reads `apps/website/content/docs` and `apps/website/e2e` for this story's
  other invariants, and splitting one story's guard across two packages buys nothing. If a broader
  docs-conformance suite emerges, it moves there wholesale.

## Consequences

- CP5's release sweep grows from 62 to 80 URLs; the first executor after this change checks 18 more
  pages, any of which may be the first 404 the suite ever reports.
- A new docs page now requires one line in CP5 (plus its section count) or CI is red — a deliberate,
  named cost paid to keep the sweep honest.
- A page **deleted** from the site is caught symmetrically: CP5 listing a URL that no longer exists
  fails the same assertion.
- The website e2e page lists (`apps/website/e2e/docs.e2e.test.ts`) are still maintained by hand and
  are **not** covered by this decision. They remain a separate, narrower sweep.

## Adoption Impact

- `.pair/adoption/tech/way-of-working.md` — Manual Testing section: records that CP5's page list is
  machine-asserted against the filesystem, so the "update the CP when behavior changes" rule is
  enforced rather than trusted for this one path.
