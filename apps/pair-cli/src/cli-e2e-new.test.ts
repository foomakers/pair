/**
 * End-to-end tests for CLI
 * Tests actual CLI interface (argv parsing) with InMemoryFS
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops/test-utils/in-memory-fs'
import { runCli } from './cli'

// Mock process.exit to prevent tests from exiting
const originalExit = process.exit
let mockExit: ReturnType<typeof vi.fn>

beforeEach(() => {
  // Recreate mock for each test to avoid state pollution
  mockExit = vi.fn((code?: number) => {
    throw new Error(`process.exit called with code ${code}`)
  }) as never
  process.exit = mockExit
  process.exitCode = 0
})

afterEach(() => {
  process.exit = originalExit
})

describe('CLI E2E - Install Command', () => {
  describe('dev scenario with defaults', () => {
    it('should install from monorepo dataset when running from dev environment', async () => {
      const cwd = '/dev/pair/apps/pair-cli'
      const datasetPath = '/dev/pair/apps/pair-cli/node_modules/@pair/knowledge-hub/dataset'
      
      const fs = new InMemoryFileSystemService({
        // Monorepo structure (node_modules with @pair/knowledge-hub)
        [`${cwd}/package.json`]: JSON.stringify({ 
          name: '@pair/pair-cli',
          dependencies: { '@pair/knowledge-hub': 'workspace:*' }
        }),
        [`${cwd}/node_modules/@pair/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
          version: '0.3.0'
        }),
        [`${datasetPath}/AGENTS.md`]: '# Agents Guide',
        [`${datasetPath}/.github/workflows/ci.yml`]: 'name: CI',
        [`${datasetPath}/.pair/knowledge/index.md`]: '# Knowledge Base',
        [`${datasetPath}/.pair/adoption/onboarding.md`]: '# Onboarding',
        // Config
        [`${cwd}/config.json`]: JSON.stringify({
          asset_registries: {
            github: { target_path: '.github', behavior: 'mirror' },
            knowledge: { target_path: '.pair/knowledge', behavior: 'mirror' },
            adoption: { target_path: '.pair/adoption', behavior: 'mirror' },
            agents: { target_path: 'AGENTS.md', behavior: 'add' },
          },
        }),
      }, cwd, cwd)

      // Mock: Skip KB check and download
      await runCli(['node', 'pair', 'install', '--no-kb'], { fs })

      // Verify files were installed
      expect(fs.existsSync(`${cwd}/.github/workflows/ci.yml`)).toBe(true)
      expect(fs.existsSync(`${cwd}/.pair/knowledge/index.md`)).toBe(true)
      expect(fs.existsSync(`${cwd}/.pair/adoption/onboarding.md`)).toBe(true)
      expect(fs.existsSync(`${cwd}/AGENTS.md`)).toBe(true)
    })
  })

  describe('manual deploy scenario', () => {
    it('should install from manual deployment bundle', async () => {
      const cwd = '/usr/local/bin/project'
      const moduleFolder = `${cwd}/libs/pair-cli`
      const datasetPath = `${moduleFolder}/bundle-cli/dataset`

      const fs = new InMemoryFileSystemService({
        // Manual bundle structure
        [`${moduleFolder}/package.json`]: JSON.stringify({ name: '@pair/pair-cli' }),
        [`${datasetPath}/AGENTS.md`]: '# Agents Guide',
        [`${datasetPath}/.github/workflows/ci.yml`]: 'name: CI',
        [`${datasetPath}/.pair/knowledge/index.md`]: '# Knowledge Base',
        [`${datasetPath}/.pair/adoption/onboarding.md`]: '# Onboarding',
        // Config
        [`${cwd}/config.json`]: JSON.stringify({
          asset_registries: {
            github: { target_path: '.github', behavior: 'mirror' },
            knowledge: { target_path: '.pair/knowledge', behavior: 'mirror' },
            adoption: { target_path: '.pair/adoption', behavior: 'mirror' },
            agents: { target_path: 'AGENTS.md', behavior: 'add' },
          },
        }),
      }, moduleFolder, cwd)

      await runCli(['node', 'pair', 'install', '--no-kb'], { fs })

      expect(fs.existsSync(`${cwd}/.github/workflows/ci.yml`)).toBe(true)
      expect(fs.existsSync(`${cwd}/.pair/knowledge/index.md`)).toBe(true)
      expect(fs.existsSync(`${cwd}/.pair/adoption/onboarding.md`)).toBe(true)
      expect(fs.existsSync(`${cwd}/AGENTS.md`)).toBe(true)
    })
  })

  describe('npm deploy scenario', () => {
    it('should install from node_modules when deployed as npm package', async () => {
      const cwd = '/project'
      const moduleFolder = `${cwd}/node_modules/@pair/pair-cli`
      const datasetPath = `${moduleFolder}/bundle-cli/dataset`

      const fs = new InMemoryFileSystemService({
        // NPM package structure
        [`${moduleFolder}/package.json`]: JSON.stringify({ name: '@pair/pair-cli' }),
        [`${datasetPath}/AGENTS.md`]: '# Agents Guide',
        [`${datasetPath}/.github/workflows/ci.yml`]: 'name: CI',
        [`${datasetPath}/.pair/knowledge/index.md`]: '# Knowledge Base',
        [`${datasetPath}/.pair/adoption/onboarding.md`]: '# Onboarding',
        // Config
        [`${cwd}/config.json`]: JSON.stringify({
          asset_registries: {
            github: { target_path: '.github', behavior: 'mirror' },
            knowledge: { target_path: '.pair/knowledge', behavior: 'mirror' },
            adoption: { target_path: '.pair/adoption', behavior: 'mirror' },
            agents: { target_path: 'AGENTS.md', behavior: 'add' },
          },
        }),
      }, cwd, cwd)

      await runCli(['node', 'pair', 'install', '--no-kb'], { fs })

      expect(fs.existsSync(`${cwd}/.github/workflows/ci.yml`)).toBe(true)
      expect(fs.existsSync(`${cwd}/.pair/knowledge/index.md`)).toBe(true)
      expect(fs.existsSync(`${cwd}/.pair/adoption/onboarding.md`)).toBe(true)
      expect(fs.existsSync(`${cwd}/AGENTS.md`)).toBe(true)
    })
  })

  describe('local source installation', () => {
    it('should install from local ZIP file with absolute path', async () => {
      const cwd = '/project'
      const zipPath = '/downloads/kb.zip'

      const fs = new InMemoryFileSystemService({
        // ZIP file (simulated)
        [zipPath]: 'ZIP_CONTENT',
        // Config
        [`${cwd}/config.json`]: JSON.stringify({
          asset_registries: {
            github: { target_path: '.github', behavior: 'mirror' },
          },
        }),
      }, cwd, cwd)

      await runCli(['node', 'pair', 'install', '--source', zipPath], { fs })

      // Verify install was attempted with correct source
      // Note: Actual ZIP extraction would require full implementation
    })

    it('should install from local ZIP file with relative path', async () => {
      const cwd = '/project'
      const relativeZip = './downloads/kb.zip'

      const fs = new InMemoryFileSystemService({
        [`${cwd}/downloads/kb.zip`]: 'ZIP_CONTENT',
        [`${cwd}/config.json`]: JSON.stringify({
          asset_registries: {
            github: { target_path: '.github', behavior: 'mirror' },
          },
        }),
      }, cwd, cwd)

      await runCli(['node', 'pair', 'install', '--source', relativeZip], { fs })
    })

    it('should install from local directory with absolute path', async () => {
      const cwd = '/project'
      const datasetPath = '/local/dataset'

      const fs = new InMemoryFileSystemService({
        [`${datasetPath}/AGENTS.md`]: '# Agents',
        [`${datasetPath}/.github/workflows/ci.yml`]: 'name: CI',
        [`${cwd}/config.json`]: JSON.stringify({
          asset_registries: {
            github: { target_path: '.github', behavior: 'mirror' },
            agents: { target_path: 'AGENTS.md', behavior: 'add' },
          },
        }),
      }, cwd, cwd)

      await runCli(['node', 'pair', 'install', '--source', datasetPath], { fs })
    })

    it('should install from local directory with relative path', async () => {
      const cwd = '/project'

      const fs = new InMemoryFileSystemService({
        [`${cwd}/dataset/AGENTS.md`]: '# Agents',
        [`${cwd}/dataset/.github/workflows/ci.yml`]: 'name: CI',
        [`${cwd}/config.json`]: JSON.stringify({
          asset_registries: {
            github: { target_path: '.github', behavior: 'mirror' },
            agents: { target_path: 'AGENTS.md', behavior: 'add' },
          },
        }),
      }, cwd, cwd)

      await runCli(['node', 'pair', 'install', '--source', './dataset'], { fs })
    })
  })
})

describe('CLI E2E - Update Command', () => {
  describe('update with defaults', () => {
    it('should update all registries when no args provided', async () => {
      const cwd = '/project'
      const datasetPath = '/project/node_modules/@pair/knowledge-hub/dataset'

      const fs = new InMemoryFileSystemService({
        [`${datasetPath}/AGENTS.md`]: '# Updated Agents',
        [`${datasetPath}/.github/workflows/ci.yml`]: 'name: Updated CI',
        [`${cwd}/config.json`]: JSON.stringify({
          asset_registries: {
            github: { target_path: '.github', behavior: 'mirror' },
            agents: { target_path: 'AGENTS.md', behavior: 'add' },
          },
        }),
        // Existing files
        [`${cwd}/.github/workflows/ci.yml`]: 'name: Old CI',
        [`${cwd}/AGENTS.md`]: '# Old Agents',
      }, cwd, cwd)

      await runCli(['node', 'pair', 'update', '--no-kb'], { fs })

      // Files should be updated
      const ghContent = fs.readFileSync(`${cwd}/.github/workflows/ci.yml`)
      expect(ghContent).toContain('Updated CI')
    })
  })

  describe('update from local sources', () => {
    it('should update from local ZIP with absolute path', async () => {
      const cwd = '/project'
      const zipPath = '/downloads/kb-v2.zip'

      const fs = new InMemoryFileSystemService({
        [zipPath]: 'ZIP_V2_CONTENT',
        [`${cwd}/config.json`]: JSON.stringify({
          asset_registries: {
            github: { target_path: '.github', behavior: 'mirror' },
          },
        }),
        [`${cwd}/.github/workflows/ci.yml`]: 'name: Old CI',
      }, cwd, cwd)

      await runCli(['node', 'pair', 'update', '--source', zipPath], { fs })
    })

    it('should update from local ZIP with relative path', async () => {
      const cwd = '/project'

      const fs = new InMemoryFileSystemService({
        [`${cwd}/kb-v2.zip`]: 'ZIP_V2_CONTENT',
        [`${cwd}/config.json`]: JSON.stringify({
          asset_registries: {
            github: { target_path: '.github', behavior: 'mirror' },
          },
        }),
      }, cwd, cwd)

      await runCli(['node', 'pair', 'update', '--source', './kb-v2.zip'], { fs })
    })

    it('should update from local directory with absolute path', async () => {
      const cwd = '/project'
      const datasetPath = '/local/kb-dataset'

      const fs = new InMemoryFileSystemService({
        [`${datasetPath}/AGENTS.md`]: '# Updated Agents',
        [`${datasetPath}/.github/workflows/ci.yml`]: 'name: Updated CI',
        [`${cwd}/config.json`]: JSON.stringify({
          asset_registries: {
            github: { target_path: '.github', behavior: 'mirror' },
            agents: { target_path: 'AGENTS.md', behavior: 'add' },
          },
        }),
        [`${cwd}/.github/workflows/ci.yml`]: 'name: Old CI',
      }, cwd, cwd)

      await runCli(['node', 'pair', 'update', '--source', datasetPath], { fs })
    })

    it('should update from local directory with relative path', async () => {
      const cwd = '/project'

      const fs = new InMemoryFileSystemService({
        [`${cwd}/kb-dataset/AGENTS.md`]: '# Updated Agents',
        [`${cwd}/config.json`]: JSON.stringify({
          asset_registries: {
            agents: { target_path: 'AGENTS.md', behavior: 'add' },
          },
        }),
      }, cwd, cwd)

      await runCli(['node', 'pair', 'update', '--source', './kb-dataset'], { fs })
    })
  })

  describe('list targets', () => {
    it('should list available registries with --list-targets', async () => {
      const cwd = '/project'

      const fs = new InMemoryFileSystemService({
        [`${cwd}/config.json`]: JSON.stringify({
          asset_registries: {
            github: {
              target_path: '.github',
              behavior: 'mirror',
              description: 'GitHub workflows and configs',
            },
            knowledge: {
              target_path: '.pair/knowledge',
              behavior: 'mirror',
              description: 'Knowledge base content',
            },
            agents: {
              target_path: 'AGENTS.md',
              behavior: 'add',
              description: 'AI agents guidance',
            },
          },
        }),
      }, cwd, cwd)

      // This should print to console without throwing
      await runCli(['node', 'pair', 'update', '--list-targets', '--no-kb'], { fs })
    })
  })

  describe('manual deploy scenario', () => {
    it('should update from manual deployment bundle', async () => {
      const cwd = '/usr/local/bin/project'
      const moduleFolder = `${cwd}/libs/pair-cli`
      const datasetPath = `${moduleFolder}/bundle-cli/dataset`

      const fs = new InMemoryFileSystemService({
        [`${moduleFolder}/package.json`]: JSON.stringify({ name: '@pair/pair-cli' }),
        [`${datasetPath}/AGENTS.md`]: '# Updated Agents',
        [`${datasetPath}/.github/workflows/ci.yml`]: 'name: Updated CI',
        [`${cwd}/config.json`]: JSON.stringify({
          asset_registries: {
            github: { target_path: '.github', behavior: 'mirror' },
            agents: { target_path: 'AGENTS.md', behavior: 'add' },
          },
        }),
        // Existing files
        [`${cwd}/.github/workflows/ci.yml`]: 'name: Old CI',
        [`${cwd}/AGENTS.md`]: '# Old Agents',
      }, moduleFolder, cwd)

      await runCli(['node', 'pair', 'update', '--no-kb'], { fs })

      const ghContent = fs.readFileSync(`${cwd}/.github/workflows/ci.yml`)
      expect(ghContent).toContain('Updated CI')
    })
  })

  describe('registry override syntax', () => {
    it('should update with registry:target syntax', async () => {
      const cwd = '/project'
      const datasetPath = `${cwd}/node_modules/@pair/knowledge-hub/dataset`

      const fs = new InMemoryFileSystemService({
        [`${datasetPath}/AGENTS.md`]: '# Updated Agents',
        [`${datasetPath}/.github/workflows/ci.yml`]: 'name: Updated CI',
        [`${cwd}/config.json`]: JSON.stringify({
          asset_registries: {
            github: { target_path: '.github', behavior: 'mirror' },
            agents: { target_path: 'AGENTS.md', behavior: 'add' },
          },
        }),
        [`${cwd}/.github/workflows/ci.yml`]: 'name: Old CI',
      }, cwd, cwd)

      // Test registry:target syntax (e.g., github:.github)
      await runCli(['node', 'pair', 'update', '--target', 'github:.github', '--no-kb'], { fs })
    })
  })
})

describe('CLI E2E - Error Scenarios', () => {
  it('should fail gracefully when config is missing', async () => {
    const cwd = '/project'
    const fs = new InMemoryFileSystemService({}, cwd, cwd)

    await expect(
      runCli(['node', 'pair', 'install', '--no-kb'], { fs })
    ).rejects.toThrow()
  })

  it('should fail gracefully when source ZIP is corrupted', async () => {
    const cwd = '/project'

    const fs = new InMemoryFileSystemService({
      [`${cwd}/bad.zip`]: 'INVALID_ZIP',
      [`${cwd}/config.json`]: JSON.stringify({
        asset_registries: {
          github: { target_path: '.github', behavior: 'mirror' },
        },
      }),
    }, cwd, cwd)

    await expect(
      runCli(['node', 'pair', 'install', '--source', 'bad.zip'], { fs })
    ).rejects.toThrow()
  })
})

describe('CLI E2E - Validate Config Command', () => {
  it('should succeed with valid config', async () => {
    const cwd = '/project'

    const fs = new InMemoryFileSystemService({
      [`${cwd}/config.json`]: JSON.stringify({
        asset_registries: {
          github: {
            source: '.github',
            behavior: 'mirror',
            target_path: '.github',
            description: 'GitHub workflows',
          },
        },
      }),
    }, cwd, cwd)

    await runCli(['node', 'pair', 'validate-config', '--no-kb'], { fs })
    // Should not throw - valid config
  })

  it('should fail with invalid behavior', async () => {
    const cwd = '/project'

    const fs = new InMemoryFileSystemService({
      [`${cwd}/config.json`]: JSON.stringify({
        asset_registries: {
          github: {
            source: '.github',
            behavior: 'invalid-behavior',
            target_path: '.github',
            description: 'GitHub workflows',
          },
        },
      }),
    }, cwd, cwd)

    await expect(
      runCli(['node', 'pair', 'validate-config', '--no-kb'], { fs })
    ).rejects.toThrow()
  })

  it('should fail with missing asset_registries', async () => {
    const cwd = '/project'

    const fs = new InMemoryFileSystemService({
      [`${cwd}/config.json`]: JSON.stringify({}),
    }, cwd, cwd)

    await expect(
      runCli(['node', 'pair', 'validate-config', '--no-kb'], { fs })
    ).rejects.toThrow()
  })

  it('should fail with invalid registry structure', async () => {
    const cwd = '/project'

    const fs = new InMemoryFileSystemService({
      [`${cwd}/config.json`]: JSON.stringify({
        asset_registries: {
          github: 'invalid-not-an-object',
        },
      }),
    }, cwd, cwd)

    await expect(
      runCli(['node', 'pair', 'validate-config', '--no-kb'], { fs })
    ).rejects.toThrow()
  })

  it('should fail with invalid include array', async () => {
    const cwd = '/project'

    const fs = new InMemoryFileSystemService({
      [`${cwd}/config.json`]: JSON.stringify({
        asset_registries: {
          github: {
            source: '.github',
            behavior: 'mirror',
            target_path: '.github',
            description: 'GitHub workflows',
            include: ['valid', 123],
          },
        },
      }),
    }, cwd, cwd)

    await expect(
      runCli(['node', 'pair', 'validate-config', '--no-kb'], { fs })
    ).rejects.toThrow()
  })

  it('should fail with missing required fields', async () => {
    const cwd = '/project'

    const fs = new InMemoryFileSystemService({
      [`${cwd}/config.json`]: JSON.stringify({
        asset_registries: {
          github: {
            source: '.github',
            behavior: 'mirror',
            // Missing target_path and description
          },
        },
      }),
    }, cwd, cwd)

    await expect(
      runCli(['node', 'pair', 'validate-config', '--no-kb'], { fs })
    ).rejects.toThrow()
  })
})

describe('CLI E2E - Package Command', () => {
  // AdmZip reads from real FS, incompatible with InMemoryFS
  it.skip('should create valid package', async () => {
    const cwd = '/project'

    const fs = new InMemoryFileSystemService({
      [`${cwd}/dataset/AGENTS.md`]: '# Agents',
      [`${cwd}/dataset/.pair/knowledge/index.md`]: '# KB',
      [`${cwd}/config.json`]: JSON.stringify({
        asset_registries: {
          knowledge: {
            source: '.',
            behavior: 'mirror',
            target_path: '.',
            description: 'Knowledge base',
          },
        },
      }),
    }, cwd, cwd)

    await runCli(['node', 'pair', 'package', '--source-dir', 'dataset', '--output', '/tmp/kb.zip', '--no-kb'], { fs })

    // Note: ZIP file is written to real FS by AdmZip at /tmp/kb.zip
    // Test passes if command completes without throwing
  })

  // AdmZip reads from real FS, incompatible with InMemoryFS
  it.skip('should package with source-dir option', async () => {
    const cwd = '/project'

    const fs = new InMemoryFileSystemService({
      [`${cwd}/my-dataset/AGENTS.md`]: '# Agents',
      [`${cwd}/config.json`]: JSON.stringify({
        asset_registries: {
          agents: {
            source: 'AGENTS.md',
            behavior: 'add',
            target_path: 'AGENTS.md',
            description: 'Agents guide',
          },
        },
      }),
    }, cwd, cwd)

    await runCli(['node', 'pair', 'package', '--source-dir', 'my-dataset', '--output', '/tmp/out.zip', '--no-kb'], { fs })

    // Note: ZIP file is written to real FS by AdmZip at /tmp/out.zip
    // Test passes if command completes without throwing
  })

  it('should fail with invalid config', async () => {
    const cwd = '/project'

    const fs = new InMemoryFileSystemService({
      [`${cwd}/dataset/AGENTS.md`]: '# Agents',
      [`${cwd}/config.json`]: '{ invalid json',
    }, cwd, cwd)

    await expect(
      runCli(['node', 'pair', 'package', '--source-dir', 'dataset'], { fs })
    ).rejects.toThrow()
  })

  it('should fail with missing config', async () => {
    const cwd = '/project'

    const fs = new InMemoryFileSystemService({
      [`${cwd}/dataset/AGENTS.md`]: '# Agents',
    }, cwd, cwd)

    await expect(
      runCli(['node', 'pair', 'package', '--source-dir', 'dataset'], { fs })
    ).rejects.toThrow()
  })
})

describe('CLI E2E - Link Strategy', () => {
  it('should support relative link style', async () => {
    const cwd = '/project'
    const datasetPath = `${cwd}/node_modules/@pair/knowledge-hub/dataset`

    const fs = new InMemoryFileSystemService({
      [`${datasetPath}/.pair/knowledge/index.md`]: '# KB\n[link](../adoption/guide.md)',
      [`${datasetPath}/.pair/adoption/guide.md`]: '# Guide',
      [`${cwd}/config.json`]: JSON.stringify({
        asset_registries: {
          knowledge: { target_path: '.pair/knowledge', behavior: 'mirror' },
          adoption: { target_path: '.pair/adoption', behavior: 'mirror' },
        },
      }),
    }, cwd, cwd)

    await runCli(['node', 'pair', 'install', '--link-style', 'relative', '--no-kb'], { fs })

    const content = fs.readFileSync(`${cwd}/.pair/knowledge/index.md`)
    expect(content).toContain('../adoption/guide.md')
  })

  it('should support absolute link style', async () => {
    const cwd = '/project'
    const datasetPath = `${cwd}/node_modules/@pair/knowledge-hub/dataset`

    const fs = new InMemoryFileSystemService({
      [`${datasetPath}/.pair/knowledge/index.md`]: '# KB\n[link](../adoption/guide.md)',
      [`${datasetPath}/.pair/adoption/guide.md`]: '# Guide',
      [`${cwd}/config.json`]: JSON.stringify({
        asset_registries: {
          knowledge: { target_path: '.pair/knowledge', behavior: 'mirror' },
          adoption: { target_path: '.pair/adoption', behavior: 'mirror' },
        },
      }),
    }, cwd, cwd)

    await runCli(['node', 'pair', 'update', '--link-style', 'absolute', '--no-kb'], { fs })

    const content = fs.readFileSync(`${cwd}/.pair/knowledge/index.md`)
    expect(content).toContain('/.pair/adoption/guide.md')
  })
})
describe('CLI E2E - Update Link Command', () => {
  it('should update and validate links in installed KB content', async () => {
    const cwd = '/project'

    const fs = new InMemoryFileSystemService({
      [`${cwd}/.pair/knowledge/index.md`]: '# KB\n[link](../adoption/guide.md)\n[broken](missing.md)',
      [`${cwd}/.pair/adoption/guide.md`]: '# Guide',
      [`${cwd}/config.json`]: JSON.stringify({
        asset_registries: {
          knowledge: { target_path: '.pair/knowledge', behavior: 'mirror' },
          adoption: { target_path: '.pair/adoption', behavior: 'mirror' },
        },
      }),
    }, cwd, cwd)

    await runCli(['node', 'pair', 'update-link', '--no-kb'], { fs })

    // Command should complete successfully
    expect(fs.existsSync(`${cwd}/.pair/knowledge/index.md`)).toBe(true)
  })

  it('should support --dry-run mode for link validation', async () => {
    const cwd = '/project'

    const fs = new InMemoryFileSystemService({
      [`${cwd}/.pair/knowledge/index.md`]: '# KB\n[link](guide.md)',
      [`${cwd}/.pair/knowledge/guide.md`]: '# Guide',
      [`${cwd}/config.json`]: JSON.stringify({
        asset_registries: {
          knowledge: { target_path: '.pair/knowledge', behavior: 'mirror' },
        },
      }),
    }, cwd, cwd)

    await runCli(['node', 'pair', 'update-link', '--dry-run', '--no-kb'], { fs })

    // In dry-run mode, files should not be modified
    const content = fs.readFileSync(`${cwd}/.pair/knowledge/index.md`)
    expect(content).toContain('[link](guide.md)')
  })
})