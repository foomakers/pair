/**
 * Repo citations — how a docs-site page's links are READ and RESOLVED.
 *
 * The `docs:staleness` gate (`docs-staleness-check.ts`) is orchestration: skill counts,
 * the catalog, CLI commands, list-targets samples, `runAllChecks`. Everything here
 * changes for ONE other reason — what counts as a link on the rendered page and where it
 * lands — and none of it moves when a skill is added or a catalog row changes:
 *
 * - the rendered LINK SURFACE (`linkSurface`, `maskLiteralConstructs`, `nextCodeSpan`) —
 *   the lines a URL is actually a link on, with code spans and JSX comments blanked
 *   (oracle: the site build, ADL 2026-09-04);
 * - Check 5 (`findDeadLinks`, `/docs/...` routes) and Check 5b (`findDeadRepoLinks`,
 *   `github.com/foomakers/pair/{blob,tree,raw}/<ref>/<path>#fragment` citations, ref-
 *   and anchor-deep — ADL 2026-09-03);
 * - the github.com SLUGGER (`slugifyHeading`, `collectHeadingSlugs`) — what anchors a
 *   cited markdown file offers (oracle: `gh api -X POST /markdown`, committed per file
 *   in `github-anchor-oracle.json`);
 * - the LOSSLESS diagnostics (`escapeForDiagnostic`, `nearest`, `deadPathError`) that
 *   report a dead spelling without collapsing it into the live one.
 *
 * The gate imports these and re-exports the same bindings, so every consumer keeps its
 * import path. WHICH lines are which block is `@pair/content-ops`'s shared CommonMark
 * reader (ADR-024) — never re-derived here.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  readMarkdown,
  atxHeadingText,
  isSetextUnderline,
  HTML_KINDS_RENDERING_ANCHORS,
  type MarkdownEvent,
} from '@pair/content-ops/markdown/commonmark-blocks'
import {
  resolveCaseSensitiveSync,
  type CaseSensitiveWalk,
} from '@pair/content-ops/file-system/exists-case-sensitive'

// Internal /docs targets: markdown links `](/docs/...)` and JSX card
// `href="/docs/..."` attributes (Fumadocs <Card>/<Cards>).
export const LINK_RE = /\]\((\/docs[^)\s]*)\)/g
export const HREF_RE = /href="(\/docs[^"]*)"/g

// Repo-file citations: the docs site cites decision records / KB files / source dirs
// by GitHub URL (`[ADR-021](https://github.com/foomakers/pair/blob/main/.pair/...md)`,
// `.../tree/main/apps/pair-cli`). Nothing validated them: LINK_RE/HREF_RE only see
// `/docs/...`, and the kb-validate link-checker's roots are
// `packages/knowledge-hub/dataset` and `.pair/knowledge` — neither contains
// `apps/website/content/docs`. A mistyped record filename shipped as a 404 no gate
// could see. All three path-serving spellings are matched (`blob` for a file view,
// `tree` for a directory, `raw` for the file bytes); matching only `blob` left the
// same 404 reachable one URL form away.
//
// Three captures: KIND (`blob` decides whether a `#fragment` is a heading anchor),
// REF, PATH.
//
// The REF is captured rather than pinned to `main`. Pinning it made the regex match
// NOTHING under any other ref, so `blob/mian/README.md` — a plain typo — and
// `blob/master/...` (this repo has no `master`) shipped as unchecked 404s: silently
// skipping a citation is the same defect as resolving it wrongly. `findDeadRepoLinks`
// decides per ref (resolve `main`, skip an immutable permalink, flag the rest).
//
// `<` and `>` are excluded alongside `)` and the quotes: `<https://…/README.md>` is a
// CommonMark autolink — a rendered, working link — and capturing the closing `>` as
// part of the path failed the build on it.
export const REPO_BLOB_RE =
  /https:\/\/github\.com\/foomakers\/pair\/(blob|tree|raw)\/([^/\s"'`<>]+)\/([^)\s"'`<>]+)/g

/**
 * The lines of a page a URL written on them is actually a LINK on — everything the link
 * checks below are allowed to see.
 *
 * Scanning the raw bytes gated text no reader can click, and broke builds on it. Through
 * the REAL gate on the real tree, before this: a ```bash fence holding `gh api
 * https://github.com/foomakers/pair/blob/main/does/not/exist.md` plus a prose code span
 * holding `…/also/missing.md` gave `FAIL — 2 issues`, and a page teaching this gate's OWN
 * ref rule — ``Never write `…/blob/master/README.md` — use main`` — gave `FAIL — 1 issue
 * · Bad ref in repo citation`. So the reference page could not state the counter-example
 * it exists to teach, and any CLI example embedding a repo URL in a fence was a mine.
 *
 * THE ORACLE HERE IS THE DOCS SITE ITSELF, not github.com. These pages are `.mdx`
 * rendered by fumadocs, and on two rows the two renderers disagree — which is exactly
 * why the site was measured rather than assumed. Counts are `<a href="…">` occurrences
 * in the prerendered `.next/server/app/docs/__link-surface-probe.html` after
 * `pnpm --filter @pair/website build`, one probe URL per row:
 *
 * | where the URL sits                        | site | github.com | read here |
 * | ----------------------------------------- | ---- | ---------- | --------- |
 * | prose, bare (autolink)                    | 1    | 1          | yes       |
 * | a markdown link destination               | 1    | 1          | yes       |
 * | an inline code span                       | 0    | 0          | no        |
 * | a fenced code block, with or without info | 0    | 0          | no        |
 * | a fence inside a list item / blockquote   | 0    | 0          | no        |
 * | a 4-space-indented line                   | 1    | 0 (code)   | YES       |
 * | a `{/* … *\/}` JSX comment                 | 0    | n/a        | no        |
 * | bare inside `<div>` (tight or blank-sep)  | 1    | 1          | yes       |
 * | bare inside `<pre>` (§ 4.6 kind 1)        | 1    | 0          | yes       |
 * | bare inside `<span>` (kind 7)             | 1    | 1          | yes       |
 * | bare inside a JSX component (`<Callout>`) | 1    | n/a        | yes       |
 * | an `<a href>` inside `<div>`              | 1    | 1          | yes       |
 * | a CODE SPAN inside `<div>`                | 0    | 1          | NO        |
 * | a FENCE inside `<div>`                    | 0    | 1          | NO        |
 *
 * Four rows diverge, and they are why a CommonMark reading alone is wrong in BOTH
 * directions at once: MDX gives indentation to JSX rather than to code blocks (so an
 * indented citation IS live and skipping it ships a 404 unchecked), and MDX parses JSX
 * children as ordinary markdown (so a code span or a fence inside a `<div>` is still
 * code — reading that block raw, as § 4.6 says, fails the build on unclickable text).
 *
 * Both are one flag on the shared reader: `readMarkdown(content, { mdx: true })` — no
 * § 4.6 HTML blocks, no § 4.4 indented code. WHICH lines are which stays
 * `@pair/content-ops`'s reader, the ONE both this gate and the knowledge-hub sweep sit
 * on (ADR-024), so a container-grammar fix still lands here too.
 *
 * An `<!-- … -->` line is then ordinary text and IS scanned; a page carrying one cannot
 * build at all — `pnpm --filter @pair/website build` fails with "Unexpected character
 * `!` … (note: to create a comment in MDX, use `{/* text *\/}`)" — so no reader can be
 * misled by that row either way.
 *
 * A masked construct becomes WHITESPACE, not nothing: a space cannot join two halves of
 * a URL, and `` [`<url>`](<url>) `` — a code span INSIDE a link — must report the
 * destination exactly once, which is what both renderers serve (1 `<a href>`, not 0 and
 * not 2). Newlines are kept so a reported line still counts.
 *
 * BOTH masked constructs are MULTI-LINE, so the masking runs over the JOINED surface
 * and not per leaf line. Masking line by line missed every wrapped one — a code span
 * `` `<url>\nand more` `` and, worse, the canonical MDX way to comment something out:
 *
 *     {/* TODO re-enable when the page lands:
 *     https://github.com/foomakers/pair/blob/main/does/not/exist.md
 *     *\/}
 *
 * Through the REAL gate on the real tree that gave `FAIL — 1 issue · Dead repo-file
 * citation`, on a URL fumadocs strips from the payload entirely.
 *
 * This mask sees LEAF TEXT ONLY, after the reader has decided block state — so it can
 * never un-open a fence. A comment that STARTS a line is therefore the reader's: under
 * `mdx: true` it emits those lines as `expression` events (no leaf, no fence), which is
 * what keeps a ```` ```bash ```` line inside a multi-line comment from opening a fence
 * that swallowed every citation after it (site 1 href, gate 0 errors). What is left for
 * this regex is the comment that starts MID-line, inside a paragraph's text.
 */
const JSX_COMMENT_RE = /\{\/\*[\s\S]*?\*\/\}/g

/**
 * The next code span at or after `from`, per CommonMark § 6.1: a backtick run opens a
 * span and the closer must be a run of EXACTLY the opener's length — a run of 2 cannot
 * close a run of 1. A BACKREFERENCE (`` /(`+)([\s\S]*?)\1/ ``) is a DIFFERENT rule: it
 * lets an opener of N pair with the first N backticks of any LONGER run. The direction
 * of that bug is the silent one — the mask blanks the bytes BETWEEN the two runs, so a
 * live citation stops being scanned and the gate prints PASS on a page that 404s.
 *
 * MEASURED on one paragraph, `` Use a ` here, see [dead](<repo-blob-url>) and ``double``
 * too. ``: the backreference blanks from the stray backtick to the first backtick of the
 * ``double`` run — URL included — and `findDeadRepoLinks` returns 0. Both real consumers
 * say that URL is a link: the site's own installed pipeline `@mdx-js/mdx@3.1.1` +
 * `remark-gfm@4.0.1` emits 1 `href:` (the site build is this surface's oracle, ADL
 * 2026-09-04), and `jq -Rs '{text:.}' row.mdx | gh api -X POST /markdown --input -`
 * emits 1 `href="…"`.
 *
 * An opener with no equal-length partner is literal text and the scan CONTINUES from the
 * next run rather than stopping — which is what keeps the one-byte-apart partner green:
 * in `` ``a`b`` `` the inner x1 IS a valid length-1 closer, so the same stray backtick
 * that is literal above opens a real span here (both oracles: 0 hrefs). Runs are matched
 * nearest-partner-first, so an x3 opener skips an intervening x2 run and closes on the
 * next x3 (both oracles: 0 hrefs), and an x3 whose only later run is x2 never closes
 * (both oracles: 1 href).
 */
function nextCodeSpan(surface: string, from: number): { index: number; length: number } | null {
  const RUN_RE = /`+/g
  RUN_RE.lastIndex = from
  const runs: Array<{ readonly at: number; readonly len: number }> = []
  for (let m = RUN_RE.exec(surface); m !== null; m = RUN_RE.exec(surface)) {
    runs.push({ at: m.index, len: m[0].length })
  }
  for (const [i, opener] of runs.entries()) {
    for (const closer of runs.slice(i + 1)) {
      if (closer.len !== opener.len) continue
      return { index: opener.at, length: closer.at + closer.len - opener.at }
    }
  }
  return null
}

/**
 * The surface with every code span and every `{/* … *\/}` blanked — scanned LEFT TO
 * RIGHT, because neither construct can be replaced globally before the other: each
 * one's OPENER is ordinary text inside the other, and both directions are live on the
 * real site (`<a href>` in the prerendered probe page):
 *
 * | bytes                                                    | site | why                          |
 * | -------------------------------------------------------- | ---- | ---------------------------- |
 * | `` {/* a ` comment *\/} `` … URL … a stray `` ` ``        | 1    | the comment opened first     |
 * | `` `{/*` `` … URL … `` `*\/}` ``                           | 1    | the spans opened first       |
 * | `` `<url> {/* x *\/}` ``                                   | 0    | the span opened first        |
 *
 * Masking spans first would blank the first row's URL; masking comments first would
 * blank the second's. Both are SILENT misses — a live 404 shipped unchecked — so the
 * rule is positional: whichever construct opens first wins and the scan resumes after
 * its close. WHETHER a backtick run opens anything at all is `nextCodeSpan`'s run-length
 * rule, not a backreference — and it is an input to this interleave, so the two rules
 * have a cross-product: a stray x1 backtick that is NOT a span leaves a following
 * `{/* … *\/}` as the first construct, while one that IS a span swallows the comment.
 * An unterminated `{/*` cannot build at all, so the scan steps over it and keeps going.
 */
function maskLiteralConstructs(surface: string): string {
  const blank = (text: string): string => text.replace(/[^\n]/g, ' ')
  let out = ''
  let at = 0
  while (at < surface.length) {
    const span = nextCodeSpan(surface, at)
    JSX_COMMENT_RE.lastIndex = at
    const found = JSX_COMMENT_RE.exec(surface)
    const comment = found === null ? null : { index: found.index, length: found[0].length }
    const first =
      span === null
        ? comment
        : comment === null
          ? span
          : span.index <= comment.index
            ? span
            : comment
    if (first === null) break
    const end = first.index + first.length
    out += surface.slice(at, first.index) + blank(surface.slice(first.index, end))
    at = end
  }
  return out + surface.slice(at)
}

/**
 * The scanned surface, masked BLOCK-LOCALLY.
 *
 * Both masked constructs may wrap a newline, so masking cannot run per leaf line —
 * but it must not run over the whole joined document either: neither construct can
 * cross a blank line on the real renderer, so an opener in one block pairing with a
 * closer in another blanks every URL between them. That direction is a SILENT
 * false-green (a dead citation shipped unchecked), which ADL 2026-09-03 names the
 * worse one. MEASURED on the site oracle at `d745f4d1`: a probe page carrying two
 * stray backticks in separate blocks with three URLs between them prerendered ALL
 * THREE as `<a href>`, while the gate blanked and never checked them.
 *
 * The group boundary is READ FROM THE READER, never guessed from the bytes and never
 * re-derived here (ADR-024): each leaf event answers `blockStart` directly, and a GFM
 * table row hands over its `cells`. The paragraph accumulator does NOT answer it — it is
 * reset AFTER the line that ends the paragraph is emitted, so a line that interrupts a
 * paragraph with no blank line between them carries a non-empty accumulator on its own.
 *
 * MANY line shapes interrupt one, not just the ATX heading: a thematic break, a marker
 * that opens a list or a block quote, a GFM table row, and — this renderer having no
 * § 4.6 type-7 rule — ANY JSX flow element, `<div>`, `<span>` and a component alike.
 * Each is measured on the site oracle (1 `<a href>` = the backticks did not pair = a
 * real boundary); the partner shapes that do NOT interrupt are measured the same way
 * and grouped with the paragraph: a 4-space-indented line and an ordered marker that
 * cannot interrupt (`2.`, `2)`). Both directions are silent when wrong — splitting a
 * block gates text no reader can click, merging two blanks a live citation — so the one
 * predicate that owns the reader's paragraph accumulator owns this grouping too.
 *
 * A TABLE is one reader block but N inline scopes: every cell is parsed on its own, so
 * each is masked on its own and a backtick in one never reaches a citation in another.
 */
function linkSurface(content: string): string {
  const masked: string[] = []
  let block: string[] = []
  const flush = (): void => {
    if (block.length > 0) masked.push(maskLiteralConstructs(block.join('\n')))
    block = []
  }
  for (const ev of readMarkdown(content, { frontmatter: true, mdx: true })) {
    if (ev.kind !== 'leaf') continue
    if (ev.blockStart || ev.cells !== undefined) flush()
    if (ev.cells === undefined) block.push(ev.text)
    else for (const cell of ev.cells) masked.push(maskLiteralConstructs(cell))
  }
  flush()
  return masked.join('\n')
}

/**
 * Check 5: every /docs link/href a reader can CLICK resolves to a known route. Read
 * from the rendered surface (see `linkSurface`), not the raw bytes: a `/docs/...`
 * target quoted inside a fence or a code span is literal text on the page.
 */
export function findDeadLinks(content: string, rel: string, validRoutes: Set<string>): string[] {
  const errors: string[] = []
  const surface = linkSurface(content)
  for (const re of [LINK_RE, HREF_RE]) {
    for (const m of surface.matchAll(re)) {
      const raw = m[1]
      if (raw === undefined) continue
      const head = (raw.split('#')[0] ?? '').split('?')[0] ?? ''
      const target = head.replace(/\/$/, '') || '/docs'
      if (!validRoutes.has(target)) {
        errors.push(`Dead internal link in ${rel}: ${raw} does not resolve to a docs page`)
      }
    }
  }
  return errors
}

/**
 * An immutable ref — a commit sha (7-40 hex) or a version tag. A permalink is pinned
 * ON PURPOSE and may legitimately point at a file `main` no longer has, so the working
 * tree cannot answer for it and the citation is skipped rather than failed. Every
 * OTHER non-`main` ref (`master`, `develop`, `mian`) is a mistake this gate reports.
 */
export function isPinnedRef(ref: string): boolean {
  return /^[0-9a-f]{7,40}$/i.test(ref) || /^v?\d+(?:\.\d+)*$/.test(ref)
}

/** GitHub's own line anchor: `#L203`, `#L203-L210`, `#L203C5-L210C9`. Not a heading. */
const LINE_ANCHOR_RE = /^L\d+(?:C\d+)?(?:-L\d+(?:C\d+)?)?$/

/**
 * A heading's rendered TEXT: inline markup reduced to what a reader sees, because that
 * is what github.com slugs. `#### [Templates](templates/README.md)` is anchored
 * `#templates` on the real site — slugging the raw line instead yields
 * `templatestemplatesreadmemd` and would fail the build on a live anchor.
 *
 * A CODE SPAN is not markup, it is literal text, and stripping the two together got it
 * wrong on a live heading: `### \`--root <issue-id>\` — subtree scope` is anchored
 * `#--root-issue-id--subtree-scope` on github.com, and reading `<issue-id>` as inline
 * HTML computed `#--root---subtree-scope` — a dead spelling for the one live anchor of
 * `pair-next`'s scope argument, in three files (`.claude/skills/pair-next/SKILL.md`,
 * its dataset mirror, `docs/reference/pair-next.mdx`). Same for `\`[a](b)\``, which
 * github anchors `#ab` (the brackets are text, not a link), and for `\`_snake_case_\``,
 * which keeps its underscores.
 *
 * So the code spans come out FIRST, as opaque placeholders carrying no character the
 * strip chain reacts to; the chain runs on what is left — which is why a link WRAPPING
 * a code span still resolves (`[\`Templates\`](t/README.md)` → `#templates-link`) — and
 * their literal content goes back in afterwards. A stray unmatched backtick is not a
 * span at all and is simply dropped, as github does.
 *
 * The placeholder is a PRIVATE-USE code point pair, not NUL: it must survive the chain
 * untouched, and it must not be a character a heading could plausibly contain.
 *
 * WHICH backtick runs pair is `nextCodeSpan` — CommonMark § 6.1's run-length rule, the
 * SAME one the link surface uses. A backreference (`` /(`+)([\s\S]*?)\1/ ``) let an x1
 * opener close on the first backtick of a LONGER run, and this surface diverged from
 * github.com in BOTH directions Check 5b exists to close — a live anchor reported dead
 * (`## Use a ` see [x](y) and ``d`` end` is `#use-a--see-x-and-d-end` on github.com; the
 * backreference spelled `#use-a--see-xy-and-d-end`) and a phantom spelling that passed.
 *
 * § 6.1's two CONTENT rules apply too, both measured with `gh api -X POST /markdown`:
 * a line ending inside a span becomes a space (`Use `a` / `b` end` over `---` anchors
 * `#use-a-b-end`), and ONE leading plus ONE trailing space are stripped when the content
 * has both and is not all spaces (`## Use a ` see [x](y) and ` end` → `#use-a-see-xy-and-end`;
 * `## Use ` a` end` keeps its space → `#use--a-end`; `## Use `  ` end` → `#use----end`).
 */
function codeSpanContent(span: string): string {
  const run = /^`+/.exec(span)?.[0].length ?? 0
  const content = span.slice(run, span.length - run).replace(/\n/g, ' ')
  const guarded =
    content.length >= 2 && content.startsWith(' ') && content.endsWith(' ') && content.trim() !== ''
  return guarded ? content.slice(1, -1) : content
}

function renderedHeadingText(heading: string): string {
  const spans: string[] = []
  let masked = ''
  let at = 0
  for (let span = nextCodeSpan(heading, at); span !== null; span = nextCodeSpan(heading, at)) {
    const end = span.index + span.length
    spans.push(codeSpanContent(heading.slice(span.index, end)))
    masked += `${heading.slice(at, span.index)}\uE000${spans.length - 1}\uE001`
    at = end
  }
  masked += heading.slice(at)
  const stripped = masked
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links + images -> their text
    .replace(/<[^>]+>/g, '') // inline HTML
    .replace(/`+/g, '') // a stray, unmatched backtick
    .replace(/\*+/g, '') // asterisk emphasis / strong
    // Underscore emphasis is word-BOUNDED: `_italic_` is markup, `snake_case` is text.
    .replace(/(^|[^\p{L}\p{N}_])_+/gu, '$1')
    .replace(/_+(?=[^\p{L}\p{N}_]|$)/gu, '')
  return stripped.replace(/\uE000(\d+)\uE001/g, (_all, i: string) => spans[Number(i)] ?? '')
}

/**
 * What github.com's KEEP set for a heading anchor actually is: Ruby's `\p{Word}` plus
 * `-` and U+0020 (github's markdown pipeline is Ruby). Everything else is dropped, then
 * U+0020 becomes `-`. Nothing is trimmed or collapsed afterwards, so `## 🎯 Quick Start`
 * anchors as `-quick-start` and a removed em-dash leaves the double hyphen in
 * `6-techrisk-matrixmd--adoption-delta`.
 *
 * The three classes that a `[^\p{L}\p{N}_\- ]` reading of "letters and digits" gets
 * WRONG, each of them a false-positive build break or a missed 404:
 *
 * | class                       | github.com | why it is not obvious                  |
 * | --------------------------- | ---------- | -------------------------------------- |
 * | `\p{M}` (Mn/Mc/Me)          | KEEP       | 278 variation selectors ride 276 repo headings — `## 🛠️ Essential Commands` anchors `#️-essential-commands`, LEADING U+FE0F |
 * | `\p{Join_Control}` (ZWJ/ZWNJ) | KEEP     | only these two of `Cf`; soft hyphen and RLM are dropped |
 * | `\p{Nl}` yes, `\p{No}` no   | split      | `\p{N}` keeps `①`, github drops it — Alphabetic covers `Ⅸ` |
 *
 * `github-slugger@2.0.0` is NOT the oracle here despite the shape being the same: it
 * DROPS U+200D where github.com keeps it (`secure-development.md`'s `👨‍💻 **SECURE
 * CODING STANDARDS**` is `#‍-secure-coding-standards` on github.com). Every row of
 * `slugifyHeading`'s unit table is github.com's own output — re-probe it, not the
 * package, with `gh api -X POST /markdown -f text='## <heading>'`.
 */
export function slugifyHeading(heading: string): string {
  // The trim is on the RAW heading, before any inline markup comes out: github trims the
  // heading's own text and nothing after that. `## \`<x>\` vs <x>` anchors `#x-vs-` —
  // the trailing hyphen is the space the stripped inline HTML left behind — exactly as
  // `## 🎯 Quick Start` anchors `#-quick-start` from the space the dropped emoji left.
  return renderedHeadingText(heading.trim())
    .toLowerCase()
    .replace(/[^\p{Alphabetic}\p{M}\p{Nd}\p{Pc}\p{Join_Control}\- ]/gu, '')
    .replace(/ /g, '-')
}

/**
 * An explicit anchor is ANY tag's `id`/`name`, not only `<a>`'s, and the value may be
 * double-quoted, single-quoted or bare: github.com rewrites every one of them to
 * `user-content-<value>`, so `<div id="x">`, `<h2 id="x">` and `<div id=x>` are all live
 * `#x` anchors a reader can reach. Reading `<a …>` alone called
 * `framework-patterns/components.md`'s `id={`panel-${value}`}` dead. The bare form
 * deliberately admits a backtick: github's HTML parser consumes it (a parse error the
 * spec still defines), and that is the byte sequence that file actually ships.
 *
 * `[^>]` spans newlines on purpose — a raw tag may lay its attributes across several
 * lines (`<div` / `role="tabpanel"` / `id={…}` / `>`), which is why an HTML block is
 * handed to this function JOINED rather than line by line.
 */
const EXPLICIT_ANCHOR_RE = /<[a-zA-Z][^>]*?\s(?:name|id)=(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+))/g

function explicitAnchorsIn(text: string): string[] {
  const found: string[] = []
  for (const m of text.matchAll(EXPLICIT_ANCHOR_RE)) {
    const value = m[1] ?? m[2] ?? m[3]
    if (value !== undefined && value !== '') found.push(value)
  }
  return found
}

/**
 * github.com's duplicate-slug rule, as a stateful adder over one document.
 *
 * It is a SKIP-UNTIL-FREE loop and not a per-base occurrence counter: the candidate
 * `${base}-${n}` is retried with a climbing `n` until it names a slug no earlier heading
 * already took. The two agree until a heading's NATURAL slug spells a generated one —
 * `## Foo`, `## Foo 1`, `## Foo`, `## Foo` anchors `foo`, `foo-1`, `foo-2`, `foo-3` on
 * github.com, where a counter computes `foo-2` for the LAST heading and never emits
 * `foo-3` at all. That is a live URL this gate would call dead, and its mirror is a
 * citation the gate calls fine that drops the reader on the unrelated `Foo 1` heading.
 *
 * `taken` holds only the slugs the loop itself generated, which is the scope github's
 * slugger has: an explicit `<a name>` is separate HTML it never consults, so it must not
 * push a later duplicate heading forward.
 */
function headingSlugAdder(slugs: Set<string>): (heading: string) => void {
  const taken = new Set<string>()
  const nextIndex = new Map<string, number>()
  return heading => {
    const base = slugifyHeading(heading)
    if (base === '') return
    let slug = base
    while (taken.has(slug)) {
      const n = (nextIndex.get(base) ?? 0) + 1
      nextIndex.set(base, n)
      slug = `${base}-${n}`
    }
    taken.add(slug)
    slugs.add(slug)
  }
}

/**
 * The anchors ONE rendered markdown line offers: its heading (ATX, or setext over the
 * paragraph above it) and any explicit `id`/`name` it carries. An indented code block
 * renders as code and offers neither.
 */
function addLeafAnchors(
  ev: Extract<MarkdownEvent, { kind: 'leaf' }>,
  add: (heading: string) => void,
  slugs: Set<string>,
): void {
  if (ev.indentedCode) return
  const atx = atxHeadingText(ev.text)
  if (atx !== undefined) add(atx)
  else if (ev.paragraph.length > 0 && isSetextUnderline(ev.text)) add(ev.paragraph.join('\n'))
  for (const a of explicitAnchorsIn(ev.text)) slugs.add(a)
}

/**
 * Every anchor a markdown file offers: ATX (`## X`) and setext (`X` over `===`/`---`)
 * headings, plus explicit `<a name>`/`<a id>` anchors.
 *
 * WHICH LINES those are is `@pair/content-ops`'s `readMarkdown` — the SAME container-
 * and HTML-block-aware CommonMark block reader the knowledge-hub conformance sweep
 * uses, so one grammar fix lands in both. Reading lines at document level only made
 * this gate disagree with github.com in both directions: the live
 * `apps/pair-cli/CHANGELOG.md#release-v020---enhanced-cli-distribution--documentation`
 * (an ATX heading inside a list item, one of five such CHANGELOGs) failed the build,
 * while `# Doc` / `<div>` / `## InDiv` / `</div>` / `## Real` served a phantom `#indiv`
 * that PASSES the gate and 404s for every reader.
 *
 * An explicit `<a name>` is read from leaf lines and from the HTML blocks github.com
 * still renders (`HTML_KINDS_RENDERING_ANCHORS`), never from a code fence, an indented
 * code block or an HTML comment.
 *
 * A SETEXT heading's text is the WHOLE paragraph above the underline, not its last
 * line: `Some paragraph` / `line two` / `---` anchors `#some-paragraphline-two`.
 *
 * Repeated slugs are disambiguated by `headingSlugAdder`, which owns that rule.
 */
export function collectHeadingSlugs(markdown: string): Set<string> {
  const slugs = new Set<string>()
  const add = headingSlugAdder(slugs)
  let htmlBlock: string[] | undefined
  const flushHtmlBlock = (): void => {
    for (const a of htmlBlock === undefined ? [] : explicitAnchorsIn(htmlBlock.join('\n')))
      slugs.add(a)
    htmlBlock = undefined
  }

  for (const ev of readMarkdown(markdown, { frontmatter: true })) {
    if (ev.kind === 'leaf') {
      addLeafAnchors(ev, add, slugs)
    } else if (ev.kind === 'html-open') {
      htmlBlock = HTML_KINDS_RENDERING_ANCHORS.has(ev.htmlKind) ? [ev.text] : undefined
    } else if (ev.kind === 'html-body') {
      htmlBlock?.push(ev.text)
    } else if (ev.kind === 'html-end') {
      flushHtmlBlock()
    }
  }
  flushHtmlBlock()
  return slugs
}

/**
 * The path and the `#fragment` a captured citation carries.
 *
 * The fragment is split FIRST (in a URL everything after the first `#` is the
 * fragment), then the query is taken off the path — `?plain=1#anchor` carries both.
 * `?plain=1` is GitHub's own spelling for the source view of a rendered markdown file;
 * resolving it literally would fail the build on a live URL. A bare-prose citation ends
 * in the sentence's full stop, which belongs to whichever piece ends the URL.
 *
 * BOTH halves are then percent-DECODED, because that is what the reader's browser
 * resolves: `docs/my%20file.md` is the file `docs/my file.md`, and github.com puts
 * `#option-c--full-di%C3%A1taxis-re-org-heavier` in the address bar for the heading it
 * anchors `#option-c--full-diátaxis-re-org-heavier`. Decoding the path only meant a
 * citation in its own canonical spelling failed the gate. Decoding a fragment is safe
 * in both directions: `%` is not in the anchor KEEP set, so a literal `%` in a fragment
 * is always an escape (or a malformed one). A malformed escape (`100%-coverage`) makes
 * `decodeURIComponent` throw — that half resolves literally, never an exception out of
 * a docs gate, and independently of the other half.
 */
function decodeOrLiteral(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export function parseCitation(raw: string): { path: string; fragment: string } {
  const hash = raw.indexOf('#')
  const beforeHash = hash === -1 ? raw : raw.slice(0, hash)
  const fragment = hash === -1 ? '' : raw.slice(hash + 1).replace(/[.,;:]+$/, '')
  const encoded = (beforeHash.split('?')[0] ?? '').replace(/[.,;:]+$/, '')
  return { path: decodeOrLiteral(encoded), fragment: decodeOrLiteral(fragment) }
}

/**
 * A fragment, rendered so two spellings that differ only by an INVISIBLE code point
 * cannot collapse into each other in a terminal. Printable ASCII passes through; every
 * other code point becomes `\u{XXXX}`, and a literal backslash is doubled so the escape
 * itself cannot be spoofed by a fragment that merely spells `\u{FE0F}` in ASCII.
 *
 * Without it the diagnostic is unreadable exactly where this gate matters most:
 * `CLAUDE.md#-essential-commands` (dead) and `CLAUDE.md#️-essential-commands` (live,
 * leading U+FE0F) print IDENTICALLY, so "no heading slugs to it" reads as a false
 * positive and the developer deletes a working fragment.
 */
function escapeForDiagnostic(s: string): string {
  let out = ''
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0
    if (ch === '\\') out += '\\\\'
    else if (cp >= 0x20 && cp <= 0x7e) out += ch
    else out += `\\u{${cp.toString(16).toUpperCase()}}`
  }
  return out
}

/** Levenshtein distance over CODE POINTS (an astral char is one edit, not two). */
function editDistance(a: string, b: string): number {
  const x = [...a]
  const y = [...b]
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j)
  for (let i = 1; i <= x.length; i++) {
    const cur = [i]
    for (let j = 1; j <= y.length; j++) {
      const sub = (prev[j - 1] ?? 0) + (x[i - 1] === y[j - 1] ? 0 : 1)
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, sub)
    }
    prev = cur
  }
  return prev[y.length] ?? 0
}

const MAX_SUGGESTIONS = 3
const MAX_SUGGESTION_DISTANCE = 3

/**
 * How far a candidate may sit from the dead spelling — a fragment against a heading
 * slug, or a path segment against a sibling filename: the absolute budget AND half the
 * longer of the two, whichever is smaller.
 *
 * The absolute bound alone is meaningless on short strings — at 3 edits EVERY 3-code-
 * point slug in the file is "near" any 3-code-point fragment, so `#zzz` in a file of
 * `## Cat` / `## Dog` / `## Elk` came back "did you mean #cat or #dog or #elk?". That is
 * worse than silence: a developer who takes the advice writes an anchor that RESOLVES,
 * the gate then prints PASS, and the reader lands on an unrelated section — the silent
 * wrong-destination anchor this fragment check exists to catch, induced by the check.
 * The relative half caps the offer at a genuine near-miss (the motivating case, an
 * invisible code point, is distance 1 on a 20-code-point slug).
 */
function suggestionBudget(value: string, candidate: string): number {
  const longer = Math.max([...value].length, [...candidate].length)
  return Math.min(MAX_SUGGESTION_DISTANCE, Math.floor(longer / 2))
}

/**
 * The candidates closest to a dead spelling: an invisible-code-point miss is distance 1.
 * Used for BOTH halves of a citation — the heading slugs of the cited file, and the
 * sibling names of the directory a path segment missed in.
 */
function nearest(value: string, candidates: Iterable<string>): string[] {
  return [...candidates]
    .map(candidate => ({ candidate, d: editDistance(value, candidate) }))
    .filter(c => c.d <= suggestionBudget(value, c.candidate))
    .sort(
      (a, b) => a.d - b.d || (a.candidate < b.candidate ? -1 : a.candidate > b.candidate ? 1 : 0),
    )
    .slice(0, MAX_SUGGESTIONS)
    .map(c => c.candidate)
}

/**
 * A candidate, rendered so it is both READABLE and PASTEABLE: the `\u{…}` escape makes
 * it distinguishable from the dead spelling, and the raw `(copy: …)` form is the bytes
 * the developer must actually type. Escape-only advice was a dead end — following it
 * literally (`#\u{FE0F}-essential-commands`, ASCII) left the citation dead AND, being 8
 * code points from the real slug (measured with `editDistance` above; the budget is 3),
 * stripped the candidate from the second message too.
 * Omitted when escaping is a no-op, so an ordinary typo hint stays one string.
 *
 * `prefix` is what the developer must type in FRONT of it — `#` for a fragment, nothing
 * for a repo path — so both halves of a citation offer the same pasteable shape.
 */
function renderCandidate(value: string, prefix: string): string {
  const escaped = escapeForDiagnostic(value)
  return escaped === value ? `${prefix}${escaped}` : `${prefix}${escaped} (copy: ${prefix}${value})`
}

/**
 * Does the `#fragment` land on a real heading? Only asked where a fragment MEANS a
 * heading: `tree/` is a directory listing, `raw/` serves bytes, and GitHub's own line
 * anchor (`#L203`) is not a heading and never will be — failing any of those would
 * break the build on a live URL.
 */
function anchorError(kind: string, path: string, fragment: string, root: string): string | null {
  if (fragment === '' || kind !== 'blob' || !/\.mdx?$/.test(path)) return null
  if (LINE_ANCHOR_RE.test(fragment)) return null
  let source: string
  try {
    source = readFileSync(join(root, path), 'utf-8')
  } catch {
    // The one remaining unguarded filesystem read on the citation path. A `.md` path
    // that resolves to a DIRECTORY passes `existsCaseSensitive` and the extension test,
    // then threw EISDIR with a raw stack trace out of the gate — never an exception out
    // of a docs gate, the same standard `decodeOrLiteral` above already applies. An
    // error rather than a crash is also the honest verdict: github.com serves such a
    // `blob/main/<dir>` URL as a tree listing, which anchors nothing.
    return `${path}#${escapeForDiagnostic(fragment)} — not a readable markdown file`
  }
  const slugs = collectHeadingSlugs(source)
  if (slugs.has(fragment)) return null
  const near = nearest(fragment, slugs)
  const hint =
    near.length === 0
      ? ''
      : `; did you mean ${near.map(c => renderCandidate(c, '#')).join(' or ')}?`
  return `${path}#${escapeForDiagnostic(fragment)} — no heading in that file slugs to it${hint}`
}

/**
 * A dead repo PATH, reported the way the fragment half already reports a dead anchor:
 * losslessly, and naming WHICH segment missed plus what its parent directory really
 * lists.
 *
 * The motivating bug is a path bug. Citing `.pair/adoption/tech/ADR/adr-018-code-host-
 * optional-wow-override.md` (capital `ADR`) used to print only `… does not exist in the
 * repo` — the whole 6-segment path declared wrong, with no candidate, while
 * `resolveCaseSensitiveSync` held the answer: the segment `ADR`, in a directory that
 * lists `adr`. `curl -s -o /dev/null -w '%{http_code}'` gives 404 on the miscased URL
 * and 200 on the suggested one, so the offered spelling is the one that resolves.
 *
 * The escape is not decoration either: a segment differing from the real one only by an
 * invisible or confusable code point prints IDENTICALLY to it, so the message reads as a
 * false positive and the developer deletes a working citation.
 *
 * The budget is the SAME `suggestionBudget` the anchor half uses, for the same reason: a
 * candidate offered from far away is advice that makes the gate pass while the citation
 * still points somewhere else.
 */
function deadPathError(path: string, walk: CaseSensitiveWalk): string {
  if (walk.kind === 'resolved') return ''
  // A sibling that matches IGNORING CASE is not a guess, it is the answer: this walk
  // fails on case by construction, and `ADR` vs `adr` is 3 edits over 3 code points —
  // outside `suggestionBudget`, which is tuned for near-misses in long anchor slugs.
  // Offering it by edit distance alone would have withheld the candidate in exactly
  // the case the check was written for.
  const sameIgnoringCase = walk.siblings.filter(
    name => name.toLowerCase() === walk.segment.toLowerCase(),
  )
  const near = sameIgnoringCase.length > 0 ? sameIgnoringCase : nearest(walk.segment, walk.siblings)
  const shown = escapeForDiagnostic(path)
  const where = ` (segment "${escapeForDiagnostic(walk.segment)}")`
  if (near.length === 0) return `${shown} does not exist in the repo${where}`
  // The candidate is offered as the WHOLE path with that one segment replaced — the
  // bytes to paste, not a fragment of them to reassemble by hand.
  const suggestions = near
    .map(sibling => renderCandidate(replaceSegment(walk, sibling), ''))
    .join(' or ')
  return `${shown} does not exist in the repo${where}; did you mean ${suggestions}?`
}

/**
 * The walked path with the segment the walk STOPPED AT replaced — spliced at its index,
 * never re-found by name.
 *
 * A path may repeat a segment name. `apps/website/apps/x.md` fails on its THIRD
 * segment, and `parts.indexOf('apps')` rewrote the FIRST: the check offered
 * `app/website/apps/x.md`, a path that resolves no better than the one cited and one
 * the developer never wrote. The contract here is that the offered spelling is the one
 * that resolves (404 vs 200 on the two github.com blob URLs).
 */
function replaceSegment(
  walk: Extract<CaseSensitiveWalk, { kind: 'missing' }>,
  replacement: string,
): string {
  const parts = [...walk.segments]
  parts[walk.depth] = replacement
  return parts.join('/')
}

/**
 * Check 5b: every `{blob,tree,raw}/<ref>/<path>` citation resolves to a real repo path
 * — and, when it carries a `#fragment` into a markdown file, to a real heading.
 *
 * The fragment is the half the check used to drop on the floor: it proved the FILE
 * existed and said nothing about where the reader lands. Renaming
 * `## Callers Matrix (Scoped Capabilities)` in `skills-guide.md` dropped every reader
 * at the top of a 200-line file while `docs:staleness` still printed PASS.
 */
export function findDeadRepoLinks(content: string, rel: string, root: string): string[] {
  const errors: string[] = []
  for (const m of linkSurface(content).matchAll(REPO_BLOB_RE)) {
    const [, kind, ref, raw] = m
    if (kind === undefined || ref === undefined || raw === undefined) continue
    const { path, fragment } = parseCitation(raw)
    if (path === '') continue

    if (ref !== 'main') {
      // A permalink is pinned on purpose; anything else is a mistake this gate reports.
      if (!isPinnedRef(ref)) {
        errors.push(
          `Bad ref in repo citation in ${rel}: ${kind}/${ref}/${path} — use main/ (or an immutable sha/tag permalink)`,
        )
      }
      continue
    }
    const walk = resolveCaseSensitiveSync(root, path)
    if (walk.kind === 'missing') {
      errors.push(`Dead repo-file citation in ${rel}: ${deadPathError(path, walk)}`)
      continue
    }
    const anchor = anchorError(kind, path, fragment, root)
    if (anchor !== null) errors.push(`Dead anchor in repo citation in ${rel}: ${anchor}`)
  }
  return errors
}
