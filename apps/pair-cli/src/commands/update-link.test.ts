import { describe, it, expect } from 'vitest'
import { updateLinkCommand } from './update-link'
import { createTestFs } from '../test-utils/test-helpers'

const realCwd = '/development/path/pair/apps/pair-cli'

// Helper to create test fs with both dataset (SOURCE) and .pair (TARGET)
function createTestFsWithKB(pairFiles?: Record<string, string>) {
  const nodeModulesPath = `${realCwd}/node_modules/@pair/knowledge-hub/dataset`
  const defaultPairFiles = { [`${realCwd}/.pair/README.md`]: '# Installed KB' }
  const mergedPairFiles =
    pairFiles && Object.keys(pairFiles).length > 0 ? pairFiles : defaultPairFiles

  return createTestFs(
    {},
    {
      [`${nodeModulesPath}/README.md`]: '# KB Dataset',
      [`${realCwd}/node_modules/@pair/knowledge-hub/package.json`]: JSON.stringify({
        name: '@pair/knowledge-hub',
      }),
      ...mergedPairFiles,
    },
    realCwd,
  )
}

describe('update-link command - path mode flags', () => {
  it('should accept --relative flag', async () => {
    const fs = createTestFsWithKB()

    const result = await updateLinkCommand(fs, ['--relative'], {})

    expect(result).toBeDefined()
    expect(result.success).toBe(true)
    expect(result.pathMode).toBe('relative')
  })

  it('should accept --absolute flag', async () => {
    const fs = createTestFsWithKB()

    const result = await updateLinkCommand(fs, ['--absolute'], {})

    expect(result).toBeDefined()
    expect(result.success).toBe(true)
    expect(result.pathMode).toBe('absolute')
  })

  it('should default to --relative when no path option specified', async () => {
    const fs = createTestFsWithKB()

    const result = await updateLinkCommand(fs, [], {})

    expect(result).toBeDefined()
    expect(result.success).toBe(true)
    expect(result.pathMode).toBe('relative')
  })

  it('should reject conflicting --relative and --absolute flags', async () => {
    const fs = createTestFsWithKB()

    const result = await updateLinkCommand(fs, ['--relative', '--absolute'], {})

    expect(result.success).toBe(false)
    expect(result.message).toContain('Cannot specify both')
  })
})

describe('update-link command - execution flags', () => {
  it('should accept --dry-run flag', async () => {
    const fs = createTestFsWithKB()

    const result = await updateLinkCommand(fs, ['--dry-run'], {})

    expect(result).toBeDefined()
    expect(result.success).toBe(true)
    expect(result.dryRun).toBe(true)
  })

  it('should accept --verbose flag', async () => {
    const fs = createTestFsWithKB()

    const result = await updateLinkCommand(fs, ['--verbose'], {})

    expect(result).toBeDefined()
    expect(result.success).toBe(true)
  })
})

describe('update-link command - KB detection', () => {
  it('should fail when no KB is installed', async () => {
    const fs = createTestFs({}, {}, realCwd)

    const result = await updateLinkCommand(fs, [], {})

    expect(result.success).toBe(false)
    expect(result.message).toContain('No Knowledge Base')
  })

  it('should detect KB in .pair directory', async () => {
    const fs = createTestFsWithKB()

    const result = await updateLinkCommand(fs, [], {})

    expect(result.success).toBe(true)
  })
})

describe('update-link command - integration', () => {
  it('should return logs array for observability', async () => {
    const fs = createTestFsWithKB()

    const result = await updateLinkCommand(fs, [], {})

    expect(result).toBeDefined()
    expect(Array.isArray(result.logs)).toBe(true)
    expect(result.logs!.length).toBeGreaterThan(0)
  })

  it('should respect minLogLevel option', async () => {
    const fs = createTestFsWithKB()

    const result = await updateLinkCommand(fs, [], { minLogLevel: 'error' })

    expect(result).toBeDefined()
    expect(result.logs).toBeDefined()
  })
})

describe('update-link command - result structure', () => {
  it('should return success, message, and stats', async () => {
    const fs = createTestFsWithKB()

    const result = await updateLinkCommand(fs, [], {})

    expect(result).toHaveProperty('success')
    expect(result).toHaveProperty('message')
    expect(result).toHaveProperty('stats')
  })

  it('should include processed links count in stats', async () => {
    const fs = createTestFsWithKB()

    const result = await updateLinkCommand(fs, [], {})

    expect(result.success).toBe(true)
    expect(result.stats).toBeDefined()
    expect(result.stats).toHaveProperty('totalLinks')
    expect(result.stats).toHaveProperty('filesModified')
  })
})

describe('update-link command - link transformation', () => {
  it('should convert relative links to absolute with --absolute', async () => {
    const mdPath = `${realCwd}/.pair/README.md`
    const relLink = '[Doc](docs/usage.md)'
    const fs = createTestFsWithKB({ [mdPath]: relLink })

    const result = await updateLinkCommand(fs, ['--absolute'], {})
    expect(result.success).toBe(true)
    // Simulate: check that the file content was updated to absolute path
    const updated = fs.readFileSync(mdPath)
    // The path should now be absolute (starting with /)
    expect(updated).toMatch(/\]\(\/.*docs\/usage\.md\)/)
  })

  it('should convert absolute links to relative with --relative', async () => {
    const mdPath = `${realCwd}/.pair/README.md`
    const absLink = '[Doc](/development/path/pair/apps/pair-cli/docs/usage.md)'
    const fs = createTestFsWithKB({ [mdPath]: absLink })

    const result = await updateLinkCommand(fs, ['--relative'], {})
    expect(result.success).toBe(true)
    // Simulate: check that the file content was updated to relative path
    const updated = fs.readFileSync(mdPath)
    // The path should now be relative (not starting with /)
    expect(updated).toMatch(/\]\(.*docs\/usage\.md\)/)
    expect(updated).not.toMatch(/\]\(\//)
  })
})

describe('update-link command - success reporting', () => {
  it('should report correct success message', async () => {
    const fs = createTestFsWithKB()

    const result = await updateLinkCommand(fs, [], {})

    expect(result.success).toBe(true)
    expect(result.message).toBe('Link update completed successfully')
  })

  it('should include stats with zero counts when no links found', async () => {
    const fs = createTestFsWithKB({ [`${realCwd}/.pair/README.md`]: '# No links here' })

    const result = await updateLinkCommand(fs, [], {})

    expect(result.success).toBe(true)
    expect(result.stats?.totalLinks).toBe(0)
    expect(result.stats?.filesModified).toBe(0)
  })

  it('should report stats with correct link counts', async () => {
    const mdContent = '[Link1](./a.md) and [Link2](./b.md)'
    const fs = createTestFsWithKB({ [`${realCwd}/.pair/doc.md`]: mdContent })

    const result = await updateLinkCommand(fs, [], {})

    expect(result.success).toBe(true)
    expect(result.stats?.totalLinks).toBeGreaterThan(0)
  })

  it('should include linksByCategory in stats when links are processed', async () => {
    const mdContent = '[Rel](./a.md) [Abs](/abs/path.md)'
    const fs = createTestFsWithKB({ [`${realCwd}/.pair/doc.md`]: mdContent })

    const result = await updateLinkCommand(fs, [], {})

    expect(result.success).toBe(true)
    expect(result.stats?.linksByCategory).toBeDefined()
  })
})

describe('update-link command - error reporting', () => {
  it('should report error message when KB not found', async () => {
    const fs = createTestFs({}, {}, realCwd)

    const result = await updateLinkCommand(fs, [], {})

    expect(result.success).toBe(false)
    expect(result.message).toContain('No Knowledge Base')
  })

  it('should report error message for conflicting flags', async () => {
    const fs = createTestFsWithKB()

    const result = await updateLinkCommand(fs, ['--relative', '--absolute'], {})

    expect(result.success).toBe(false)
    expect(result.message).toContain('Cannot specify both')
  })
})

describe('update-link command - dry-run mode', () => {
  it('should include dry-run indicator in result when --dry-run used', async () => {
    const fs = createTestFsWithKB({ [`${realCwd}/.pair/README.md`]: '[Link](./doc.md)' })

    const result = await updateLinkCommand(fs, ['--dry-run'], {})

    expect(result.success).toBe(true)
    expect(result.dryRun).toBe(true)
  })

  it('should differentiate messages between dry-run and actual execution', async () => {
    const mdContent = '[Link](./doc.md)'
    const fs = createTestFsWithKB({ [`${realCwd}/.pair/README.md`]: mdContent })

    const dryResult = await updateLinkCommand(fs, ['--dry-run'], {})
    const realResult = await updateLinkCommand(fs, [], {})

    expect(dryResult.dryRun).toBe(true)
    expect(realResult.dryRun).toBeUndefined()
  })
})

describe('update-link command - verbose mode', () => {
  it('should log appropriate messages in verbose mode', async () => {
    const fs = createTestFsWithKB()

    const result = await updateLinkCommand(fs, ['--verbose'], {})

    expect(result.success).toBe(true)
    expect(result.logs).toBeDefined()
    expect(result.logs!.length).toBeGreaterThan(0)
    expect(result.logs!.some(log => log.message.includes('update-link'))).toBe(true)
  })
})

describe('update-link command - combined flags', () => {
  it('should handle --dry-run with --absolute', async () => {
    const fs = createTestFsWithKB()

    const result = await updateLinkCommand(fs, ['--dry-run', '--absolute'], {})

    expect(result.success).toBe(true)
    expect(result.dryRun).toBe(true)
    expect(result.pathMode).toBe('absolute')
  })

  it('should handle --verbose with --relative', async () => {
    const fs = createTestFsWithKB()

    const result = await updateLinkCommand(fs, ['--verbose', '--relative'], {})

    expect(result.success).toBe(true)
    expect(result.pathMode).toBe('relative')
  })
})

describe('update-link command - KB detection consistency', () => {
  it('should detect KB in node_modules like install/update commands', async () => {
    const nodeModulesPath = `${realCwd}/node_modules/@pair/knowledge-hub/dataset`
    const fs = createTestFs(
      {},
      {
        [`${nodeModulesPath}/README.md`]: '# KB from node_modules',
        [`${nodeModulesPath}/.pair/knowledge/doc.md`]: '# Doc',
        [`${realCwd}/node_modules/@pair/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
        [`${realCwd}/.pair/README.md`]: '# Installed KB',
      },
      realCwd,
    )

    const result = await updateLinkCommand(fs, [], {})

    expect(result.success).toBe(true)
    expect(result.logs?.some(log => log.message.includes('node_modules'))).toBe(true)
  })

  it('should use datasetRoot option when provided like install/update', async () => {
    const customDatasetPath = '/custom/dataset/path'
    const fs = createTestFs(
      {},
      {
        [`${customDatasetPath}/README.md`]: '# Custom KB',
        [`${customDatasetPath}/.pair/knowledge/doc.md`]: '# Doc',
        [`${realCwd}/.pair/README.md`]: '# Installed KB',
      },
      realCwd,
    )

    const result = await updateLinkCommand(fs, [], { datasetRoot: customDatasetPath })

    expect(result.success).toBe(true)
  })

  it('should fail with same error as install/update when KB not found', async () => {
    const fs = createTestFs({}, {}, realCwd)

    const result = await updateLinkCommand(fs, [], {})

    expect(result.success).toBe(false)
    expect(result.message).toContain('No Knowledge Base')
  })
})

describe('update-link command - summary reporting', () => {
  it('should include linksByCategory in stats when links are transformed', async () => {
    const mdPath = `${realCwd}/.pair/README.md`
    const mdContent = '[Rel](./doc.md) [Abs](/abs/path.md)'
    const fs = createTestFsWithKB({ [mdPath]: mdContent })

    const result = await updateLinkCommand(fs, ['--absolute'], {})

    expect(result.success).toBe(true)
    expect(result.stats?.linksByCategory).toBeDefined()
    expect(result.stats?.linksByCategory?.['relative→absolute']).toBeGreaterThan(0)
  })

  it('should report totalLinks and filesModified in stats', async () => {
    const fs = createTestFsWithKB({
      [`${realCwd}/.pair/doc1.md`]: '[Link](./test.md)',
      [`${realCwd}/.pair/doc2.md`]: '[Another](/abs/path.md)',
    })

    const result = await updateLinkCommand(fs, ['--relative'], {})

    expect(result.success).toBe(true)
    expect(result.stats?.totalLinks).toBe(2)
    expect(result.stats?.filesModified).toBeGreaterThan(0)
  })

  it('should provide detailed stats for dry-run mode', async () => {
    const mdContent = '[Link1](./a.md) [Link2](/abs/b.md)'
    const fs = createTestFsWithKB({ [`${realCwd}/.pair/test.md`]: mdContent })

    const result = await updateLinkCommand(fs, ['--absolute', '--dry-run'], {})

    expect(result.success).toBe(true)
    expect(result.dryRun).toBe(true)
    expect(result.stats?.totalLinks).toBe(2)
    // Dry-run should not modify files
    expect(result.stats?.filesModified).toBe(0)
  })
})

describe('update-link command - AC1 & AC2', () => {
  it('AC1: default behavior validates, fixes, adjusts and converts to relative', async () => {
    const fs = createTestFsWithKB({
      [`${realCwd}/.pair/guide.md`]: '[Doc](./doc.md) [Abs](/abs/file.md)',
      [`${realCwd}/.pair/doc.md`]: '# Documentation',
    })

    const result = await updateLinkCommand(fs, [], {}) // No flags = default

    expect(result.success).toBe(true)
    expect(result.pathMode).toBe('relative') // Default to relative
    expect(result.stats?.totalLinks).toBe(2)
    expect(result.stats?.linksByCategory).toBeDefined()
  })

  it('AC2: --relative explicitly converts absolute paths to relative', async () => {
    const fs = createTestFsWithKB({
      [`${realCwd}/.pair/test.md`]: '[Absolute](/abs/path.md) [Another](/docs/file.md)',
    })

    const result = await updateLinkCommand(fs, ['--relative'], {})

    expect(result.success).toBe(true)
    expect(result.pathMode).toBe('relative')
    expect(result.stats?.linksByCategory?.['absolute→relative']).toBeGreaterThan(0)
  })
})

describe('update-link command - AC3 & AC4', () => {
  it('AC3: --absolute converts relative paths to absolute', async () => {
    const fs = createTestFsWithKB({
      [`${realCwd}/.pair/test.md`]: '[Relative](./doc.md) [Another](../sibling.md)',
    })

    const result = await updateLinkCommand(fs, ['--absolute'], {})

    expect(result.success).toBe(true)
    expect(result.pathMode).toBe('absolute')
    expect(result.stats?.linksByCategory?.['relative→absolute']).toBeGreaterThan(0)
  })

  it('AC4: --dry-run shows changes without modifying files', async () => {
    const originalContent = '[Link](./test.md)'
    const fs = createTestFsWithKB({
      [`${realCwd}/.pair/doc.md`]: originalContent,
    })

    const result = await updateLinkCommand(fs, ['--absolute', '--dry-run'], {})

    expect(result.success).toBe(true)
    expect(result.dryRun).toBe(true)
    // File should remain unchanged in dry-run
    const content = fs.readFileSync(`${realCwd}/.pair/doc.md`)
    expect(content).toBe(originalContent)
  })
})

describe('update-link command - AC5', () => {
  it('AC5: comprehensive summary with all required statistics', async () => {
    const fs = createTestFsWithKB({
      [`${realCwd}/.pair/file1.md`]: '[Rel](./a.md) [Abs](/abs/b.md)',
      [`${realCwd}/.pair/file2.md`]: '[Another](./c.md)',
    })

    const result = await updateLinkCommand(fs, ['--relative'], {})

    expect(result.success).toBe(true)
    // AC5 requirements: total links, categories, files modified
    expect(result.stats?.totalLinks).toBe(3)
    expect(result.stats?.filesModified).toBeGreaterThan(0)
    expect(result.stats?.linksByCategory).toBeDefined()
    expect(Object.keys(result.stats?.linksByCategory || {}).length).toBeGreaterThan(0)
  })
})

describe('update-link command - E2E complex scenarios', () => {
  it('E2E: complex KB structure with multiple markdown files', async () => {
    const fs = createTestFsWithKB({
      [`${realCwd}/.pair/how-to/guide.md`]: '[Setup](../setup.md) [API](/api/reference.md)',
      [`${realCwd}/.pair/setup.md`]: '[Config](./config/settings.md)',
      [`${realCwd}/.pair/config/settings.md`]: '[Back](../setup.md)',
    })

    const result = await updateLinkCommand(fs, ['--relative'], {})

    expect(result.success).toBe(true)
    expect(result.stats?.totalLinks).toBeGreaterThan(2)
    expect(result.stats?.filesModified).toBeGreaterThan(0)
  })
})

describe('update-link command - E2E mixed links', () => {
  it('E2E: handles mixed link types (relative, absolute, external)', async () => {
    const fs = createTestFsWithKB({
      [`${realCwd}/.pair/mixed.md`]: `
[Relative](./doc.md)
[Absolute](/abs/path.md)
[External](https://example.com)
[Mailto](mailto:test@example.com)
      `,
    })

    const result = await updateLinkCommand(fs, ['--relative'], {})

    expect(result.success).toBe(true)
    expect(result.stats?.totalLinks).toBe(4)
    // External and mailto links should not be converted
    const content = fs.readFileSync(`${realCwd}/.pair/mixed.md`)
    expect(content).toContain('https://example.com')
    expect(content).toContain('mailto:test@example.com')
  })
})

describe('update-link command - E2E formatting', () => {
  it('E2E: preserves markdown formatting and context', async () => {
    const fs = createTestFsWithKB({
      [`${realCwd}/.pair/formatted.md`]: `# Title

This is a paragraph with [inline link](./doc.md) in the middle.

- List item with [link](/abs/file.md)
- Another item

> Blockquote with [reference](./ref.md)
      `,
    })

    const result = await updateLinkCommand(fs, ['--absolute'], {})

    expect(result.success).toBe(true)
    const content = fs.readFileSync(`${realCwd}/.pair/formatted.md`)
    // Verify structure is preserved
    expect(content).toContain('# Title')
    expect(content).toContain('This is a paragraph')
    expect(content).toContain('- List item')
    expect(content).toContain('> Blockquote')
  })
})

describe('update-link command - E2E verbose', () => {
  it('E2E: verbose mode provides detailed logging', async () => {
    const fs = createTestFsWithKB({
      [`${realCwd}/.pair/test.md`]: '[Link](./doc.md)',
    })

    const result = await updateLinkCommand(fs, ['--relative', '--verbose'], {
      minLogLevel: 'info',
    })

    expect(result.success).toBe(true)
    expect(result.logs).toBeDefined()
    expect(result.logs!.length).toBeGreaterThan(0)
  })
})
