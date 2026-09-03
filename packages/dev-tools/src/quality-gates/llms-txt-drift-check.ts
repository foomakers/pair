/**
 * llms-txt-drift-check — the gate that keeps `.pair/llms.txt` equal to what its
 * generator emits (story #416).
 *
 * `.pair/llms.txt` is GENERATED (`writeProjectLlmsTxt`, on every `pair install` /
 * `pair update`) and also TRACKED — this repo dogfoods its own KB, so the index
 * every agent resolves the knowledge base through is the COMMITTED file. Until this
 * gate, nothing compared the two: add a guideline without regenerating and every
 * agent reading the index silently misses it. Two independent misses are on record
 * (`story-local-markers.md`; the two how-to guides dropped in #246 and still indexed
 * ~5 months later).
 *
 * WHAT IT COMPARES — the rule decided 2026-08-05
 * (`decision-log/2026-08-11-a-mirror-guard-compares-the-transform.md`): **a guard
 * compares the output of the transform, never a source.** `.pair/llms.txt` has no
 * dataset source — the file IS output — so the comparison target is unambiguous:
 * run `generateLlmsTxt` over the tree and compare byte for byte. The trailing-newline
 * form is #393's, consumed here and not re-litigated (AC6).
 *
 * CHECK-ONLY, STRUCTURALLY. It never writes `.pair/llms.txt` — regeneration is the
 * contributor's explicit act (ADL `2026-07-31-pre-push-gate-is-check-only.md`). That
 * is not merely a convention here: the generator takes `LlmsSourceFs`, a read-only
 * 3-method slice, and the adapter below has no write primitive to call. It also
 * never calls `writeProjectLlmsTxt`.
 *
 * WHERE IT LIVES. The generator lives in `apps/pair-cli`, the sibling gates
 * (`code-hygiene-check`, `smoke-scenario-modes`, `pre-push-gate-composition`) live
 * here, and gate composition uniformity won: the check sits with the other gates and
 * imports the generator by SOURCE path — there is exactly one definition of the
 * index format, and a change to it surfaces here — against the WORKING TREE, never
 * against a `dist/` someone forgot to rebuild. That import is not free and its two
 * costs are paid explicitly: this package's tsconfig sets `"composite": false` (the
 * inherited emit-time `rootDir` invariant rejects a cross-package source import, and
 * this package emits nothing), and `@pair/content-ops` is a devDependency for the
 * import's sake alone (the generator's sibling `writeProjectLlmsTxt` types against
 * it), so turbo's `^build` orders content-ops' compile before this package's
 * `ts:check` instead of racing it. Both are argued in the ADL below.
 *
 * ADR-014 shape, shared with the siblings in this folder: the logic is exported,
 * unit-tested functions (`llms-txt-drift-check.test.ts`, fixture trees, no real KB
 * corpus); `main()` behind a `require.main` guard is the thin CLI, run as
 * `ts-node -T src/quality-gates/llms-txt-drift-check.ts` (package script
 * `llms-index:check`, delegated from the repo-root script of the same name).
 * Exit 0 = in sync, exit 1 = drift, broken setup, or an index file that cannot be read.
 *
 * WHY `-T` (transpile-only). Unlike its siblings this gate compiles a source file
 * from ANOTHER package, and that file's first line imports `@pair/content-ops` types
 * that only exist in `dist/`. Type-checking here therefore made the gate's verdict
 * depend on whether someone had run a build: on a fresh `pnpm install` the gate
 * produced NONE of its three outcomes, it died with
 * `TS2307: Cannot find module '@pair/content-ops'`. Type-checking that source is
 * `ts:check`'s job in both packages, and `turbo ts:check` carries the `^build` edge
 * that makes it correct. A gate that dies with a compiler error instead of a verdict
 * is how a gate teaches contributors to distrust it.
 */
import { readFile, readdir, stat } from 'fs/promises'
import { join } from 'path'

import {
  generateLlmsTxt,
  type LlmsSourceFs,
} from '../../../../apps/pair-cli/src/registry/llms-generation'
import { REPO_ROOT } from './repo-root'

/** The tracked index, relative to the project root. */
export const TRACKED_INDEX_PATH = '.pair/llms.txt'

/**
 * The command that regenerates the index — named in every drift failure, because a
 * gate that reports a stale file without saying how to refresh it teaches
 * contributors to hand-edit it, which is how it went stale in the first place.
 *
 * It has to be a command this gate's AUDIENCE can actually run, and that audience is
 * this repository's contributors: `@pair/dev-tools` is `private: true` and ships in no
 * dataset. `pair update` was not such a command — no `pair` on `PATH`, none in any
 * workspace `node_modules/.bin` (`apps/pair-cli` publishes its bin as `pair-cli`), no
 * root script by that name — so the printed advice answered `command not found`. And
 * its nearest real resolution is worse than the error: `pair-cli update` with no
 * `--source` installs the PUBLISHED knowledge base over `.pair/knowledge/**`, undoing
 * the guideline whose addition reddened the gate.
 *
 * `pnpm llms-index:regen` is the root script that runs `llms-txt-regenerate.ts` — the
 * exact inverse of this check, writing this one file and refusing on every state whose
 * caution says not to regenerate. Two tests hold the chain together: one asserts the
 * literal string appears in the message, one resolves the script name against the real
 * root `package.json`.
 */
export const REGENERATION_COMMAND = 'pnpm llms-index:regen'

/**
 * The read-only adapter handed to the generator. Three methods, all reads: the type
 * says this gate cannot write the file it is judging (see the header).
 */
export const readOnlyFileSystem: LlmsSourceFs = {
  exists: async path => {
    try {
      await stat(path)
      return true
    } catch {
      return false
    }
  },
  readdir: path => readdir(path, { withFileTypes: true }),
  readFile: file => readFile(file, 'utf-8'),
}

/**
 * The three outcomes, as a discriminated union rather than an ok/detail bag: a
 * broken setup is NOT drift (a missing KB tree is an unfinished install, and
 * reporting it as a stale index sends the contributor to regenerate a file that has
 * nothing to index), and the caller must be unable to confuse the two.
 */
export type DriftReport =
  | { kind: 'in-sync' }
  | {
      kind: 'drift'
      missing: string[]
      extra: string[]
      trackedExists: boolean
      /**
       * Headings the TRACKED file carries for which the generator produced no entry
       * at all (the generator omits an empty section entirely). See
       * `emptiedSections` below for why this is not just more `extra` lines.
       */
      emptiedSections: string[]
      /**
       * The tracked file carries at least one `\r` — as `\r\n` (a `core.autocrlf=true`
       * checkout) or bare (a hand-rolled conversion). A separate fact from the two
       * deltas: it explains a byte mismatch the deltas cannot show, and it is the one
       * case where regenerating is the WRONG advice. See `carriageReturnCaution`.
       */
      trackedCarriesCr: boolean
      /**
       * The tracked file starts with U+FEFF, the UTF-8 byte-order mark some editors
       * (Notepad, several Windows editors) write in front of the text. The generator
       * never emits one, so the first line can never match; unlike a CR, git does not
       * put it back, so regeneration IS the fix. See `byteOrderMarkCaution`.
       */
      trackedCarriesBom: boolean
    }
  | { kind: 'broken-setup'; detail: string }
  /**
   * The generator ran — the KB tree is complete and readable — but the tracked file
   * itself could not be read (`EACCES` on a chmod-000 file, `EISDIR` on a directory in
   * its place). Distinct from an unreadable TREE: the remedy is one file, not a reinstall.
   */
  | { kind: 'unreadable-index'; path: string; detail: string }

/**
 * Every terminator a text file can carry, as ONE separator: `\r\n`, bare `\r`, bare
 * `\n`. Splitting on `\n` alone leaves a bare-CR file (classic-Mac form, what a
 * hand-rolled `s/\n/\r/` conversion writes) as a SINGLE segment — the whole index
 * concatenated into one unreadable `extra` line, with no CR anywhere at a segment end
 * for a trailing-`\r` strip to find. Alternation order matters: `\r\n` must be tried
 * before `\r`, or every CRLF line would yield a spurious empty segment.
 */
const LINE_TERMINATOR = /\r\n|\r|\n/

/**
 * Lines that carry index information — blank lines say nothing about drift, and
 * neither does the terminator. The generator always emits `\n`; the tracked file's
 * terminator is whatever git checked out, which is `\r\n` under
 * `core.autocrlf=true`. Comparing line LITERALS across that difference makes every
 * line of both files unmatched (on the real index: ~570 `missing` + ~570 `extra`),
 * burying any actual delta. The verdict stays byte equality (AC1) — this only shapes
 * the EXPLANATION, and `trackedCarriesCr` carries the fact the normalization hides.
 */
function contentLines(text: string): string[] {
  return text.split(LINE_TERMINATOR).filter(line => line.trim() !== '')
}

/** Occurrence counts, because a duplicated line is drift the SET view cannot see. */
function occurrences(lines: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1)
  return counts
}

/**
 * Multiset difference `left - right`, preserving `left`'s order: a line present
 * twice on the left and once on the right yields ONE occurrence.
 */
function surplus(left: string[], right: string[]): string[] {
  const budget = occurrences(right)
  return left.filter(line => {
    const available = budget.get(line) ?? 0
    if (available === 0) return true
    budget.set(line, available - 1)
    return false
  })
}

/** `## Heading` lines, without the marker. */
function headings(text: string): string[] {
  return contentLines(text)
    .filter(line => line.startsWith('## '))
    .map(line => line.slice(3).trim())
}

/**
 * The verdict is BYTE equality (AC1); the missing/extra lists are the actionable
 * EXPLANATION of a failure (AC2), not the verdict itself. That is why two files with
 * the same lines in a different order — or differing only in a trailing newline or a
 * blank line — are still drift, reported with both lists empty and a message that
 * says so. (Whitespace INSIDE a line is content: it makes the line missing on one side
 * and extra on the other, and `formatDrift` renders that pair so the difference shows.)
 *
 * The two lists are MULTISET deltas, not set deltas. `.pair/llms.txt` is touched by
 * every ADL/guideline addition, so parallel branches conflict on it routinely and a
 * "keep both sides" resolution duplicates an entry line. Under a set diff that
 * duplicate is invisible — 0 missing / 0 extra, followed by the "order or
 * whitespace" sentence — a confidently wrong diagnosis in exactly the case where the
 * contributor needs the diff.
 */
export function compareIndex(expected: string, actual: string | null): DriftReport {
  if (actual !== null && actual === expected) return { kind: 'in-sync' }

  const expectedLines = contentLines(expected)
  const actualLines = contentLines(actual ?? '')
  const generatedHeadings = new Set(headings(expected))

  return {
    kind: 'drift',
    missing: surplus(expectedLines, actualLines),
    extra: surplus(actualLines, expectedLines),
    trackedExists: actual !== null,
    emptiedSections: headings(actual ?? '').filter(heading => !generatedHeadings.has(heading)),
    trackedCarriesCr: (actual ?? '').includes('\r'),
    trackedCarriesBom: (actual ?? '').startsWith(BYTE_ORDER_MARK),
  }
}

/**
 * A tree the generator can index at all. `generateLlmsTxt` emits only its 4-line
 * preamble when every section directory is absent, and comparing THAT against a
 * tracked file would report an unfinished install as a 400-line stale index.
 */
function hasIndexableSection(generated: string): boolean {
  return generated.includes('\n## ')
}

const BYTE_ORDER_MARK = '\uFEFF'

/**
 * Characters a terminal renders as NOTHING, named by Unicode's own RENDERING property
 * rather than listed by hand: `Default_Ignorable_Code_Point` — the code points Unicode
 * defines as ignorable in display — plus `Zl`/`Zp` (the line and paragraph separators,
 * which are not DI). DI holds the BOM, the zero-width family, the soft hyphen, the bidi
 * marks/embeddings/isolates U+200E-F, U+202A-E, U+2066-9, U+061C, the invisible operators
 * U+2061-4, U+180E, every variation selector (U+180B-D, U+FE00-F, U+E0100-EF), the tag
 * characters above the BMP, and the members the format class `Cf` does NOT have: the
 * Hangul fillers U+115F-1160, U+3164, U+FFA0, the combining grapheme joiner U+034F,
 * U+17B4-5, and the reserved-but-ignorable U+2065, U+FFF0-8, U+E0000-E0FFF. `Cf` itself
 * is NOT in the class: 32 of its code points (Node 24 tables — U+0600-0605, U+06DD,
 * U+070F, U+0890-1, U+08E2, U+FFF9-B, U+110BD, U+110CD, U+13430-F) are number signs
 * and format controls a font DOES draw, and the caution below claims the opposite of
 * every escaped line. No DI code point is White_Space, so the space-like key is
 * untouched. `JSON.stringify` leaves every member unescaped, so they are escaped by
 * hand in `escapeInvisible`.
 */
const ZERO_WIDTH_CLASS = '\\p{Default_Ignorable_Code_Point}\\p{Zl}\\p{Zp}'

/**
 * Characters a terminal renders as AN ORDINARY SPACE: NBSP (what a word processor or
 * an HTML copy pastes), the fixed-width spaces, the narrow/medium/ideographic ones. ONE
 * definition, consumed by both the key (`SPACE_LIKE`, where a tab must count as a space
 * so that `a\tb` pairs with `a b`) and the rendering (`SPACE_LIKE_ESCAPED`, where the
 * tab is left to `JSON.stringify`, which already spells it `\t`) — two hand-written
 * copies of the class would let a code point be DETECTED but printed unescaped.
 */
const SPACE_LIKE_CLASS = '\\u00A0\\u2000-\\u200A\\u202F\\u205F\\u3000'

const ZERO_WIDTH = new RegExp(`[${ZERO_WIDTH_CLASS}]`, 'gu')
const SPACE_LIKE = new RegExp(`[\\t${SPACE_LIKE_CLASS}]`, 'gu')
const SPACE_LIKE_ESCAPED = new RegExp(`[${SPACE_LIKE_CLASS}]`, 'gu')
/** Any character of either class — the test for "this line carries something invisible". */
const INVISIBLE = new RegExp(`[${ZERO_WIDTH_CLASS}\\t${SPACE_LIKE_CLASS}]`, 'u')

/**
 * What a line LOOKS like on a terminal: zero-width characters gone, space-likes
 * folded to a space, runs of spaces to one (a doubled space is a wider gap, which in a
 * 50-line list reads as no gap), leading/trailing whitespace dropped. Two lines with
 * the same visible form are a "look-alike pair" — listed once as missing and once as
 * extra, they would print as two identical lines, which is the one shape of report
 * AC-2's "the fix is obvious without a manual diff" cannot survive.
 */
function visibleForm(line: string): string {
  return line.replace(ZERO_WIDTH, '').replace(SPACE_LIKE, ' ').replace(/ {2,}/g, ' ').trim()
}

/**
 * The line quoted, with every invisible character spelled as `\uXXXX` (`\u{XXXXX}`
 * above the BMP, where one code point is two UTF-16 units and `charCodeAt` would print
 * a lone surrogate). The quotes make leading/trailing whitespace visible; the escapes
 * make the rest visible. A run of two or more plain spaces is spelled out too — the
 * quotes alone cannot show its width — while a single space stays the word separator.
 */
function escapeInvisible(line: string): string {
  const hex = (c: string) => {
    const codePoint = (c.codePointAt(0) ?? 0).toString(16)
    return codePoint.length > 4 ? `\\u{${codePoint}}` : `\\u${codePoint.padStart(4, '0')}`
  }
  return JSON.stringify(line)
    .replace(ZERO_WIDTH, hex)
    .replace(SPACE_LIKE_ESCAPED, hex)
    .replace(/ {2,}/g, run => '\\u0020'.repeat(run.length))
}

/** The visible forms that occur on BOTH sides — each one is a look-alike pair. */
function lookAlikeForms(missing: string[], extra: string[]): Set<string> {
  const onMissingSide = new Set(missing.map(visibleForm))
  return new Set(extra.map(visibleForm).filter(form => onMissingSide.has(form)))
}

/**
 * A line is rendered escaped when it is one side of a look-alike pair OR carries an
 * invisible character on its own. The second rule covers the UNPAIRED case: a tracked
 * line that is a lone U+200B has no counterpart (not White_Space, so `contentLines`
 * keeps it) and printed raw it is a heading followed by an apparently blank line.
 * Every other line is raw: quoting the common case (a whole missing entry) would make
 * it harder to read for no gain.
 */
function needsEscaping(line: string, lookAlikes: Set<string>): boolean {
  return lookAlikes.has(visibleForm(line)) || INVISIBLE.test(line)
}

function renderLines(label: string, lines: string[], lookAlikes: Set<string>): string {
  const header = `${lines.length} ${label} line(s):`
  const rendered = lines.map(l => `  ${needsEscaping(l, lookAlikes) ? escapeInvisible(l) : l}`)
  return lines.length === 0 ? header : `${header}\n${rendered.join('\n')}`
}

/**
 * Printed once per report when at least one line was escaped: it names the class of
 * problem (the lines above are not a typo the reader failed to spot) and how they were
 * rendered, so `"\ufeff# pair"` and `"- [PRD](...) "` read as what they are. The count
 * is the number of QUOTED LINES — what the reader can check against the lists — not
 * the number of distinct visible forms (one missing line against two extra variants is
 * three quoted lines, not "1 pair").
 */
function invisibleDifferenceCaution(escapedLineCount: number): string {
  return (
    `⚠ ${escapedLineCount} line(s) above carry characters a terminal does not show — a\n` +
    `  byte-order mark, a doubled, trailing or leading space, a non-breaking, zero-width\n` +
    `  or bidi format character. They are printed in quotes, with those characters\n` +
    `  escaped as \\uXXXX, so the difference is visible.`
  )
}

/**
 * The one invisible character with a known producer AND a known fix, so it gets a
 * caution of its own. Unlike a CR the BOM is not something git writes back on checkout:
 * the regeneration command was run on a BOM-prefixed index and rewrote it without one
 * (pinned by `llms-txt-regenerate.test.ts`, and re-measured end to end on the real
 * repo), so the call to action stays the bare imperative — this caution adds no
 * precondition.
 */
function byteOrderMarkCaution(): string {
  return (
    `⚠ The tracked file starts with a byte-order mark (U+FEFF) — the signature some\n` +
    `  editors (Notepad, several Windows editors) write in front of UTF-8 text. The\n` +
    `  generator never emits one, so the first line can never match. Regenerating\n` +
    `  rewrites the file without it; if you edit the file by hand, save it as UTF-8\n` +
    `  WITHOUT a signature.`
  )
}

/**
 * A tree missing ONE WHOLE section still yields other sections, so it clears the
 * broken-setup guard and lands in `formatDrift` listing every entry of that section as
 * `extra`. The verdict is right (a partial checkout is indistinguishable from a
 * legitimate mass deletion) — the ADVICE is not, and a contributor who obeys it on a
 * sparse tree commits an index with the whole section deleted.
 */
function sparseTreeCaution(emptiedSections: string[]): string {
  return (
    `⚠ The tracked file carries section(s) the generator produced NOTHING for:\n` +
    emptiedSections.map(s => `  ${s}`).join('\n') +
    `\n  If you expected those files to exist your KB tree is incomplete (partial\n` +
    `  install, sparse checkout) — do not regenerate: restore the tree first.`
  )
}

/**
 * `.pair/llms.txt` is written by the generator with `\n` and compared byte for byte, so
 * a checkout that rewrites its terminators makes it unequal by construction. Git does
 * exactly that under `core.autocrlf=true` (the Windows default), which is why the repo's
 * `.gitattributes` pins the file to `eol=lf` — this caution is what a working copy
 * checked out BEFORE that pin (and not rewritten since) gets told.
 *
 * Naming the regeneration command here would be the one piece of advice that cannot
 * work: the regenerated file lands as LF and the next checkout puts the CRs back. The
 * exit is a renormalization, so that is what the message names — and
 * `regenerateLlmsIndex` REFUSES to write on this state for the same reason, so the two
 * halves of the remedy cannot disagree.
 *
 * The recipe is the one that was RUN, not the one that reads best. `git add
 * --renormalize` is the usual advice and it is inert here: the index side is already
 * LF (that is what `.gitattributes` guarantees), so it stages nothing and the working
 * tree keeps its CRs — verified on a `core.autocrlf=true` clone, where it left all 583
 * CR-carrying lines in place and the gate red. Deleting the file first is what forces
 * git to write it out again, under the attribute.
 *
 * The recipe touches ONE file and nothing else — no `git config core.autocrlf false`
 * in front of it. The `eol=lf` attribute overrides `autocrlf` on its own (same clone,
 * config left at `true`: `rm` + `git checkout --` alone → `w/lf`, 0 CRs, gate green),
 * so the config step would rewrite the contributor's repo-local git config for every
 * file in order to fix one. The only state where it would matter — the attribute
 * absent from index and tree — cannot be reached from this message, which ships in
 * the same commit as the pin.
 *
 * ANY CR triggers this, not just `\r\n`. A bare-CR file is not a state git produces —
 * but the cause (a conversion outside the generator), the diagnosis and the exit are
 * identical, and the checkout named below rewrites it to LF just the same. The
 * alternative is the one report that closes with a regeneration that cannot be obeyed.
 */
function carriageReturnCaution(): string {
  return (
    `⚠ The tracked file's lines end with a carriage return (CRLF, or a bare CR); the\n` +
    `  generator emits LF, so the two cannot be byte-equal. The lists above are computed\n` +
    `  on the line CONTENT, with the terminators normalized away.\n` +
    `  Regenerating will NOT fix this — the write lands as LF and the next checkout\n` +
    `  restores the CRs. Re-check out the file instead, under the LF pin this repo\n` +
    `  carries in .gitattributes:\n` +
    `    rm ${TRACKED_INDEX_PATH} && git checkout -- ${TRACKED_INDEX_PATH}`
  )
}

/**
 * The LAST paragraph — the one a contributor scanning for the fix acts on, which is why
 * a caution above does not merely PRECEDE it but CHANGES it. A message that says "do
 * not regenerate: restore the tree first" and then closes with the bare imperative
 * "Regenerate with `pnpm llms-index:regen` and commit the result" contradicts itself and delivers,
 * in its own call to action, the damage the caution exists to prevent.
 *
 * The command is named on EVERY branch (AC5 — a drift report always says how to fix
 * it); only the precondition in front of it changes. `preconditions` are the cautions
 * that fired, in the order they must be satisfied.
 */
function callToAction(preconditions: string[]): string {
  const imperative =
    preconditions.length === 0
      ? `Regenerate with \`${REGENERATION_COMMAND}\` and commit the result.`
      : `Once ${preconditions.join(' and ')}, regenerate with \`${REGENERATION_COMMAND}\` and commit the result.`

  return (
    `${imperative}\n` +
    `This check never writes ${TRACKED_INDEX_PATH} — a gate that fixed the drift would\n` +
    `hide it.`
  )
}

/**
 * The diagnosis a contributor acts on: the two multiset deltas, plus the sentence that
 * explains an EMPTY pair (order/whitespace), plus a call to action whose wording depends
 * on whether the tree looks complete.
 */
function formatDrift(
  report: Extract<DriftReport, { kind: 'drift' }>,
  baseTarget: string,
): string[] {
  const parts = [
    `❌ llms-index: ${TRACKED_INDEX_PATH} is not what the generator emits for this tree.`,
  ]

  if (!report.trackedExists) {
    parts.push(`The tracked file ${join(baseTarget, TRACKED_INDEX_PATH)} does not exist.`)
  }

  const lookAlikes = lookAlikeForms(report.missing, report.extra)
  parts.push(
    renderLines('missing', report.missing, lookAlikes) +
      `\n  (the generator emits these; the tracked file does not)`,
  )
  parts.push(
    renderLines('extra', report.extra, lookAlikes) +
      `\n  (the tracked file has these; the generator does not)`,
  )
  const escapedLineCount = [...report.missing, ...report.extra].filter(l =>
    needsEscaping(l, lookAlikes),
  ).length
  if (escapedLineCount > 0) parts.push(invisibleDifferenceCaution(escapedLineCount))
  if (report.trackedCarriesBom) parts.push(byteOrderMarkCaution())

  // An empty delta on an LF file leaves order/whitespace as the only explanation. On a
  // CR-carrying file the explanation is the terminator, and `carriageReturnCaution`
  // states it — printing both would offer two diagnoses for one cause.
  if (report.missing.length === 0 && report.extra.length === 0 && !report.trackedCarriesCr) {
    parts.push(
      `Both sides carry the same lines, each the same number of times: the difference is\n` +
        `their order or surrounding whitespace (a trailing newline, a blank line).`,
    )
  }

  const preconditions: string[] = []
  if (report.trackedCarriesCr) {
    parts.push(carriageReturnCaution())
    preconditions.push('the checkout is normalized to LF')
  }
  if (report.emptiedSections.length > 0) {
    parts.push(sparseTreeCaution(report.emptiedSections))
    preconditions.push('the tree is complete')
  }
  parts.push(callToAction(preconditions))

  return parts
}

/** The human-facing report — the whole point of AC2/AC5, so it is built here, once. */
export function formatReport(report: DriftReport, baseTarget: string): string {
  if (report.kind === 'in-sync') {
    return `✓ llms-index: ${TRACKED_INDEX_PATH} matches the generator`
  }

  if (report.kind === 'broken-setup') {
    return (
      `❌ llms-index: no knowledge base to index under ${report.detail}\n\n` +
      `The generator found no indexable section (adoption, how-to, guidelines, skills).\n` +
      `That is a broken or partial setup, NOT a stale index — install the knowledge base\n` +
      `first. Nothing was compared and nothing was written.`
    )
  }

  if (report.kind === 'unreadable-index') {
    return (
      `❌ llms-index: could not read the tracked index ${report.path}\n\n` +
      `${report.detail}\n\n` +
      `The knowledge base itself was read and indexed — only the tracked file is bad\n` +
      `(its permission bits, or a directory in its place). That is a broken FILE, NOT a\n` +
      `stale index and NOT a broken KB tree. Restore the committed file, then re-run:\n` +
      `  git checkout -- ${TRACKED_INDEX_PATH}\n` +
      `Nothing was compared and nothing was written.`
    )
  }

  return formatDrift(report, baseTarget).join('\n\n')
}

export interface DriftCheckResult {
  ok: boolean
  report: DriftReport
  message: string
}

/**
 * Generate → read the tracked file → compare. One generator run, one read, no
 * repeated walks. `baseTarget` is injected (defaulting to the repo root from the
 * folder's single `./repo-root` definition) so the tests run on fixture trees and
 * never on the real corpus.
 */
export async function checkLlmsIndexDrift(
  baseTarget: string = REPO_ROOT,
  fs: LlmsSourceFs = readOnlyFileSystem,
): Promise<DriftCheckResult> {
  const expected = await generateLlmsTxt(fs, baseTarget)

  if (!hasIndexableSection(expected)) {
    const report: DriftReport = { kind: 'broken-setup', detail: join(baseTarget, '.pair') }
    return { ok: false, report, message: formatReport(report, baseTarget) }
  }

  const trackedPath = join(baseTarget, TRACKED_INDEX_PATH)
  let actual: string | null
  try {
    actual = (await fs.exists(trackedPath)) ? await fs.readFile(trackedPath) : null
  } catch (error) {
    // The generator has already succeeded, so this failure is the FILE's, not the tree's
    // — letting it escape to `main`'s catch would print the KB-tree diagnosis.
    const report: DriftReport = {
      kind: 'unreadable-index',
      path: trackedPath,
      detail: errorDetail(error),
    }
    return { ok: false, report, message: formatReport(report, baseTarget) }
  }
  const report = compareIndex(expected, actual)

  return { ok: report.kind === 'in-sync', report, message: formatReport(report, baseTarget) }
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The outcome that is not a verdict: the check could not run because the KB TREE is
 * unreadable. `hasIndexableSection` covers an ABSENT tree — `exists` returns false and
 * the generator skips the section — but not an UNREADABLE one: a `chmod 000` directory
 * under `.pair/knowledge/guidelines/` makes `readdir` throw `EACCES` out of
 * `generateLlmsTxt`. Without this, `void main()` turned that into an unhandled
 * promise rejection stack, which is neither of the two things the message has to
 * distinguish (broken setup vs. stale index).
 *
 * Only the GENERATOR's failures reach this: the tracked file's own read is caught in
 * `checkLlmsIndexDrift` and reported as `unreadable-index`, because by then the tree
 * has been read in full and "the tree is present but unreadable" would be false.
 */
export function formatUnreadableTree(error: unknown, baseTarget: string): string {
  const detail = errorDetail(error)
  return (
    `❌ llms-index: could not read the knowledge base under ${join(baseTarget, '.pair')}\n\n` +
    `${detail}\n\n` +
    `That is a broken setup, NOT a stale index — the tree is present but unreadable\n` +
    `(permissions, a broken symlink, a partially unpacked install). Nothing was\n` +
    `compared and nothing was written.`
  )
}

/** Thin CLI wrapper: print the report and set the exit code. */
export async function main(
  baseTarget: string = REPO_ROOT,
  fs: LlmsSourceFs = readOnlyFileSystem,
): Promise<void> {
  try {
    const result = await checkLlmsIndexDrift(baseTarget, fs)
    if (!result.ok) {
      console.error(`\n${result.message}\n`)
      process.exitCode = 1
      return
    }
    console.log(result.message)
  } catch (error) {
    console.error(`\n${formatUnreadableTree(error, baseTarget)}\n`)
    process.exitCode = 1
  }
}

if (require.main === module) {
  void main()
}
