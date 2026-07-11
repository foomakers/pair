import { InMemoryFileSystemService } from '@pair/content-ops/test-utils/in-memory-fs'

/**
 * Shared fixtures and helpers for the pair-cli e2e suites (split per command
 * from the former monolithic cli.e2e.test.ts). Each e2e file imports the
 * fixtures it needs from here.
 */

export function createNpmDeployFs(cwd: string): InMemoryFileSystemService {
  // Simulate npm install: pair-cli extracted to node_modules/@foomakers/pair-cli/
  // Dataset is NOT bundled — it is auto-downloaded to a KB cache path at runtime.
  // We simulate the cached KB path so tests can resolve the dataset without network.
  const seed: Record<string, string> = {}
  const moduleFolder = cwd + '/node_modules/@foomakers/pair-cli'
  const kbCachePath = cwd + '/.pair-kb-cache/0.1.1'

  // Dataset content in the KB cache location (simulates auto-download result)
  seed[kbCachePath + '/dataset/AGENTS.md'] = 'this is agents.md'
  seed[kbCachePath + '/dataset/.github/workflows/ci.yml'] = 'name: CI\non: push'
  seed[kbCachePath + '/dataset/.pair/knowledge/index.md'] = '# Knowledge Base'
  seed[kbCachePath + '/dataset/.pair/adoption/onboarding.md'] = '# Onboarding Guide'

  // Package.json for pair-cli (scoped package) — no bundle-cli/dataset
  seed[moduleFolder + '/package.json'] = JSON.stringify({
    name: '@foomakers/pair-cli',
    version: '0.1.1',
  })

  // Sample project package.json
  seed[cwd + '/package.json'] = JSON.stringify({
    name: 'pair-sample-project',
    version: '1.0.0',
    dependencies: {
      '@foomakers/pair-cli': 'file:../pkg/package',
    },
  })

  return new InMemoryFileSystemService(seed, moduleFolder, cwd)
}

export function createManualDeployFs(cwd: string): InMemoryFileSystemService {
  // Simulate manual installation: pair-cli binary standalone.
  // Dataset is NOT bundled — it is auto-downloaded to a KB cache path at runtime.
  const seed: Record<string, string> = {}
  const moduleFolder = cwd + '/libs/pair-cli'
  const kbCachePath = cwd + '/.pair-kb-cache/0.1.0'

  // Add package.json for @pair/pair-cli package — no bundle-cli/dataset
  seed[cwd + '/libs/pair-cli/package.json'] = JSON.stringify({
    name: '@pair/pair-cli',
    version: '0.1.0',
    description: 'Pair CLI manual installation',
  })

  // Dataset content in the KB cache location (simulates auto-download result)
  seed[kbCachePath + '/dataset/AGENTS.md'] = 'this is agents.md'
  seed[kbCachePath + '/dataset/.github/workflows/ci.yml'] = 'name: CI\non: push'
  seed[kbCachePath + '/dataset/.pair/knowledge/index.md'] = '# Knowledge Base'
  seed[kbCachePath + '/dataset/.pair/adoption/onboarding.md'] = '# Onboarding Guide'

  return new InMemoryFileSystemService(seed, moduleFolder, cwd)
}

export function createDevScenarioFs(cwd: string): InMemoryFileSystemService {
  // Simulate development scenario: pair-cli as regular node_modules dependency
  // Dataset is at node_modules/@pair/knowledge-hub/dataset/ (accessible from project root)
  const seed: Record<string, string> = {}

  // Dataset content in the @pair/knowledge-hub package location (project's node_modules)
  seed[cwd + '/node_modules/@pair/knowledge-hub/dataset/AGENTS.md'] = 'this is agents.md'
  seed[cwd + '/node_modules/@pair/knowledge-hub/dataset/.github/workflows/ci.yml'] =
    'name: CI\non: push'
  seed[cwd + '/node_modules/@pair/knowledge-hub/dataset/.pair/knowledge/index.md'] =
    '# Knowledge Base'
  seed[cwd + '/node_modules/@pair/knowledge-hub/dataset/.pair/adoption/onboarding.md'] =
    '# Onboarding Guide'

  // Package.json for @pair/knowledge-hub
  seed[cwd + '/node_modules/@pair/knowledge-hub/package.json'] = JSON.stringify({
    name: '@pair/knowledge-hub',
    version: '0.1.0',
  })

  // Package.json for pair-cli (regular dependency)
  seed[cwd + '/node_modules/pair-cli/package.json'] = JSON.stringify({
    name: 'pair-cli',
    version: '0.1.0',
  })

  // Sample project package.json
  seed[cwd + '/package.json'] = JSON.stringify({
    name: 'pair-cli',
    version: '1.0.0-wip',
    dependencies: {
      '@pair/knowledge-hub': 'catalog:*',
    },
  })

  return new InMemoryFileSystemService(seed, cwd, cwd)
}

export async function withTempConfig(
  fs: InMemoryFileSystemService,
  config: unknown,
  fn: () => Promise<void>,
): Promise<void> {
  const configPath = fs.rootModuleDirectory() + '/config.json'
  await fs.writeFile(configPath, JSON.stringify(config))
  try {
    await fn()
  } finally {
    // Cleanup if needed
  }
}

export function createTestConfig() {
  return {
    asset_registries: {
      '.github': {
        source: '.github',
        behavior: 'mirror',
        targets: [{ path: '.github', mode: 'canonical' }],
        description: 'GitHub workflows and configs',
      },
      '.pair-knowledge': {
        source: '.pair/knowledge',
        behavior: 'mirror',
        targets: [{ path: '.pair-knowledge', mode: 'canonical' }],
        description: 'Knowledge base content',
      },
      '.pair-adoption': {
        source: '.pair/adoption',
        behavior: 'mirror',
        targets: [{ path: '.pair-adoption', mode: 'canonical' }],
        description: 'Adoption and onboarding content',
      },
      'agents.md': {
        source: 'AGENTS.md',
        behavior: 'add',
        targets: [{ path: 'AGENTS.md', mode: 'canonical' }],
        description: 'AI agents guidance and session context',
      },
    },
  }
}

export function getDeploymentConfig(deployType: 'npm' | 'manual' | 'dev'): {
  cwd: string
  fs: InMemoryFileSystemService
} {
  const cwd =
    deployType === 'npm'
      ? '/.tmp/npm-test/sample-project'
      : deployType === 'manual'
        ? '/tmp/test-project'
        : '/dev/test-project'
  const fs =
    deployType === 'npm'
      ? createNpmDeployFs(cwd)
      : deployType === 'manual'
        ? createManualDeployFs(cwd)
        : createDevScenarioFs(cwd)
  return { cwd, fs }
}
