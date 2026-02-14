import { describe, it, expect, beforeEach } from 'vitest'
import { BackupService } from './backup-service'
import { InMemoryFileSystemService } from '../test-utils/in-memory-fs'

// Helper to create test file service with default registries
function createTestFileService(): InMemoryFileSystemService {
  return new InMemoryFileSystemService(
    {
      '.github/agents/config.md': '# Test Config',
      '.github/agents/test.md': '# Test Agent',
      '.pair/knowledge/guide.md': '# Knowledge Guide',
      '.pair/adoption/readme.md': '# Adoption README',
      'AGENTS.md': '# Agents Guide',
    },
    '/',
    '/',
  )
}

describe('BackupService - Backup Path Format', () => {
  let fileService: InMemoryFileSystemService
  let backupService: BackupService

  beforeEach(() => {
    fileService = createTestFileService()
    backupService = new BackupService(fileService)
  })

  it('should create backup for github registry with correct path format', async () => {
    const backupPath = await backupService.createRegistryBackup('github', '.github')
    expect(backupPath).toMatch(/^\.pair\/backups\/root-\d{8}-\d{6}\/\.github$/)
  })

  it('should backup entire registry folder structure', async () => {
    const backupPath = await backupService.createRegistryBackup('github', '.github')

    const configBackup = `${backupPath}/agents/config.md`
    const agentBackup = `${backupPath}/agents/test.md`

    expect(await fileService.readFile(configBackup)).toBe('# Test Config')
    expect(await fileService.readFile(agentBackup)).toBe('# Test Agent')
  })

  it('should create backup for knowledge registry', async () => {
    const backupPath = await backupService.createRegistryBackup('knowledge', '.pair/knowledge')

    expect(backupPath).toMatch(/^\.pair\/backups\/root-\d{8}-\d{6}\/\.pair\/knowledge$/)
    expect(await fileService.readFile(`${backupPath}/guide.md`)).toBe('# Knowledge Guide')
  })
})

describe('BackupService - Backup Types', () => {
  let fileService: InMemoryFileSystemService
  let backupService: BackupService

  beforeEach(() => {
    fileService = createTestFileService()
    backupService = new BackupService(fileService)
  })

  it('should create backup for single-file registry (AGENTS.md)', async () => {
    const backupPath = await backupService.createRegistryBackup('agents', 'AGENTS.md')

    expect(backupPath).toMatch(/^\.pair\/backups\/root-\d{8}-\d{6}\/AGENTS\.md$/)
    expect(await fileService.readFile(backupPath)).toBe('# Agents Guide')
  })

  it('should track multiple registry backups in same session', async () => {
    await backupService.createRegistryBackup('github', '.github')
    await backupService.createRegistryBackup('knowledge', '.pair/knowledge')

    const session = backupService.getCurrentSession()
    expect(session.registries).toHaveLength(2)
    expect(session.registries).toContain('github')
    expect(session.registries).toContain('knowledge')
  })
})

describe('BackupService - Registry Restore', () => {
  let fileService: InMemoryFileSystemService
  let backupService: BackupService

  beforeEach(() => {
    fileService = new InMemoryFileSystemService(
      {
        '.github/agents/config.md': '# Test Config',
        '.pair/knowledge/guide.md': '# Knowledge Guide',
      },
      '/',
      '/',
    )
    backupService = new BackupService(fileService)
  })

  async function createAndModifyBackup() {
    const backupPath = await backupService.createRegistryBackup('github', '.github')
    await fileService.writeFile('.github/agents/config.md', '# Modified Config')
    return backupPath
  }

  it('should restore registry from backup', async () => {
    const backupPath = await createAndModifyBackup()
    await backupService.restoreRegistry(backupPath, '.github')

    const content = await fileService.readFile('.github/agents/config.md')
    expect(content).toBe('# Test Config')
  })

  it('should restore single-file registry', async () => {
    await fileService.writeFile('AGENTS.md', '# Original Agents')
    const backupPath = await backupService.createRegistryBackup('agents', 'AGENTS.md')

    // Modify
    await fileService.writeFile('AGENTS.md', '# Modified Agents')

    // Restore
    await backupService.restoreRegistry(backupPath, 'AGENTS.md')

    const content = await fileService.readFile('AGENTS.md')
    expect(content).toBe('# Original Agents')
  })
})

describe('BackupService - Rollback', () => {
  let fileService: InMemoryFileSystemService
  let backupService: BackupService

  beforeEach(() => {
    fileService = new InMemoryFileSystemService(
      {
        '.github/agents/config.md': '# Original Config',
        '.pair/knowledge/guide.md': '# Original Guide',
        'AGENTS.md': '# Original Agents',
      },
      '/',
      '/',
    )
    backupService = new BackupService(fileService)
  })

  async function createMultipleBackupsAndModify() {
    await backupService.createRegistryBackup('github', '.github')
    await backupService.createRegistryBackup('knowledge', '.pair/knowledge')
    await backupService.createRegistryBackup('agents', 'AGENTS.md')

    await fileService.writeFile('.github/agents/config.md', '# Modified Config')
    await fileService.writeFile('.pair/knowledge/guide.md', '# Modified Guide')
    await fileService.writeFile('AGENTS.md', '# Modified Agents')
  }

  it('should rollback all registries in current session', async () => {
    await createMultipleBackupsAndModify()
    await backupService.rollback()

    expect(await fileService.readFile('.github/agents/config.md')).toBe('# Original Config')
    expect(await fileService.readFile('.pair/knowledge/guide.md')).toBe('# Original Guide')
    expect(await fileService.readFile('AGENTS.md')).toBe('# Original Agents')
  })

  it('should handle rollback when no backups exist', async () => {
    await expect(backupService.rollback()).resolves.not.toThrow()
  })
})

describe('BackupService - Rollback Cleanup', () => {
  let fileService: InMemoryFileSystemService
  let backupService: BackupService

  beforeEach(() => {
    fileService = new InMemoryFileSystemService(
      {
        '.github/agents/config.md': '# Original Config',
        'AGENTS.md': '# Original Agents',
      },
      '/',
      '/',
    )
    backupService = new BackupService(fileService)
  })

  async function setupBackup() {
    await backupService.createRegistryBackup('github', '.github')
    await fileService.writeFile('.github/agents/config.md', '# Modified')
    return backupService.getCurrentSession().id
  }

  it('should remove backups after rollback by default', async () => {
    const sessionId = await setupBackup()
    const backupRoot = `.pair/backups/${sessionId}`

    await backupService.rollback()

    expect(await fileService.exists(backupRoot)).toBe(false)
  })

  it('should keep backups after rollback when keepBackup is true', async () => {
    const sessionId = await setupBackup()
    const backupRoot = `.pair/backups/${sessionId}`

    await backupService.rollback(undefined, true)

    expect(await fileService.exists(backupRoot)).toBe(true)
    expect(await fileService.exists(`${backupRoot}/.github/agents/config.md`)).toBe(true)
  })
})

describe('BackupService - Commit Cleanup', () => {
  let fileService: InMemoryFileSystemService
  let backupService: BackupService

  beforeEach(() => {
    fileService = new InMemoryFileSystemService(
      {
        '.github/agents/config.md': '# Test Config',
      },
      '/',
      '/',
    )
    backupService = new BackupService(fileService)
  })

  it('should remove backups on commit (default persist=false)', async () => {
    const backupPath = await backupService.createRegistryBackup('github', '.github')
    expect(await fileService.exists(backupPath)).toBe(true)

    await backupService.commit()

    expect(await fileService.exists(backupPath)).toBe(false)
  })

  it('should keep backups on commit when persist=true', async () => {
    const backupPath = await backupService.createRegistryBackup('github', '.github')
    expect(await fileService.exists(backupPath)).toBe(true)

    await backupService.commit(true)

    expect(await fileService.exists(backupPath)).toBe(true)
  })
})

describe('BackupService - Session Cleanup', () => {
  let fileService: InMemoryFileSystemService
  let backupService: BackupService

  beforeEach(() => {
    fileService = new InMemoryFileSystemService(
      {
        '.github/agents/config.md': '# Test Config',
      },
      '/',
      '/',
    )
    backupService = new BackupService(fileService)
  })

  it('should clear specific session backups', async () => {
    await backupService.createRegistryBackup('github', '.github')
    const sessionId = backupService.getCurrentSession().id

    await backupService.clearBackups(sessionId)

    const backupRoot = `.pair/backups/${sessionId}`
    expect(await fileService.exists(backupRoot)).toBe(false)
  })
})

describe('BackupService - Session Management', () => {
  let fileService: InMemoryFileSystemService
  let backupService: BackupService

  beforeEach(() => {
    fileService = new InMemoryFileSystemService({}, '/', '/')
    backupService = new BackupService(fileService)
  })

  it('should generate session ID with root-{timestamp} format', () => {
    const session = backupService.getCurrentSession()
    expect(session.id).toMatch(/^root-\d{8}-\d{6}$/)
  })

  it('should reuse same session ID for multiple backups', async () => {
    await fileService.writeFile('.github/test.md', '# Test')
    await fileService.writeFile('AGENTS.md', '# Agents')

    await backupService.createRegistryBackup('github', '.github')
    const session1 = backupService.getCurrentSession()

    await backupService.createRegistryBackup('agents', 'AGENTS.md')
    const session2 = backupService.getCurrentSession()

    expect(session1.id).toBe(session2.id)
  })
})

describe('BackupService - Batch Backup', () => {
  let fileService: InMemoryFileSystemService
  let backupService: BackupService

  beforeEach(() => {
    fileService = new InMemoryFileSystemService({}, '/', '/')
    backupService = new BackupService(fileService)
  })

  it('should backup all registries at once with backupAllRegistries', async () => {
    await fileService.writeFile('.github/agents/config.md', '# Config')
    await fileService.writeFile('.pair/knowledge/guide.md', '# Guide')
    await fileService.writeFile('AGENTS.md', '# Agents')

    const backupPaths = await backupService.backupAllRegistries({
      github: '.github',
      knowledge: '.pair/knowledge',
      agents: 'AGENTS.md',
    })

    expect(backupPaths.size).toBe(3)
    expect(backupPaths.has('github')).toBe(true)

    const session = backupService.getCurrentSession()
    expect(session.registries).toEqual(['github', 'knowledge', 'agents'])
  })

  it('should skip non-existent registries in backupAllRegistries', async () => {
    await fileService.writeFile('AGENTS.md', '# Agents')

    const backupPaths = await backupService.backupAllRegistries({
      github: '.github',
      agents: 'AGENTS.md',
      knowledge: '.pair/knowledge',
    })

    expect(backupPaths.size).toBe(1)
    expect(backupPaths.has('agents')).toBe(true)
  })
})

describe('BackupService - Error Handling', () => {
  let fileService: InMemoryFileSystemService
  let backupService: BackupService

  beforeEach(() => {
    fileService = new InMemoryFileSystemService({}, '/', '/')
    backupService = new BackupService(fileService)
  })

  async function setupErrorTest() {
    await fileService.writeFile('.github/test.md', '# Original')
    await backupService.createRegistryBackup('github', '.github')
  }

  it('should re-throw original error after rollback', async () => {
    await setupErrorTest()

    const originalError = new Error('Update failed')
    await expect(backupService.rollback(originalError)).rejects.toThrow('Update failed')

    expect(await fileService.readFile('.github/test.md')).toBe('# Original')
  })

  it('should cleanup backups even when re-throwing error', async () => {
    await setupErrorTest()
    const backupRoot = `.pair/backups/${backupService.getCurrentSession().id}`

    try {
      await backupService.rollback(new Error('Update failed'))
    } catch {
      // Expected
    }

    expect(await fileService.exists(backupRoot)).toBe(false)
  })
})

describe('BackupService - Error Retention', () => {
  let fileService: InMemoryFileSystemService
  let backupService: BackupService

  beforeEach(() => {
    fileService = new InMemoryFileSystemService({}, '/', '/')
    backupService = new BackupService(fileService)
  })

  it('should keep backups when keepBackup=true even with error', async () => {
    await fileService.writeFile('.github/test.md', '# Original')
    await backupService.createRegistryBackup('github', '.github')
    const backupRoot = `.pair/backups/${backupService.getCurrentSession().id}`

    try {
      await backupService.rollback(new Error('Update failed'), true)
    } catch {
      // Expected
    }

    expect(await fileService.exists(backupRoot)).toBe(true)
  })
})
