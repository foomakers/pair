import { describe, it, expect } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { createProjectTrustProbe } from './trust-probe'

const home = '/home/dev'
const store = '~/.pi/agent/trust.json'
const storePath = `${home}/.pi/agent/trust.json`

function probeWith(content?: string) {
  const fs = new InMemoryFileSystemService(
    content === undefined ? {} : { [storePath]: content },
    '/project',
    '/project',
  )
  return createProjectTrustProbe(fs, home)
}

describe('createProjectTrustProbe', () => {
  it('reports the recorded decision for the project path', () => {
    const probe = probeWith(JSON.stringify({ '/work/project': true }))

    expect(probe(store, '/work/project')).toBe(true)
  })

  it('honours an explicit distrust decision', () => {
    const probe = probeWith(JSON.stringify({ '/work/project': false }))

    expect(probe(store, '/work/project')).toBe(false)
  })

  it('uses the nearest ancestor entry, as the engine does', () => {
    const probe = probeWith(JSON.stringify({ '/work': true, '/work/project/nested': false }))

    expect(probe(store, '/work/project')).toBe(true)
    expect(probe(store, '/work/project/nested/deep')).toBe(false)
  })

  it('reports no decision when the store is absent', () => {
    expect(probeWith()(store, '/work/project')).toBeUndefined()
  })

  it('reports no decision when the store is unparseable or not a map (fail-safe)', () => {
    expect(probeWith('{not json')(store, '/work/project')).toBeUndefined()
    expect(probeWith('["/work/project"]')(store, '/work/project')).toBeUndefined()
  })

  it('reports no decision when the path is simply absent from the store', () => {
    const probe = probeWith(JSON.stringify({ '/elsewhere': true }))

    expect(probe(store, '/work/project')).toBeUndefined()
  })
})
