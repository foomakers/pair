import { describe, expect, it } from 'vitest'

import { runGuard } from './direct-fs-guard'

// r1-g1-gap1: every direct-fs import in the tracked tree (sealed tests included) has a registry row.
describe('direct-fs registry covers the real repository', () => {
  it('lists every direct fs import of the tracked tree', () => {
    expect(runGuard()).toEqual([])
  })
})
