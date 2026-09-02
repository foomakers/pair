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
 */
export const REGENERATION_COMMAND = 'pair update'

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
       * case where `pair update` is the WRONG advice. See `carriageReturnCaution`.
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
 * Characters a terminal renders as NOTHING: the BOM, the zero-width family, the soft
 * hyphen, the two Unicode line/paragraph separators. `JSON.stringify` leaves every one
 * of them unescaped, so they are escaped by hand in `escapeInvisible`.
 */
const ZERO_WIDTH = /[\u00AD\u200B-\u200D\u2060\u2028\u2029\uFEFF]/g

/**
 * Characters a terminal renders as AN ORDINARY SPACE: NBSP (what a word processor or
 * an HTML copy pastes), the fixed-width spaces, the narrow/medium/ideographic ones. A
 * tab is here too — `JSON.stringify` already shows it as `\t`, but as a KEY it must
 * count as a space so that `a\tb` pairs with `a b`.
 */
const SPACE_LIKE = /[\t\u00A0\u2000-\u200A\u202F\u205F\u3000]/g

/**
 * What a line LOOKS like on a terminal: zero-width characters gone, space-likes
 * folded to a space, leading/trailing whitespace dropped. Two lines with the same
 * visible form are a "look-alike pair" — listed once as missing and once as extra,
 * they would print as two identical lines, which is the one shape of report AC-2's
 * "the fix is obvious without a manual diff" cannot survive.
 */
function visibleForm(line: string): string {
  return line.replace(ZERO_WIDTH, '').replace(SPACE_LIKE, ' ').trim()
}

/**
 * The line quoted, with every invisible character spelled as `\uXXXX`. The quotes make
 * leading/trailing whitespace visible; the escapes make the rest visible.
 */
function escapeInvisible(line: string): string {
  const hex = (c: string) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`
  return JSON.stringify(line)
    .replace(ZERO_WIDTH, hex)
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, hex)
}

/** The visible forms that occur on BOTH sides — each one is a look-alike pair. */
function lookAlikeForms(missing: string[], extra: string[]): Set<string> {
  const onMissingSide = new Set(missing.map(visibleForm))
  return new Set(extra.map(visibleForm).filter(form => onMissingSide.has(form)))
}

/**
 * A look-alike line is rendered escaped, every other line raw: quoting the common
 * case (a whole missing entry) would make it harder to read for no gain.
 */
function renderLines(label: string, lines: string[], lookAlikes: Set<string>): string {
  const header = `${lines.length} ${label} line(s):`
  const rendered = lines.map(l => `  ${lookAlikes.has(visibleForm(l)) ? escapeInvisible(l) : l}`)
  return lines.length === 0 ? header : `${header}\n${rendered.join('\n')}`
}

/**
 * Printed once per report when at least one look-alike pair exists: it names the class
 * of problem (the pair above is not a typo the reader failed to spot) and how the pair
 * was rendered, so `"\ufeff# pair"` and `"- [PRD](...) "` read as what they are.
 */
function invisibleDifferenceCaution(pairCount: number): string {
  return (
    `⚠ ${pairCount} missing/extra pair(s) differ only in characters a terminal does not show —\n` +
    `  a byte-order mark, trailing or leading whitespace, a non-breaking or zero-width\n` +
    `  space. Those lines are printed above in quotes, with the invisible characters\n` +
    `  escaped as \\uXXXX, so the difference is visible.`
  )
}

/**
 * The one invisible character with a known producer AND a known fix, so it gets a
 * caution of its own. Unlike a CR the BOM is not something git writes back on checkout:
 * `pair update` was run on a BOM-prefixed index and rewrote it without one, so the call
 * to action stays the bare imperative — this caution adds no precondition.
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
 * Naming `pair update` here would be the one piece of advice that cannot work: the
 * regenerated file lands as LF and the next checkout puts the CRs back. The exit is a
 * renormalization, so that is what the message names.
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
 * alternative is the one report that closes with `pair update` and cannot be obeyed.
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
 * "Regenerate with `pair update` and commit the result" contradicts itself and delivers,
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
  if (lookAlikes.size > 0) parts.push(invisibleDifferenceCaution(lookAlikes.size))
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
