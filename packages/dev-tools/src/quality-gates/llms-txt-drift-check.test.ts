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
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  REGENERATION_COMMAND,
  TRACKED_INDEX_PATH,
  checkLlmsIndexDrift,
  compareIndex,
  formatReport,
  readOnlyFileSystem,
} from './llms-txt-drift-check'
import { generateLlmsTxt } from '../../../../apps/pair-cli/src/registry/llms-generation'

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
})
