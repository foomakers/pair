# Decision: Repo citations in the docs are gated through the site's own MDX compiler

## Date

2026-09-08

## Status

Active

## Category

Convention Adoption

## Context

Docs pages cite repository files as `https://github.com/foomakers/pair/blob/main/<path>`. Nothing checked that `<path>` exists, so a renamed or deleted file left a live link to a github.com 404 with every gate green. The journey-first rewrite of `pm-tools/**` (#434) added nine such citations (three distinct targets) and made the gap concrete.

The first attempt (PR #471, closed unmerged) answered the question "is this URL a link on the rendered page?" with a hand-written CommonMark/MDX block reader (~1,070 lines) plus a citation gate (~790 lines) and a 937-file anchor fixture. Nine review cycles found the same class of defect repeatedly — fence, container, table cell, JSX comment, expression, backslash escape — each a rule the reader had to reproduce from the renderer. The oracle used to *verify* that reader in every cycle was the site's own compiler: compile the page with `@mdx-js/mdx` + `remark-gfm` and count the `href` values it emits.

## Decision

1. **The site's MDX compiler is the gate, not a model of it.** `findDeadRepoCitations` compiles each page with `@mdx-js/mdx` + `remark-gfm` — the same pair fumadocs runs — and reads the `href` values the compiler emits. Only links are in scope: an image `src` pointing at the repository is not checked. A URL in a fence, a code span or a JSX comment is text to the compiler and therefore invisible to the gate, by construction rather than by rule; a URL in a table cell or after a backslash escape is a link on the page and is gated exactly like one in prose — measured, not modelled.
2. **"Resolves" means git-tracked at that exact spelling.** The tracked set comes from `git ls-files`; the filesystem is not the oracle because macOS is case-insensitive and would pass `readme.md`, which github.com serves as a 404. `blob/` and `raw/` must name a tracked file; `tree/` a tracked file or directory prefix.
3. **Only `main` refs are checked.** A citation pinned to a tag or SHA is a deliberate reference to a moment in time and is left alone.
4. **A page the compiler rejects is not this check's finding** — `next build` reports it, loudly. The gate returns no citation errors for it rather than a misleading one.
5. `@mdx-js/mdx` and `remark-gfm` become declared `devDependencies` of `apps/website` (catalog-pinned to the versions fumadocs already resolves), instead of transitive imports from the store.

## Alternatives Considered

- **A CommonMark/MDX block reader of our own** (PR #471): rejected — the domain is a parser's; nine cycles reproduced it one rule at a time and each fix opened the next case. Everything the reader covered, the compiler yields for free.
- **A regex over the raw `.mdx` bytes**: rejected — fails in both directions, gating URLs inside fences and code spans (false red) and missing none of the live ones only by luck.
- **Checking anchors (`#fragment`) against github.com's slugger**: deferred — a different oracle (`gh api /markdown`). Four gated citations across three pages carry a fragment today (`integrations/web-cloud-environments.mdx` ×2 → `…CP10-web-cloud-environment.md#execution-log`, `reference/guidelines-catalog.mdx` → `skills-guide.md#callers-matrix-scoped-capabilities`, `reference/quality-model.mdx` → `quality-model.md#6-techrisk-matrixmd--adoption-delta`); their paths are verified, their fragments are not. Add on demand, not as a 937-file sweep.

## Consequences

- A dead repo citation in prose fails `docs:staleness`; the same URL in a fence, code span or JSX comment does not. Measured: a probe page with one dead link in prose and the same URL in a code span → `FAIL — 1 issue`, naming only the prose one.
- Measured on the real tree at adoption: 84 pages compile (0 failures), 648 hrefs emitted, **33 `blob|tree|raw/main` citation occurrences enforced** (25 distinct URLs) against 2,101 tracked files (measured before this ADL itself was added to the tree) — including the nine added by `pm-tools/**` (three distinct targets). The gate passes unchanged; renaming any cited file (an ADR, `packages/brand/BRAND.md`, …) now fails `docs:staleness`.
- Gate cost: one `compileSync` per `.mdx` page (84 pages) inside the existing `docs:staleness` run, plus one `git ls-files`.
- 87 lines of gate code (215 with its test) replace the 1,858 of the first attempt's two modules (`commonmark-blocks.ts` 1,069 + `repo-citations.ts` 789, plus their 959 test lines and a 33,570-line anchor fixture); no shared reader, no anchor fixture, no generator.

## Adoption Impact

- `apps/website/lib/docs-staleness-check.ts` — Check 5b (`findDeadRepoCitations`, `trackedFiles`, `repoRootOf`).
- `apps/website/package.json`, `pnpm-workspace.yaml` — `@mdx-js/mdx`, `remark-gfm` declared.
- `.pair/adoption/tech/tech-stack.md` — both libraries registered as adopted `apps/website` devDependencies.
- No change to `.pair/adoption/tech/way-of-working.md`; the gate lives inside the existing `docs:staleness` step.
