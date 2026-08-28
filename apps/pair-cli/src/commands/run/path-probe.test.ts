import { describe, it, expect } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { createExecutableProbe } from './path-probe'

function probeOver(files: string[], env: NodeJS.ProcessEnv, platform: string) {
  const fs = new InMemoryFileSystemService(
    Object.fromEntries(files.map(file => [file, ''])),
    '/repo',
    '/repo',
  )
  return createExecutableProbe(fs, env, platform)
}

describe('createExecutableProbe', () => {
  it('finds an executable on PATH', () => {
    const probe = probeOver(['/usr/local/bin/pi'], { PATH: '/bin:/usr/local/bin' }, 'darwin')

    expect(probe('pi')).toBe(true)
    expect(probe('opencode')).toBe(false)
  })

  it('reports false when PATH is empty', () => {
    expect(probeOver(['/usr/local/bin/pi'], {}, 'darwin')('pi')).toBe(false)
  })

  it('accepts an absolute command without consulting PATH', () => {
    const probe = probeOver(['/opt/tools/claude'], { PATH: '/bin' }, 'darwin')

    expect(probe('/opt/tools/claude')).toBe(true)
  })

  it('honours PATHEXT and the windows PATH separator', () => {
    // Seeded with the separator `path.join` produces on the host running the test: the probe's
    // job here is the `;` split and the extension suffix, not path-flavour translation.
    const probe = probeOver(
      ['/tools/claude.CMD'],
      { PATH: '/other;/tools', PATHEXT: '.EXE;.CMD' },
      'win32',
    )

    expect(probe('claude')).toBe(true)
  })
})
