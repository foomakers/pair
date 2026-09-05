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
4. **Code spans and `{/* … */}` JSX comments are masked per BLOCK, by a LEFT-TO-RIGHT scan** — never per leaf line, never over the joined document, and never as two global replaces. Masked text becomes whitespace of the same length (newlines kept), so `` [`<url>`](<url>) `` — a code span inside a link — reports the destination exactly once, which is what the site serves, and no two halves of a URL can join.
   - Per DOCUMENT was wrong, and wrong in the SILENT direction: neither construct can cross a block boundary on the real renderer, so masking the joined surface lets an opener in one block pair with a closer in another and blank every URL between them. Measured on the probe page at `d745f4d1` — two stray backticks in separate blocks with three repo URLs between them: the site prerendered **all three** as `<a href>`, the gate reported **1 issue**, checking only the URL past the second backtick. Two dead citations shipped unchecked. So the masking groups the reader's leaf events by real block and masks each group on its own, rejoining with `\n`. The boundary is READ FROM THE READER — each leaf event answers `blockStart` — never guessed from the bytes and never inferred from the `paragraph` accumulator.
   - The accumulator is NOT that boundary, and reading it as one left the same false green alive. `advanceParagraph` resets it AFTER the line that ends the paragraph is emitted, so on a TIGHT interrupting line — one with no blank line above it — the accumulator still holds the paragraph that line interrupts. Measured on the probe page — a paragraph ending in a stray backtick, then on the very next line an ATX heading holding the dead URL and a second stray backtick — the site prerenders the URL as a link and the gate reported `PASS`. So the reader now EXPOSES the boundary as `blockStart` on the leaf event, rather than each consumer re-deriving it. That is the ADR-024 shape: one reader, one block grammar, consumers ask it questions.
   - **The ATX heading is NOT the only interrupting line that can carry a URL**, and reading it as such is what authorised deriving `blockStart` from the LAZINESS predicate `continuesParagraph`. Every line shape below was probed against the same open paragraph — `Cost is 5` + a stray backtick, the shape's line carrying a repo URL and the closing backtick — one row per shape in one probe page (`pnpm --filter @pair/website build`, `<a href>` counted in the prerendered `.next/server/app/docs/__green-probe.html`): **1** means the backticks did not pair, i.e. the line began a block; **0** means they did.

     | line under the open paragraph | site | github.com | gate before → after |
     | ----------------------------- | ---- | ---------- | ------------------- |
     | `<div>` (JSX flow)            | 1    | `<div>` opens a § 4.6 type-6 block | 1 → 1 |
     | `<span>` (JSX flow)           | 1    | ONE `<p>` — type 7 cannot interrupt | 0 → **1** |
     | `<Callout>` (JSX component)   | 1    | n/a        | 0 → **1** |
     | `<a name="x"></a>`            | 1    | ONE `<p>` — a tag PAIR is not type 7 | 0 → **1** |
     | a GFM table row (+ its delimiter row) | 1 | `<p>Cost is 5 wide.</p><table>` | 0 → **1** |
     | a 4-space-indented line       | 0    | ONE `<p>` — § 4.4 code cannot interrupt | 1 → **0** |
     | `2. item` / `2) item`         | 0    | ONE `<p>` — an ordered marker at 2 cannot interrupt | 1 → **0** |
     | two consecutive indented lines | 0   | one `<pre>` (no paragraph open) | 1 → **0** |
     | an indented line MID-paragraph | 0   | ONE `<p>`  | 1 → **0** |

     The split is **flavour-conditional**, and the `<span>` row is why: `Some para` / `<span>x</span>` is ONE `<p>` on `gh api -X POST /markdown` (§ 4.6 type 7 cannot interrupt a paragraph) while the site renders 1 `<a href>` for the JSX-flow shape — MDX has no type-7 rule. The reader therefore ends a paragraph at a JSX flow line only under `mdx`, and keeps github's answer without it. A GFM table row interrupts on BOTH.

     Both directions were silent-or-loud in the ways the Consequences section names: the `<span>`/`<Callout>`/table rows were false GREENs (the paragraph's stray backtick reached into the next block and blanked a citation the site serves), the indented/`2.` rows false REDs (the gate split a paragraph the renderer keeps whole and gated text no reader can click).
   - **The push/reset decision has ONE owner and both answers are read off it.** `continuesOpenParagraph` in `packages/content-ops/src/markdown/commonmark-blocks.ts` is the single predicate `advanceParagraph` applies to the accumulator and `startsLeafBlock` reads back, so the reader can never again call the same line both a continuation and a block start. `continuesParagraph` — the LAZINESS predicate, "may this line omit its container prefix?" — is strictly stronger and is NOT that owner: it says `false` for the indented, `2.` and type-7 shapes the accumulator still pushes, which is exactly the false-RED half of the table above.
   - **A GFM table is one block but N INLINE SCOPES**, and the boundary comes from the reader, not from a second grammar in `linkSurface` (ADR-024). Each cell is parsed on its own, so a backtick in one cell never pairs with one in another — measured on the same probe page: a URL between backticks in two OTHER cells of the SAME row → **1** `<a href>` (gate 0 → **1**), the same across cells of DIFFERENT rows → **1** (gate 0 → **1**). The reader exposes a row's cells as `cells: readonly string[]` on the leaf event and the gate masks cell by cell. Cells of one row are separate scopes too, so a row-level boundary alone does not close this.
   - **An open leaf ends where its container does.** a 4-space-indented code line inside a block quote, followed by one at document level, is TWO `<pre>` blocks on `gh api -X POST /markdown`; the same two lines both inside the quote are ONE — so `closeContainers` resets the indented-code and table flags with the paragraph, which it did not, and the second block was reported as a continuation of the first.
   - Per LINE was wrong: both constructs are multi-line on the real renderer, and the canonical MDX way to comment a link out is a wrapping `{/* … */}`. Measured on the probe page: a code span wrapping a newline → 0 `<a href>`; a wrapping `{/* … */}` → its URL absent from the prerendered payload entirely.
   - Neither construct can be replaced globally BEFORE the other, because each one's opener is ordinary text inside the other. Both directions measured on the same probe page: `` {/* a ` comment */} `` … URL … a stray `` ` `` → **1** `<a href>` (the comment opened first); `` `{/*` `` … URL … `` `*/}` `` → **1** (the spans opened first); `` `<url> {/* x */}` `` → **0** (the span opened first). Span-first blanks the first row's URL, comment-first blanks the second's — both are SILENT misses. So the rule is positional: whichever opens first wins, and an opener that never closes is literal text.
5. **An `<!-- … -->` line is ordinary text under the flavour and IS scanned.** A page carrying one cannot build at all (`Unexpected character`!` … use `{/*text*/}`), so neither answer can mislead a reader; reporting is the non-silent one.

## Alternatives Considered

- **Keep github.com as the oracle for the surface too**: rejected — it is not the renderer of these pages, and it disagrees on four rows, one of which (indented code) is the silent direction.
- **Scan HTML-block lines raw, per CommonMark § 4.6**: rejected — measured false RED. MDX parses JSX children as ordinary markdown, so a fence inside a `<div>` is still code on the site.
- **Fix Check 5b only, leaving Check 5 on raw bytes**: rejected — same defect, same contract; `](/docs…)` inside a fence is the same unclickable text.
- **A second, MDX-specific reader in `apps/website`**: rejected outright — the exact duplication ADR-024 was written on this branch to forbid.

## Consequences

- **A false GREEN is blocking, a false RED is not.** These two failures are not symmetric and are not traded off: a false RED breaks a build loudly and someone fixes it, while a false GREEN ships a dead citation with the gate reporting PASS — the gate silently stops being a gate. Any change to the surface or its masking is measured in BOTH directions on the site oracle before it lands, and a finding that produces a false green is fixed here, never deferred to a merge gate.
- A docs page may now quote any repo URL inside a fence, a code span or a JSX comment — including a MULTI-LINE code span and a multi-line `{/* … */}`, the canonical MDX way to comment a link out — and including `blob/master/…` as a counter-example. The contributing/reference pages can teach the rule.
- A citation on a 4-space-indented line is now checked (it was never a code block on this site).
- Adding a row to the surface table means **building the site** and counting `<a href>`, not reading a spec — the same discipline the anchor table already applies to `gh api -X POST /markdown`.
- `readMarkdown` carries one more option; the flavour is opt-in and `collectHeadingSlugs` deliberately does NOT use it (it reads a cited `.md` as github.com renders it).

## Adoption Impact

- `.pair/adoption/tech/way-of-working.md` — the Check 5b bullet gains the surface rule and names the site build as its oracle.
- `.pair/adoption/tech/adr/adr-024-commonmark-block-reader-is-one-shared-module.md` — unchanged in thesis; the `mdx` flavour and the leaf event's `blockStart` and `cells` are all properties of the ONE shared reader, recorded here. A consumer needing a block OR inline-scope fact asks the reader for it instead of re-deriving it from an event field that was never that fact.
