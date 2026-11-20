import { tmpdir } from 'os'
import { describe, it, expect } from 'vitest'
import type { Dirent, Stats } from 'fs'
import { fileSystemService } from './file-system-service'
import { InMemoryFileSystemService } from '../test-utils/in-memory-fs'

// r1-g2-gap1: sync primitives the migrated files need. Real service and in-memory double must agree.
interface SyncFs {
  mkdtempSync: (prefix: string) => string
  writeFileSync: (file: string, content: string) => void
  readFileBytesSync: (file: string) => Buffer
  readdirSync: (path: string) => Dirent[]
  statSync: (path: string) => Stats
  rmSync: (path: string, options?: { recursive?: boolean; force?: boolean }) => void
  chmodSync: (file: string, mode: number) => void
  cpSync: (src: string, dest: string, options?: { recursive?: boolean }) => void
  symlinkSync: (target: string, path: string) => void
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void
}

const targets: [string, () => { fs: SyncFs; prefix: string }][] = [
  [
    'real',
    () => ({ fs: fileSystemService as unknown as SyncFs, prefix: `${tmpdir()}/fs-parity-` }),
  ],
  [
    'in-memory',
    () => ({
      fs: new InMemoryFileSystemService({}, '/', '/') as unknown as SyncFs,
      prefix: '/tmp/fs-parity-',
    }),
  ],
]

const throwsOf = (fn: () => void): boolean => {
  try {
    fn()
    return false
  } catch {
    return true
  }
}

type Scenario = (fs: SyncFs, root: string) => unknown

const scenarios: Record<string, Scenario> = {
  mkdtempSync: (fs, root) => ({
    dir: fs.statSync(root).isDirectory(),
    prefixed: root.includes('fs-parity-'),
  }),
  'writeFileSync + readFileBytesSync': (fs, root) => {
    fs.writeFileSync(`${root}/a.txt`, 'héllo')
    fs.writeFileSync(`${root}/a.txt`, 'second')
    return fs.readFileBytesSync(`${root}/a.txt`).toString('hex')
  },
  readdirSync: (fs, root) => {
    fs.writeFileSync(`${root}/a.txt`, 'x')
    fs.mkdirSync(`${root}/sub`)
    return fs
      .readdirSync(root)
      .map(e => [e.name, e.isFile(), e.isDirectory()])
      .sort()
  },
  statSync: (fs, root) => {
    fs.writeFileSync(`${root}/a.txt`, 'x')
    return [
      fs.statSync(`${root}/a.txt`).isFile(),
      fs.statSync(root).isDirectory(),
      throwsOf(() => fs.statSync(`${root}/missing`)),
    ]
  },
  rmSync: (fs, root) => {
    fs.mkdirSync(`${root}/t/deep`, { recursive: true })
    fs.writeFileSync(`${root}/t/deep/f.txt`, 'x')
    fs.rmSync(`${root}/t`, { recursive: true, force: true })
    return [
      throwsOf(() => fs.statSync(`${root}/t`)),
      throwsOf(() => fs.rmSync(`${root}/none`, { force: true })),
      throwsOf(() => fs.rmSync(`${root}/none`)),
    ]
  },
  chmodSync: (fs, root) => {
    fs.writeFileSync(`${root}/s.sh`, 'x')
    return [
      throwsOf(() => fs.chmodSync(`${root}/s.sh`, 0o755)),
      throwsOf(() => fs.chmodSync(`${root}/none`, 0o755)),
    ]
  },
  cpSync: (fs, root) => {
    fs.mkdirSync(`${root}/src/in`, { recursive: true })
    fs.writeFileSync(`${root}/src/in/f.txt`, 'copied')
    fs.cpSync(`${root}/src`, `${root}/dst`, { recursive: true })
    return fs.readFileBytesSync(`${root}/dst/in/f.txt`).toString()
  },
  symlinkSync: (fs, root) => {
    fs.mkdirSync(`${root}/real`)
    fs.writeFileSync(`${root}/real/f.txt`, 'x')
    fs.symlinkSync(`${root}/real`, `${root}/link`)
    return [
      fs.readdirSync(`${root}/link`).map(e => e.name),
      fs
        .readdirSync(root)
        .map(e => [e.name, e.isSymbolicLink()])
        .sort(),
    ]
  },
}

const observe = (kind: string, scenario: Scenario): unknown => {
  const { fs, prefix } = targets.find(([k]) => k === kind)![1]()
  const root = fs.mkdtempSync(prefix)
  try {
    return scenario(fs, root)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

describe('FileSystemService sync primitives: real and in-memory double agree', () => {
  it.each(Object.entries(scenarios))('%s', (_name, scenario) => {
    expect(observe('in-memory', scenario)).toEqual(observe('real', scenario))
  })
})
