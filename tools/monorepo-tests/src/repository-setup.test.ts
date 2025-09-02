import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '../../../')

// Helper to check file existence
const exists = (file: string) => fs.existsSync(path.join(root, file))

// Helper to read file content
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Repository Setup: Initial Codebase and Test Configuration', () => {
  it('should have a package.json at the root', () => {
    expect(exists('package.json')).toBe(true)
  })

  it('should have a pnpm-workspace.yaml at the root', () => {
    expect(exists('pnpm-workspace.yaml')).toBe(true)
  })

  it('should have a .gitignore at the root', () => {
    expect(exists('.gitignore')).toBe(true)
  })

  it('should have packages/ and tools/ directories', () => {
    expect(fs.existsSync(path.join(root, 'packages'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'tools'))).toBe(true)
  })

  it('should have a valid catalog in pnpm-workspace.yaml', () => {
    const content = read('pnpm-workspace.yaml')
    expect(content).toMatch(/catalog:/)
    expect(content).toMatch(/typescript:/)
    expect(content).toMatch(/vitest:/)
  })

  it('should not declare workspaces in package.json (only in pnpm-workspace.yaml)', () => {
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.workspaces).toBeUndefined()
  })

  it('should not declare devDependencies in package.json root (only catalog)', () => {
    const pkg = JSON.parse(read('package.json'))
    if (pkg.devDependencies) {
      const allowed = ['@pair/prettier-config', '@pair/eslint-config', 'husky', 'turbo']
      const keys = Object.keys(pkg.devDependencies)
      expect(keys.every(k => allowed.includes(k))).toBe(true)
    } else {
      expect(pkg.devDependencies).toBeUndefined()
    }
  })

  it('should have .gitignore with minimal rules', () => {
    const content = read('.gitignore')
    expect(content).toMatch(/node_modules\//)
  })
})
