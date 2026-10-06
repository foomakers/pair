import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'fs'
import { symlinkSync, readlinkSync, lstatSync, realpathSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileSystemService } from '@pair/content-ops'
import { createTestFs } from '#test-utils/test-helpers'
import { doCopyAndUpdateLinks, buildCopyOptions, postCopyOps } from './operations'
import { writeDirAtomically, writeFileAtomically, recoverTarget } from './atomic-target'

const cwd = '/p'
const DEAD_PID = 2 ** 22 + 12345 // above any real pid_max default

describe('writeDirAtomically (AC1, AC2, AC3)', () => {
  it('a populate that fails midway leaves the live tree exactly as it was and no stage behind', async () => {
    const fs = createTestFs({}, { '/p/t/a.md': 'old-a', '/p/t/b.md': 'old-b' }, cwd)
    await expect(
      writeDirAtomically('/p/t', fs, async stage => {
        await fs.rm(`${stage}/a.md`)
        await fs.writeFile(`${stage}/new.md`, 'new')
        throw new Error('killed between cleanup and copy')
      }),
    ).rejects.toThrow('killed between cleanup and copy')
    expect(fs.getContent('/p/t/a.md')).toBe('old-a')
    expect(fs.getContent('/p/t/b.md')).toBe('old-b')
    expect(fs.getContent('/p/t/new.md')).toBeUndefined()
    expect((await fs.readdir('/p')).map(e => e.name).sort()).toEqual(['config.json', 't'])
  })

  it('observer between cleanup and re-copy sees the complete PRE state (never a hole)', async () => {
    const fs = createTestFs({}, { '/p/t/gone.md': 'g', '/p/t/keep.md': 'k' }, cwd)
    let seen: Record<string, string | undefined> = {}
    await writeDirAtomically('/p/t', fs, async stage => {
      await fs.rm(`${stage}/gone.md`) // the #421 cleanup
      seen = { gone: fs.getContent('/p/t/gone.md'), keep: fs.getContent('/p/t/keep.md') }
      await fs.writeFile(`${stage}/keep.md`, 'k2')
    })
    expect(seen).toEqual({ gone: 'g', keep: 'k' })
    expect(fs.getContent('/p/t/gone.md')).toBeUndefined()
    expect(fs.getContent('/p/t/keep.md')).toBe('k2')
  })

  it('stage is seeded from the live target, and leaves no stage or aside residue', async () => {
    const fs = createTestFs({}, { '/p/t/x/y.md': 'deep' }, cwd)
    await writeDirAtomically('/p/t', fs, async stage => {
      expect(fs.getContent(`${stage}/x/y.md`)).toBe('deep')
    })
    const names = (await fs.readdir('/p')).map(e => e.name)
    expect(names.filter(n => n.includes('.tmp-') || n.includes('.bak'))).toEqual([])
  })

  it('creates an absent target', async () => {
    const fs = createTestFs({}, {}, cwd)
    await writeDirAtomically('/p/new', fs, async stage => fs.writeFile(`${stage}/f.md`, '1'))
    expect(fs.getContent('/p/new/f.md')).toBe('1')
  })

  it('swap order: target set aside BEFORE the stage goes in; delete only afterwards', async () => {
    const fs = createTestFs({}, { '/p/t/a.md': 'old' }, cwd)
    const calls: string[] = []
    const rename = fs.rename.bind(fs)
    const rm = fs.rm.bind(fs)
    vi.spyOn(fs, 'rename').mockImplementation(async (a, b) => {
      calls.push(`rename ${a.replace('/p/', '')} -> ${b.replace('/p/', '')}`)
      return rename(a, b)
    })
    vi.spyOn(fs, 'rm').mockImplementation(async (p, o) => {
      calls.push(`rm ${p.replace('/p/', '')}`)
      return rm(p, o)
    })
    await writeDirAtomically('/p/t', fs, async stage => fs.writeFile(`${stage}/a.md`, 'new'))
    expect(calls[0]).toMatch(/^rename t -> t\.bak\.tmp-/)
    expect(calls[1]).toMatch(/^rename t\.tmp-.* -> t$/)
    expect(calls[2]).toMatch(/^rm t\.bak\.tmp-/)
  })

  it('a swap that cannot move the stage in puts the aside back (never neither tree)', async () => {
    const fs = createTestFs({}, { '/p/t/a.md': 'old' }, cwd)
    const rename = fs.rename.bind(fs)
    vi.spyOn(fs, 'rename').mockImplementation(async (a, b) => {
      if (a.includes('.tmp-') && !a.includes('.bak') && b === '/p/t') throw new Error('EPERM')
      return rename(a, b)
    })
    await expect(
      writeDirAtomically('/p/t', fs, async stage => fs.writeFile(`${stage}/a.md`, 'new')),
    ).rejects.toThrow('EPERM')
    expect(fs.getContent('/p/t/a.md')).toBe('old')
  })

  it('retries once when a concurrent run lands the target between aside and swap; later swap wins', async () => {
    const fs = createTestFs({}, { '/p/t/a.md': 'old' }, cwd)
    const rename = fs.rename.bind(fs)
    let raced = false
    vi.spyOn(fs, 'rename').mockImplementation(async (a, b) => {
      if (!raced && a.includes('.tmp-') && !a.includes('.bak') && b === '/p/t') {
        raced = true
        await fs.writeFile('/p/t/other.md', 'other run') // the other run's tree appears
        throw new Error('ENOTEMPTY')
      }
      return rename(a, b)
    })
    await writeDirAtomically('/p/t', fs, async stage => fs.writeFile(`${stage}/a.md`, 'mine'))
    expect(fs.getContent('/p/t/a.md')).toBe('mine')
    expect(fs.getContent('/p/t/other.md')).toBeUndefined()
  })

  it('two overlapping runs each leave one run end-to-end, never an interleaving', async () => {
    const fs = createTestFs({}, { '/p/t/old.md': 'old' }, cwd)
    const run = (tag: string) =>
      writeDirAtomically('/p/t', fs, async stage => {
        await fs.writeFile(`${stage}/one.md`, tag)
        await new Promise(r => setTimeout(r, 1))
        await fs.writeFile(`${stage}/two.md`, tag)
      })
    await Promise.all([run('A'), run('B')])
    expect(fs.getContent('/p/t/one.md')).toBe(fs.getContent('/p/t/two.md'))
  })
})

describe('recoverTarget (AC2)', () => {
  it('sweeps a stage left by a dead process', async () => {
    const fs = createTestFs(
      {},
      { '/p/t/a.md': 'a', [`/p/t.tmp-${DEAD_PID}-0/half.md`]: 'half' },
      cwd,
    )
    await recoverTarget('/p/t', fs)
    expect(await fs.exists(`/p/t.tmp-${DEAD_PID}-0`)).toBe(false)
    expect(fs.getContent('/p/t/a.md')).toBe('a')
  })

  it('leaves a stage owned by a live process alone', async () => {
    const live = `/p/t.tmp-${process.pid}-zz/half.md`
    const fs = createTestFs({}, { '/p/t/a.md': 'a', [live]: 'half' }, cwd)
    await recoverTarget('/p/t', fs)
    expect(fs.getContent(live)).toBe('half')
  })

  it('restores a target left ABSENT by a swap that died, from its aside', async () => {
    const fs = createTestFs({}, { [`/p/t.bak.tmp-${DEAD_PID}-0/a.md`]: 'precious' }, cwd)
    await recoverTarget('/p/t', fs)
    expect(fs.getContent('/p/t/a.md')).toBe('precious')
    expect(await fs.exists(`/p/t.bak.tmp-${DEAD_PID}-0`)).toBe(false)
  })

  it('drops a dead aside when the target is present (only the delete was lost)', async () => {
    const fs = createTestFs(
      {},
      { '/p/t/a.md': 'new', [`/p/t.bak.tmp-${DEAD_PID}-0/a.md`]: 'old' },
      cwd,
    )
    await recoverTarget('/p/t', fs)
    expect(fs.getContent('/p/t/a.md')).toBe('new')
    expect(await fs.exists(`/p/t.bak.tmp-${DEAD_PID}-0`)).toBe(false)
  })

  it('writeDirAtomically recovers first, so the next run needs no manual cleanup', async () => {
    const fs = createTestFs({}, { [`/p/t.bak.tmp-${DEAD_PID}-0/a.md`]: 'precious' }, cwd)
    await writeDirAtomically('/p/t', fs, async stage => {
      expect(fs.getContent(`${stage}/a.md`)).toBe('precious')
    })
    expect(fs.getContent('/p/t/a.md')).toBe('precious')
  })
})

describe('writeFileAtomically (AC6)', () => {
  it('a reader sees the old whole file until the rename, never a truncation', async () => {
    const fs = createTestFs({}, { '/p/AGENTS.md': 'old whole' }, cwd)
    let during: string | undefined
    await writeFileAtomically('/p/AGENTS.md', fs, async tmp => {
      await fs.writeFile(tmp, 'new part')
      during = fs.getContent('/p/AGENTS.md')
    })
    expect(during).toBe('old whole')
    expect(fs.getContent('/p/AGENTS.md')).toBe('new part')
  })

  it('a failing producer leaves the file and no temp', async () => {
    const fs = createTestFs({}, { '/p/AGENTS.md': 'old' }, cwd)
    await expect(
      writeFileAtomically('/p/AGENTS.md', fs, async tmp => {
        await fs.writeFile(tmp, 'x')
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(fs.getContent('/p/AGENTS.md')).toBe('old')
    expect((await fs.readdir('/p')).map(e => e.name).filter(n => n.includes('.tmp-'))).toEqual([])
  })
})

describe('registry write through doCopyAndUpdateLinks', () => {
  const mirror = {
    ...buildCopyOptions({
      source: 'src',
      behavior: 'mirror',
      include: [],
      flatten: false,
      targets: [],
    } as never),
  }

  it('AC3: cleanup + re-copy is invisible half-way — interruption leaves the pre-update tree', async () => {
    const fs = createTestFs(
      {},
      {
        '/dataset/src/keep.md': 'new',
        '/dataset/dst/keep.md': 'old',
        '/dataset/dst/dropped.md': 'dropped-by-dataset',
      },
      cwd,
    )
    const realRename = fs.rename.bind(fs)
    vi.spyOn(fs, 'rename').mockImplementation(async (a, b) => {
      if (a.includes('.tmp-') && !a.includes('.bak') && b === '/dataset/dst')
        throw new Error('killed at swap')
      return realRename(a, b)
    })
    await expect(
      doCopyAndUpdateLinks(fs, {
        source: 'src',
        target: 'dst',
        datasetRoot: '/dataset',
        options: mirror,
      }),
    ).rejects.toThrow('killed at swap')
    expect(fs.getContent('/dataset/dst/dropped.md')).toBe('dropped-by-dataset')
    expect(fs.getContent('/dataset/dst/keep.md')).toBe('old')
  })

  it('AC5: delete set unchanged — orphan under knowledge-like root goes; excluded + skip-owned survive', async () => {
    const fs = createTestFs(
      {},
      {
        '/dataset/src/agents/a.md': 'a',
        '/dataset/.github/agents/a.md': 'a',
        '/dataset/.github/agents/orphan.md': 'o',
        '/dataset/.github/workflows/ci.yml': 'ci',
      },
      cwd,
    )
    const gh = buildCopyOptions({
      source: 'src',
      behavior: 'mirror',
      include: ['/agents'],
      flatten: false,
      targets: [],
    } as never)
    await doCopyAndUpdateLinks(fs, {
      source: 'src',
      target: '.github',
      datasetRoot: '/dataset',
      options: gh,
    })
    expect(fs.getContent('/dataset/.github/workflows/ci.yml')).toBe('ci')
    expect(fs.getContent('/dataset/.github/agents/orphan.md')).toBeUndefined()
    expect(fs.getContent('/dataset/.github/agents/a.md')).toBe('a')
  })

  it('AC5: an excluded path under a mirror root survives; a non-excluded orphan is deleted', async () => {
    const fs = createTestFs(
      {},
      {
        '/dataset/src/a.md': 'a',
        '/dataset/dst/a.md': 'a',
        '/dataset/dst/keepme/x.md': 'adopter',
        '/dataset/dst/orphan.md': 'o',
      },
      cwd,
    )
    await doCopyAndUpdateLinks(fs, {
      source: 'src',
      target: 'dst',
      datasetRoot: '/dataset',
      options: { ...mirror, exclude: ['keepme'] },
    })
    expect(fs.getContent('/dataset/dst/keepme/x.md')).toBe('adopter')
    expect(fs.getContent('/dataset/dst/orphan.md')).toBeUndefined()
  })

  it('AC4: add registry is never staged or swapped', async () => {
    const fs = createTestFs(
      {},
      { '/dataset/src/new.md': 'n', '/dataset/dst/mine.md': 'adopter edit' },
      cwd,
    )
    const renameSpy = vi.spyOn(fs, 'rename')
    await doCopyAndUpdateLinks(fs, {
      source: 'src',
      target: 'dst',
      datasetRoot: '/dataset',
      options: { ...mirror, defaultBehavior: 'add' },
    })
    expect(renameSpy).not.toHaveBeenCalled()
    expect(fs.getContent('/dataset/dst/mine.md')).toBe('adopter edit')
    expect(fs.getContent('/dataset/dst/new.md')).toBe('n')
  })

  it('AC6: file targets are written by rename onto the final path', async () => {
    const fs = createTestFs(
      {},
      { '/dataset/AGENTS.md': 'new', '/dataset/out/AGENTS.md': 'old' },
      cwd,
    )
    const renameSpy = vi.spyOn(fs, 'rename')
    await doCopyAndUpdateLinks(fs, {
      source: 'AGENTS.md',
      target: 'out/AGENTS.md',
      datasetRoot: '/dataset',
      options: mirror,
    })
    expect(renameSpy).toHaveBeenCalledWith(
      expect.stringMatching(/AGENTS\.md\.tmp-/),
      '/dataset/out/AGENTS.md',
    )
    expect(fs.getContent('/dataset/out/AGENTS.md')).toBe('new')
  })

  it('AC6: marker strip and the copy-mode secondary also rename into place', async () => {
    const fs = createTestFs({}, { '/p/AGENTS.md': 'hello', '/p/CLAUDE.md': 'stale' }, cwd)
    const renameSpy = vi.spyOn(fs, 'rename')
    await postCopyOps({
      fs,
      registryConfig: {
        source: 'AGENTS.md',
        behavior: 'mirror',
        include: [],
        flatten: false,
        targets: [
          { path: 'AGENTS.md', mode: 'canonical' },
          { path: 'CLAUDE.md', mode: 'copy' },
        ],
      } as never,
      effectiveTarget: '/p/AGENTS.md',
      datasetPath: '/p/AGENTS.md',
      baseTarget: '/p',
    })
    const dests = renameSpy.mock.calls.map(c => c[1])
    expect(dests).toEqual(['/p/AGENTS.md', '/p/CLAUDE.md'])
    expect(fs.getContent('/p/CLAUDE.md')).toBe('hello')
  })
})

describe('flatten/prefix registry (skills) through the stage', () => {
  it('links are rewritten against the FINAL target path, never the stage name', async () => {
    const fs = createTestFs(
      {},
      {
        '/dataset/.skills/process/review/SKILL.md':
          '---\nname: review\n---\nSee [x](../setup/SKILL.md)',
        '/dataset/.skills/process/setup/SKILL.md': '---\nname: setup\n---\n# s',
        '/dataset/.claude/skills/pair-old/SKILL.md': 'stale',
      },
      cwd,
    )
    await doCopyAndUpdateLinks(fs, {
      source: '.skills',
      target: '.claude/skills',
      datasetRoot: '/dataset',
      options: buildCopyOptions({
        source: '.skills',
        behavior: 'mirror',
        include: [],
        flatten: true,
        prefix: 'pair',
        targets: [],
      } as never),
    })
    expect(fs.getContent('/dataset/.claude/skills/pair-process-review/SKILL.md')).toBeDefined()
    expect(fs.getContent('/dataset/.claude/skills/pair-old/SKILL.md')).toBeUndefined()
    for (const f of ['review', 'setup']) {
      expect(fs.getContent(`/dataset/.claude/skills/pair-process-${f}/SKILL.md`)).not.toContain(
        '.tmp-',
      )
    }
    expect((await fs.readdir('/dataset/.claude')).map(e => e.name)).toEqual(['skills'])
  })
})

describe('real filesystem (AC7)', () => {
  it('replacing the canonical skills dir keeps every symlink resolving, none turned real or dangling', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-atomic-')))
    try {
      const canon = join(root, '.claude/skills')
      mkdirSync(canon, { recursive: true })
      writeFileSync(join(canon, 'old.md'), 'old')
      const links = ['.github', '.cursor', '.agent', '.agents', '.windsurf']
      for (const l of links) {
        mkdirSync(join(root, l), { recursive: true })
        symlinkSync('../.claude/skills', join(root, l, 'skills'), 'dir')
      }
      await writeDirAtomically(canon, fileSystemService, async stage => {
        rmSync(join(stage, 'old.md'))
        writeFileSync(join(stage, 'new.md'), 'new')
      })
      for (const l of links) {
        const p = join(root, l, 'skills')
        expect(lstatSync(p).isSymbolicLink()).toBe(true)
        expect(readlinkSync(p)).toBe('../.claude/skills')
        expect(readFileSync(join(p, 'new.md'), 'utf-8')).toBe('new')
        expect(existsSync(join(p, 'old.md'))).toBe(false)
      }
      expect(readdirSync(join(root, '.claude')).sort()).toEqual(['skills'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('a symlink INSIDE the swapped tree (.github/skills) is carried across as a symlink', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-atomic-')))
    try {
      mkdirSync(join(root, '.claude/skills'), { recursive: true })
      mkdirSync(join(root, '.github/agents'), { recursive: true })
      symlinkSync('../.claude/skills', join(root, '.github/skills'), 'dir')
      await writeDirAtomically(join(root, '.github'), fileSystemService, async stage => {
        writeFileSync(join(stage, 'agents/new.md'), 'n')
      })
      expect(lstatSync(join(root, '.github/skills')).isSymbolicLink()).toBe(true)
      expect(readlinkSync(join(root, '.github/skills'))).toBe('../.claude/skills')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe.each(['darwin', 'linux'] as const)('platform %s', platform => {
  it('swaps a target in place and leaves no residue (platform-injected, POSIX rename semantics)', async () => {
    const original = Object.getOwnPropertyDescriptor(process, 'platform')!
    Object.defineProperty(process, 'platform', { value: platform })
    try {
      const fs = createTestFs({}, { '/p/t/a.md': 'old' }, cwd)
      await writeDirAtomically('/p/t', fs, async stage => fs.writeFile(`${stage}/a.md`, 'new'))
      expect(fs.getContent('/p/t/a.md')).toBe('new')
      const names = (await fs.readdir('/p')).map(e => e.name)
      expect(names.filter(n => n.includes('.tmp-') || n.includes('.bak'))).toEqual([])
    } finally {
      Object.defineProperty(process, 'platform', original)
    }
  })
})
