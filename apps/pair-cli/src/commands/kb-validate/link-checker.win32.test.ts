/**
 * Optional link patterns (US-188) on Windows, through the public `validateLinks`
 * API. `path.win32.relative()` returns backslash-separated paths, so the written
 * form of a link and its resolved form only compare after both are normalized —
 * a regression that made every story example pattern (`../../apps/**`) match
 * nothing on Windows while POSIX stayed green.
 *
 * `path` is mocked to its win32 flavour for the whole file (that is why this
 * lives in its own file): `dirname`/`join`/`relative` are platform-bound, so
 * there is no other way to exercise the Windows shape from a POSIX runner.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('path', async () => {
  const actual = await vi.importActual<typeof import('path')>('path')
  return { ...actual.win32, default: actual.win32 }
})

import { validateLinks } from './link-checker'
import { InMemoryFileSystemService } from '@pair/content-ops/test-utils/in-memory-fs'

describe('validateLinks - optional link patterns on win32 paths', () => {
  const kb = 'C:\\kb'
  let fs: InMemoryFileSystemService

  beforeEach(() => {
    fs = new InMemoryFileSystemService({}, kb, kb)
  })

  it('matches the written form when the climb lands on the KB root', async () => {
    // `../../apps/website/page.tsx` from `.pair\knowledge\` resolves to
    // `apps\website\page.tsx` (backslashes, win32) — the same target the written
    // form spells, so the rule applies and the missing target is a warning.
    const source = `${kb}\\.pair\\knowledge\\guide.md`
    fs.writeFile(source, '[Code](../../apps/website/page.tsx)')

    const { results } = await validateLinks({
      baseDir: kb,
      files: [source],
      fs,
      optionalLinkPatterns: ['../../apps/**'],
    })

    expect(results[0]?.valid).toBe(true)
    expect(results[0]?.errors).toHaveLength(0)
    expect(results[0]?.warnings).toHaveLength(1)
  })

  it('matches the written form when the target leaves the KB tree entirely', async () => {
    // Resolves above `C:\kb`, so the resolved form is `..\apps\y.md`: the
    // written form is the only stable spelling and stays a candidate.
    const source = `${kb}\\.pair\\knowledge\\guide.md`
    fs.writeFile(source, '[Code](../../../apps/y.md)')

    const { results } = await validateLinks({
      baseDir: kb,
      files: [source],
      fs,
      optionalLinkPatterns: ['../../../apps/**'],
    })

    expect(results[0]?.valid).toBe(true)
    expect(results[0]?.warnings).toHaveLength(1)
  })

  it('still errors when the climb lands back INSIDE the KB (depth-blind guard)', async () => {
    // From `.pair\knowledge\a\b\` two climbs reach `.pair\knowledge\`, so the
    // link resolves to `.pair\knowledge\apps\y.md` — an in-KB break the rule
    // `../../apps/**` must not silence, on Windows as on POSIX.
    const source = `${kb}\\.pair\\knowledge\\a\\b\\guide.md`
    fs.writeFile(source, '[Code](../../apps/y.md)')

    const { results } = await validateLinks({
      baseDir: kb,
      files: [source],
      fs,
      optionalLinkPatterns: ['../../apps/**'],
    })

    expect(results[0]?.valid).toBe(false)
    expect(results[0]?.errors[0]).toContain('Broken internal link')
  })

  it('matches the resolved form regardless of separators', async () => {
    const source = `${kb}\\.pair\\knowledge\\guide.md`
    fs.writeFile(source, '[Code](../../apps/website/page.tsx)')

    const { results } = await validateLinks({
      baseDir: kb,
      files: [source],
      fs,
      // Resolved form only: `apps\website\page.tsx` normalized to POSIX.
      optionalLinkPatterns: ['apps/**'],
    })

    expect(results[0]?.valid).toBe(true)
    expect(results[0]?.warnings).toHaveLength(1)
  })
})
