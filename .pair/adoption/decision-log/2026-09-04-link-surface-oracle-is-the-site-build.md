# Decision: A docs-site link gate reads the RENDERED surface, and its oracle is the site build

## Date

2026-09-04

## Status

Active

## Category

Convention Adoption

## Context

`docs:staleness` Check 5 (`/docs` links) and Check 5b (repo-file citations) matched their regexes against the **raw `.mdx` bytes**. A repo URL that the site renders as literal text was therefore gated as if it were a live link, and the build broke on a string no reader can click. Proven through the shipped gate on the real tree (appended to `pm-tools/index.mdx`, reverted after):

- a ```` ```bash ```` fence holding `gh api https://github.com/foomakers/pair/blob/main/does/not/exist.md` plus a prose code span holding `…/also/missing.md` → `FAIL — 2 issues`, both `Dead repo-file citation`;
- the self-defeating mirror — a page documenting the gate's OWN ref rule, ``Never write `https://github.com/foomakers/pair/blob/master/README.md` — use main.`` → `FAIL — 1 issue · Bad ref in repo citation`.

So the reference page that teaches the rule could not state the counter-example it exists to teach, and any CLI example embedding a repo URL in a fence was a landmine.

Choosing the oracle is the whole decision. `apps/website/content/docs/**` is `.mdx` rendered by fumadocs, **not** markdown rendered by github.com, and the two disagree on four rows — measured, not assumed, by building a probe page (`pnpm --filter @pair/website build`) and counting `<a href>` in the prerendered `.next/server/app/docs/__link-surface-probe.html`:

| where the URL sits              | fumadocs/MDX | github.com |
| ------------------------------- | ------------ | ---------- |
| a 4-space-indented line         | 1 (LIVE)     | 0 (code)   |
| bare inside `<pre>`             | 1 (LIVE)     | 0 (text)   |
| a code span inside `<div>`      | 0 (code)     | 1          |
| a ```` ```bash ```` in `<div>`  | 0 (code)     | 1          |

Reading an `.mdx` page with CommonMark's § 4.4/§ 4.6 rules is wrong in **both** directions at once: it would skip a live indented citation (a 404 shipped unchecked) and fail the build on a fence inside a `<div>`.

## Decision

1. **Both link checks read a rendered SURFACE, never the raw bytes.** `linkSurface(content)` in `apps/website/lib/docs-staleness-check.ts` yields the lines a URL is a link on; `findDeadLinks` and `findDeadRepoLinks` scan only that.
2. **The oracle for that surface is the docs site's own build**, not github.com. Every row of `SURFACE_ROWS` in `docs-staleness-check.test.ts` carries the `<a href>` count measured in the prerendered HTML.
3. **The shared reader gains an `mdx` flavour** rather than the gate growing a second grammar: `readMarkdown(content, { mdx: true })` — no § 4.6 HTML blocks, no § 4.4 indented code. Both facts are MDX's, both are measured, and they stay in the ONE reader ADR-024 mandates.
4. **Code spans and `{/* … */}` JSX comments are masked over the JOINED surface, by a LEFT-TO-RIGHT scan** — never per leaf line, and never as two global replaces. Masked text becomes whitespace of the same length (newlines kept), so `` [`<url>`](<url>) `` — a code span inside a link — reports the destination exactly once, which is what the site serves, and no two halves of a URL can join.
   - Per LINE was wrong: both constructs are multi-line on the real renderer, and the canonical MDX way to comment a link out is a wrapping `{/* … */}`. Measured on the probe page: a code span wrapping a newline → 0 `<a href>`; a wrapping `{/* … */}` → its URL absent from the prerendered payload entirely.
   - Neither construct can be replaced globally BEFORE the other, because each one's opener is ordinary text inside the other. Both directions measured on the same probe page: `` {/* a ` comment */} `` … URL … a stray `` ` `` → **1** `<a href>` (the comment opened first); `` `{/*` `` … URL … `` `*/}` `` → **1** (the spans opened first); `` `<url> {/* x */}` `` → **0** (the span opened first). Span-first blanks the first row's URL, comment-first blanks the second's — both are SILENT misses. So the rule is positional: whichever opens first wins, and an opener that never closes is literal text.
5. **An `<!-- … -->` line is ordinary text under the flavour and IS scanned.** A page carrying one cannot build at all (`Unexpected character`!` … use `{/*text*/}`), so neither answer can mislead a reader; reporting is the non-silent one.

## Alternatives Considered

- **Keep github.com as the oracle for the surface too**: rejected — it is not the renderer of these pages, and it disagrees on four rows, one of which (indented code) is the silent direction.
- **Scan HTML-block lines raw, per CommonMark § 4.6**: rejected — measured false RED. MDX parses JSX children as ordinary markdown, so a fence inside a `<div>` is still code on the site.
- **Fix Check 5b only, leaving Check 5 on raw bytes**: rejected — same defect, same contract; `](/docs…)` inside a fence is the same unclickable text.
- **A second, MDX-specific reader in `apps/website`**: rejected outright — the exact duplication ADR-024 was written on this branch to forbid.

## Consequences

- A docs page may now quote any repo URL inside a fence, a code span or a JSX comment — including a MULTI-LINE code span and a multi-line `{/* … */}`, the canonical MDX way to comment a link out — and including `blob/master/…` as a counter-example. The contributing/reference pages can teach the rule.
- A citation on a 4-space-indented line is now checked (it was never a code block on this site).
- Adding a row to the surface table means **building the site** and counting `<a href>`, not reading a spec — the same discipline the anchor table already applies to `gh api -X POST /markdown`.
- `readMarkdown` carries one more option; the flavour is opt-in and `collectHeadingSlugs` deliberately does NOT use it (it reads a cited `.md` as github.com renders it).

## Adoption Impact

- `.pair/adoption/tech/way-of-working.md` — the Check 5b bullet gains the surface rule and names the site build as its oracle.
- `.pair/adoption/tech/adr/adr-024-commonmark-block-reader-is-one-shared-module.md` — unchanged in thesis; the `mdx` flavour is an option on the one shared reader, recorded here.
