# ADR-024: The CommonMark block reader is ONE shared module, and github.com is its oracle

## Status

Accepted

## Date

2026-09-04

## Context

Two gates in this repo have to answer the same question — *which source lines does
github.com actually render as markdown?* — and both used to answer it with their own
copy of the grammar:

- `apps/website/lib/docs-staleness-check.ts` (`collectHeadingSlugs`) decides which lines
  can carry a **heading anchor**, and fails the build on a citation whose `#fragment`
  does not resolve.
- `packages/knowledge-hub/src/conformance/code-host-routing.test.ts` (`markdownFences`)
  decides which lines are a **copy-paste ```markdown surface**, and fails the suite on a
  PM guide shipping an unasserted way-of-working snippet.

The cost of two copies was measured on this branch, twice:

1. The `` ```bash ``-is-not-a-closer defect was found and fixed in the conformance
   helper. It was still live in the production gate, where
   `framework-patterns/fastify.md` was serving two phantom anchors and swallowing two
   real headings in both KB roots — found again, one round later.
2. Container awareness (blockquote peeling, list content columns, tab stops) was then
   added to the conformance helper ONLY. The production gate stayed document-level, so
   the live
   `apps/pair-cli/CHANGELOG.md#release-v020---enhanced-cli-distribution--documentation`
   (an ATX heading inside a list item, in five CHANGELOGs) failed the build while
   `# Doc` / `<div>` / `## InDiv` / `</div>` / `## Real` served a phantom `#indiv` that
   PASSED and 404s for every reader.

Both directions matter and they are not symmetric: a false RED breaks the build on a URL
that works, a false GREEN drops a reader on a page that does not exist.

## Decision

**One module owns the grammar**: `@pair/content-ops`'s
`src/markdown/commonmark-blocks.ts` — `readMarkdown` (a per-line event stream over
fenced code § 4.5, HTML blocks § 4.6 types 1-7, block quotes, list-item content columns,
indented code, tab stops, paragraph continuation and laziness) plus `fencedBlocks` and
`stripFrontmatter` derived from it. Both gates consume it; neither reimplements it.
`apps/website` takes `@pair/content-ops` as a devDependency for this, and
`turbo.json`'s `docs:staleness` task gains `dependsOn: ["^build"]` so the gate still
runs on a clean checkout.

Each gate keeps only what is genuinely its own: the website keeps the anchor SLUG rule
and github's skip-until-free duplicate loop; knowledge-hub keeps the info-string FILTER
(`markdown`/`md`).

**github.com is the oracle, not the spec.** Every rule is pinned by
`gh api -X POST /markdown`, read as `id="user-content-…"` / `name="user-content-…"` in
document order (anchors) and as `highlight-text-md` <pre> bodies (fences). Those answers
live in ONE table, `@pair/content-ops`'s `test-utils/commonmark-rows.ts`, exercised from
all three suites — website (anchors), knowledge-hub (fenced blocks), content-ops (the
reader itself) — so deleting a container rule reddens every consumer at once.

**A divergence from github.com is a ROW, never a silence.** Where the reader knowingly
stops short, the row carries `readerAnchors`/`readerBlocks` and says why.

## Consequences

- One grammar fix lands in both gates. The class of bug that produced this ADR — fix
  here, still broken there — is structurally impossible.
- `apps/website` now depends on `@pair/content-ops`. It is a devDependency and the gate
  is a `tsx` script, so nothing enters the Next.js bundle; the cost is a build-order edge
  in turbo, made explicit rather than implicit.
- The oracle is a network call, so it cannot run in CI. Two things carry it offline: the
  committed row table, and `apps/website/lib/github-anchor-oracle.json` — github's
  answers for every git-tracked `*.md`/`*.mdx` whose anchor set depends on block
  structure, keyed by the sha1 of the file body so an edited doc drops out of the
  assertion instead of failing on a stale expectation. Regenerate with
  `pnpm docs:anchor-oracle` (repo root; the package-scoped form bypasses turbo and cannot resolve `@pair/content-ops` on a clean checkout).
- The reader is CommonMark BLOCK structure only. Inline parsing (what a heading's text
  MEANS) stays with the consumer, and the raw-HTML corners it does not reach are on
  record as rows.
- **Where a block carries an inline-scope BOUNDARY, the reader exposes the boundary — it
  still does not parse inline.** A GFM table is one block but N inline-parsing scopes on
  both renderers (a backtick in one cell never pairs with one in another), so a leaf event
  for a table row carries its `cells`. A consumer masking inline constructs reads that
  field; it does not grow a second table grammar of its own, which is the duplication this
  ADR forbids. Measured, per ADL 2026-09-04: a URL between backticks in two other cells
  renders as 1 `<a href>` on the docs site, within one row and across rows alike.
