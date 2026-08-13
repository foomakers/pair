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
  })

  // The policy was written when the pre-flight was UNREACHABLE (`if (thisCommand === prog)
  // return` is always true, because Commander passes the hooked command as the first
  // argument), so its exemption list was never exercised: two entries covered the two
  // commands someone happened to think of. Waking the hook up makes the list load-bearing —
  // every command not on it now resolves, and potentially downloads, a KB before running.
  //
  // Inverted to an ALLOW-list for that reason: a command added tomorrow must opt IN to the
  // network, rather than inherit it by not being remembered here.
  it('does NOT bootstrap for commands that only read local state', () => {
    for (const cmd of ['kb-info', 'kb-validate', 'kb-verify', 'validate-config', 'update-link'])
      expect(requiresKbBootstrap(cmd), `${cmd} must not trigger a KB download`).toBe(false)
  })

  it('does NOT bootstrap for an unknown or future command', () => {
    expect(requiresKbBootstrap('some-future-command')).toBe(false)
  })
})
