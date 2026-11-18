import { describe, it, expect } from 'vitest'
import {
  checkRegistry,
  findFsDependencies,
  isAuditedPath,
  type RegistryRow,
} from './direct-fs-guard'

describe('findFsDependencies (AC1: import, re-export, require, literal dynamic import)', () => {
  it.each([
    ["import { a } from 'fs'", 'import', 'fs'],
    ["import * as f from 'node:fs'", 'import', 'node:fs'],
    ["import type { Dirent } from 'fs/promises'", 'import', 'fs/promises'],
    ["export { x } from 'node:fs/promises'", 'export', 'node:fs/promises'],
    ["const f = require('fs')", 'require', 'fs'],
    ["const f = await import('node:fs')", 'dynamic-import', 'node:fs'],
  ])('%s', (src, form, specifier) => {
    expect(findFsDependencies('a.ts', src)).toEqual([{ form, specifier, line: 1 }])
  })

  it('ignores other modules, non-literal imports and text mentions', () => {
    const src = "import p from 'path'\nconst n = 'fs'\nawait import(n)\n// require('fs')"
    expect(findFsDependencies('a.ts', src)).toEqual([])
  })
})

describe('isAuditedPath', () => {
  it.each([
    ['apps/x/src/a.ts', true],
    ['scripts/a.mjs', true],
    ['packages/x/dist/a.js', false],
    ['docs/a.ts', false],
    ['apps/x/a.md', false],
  ])('%s -> %s', (p, ok) => expect(isAuditedPath(p)).toBe(ok))
})

describe('checkRegistry (AC5: unlisted fails with file/import/reason, stale fails, listed passes)', () => {
  const dep = [{ form: 'import' as const, specifier: 'fs', line: 3 }]
  const ok: RegistryRow = {
    path: 'a.ts',
    disposition: 'os-guarantee',
    reason: 'r',
    decision: 'd',
    testCategory: 't',
  }

  it('passes a listed, reviewed exception', () => {
    expect(checkRegistry(new Map([['a.ts', dep]]), [ok])).toEqual([])
  })

  it('names file, line, import for an unlisted dependency', () => {
    const [e] = checkRegistry(new Map([['b.ts', dep]]), [])
    expect(e).toContain("b.ts:3 unlisted direct-fs import 'fs'")
  })

  it('fails a stale entry', () => {
    expect(checkRegistry(new Map(), [ok])[0]).toContain('a.ts stale registry entry')
  })

  it.each(['migrate', 'migration-candidate'])('fails unresolved disposition %s', disposition => {
    expect(checkRegistry(new Map([['a.ts', dep]]), [{ ...ok, disposition }])[0]).toContain(
      'unresolved',
    )
  })

  it('fails an entry without reason/decision/category', () => {
    expect(
      checkRegistry(new Map([['a.ts', dep]]), [{ path: 'a.ts', disposition: 'x' }])[0],
    ).toContain('lacks reason')
  })
})
