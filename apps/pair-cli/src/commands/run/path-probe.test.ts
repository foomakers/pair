import { describe, it, expect } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { createExecutableProbe, resolveEngineBinary } from './path-probe'

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

/**
 * US-487 AC13 — `pi` ships in the repository's own `node_modules/.bin`, which is on PATH inside a
 * package script and nowhere else: without this cascade `pair-cli run --card N --engine pi`, typed
 * in a plain shell, could not find an engine that was installed all along.
 */
describe('resolveEngineBinary', () => {
  const resolveOver = (files: string[], onPath: string[], declaredBin?: Record<string, string>) =>
    resolveEngineBinary({
      id: 'pi',
      command: 'pi',
      fs: new InMemoryFileSystemService(
        Object.fromEntries(files.map(file => [file, ''])),
        '/repo',
        '/repo',
      ),
      repoRoot: '/repo',
      declaredBin,
      probe: command => onPath.includes(command),
    })

  it('a declared `engine.bin` that exists wins over PATH and the repo', () => {
    expect(
      resolveOver(['/opt/pi', '/repo/node_modules/.bin/pi'], ['pi'], { pi: '/opt/pi' }),
    ).toEqual({ command: '/opt/pi', from: 'config' })
  })

  it('a declared path that does not exist is not trusted: PATH answers next', () => {
    expect(resolveOver([], ['pi'], { pi: '/nowhere/pi' })).toEqual({ command: 'pi', from: 'path' })
  })

  it("falls back to the repository's own node_modules/.bin when PATH has no pi", () => {
    expect(resolveOver(['/repo/node_modules/.bin/pi'], [])).toEqual({
      command: '/repo/node_modules/.bin/pi',
      from: 'repo-bin',
    })
  })

  it('found nowhere is undefined, never a guessed command', () => {
    expect(resolveOver([], [])).toBeUndefined()
  })
})

/**
 * STATIC-G1 (a0 repair) — the engine-binary cascade under an INJECTED platform: the product path
 * handling this story changed (`resolveEngineBinary` over `createExecutableProbe`) must mean the
 * same thing on both POSIX platforms CI runs the smoke suite on, whatever the host running the test.
 */
describe('resolveEngineBinary over the real PATH probe, per injected platform', () => {
  for (const platform of ['darwin', 'linux'] as const) {
    const cascade = (
      files: string[],
      env: NodeJS.ProcessEnv,
      declaredBin?: Record<string, string>,
    ) => {
      const fs = new InMemoryFileSystemService(
        Object.fromEntries(files.map(file => [file, ''])),
        '/repo',
        '/repo',
      )
      return resolveEngineBinary({
        id: 'pi',
        command: 'pi',
        fs,
        repoRoot: '/repo',
        declaredBin,
        probe: createExecutableProbe(fs, env, platform),
      })
    }

    it(`platform ${platform}: a ':'-separated PATH entry holding pi answers 'path'`, () => {
      expect(cascade(['/usr/local/bin/pi'], { PATH: '/usr/bin:/usr/local/bin' })).toEqual({
        command: 'pi',
        from: 'path',
      })
    })

    it(`platform ${platform}: no pi on PATH falls back to <repo>/node_modules/.bin/pi`, () => {
      expect(cascade(['/repo/node_modules/.bin/pi'], { PATH: '/usr/bin:/bin' })).toEqual({
        command: '/repo/node_modules/.bin/pi',
        from: 'repo-bin',
      })
    })

    it(`platform ${platform}: a ';'-joined PATH is ONE directory, never split (a Windows separator means nothing here)`, () => {
      expect(cascade(['/tools/pi'], { PATH: '/other;/tools' })).toBeUndefined()
    })

    it(`platform ${platform}: a declared engine.bin that exists wins over PATH and the repo`, () => {
      expect(
        cascade(
          ['/opt/pi', '/usr/bin/pi', '/repo/node_modules/.bin/pi'],
          { PATH: '/usr/bin' },
          {
            pi: '/opt/pi',
          },
        ),
      ).toEqual({ command: '/opt/pi', from: 'config' })
    })
  }
})
