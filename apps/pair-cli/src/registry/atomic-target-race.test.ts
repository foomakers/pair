import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs'
import { renameSync, rmSync, realpathSync, symlinkSync, lstatSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join, relative } from 'path'
import { fileSystemService, type FileSystemService } from '@pair/content-ops'
import { postCopyOps } from './operations'
import { writeDirAtomically } from './atomic-target'
import { rewriteSkillRefsInTarget, detectOrphanedSkillReferences } from './skill-refs'
import type { RegistryConfig } from './resolver'

/**
 * US-134 review round 1, group r1-g1 (findings r0-1, r0-4). Real filesystem throughout: the
 * race rows need the real ENOENT a vanished directory raises, and the stage rows need the real
 * mkdir/symlink semantics (the in-memory double has neither EEXIST nor link-following mkdir).
 */

const roots: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

function tmpRoot(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-race-')))
  roots.push(root)
  return root
}

function seed(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(root, rel, '..'), { recursive: true })
    writeFileSync(join(root, rel), content)
  }
}

/** Every regular file under `dir`, relative and sorted; symlinks listed as `<name>@`. */
function listTree(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isSymbolicLink()) out.push(`${relative(dir, p)}@`)
      else if (e.isDirectory()) walk(p)
      else out.push(relative(dir, p))
    }
  }
  walk(dir)
  return out.sort()
}

function residue(parent: string): string[] {
  return readdirSync(parent).filter(n => n.includes('.tmp-') || n.includes('.bak'))
}

const ASIDE = (target: string) => `${target}.bak.tmp-${process.pid}-race`

/**
 * The other run's swap, as the real filesystem shows it to us: our target is renamed aside
 * (the read we are in fails with ENOENT), then the other run's stage lands at the target path.
 */
function otherRunSwapsAround<T>(target: string, read: () => Promise<T>): Promise<T> {
  renameSync(target, ASIDE(target))
  return read().finally(() => {
    mkdirSync(target)
    writeFileSync(join(target, 'other.md'), 'other run')
    rmSync(ASIDE(target), { recursive: true, force: true })
  })
}

/** Wraps the real service; `hook` fires ONCE, on the first call of `method` for `path`. */
function racingFs(
  method: 'readdir' | 'copy' | 'readlink' | 'exists' | 'readFile',
  path: string,
  target: string,
): FileSystemService {
  let fired = false
  const real = fileSystemService as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>
  const wrapped = (...args: unknown[]): Promise<unknown> => {
    if (fired || args[0] !== path) return real[method]!(...args)
    fired = true
    if (method === 'exists') {
      return real[method]!(...args).then(r => {
        renameSync(target, ASIDE(target))
        return r
      })
    }
    return otherRunSwapsAround(target, () => real[method]!(...args))
  }
  return { ...fileSystemService, [method]: wrapped } as FileSystemService
}

const PRE = ['a.md', 'l@', 'x/y.md']
const OTHER = ['other.md']

function preTree(root: string): string {
  const target = join(root, 'k')
  seed(root, { 'k/a.md': 'pre', 'k/x/y.md': 'pre', 'elsewhere/e.md': 'e' })
  symlinkSync('../elsewhere', join(target, 'l'), 'dir')
  return target
}

const mine = (fs: FileSystemService) => async (stage: string) => {
  await fs.writeFile(join(stage, 'mine.md'), 'mine')
}

/** One run's tree end-to-end: ours on top of ONE consistent seed, never a mix of two. */
function expectOneConsistentSeed(target: string): void {
  expect(readFileSync(join(target, 'mine.md'), 'utf-8')).toBe('mine')
  const seeded = listTree(target).filter(f => f !== 'mine.md')
  expect([PRE.join(','), OTHER.join(',')]).toContain(seeded.join(','))
}

describe('r0-1 seed: the target vanishes mid-seed (AC9: a lost race, never an abort)', () => {
  it('W-r01-seed-root: readdir of the target root hits ENOENT', async () => {
    const root = tmpRoot()
    const target = preTree(root)
    const fs = racingFs('readdir', target, target)
    await expect(writeDirAtomically(target, fs, mine(fs))).resolves.toBeUndefined()
    expectOneConsistentSeed(target)
    expect(residue(root)).toEqual([])
  })

  it('W-r01-seed-subtree: readdir of a nested subtree hits ENOENT after the root was listed', async () => {
    const root = tmpRoot()
    const target = preTree(root)
    const fs = racingFs('readdir', join(target, 'x'), target)
    await expect(writeDirAtomically(target, fs, mine(fs))).resolves.toBeUndefined()
    expectOneConsistentSeed(target)
    expect(residue(root)).toEqual([])
  })

  it('W-r01-seed-file: copying a seeded file hits ENOENT', async () => {
    const root = tmpRoot()
    const target = preTree(root)
    const fs = racingFs('copy', join(target, 'a.md'), target)
    await expect(writeDirAtomically(target, fs, mine(fs))).resolves.toBeUndefined()
    expectOneConsistentSeed(target)
    expect(residue(root)).toEqual([])
  })

  it('W-r01-seed-symlink: reading a seeded symlink hits ENOENT', async () => {
    const root = tmpRoot()
    const target = preTree(root)
    const fs = racingFs('readlink', join(target, 'l'), target)
    await expect(writeDirAtomically(target, fs, mine(fs))).resolves.toBeUndefined()
    expectOneConsistentSeed(target)
    expect(residue(root)).toEqual([])
  })

  it('C-r01-seed-stable: an undisturbed seed copies files, subtrees and links verbatim', async () => {
    const root = tmpRoot()
    const target = preTree(root)
    await writeDirAtomically(target, fileSystemService, mine(fileSystemService))
    expect(listTree(target)).toEqual([...PRE, 'mine.md'].sort())
    expect(lstatSync(join(target, 'l')).isSymbolicLink()).toBe(true)
    expect(residue(root)).toEqual([])
  })

  it('C-r01-seed-eacces: a seed error that is not a vanished target still aborts, live tree intact', async () => {
    const root = tmpRoot()
    const target = preTree(root)
    const fs = {
      ...fileSystemService,
      readdir: async (p: string) => {
        if (p === target) throw Object.assign(new Error(`EACCES: ${p}`), { code: 'EACCES' })
        return fileSystemService.readdir(p)
      },
    } as FileSystemService
    await expect(writeDirAtomically(target, fs, mine(fs))).rejects.toThrow('EACCES')
    expect(listTree(target)).toEqual(PRE)
    expect(residue(root)).toEqual([])
  })
})

describe('r0-1 interaction: two real runs, B swaps while A seeds', () => {
  it("I-r01-two-runs: A reads the target inside B's aside window; both runs complete, one run end-to-end", async () => {
    const root = tmpRoot()
    const target = join(root, 'k')
    seed(root, { 'k/one.md': 'pre', 'k/two.md': 'pre' })
    let asideTaken!: () => void
    const bInWindow = new Promise<void>(r => (asideTaken = r))
    let release!: () => void
    const released = new Promise<void>(r => (release = r))
    let bHeld = false
    let aFired = false
    let runB: Promise<void> = Promise.reject(new Error('run B never started'))
    runB.catch(() => undefined)
    const run = (fs: FileSystemService, tag: string) =>
      writeDirAtomically(target, fs, async stage => {
        await fs.writeFile(join(stage, 'one.md'), tag)
        await fs.writeFile(join(stage, 'two.md'), tag)
      })
    // B pauses ONCE, right after renaming the live target aside (the aside window).
    const fsB = {
      ...fileSystemService,
      rename: async (from: string, to: string) => {
        await fileSystemService.rename(from, to)
        if (!bHeld && from === target && to.includes('.bak.tmp-')) {
          bHeld = true
          asideTaken()
          await released
        }
      },
    } as FileSystemService
    // A's first read of the target starts B, waits for B's aside window, reads, releases B.
    const fsA = {
      ...fileSystemService,
      readdir: async (p: string) => {
        if (p !== target || aFired) return fileSystemService.readdir(p)
        aFired = true
        runB = run(fsB, 'B')
        runB.catch(() => undefined)
        await bInWindow
        try {
          return await fileSystemService.readdir(p)
        } finally {
          release()
        }
      },
    } as FileSystemService
    const [a] = await Promise.allSettled([run(fsA, 'A')])
    const [b] = await Promise.allSettled([runB])
    expect([a!.status, b!.status]).toEqual(['fulfilled', 'fulfilled'])
    const one = readFileSync(join(target, 'one.md'), 'utf-8')
    expect(['A', 'B']).toContain(one)
    expect(readFileSync(join(target, 'two.md'), 'utf-8')).toBe(one)
    expect(residue(root)).toEqual([])
  })
})

describe('r0-1 post-copy consumers: exists() then stat() on a target swapped away', () => {
  const knowledge = {
    source: 'k',
    behavior: 'mirror',
    include: [],
    flatten: false,
    targets: [{ path: 'k', mode: 'canonical' }],
  } as unknown as RegistryConfig

  it('W-r01-postcopy-stat: postCopyOps resolves when the target vanishes between exists and stat', async () => {
    const root = tmpRoot()
    const target = preTree(root)
    const fs = racingFs('exists', target, target)
    await expect(
      postCopyOps({
        fs,
        registryConfig: knowledge,
        effectiveTarget: target,
        datasetPath: join(root, 'src'),
        baseTarget: root,
      }),
    ).resolves.toBeUndefined()
  })

  it('C-r01-postcopy-absent: postCopyOps on an absent target resolves', async () => {
    const root = tmpRoot()
    await expect(
      postCopyOps({
        fs: fileSystemService,
        registryConfig: knowledge,
        effectiveTarget: join(root, 'k'),
        datasetPath: join(root, 'src'),
        baseTarget: root,
      }),
    ).resolves.toBeUndefined()
  })

  it('C-r01-postcopy-eacces: a stat error that is not a vanished target still rejects', async () => {
    const root = tmpRoot()
    const target = preTree(root)
    const fs = {
      ...fileSystemService,
      stat: async (p: string) => {
        if (p === target) throw Object.assign(new Error(`EACCES: ${p}`), { code: 'EACCES' })
        return fileSystemService.stat(p)
      },
    } as FileSystemService
    await expect(
      postCopyOps({
        fs,
        registryConfig: knowledge,
        effectiveTarget: target,
        datasetPath: join(root, 'src'),
        baseTarget: root,
      }),
    ).rejects.toThrow('EACCES')
  })

  const maps = { skillNameMap: new Map([['next', 'pair-next']]), skillLinkPathMap: new Map() }
  const noop = () => undefined

  it('W-r01-rewrite-stat: rewriteSkillRefsInTarget resolves when the target vanishes between exists and stat', async () => {
    const root = tmpRoot()
    const target = preTree(root)
    const fs = racingFs('exists', target, target)
    await expect(rewriteSkillRefsInTarget(fs, target, maps, noop)).resolves.toBeUndefined()
  })

  it('W-r01-rewrite-walk: rewriteSkillRefsInTarget resolves when the target vanishes mid-walk', async () => {
    const root = tmpRoot()
    const target = preTree(root)
    const fs = racingFs('readdir', target, target)
    await expect(rewriteSkillRefsInTarget(fs, target, maps, noop)).resolves.toBeUndefined()
  })

  it('W-r01-rewrite-read: rewriteSkillRefsInTarget resolves when a listed file vanishes before its read', async () => {
    const root = tmpRoot()
    const target = preTree(root)
    const fs = racingFs('readFile', join(target, 'a.md'), target)
    await expect(rewriteSkillRefsInTarget(fs, target, maps, noop)).resolves.toBeUndefined()
  })

  it('C-r01-rewrite-stable: an undisturbed target is rewritten', async () => {
    const root = tmpRoot()
    seed(root, { 'k/a.md': 'Run /next to start.' })
    await rewriteSkillRefsInTarget(fileSystemService, join(root, 'k'), maps, noop)
    expect(readFileSync(join(root, 'k/a.md'), 'utf-8')).toBe('Run /pair-next to start.')
  })

  it('W-r01-detect-stat: detectOrphanedSkillReferences resolves when the target vanishes between exists and stat', async () => {
    const root = tmpRoot()
    const target = preTree(root)
    const fs = racingFs('exists', target, target)
    await expect(
      detectOrphanedSkillReferences({ fs, baseTarget: root, pushLog: noop }, { knowledge }, [
        'pair-old',
      ]),
    ).resolves.toBeUndefined()
  })
})

/**
 * r0-4: the stage must be created exclusively and never through a symlink. The stage name is
 * `<target>.tmp-<pid>-<counter>`; a fresh module instance starts the counter at 0, so the
 * planted leftover is EXACTLY the name this run picks first. Its pid is ours, so the sweep
 * (which spares live pids) leaves it in place — the reused-pid crash case.
 */
async function freshAtomicTarget(): Promise<typeof import('#registry/atomic-target')> {
  vi.resetModules()
  return await import('#registry/atomic-target')
}

describe('r0-4 stage exclusivity (story risk table: exclusive stage, never followed through a symlink)', () => {
  it('W-r04-stale-dir: a leftover directory at the chosen stage name never leaks into the target', async () => {
    const root = tmpRoot()
    seed(root, { 't/a.md': 'a', [`t.tmp-${process.pid}-0/stale.md`]: 'from a crashed run' })
    const { writeDirAtomically: write } = await freshAtomicTarget()
    await write(join(root, 't'), fileSystemService, mine(fileSystemService))
    expect(listTree(join(root, 't'))).toEqual(['a.md', 'mine.md'])
  })

  it('W-r04-symlink-dir: a symlink at the chosen stage name is never followed nor swapped in', async () => {
    const root = tmpRoot()
    seed(root, { 't/a.md': 'a', 'outside/keep.md': 'outside' })
    symlinkSync(join(root, 'outside'), join(root, `t.tmp-${process.pid}-0`), 'dir')
    const { writeDirAtomically: write } = await freshAtomicTarget()
    await write(join(root, 't'), fileSystemService, mine(fileSystemService))
    expect(lstatSync(join(root, 't')).isSymbolicLink()).toBe(false)
    expect(listTree(join(root, 't'))).toEqual(['a.md', 'mine.md'])
    expect(listTree(join(root, 'outside'))).toEqual(['keep.md'])
  })

  it('W-r04-symlink-file: a symlink at the chosen temp name of a file target is never written through', async () => {
    const root = tmpRoot()
    seed(root, { 'AGENTS.md': 'old', 'outside.md': 'outside' })
    symlinkSync(join(root, 'outside.md'), join(root, `AGENTS.md.tmp-${process.pid}-0`))
    const { writeFileAtomically: writeFile } = await freshAtomicTarget()
    await writeFile(join(root, 'AGENTS.md'), fileSystemService, tmp =>
      fileSystemService.writeFile(tmp, 'new'),
    )
    expect(lstatSync(join(root, 'AGENTS.md')).isSymbolicLink()).toBe(false)
    expect(readFileSync(join(root, 'AGENTS.md'), 'utf-8')).toBe('new')
    expect(readFileSync(join(root, 'outside.md'), 'utf-8')).toBe('outside')
  })

  it("C-r04-stale-file: a leftover regular file at a file target's temp name is overwritten whole", async () => {
    const root = tmpRoot()
    seed(root, { 'AGENTS.md': 'old', [`AGENTS.md.tmp-${process.pid}-0`]: 'stale longer content' })
    const { writeFileAtomically: writeFile } = await freshAtomicTarget()
    await writeFile(join(root, 'AGENTS.md'), fileSystemService, tmp =>
      fileSystemService.writeFile(tmp, 'new'),
    )
    expect(readFileSync(join(root, 'AGENTS.md'), 'utf-8')).toBe('new')
  })

  it('C-r04-live-other: a live concurrent stage under another name is left alone and never merged', async () => {
    const root = tmpRoot()
    seed(root, { 't/a.md': 'a', [`t.tmp-${process.pid}-zz/half.md`]: 'in flight' })
    const { writeDirAtomically: write } = await freshAtomicTarget()
    await write(join(root, 't'), fileSystemService, mine(fileSystemService))
    expect(listTree(join(root, 't'))).toEqual(['a.md', 'mine.md'])
    expect(existsSync(join(root, `t.tmp-${process.pid}-zz/half.md`))).toBe(true)
  })

  it("C-r04-dead-stale: a dead process's leftover stage is swept before the run", async () => {
    const root = tmpRoot()
    const dead = 2 ** 22 + 12345
    seed(root, { 't/a.md': 'a', [`t.tmp-${dead}-0/stale.md`]: 'from a crashed run' })
    const { writeDirAtomically: write } = await freshAtomicTarget()
    await write(join(root, 't'), fileSystemService, mine(fileSystemService))
    expect(listTree(join(root, 't'))).toEqual(['a.md', 'mine.md'])
    expect(residue(root)).toEqual([])
  })
})
