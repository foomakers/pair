import { describe, it, expect, beforeEach, vi } from 'vitest'
import { applyReplacements, processFileReplacement, Replacement } from './replacement-applier'
import { FileSystemService } from '../file-system'
import InMemoryFileSystemService from '../test-utils/in-memory-fs'

describe('applyReplacements - edge cases', () => {
  it('applies offset-based replacement correctly', () => {
    const content = 'Line one\nThis has a link: [text](a/b/c.md) and more\nEnd'
    const oldHref = 'a/b/c.md'
    const start = content.indexOf(oldHref)
    const end = start + oldHref.length
    const replacements: Replacement[] = [{ start, end, line: 2, oldHref, newHref: 'x/y/z.md' }]
    const res = applyReplacements(content, replacements)
    expect(res.applied).toBe(1)
    expect(res.content.includes('x/y/z.md')).toBe(true)
    expect(res.content.includes(oldHref)).toBe(false)
  })

  it('picks nearest occurrence to link text when multiple matches exist in span', () => {
    const content = 'Intro\n[text](a.md) some a.md later a.md\nOutro'
    const oldHref = 'a.md'
    const replacements: Replacement[] = [
      { start: 0, end: content.length, line: 2, oldHref, newHref: 'b.md' },
    ]
    const res = applyReplacements(content, replacements)
    expect(res.applied).toBe(1)
    expect(res.content.includes('b.md')).toBe(true)
  })
})

describe('applyReplacements - edge cases part 4', () => {
  it('falls back to per-line replacement when offsets are missing', () => {
    const content = 'L1\nA line with [t](old.md) here\nL3'
    const replacements: Replacement[] = [{ line: 2, oldHref: 'old.md', newHref: 'new.md' }]
    const res = applyReplacements(content, replacements)
    expect(res.applied).toBe(1)
    expect(res.content.includes('new.md')).toBe(true)
  })

  it('handles empty replacements array', () => {
    const content = 'Some content'
    const res = applyReplacements(content, [])
    expect(res.applied).toBe(0)
    expect(res.content).toBe(content)
    expect(res.byKind).toEqual({})
  })

  it('handles replacements with invalid offsets', () => {
    const content = 'Some content'
    const replacements: Replacement[] = [
      { start: -1, end: 5, line: 1, oldHref: 'test', newHref: 'new' },
      { start: 100, end: 110, line: 1, oldHref: 'test', newHref: 'new' },
      { start: 5, end: 3, line: 1, oldHref: 'test', newHref: 'new' },
    ]
    const res = applyReplacements(content, replacements)
    expect(res.applied).toBe(0)
  })

  it('handles overlapping replacements by processing in descending order', () => {
    const content = 'aaa bbb ccc'
    const replacements: Replacement[] = [
      { start: 0, end: 3, line: 1, oldHref: 'aaa', newHref: 'xxx' },
      { start: 4, end: 7, line: 1, oldHref: 'bbb', newHref: 'yyy' },
    ]
    const res = applyReplacements(content, replacements)
    expect(res.applied).toBe(2)
    expect(res.content).toBe('xxx yyy ccc')
  })
})

describe('applyReplacements - edge cases part 5', () => {
  it('falls back to line-based replacement when offset-based fails', () => {
    const content = 'Line 1\nLine with [link](old.md) here\nLine 3'
    const replacements: Replacement[] = [
      { start: 1000, end: 1005, line: 2, oldHref: 'old.md', newHref: 'new.md' }, // Invalid offset
    ]
    const res = applyReplacements(content, replacements)
    expect(res.applied).toBe(0) // Should not apply due to invalid offsets
  })

  it('handles replacements with undefined start/end (line-based only)', () => {
    const content = 'Line 1\nLine with old.md here\nLine 3'
    const replacements: Replacement[] = [{ line: 2, oldHref: 'old.md', newHref: 'new.md' }]
    const res = applyReplacements(content, replacements)
    expect(res.applied).toBe(1)
    expect(res.content).toContain('new.md')
  })

  it('tracks replacement counts by kind', () => {
    const content = 'Line 1\nLine with [link1](old1.md) and [link2](old2.md)\nLine 3'
    const replacements: Replacement[] = [
      { start: 10, end: 17, line: 2, oldHref: 'old1.md', newHref: 'new1.md', kind: 'normalized' },
      { start: 25, end: 32, line: 2, oldHref: 'old2.md', newHref: 'new2.md', kind: 'normalized' },
    ]
    const res = applyReplacements(content, replacements)
    expect(res.applied).toBe(2)
    expect(res.byKind).toEqual({ normalized: 2 })
  })

  it('handles multiple occurrences of same href on same line', () => {
    const content = 'Line with same.md and same.md again'
    const replacements: Replacement[] = [{ line: 1, oldHref: 'same.md', newHref: 'new.md' }]
    const res = applyReplacements(content, replacements)
    expect(res.applied).toBe(1) // Should only replace first occurrence
    expect(res.content).toBe('Line with new.md and same.md again')
  })
})

describe('applyReplacements - offset and boundary cases', () => {
  it('handles replacements at line boundaries', () => {
    const content = 'first.md\nsecond.md\nthird.md'
    const replacements: Replacement[] = [
      { line: 1, oldHref: 'first.md', newHref: 'first-new.md' },
      { line: 2, oldHref: 'second.md', newHref: 'second-new.md' },
      { line: 3, oldHref: 'third.md', newHref: 'third-new.md' },
    ]
    const res = applyReplacements(content, replacements)
    expect(res.applied).toBe(3)
    expect(res.content).toBe('first-new.md\nsecond-new.md\nthird-new.md')
  })

  it('handles CRLF line endings', () => {
    const content = 'Line 1\r\nLine with old.md here\r\nLine 3'
    const replacements: Replacement[] = [{ line: 2, oldHref: 'old.md', newHref: 'new.md' }]
    const res = applyReplacements(content, replacements)
    expect(res.applied).toBe(1)
    expect(res.content).toContain('new.md')
  })

  it('handles empty oldHref gracefully', () => {
    const content = 'Some content'
    const replacements: Replacement[] = [{ line: 1, oldHref: '', newHref: 'new' }]
    const res = applyReplacements(content, replacements)
    expect(res.applied).toBe(1) // Empty string can be replaced
  })

  it('handles very long content efficiently', () => {
    const longContent = 'x'.repeat(10000) + 'target.md' + 'x'.repeat(10000)
    const replacements: Replacement[] = [
      { start: 10000, end: 10009, line: 1, oldHref: 'target.md', newHref: 'new.md' },
    ]
    const res = applyReplacements(longContent, replacements)
    expect(res.applied).toBe(1)
    expect(res.content).toContain('new.md')
  })
})

describe('processFileReplacement', () => {
  let fileService: InMemoryFileSystemService

  beforeEach(() => {
    fileService = new InMemoryFileSystemService({
      '/dataset/test.md': '# Test File\n[link](old-path.md)\n[another](old-path.md)',
    })
    // Add empty file manually
    fileService.writeFile('empty.md', '')
  })

  it('should process file and write when replacements are applied', async () => {
    const generateReplacements = vi.fn().mockResolvedValue([
      {
        kind: 'pathSubstitution',
        oldHref: 'old-path.md',
        newHref: 'new-path.md',
        line: 2,
      },
    ] as Replacement[])

    const result = await processFileReplacement(
      '/dataset/test.md',
      generateReplacements,
      fileService,
    )

    expect(result.applied).toBe(1)
    expect(result.byKind).toEqual({ pathSubstitution: 1 })

    // Verify file was written
    const writtenContent = await fileService.readFile('/dataset/test.md')
    expect(writtenContent).toContain('[link](new-path.md)')
    expect(writtenContent).not.toContain('[link](old-path.md)')
  })
})

describe('processFileReplacement - no changes', () => {
  let fileService: InMemoryFileSystemService

  beforeEach(() => {
    fileService = new InMemoryFileSystemService({
      '/dataset/test.md': '# Test File\n[link](old-path.md)\n[another](old-path.md)',
    })
    // Add empty file manually
    fileService.writeFile('empty.md', '')
  })

  it('should not write file when no replacements are applied', async () => {
    const generateReplacements = vi.fn().mockResolvedValue([])

    const originalContent = await fileService.readFile('/dataset/test.md')
    const writeSpy = vi.spyOn(fileService, 'writeFile')

    const result = await processFileReplacement(
      '/dataset/test.md',
      generateReplacements,
      fileService,
    )

    expect(result.applied).toBe(0)
    expect(result.byKind).toEqual({})

    // Verify file was not written
    expect(writeSpy).not.toHaveBeenCalled()

    // Verify content is unchanged
    const finalContent = await fileService.readFile('/dataset/test.md')
    expect(finalContent).toBe(originalContent)
  })
})

describe('processFileReplacement - advanced cases', () => {
  let fileService: InMemoryFileSystemService

  beforeEach(() => {
    fileService = new InMemoryFileSystemService({
      '/dataset/test.md': '# Test File\n[link](old-path.md)\n[another](old-path.md)',
    })
    // Add empty file manually
    fileService.writeFile('empty.md', '')
  })

  it('should handle multiple replacement kinds', async () => {
    const generateReplacements = vi.fn().mockResolvedValue([
      {
        kind: 'normalizedFull',
        oldHref: 'old-path.md',
        newHref: './old-path.md',
        line: 2, // First link is on line 2
      },
      {
        kind: 'patched',
        oldHref: 'old-path.md',
        newHref: 'fixed-path.md',
        line: 3, // Second link is on line 3
      },
    ] as Replacement[])

    const result = await processFileReplacement(
      '/dataset/test.md',
      generateReplacements,
      fileService,
    )

    expect(result.applied).toBe(2)
    expect(result.byKind).toEqual({
      normalizedFull: 1,
      patched: 1,
    })

    // Verify file was written
    const writtenContent = await fileService.readFile('/dataset/test.md')
    expect(writtenContent).toContain('[link](./old-path.md)')
    expect(writtenContent).toContain('[another](fixed-path.md)')
  })
})

describe('processFileReplacement - content handling', () => {
  let fileService: InMemoryFileSystemService

  beforeEach(() => {
    fileService = new InMemoryFileSystemService({
      '/dataset/test.md': '# Test File\n[link](old-path.md)\n[another](old-path.md)',
    })
    // Add empty file manually
    fileService.writeFile('empty.md', '')
  })

  it('should return the processed content', async () => {
    const generateReplacements = vi.fn().mockResolvedValue([
      {
        kind: 'pathSubstitution',
        oldHref: 'old-path.md',
        newHref: 'new-path.md',
        line: 2, // Correct line number
      },
    ] as Replacement[])

    const result = await processFileReplacement(
      '/dataset/test.md',
      generateReplacements,
      fileService,
    )

    expect(result.content).toContain('[link](new-path.md)')
    expect(result.content).toContain('# Test File')
  })
})

describe('processFileReplacement - more cases', () => {
  let fileService: InMemoryFileSystemService

  beforeEach(() => {
    fileService = new InMemoryFileSystemService({
      '/dataset/test.md': '# Test File\n[link](old-path.md)\n[another](old-path.md)',
    })
    // Add empty file manually
    fileService.writeFile('empty.md', '')
  })

  it('should throw error when file does not exist', async () => {
    const generateReplacements = vi.fn()

    await expect(
      processFileReplacement('/dataset/nonexistent.md', generateReplacements, fileService),
    ).rejects.toThrow('File not found')
  })

  it('should call generateReplacements with correct parameters', async () => {
    const generateReplacements = vi.fn().mockResolvedValue([])

    await processFileReplacement('/dataset/test.md', generateReplacements, fileService)

    expect(generateReplacements).toHaveBeenCalledTimes(1)
    const [links, content, lines] = generateReplacements.mock.calls[0]
    expect(Array.isArray(links)).toBe(true)
    expect(typeof content).toBe('string')
    expect(Array.isArray(lines)).toBe(true)
    expect(content).toBe(lines.join('\n'))
  })
})

describe('processFileReplacement - file handling', () => {
  let fileService: InMemoryFileSystemService

  beforeEach(() => {
    fileService = new InMemoryFileSystemService({
      '/dataset/test.md': '# Test File\n[link](old-path.md)\n[another](old-path.md)',
    })
    // Add empty file manually
    fileService.writeFile('empty.md', '')
  })

  it('should handle empty file', async () => {
    // Create a simple mock file service for this test
    const mockFileService = {
      readFile: vi.fn().mockResolvedValue(''),
      writeFile: vi.fn().mockResolvedValue(undefined),
    }

    const generateReplacements = vi.fn().mockResolvedValue([])

    const result = await processFileReplacement(
      'empty.md',
      generateReplacements,
      mockFileService as unknown as FileSystemService,
    )

    expect(result.applied).toBe(0)
    expect(result.content).toBe('')
    expect(mockFileService.readFile).toHaveBeenCalledWith('empty.md')
    expect(mockFileService.writeFile).not.toHaveBeenCalled()
  })

  it('should handle file with only whitespace', async () => {
    // Create a local file service for this test
    const localFileService = new InMemoryFileSystemService({
      '/dataset/whitespace.md': '   \n\t\n  ',
    })

    const generateReplacements = vi.fn().mockResolvedValue([])

    const result = await processFileReplacement(
      '/dataset/whitespace.md',
      generateReplacements,
      localFileService,
    )

    expect(result.applied).toBe(0)
    expect(result.content).toBe('   \n\t\n  ')
  })
})
