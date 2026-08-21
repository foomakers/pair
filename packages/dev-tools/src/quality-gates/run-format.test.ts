import { describe, it, expect, afterEach } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

import { REPO_ROOT } from './repo-root'

// #414: root format:check/format invoke each wrapper ONCE from the repo root via
// this composition, instead of turbo's per-workspace pass. Exercises the
// prettier path here; T-3 adds the markdownlint-specific cases to this file.
const RUN_FORMAT = resolve(REPO_ROOT, 'scripts/format-lib/run-format.sh')

function run(cwd: string, args: string[]): { status: number; stderr: string } {
  try {
    execFileSync(RUN_FORMAT, args, { cwd })
    return { status: 0, stderr: '' }
  } catch (error) {
    const e = error as { status: number; stderr: Buffer }
    return { status: e.status, stderr: e.stderr.toString('utf-8') }
  }
}

function initRepo(dir: string): void {
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir })
}

function commitAll(dir: string): void {
  execFileSync('git', ['add', '-A'], { cwd: dir })
  execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: dir })
}

describe('run-format.sh — prettier composition (#414)', () => {
  let tmp: string

  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  })

  it('exits 0 on an already-formatted tracked file', () => {
    tmp = mkdtempSync(join(tmpdir(), 'rf-'))
    initRepo(tmp)
    writeFileSync(join(tmp, 'a.json'), '{ "a": 1 }\n')
    commitAll(tmp)

    const result = run(tmp, ['check', 'prettier', 'json'])
    expect(result.status).toBe(0)
  })

  it('exits 1 and names the file when a tracked file is unformatted (AC2)', () => {
    tmp = mkdtempSync(join(tmpdir(), 'rf-'))
    initRepo(tmp)
    writeFileSync(join(tmp, 'bad.json'), '{"a":1}')
    commitAll(tmp)

    const result = run(tmp, ['check', 'prettier', 'json'])
    expect(result.status).toBe(1)
  })

  it('checks only the derived path set — a file outside every requested extension is untouched', () => {
    tmp = mkdtempSync(join(tmpdir(), 'rf-'))
    initRepo(tmp)
    writeFileSync(join(tmp, 'a.json'), '{ "a": 1 }\n')
    writeFileSync(join(tmp, 'bad.md'), 'not json, irrelevant here')
    commitAll(tmp)

    // Only .json requested — the .md file must never influence the result.
    const result = run(tmp, ['check', 'prettier', 'json'])
    expect(result.status).toBe(0)
  })

  it('fix mode rewrites exactly the file check flagged (AC4: check set == fix set)', () => {
    tmp = mkdtempSync(join(tmpdir(), 'rf-'))
    initRepo(tmp)
    writeFileSync(join(tmp, 'bad.json'), '{"a":1}')
    commitAll(tmp)

    const before = run(tmp, ['check', 'prettier', 'json'])
    expect(before.status).toBe(1)

    const fixResult = run(tmp, ['fix', 'prettier', 'json'])
    expect(fixResult.status).toBe(0)

    const after = run(tmp, ['check', 'prettier', 'json'])
    expect(after.status).toBe(0)
    expect(readFileSync(join(tmp, 'bad.json'), 'utf-8')).toBe('{ "a": 1 }\n')
  })

  it('exits 2 when run outside a git work tree — never collapsed into 1 (violations)', () => {
    tmp = mkdtempSync(join(tmpdir(), 'rf-'))
    writeFileSync(join(tmp, 'a.json'), '{"a":1}')

    const result = run(tmp, ['check', 'prettier', 'json'])
    expect(result.status).toBe(2)
  })

  it('exits 2 when the derived set is empty', () => {
    tmp = mkdtempSync(join(tmpdir(), 'rf-'))
    initRepo(tmp)
    writeFileSync(join(tmp, 'a.md'), '# a\n')
    commitAll(tmp)

    const result = run(tmp, ['check', 'prettier', 'json'])
    expect(result.status).toBe(2)
  })
})
