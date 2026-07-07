import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const AGENTS_MD = readFileSync(join(__dirname, '../dataset/AGENTS.md'), 'utf-8')

describe('dataset AGENTS.md paths', () => {
  it('does not reference the legacy adopted/knowledge-base scheme', () => {
    expect(AGENTS_MD).not.toMatch(/\.pair\/tech\/adopted/)
    expect(AGENTS_MD).not.toMatch(/\.pair\/product\/adopted/)
    expect(AGENTS_MD).not.toMatch(/\.pair\/tech\/knowledge-base/)
    expect(AGENTS_MD).not.toMatch(/\.pair\/how-to\/index\.json/)
  })
})
