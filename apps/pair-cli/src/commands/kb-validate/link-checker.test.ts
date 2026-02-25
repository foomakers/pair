import { describe, it, expect, beforeEach } from 'vitest'
import type { FileSystemService } from '@pair/content-ops'
import InMemoryFileSystemService from '@pair/content-ops/test-utils/in-memory-fs'
import { MockHttpClientService } from '@pair/content-ops'
import { validateLinks } from './link-checker'
import type { IncomingMessage } from 'http'

// Helper to create a mock HTTP response
function createMockResponse(statusCode: number): IncomingMessage {
  return {
    statusCode,
    headers: {},
  } as IncomingMessage
}

describe('validateLinks', () => {
  let fs: FileSystemService
  let httpClient: MockHttpClientService

  beforeEach(() => {
    fs = new InMemoryFileSystemService({}, '/kb', '/kb')
    httpClient = new MockHttpClientService()
  })

  describe('internal links', () => {
    it('should validate valid internal links', async () => {
      // Setup files
      fs.writeFile('/kb/README.md', '[Link](./other.md)')
      fs.writeFile('/kb/other.md', '# Other')

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/README.md'],
        fs,
      })

      expect(results).toHaveLength(1)
      expect(results[0]?.valid).toBe(true)
      expect(results[0]?.errors).toHaveLength(0)
    })

    it('should detect broken relative links', async () => {
      fs.writeFile('/kb/README.md', '[Link](./missing.md)')

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/README.md'],
        fs,
      })

      expect(results[0]?.valid).toBe(false)
      expect(results[0]?.errors).toHaveLength(1)
      expect(results[0]?.errors[0]).toContain('Broken internal link')
      expect(results[0]?.errors[0]).toContain('./missing.md')
    })

    it('should validate absolute internal links', async () => {
      fs.writeFile('/kb/docs/README.md', '[Link](/other.md)')
      fs.writeFile('/kb/other.md', '# Other')

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/docs/README.md'],
        fs,
      })

      expect(results[0]?.valid).toBe(true)
      expect(results[0]?.errors).toHaveLength(0)
    })

    it('should detect broken absolute internal links', async () => {
      fs.writeFile('/kb/docs/README.md', '[Link](/missing.md)')

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/docs/README.md'],
        fs,
      })

      expect(results[0]?.valid).toBe(false)
      expect(results[0]?.errors).toHaveLength(1)
      expect(results[0]?.errors[0]).toContain('/missing.md')
    })

    it('should validate links with anchors', async () => {
      fs.writeFile('/kb/README.md', '[Link](./other.md#section)')
      fs.writeFile('/kb/other.md', '# Other')

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/README.md'],
        fs,
      })

      expect(results[0]?.valid).toBe(true)
      expect(results[0]?.errors).toHaveLength(0)
    })

    it('should ignore anchor-only links', async () => {
      fs.writeFile('/kb/README.md', '[Link](#section)')

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/README.md'],
        fs,
      })

      expect(results[0]?.valid).toBe(true)
      expect(results[0]?.errors).toHaveLength(0)
    })

    it('should validate multiple links in one file', async () => {
      fs.writeFile(
        '/kb/README.md',
        '[Link1](./valid.md)\n[Link2](./missing.md)\n[Link3](./also-valid.md)',
      )
      fs.writeFile('/kb/valid.md', '# Valid')
      fs.writeFile('/kb/also-valid.md', '# Also Valid')

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/README.md'],
        fs,
      })

      expect(results[0]?.valid).toBe(false)
      expect(results[0]?.errors).toHaveLength(1)
      expect(results[0]?.errors[0]).toContain('./missing.md')
    })
  })

  describe('external links', () => {
    it('should skip external links when strict mode is disabled', async () => {
      fs.writeFile('/kb/README.md', '[Link](https://example.com)')

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/README.md'],
        fs,
        strict: false,
      })

      expect(results[0]?.valid).toBe(true)
      expect(results[0]?.warnings).toHaveLength(0)
    })

    it('should validate external links in strict mode', async () => {
      fs.writeFile('/kb/README.md', '[Link](https://example.com)')
      httpClient.setRequestResponses([createMockResponse(200)])

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/README.md'],
        fs,
        httpClient,
        strict: true,
      })

      expect(results[0]?.valid).toBe(true)
      expect(results[0]?.warnings).toHaveLength(0)
    })

    it('should warn about unreachable external links in strict mode', async () => {
      fs.writeFile('/kb/README.md', '[Link](https://unreachable.example.com)')

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/README.md'],
        fs,
        httpClient,
        strict: true,
      })

      expect(results[0]?.valid).toBe(true) // External link warnings don't fail validation
      expect(results[0]?.warnings).toHaveLength(1)
      expect(results[0]?.warnings[0]).toContain('Unreachable external link')
      expect(results[0]?.warnings[0]).toContain('https://unreachable.example.com')
    })

    it('should validate http links in strict mode', async () => {
      fs.writeFile('/kb/README.md', '[Link](http://example.com)')
      httpClient.setRequestResponses([createMockResponse(200)])

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/README.md'],
        fs,
        httpClient,
        strict: true,
      })

      expect(results[0]?.valid).toBe(true)
      expect(results[0]?.warnings).toHaveLength(0)
    })
  })

  describe('mixed links', () => {
    it('should validate files with both internal and external links', async () => {
      fs.writeFile('/kb/README.md', '[Internal](./valid.md)\n[External](https://example.com)')
      fs.writeFile('/kb/valid.md', '# Valid')
      httpClient.setRequestResponses([createMockResponse(200)])

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/README.md'],
        fs,
        httpClient,
        strict: true,
      })

      expect(results[0]?.valid).toBe(true)
      expect(results[0]?.errors).toHaveLength(0)
      expect(results[0]?.warnings).toHaveLength(0)
    })

    it('should report both broken internal and unreachable external links', async () => {
      fs.writeFile('/kb/README.md', '[Internal](./missing.md)\n[External](https://unreachable.com)')

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/README.md'],
        fs,
        httpClient,
        strict: true,
      })

      expect(results[0]?.valid).toBe(false)
      expect(results[0]?.errors).toHaveLength(1)
      expect(results[0]?.errors[0]).toContain('./missing.md')
      expect(results[0]?.warnings).toHaveLength(1)
      expect(results[0]?.warnings[0]).toContain('https://unreachable.com')
    })
  })

  describe('multiple files', () => {
    it('should validate links across multiple files', async () => {
      fs.writeFile('/kb/README.md', '[Link](./valid.md)')
      fs.writeFile('/kb/other.md', '[Link](./missing.md)')
      fs.writeFile('/kb/valid.md', '# Valid')

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/README.md', '/kb/other.md'],
        fs,
      })

      expect(results).toHaveLength(2)
      expect(results[0]?.file).toBe('/kb/README.md')
      expect(results[0]?.valid).toBe(true)
      expect(results[1]?.file).toBe('/kb/other.md')
      expect(results[1]?.valid).toBe(false)
    })
  })

  describe('fenced code blocks', () => {
    it('should ignore links inside fenced code blocks (CP311 false positives)', async () => {
      const content = [
        'Real [link](./valid.md) here.',
        '',
        '```javascript',
        'window.webVitals[`on${metric}`](data => {',
        '  this.recordMetric({ value: data.value })',
        '})',
        '```',
        '',
        '```markdown',
        '[Core Data Pipeline](01-initiatives/2025/core-data-pipeline.md)',
        '```',
        '',
        '```javascript',
        '/req\\.user\\.role\\s*[!=]=?\\s*[\'"](admin|root)[\'"]/g,',
        '```',
      ].join('\n')

      fs.writeFile('/kb/README.md', content)
      fs.writeFile('/kb/valid.md', '# Valid')

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/README.md'],
        fs,
      })

      expect(results[0]?.valid).toBe(true)
      expect(results[0]?.errors).toHaveLength(0)
    })
  })

  describe('edge cases', () => {
    it('should handle files with no links', async () => {
      fs.writeFile('/kb/README.md', 'No links here')

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/README.md'],
        fs,
      })

      expect(results[0]?.valid).toBe(true)
      expect(results[0]?.errors).toHaveLength(0)
    })

    it('should handle nested directory links', async () => {
      fs.writeFile('/kb/docs/nested/file.md', '[Link](../../README.md)')
      fs.writeFile('/kb/README.md', '# Root')

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/docs/nested/file.md'],
        fs,
      })

      expect(results[0]?.valid).toBe(true)
    })
  })
})
