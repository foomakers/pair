/**
 * T-1 (story #416) — the fixture-based suite for the `.pair/llms.txt` drift gate.
 *
 * Written BEFORE the module it imports (repo TDD convention). Every case runs on a
 * SELF-CONTAINED fixture tree under a temp dir: the real `.pair` corpus is never
 * read, so a legitimately added guideline can never turn this suite red — the whole
 * point of the gate is that such an addition goes red in the GATE, not here.
 *
 * The expected index is never hardcoded: each case asserts against what
 * `generateLlmsTxt` actually emits for that fixture. Per AC-6 the trailing-newline
 * form is #393's, consumed here and not re-litigated.
 */
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  readdirSync,
  chmodSync,
  statSync,
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  REGENERATION_COMMAND,
  TRACKED_INDEX_PATH,
  checkLlmsIndexDrift,
  compareIndex,
  formatReport,
  main,
  readOnlyFileSystem,
} from './llms-txt-drift-check'
import {
  generateLlmsTxt,
  type LlmsSourceFs,
} from '../../../../apps/pair-cli/src/registry/llms-generation'

const fixtures: string[] = []

afterEach(() => {
  while (fixtures.length > 0) {
    const dir = fixtures.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

/** A temp KB tree. `files` are paths relative to the tree root, with their content. */
function makeTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'llms-drift-'))
  fixtures.push(root)
  for (const [relative, content] of Object.entries(files)) {
    const target = join(root, relative)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content, 'utf-8')
  }
  return root
}

const KB_FILES: Record<string, string> = {
  '.pair/adoption/product/PRD.md': '# Product Requirements\n',
  '.pair/knowledge/how-to/01-how-to-start.md': '# How to start\n',
  '.pair/knowledge/guidelines/testing/README.md': '# Testing Guidelines\n',
}

/** A tree whose committed index is exactly what the generator emits for it. */
async function makeInSyncTree(extra: Record<string, string> = {}): Promise<string> {
  const root = makeTree({ ...KB_FILES, ...extra })
  const generated = await generateLlmsTxt(readOnlyFileSystem, root)
  writeFileSync(join(root, TRACKED_INDEX_PATH), generated, 'utf-8')
  return root
}

describe('checkLlmsIndexDrift — the committed index vs. the generator', () => {
  it('passes when the tracked index is what the generator emits', async () => {
    const root = await makeInSyncTree()

    const result = await checkLlmsIndexDrift(root)

    expect(result.ok).toBe(true)
    expect(result.report.kind).toBe('in-sync')
  })

  it('fails and names the un-indexed guideline as MISSING', async () => {
    const root = await makeInSyncTree()
    // A guideline added without regenerating — the exact miss this gate exists for.
    mkdirSync(join(root, '.pair/knowledge/guidelines/collaboration'), { recursive: true })
    writeFileSync(
      join(root, '.pair/knowledge/guidelines/collaboration/story-local-markers.md'),
      '# Story Local Markers\n',
      'utf-8',
    )

    const result = await checkLlmsIndexDrift(root)

    expect(result.ok).toBe(false)
    expect(result.report.kind).toBe('drift')
    const line =
      '- [Story Local Markers](.pair/knowledge/guidelines/collaboration/story-local-markers.md)'
    expect(result.report).toMatchObject({ missing: [line], extra: [] })
    // AC2: the LINE, not "files differ".
    expect(result.message).toContain(line)
    expect(result.message).toContain('missing')
  })

  it('fails and names the stale entry as EXTRA when a KB file is deleted', async () => {
    const root = await makeInSyncTree({
      '.pair/knowledge/guidelines/retired/old-rule.md': '# Old Rule\n',
    })
    rmSync(join(root, '.pair/knowledge/guidelines/retired'), { recursive: true, force: true })

    const result = await checkLlmsIndexDrift(root)

    expect(result.ok).toBe(false)
    const line = '- [Old Rule](.pair/knowledge/guidelines/retired/old-rule.md)'
    expect(result.report).toMatchObject({ kind: 'drift', missing: [], extra: [line] })
    expect(result.message).toContain(line)
    expect(result.message).toContain('extra')
  })

  it('names the regeneration command in the failure, so the fix needs no manual diff (AC5)', async () => {
    const root = await makeInSyncTree()
    writeFileSync(join(root, TRACKED_INDEX_PATH), '# pair\n', 'utf-8')

    const result = await checkLlmsIndexDrift(root)

    expect(result.ok).toBe(false)
    expect(result.message).toContain(REGENERATION_COMMAND)
  })

  it('NEVER writes: a failing run leaves the tracked file byte-identical (AC5, check-only ADL)', async () => {
    const root = await makeInSyncTree()
    const tracked = join(root, TRACKED_INDEX_PATH)
    writeFileSync(tracked, 'hand-edited garbage\n', 'utf-8')
    const before = readFileSync(tracked, 'utf-8')
    const mtimeBefore = statSync(tracked).mtimeMs

    const result = await checkLlmsIndexDrift(root)

    expect(result.ok).toBe(false)
    expect(readFileSync(tracked, 'utf-8')).toBe(before)
    expect(statSync(tracked).mtimeMs).toBe(mtimeBefore)
  })

  it('reports an EMPTY tracked file as drift with the full missing list, not a crash', async () => {
    const root = await makeInSyncTree()
    const expected = readFileSync(join(root, TRACKED_INDEX_PATH), 'utf-8')
    writeFileSync(join(root, TRACKED_INDEX_PATH), '', 'utf-8')

    const result = await checkLlmsIndexDrift(root)

    expect(result.ok).toBe(false)
    expect(result.report.kind).toBe('drift')
    const contentLines = expected.split('\n').filter(l => l.trim() !== '')
    expect(result.report).toMatchObject({ missing: contentLines, extra: [] })
  })

  it('reports an ABSENT tracked file as drift naming the file, not a crash', async () => {
    const root = await makeInSyncTree()
    rmSync(join(root, TRACKED_INDEX_PATH), { force: true })

    const result = await checkLlmsIndexDrift(root)

    expect(result.ok).toBe(false)
    expect(result.report).toMatchObject({ kind: 'drift', trackedExists: false })
    expect(result.message).toContain(TRACKED_INDEX_PATH)
  })

  it('reports a MISSING KB tree as a broken setup, a distinct outcome from drift', async () => {
    const root = makeTree({ 'README.md': '# not a pair project\n' })

    const result = await checkLlmsIndexDrift(root)

    expect(result.ok).toBe(false)
    expect(result.report.kind).toBe('broken-setup')
    expect(result.message).not.toContain(REGENERATION_COMMAND)
  })

  it('reports a PARTIALLY installed tree (no indexable section) as a broken setup too', async () => {
    const root = makeTree({ '.pair/llms.txt': '# pair\n' })

    const result = await checkLlmsIndexDrift(root)

    expect(result.report.kind).toBe('broken-setup')
  })

  // A tree missing ONE WHOLE section still yields other sections, so it clears the
  // broken-setup guard and is reported as drift listing every guideline as `extra`.
  // The verdict is right (a mass deletion looks identical), the ADVICE is not: a
  // contributor who obeys "regenerate and commit" on a sparse checkout commits an
  // index with the entire Guidelines section deleted — the index going stale in the
  // more damaging direction, caused by the gate's own message.
  it('cautions against regenerating when a whole tracked section has no generated entries', async () => {
    const root = await makeInSyncTree()
    rmSync(join(root, '.pair/knowledge/guidelines'), { recursive: true, force: true })

    const result = await checkLlmsIndexDrift(root)

    expect(result.report).toMatchObject({ kind: 'drift', emptiedSections: ['Guidelines'] })
    expect(result.message).toContain('Guidelines')
    expect(result.message).toContain('do not regenerate')
  })

  // The caution is worthless if the message then closes with the bare imperative: the
  // LAST paragraph is the call to action a contributor scanning for the fix obeys, and
  // obeying it here commits the index with the Guidelines section deleted. So the
  // closing paragraph itself must carry the precondition.
  it('conditions the closing call to action on a complete tree when a section was emptied', async () => {
    const root = await makeInSyncTree()
    rmSync(join(root, '.pair/knowledge/guidelines'), { recursive: true, force: true })

    const result = await checkLlmsIndexDrift(root)

    // Still names the command (AC5) — behind its precondition.
    expect(result.message).toContain(REGENERATION_COMMAND)
    expect(result.message).toContain('Once the tree is complete, regenerate with')
    // No paragraph anywhere opens with the unconditional imperative.
    expect(result.message).not.toMatch(/^Regenerate with/m)
    const paragraphs = result.message.split('\n\n')
    expect(paragraphs[paragraphs.length - 1]).toContain('Once the tree is complete')
  })

  it('adds no caution when every tracked heading still has generated entries', async () => {
    const root = await makeInSyncTree()
    rmSync(join(root, '.pair/knowledge/guidelines/testing/README.md'), { force: true })
    writeFileSync(join(root, '.pair/knowledge/guidelines/testing/other.md'), '# Other\n', 'utf-8')

    const result = await checkLlmsIndexDrift(root)

    expect(result.report).toMatchObject({ kind: 'drift', emptiedSections: [] })
    expect(result.message).not.toContain('do not regenerate')
    // The paired path: a complete tree keeps the unconditional imperative.
    expect(result.message).toMatch(/^Regenerate with/m)
    expect(result.message).not.toContain('Once the tree is complete')
  })

  // The story's edge case names "locale-dependent sort" verbatim. `localeCompare`
  // passes no locale and uses the runtime's ICU default, so a Node built without full
  // ICU orders the index differently and the gate goes red on an untouched tree.
  // `PRD.md` vs `context-map.md` is a pair where ICU (case-insensitive: context-map
  // first) and the code-unit comparator ('P' 0x50 < 'c' 0x63: PRD first) disagree.
  it('orders entries by code unit, not by the runtime locale', async () => {
    const root = makeTree({
      ...KB_FILES,
      '.pair/adoption/product/context-map.md': '# Context Map\n',
    })

    const generated = await generateLlmsTxt(readOnlyFileSystem, root)

    expect(generated.indexOf('product/PRD.md')).toBeLessThan(
      generated.indexOf('product/context-map.md'),
    )
  })

  it('is deterministic: the same tree yields the same generated index twice', async () => {
    const root = await makeInSyncTree({
      '.pair/knowledge/guidelines/b/second.md': '# Second\n',
      '.pair/knowledge/guidelines/a/first.md': '# First\n',
      '.pair/adoption/decision-log/2026-01-01-a-choice.md': '# A choice\n',
    })

    const first = await generateLlmsTxt(readOnlyFileSystem, root)
    const second = await generateLlmsTxt(readOnlyFileSystem, root)

    expect(second).toBe(first)
    // Ordering is content-derived (sorted by path), not filesystem-walk order.
    expect(first.indexOf('a/first.md')).toBeLessThan(first.indexOf('b/second.md'))
  })

  it('is deterministic across runs: two checks on the same tree report identically', async () => {
    const root = await makeInSyncTree()
    writeFileSync(join(root, TRACKED_INDEX_PATH), '# pair\n', 'utf-8')

    const first = await checkLlmsIndexDrift(root)
    const second = await checkLlmsIndexDrift(root)

    expect(second.message).toBe(first.message)
  })
})

describe('compareIndex — the pure line-level comparison', () => {
  it('is in-sync only on byte equality', () => {
    expect(compareIndex('a\nb\n', 'a\nb\n').kind).toBe('in-sync')
    expect(compareIndex('a\nb\n', 'a\nb').kind).toBe('drift')
  })

  it('reports a whitespace/ordering-only difference with empty missing AND extra', () => {
    const report = compareIndex('- [A](a)\n- [B](b)\n', '- [B](b)\n- [A](a)\n')

    expect(report).toMatchObject({ kind: 'drift', missing: [], extra: [] })
    expect(formatReport(report, '/repo')).toContain('order')
  })

  it('ignores blank lines, which carry no index information', () => {
    expect(compareIndex('- [A](a)\n\n\n', '- [A](a)\n').kind).toBe('drift')
    expect(compareIndex('- [A](a)\n\n\n', '- [A](a)\n')).toMatchObject({ missing: [], extra: [] })
  })

  // `.pair/llms.txt` is touched by every ADL/guideline addition, so parallel branches
  // conflict on it routinely and a "keep both sides" resolution duplicates an entry
  // line. Diffed as SETS that duplicate is invisible: 0 missing / 0 extra plus the
  // "order or whitespace" sentence — a confidently wrong diagnosis in exactly the
  // case where the contributor needs the diff (AC2).
  it('reports a DUPLICATED line as extra — multiplicity, not set membership', () => {
    const report = compareIndex(
      '- [A](a.md)\n- [B](b.md)\n',
      '- [A](a.md)\n- [A](a.md)\n- [B](b.md)\n',
    )

    expect(report).toMatchObject({ kind: 'drift', missing: [], extra: ['- [A](a.md)'] })
    expect(formatReport(report, '/repo')).not.toContain('order')
  })

  it('reports a DROPPED duplicate as missing when the generator emits a line twice', () => {
    const report = compareIndex('- [A](a.md)\n- [A](a.md)\n', '- [A](a.md)\n')

    expect(report).toMatchObject({ kind: 'drift', missing: ['- [A](a.md)'], extra: [] })
  })
})

describe('main — the CLI wrapper', () => {
  // The catch path asserted through the INJECTED fs seam, so the coverage does not
  // depend on the uid the suite runs under. Probing a `chmod 000` directory and
  // skipping the body when it stays readable (root — the default user in a plain
  // `node:*` image and in many self-hosted runners) makes the test vacuous exactly
  // there: deleting `main`'s try/catch would re-introduce the unhandled rejection and
  // the suite would still print all-green, with no skip marker to show the gap.
  it('turns an UNREADABLE KB directory into a report, not an unhandled rejection', async () => {
    const root = await makeInSyncTree()
    const scandirDenied = Object.assign(
      new Error(`EACCES: permission denied, scandir '${join(root, '.pair/knowledge/guidelines')}'`),
      { code: 'EACCES' },
    )
    const unreadableTree: LlmsSourceFs = {
      ...readOnlyFileSystem,
      readdir: () => {
        throw scandirDenied
      },
    }

    const previousExitCode = process.exitCode
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await main(root, unreadableTree)

      expect(process.exitCode).toBe(1)
      const printed = errors.mock.calls.map(call => String(call[0])).join('\n')
      expect(printed).toContain('llms-index')
      expect(printed).toContain('EACCES')
      expect(printed).toContain('could not read the knowledge base')
      // A broken setup is not a stale index: it must NOT send anyone to regenerate.
      expect(printed).not.toContain(REGENERATION_COMMAND)
    } finally {
      errors.mockRestore()
      process.exitCode = previousExitCode
    }
  })

  // The same path against a REAL permission-denied directory — kept as the proof that
  // the injected error is the one the OS actually raises. Explicitly SKIPPED, never
  // silently vacuous, under a uid the permission bit does not bind.
  it('reports a real chmod-000 KB directory the same way', async ctx => {
    const root = await makeInSyncTree()
    const locked = join(root, '.pair/knowledge/guidelines/locked')
    mkdirSync(locked, { recursive: true })
    writeFileSync(join(locked, 'rule.md'), '# Rule\n', 'utf-8')
    chmodSync(locked, 0o000)

    let readable = true
    try {
      readdirSync(locked)
    } catch {
      readable = false
    }
    if (readable) {
      chmodSync(locked, 0o700)
      ctx.skip('this uid ignores the permission bit (root) — the case cannot exist here')
    }

    const previousExitCode = process.exitCode
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await main(root)

      expect(process.exitCode).toBe(1)
      const printed = errors.mock.calls.map(call => String(call[0])).join('\n')
      expect(printed).toContain('llms-index')
      expect(printed).toContain('EACCES')
      expect(printed).not.toContain(REGENERATION_COMMAND)
    } finally {
      errors.mockRestore()
      process.exitCode = previousExitCode
      chmodSync(locked, 0o700)
    }
  })

  it('prints the in-sync report and leaves the exit code untouched on a clean tree', async () => {
    const root = await makeInSyncTree()
    const previousExitCode = process.exitCode
    const logs = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      process.exitCode = undefined
      await main(root)

      expect(process.exitCode).toBeUndefined()
      expect(String(logs.mock.calls[0]?.[0])).toContain('matches the generator')
    } finally {
      logs.mockRestore()
      process.exitCode = previousExitCode
    }
  })

  it('exits 1 on drift', async () => {
    const root = await makeInSyncTree()
    writeFileSync(join(root, TRACKED_INDEX_PATH), '# pair\n', 'utf-8')
    const previousExitCode = process.exitCode
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await main(root)

      expect(process.exitCode).toBe(1)
      expect(String(errors.mock.calls[0]?.[0])).toContain(REGENERATION_COMMAND)
    } finally {
      errors.mockRestore()
      process.exitCode = previousExitCode
    }
  })
})
