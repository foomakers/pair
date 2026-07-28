import { describe, it, expect } from 'vitest'
import { requiresKbBootstrap } from './bootstrap-policy'

describe('requiresKbBootstrap', () => {
  it('skips the KB bootstrap for commands that produce KB content instead of consuming it', () => {
    expect(requiresKbBootstrap('package')).toBe(false)
    expect(requiresKbBootstrap('scaffold-kb')).toBe(false)
  })

  it('bootstraps for KB-consuming commands', () => {
    expect(requiresKbBootstrap('install')).toBe(true)
    expect(requiresKbBootstrap('update')).toBe(true)
    expect(requiresKbBootstrap('kb-info')).toBe(true)
  })
})
