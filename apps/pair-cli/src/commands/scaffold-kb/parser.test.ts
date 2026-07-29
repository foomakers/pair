import { describe, it, expect } from 'vitest'
import { parseScaffoldKbCommand } from './parser'

describe('parseScaffoldKbCommand', () => {
  it('defaults to the current directory, github host and no force', () => {
    expect(parseScaffoldKbCommand({})).toEqual({
      command: 'scaffold-kb',
      path: '.',
      host: 'github',
      force: false,
    })
  })

  it('takes the target directory from the positional argument', () => {
    expect(parseScaffoldKbCommand({}, ['../acme-kb']).path).toBe('../acme-kb')
  })

  it('keeps the explicit name and force flag', () => {
    expect(parseScaffoldKbCommand({ name: 'Acme KB', force: true })).toEqual({
      command: 'scaffold-kb',
      path: '.',
      host: 'github',
      force: true,
      name: 'Acme KB',
    })
  })

  it('accepts the generic host for non-GitHub code hosts', () => {
    expect(parseScaffoldKbCommand({ host: 'generic' }).host).toBe('generic')
  })

  it('rejects an unknown host', () => {
    expect(() => parseScaffoldKbCommand({ host: 'gitlab' })).toThrow(/host/i)
  })

  it('rejects more than one positional argument', () => {
    expect(() => parseScaffoldKbCommand({}, ['a', 'b'])).toThrow(/positional/i)
  })

  it('rejects a name that cannot be safely embedded in the generated artifacts', () => {
    expect(() => parseScaffoldKbCommand({ name: 'Acme\nfoo: bar' })).toThrow(
      /newlines or control characters/,
    )
  })
})
