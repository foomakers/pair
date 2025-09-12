import { describe, it, expect, vi } from 'vitest'
vi.mock('../config-utils', () => ({
  getKnowledgeHubConfig: vi.fn(() => ({
    asset_registries: {
      github: {
        source: '.github',
        behavior: 'mirror',
        include: ['/chatmodes', '/workflows'],
        target_path: '.github',
        description: 'GitHub workflows and configuration files',
      },
      knowledge: {
        source: '.pair',
        behavior: 'mirror',
        target_path: '.pair',
        description: 'Knowledge base and documentation',
      },
      adoption: {
        source: '.pair/product/adopted',
        behavior: 'add',
        target_path: '.pair/product/adopted',
        description: 'Adoption guides and onboarding materials',
      },
    },
  })),
  getKnowledgeHubDatasetPath: vi.fn(() => '/dataset'),
}))

import { execSync } from 'child_process'
import { join } from 'path'
import { readFileSync } from 'fs'
import { getKnowledgeHubDatasetPath } from './config-utils'

const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'))

describe('pair-cli basics', () => {
  it('should print the correct version with --version', () => {
    const cliPath = join(__dirname, 'cli.ts')
    const output = execSync(`ts-node ${cliPath} --version`).toString().trim()
    expect(output).toContain(pkg.version)
  })

  it('help output does not mention --dry-run or --verbose', () => {
    const cliPath = join(__dirname, 'cli.ts')
    const output = execSync(`ts-node ${cliPath} --help`).toString()
    expect(output).not.toContain('--dry-run')
    expect(output).not.toContain('--verbose')
  })

  it('returns knowledge-hub dataset path', () => {
    const p = getKnowledgeHubDatasetPath()
    expect(p).toContain('packages')
    expect(p).toContain('knowledge-hub')
    expect(p).toContain('dataset')
  })
})
// E2E tests were moved to `cli.e2e.test.ts` to separate integration smoke tests from unit tests
