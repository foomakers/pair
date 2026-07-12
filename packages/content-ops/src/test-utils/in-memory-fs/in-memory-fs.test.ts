import { describe, it, expect } from 'vitest'
import { InMemoryFileSystemService } from './in-memory-fs'
import { createFs, DEFAULT_DIR } from './test-fixtures'

// The class's own constructor wiring and utility methods that don't delegate to any
// of the focused in-memory-fs-{state,read,write,seed} modules. Behavior owned by
// those modules (path resolution, seeding, reads, writes) is tested in their own
// co-located test files.
describe('InMemoryFileSystemService - constructor wiring', () => {
  it('should initialize with an empty filesystem rooted at moduleDir/workingDir', () => {
    const fs = createFs()
    expect(fs.existsSync('/')).toBe(true)
    expect(fs.rootModuleDirectory()).toBe(DEFAULT_DIR)
    expect(fs.currentWorkingDirectory()).toBe(DEFAULT_DIR)
  })
})

describe('InMemoryFileSystemService - accessSync', () => {
  it('should not throw for existing files', () => {
    const fs = createFs()
    fs.writeFile('/test.txt', 'content')
    expect(() => fs.accessSync()).not.toThrow()
  })

  it('should not throw for non-existent files', () => {
    const fs = createFs()
    expect(() => fs.accessSync()).not.toThrow()
  })
})

describe('InMemoryFileSystemService - complex scenario (constructor + write + read wiring)', () => {
  it('should handle a complex project structure end to end', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/project/package.json': '{"name": "test"}',
        '/project/src/index.ts': 'console.log("hello")',
        '/project/src/utils.ts': 'export const util = () => {}',
      },
      '/project',
      '/project',
    )

    // Verify initial structure
    expect(fs.readFileSync('/project/package.json')).toBe('{"name": "test"}')
    expect(fs.readFileSync('/project/src/index.ts')).toBe('console.log("hello")')
    expect(fs.readFileSync('/project/src/utils.ts')).toBe('export const util = () => {}')

    // Add more files
    fs.writeFile('/project/tests/main.test.ts', 'describe("main", () => {})')
    fs.writeFile('/project/README.md', '# Project')

    // Verify directory structure
    expect((await fs.readdir('/project')).map(e => e.name)).toEqual(
      expect.arrayContaining(['package.json', 'src', 'tests', 'README.md']),
    )
    expect((await fs.readdir('/project/src')).map(e => e.name)).toEqual(['index.ts', 'utils.ts'])
    expect((await fs.readdir('/project/tests')).map(e => e.name)).toEqual(['main.test.ts'])
  })
})
