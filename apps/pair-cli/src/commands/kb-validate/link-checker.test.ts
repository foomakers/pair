import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type { FileSystemService } from '@pair/content-ops'
import InMemoryFileSystemService from '@pair/content-ops/test-utils/in-memory-fs'
import { MockHttpClientService, logger } from '@pair/content-ops'
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

  /**
   * US-188 — optional link patterns. A KB validated in isolation links into a
   * codebase that may not be checked out next to it; a pattern-matched MISSING
   * target is a warning, everything else keeps failing.
   */
  describe('optional link patterns (US-188)', () => {
    it('AC-1: downgrades a pattern-matched missing target to a labelled warning', async () => {
      fs.writeFile('/kb/.pair/knowledge/guide.md', '[Code](../../apps/website/page.tsx)')

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/.pair/knowledge/guide.md'],
        fs,
        optionalLinkPatterns: ['../../apps/**'],
      })

      expect(results[0]?.valid).toBe(true)
      expect(results[0]?.errors).toHaveLength(0)
      expect(results[0]?.warnings).toHaveLength(1)
      expect(results[0]?.warnings[0]).toContain('optional link (pattern-matched)')
      expect(results[0]?.warnings[0]).toContain('../../apps/website/page.tsx')
    })

    it('AC-1: matches on the path resolved relative to the KB root, not only the written link', async () => {
      fs.writeFile('/kb/.pair/knowledge/guide.md', '[Code](../../apps/website/page.tsx)')

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/.pair/knowledge/guide.md'],
        fs,
        // '/kb/.pair/knowledge/../../apps/**' → 'apps/**' relative to baseDir
        optionalLinkPatterns: ['apps/**'],
      })

      expect(results[0]?.valid).toBe(true)
      expect(results[0]?.warnings).toHaveLength(1)
    })

    it('AC-3: a missing target matching NO pattern stays an error', async () => {
      fs.writeFile('/kb/README.md', '[Link](./missing.md)')

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/README.md'],
        fs,
        optionalLinkPatterns: ['../../apps/**'],
      })

      expect(results[0]?.valid).toBe(false)
      expect(results[0]?.errors).toHaveLength(1)
      expect(results[0]?.errors[0]).toContain('Broken internal link')
      expect(results[0]?.warnings).toHaveLength(0)
    })

    it('AC-4: --strict overrides the optional treatment (error, not warning)', async () => {
      fs.writeFile('/kb/.pair/knowledge/guide.md', '[Code](../../apps/website/page.tsx)')

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/.pair/knowledge/guide.md'],
        fs,
        httpClient,
        strict: true,
        optionalLinkPatterns: ['../../apps/**'],
      })

      expect(results[0]?.valid).toBe(false)
      expect(results[0]?.errors).toHaveLength(1)
      expect(results[0]?.errors[0]).toContain('Broken internal link')
      expect(results[0]?.warnings).toHaveLength(0)
    })

    it('AC-4: --strict overrides even without an httpClient', async () => {
      fs.writeFile('/kb/.pair/knowledge/guide.md', '[Code](../../apps/website/page.tsx)')

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/.pair/knowledge/guide.md'],
        fs,
        strict: true,
        optionalLinkPatterns: ['../../apps/**'],
      })

      expect(results[0]?.valid).toBe(false)
      expect(results[0]?.errors).toHaveLength(1)
    })

    // Edge case: "Invalid glob syntax — CLI warns about malformed patterns and skips
    // them (does not crash the run)". Table-driven: the contract is that NOTHING a
    // config file can contain aborts validation, not that two known shapes are handled.
    describe.each([
      ['unterminated character class', 'apps/[ab'],
      ['range out of order', 'docs/[z-a].md'],
      ['blank pattern', '   '],
    ])('malformed pattern (%s)', (_label, malformed) => {
      afterEach(() => {
        vi.restoreAllMocks()
      })

      it('completes the run, skips the pattern, and keeps the valid ones working', async () => {
        const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
        fs.writeFile('/kb/.pair/knowledge/guide.md', '[Code](../../apps/x.ts)')

        const results = await validateLinks({
          baseDir: '/kb',
          files: ['/kb/.pair/knowledge/guide.md'],
          fs,
          optionalLinkPatterns: [malformed, 'apps/**'],
        })

        expect(results).toHaveLength(1)
        expect(results[0]?.valid).toBe(true)
        expect(results[0]?.warnings).toHaveLength(1)
        expect(warn).toHaveBeenCalledWith(`Invalid optional link pattern '${malformed}', ignoring`)
      })

      it('is still reported in --strict mode, where CI runs', async () => {
        const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
        fs.writeFile('/kb/README.md', '[Link](./missing.md)')

        const results = await validateLinks({
          baseDir: '/kb',
          files: ['/kb/README.md'],
          fs,
          strict: true,
          optionalLinkPatterns: [malformed],
        })

        expect(results[0]?.valid).toBe(false)
        expect(warn).toHaveBeenCalledWith(`Invalid optional link pattern '${malformed}', ignoring`)
      })
    })

    it('AC-5: a pattern-matched target that EXISTS is simply valid — no warning', async () => {
      fs.writeFile('/kb/.pair/knowledge/guide.md', '[Code](../../apps/website/page.tsx)')
      fs.writeFile('/kb/apps/website/page.tsx', 'export default null')

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/.pair/knowledge/guide.md'],
        fs,
        optionalLinkPatterns: ['apps/**'],
      })

      expect(results[0]?.valid).toBe(true)
      expect(results[0]?.errors).toHaveLength(0)
      expect(results[0]?.warnings).toHaveLength(0)
    })

    it('AC-6: no patterns at all keeps every missing link an error', async () => {
      fs.writeFile('/kb/.pair/knowledge/guide.md', '[Code](../../apps/website/page.tsx)')

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/.pair/knowledge/guide.md'],
        fs,
      })

      expect(results[0]?.valid).toBe(false)
      expect(results[0]?.errors).toHaveLength(1)
    })

    it('AC-6: an empty pattern list is identical to no patterns', async () => {
      fs.writeFile('/kb/README.md', '[Link](./missing.md)')

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/README.md'],
        fs,
        optionalLinkPatterns: [],
      })

      expect(results[0]?.valid).toBe(false)
      expect(results[0]?.errors).toHaveLength(1)
    })

    it('matches only the intended pattern when several are configured', async () => {
      fs.writeFile('/kb/.pair/knowledge/guide.md', '[Code](../../apps/x.ts)\n[Gone](./missing.md)')

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/.pair/knowledge/guide.md'],
        fs,
        optionalLinkPatterns: ['apps/**', 'packages/**'],
      })

      expect(results[0]?.errors).toHaveLength(1)
      expect(results[0]?.errors[0]).toContain('./missing.md')
      expect(results[0]?.warnings).toHaveLength(1)
      expect(results[0]?.warnings[0]).toContain('../../apps/x.ts')
    })

    it('emits ONE warning when several patterns match the same link', async () => {
      fs.writeFile('/kb/.pair/knowledge/guide.md', '[Code](../../apps/x.ts)')

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/.pair/knowledge/guide.md'],
        fs,
        optionalLinkPatterns: ['apps/**', 'apps/x.ts', '../../apps/**'],
      })

      expect(results[0]?.warnings).toHaveLength(1)
    })

    it('skips malformed patterns without crashing the run', async () => {
      fs.writeFile('/kb/README.md', '[Link](./missing.md)')

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/README.md'],
        fs,
        optionalLinkPatterns: ['[unterminated', ''],
      })

      expect(results[0]?.valid).toBe(false)
      expect(results[0]?.errors).toHaveLength(1)
    })

    it('never applies to anchor-only or external links', async () => {
      fs.writeFile(
        '/kb/.pair/knowledge/guide.md',
        '[Anchor](#section)\n[External](https://apps.example.com/x)',
      )

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/.pair/knowledge/guide.md'],
        fs,
        optionalLinkPatterns: ['**'],
      })

      expect(results[0]?.valid).toBe(true)
      expect(results[0]?.warnings).toHaveLength(0)
    })

    it('AC-3: an IN-KB broken link is NOT silenced by a pattern its written form starts with', async () => {
      // `apps/x.md` from `.pair/knowledge/` resolves INSIDE the KB
      // (`.pair/knowledge/apps/x.md`), so the KB-root-relative rule `apps/**` does
      // not describe it: the written form is only a candidate when it escapes the
      // source directory (`../`). A broken internal link must stay an error.
      fs.writeFile('/kb/.pair/knowledge/guide.md', '[Code](apps/x.md)')

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/.pair/knowledge/guide.md'],
        fs,
        optionalLinkPatterns: ['apps/**'],
      })

      expect(results[0]?.valid).toBe(false)
      expect(results[0]?.errors).toHaveLength(1)
      expect(results[0]?.errors[0]).toContain('Broken internal link: apps/x.md')
      expect(results[0]?.warnings).toHaveLength(0)
    })

    it('AC-3: the same in-KB link written `./apps/x.md` is not silenced either', async () => {
      fs.writeFile('/kb/.pair/knowledge/guide.md', '[Code](./apps/x.md)')

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/.pair/knowledge/guide.md'],
        fs,
        optionalLinkPatterns: ['apps/**'],
      })

      expect(results[0]?.valid).toBe(false)
      expect(results[0]?.errors).toHaveLength(1)
    })

    it('matches the written form of an in-KB link only where it IS the resolved form', async () => {
      // Same `apps/x.md` written from the KB ROOT: written and resolved forms
      // coincide, so the KB-root-relative pattern legitimately applies.
      fs.writeFile('/kb/guide.md', '[Code](apps/x.md)')

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/guide.md'],
        fs,
        optionalLinkPatterns: ['apps/**'],
      })

      expect(results[0]?.valid).toBe(true)
      expect(results[0]?.warnings).toHaveLength(1)
    })

    it('applies to absolute internal links too (resolved from the KB root)', async () => {
      fs.writeFile('/kb/docs/guide.md', '[Code](/apps/website/page.tsx)')

      const results = await validateLinks({
        baseDir: '/kb',
        files: ['/kb/docs/guide.md'],
        fs,
        optionalLinkPatterns: ['apps/**'],
      })

      expect(results[0]?.valid).toBe(true)
      expect(results[0]?.warnings).toHaveLength(1)
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
