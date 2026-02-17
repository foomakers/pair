import { describe, it, expect } from 'vitest'
import { formatPreview } from './preview'
import type { ResolvedMetadata } from './defaults-resolver'

describe('formatPreview', () => {
  const metadata: ResolvedMetadata = {
    name: 'my-kb',
    version: '1.0.0',
    description: 'Test KB package',
    author: 'Test Author',
    tags: ['ai', 'devops'],
    license: 'MIT',
  }

  it('includes all metadata fields', () => {
    const result = formatPreview({
      metadata,
      registries: ['knowledge', 'adoption'],
      fileCount: 42,
      outputPath: '/output/kb.zip',
    })

    expect(result).toContain('my-kb')
    expect(result).toContain('1.0.0')
    expect(result).toContain('Test KB package')
    expect(result).toContain('Test Author')
    expect(result).toContain('ai, devops')
    expect(result).toContain('MIT')
  })

  it('includes registries', () => {
    const result = formatPreview({
      metadata,
      registries: ['knowledge', 'adoption'],
      fileCount: 10,
      outputPath: '/out.zip',
    })

    expect(result).toContain('knowledge')
    expect(result).toContain('adoption')
  })

  it('shows (none) for empty tags', () => {
    const result = formatPreview({
      metadata: { ...metadata, tags: [] },
      registries: [],
      fileCount: 0,
      outputPath: '/out.zip',
    })

    expect(result).toContain('(none)')
  })

  it('shows (none detected) for empty registries', () => {
    const result = formatPreview({
      metadata,
      registries: [],
      fileCount: 0,
      outputPath: '/out.zip',
    })

    expect(result).toContain('(none detected)')
  })

  it('includes file count and output path', () => {
    const result = formatPreview({
      metadata,
      registries: [],
      fileCount: 99,
      outputPath: '/dist/package.zip',
    })

    expect(result).toContain('99')
    expect(result).toContain('/dist/package.zip')
  })
})
