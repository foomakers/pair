import { describe, it, expect } from 'vitest'
import { renderGitignore } from './gitignore'

describe('renderGitignore', () => {
  const content = renderGitignore()

  it('excludes packaging output', () => {
    expect(content).toMatch(/^dist\/$/m)
    expect(content).toMatch(/^\*\.zip$/m)
  })

  it('excludes credentials and environment files', () => {
    expect(content).toMatch(/^\.env$/m)
    expect(content).toMatch(/^\.env\.\*$/m)
    expect(content).toMatch(/^\*\.pem$/m)
    expect(content).toMatch(/^\.npmrc$/m)
  })
})
