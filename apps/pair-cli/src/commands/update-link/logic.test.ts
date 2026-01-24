import { describe, it, expect, vi } from 'vitest'
import { createTestFs } from '../../test-utils/test-helpers'
import { applyLinkTransformation } from './logic'
import * as handler from './handler'

describe('applyLinkTransformation', () => {
  const cwd = '/test'

  it('skips when no linkStyle is provided', async () => {
    const fs = createTestFs({}, {}, cwd)
    const pushLog = vi.fn()
    const spy = vi.spyOn(handler, 'handleUpdateLinkCommand')

    await applyLinkTransformation(fs, {}, pushLog, 'install')
    expect(spy).not.toHaveBeenCalled()
  })

  it('calls handleUpdateLinkCommand with correct style', async () => {
    const fs = createTestFs({}, { [`${cwd}/.pair/f.md`]: '[]()' }, cwd)
    const pushLog = vi.fn()
    const spy = vi.spyOn(handler, 'handleUpdateLinkCommand').mockResolvedValue(undefined)

    await applyLinkTransformation(fs, { linkStyle: 'absolute' }, pushLog, 'install')
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ absolute: true }), fs)

    await applyLinkTransformation(fs, { linkStyle: 'relative' }, pushLog, 'install')
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ absolute: false }), fs)
  })

  it('auto-detects style for update mode', async () => {
    const fs = createTestFs({}, { [`${cwd}/.pair/f.md`]: '[a](/abs)' }, cwd)
    const pushLog = vi.fn()
    const spy = vi.spyOn(handler, 'handleUpdateLinkCommand').mockResolvedValue(undefined)

    await applyLinkTransformation(fs, { linkStyle: 'auto' }, pushLog, 'update')
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ absolute: true }), fs)
  })
})
