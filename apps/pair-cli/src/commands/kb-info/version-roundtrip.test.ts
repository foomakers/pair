import { describe, test, expect, afterEach, vi } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleInstallCommand } from '../install/handler'
import { handleUpdateCommand } from '../update/handler'
import { handleKbInfoCommand } from './handler'

/**
 * #261 DoD round-trip (Quality Assurance checklist):
 *   install old fixture -> kb-info flags drift -> update -> kb-info clean
 *
 * This is the single end-to-end chain the story's DoD calls for. It shares one
 * in-memory filesystem across all three handlers so the recorded-version marker
 * (`.pair/.kb-version.json`) written by install/update is exactly what the later
 * kb-info version-check reads back — no mocked comparator inputs.
 */
describe('#261: install -> check(drift) -> update -> check(clean) round-trip', () => {
  const cwd = '/roundtrip-project'
  const kbPkg = `${cwd}/packages/knowledge-hub/package.json`
  const datasetFile = `${cwd}/packages/knowledge-hub/dataset/test-registry/file1.md`
  const marker = `${cwd}/.pair/.kb-version.json`

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function makeFs(): InMemoryFileSystemService {
    return new InMemoryFileSystemService(
      {
        [`${cwd}/package.json`]: JSON.stringify({ name: 'test', version: '0.1.0' }),
        [kbPkg]: JSON.stringify({ name: '@pair/knowledge-hub', version: '1.1.0' }),
        [`${cwd}/config.json`]: JSON.stringify({
          asset_registries: {
            'test-registry': {
              source: 'test-registry',
              behavior: 'mirror',
              targets: [{ path: '.pair/test-registry', mode: 'canonical' }],
              description: 'Test registry',
            },
          },
        }),
        [datasetFile]: '# Content v1',
      },
      cwd,
      cwd,
    )
  }

  function versionCheck(fs: InMemoryFileSystemService) {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    return handleKbInfoCommand({ command: 'kb-info', mode: 'version-check', json: true }, fs, {
      baseTarget: cwd,
    }).then(exitCode => {
      const output = logSpy.mock.calls.map(args => args.join(' ')).join('\n')
      logSpy.mockRestore()
      return { exitCode, result: JSON.parse(output) }
    })
  }

  test('drift is flagged after installing an older KB, then cleared by update', async () => {
    const fs = makeFs()

    // 1) install the old KB (1.1.0) -> records the installed marker
    await handleInstallCommand(
      { command: 'install', resolution: 'default', kb: true, offline: false },
      fs,
    )
    expect(JSON.parse(await fs.readFile(marker)).version).toBe('1.1.0')

    // 2) a newer KB (1.2.0) becomes available in the source -> check flags drift
    await fs.writeFile(kbPkg, JSON.stringify({ name: '@pair/knowledge-hub', version: '1.2.0' }))
    await fs.writeFile(datasetFile, '# Content v2')

    const drift = await versionCheck(fs)
    expect(drift.exitCode).toBe(0)
    expect(drift.result.status).toBe('drift')
    expect(drift.result.installed.version).toBe('1.1.0')
    expect(drift.result.current.version).toBe('1.2.0')
    expect(drift.result.migrationUrl).toContain('v1.1.0-to-v1.2.0')

    // 3) update applies the new KB -> re-records the marker
    await handleUpdateCommand(
      { command: 'update', resolution: 'default', kb: true, offline: false },
      fs,
    )
    expect(JSON.parse(await fs.readFile(marker)).version).toBe('1.2.0')

    // 4) check is now clean
    const clean = await versionCheck(fs)
    expect(clean.exitCode).toBe(0)
    expect(clean.result.status).toBe('up-to-date')
    expect(clean.result.installed.version).toBe('1.2.0')
    expect(clean.result.current.version).toBe('1.2.0')
  })
})
