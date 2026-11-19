import { describe, it, expect, beforeEach } from 'vitest'
import { walkMarkdownFiles } from './file-system-utils'
import { InMemoryFileSystemService } from '../test-utils/in-memory-fs'

let fileService: InMemoryFileSystemService

describe('walkMarkdownFiles - basic', () => {
  beforeEach(() => {
    fileService = new InMemoryFileSystemService(
      {
        '/docs/readme.md': '# README',
        '/docs/guide.md': '# Guide',
        '/docs/api/index.md': '# API Index',
        '/docs/api/users.md': '# Users API',
        '/docs/notes.txt': 'Not a markdown file',
        '/docs/assets/image.png': 'Not a markdown file',
      },
      '/',
      '/',
    )
  })

  it('should find all markdown files recursively', async () => {
    const files = await walkMarkdownFiles('/docs', fileService)

    expect(files).toHaveLength(4)
    expect(files).toContain('/docs/readme.md')
    expect(files).toContain('/docs/guide.md')
    expect(files).toContain('/docs/api/index.md')
    expect(files).toContain('/docs/api/users.md')
  })

  it('should exclude non-markdown files', async () => {
    const files = await walkMarkdownFiles('/docs', fileService)

    expect(files).not.toContain('/docs/notes.txt')
    expect(files).not.toContain('/docs/assets/image.png')
  })
})

describe('walkMarkdownFiles - edge cases', () => {
  it('should handle empty directories', async () => {
    fileService = new InMemoryFileSystemService(
      {
        '/empty/file.md': '# File',
      },
      '/',
      '/',
    )

    const files = await walkMarkdownFiles('/empty', fileService)
    expect(files).toEqual(['/empty/file.md'])
  })

  it('should handle directories with only non-markdown files', async () => {
    fileService = new InMemoryFileSystemService(
      {
        '/docs/readme.txt': 'Text file',
        '/docs/data.json': '{"key": "value"}',
      },
      '/',
      '/',
    )

    const files = await walkMarkdownFiles('/docs', fileService)
    expect(files).toHaveLength(0)
  })

  it('should handle nested directory structures', async () => {
    fileService = new InMemoryFileSystemService(
      {
        '/docs/level1/level2/deep.md': '# Deep File',
        '/docs/level1/other.md': '# Other File',
      },
      '/',
      '/',
    )

    const files = await walkMarkdownFiles('/docs', fileService)

    expect(files).toHaveLength(2)
    expect(files).toContain('/docs/level1/level2/deep.md')
    expect(files).toContain('/docs/level1/other.md')
  })
})

describe('FileSystemService.symlink (in-memory)', () => {
  it('creates a symlink entry', async () => {
    fileService = new InMemoryFileSystemService({}, '/', '/')
    await fileService.mkdir('/project/canonical', { recursive: true })
    await fileService.symlink('/project/canonical', '/project/link')

    const symlinks = fileService.getSymlinks()
    expect(symlinks.get('/project/link')).toBe('/project/canonical')
  })

  it('throws when path already exists as a file', async () => {
    fileService = new InMemoryFileSystemService({ '/project/existing': 'content' }, '/', '/')
    await expect(fileService.symlink('/project/target', '/project/existing')).rejects.toThrow(
      /already exists/i,
    )
  })

  it('throws when symlink path already exists', async () => {
    fileService = new InMemoryFileSystemService({}, '/', '/')
    await fileService.symlink('/project/a', '/project/link')
    await expect(fileService.symlink('/project/b', '/project/link')).rejects.toThrow(
      /already exists/i,
    )
  })
})

/**
 * US-395 (absorbed #429) — a byte-mode read. `readFile`/`readFileSync` decode as utf-8,
 * and hashing a lossily decoded binary is not an identity to defend in a security-adjacent
 * path: local ZIP slots are keyed on the archive's CONTENT hash, so the bytes hashed must
 * be the bytes on disk.
 */
describe('fileSystemService.readFileBytes — byte-mode read (US-395/#429)', () => {
  it('returns the exact bytes on disk, not a utf-8 decoding', async () => {
    const { mkdtemp, rm: rmDir } = await import('fs/promises')
    const { tmpdir } = await import('os')
    const { join: joinPath } = await import('path')
    const { fileSystemService } = await import('./file-system-service')

    const dir = await mkdtemp(joinPath(tmpdir(), 'pair-bytes-'))
    const file = joinPath(dir, 'blob.bin')
    // 0xFF/0x80/0x00 are exactly the bytes a utf-8 round-trip mangles (ZIP headers have them)
    const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x80, 0xff, 0xfe, 0x81])
    try {
      await fileSystemService.writeFileBinary(file, bytes)

      const read = await fileSystemService.readFileBytes(file)

      expect(Buffer.isBuffer(read)).toBe(true)
      expect(read.equals(bytes)).toBe(true)
      // the text-mode read of the same file is lossy — that is WHY this API exists
      const text = await fileSystemService.readFile(file)
      expect(Buffer.from(text, 'utf-8').equals(bytes)).toBe(false)
    } finally {
      await rmDir(dir, { recursive: true, force: true })
    }
  })
})

describe('fileSystemService.appendFile', () => {
  it('preserves existing output and creates a missing file', async () => {
    const { mkdtemp, rm } = await import('fs/promises')
    const { tmpdir } = await import('os')
    const { join } = await import('path')
    const { fileSystemService } = await import('./file-system-service')
    const dir = await mkdtemp(join(tmpdir(), 'pair-append-'))
    try {
      const existing = join(dir, 'existing.txt')
      const missing = join(dir, 'missing.txt')
      await fileSystemService.writeFile(existing, 'first\n')
      await fileSystemService.appendFile(existing, 'second\n')
      await fileSystemService.appendFile(missing, 'third\n')
      expect(await fileSystemService.readFile(existing)).toBe('first\nsecond\n')
      expect(await fileSystemService.readFile(missing)).toBe('third\n')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe.each([
  [
    'real service',
    async () => {
      const { mkdtempSync, rmSync } = await import('fs')
      const { tmpdir } = await import('os')
      const { join } = await import('path')
      const { fileSystemService } = await import('./file-system-service')
      const dir = mkdtempSync(join(tmpdir(), 'pair-sync-'))
      return {
        fs: fileSystemService,
        dir,
        cleanup: () => rmSync(dir, { recursive: true, force: true }),
      }
    },
  ],
  [
    'in-memory double',
    async () => ({
      fs: new InMemoryFileSystemService({}, '/', '/'),
      dir: '/work',
      cleanup: () => {},
    }),
  ],
])('sync write/list/remove contract: %s', (_name, setup) => {
  it('writeFileSync overwrites, readdirSync lists entries with types, rmSync removes a tree', async () => {
    const { fs, dir, cleanup } = await setup()
    try {
      fs.mkdirSync(`${dir}/sub`, { recursive: true })
      fs.writeFileSync(`${dir}/a.txt`, 'one')
      fs.writeFileSync(`${dir}/a.txt`, 'two')
      fs.writeFileSync(`${dir}/sub/b.txt`, 'b')
      expect(fs.readFileSync(`${dir}/a.txt`)).toBe('two')
      const listed = fs
        .readdirSync(dir)
        .map(e => [e.name, e.isDirectory()])
        .sort()
      expect(listed).toEqual([
        ['a.txt', false],
        ['sub', true],
      ])
      fs.rmSync(`${dir}/sub`, { recursive: true })
      expect(fs.existsSync(`${dir}/sub/b.txt`)).toBe(false)
      expect(fs.existsSync(`${dir}/a.txt`)).toBe(true)
    } finally {
      cleanup()
    }
  })

  it('non-ASCII text written as text reads back as UTF-8 bytes; binary written as binary keeps its bytes', async () => {
    const { fs, dir, cleanup } = await setup()
    try {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(`${dir}/t.txt`, 'héllo €')
      await fs.writeFileBinary(`${dir}/b.bin`, Buffer.from([0xc3, 0x28, 0xff, 0x00]))
      expect(fs.readFileBytesSync(`${dir}/t.txt`).toString('hex')).toBe('68c3a96c6c6f20e282ac')
      expect(fs.readFileBytesSync(`${dir}/b.bin`).toString('hex')).toBe('c328ff00')
      fs.cpSync(`${dir}/b.bin`, `${dir}/c.bin`)
      expect(fs.readFileBytesSync(`${dir}/c.bin`).toString('hex')).toBe('c328ff00')
    } finally {
      cleanup()
    }
  })

  it('rmSync: missing path throws unless force', async () => {
    const { fs, dir, cleanup } = await setup()
    try {
      fs.mkdirSync(dir, { recursive: true })
      expect(() => fs.rmSync(`${dir}/missing`)).toThrow()
      expect(() => fs.rmSync(`${dir}/missing`, { force: true })).not.toThrow()
    } finally {
      cleanup()
    }
  })

  it('readdirSync: missing directory throws ENOENT', async () => {
    const { fs, dir, cleanup } = await setup()
    try {
      expect(() => fs.readdirSync(`${dir}/missing`)).toThrow(/no such file|ENOENT/)
    } finally {
      cleanup()
    }
  })
})
