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
 * `ts-node src/quality-gates/llms-txt-drift-check.ts` (package script
 * `llms-index:check`, delegated from the repo-root script of the same name).
 * Exit 0 = in sync, exit 1 = drift or broken setup.
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
  | { kind: 'drift'; missing: string[]; extra: string[]; trackedExists: boolean }
  | { kind: 'broken-setup'; detail: string }

/** Lines that carry index information — blank lines say nothing about drift. */
function contentLines(text: string): string[] {
  return text.split('\n').filter(line => line.trim() !== '')
}

/**
 * The verdict is BYTE equality (AC1); the missing/extra lists are the actionable
 * EXPLANATION of a failure (AC2), not the verdict itself. That is why two files with
 * the same lines in a different order — or differing only in trailing whitespace —
 * are still drift, reported with both lists empty and a message that says so.
 */
export function compareIndex(expected: string, actual: string | null): DriftReport {
  if (actual !== null && actual === expected) return { kind: 'in-sync' }

  const expectedLines = contentLines(expected)
  const actualLines = contentLines(actual ?? '')
  const expectedSet = new Set(expectedLines)
  const actualSet = new Set(actualLines)

  return {
    kind: 'drift',
    missing: expectedLines.filter(line => !actualSet.has(line)),
    extra: actualLines.filter(line => !expectedSet.has(line)),
    trackedExists: actual !== null,
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

function renderLines(label: string, lines: string[]): string {
  const header = `${lines.length} ${label} line(s):`
  return lines.length === 0 ? header : `${header}\n${lines.map(l => `  ${l}`).join('\n')}`
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

  const parts = [
    `❌ llms-index: ${TRACKED_INDEX_PATH} is not what the generator emits for this tree.`,
  ]

  if (!report.trackedExists) {
    parts.push(`The tracked file ${join(baseTarget, TRACKED_INDEX_PATH)} does not exist.`)
  }

  parts.push(
    renderLines('missing', report.missing) +
      `\n  (the generator emits these; the tracked file does not)`,
  )
  parts.push(
    renderLines('extra', report.extra) + `\n  (the tracked file has these; the generator does not)`,
  )

  if (report.missing.length === 0 && report.extra.length === 0) {
    parts.push(
      `Both sides carry the same lines: the difference is their order or surrounding\n` +
        `whitespace (a trailing newline, a blank line).`,
    )
  }

  parts.push(
    `Regenerate with \`${REGENERATION_COMMAND}\` and commit the result. This check never\n` +
      `writes ${TRACKED_INDEX_PATH} — a gate that fixed the drift would hide it.`,
  )

  return parts.join('\n\n')
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
  const actual = (await fs.exists(trackedPath)) ? await fs.readFile(trackedPath) : null
  const report = compareIndex(expected, actual)

  return { ok: report.kind === 'in-sync', report, message: formatReport(report, baseTarget) }
}

/** Thin CLI wrapper: print the report and set the exit code. */
export async function main(): Promise<void> {
  const result = await checkLlmsIndexDrift()
  if (!result.ok) {
    console.error(`\n${result.message}\n`)
    process.exitCode = 1
    return
  }
  console.log(result.message)
}

if (require.main === module) {
  void main()
}
