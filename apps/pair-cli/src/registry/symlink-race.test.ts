import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs'
import { rmSync, realpathSync, symlinkSync, lstatSync, readlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileSystemService, type FileSystemService } from '@pair/content-ops'
import { distributeToSecondaryTargets, postCopyOps } from './operations'
import type { RegistryConfig } from './resolver'

/**
 * US-134 review round 2, group r2-g1 (finding r1-5, AC9). The skills registry's symlink
 * secondary targets must be replaced race-tolerantly, last writer wins: an overlapping run is
 * never aborted by the other run's unlink (ENOENT) or symlink (EEXIST). Real filesystem
 * throughout — the race is the real ENOENT/EEXIST the OS raises; the in-memory double has neither.
 */

const roots: string[] = []
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

const TARGETS = [
  { path: '.claude/skills/', mode: 'canonical' as const },
  { path: '.github/skills/', mode: 'symlink' as const },
]

/** A real project: canonical `.claude/skills/x/SKILL.md`, optionally a link at `.github/skills`. */
function project(link?: string): { root: string; canonical: string; linkPath: string } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-symlink-race-')))
  roots.push(root)
  const canonical = join(root, '.claude', 'skills')
  mkdirSync(join(canonical, 'x'), { recursive: true })
  writeFileSync(join(canonical, 'x', 'SKILL.md'), '# x')
  mkdirSync(join(root, '.github'), { recursive: true })
  const linkPath = join(root, '.github', 'skills')
  if (link !== undefined) symlinkSync(link, linkPath, 'dir')
  return { root, canonical, linkPath }
}

function distribute(fileService: FileSystemService, root: string): Promise<void> {
  return distributeToSecondaryTargets({
    fileService,
    sourcePath: join(root, 'dataset', '.claude', 'skills'),
    targets: TARGETS,
    baseTarget: root,
  })
}

/** The link is a symlink, relative, resolving to the canonical dir; no temp residue beside it. */
function expectValidLink(linkPath: string, canonical: string): void {
  expect(lstatSync(linkPath).isSymbolicLink()).toBe(true)
  expect(readlinkSync(linkPath)).toBe(join('..', '.claude', 'skills'))
  expect(realpathSync(linkPath)).toBe(canonical)
  expect(readFileSync(join(linkPath, 'x', 'SKILL.md'), 'utf8')).toBe('# x')
  expect(readdirSync(join(linkPath, '..')).sort()).toEqual(['skills'])
}

/** The other run's whole link replacement, as the real filesystem shows it to us. */
function otherRunReplacesLink(linkPath: string): void {
  rmSync(linkPath, { force: true })
  symlinkSync(join('..', '.claude', 'skills'), linkPath, 'dir')
}

describe('r1-5: symlink secondary target replacement under overlapping runs (AC9)', () => {
  it('W-r15-unlink-enoent: the other run unlinks the link first — our run still resolves', async () => {
    const { root, canonical, linkPath } = project(join('..', '.claude', 'skills'))
    let fired = false
    const fs: FileSystemService = {
      ...fileSystemService,
      unlink: async p => {
        if (!fired && p === linkPath) {
          fired = true
          rmSync(linkPath, { force: true })
        }
        return fileSystemService.unlink(p)
      },
    }
    await expect(distribute(fs, root)).resolves.toBeUndefined()
    expectValidLink(linkPath, canonical)
  })

  it('W-r15-symlink-eexist: the other run re-creates the link first — our run still resolves', async () => {
    const { root, canonical, linkPath } = project(join('..', '.claude', 'skills'))
    let fired = false
    const fs: FileSystemService = {
      ...fileSystemService,
      symlink: async (target, p) => {
        if (!fired) {
          fired = true
          otherRunReplacesLink(linkPath)
        }
        return fileSystemService.symlink(target, p)
      },
    }
    await expect(distribute(fs, root)).resolves.toBeUndefined()
    expectValidLink(linkPath, canonical)
  })

  it('B-r15-dangling: a dangling link at the link path is replaced, not EEXIST', async () => {
    const { root, canonical, linkPath } = project(join('..', '.claude', 'gone'))
    await expect(distribute(fileSystemService, root)).resolves.toBeUndefined()
    expectValidLink(linkPath, canonical)
  })

  it('W-r15-promise-all-x30: two concurrent distributions both resolve, 30 times', async () => {
    const { root, canonical, linkPath } = project(join('..', '.claude', 'skills'))
    const rejected: string[] = []
    for (let i = 0; i < 30; i++) {
      const results = await Promise.allSettled([
        distribute(fileSystemService, root),
        distribute(fileSystemService, root),
      ])
      for (const r of results) {
        if (r.status === 'rejected') rejected.push(`${i}: ${(r.reason as Error).message}`)
      }
    }
    expect(rejected).toEqual([])
    expectValidLink(linkPath, canonical)
  })

  it('I-r15-postcopyops-x30: two concurrent postCopyOps on the skills registry both resolve', async () => {
    const { root, canonical, linkPath } = project(join('..', '.claude', 'skills'))
    const cursorLink = join(root, '.cursor', 'skills')
    const registryConfig: RegistryConfig = {
      source: '.skills',
      behavior: 'mirror',
      description: 'Skills',
      include: [],
      flatten: false,
      targets: [...TARGETS, { path: '.cursor/skills/', mode: 'symlink' }],
    }
    const run = (): Promise<void> =>
      postCopyOps({
        fs: fileSystemService,
        registryConfig,
        effectiveTarget: canonical,
        datasetPath: join(root, 'dataset', '.skills'),
        baseTarget: root,
      })
    const rejected: string[] = []
    for (let i = 0; i < 30; i++) {
      const results = await Promise.allSettled([run(), run()])
      for (const r of results) {
        if (r.status === 'rejected') rejected.push(`${i}: ${(r.reason as Error).message}`)
      }
    }
    expect(rejected).toEqual([])
    expectValidLink(linkPath, canonical)
    expectValidLink(cursorLink, canonical)
  })

  it('C-r15-absent-created: no link yet — a relative link to the canonical dir is created', async () => {
    const { root, canonical, linkPath } = project()
    await distribute(fileSystemService, root)
    expectValidLink(linkPath, canonical)
  })

  it('C-r15-present-replaced: a link to another dir is replaced by the canonical link', async () => {
    const { root, canonical, linkPath } = project(join('..', 'elsewhere'))
    mkdirSync(join(root, 'elsewhere'))
    await distribute(fileSystemService, root)
    expectValidLink(linkPath, canonical)
    await distribute(fileSystemService, root)
    expectValidLink(linkPath, canonical)
  })

  it('C-r15-dir-preserved: a real directory at the link path is never deleted', async () => {
    const { root, linkPath } = project()
    mkdirSync(linkPath)
    writeFileSync(join(linkPath, 'mine.md'), 'user content')
    await expect(distribute(fileSystemService, root)).rejects.toThrow()
    expect(lstatSync(linkPath).isDirectory()).toBe(true)
    expect(readFileSync(join(linkPath, 'mine.md'), 'utf8')).toBe('user content')
    expect(readdirSync(join(linkPath, '..')).sort()).toEqual(['skills'])
  })
})
