import { describe, it, expect } from 'vitest'

describe('website source config', () => {
  it('source.config exports are importable', async () => {
    const mod = await import('../source.config')
    expect(mod.docs).toBeDefined()
    expect(mod.default).toBeDefined()
  })
})
