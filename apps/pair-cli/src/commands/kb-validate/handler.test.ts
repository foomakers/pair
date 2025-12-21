import { describe, it, expect } from 'vitest'
import { handleKbValidateCommand } from './handler'
import { InMemoryFileSystemService } from '@pair/content-ops/test-utils/in-memory-fs'

describe('handleKbValidateCommand', () => {
  it('should validate KB at current directory by default', async () => {
    const cwd = '/project'
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/.pair/knowledge/index.md`]: '# KB',
      },
      cwd,
      cwd,
    )

    await expect(handleKbValidateCommand({ command: 'kb-validate' }, fs)).resolves.toBeUndefined()
  })

  it('should validate KB at specified path', async () => {
    const cwd = '/project'
    const kbPath = '/custom/kb'
    const fs = new InMemoryFileSystemService(
      {
        [`${kbPath}/.pair/knowledge/index.md`]: '# KB',
      },
      cwd,
      cwd,
    )

    await expect(
      handleKbValidateCommand({ command: 'kb-validate', path: kbPath }, fs),
    ).resolves.toBeUndefined()
  })

  it('should throw error when .pair directory missing', async () => {
    const cwd = '/project'
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/README.md`]: '# Project',
      },
      cwd,
      cwd,
    )

    await expect(handleKbValidateCommand({ command: 'kb-validate' }, fs)).rejects.toThrow(
      'missing .pair directory',
    )
  })

  it('should throw error when .pair directory missing at custom path', async () => {
    const cwd = '/project'
    const kbPath = '/invalid/kb'
    const fs = new InMemoryFileSystemService({}, cwd, cwd)

    await expect(
      handleKbValidateCommand({ command: 'kb-validate', path: kbPath }, fs),
    ).rejects.toThrow('missing .pair directory')
  })
})
