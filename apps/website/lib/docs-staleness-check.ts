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

/** Check 5: every /docs link/href in content resolves to a known route. */
export function findDeadLinks(content: string, rel: string, validRoutes: Set<string>): string[] {
  const errors: string[] = []
  for (const re of [LINK_RE, HREF_RE]) {
    for (const m of content.matchAll(re)) {
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
 * Case-SENSITIVE `existsSync`. github.com resolves repo paths case-sensitively; APFS
 * on macOS does not, and `existsSync` inherits the filesystem's rule. A citation
 * spelled `.pair/adoption/tech/ADR/adr-018-….md` therefore resolved on a developer's
 * Mac (local `docs:staleness` printed PASS) and 404'd for every reader — a local gate
 * disagreeing with Linux CI on exactly the 404 class Check 5b exists to catch.
 * Each segment is compared byte-for-byte against its parent directory's entries.
 */
export function existsCaseSensitive(root: string, relPath: string): boolean {
  let dir = root
  for (const segment of relPath.split('/').filter(s => s !== '' && s !== '.')) {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return false // parent is missing or not a directory
    }
    if (!entries.includes(segment)) return false
    dir = join(dir, segment)
  }
  return existsSync(dir)
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
 */
function renderedHeadingText(heading: string): string {
  return (
    heading
      .replace(/`+/g, '') // code spans
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links + images -> their text
      .replace(/<[^>]+>/g, '') // inline HTML
      .replace(/\*+/g, '') // asterisk emphasis / strong
      // Underscore emphasis is word-BOUNDED: `_italic_` is markup, `snake_case` is text.
      .replace(/(^|[^\p{L}\p{N}_])_+/gu, '$1')
      .replace(/_+(?=[^\p{L}\p{N}_]|$)/gu, '')
  )
}

/**
 * github-slugger's transform — what github.com runs to build a heading anchor:
 * lowercase, drop every character that is not a letter, digit, `_`, `-` or space, then
 * spaces to `-`. Nothing is trimmed or collapsed afterwards, so `## 🎯 Quick Start`
 * anchors as `-quick-start` and a removed em-dash leaves the double hyphen in
 * `6-techrisk-matrixmd--adoption-delta` — both verified against github's own renderer.
 */
export function slugifyHeading(heading: string): string {
  return renderedHeadingText(heading)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_\- ]/gu, '')
    .replace(/ /g, '-')
}

/** Where the markdown body starts: after YAML frontmatter, if the file opens with it. */
function bodyStart(lines: readonly string[]): number {
  if (lines[0]?.trim() !== '---') return 0
  const close = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
  return close > 0 ? close + 1 : 0
}

/** A fence opener/closer: 3+ backticks or tildes, indented at most 3 spaces (CommonMark). */
function fenceRunOf(line: string): string | undefined {
  return /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
}

/** The heading TEXT a line carries, if it is an ATX heading (`## X`, optional closing `#`s). */
function atxHeadingOf(line: string): string | undefined {
  return /^ {0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line)?.[1]
}

/**
 * Is `underline` a setext underline for `prev`? `===`/`---` alone under a non-blank
 * line. A table separator carries pipes and a list/quote/heading marker leads its line,
 * so none of them is read as a heading.
 */
function isSetextUnderline(underline: string, prev: string): boolean {
  if (!/^ {0,3}(=+|-+)\s*$/.test(underline)) return false
  return prev.trim() !== '' && !/^ {0,3}([#>|]|[-*+] |\d+\. )/.test(prev)
}

/**
 * The markdown lines that can carry an anchor, paired with the line above them (the
 * setext candidate): YAML frontmatter and fenced code blocks are skipped, so a
 * `# comment` in a shell block is never read as a heading.
 */
function* anchorBearingLines(markdown: string): Generator<{ line: string; prev: string }> {
  const lines = markdown.split('\n')
  const start = bodyStart(lines)
  let fence: string | undefined
  for (let i = start; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const run = fenceRunOf(line)
    if (fence !== undefined) {
      if (run !== undefined && run[0] === fence[0] && run.length >= fence.length) fence = undefined
      continue
    }
    if (run !== undefined) {
      fence = run
      continue
    }
    yield { line, prev: i > start ? (lines[i - 1] ?? '') : '' }
  }
}

/**
 * Every anchor a markdown file offers: ATX (`## X`) and setext (`X` over `===`/`---`)
 * headings, plus explicit `<a name>`/`<a id>` anchors. A repeated slug is disambiguated
 * `-1`, `-2`, github-slugger's rule.
 */
export function collectHeadingSlugs(markdown: string): Set<string> {
  const slugs = new Set<string>()
  const seen = new Map<string, number>()
  const add = (heading: string): void => {
    const base = slugifyHeading(heading)
    if (base === '') return
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    slugs.add(n === 0 ? base : `${base}-${n}`)
  }

  for (const { line, prev } of anchorBearingLines(markdown)) {
    const atx = atxHeadingOf(line)
    if (atx !== undefined) add(atx)
    else if (isSetextUnderline(line, prev)) add(prev.trim())
    for (const m of line.matchAll(/<a\s[^>]*\b(?:name|id)="([^"]+)"/g)) {
      if (m[1] !== undefined) slugs.add(m[1])
    }
  }
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
 * The path is then percent-DECODED, because that is what the reader's browser resolves:
 * `docs/my%20file.md` is the file `docs/my file.md`. A malformed escape
 * (`100%-coverage.md`) makes `decodeURIComponent` throw — the literal is resolved then,
 * never an exception out of a docs gate.
 */
export function parseCitation(raw: string): { path: string; fragment: string } {
  const hash = raw.indexOf('#')
  const beforeHash = hash === -1 ? raw : raw.slice(0, hash)
  const fragment = hash === -1 ? '' : raw.slice(hash + 1).replace(/[.,;:]+$/, '')
  const encoded = (beforeHash.split('?')[0] ?? '').replace(/[.,;:]+$/, '')
  try {
    return { path: decodeURIComponent(encoded), fragment }
  } catch {
    return { path: encoded, fragment }
  }
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
  if (collectHeadingSlugs(readFileSync(join(root, path), 'utf-8')).has(fragment)) return null
  return `${path}#${fragment} — no heading in that file slugs to it`
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
  for (const m of content.matchAll(REPO_BLOB_RE)) {
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
    if (!existsCaseSensitive(root, path)) {
      errors.push(`Dead repo-file citation in ${rel}: ${path} does not exist in the repo`)
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
