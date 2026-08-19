import { describe, it, expect, vi } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops/test-utils/in-memory-fs'
import {
  installCommand,
  handleInstallCommand,
  handleUpdateCommand,
  handleUpdateLinkCommand,
  handlePackageCommand,
  handleScaffoldKbCommand,
  handleKbInfoCommand,
} from './commands'

/**
 * pair-cli e2e suite.
 *
 * #199 test reorg: a per-test classification of the 7 files this suite replaces
 * (cli-errors, cli-install, cli-kb-validate, cli-link, cli-packaging, cli-update,
 * cli-validate-config .e2e.test.ts — 51 tests total) found only ONE test that is
 * genuinely e2e: it depends on a real hand-off of state between three independently
 * invoked commands (install → update → update-link) against the same disjoint
 * baseTarget. The other 50 were single-module tests wearing e2e clothing; duplicates
 * were deleted and genuine coverage gaps were moved to module-level unit tests. The
 * project default is one e2e file per application entry point — splitting is only
 * valid when production code is genuinely refactored into isolated modules with
 * corresponding true unit tests, which did not happen for the prior 7-file split.
 */
describe('pair-cli e2e', () => {
  describe('cross-command flows', () => {
    it('installs KB to a disjoint absolute path, then update and update-link correctly build on it', async () => {
      const projectRoot = '/test-project'
      const disjointTarget = '/opt/pair/kb'
      const kbSourceDir = '/mnt/external/kb-dataset'

      // 1. Setup Filesystem
      const seed: Record<string, string> = {
        // Configuration in the "project root"
        [`${projectRoot}/config.json`]: JSON.stringify({
          asset_registries: {
            knowledge: {
              source: '.pair/knowledge',
              behavior: 'mirror',
              targets: [{ path: 'knowledge', mode: 'canonical' }],
              description: 'Core knowledge',
            },
          },
        }),
        [`${projectRoot}/package.json`]: JSON.stringify({
          name: 'test-project',
          version: '1.0.0',
        }),
        // KB Source content in a disjoint directory
        [`${kbSourceDir}/AGENTS.md`]: '# KB source marker',
        [`${kbSourceDir}/knowledge/index.md`]: '# Knowledge Index',
        [`${kbSourceDir}/knowledge/guide.md`]: 'Follow the [Index](./index.md)',
      }

      const fs = new InMemoryFileSystemService(seed, projectRoot, projectRoot)

      // 2. Perform installation to disjoint target
      // pair install /opt/pair/kb --source /mnt/external/kb-dataset
      await installCommand(fs, ['--source', kbSourceDir], {
        baseTarget: disjointTarget,
        useDefaults: true,
      })

      // 3. Verify installation in disjoint target
      // The target path for the 'knowledge' registry should be /opt/pair/kb/knowledge
      const installedFile = `${disjointTarget}/knowledge/index.md`
      expect(fs.existsSync(installedFile)).toBe(true)
      expect(fs.readFileSync(installedFile)).toBe('# Knowledge Index')

      // 4. Test disjoint update
      // Add new file to source
      await fs.writeFile(`${kbSourceDir}/knowledge/new.md`, 'New content')

      // pair update /opt/pair/kb --source /mnt/external/kb-dataset
      await handleUpdateCommand(
        {
          command: 'update',
          resolution: 'local',
          path: kbSourceDir,
          kb: true,
          offline: true,
          target: disjointTarget,
        },
        fs,
      )

      expect(fs.existsSync(`${disjointTarget}/knowledge/new.md`)).toBe(true)

      // 5. Test disjoint update-link
      // pair update-link /opt/pair/kb
      await handleUpdateLinkCommand(
        {
          command: 'update-link',
          target: disjointTarget,
          dryRun: false,
          logLevel: 'debug',
        },
        fs,
      )

      // Verify rollback setup is working even in disjoint paths (implicitly tested by logic running)
      const installedGuide = `${disjointTarget}/knowledge/guide.md`
      expect(fs.existsSync(installedGuide)).toBe(true)
    })

    /**
     * #279 — external KB round-trip: scaffold-kb → author content → package → install.
     * Genuinely e2e: three independently invoked commands hand state to each other
     * (scaffold output is the package input; the package/scaffold registry declaration
     * is what install consumes), proving the scaffold needs no install special-casing.
     */
    it('scaffolds an external KB repo, packages it with pair package, and installs it into a separate project', async () => {
      const moduleDir = '/opt/pair-cli'
      const kbRepo = '/work/acme-kb'
      const consumer = '/work/consumer'
      const fs = new InMemoryFileSystemService({}, moduleDir, kbRepo)

      // 1. Scaffold the KB repo in place
      await handleScaffoldKbCommand(
        { command: 'scaffold-kb', path: '.', host: 'github', force: false },
        fs,
      )
      expect(fs.existsSync(`${kbRepo}/pair.config.json`)).toBe(true)

      // 2. The maintainer authors real KB content + one skill
      await fs.writeFile(`${kbRepo}/.pair/knowledge/guidelines/testing.md`, '# Acme testing\n')
      await fs.writeFile(
        `${kbRepo}/.skills/acme-review/SKILL.md`,
        '---\nname: acme-review\ndescription: Acme review skill\n---\n\n# acme-review\n',
      )

      // 3. The KB's own registry declaration is the CLI config on both sides —
      //    no separate definition of "KB repo shape" anywhere.
      const kbConfig = fs.readFileSync(`${kbRepo}/pair.config.json`)
      await fs.writeFile(`${moduleDir}/config.json`, kbConfig)

      // 4. Cut the release ZIP with the existing package command (what the
      //    generated scripts/release.sh shells out to)
      const zipPath = `${kbRepo}/dist/acme-kb-1.0.0.zip`
      await handlePackageCommand(
        {
          command: 'package',
          sourceDir: kbRepo,
          layout: 'source',
          output: zipPath,
          name: 'acme-kb',
          version: '1.0.0',
          interactive: false,
          tags: [],
          license: 'MIT',
        },
        fs,
      )
      expect(fs.existsSync(zipPath)).toBe(true)
      const packaged = Object.keys(JSON.parse(fs.readFileSync(zipPath)))
      expect(packaged).toContain('.pair/knowledge/guidelines/testing.md')
      expect(packaged).toContain('.skills/acme-review/SKILL.md')
      expect(packaged).toContain('manifest.json')

      // 5. A separate project installs the KB via the normal --source path
      fs.chdir(consumer)
      await handleInstallCommand(
        { command: 'install', resolution: 'local', path: kbRepo, offline: true, kb: false },
        fs,
        { baseTarget: consumer },
      )

      expect(fs.readFileSync(`${consumer}/.pair/knowledge/guidelines/testing.md`)).toBe(
        '# Acme testing\n',
      )
      expect(fs.existsSync(`${consumer}/.claude/skills/acme-kb-acme-review/SKILL.md`)).toBe(true)
    })
    /**
     * #291 / #261 DoD round-trip: install(A) -> kb-info(drift) -> update(B) -> kb-info(clean).
     * Genuinely e2e and genuinely CHAINED: three independently invoked commands hand state
     * to each other through ONE filesystem and ONE target — the marker install writes
     * (`.pair/.kb-version.json`) is exactly what kb-info reads back, and update is what
     * clears the drift kb-info reported. Asserting the four steps in isolation (which the
     * per-module tests already do) cannot catch a break in that hand-off, which is the
     * whole point of the DoD line this closes.
     */
    it('installs KB version A, reports drift to B, then reports up-to-date after update', async () => {
      const projectRoot = '/roundtrip-project'
      const kbPkg = `${projectRoot}/packages/knowledge-hub/package.json`
      const datasetFile = `${projectRoot}/packages/knowledge-hub/dataset/test-registry/file1.md`
      const marker = `${projectRoot}/.pair/.kb-version.json`

      const fs = new InMemoryFileSystemService(
        {
          [`${projectRoot}/package.json`]: JSON.stringify({ name: 'test', version: '0.1.0' }),
          [kbPkg]: JSON.stringify({ name: '@pair/knowledge-hub', version: '1.1.0' }),
          [`${projectRoot}/config.json`]: JSON.stringify({
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
        projectRoot,
        projectRoot,
      )

      /** `pair kb-info --json` (version-check mode), returning exit code + parsed report. */
      async function versionCheck() {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        try {
          const exitCode = await handleKbInfoCommand(
            { command: 'kb-info', mode: 'version-check', json: true },
            fs,
            { baseTarget: projectRoot },
          )
          const output = logSpy.mock.calls.map(args => args.join(' ')).join('\n')
          return { exitCode, report: JSON.parse(output) }
        } finally {
          logSpy.mockRestore()
        }
      }

      // 1. Install KB version A (1.1.0) — records the installed-version marker
      await handleInstallCommand(
        { command: 'install', resolution: 'default', kb: true, offline: false },
        fs,
      )
      expect(JSON.parse(await fs.readFile(marker)).version).toBe('1.1.0')

      // 2. The source now publishes version B (1.2.0)
      await fs.writeFile(kbPkg, JSON.stringify({ name: '@pair/knowledge-hub', version: '1.2.0' }))
      await fs.writeFile(datasetFile, '# Content v2')

      // 3. kb-info reports drift A -> B with the v{A}-to-v{B} migration page
      const drift = await versionCheck()
      expect(drift.exitCode).toBe(0)
      expect(drift.report.status).toBe('drift')
      expect(drift.report.installed.version).toBe('1.1.0')
      expect(drift.report.current.version).toBe('1.2.0')
      expect(drift.report.migrationUrl).toContain('v1.1.0-to-v1.2.0')

      // 4. update applies B and re-records the marker
      await handleUpdateCommand(
        { command: 'update', resolution: 'default', kb: true, offline: false },
        fs,
      )
      expect(JSON.parse(await fs.readFile(marker)).version).toBe('1.2.0')
      expect(fs.readFileSync(`${projectRoot}/.pair/test-registry/file1.md`)).toBe('# Content v2')

      // 5. kb-info now reports up-to-date at B — drift cleared, no migration URL
      const clean = await versionCheck()
      expect(clean.exitCode).toBe(0)
      expect(clean.report.status).toBe('up-to-date')
      expect(clean.report.installed.version).toBe('1.2.0')
      expect(clean.report.current.version).toBe('1.2.0')
      expect(clean.report.migrationUrl).toBeUndefined()
    })
  })
})
