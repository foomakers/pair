/**
 * Docs Staleness Check — verifies the published docs site matches source-of-truth
 * code artifacts (skills corpus, CLI commands, how-to guides) and has no dead
 * internal links.
 *
 * This is the website-docs integrity gate. The LOGIC lives here as individually
 * exported, unit-tested functions (see docs-staleness-check.test.ts, white-box).
 * The `main()` block is a thin CLI wrapper run via `tsx lib/docs-staleness-check.ts`
 * (package script `docs:staleness`); it prints the same output and exit codes as
 * before. Exit 0 = in sync, Exit 1 = drift detected.
 *
 * DOCS_STALENESS_ROOT overrides the repo root (used to point the checks at a
 * fixture tree). Absent, the repo root is resolved from this file's location:
 * apps/website/lib -> apps/website -> apps -> <repo root> (up 3).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join, relative, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
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

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))

/** Resolve the repo root, honouring the DOCS_STALENESS_ROOT override. */
export function resolveRoot(): string {
  const override = process.env['DOCS_STALENESS_ROOT']
  return override ? resolve(override) : resolve(MODULE_DIR, '../../..')
}

// --- Regexes (exported so their intent is documented and directly testable) ---

// Skill total-count phrasings across docs. Narrow to avoid prose false positives
// but covers "N skills", "N+ skills" (trailing plus), and an optional total-count
// adjective — "N pair/composable/agent/idempotent skills". Subset counts
// ("9 process skills") do NOT match: the adjective, when present, must be one of
// the whitelisted total-count words.
export const SKILL_COUNT_RE =
  /(\d+)\+?\s+(?:declared\s+)?(?:pair\s+|composable\s+|agent\s+|idempotent\s+)?skills/g

// A quoted `claude plugin details` transcript: `Skills (1)`. Pinned because it is an
// assertion about our OWN plugin manifest, not a third-party observation — and because
// the marketplace docs quoted a stale count while the manifest held another, drift no
// phrasing above could catch. Anchored on the literal capitalized `Skills (`, so the
// sibling `Agents (0)` / `Hooks (0)` counts in the same transcript never match.
//
// It is checked against the count the PLUGIN MANIFEST declares, NOT against the dataset
// skill count: since the payload shrank to the bootstrap corpus, the plugin declares one
// skill while the dataset holds 41, and conflating the two would demand a number that is
// wrong on both readings.
export const SKILL_COUNT_PROBE_RE = /\bSkills \((\d+)\)/g

// How-to guide count phrasings. Requires a how-to qualifier so arbitrary
// "N guides" prose ("5 guides at the museum") never false-positives: a match
// needs EITHER a recognized adjective (sequential/step-by-step) OR a
// how-to/process word. Bare "N guides" does not match. Covers "9 how-to guides",
// "9 process guides", "9 sequential guides", "9 step-by-step guides",
// "9 sequential how-to guides", "9 step-by-step process guides".
export const GUIDE_COUNT_RE =
  /(\d+)\s+(?:(?:sequential|step-by-step)\s+(?:how-to\s+|process\s+)?|(?:how-to|process)\s+)guides/g

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

// --- Filesystem helpers ---

/** Skill names under a category dir: its subdirs, or the category itself if it's a meta skill (SKILL.md at the category root). */
export function getSkillNames(categoryDir: string): string[] {
  const entries = readdirSync(categoryDir, { withFileTypes: true })
  const subdirs = entries.filter(d => d.isDirectory()).map(d => d.name)
  if (subdirs.length > 0) return subdirs
  if (existsSync(join(categoryDir, 'SKILL.md'))) return [basename(categoryDir)]
  return []
}

/** Every skill name across all category dirs under skillsDir. */
export function collectSkills(skillsDir: string): string[] {
  const categories = readdirSync(skillsDir, { withFileTypes: true }).filter(d => d.isDirectory())
  const all: string[] = []
  for (const cat of categories) all.push(...getSkillNames(join(skillsDir, cat.name)))
  return all
}

/** All .mdx files under dir, recursively. */
export function walkMdx(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkMdx(full))
    else if (entry.name.endsWith('.mdx')) out.push(full)
  }
  return out
}

/**
 * How many skills the plugin manifest declares. `null` if the manifest is missing —
 * the caller then skips the probe check rather than pinning every transcript to 0.
 */
export function countDeclaredPluginSkills(manifestPath: string): number | null {
  if (!existsSync(manifestPath)) return null
  const raw: unknown = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  const skills = (raw as { skills?: unknown }).skills
  if (Array.isArray(skills)) return skills.length
  return typeof skills === 'string' ? 1 : 0
}

/** Count of how-to guide files (NN-how-to-*.md) in a KB how-to dir. `null` if the dir is missing. */
export function countHowToGuides(howToDir: string): number | null {
  if (!existsSync(howToDir)) return null
  return readdirSync(howToDir).filter(f => /^\d+-how-to-.*\.md$/.test(f)).length
}

// --- Pure per-content checks (return error strings; no I/O) ---

/** Check 1: every "N skills" phrasing in content matches the actual skill count. */
export function findSkillCountMismatches(content: string, rel: string, actual: number): string[] {
  return countMismatches(content, rel, actual, { re: SKILL_COUNT_RE, label: 'Skill count' })
}

/**
 * Check 1b: every quoted `Skills (N)` plugin transcript matches what the plugin
 * manifest declares. Separate from check 1 on purpose — see SKILL_COUNT_PROBE_RE.
 */
export function findPluginSkillCountMismatches(
  content: string,
  rel: string,
  declared: number,
): string[] {
  return countMismatches(content, rel, declared, {
    re: SKILL_COUNT_PROBE_RE,
    label: 'Plugin skill count',
  })
}

function countMismatches(
  content: string,
  rel: string,
  actual: number,
  kind: { re: RegExp; label: string },
): string[] {
  const { re, label } = kind
  const errors: string[] = []
  for (const m of content.matchAll(re)) {
    const n = m[1]
    if (n !== undefined && parseInt(n, 10) !== actual) {
      errors.push(`${label} mismatch in ${rel}: docs say "${m[0]}", actual count is ${actual}`)
    }
  }
  return errors
}

/** Check 2b: every "N how-to guides" phrasing in content matches the actual guide count. */
export function findGuideCountMismatches(content: string, rel: string, actual: number): string[] {
  const errors: string[] = []
  for (const m of content.matchAll(GUIDE_COUNT_RE)) {
    const n = m[1]
    if (n !== undefined && parseInt(n, 10) !== actual) {
      errors.push(
        `How-to guide count mismatch in ${rel}: docs say "${m[0]}", actual count is ${actual}`,
      )
    }
  }
  return errors
}

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
 * A masked span becomes a SPACE, not nothing: a space cannot join two halves of a URL,
 * and `` [`<url>`](<url>) `` — a code span INSIDE a link — must report the destination
 * exactly once, which is what both renderers serve (1 `<a href>`, not 0 and not 2).
 */
const JSX_COMMENT_RE = /\{\/\*[\s\S]*?\*\/\}/g

function* linkSurface(content: string): Generator<string> {
  for (const ev of readMarkdown(content, { frontmatter: true, mdx: true })) {
    if (ev.kind === 'leaf') yield ev.text.replace(CODE_SPAN_RE, ' ').replace(JSX_COMMENT_RE, ' ')
  }
}

/**
 * Check 5: every /docs link/href a reader can CLICK resolves to a known route. Read
 * from the rendered surface (see `linkSurface`), not the raw bytes: a `/docs/...`
 * target quoted inside a fence or a code span is literal text on the page.
 */
export function findDeadLinks(content: string, rel: string, validRoutes: Set<string>): string[] {
  const errors: string[] = []
  const surface = [...linkSurface(content)].join('\n')
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
 */
const CODE_SPAN_RE = /(`+)([\s\S]*?)\1/g

function renderedHeadingText(heading: string): string {
  const spans: string[] = []
  const masked = heading.replace(CODE_SPAN_RE, (_all, _ticks, body: string) => {
    spans.push(body)
    return `\uE000${spans.length - 1}\uE001`
  })
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
    .map(sibling => renderCandidate(replaceSegment(path, walk.segment, sibling), ''))
    .join(' or ')
  return `${shown} does not exist in the repo${where}; did you mean ${suggestions}?`
}

/** The path with its FIRST occurrence of `segment` (as a whole segment) replaced. */
function replaceSegment(path: string, segment: string, replacement: string): string {
  const parts = path.split('/')
  const at = parts.indexOf(segment)
  if (at === -1) return replacement
  return [...parts.slice(0, at), replacement, ...parts.slice(at + 1)].join('/')
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
  for (const m of [...linkSurface(content)].join('\n').matchAll(REPO_BLOB_RE)) {
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

// --- Catalog ROW CONTENT (single-sourced from the dataset SKILL.md frontmatter) ---
//
// checkCatalogSync (Check 2) pins the catalog's skill NAME LIST to the dataset;
// findSkillCountMismatches pins the "N skills" COUNTS. Neither pins the per-row
// Command / Description CONTENT, which used to be hand-maintained and could drift
// silently from the dataset. checkCatalogContent (Check 2c) closes that gap: the
// Command is DERIVED from category+name (the same transform `pair update` applies)
// and the Description from the skill's frontmatter — so the dataset is the single
// source of truth, CI-enforced. (The Composes column is NOT owned by this check.)

export interface SkillEntry {
  category: string
  name: string
}

export interface ExpectedRow {
  command: string
  description: string
}

/**
 * category+name → the slash-command, the same name transform `pair update` applies
 * when mirroring the dataset into `.claude/skills/`: a meta skill (its SKILL.md sits
 * at the category root, so name === category, e.g. `next`) becomes `/pair-<name>`;
 * every other skill becomes `/pair-<category>-<name>`.
 */
export function deriveSkillCommand(category: string, name: string): string {
  return name === category ? `/pair-${name}` : `/pair-${category}-${name}`
}

/** Enumerate every dataset skill as {category, name} (categories × getSkillNames). */
export function collectSkillEntries(skillsDir: string): SkillEntry[] {
  const categories = readdirSync(skillsDir, { withFileTypes: true }).filter(d => d.isDirectory())
  const out: SkillEntry[] = []
  for (const cat of categories) {
    for (const name of getSkillNames(join(skillsDir, cat.name))) {
      out.push({ category: cat.name, name })
    }
  }
  return out
}

/** Absolute path to a skill's SKILL.md (a meta skill lives at the category root). */
export function skillMdPath(skillsDir: string, entry: SkillEntry): string {
  return entry.name === entry.category
    ? join(skillsDir, entry.category, 'SKILL.md')
    : join(skillsDir, entry.category, entry.name, 'SKILL.md')
}

/** The quoted `description:` scalar from a SKILL.md's YAML frontmatter (empty if absent). */
export function readSkillDescription(skillMdContent: string): string {
  const m = skillMdContent.match(/^description:\s*"([\s\S]*?)"\s*$/m)
  return m?.[1] ?? ''
}

// Abbreviations whose trailing period does NOT end a sentence ("e.g.", "etc.").
const SENTENCE_ABBREVIATIONS = /(?:e\.g|i\.e|etc|vs|approx)$/i

/**
 * The lead sentence of a frontmatter description, as the catalog renders it. Ends at
 * the first sentence-terminating period (one followed by whitespace/EOS, skipping
 * known abbreviations and mid-token dots like `.pair/…`), OR — for skills whose lead
 * is followed by a `$scope`/`$mode` enumeration ("… rule): `$scope: diff` …") — at
 * the `:` that introduces it. A closing period is always ensured.
 */
export function extractFirstSentence(description: string): string {
  let cut = description.length
  const mode = /:\s(?=`\$)/.exec(description)
  if (mode && mode.index + 1 < cut) cut = mode.index + 1
  const period = /\.(?=\s|$)/g
  let m: RegExpExecArray | null
  while ((m = period.exec(description)) !== null) {
    if (SENTENCE_ABBREVIATIONS.test(description.slice(0, m.index))) continue
    if (m.index + 1 < cut) cut = m.index + 1
    break
  }
  const lead = description.slice(0, cut).replace(/:\s*$/, '').trim()
  return /[.!?]$/.test(lead) ? lead : `${lead}.`
}

/**
 * Render bare `/short-name` command references as the catalog does — backticked,
 * fully-qualified `` `/pair-…` ``. A `/` only starts a command token at a word
 * boundary (not after a letter/backtick), so slash-joined prose like
 * "map-subdomains/map-contexts" is left intact.
 */
export function transformCommandTokens(text: string, commandByName: Map<string, string>): string {
  return text.replace(/(^|[^\w`])\/([a-z][a-z0-9-]*)/g, (full, pre: string, name: string) => {
    const cmd = commandByName.get(name)
    return cmd ? `${pre}\`${cmd}\`` : full
  })
}

/** The catalog Description a skill should have: its frontmatter lead, catalog-rendered. */
export function deriveCatalogDescription(
  frontmatterDescription: string,
  commandByName: Map<string, string>,
): string {
  return transformCommandTokens(extractFirstSentence(frontmatterDescription), commandByName)
}

/** Derive the expected Command + Description for every dataset skill (name → row). */
export function generateCatalogRows(skillsDir: string): Map<string, ExpectedRow> {
  const entries = collectSkillEntries(skillsDir)
  const commandByName = new Map(entries.map(e => [e.name, deriveSkillCommand(e.category, e.name)]))
  const rows = new Map<string, ExpectedRow>()
  for (const e of entries) {
    const desc = readSkillDescription(readFileSync(skillMdPath(skillsDir, e), 'utf-8'))
    rows.set(e.name, {
      command: deriveSkillCommand(e.category, e.name),
      description: deriveCatalogDescription(desc, commandByName),
    })
  }
  return rows
}

/** Parse a skill's Command + Description cells from its catalog table row (null if absent). */
export function parseCatalogRow(
  catalog: string,
  skill: string,
): { command: string; description: string } | null {
  for (const line of catalog.split('\n')) {
    const m = line.match(/^\|\s*\*\*([a-z0-9-]+)\*\*\s*\|/)
    if (!m || m[1] !== skill) continue
    // `| **skill** | `/cmd` | description | (composes) |` → ['', '**skill**', '`/cmd`', 'desc', …]
    const cells = line.split('|').map(c => c.trim())
    return {
      command: (cells[2] ?? '').replace(/^`|`$/g, ''),
      description: cells[3] ?? '',
    }
  }
  return null
}

/**
 * Check 2c: every catalog row's Command + Description MATCH the dataset-derived truth.
 * Presence/absence of rows is checkCatalogSync's job — a skill with no row is skipped
 * here (checkCatalogSync already flags it) rather than double-reported.
 */
export function checkCatalogContent(expected: Map<string, ExpectedRow>, catalog: string): string[] {
  const errors: string[] = []
  for (const [skill, exp] of expected) {
    const row = parseCatalogRow(catalog, skill)
    if (row === null) continue
    if (row.command !== exp.command) {
      errors.push(
        `Catalog command drift for "${skill}": expected \`${exp.command}\` but catalog has \`${row.command}\``,
      )
    }
    if (row.description !== exp.description) {
      errors.push(
        `Catalog description drift for "${skill}": expected "${exp.description}" but catalog has "${row.description}"`,
      )
    }
  }
  return errors
}

/** Check 2: catalog lists every skill dir, and no catalog row lacks a dir (both directions). */
export function checkCatalogSync(allSkills: string[], catalog: string): string[] {
  const errors: string[] = []
  for (const skill of allSkills) {
    if (!catalog.includes(`**${skill}**`)) {
      errors.push(`Skill "${skill}" exists in .skills/ but missing from skills-catalog.mdx`)
    }
  }
  const catalogSkills = [...catalog.matchAll(/\| \*\*([a-z0-9-]+)\*\* \|/g)]
    .map(m => m[1])
    .filter((s): s is string => s !== undefined)
  for (const docSkill of catalogSkills) {
    if (!allSkills.includes(docSkill)) {
      errors.push(`Skill "${docSkill}" in skills-catalog.mdx but no matching dir in .skills/`)
    }
  }
  return errors
}

/**
 * Check: the batch-engine page names the directories the registries actually install.
 *
 * AC8 asks for a note "derived from the dataset rather than hand-copied". The prose is
 * hand-written, but the FACTS it states — which paths appear in an adopter's repo — are
 * read from `config.json` here, so renaming a registry target without touching the page
 * fails the gate instead of leaving a doc that points at a directory nobody gets.
 */
export function checkBatchEnginePaths(
  registries: Record<string, { targets: { path: string }[] }>,
  doc: string,
): string[] {
  const errors: string[] = []
  for (const name of ['workflows', 'agent-definitions']) {
    const reg = registries[name]
    if (!reg) {
      errors.push(`asset_registries."${name}" is gone but batch-engine.mdx still documents it`)
      continue
    }
    for (const t of reg.targets) {
      // Documented with or without the trailing slash — the path is the fact, not its spelling.
      const bare = t.path.replace(/\/$/, '')
      if (!doc.includes(bare)) {
        errors.push(
          `batch-engine.mdx does not mention "${t.path}", where the "${name}" registry installs`,
        )
      }
    }
  }
  return errors
}

/**
 * Check: the batch-engine page's authority note enumerates EVERY shipped agent, with the
 * exact `tools:` list its frontmatter declares.
 *
 * The note is the only user-facing signal about what authority an adopter installs
 * unconditionally, so an understated one is worse than none. Review of #432 found it claiming
 * "three subagents" and then listing two, and describing `pair-reviewer` as holding `Bash`
 * when it declares five tools — while `pair-contract-generator`, which holds `Write`, was
 * absent. Reading the frontmatter here makes the claim gate-checked rather than hand-copied.
 */
export function checkBatchEngineAgents(
  agents: { name: string; tools: string }[],
  doc: string,
): string[] {
  const errors: string[] = []
  if (agents.length === 0) {
    // Without this, deleting the agents directory turns the check green.
    return ['no agent definitions found in the dataset — the batch-engine agent check is vacuous']
  }
  for (const { name, tools } of agents) {
    if (!doc.includes(name)) {
      errors.push(`batch-engine.mdx does not name the shipped agent "${name}"`)
      continue
    }
    if (!doc.includes(tools)) {
      errors.push(
        `batch-engine.mdx does not state "${name}" tools as declared in its frontmatter: "${tools}"`,
      )
    }
  }
  return errors
}

/** Check 3: every command dir has an anchor in commands.mdx. */
export function checkCommandAnchors(commandDirs: string[], commandsDoc: string): string[] {
  const errors: string[] = []
  for (const cmd of commandDirs) {
    if (!commandsDoc.includes(`(#${cmd})`)) {
      errors.push(`CLI command "${cmd}" has a dir in commands/ but missing from commands.mdx`)
    }
  }
  return errors
}

/**
 * A `pair-cli <word>` INVOCATION, as opposed to the words "pair-cli" in a sentence.
 *
 * Positional, deliberately, and not a list of prose words to keep extending: `pair-cli`
 * counts as an invocation only at the start of an inline code span or of a fenced line,
 * optionally behind `$ ` or `npx [--no] <pkg>`. That is what separates an instruction
 * from English — "common pair-cli workflows" and "the pair-cli version it invokes" are
 * prose and must not fail the gate, while `` `pair-cli init` `` is a command that does
 * not exist. The previous shape kept a PROSE_WORDS allow-list, which is the maintenance
 * pattern where the next false positive is fixed by adding a word rather than by fixing
 * the rule; under the positional rule that list is dead and is gone.
 */
const INVOCATION_PREFIX = String.raw`(?:\$\s*)?(?:npx\s+(?:--no\s+)?@?[\w/.-]+\s+)?pair-cli\s+`
const SPAN_INVOCATION = new RegExp('`\\s*' + INVOCATION_PREFIX + '([A-Za-z][\\w.-]*)', 'g')
const LINE_INVOCATION = new RegExp('^\\s*' + INVOCATION_PREFIX + '([A-Za-z][\\w.-]*)')

/**
 * `vX.Y.Z` / `v0.4.3` on a fenced line is printed OUTPUT, never a command — which is why
 * the token is captured whole (uppercase and dots included) instead of lower-case only:
 * a capture of just `v` would be indistinguishable from a two-letter command typo.
 */
const VERSION_STRING = /^v[\dX]/i

/**
 * Check 4: every `pair-cli <command>` the docs tell a reader to run exists.
 *
 * Scoped to the whole docs tree, not just tutorials. That widening is the point: with
 * tutorials only, 21 references to three non-existent commands (`init`, `kb validate`,
 * `kb info`) survived across eight pages — each one telling a reader to run something
 * that fails.
 */
export function checkDocsCommands(
  docs: { rel: string; content: string }[],
  commandDirs: string[],
): string[] {
  const errors: string[] = []
  for (const { rel, content } of docs) {
    for (const cmd of invokedCommands(content)) {
      if (commandDirs.includes(cmd) || VERSION_STRING.test(cmd)) continue
      errors.push(`${rel} tells the reader to run "pair-cli ${cmd}", which is not a command`)
    }
  }
  return errors
}

/** The commands a document actually invokes — code spans plus fenced command lines. */
function invokedCommands(content: string): Set<string> {
  const found = new Set<string>()
  for (const m of content.matchAll(SPAN_INVOCATION)) {
    if (m[1] !== undefined) found.add(m[1])
  }
  let inFence = false
  for (const line of content.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      continue
    }
    const m = inFence ? LINE_INVOCATION.exec(line) : null
    if (m?.[1] !== undefined) found.add(m[1])
  }
  return found
}

/** Build the set of valid /docs routes from the docs .mdx file list. */
export function buildValidRoutes(docsFiles: string[], docsDir: string): Set<string> {
  const routes = new Set<string>()
  for (const file of docsFiles) {
    const rel = relative(docsDir, file)
      .replace(/\\/g, '/')
      .replace(/\.mdx$/, '')
    routes.add(rel === 'index' ? '/docs' : `/docs/${rel.replace(/\/index$/, '')}`)
  }
  return routes
}

export interface RunResult {
  errors: string[]
  skillCount: number
  commandCount: number
}

/** Checks 3 & 4: command anchors in commands.mdx, and tutorial `pair-cli <cmd>` references. */
export function checkCliCommands(
  commandsDir: string,
  commandsFile: string,
  docs: { rel: string; content: string }[],
): { errors: string[]; commandCount: number } {
  const errors: string[] = []
  const commandDirs = readdirSync(commandsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
  errors.push(...checkCommandAnchors(commandDirs, readFileSync(commandsFile, 'utf-8')))
  errors.push(...checkDocsCommands(docs, commandDirs))
  return { errors, commandCount: commandDirs.length }
}

/**
 * Per-file checks — each doc is read once and run through every content-level check:
 * 1 (skill counts), 1b (the plugin transcript), 2b (guide counts), 5 (dead links),
 * 5b (dead repo-file citations).
 * Extracted from runAllChecks only to keep it under the line ceiling.
 */
function perFileErrors(params: {
  docsFiles: string[]
  docsDir: string
  root: string
  skillCount: number
  declaredPluginSkills: number | null
  howToCount: number | null
  validRoutes: Set<string>
}): string[] {
  const { docsFiles, docsDir, root, skillCount, declaredPluginSkills, howToCount, validRoutes } =
    params
  const errors: string[] = []
  for (const file of docsFiles) {
    const content = readFileSync(file, 'utf-8')
    const rel = relative(docsDir, file)
    errors.push(...findSkillCountMismatches(content, rel, skillCount))
    if (declaredPluginSkills !== null) {
      errors.push(...findPluginSkillCountMismatches(content, rel, declaredPluginSkills))
    }
    if (howToCount !== null) errors.push(...findGuideCountMismatches(content, rel, howToCount))
    errors.push(...findDeadLinks(content, rel, validRoutes))
    errors.push(...findDeadRepoLinks(content, rel, root))
  }
  return errors
}

/**
 * The repo-root README's count claims. It used to be excluded from this gate, with the
 * note "tracked and fixed by PR #325" — that PR is merged, so the exemption outlived its
 * own reason while the counts stayed unpinned (and a live drift sat there: 11 how-to
 * guides claimed against 9 on disk). It is the first page a reader sees; the same count
 * checks apply, and nothing else about the gate's docs-site focus changes.
 */
function readmeErrors(path: string, skillCount: number, howToCount: number | null): string[] {
  if (!existsSync(path)) return []
  const content = readFileSync(path, 'utf-8')
  const errors = findSkillCountMismatches(content, 'README.md', skillCount)
  if (howToCount !== null) {
    errors.push(...findGuideCountMismatches(content, 'README.md', howToCount))
  }
  return errors
}

/** Run every check against a repo root and collect all drift errors. */
/**
 * The source-of-truth paths every check reads, resolved from one repo root. Kept as
 * its own function so `runAllChecks` stays inside the line ceiling and the path list
 * has a single place to change.
 */
function checkPaths(root: string) {
  const DOCS_DIR = join(root, 'apps/website/content/docs')
  return {
    SKILLS_DIR: join(root, 'packages/knowledge-hub/dataset/.skills'),
    COMMANDS_DIR: join(root, 'apps/pair-cli/src/commands'),
    DOCS_DIR,
    CATALOG_FILE: join(DOCS_DIR, 'reference/skills-catalog.mdx'),
    COMMANDS_FILE: join(DOCS_DIR, 'reference/cli/commands.mdx'),
    HOW_TO_DIR: join(root, 'packages/knowledge-hub/dataset/.pair/knowledge/how-to'),
    // The plugin manifest lives at the PLUGIN root (the bootstrap corpus), not at the
    // repo root: the marketplace entry's `source` points there.
    PLUGIN_MANIFEST: join(root, 'packages/knowledge-hub/dataset/plugin/.claude-plugin/plugin.json'),
    BATCH_ENGINE_FILE: join(DOCS_DIR, 'reference/batch-engine.mdx'),
    CLI_CONFIG: join(root, 'apps/pair-cli/config.json'),
    AGENTS_DIR: join(root, 'packages/knowledge-hub/dataset/.agents'),
    WORKFLOWS_DIR: join(root, 'packages/knowledge-hub/dataset/.workflows'),
  }
}

/** `name:` and `tools:` from an agent definition's YAML frontmatter. */
function readAgentFrontmatter(dir: string): { name: string; tools: string }[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .sort()
    .map(f => {
      const src = readFileSync(join(dir, f), 'utf-8')
      return {
        name: /^name:\s*(.+)$/m.exec(src)?.[1]?.trim() ?? f.replace(/\.md$/, ''),
        tools: /^tools:\s*(.+)$/m.exec(src)?.[1]?.trim() ?? '',
      }
    })
}

/** The shipped workflow NAMES: every `.js` at the root of the dataset workflows dir, minus the
 * dry-run suites the registry excludes. Names, not paths — the page's table is keyed by name. */
function readShippedWorkflowNames(dir: string, exclude: string[] = []): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith('.js') && !exclude.includes(f))
    .map(f => f.replace(/\.js$/, ''))
    .sort()
}

/**
 * Check: the batch-engine page's WORKFLOW table enumerates every shipped workflow, and no more.
 *
 * The agent table beside it is derived; this one was hand-maintained, so a third shipped
 * workflow (or a renamed one) left the page describing a set that no longer exists — and the
 * page's whole job is to say what an adopter receives. Both directions are checked: a shipped
 * workflow missing from the table understates the install, and a table naming a workflow that
 * no longer ships promises something nobody gets.
 */
/**
 * The first cell of every row of the page's WORKFLOW table, located by that table's own header.
 * Scoped rather than document-wide: the agent table below it has the same row shape and its
 * `pair-*` names are not workflows, so a whole-document scan would either false-positive on
 * them or (as it did) be narrowed to a name suffix and stop catching renames.
 */
function workflowTableRows(doc: string): string[] {
  const lines = doc.split('\n')
  const start = lines.findIndex(l => /^\|\s*Workflow\s*\|/i.test(l))
  if (start === -1) return []
  const names: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (!line.trim().startsWith('|')) break
    const name = /^\|\s*`([^`]+)`/.exec(line)?.[1]
    if (name) names.push(name.trim())
  }
  return names
}

export function checkBatchEngineWorkflows(shipped: string[], doc: string): string[] {
  if (shipped.length === 0) {
    // Without this, deleting the dataset workflows directory turns the check green.
    return [
      'no shipped workflows found in the dataset — the batch-engine workflow check is vacuous',
    ]
  }
  const errors: string[] = []
  for (const name of shipped)
    if (!doc.includes(name))
      errors.push(`batch-engine.mdx does not name the shipped workflow "${name}"`)
  // The reverse, read off the TABLE's own rows rather than off the whole document. Matching
  // `` `pair-*-batch` `` anywhere caught a stale name only while it kept the `-batch` suffix:
  // a future `pair-triage` left in the table after it stopped shipping passed, which is exactly
  // the promise-what-nobody-gets defect this direction exists to catch. Reading the rows makes
  // it name-shape-agnostic AND keeps the agent table's own `pair-*` names — which this check
  // does not own — out of the scan.
  const rows = workflowTableRows(doc)
  if (rows.length === 0)
    errors.push(
      'batch-engine.mdx has no workflow table — the reverse check (a name the registry does not ship) cannot run',
    )
  for (const name of rows)
    if (!shipped.includes(name) && !errors.some(e => e.includes(name)))
      errors.push(`batch-engine.mdx names "${name}", which the workflows registry does not ship`)
  return [...new Set(errors)]
}

/**
 * The batch-engine page states WHERE `pair install` puts the engine, WHAT ships, and WHAT
 * authority arrives. Every one of those claims is read back from the dataset and the registries
 * rather than trusted, so renaming a target — or adding a workflow — without touching the page
 * fails here instead of leaving a doc pointing at something nobody gets.
 */
export function batchEngineErrors(paths: {
  BATCH_ENGINE_FILE: string
  CLI_CONFIG: string
  AGENTS_DIR: string
  WORKFLOWS_DIR: string
}): string[] {
  // LOUD on absence, like every sibling check in this file. Returning `[]` here meant deleting
  // `batch-engine.mdx` turned its own gate green — the page whose existence AC8 requires
  // disabling the checks that hold it honest, which is the one failure direction a staleness
  // gate must never have.
  if (!existsSync(paths.BATCH_ENGINE_FILE))
    return [
      `Batch engine page not found: ${paths.BATCH_ENGINE_FILE} — the batch-engine checks cannot run`,
    ]
  const cliConfig = JSON.parse(readFileSync(paths.CLI_CONFIG, 'utf-8')) as {
    asset_registries: Record<string, { targets: { path: string }[]; exclude?: string[] }>
  }
  const doc = readFileSync(paths.BATCH_ENGINE_FILE, 'utf-8')
  return [
    ...checkBatchEnginePaths(cliConfig.asset_registries, doc),
    ...checkBatchEngineAgents(readAgentFrontmatter(paths.AGENTS_DIR), doc),
    ...checkBatchEngineWorkflows(
      readShippedWorkflowNames(
        paths.WORKFLOWS_DIR,
        cliConfig.asset_registries['workflows']?.exclude ?? [],
      ),
      doc,
    ),
  ]
}

/**
 * The docs pages whose fenced sample block claims to BE the output of
 * `pair install --list-targets`. These are transcripts a reader compares their own
 * terminal against line for line, so drift here does not read as a stale doc — it reads
 * as a broken install, and the reader has no way to tell the two apart.
 */
export const LIST_TARGETS_PAGES = [
  'getting-started/checklist.mdx',
  'getting-started/quickstart-solo.mdx',
  'reference/cli/examples.mdx',
]

/** The header `listTargets` (apps/pair-cli/src/commands/install/handler.ts) prints, uncoloured. */
export const LIST_TARGETS_HEADER = 'Asset Registries'

/** The header three pages invented for it, and which the CLI has never emitted. */
const LIST_TARGETS_INVENTED_HEADER = 'Available asset registries:'

type ListTargetsRegistry = { behavior?: string; targets?: { path: string }[] }

/** The three lines `listTargets` prints per registry, in its exact indentation. */
function listTargetsEntry(name: string, reg: ListTargetsRegistry): string {
  const target = reg.targets?.[0]?.path ?? '(none)'
  return `  ${name}\n    target:   ${target}\n    behavior: ${reg.behavior ?? 'unknown'}`
}

/**
 * Check: every page printing `--list-targets` output prints what the renderer emits — the
 * handler's header, and one `name` / `target:` / `behavior:` entry per SHIPPED registry.
 *
 * The batch-engine check above reads `asset_registries` too, but only for two registries and
 * only against `batch-engine.mdx`; these three transcripts were covered by nothing. They drifted
 * into a columnar table under a header the CLI never printed, gave `knowledge` the target `.pair`
 * instead of `.pair/knowledge`, and omitted 4 of the 7 registries — for as long as it took someone
 * to read them side by side with a terminal. Deriving both directions from `config.json` means
 * adding, renaming or re-targeting a registry fails here instead of at an adopter.
 */
export function checkListTargetsSamples(
  registries: Record<string, ListTargetsRegistry>,
  pages: { rel: string; content: string }[],
): string[] {
  const errors: string[] = []
  for (const { rel, content } of pages) {
    if (!content.includes(LIST_TARGETS_HEADER)) {
      errors.push(`${rel}: --list-targets sample is missing the "${LIST_TARGETS_HEADER}" header`)
    }
    if (content.includes(LIST_TARGETS_INVENTED_HEADER)) {
      errors.push(
        `${rel}: --list-targets sample prints "${LIST_TARGETS_INVENTED_HEADER}", a header the CLI never emits`,
      )
    }
    for (const [name, reg] of Object.entries(registries)) {
      if (!content.includes(listTargetsEntry(name, reg))) {
        errors.push(
          `${rel}: --list-targets sample does not print the "${name}" registry as the CLI does ` +
            `(expected "  ${name}" / "    target:   ${reg.targets?.[0]?.path ?? '(none)'}" / "    behavior: ${reg.behavior ?? 'unknown'}")`,
        )
      }
    }
  }
  return errors
}

/** Read the registries and the sample pages, then compare. LOUD if a page is gone. */
export function listTargetsSampleErrors(paths: { CLI_CONFIG: string; DOCS_DIR: string }): string[] {
  const { asset_registries } = JSON.parse(readFileSync(paths.CLI_CONFIG, 'utf-8')) as {
    asset_registries: Record<string, ListTargetsRegistry>
  }
  const files = LIST_TARGETS_PAGES.map(rel => ({ rel, file: join(paths.DOCS_DIR, rel) }))
  const missing = files.filter(f => !existsSync(f.file))
  if (missing.length > 0) {
    return missing.map(
      f => `--list-targets sample page not found: ${f.rel} — the sample check cannot run`,
    )
  }
  return checkListTargetsSamples(
    asset_registries,
    files.map(f => ({ rel: f.rel, content: readFileSync(f.file, 'utf-8') })),
  )
}

/**
 * Checks 2b + 2d — everything derived from `apps/pair-cli/config.json`: the batch-engine
 * asset paths, and the three docs pages that print `pair install --list-targets` output.
 */
function cliConfigDerivedErrors(
  paths: Parameters<typeof batchEngineErrors>[0] & Parameters<typeof listTargetsSampleErrors>[0],
): string[] {
  return [...batchEngineErrors(paths), ...listTargetsSampleErrors(paths)]
}

export function runAllChecks(root: string): RunResult {
  const paths = checkPaths(root)
  const { SKILLS_DIR, DOCS_DIR, HOW_TO_DIR } = paths

  const errors: string[] = []
  const docsFiles = walkMdx(DOCS_DIR)
  const allSkills = collectSkills(SKILLS_DIR)
  const skillCount = allSkills.length
  const declaredPluginSkills = countDeclaredPluginSkills(paths.PLUGIN_MANIFEST)
  const validRoutes = buildValidRoutes(docsFiles, DOCS_DIR)
  const howToCount = countHowToGuides(HOW_TO_DIR)

  // Check 2b (loud failure if the how-to dataset dir moved)
  if (howToCount === null) {
    errors.push(`How-to guides dir not found: ${HOW_TO_DIR} — guide-count check cannot run`)
  }

  errors.push(
    ...perFileErrors({
      docsFiles,
      docsDir: DOCS_DIR,
      root,
      skillCount,
      declaredPluginSkills,
      howToCount,
      validRoutes,
    }),
  )

  // Check 2: catalog sync (both directions)
  const catalog = readFileSync(paths.CATALOG_FILE, 'utf-8')
  errors.push(...cliConfigDerivedErrors(paths))
  errors.push(...checkCatalogSync(allSkills, catalog))

  // Check 2c: catalog row CONTENT (Command + Description) single-sourced from the dataset
  errors.push(...checkCatalogContent(generateCatalogRows(SKILLS_DIR), catalog))

  // Checks 3 & 4: CLI command anchors + tutorial references
  const docs = docsFiles.map(file => ({
    rel: relative(DOCS_DIR, file),
    content: readFileSync(file, 'utf-8'),
  }))
  const cli = checkCliCommands(paths.COMMANDS_DIR, paths.COMMANDS_FILE, docs)
  errors.push(...cli.errors)

  errors.push(...readmeErrors(join(root, 'README.md'), skillCount, howToCount))

  return { errors, skillCount, commandCount: cli.commandCount }
}

/** Thin CLI wrapper: print the report and set the exit code. */
export function main(): void {
  const { errors, skillCount, commandCount } = runAllChecks(resolveRoot())
  console.log('Docs Staleness Check')
  console.log('====================')
  if (errors.length === 0) {
    console.log(`PASS — ${skillCount} skills, ${commandCount} commands in sync`)
    process.exit(0)
  }
  console.log(`FAIL — ${errors.length} issue${errors.length > 1 ? 's' : ''}\n`)
  for (const e of errors) console.log(`  • ${e}`)
  console.log()
  process.exit(1)
}

// Main-guard: run only when invoked directly (tsx lib/docs-staleness-check.ts),
// not when imported by the unit tests. ESM equivalent of `require.main === module`.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
