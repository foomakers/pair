import { describe, it } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops/test-utils/in-memory-fs'
import { handleUpdateCommand, parseUpdateCommand } from './commands'

describe('update from local sources', () => {
  describe('update from local ZIP', () => {
    it('updates from absolute path ZIP', async () => {
      const cwd = '/test-absolute-zip'
      const zipPath = 'dataset'

      // Create filesystem with extracted ZIP content (simulated as directory)
      const seed: Record<string, string> = {}
      // Pre-existing target (update scenario — project already installed)
      seed[`${cwd}/.github/old.yml`] = '# pre-existing'
      seed[`${cwd}/${zipPath}/AGENTS.md`] = 'this is agents.md'
      seed[`${cwd}/${zipPath}/.github/workflows/ci.yml`] = 'name: CI\non: push'
      seed[`${cwd}/${zipPath}/.pair/knowledge/index.md`] = '# Knowledge Base'
      seed[`${cwd}/${zipPath}/.pair/adoption/onboarding.md`] = '# Onboarding Guide'
      seed[`${cwd}/config.json`] = JSON.stringify({
        asset_registries: {
          github: {
            source: '.github',
            behavior: 'mirror',
            include: ['/agents', '/prompts'],
            targets: [{ path: '.github', mode: 'canonical' }],
            description: 'GitHub workflows and configuration files',
          },
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
            description: 'Knowledge base and documentation',
          },
          adoption: {
            source: '.pair/adoption',
            behavior: 'add',
            targets: [{ path: '.pair/adoption', mode: 'canonical' }],
            description: 'Adoption guides and onboarding materials',
          },
          agents: {
            source: 'AGENTS.md',
            behavior: 'add',
            targets: [{ path: 'AGENTS.md', mode: 'canonical' }],
            description: 'AI agents guidance and session context',
          },
        },
      })

      const fs = new InMemoryFileSystemService(seed, cwd, cwd)

      await handleUpdateCommand(parseUpdateCommand({ source: zipPath }), fs)
    })

    it('updates from relative path ZIP', async () => {
      const cwd = '/test-relative-zip'
      const zipPath = './dataset'

      const seed: Record<string, string> = {}
      // Pre-existing target (update scenario — project already installed)
      seed[`${cwd}/.github/old.yml`] = '# pre-existing'
      seed['/test-relative-zip/dataset/AGENTS.md'] = 'this is agents.md'
      seed['/test-relative-zip/dataset/.github/workflows/ci.yml'] = 'name: CI\non: push'
      seed['/test-relative-zip/dataset/.pair/knowledge/index.md'] = '# Knowledge Base'
      seed['/test-relative-zip/dataset/.pair/adoption/onboarding.md'] = '# Onboarding Guide'
      seed[`${cwd}/config.json`] = JSON.stringify({
        asset_registries: {
          github: {
            source: '.github',
            behavior: 'mirror',
            include: ['/agents', '/prompts'],
            targets: [{ path: '.github', mode: 'canonical' }],
            description: 'GitHub workflows and configuration files',
          },
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
            description: 'Knowledge base and documentation',
          },
          adoption: {
            source: '.pair/adoption',
            behavior: 'add',
            targets: [{ path: '.pair/adoption', mode: 'canonical' }],
            description: 'Adoption guides and onboarding materials',
          },
          agents: {
            source: 'AGENTS.md',
            behavior: 'add',
            targets: [{ path: 'AGENTS.md', mode: 'canonical' }],
            description: 'AI agents guidance and session context',
          },
        },
      })

      const fs = new InMemoryFileSystemService(seed, cwd, cwd)

      await handleUpdateCommand(parseUpdateCommand({ source: zipPath }), fs)
    })
  })

  describe('update from local directory', () => {
    it('updates from absolute path directory', async () => {
      const cwd = '/test-absolute-dir'
      const dirPath = 'dataset'

      const seed: Record<string, string> = {}
      // Pre-existing target (update scenario — project already installed)
      seed[`${cwd}/.github/old.yml`] = '# pre-existing'
      seed[`${cwd}/${dirPath}/AGENTS.md`] = 'this is agents.md'
      seed[`${cwd}/${dirPath}/.github/workflows/ci.yml`] = 'name: CI\non: push'
      seed[`${cwd}/${dirPath}/.pair/knowledge/index.md`] = '# Knowledge Base'
      seed[`${cwd}/${dirPath}/.pair/adoption/onboarding.md`] = '# Onboarding Guide'
      seed[`${cwd}/config.json`] = JSON.stringify({
        asset_registries: {
          github: {
            source: '.github',
            behavior: 'mirror',
            include: ['/agents', '/prompts'],
            targets: [{ path: '.github', mode: 'canonical' }],
            description: 'GitHub workflows and configuration files',
          },
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
            description: 'Knowledge base and documentation',
          },
          adoption: {
            source: '.pair/adoption',
            behavior: 'add',
            targets: [{ path: '.pair/adoption', mode: 'canonical' }],
            description: 'Adoption guides and onboarding materials',
          },
          agents: {
            source: 'AGENTS.md',
            behavior: 'add',
            targets: [{ path: 'AGENTS.md', mode: 'canonical' }],
            description: 'AI agents guidance and session context',
          },
        },
      })

      const fs = new InMemoryFileSystemService(seed, cwd, cwd)

      await handleUpdateCommand(parseUpdateCommand({ source: dirPath }), fs)
    })

    it('updates from relative path directory', async () => {
      const cwd = '/test-relative-dir'
      const dirPath = './dataset'

      const seed: Record<string, string> = {}
      // Pre-existing target (update scenario — project already installed)
      seed[`${cwd}/.github/old.yml`] = '# pre-existing'
      seed['/test-relative-dir/dataset/AGENTS.md'] = 'this is agents.md'
      seed['/test-relative-dir/dataset/.github/workflows/ci.yml'] = 'name: CI\non: push'
      seed['/test-relative-dir/dataset/.pair/knowledge/index.md'] = '# Knowledge Base'
      seed['/test-relative-dir/dataset/.pair/adoption/onboarding.md'] = '# Onboarding Guide'
      seed[`${cwd}/config.json`] = JSON.stringify({
        asset_registries: {
          github: {
            source: '.github',
            behavior: 'mirror',
            include: ['/agents', '/prompts'],
            targets: [{ path: '.github', mode: 'canonical' }],
            description: 'GitHub workflows and configuration files',
          },
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
            description: 'Knowledge base and documentation',
          },
          adoption: {
            source: '.pair/adoption',
            behavior: 'add',
            targets: [{ path: '.pair/adoption', mode: 'canonical' }],
            description: 'Adoption guides and onboarding materials',
          },
          agents: {
            source: 'AGENTS.md',
            behavior: 'add',
            targets: [{ path: 'AGENTS.md', mode: 'canonical' }],
            description: 'AI agents guidance and session context',
          },
        },
      })

      const fs = new InMemoryFileSystemService(seed, cwd, cwd)

      await handleUpdateCommand(parseUpdateCommand({ source: dirPath }), fs)
    })
  })
})
