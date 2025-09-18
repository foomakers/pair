import { describe, it, expect } from 'vitest'
import { execSync } from 'child_process'
import { join } from 'path'
import { readFileSync } from 'fs'
import { getKnowledgeHubDatasetPath } from './config-utils'

const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'))

describe('pair-cli basics', () => {
  it.skip('should print the correct version with --version', () => {
    const cliPath = join(__dirname, 'cli.ts')
    const tsNodePath = join(__dirname, '..', 'node_modules', '.bin', 'ts-node')
    const output = execSync(`${tsNodePath} ${cliPath} --version`).toString().trim()
    expect(output).toContain(pkg.version)
  })

  it.skip('help output does not mention --dry-run or --verbose', () => {
    const cliPath = join(__dirname, 'cli.ts')
    const tsNodePath = join(__dirname, '..', 'node_modules', '.bin', 'ts-node')
    const output = execSync(`${tsNodePath} ${cliPath} --help`).toString()
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
