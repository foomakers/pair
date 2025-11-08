import { describe, it, expect } from 'vitest'
import { updateLinkCommand } from './update-link'
import { createTestFs } from '../test-utils/test-helpers'

const realCwd = '/development/path/pair/apps/pair-cli'

describe('update-link command - path mode flags', () => {
  it('should accept --relative flag', async () => {
    const fs = createTestFs({}, { [`${realCwd}/.pair/README.md`]: '# KB' }, realCwd)

    const result = await updateLinkCommand(fs, ['--relative'], {})

    expect(result).toBeDefined()
    expect(result.success).toBe(true)
    expect(result.pathMode).toBe('relative')
  })

  it('should accept --absolute flag', async () => {
    const fs = createTestFs({}, { [`${realCwd}/.pair/README.md`]: '# KB' }, realCwd)

    const result = await updateLinkCommand(fs, ['--absolute'], {})

    expect(result).toBeDefined()
    expect(result.success).toBe(true)
    expect(result.pathMode).toBe('absolute')
  })

  it('should default to --relative when no path option specified', async () => {
    const fs = createTestFs({}, { [`${realCwd}/.pair/README.md`]: '# KB' }, realCwd)

    const result = await updateLinkCommand(fs, [], {})

    expect(result).toBeDefined()
    expect(result.success).toBe(true)
    expect(result.pathMode).toBe('relative')
  })

  it('should reject conflicting --relative and --absolute flags', async () => {
    const fs = createTestFs({}, { [`${realCwd}/.pair/README.md`]: '# KB' }, realCwd)

    const result = await updateLinkCommand(fs, ['--relative', '--absolute'], {})

    expect(result.success).toBe(false)
    expect(result.message).toContain('Cannot specify both')
  })
})

describe('update-link command - execution flags', () => {
  it('should accept --dry-run flag', async () => {
    const fs = createTestFs({}, { [`${realCwd}/.pair/README.md`]: '# KB' }, realCwd)

    const result = await updateLinkCommand(fs, ['--dry-run'], {})

    expect(result).toBeDefined()
    expect(result.success).toBe(true)
    expect(result.dryRun).toBe(true)
  })

  it('should accept --verbose flag', async () => {
    const fs = createTestFs({}, { [`${realCwd}/.pair/README.md`]: '# KB' }, realCwd)

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
    const fs = createTestFs({}, { [`${realCwd}/.pair/README.md`]: '# KB' }, realCwd)

    const result = await updateLinkCommand(fs, [], {})

    expect(result.success).toBe(true)
  })
})

describe('update-link command - integration', () => {
  it('should return logs array for observability', async () => {
    const fs = createTestFs({}, { [`${realCwd}/.pair/README.md`]: '# KB' }, realCwd)

    const result = await updateLinkCommand(fs, [], {})

    expect(result).toBeDefined()
    expect(Array.isArray(result.logs)).toBe(true)
    expect(result.logs!.length).toBeGreaterThan(0)
  })

  it('should respect minLogLevel option', async () => {
    const fs = createTestFs({}, { [`${realCwd}/.pair/README.md`]: '# KB' }, realCwd)

    const result = await updateLinkCommand(fs, [], { minLogLevel: 'error' })

    expect(result).toBeDefined()
    expect(result.logs).toBeDefined()
  })
})

describe('update-link command - result structure', () => {
  it('should return success, message, and stats', async () => {
    const fs = createTestFs({}, { [`${realCwd}/.pair/README.md`]: '# KB' }, realCwd)

    const result = await updateLinkCommand(fs, [], {})

    expect(result).toHaveProperty('success')
    expect(result).toHaveProperty('message')
    expect(result).toHaveProperty('stats')
  })

  it('should include processed links count in stats', async () => {
    const fs = createTestFs({}, { [`${realCwd}/.pair/README.md`]: '# KB' }, realCwd)

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
    const fs = createTestFs({}, { [mdPath]: relLink }, realCwd)

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
    const fs = createTestFs({}, { [mdPath]: absLink }, realCwd)

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
    const fs = createTestFs({}, { [`${realCwd}/.pair/README.md`]: '# KB' }, realCwd)

    const result = await updateLinkCommand(fs, [], {})

    expect(result.success).toBe(true)
    expect(result.message).toBe('Link update completed successfully')
  })

  it('should include stats with zero counts when no links found', async () => {
    const fs = createTestFs({}, { [`${realCwd}/.pair/README.md`]: '# No links here' }, realCwd)

    const result = await updateLinkCommand(fs, [], {})

    expect(result.success).toBe(true)
    expect(result.stats?.totalLinks).toBe(0)
    expect(result.stats?.filesModified).toBe(0)
  })

  it('should report stats with correct link counts', async () => {
    const mdContent = '[Link1](./a.md) and [Link2](./b.md)'
    const fs = createTestFs({}, { [`${realCwd}/.pair/doc.md`]: mdContent }, realCwd)

    const result = await updateLinkCommand(fs, [], {})

    expect(result.success).toBe(true)
    expect(result.stats?.totalLinks).toBeGreaterThan(0)
  })

  it('should include linksByCategory in stats when links are processed', async () => {
    const mdContent = '[Rel](./a.md) [Abs](/abs/path.md)'
    const fs = createTestFs({}, { [`${realCwd}/.pair/doc.md`]: mdContent }, realCwd)

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
    const fs = createTestFs({}, { [`${realCwd}/.pair/README.md`]: '# KB' }, realCwd)

    const result = await updateLinkCommand(fs, ['--relative', '--absolute'], {})

    expect(result.success).toBe(false)
    expect(result.message).toContain('Cannot specify both')
  })
})

describe('update-link command - dry-run mode', () => {
  it('should include dry-run indicator in result when --dry-run used', async () => {
    const fs = createTestFs({}, { [`${realCwd}/.pair/README.md`]: '[Link](./doc.md)' }, realCwd)

    const result = await updateLinkCommand(fs, ['--dry-run'], {})

    expect(result.success).toBe(true)
    expect(result.dryRun).toBe(true)
  })

  it('should differentiate messages between dry-run and actual execution', async () => {
    const mdContent = '[Link](./doc.md)'
    const fs = createTestFs({}, { [`${realCwd}/.pair/README.md`]: mdContent }, realCwd)

    const dryResult = await updateLinkCommand(fs, ['--dry-run'], {})
    const realResult = await updateLinkCommand(fs, [], {})

    expect(dryResult.dryRun).toBe(true)
    expect(realResult.dryRun).toBeUndefined()
  })
})

describe('update-link command - verbose mode', () => {
  it('should log appropriate messages in verbose mode', async () => {
    const fs = createTestFs({}, { [`${realCwd}/.pair/README.md`]: '# KB' }, realCwd)

    const result = await updateLinkCommand(fs, ['--verbose'], {})

    expect(result.success).toBe(true)
    expect(result.logs).toBeDefined()
    expect(result.logs!.length).toBeGreaterThan(0)
    expect(result.logs!.some(log => log.message.includes('update-link'))).toBe(true)
  })
})

describe('update-link command - combined flags', () => {
  it('should handle --dry-run with --absolute', async () => {
    const fs = createTestFs({}, { [`${realCwd}/.pair/README.md`]: '# KB' }, realCwd)

    const result = await updateLinkCommand(fs, ['--dry-run', '--absolute'], {})

    expect(result.success).toBe(true)
    expect(result.dryRun).toBe(true)
    expect(result.pathMode).toBe('absolute')
  })

  it('should handle --verbose with --relative', async () => {
    const fs = createTestFs({}, { [`${realCwd}/.pair/README.md`]: '# KB' }, realCwd)

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
