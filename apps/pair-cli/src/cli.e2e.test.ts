import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops/test-utils/in-memory-fs'
import { fileSystemService } from '@pair/content-ops'
import {
  installCommand,
  handleInstallCommand,
  handleUpdateCommand,
  handleUpdateLinkCommand,
  handlePackageCommand,
  handleScaffoldKbCommand,
  handleKbInfoCommand,
  commandRegistry,
} from './commands'
import type { IterationResult } from './commands/run/stream-reader'

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

  /**
   * US-217 T-5 — tag-driven dispatch against a POPULATED BOARD, end to end.
   *
   * Genuinely e2e by this suite's own bar (see the header): the run is driven through the command
   * registry the CLI dispatches on, against a REAL project directory, and each dispatch hands state
   * to the next one through artifacts on disk — the per-card lock and the appended audit file. The
   * module suites prove each decision in isolation with the lock and the audit writer injected;
   * what only this level can show is that five triggers fired at one project leave exactly the runs,
   * the trail and the locks they should, with nothing shared between them but the filesystem.
   *
   * The board is the fixture: one card per case the story names — routed, untagged, eligible but
   * unmapped, multi-tagged, mapped but ineligible. The ONLY injected dependency is the engine spawn,
   * because a test that starts a real agent is not a test.
   */
  describe('tag-driven dispatch on a populated board (US-217)', () => {
    const POLICY = `## Eligibility

risk:green

## Workflows

auto-refine ⇒ pair-process-refine-story
auto-dev ⇒ pair-loop
Precedence: auto-refine, auto-dev
`

    /**
     * The cards a trigger fires on, with the labels it observed at that moment — and everything
     * each one must produce.
     *
     * The fixture IS the assertion set: `routes` is the prompt the engine must be given (absent ⇒
     * nothing may spawn, nothing may be recorded on the card) and `trail` is what the audit file
     * must say about that card. Every check below iterates these rows, so a row added here is a
     * row checked, and a row whose workflow, scoping argument or skip reason changes fails on its
     * own row instead of shifting a positional index under an assertion about a different card.
     */
    const BOARD = [
      // pair-loop declares `--iteration` too, and refine-story does not: each invocation carries
      // exactly the arguments its own `## Arguments` table declares, and nothing else.
      {
        card: '301',
        tags: ['auto-dev', 'risk:green'],
        routes: '/pair-loop --root 301 --iteration 1',
        trail: [
          /event=start card=301 tag=auto-dev workflow=pair-loop/,
          /event=end card=301 .*outcome=completed/,
        ],
      },
      // 302 is the UNLABELLED card — the state a host adapter renders as an empty `--card-tags`.
      // It stops at the ELIGIBILITY gate, before its (absent) tags are ever routed: an untagged
      // card matches no eligibility label either, so the earliest guard is the one that catches it.
      {
        card: '302',
        tags: [],
        routes: undefined,
        trail: [/event=skip card=302 reason=ineligible/],
      },
      // 303 IS eligible and still runs nothing: eligibility selects, the mapping routes, and there
      // is no default workflow for a card the mapping does not name.
      {
        card: '303',
        tags: ['risk:green'],
        routes: undefined,
        trail: [/event=skip card=303 reason=unmapped/],
      },
      {
        card: '304',
        tags: ['auto-refine', 'auto-dev', 'risk:green'],
        // The DECLARED precedence wins over the first mapped tag the card carries — and the card
        // reaches refine-story as `--story`, the argument that skill declares: `--root 304` is a
        // scope it never sees, and its Step 0 would then pick the top Draft story on the board.
        routes: '/pair-process-refine-story --story 304',
        trail: [/event=start card=304 tag=auto-refine/],
      },
      {
        card: '305',
        tags: ['auto-dev'],
        routes: undefined,
        trail: [/event=skip card=305 reason=ineligible/],
      },
    ] as const

    type BoardRow = (typeof BOARD)[number]
    /** The cards the board expects to run, in trigger order — the fixture, read as data. */
    const routed = BOARD.filter(
      (row): row is BoardRow & { routes: string } => row.routes !== undefined,
    )
    const unrouted = BOARD.filter(row => row.routes === undefined)

    const AUDIT = '.pair/working/automation/loop-audit.md'
    const LOCKS = '.pair/working/automation/locks'

    let project: string
    let spawned: string[]
    let printed: string[]
    let log: ReturnType<typeof vi.spyOn>

    const write = (relative: string, content: string): void => {
      const target = join(project, relative)
      mkdirSync(join(target, '..'), { recursive: true })
      writeFileSync(target, content)
    }

    beforeEach(() => {
      project = mkdtempSync(join(tmpdir(), 'pair-dispatch-e2e-'))
      spawned = []
      printed = []

      write(
        'config.json',
        JSON.stringify({
          asset_registries: {
            skills: {
              source: '.skills',
              behavior: 'overwrite',
              description: 'skills',
              prefix: 'pair',
              targets: [{ path: '.claude/skills/', mode: 'canonical' }],
            },
          },
        }),
      )
      // The installed skill set the mapping is resolved against — both declared workflows.
      write('.claude/skills/pair-loop/SKILL.md', '')
      write('.claude/skills/pair-process-refine-story/SKILL.md', '')
      write('.pair/adoption/tech/automation.md', POLICY)
      // A `claude` on PATH: engine resolution probes the filesystem, and the default cascade
      // resolves the schema default when nothing declares one.
      write('bin/claude', '')
      vi.stubEnv('PATH', join(project, 'bin'))

      log = vi.spyOn(console, 'log').mockImplementation(line => {
        printed.push(String(line))
      })
    })

    afterEach(() => {
      log.mockRestore()
      vi.unstubAllEnvs()
      rmSync(project, { recursive: true, force: true })
    })

    /** One trigger event, through the registry the CLI dispatches on. */
    const trigger = async (
      card: string,
      tags: readonly string[],
      runIteration?: () => Promise<IterationResult>,
    ): Promise<number> =>
      commandRegistry.run.handle(
        commandRegistry.run.parse({
          card,
          cardTags: tags.join(','),
          cwd: project,
          maxIterations: 1,
        }),
        fileSystemService,
        {
          runIteration: async input => {
            spawned.push(input.promptText)
            return runIteration ? await runIteration() : { outcome: 'success', detail: 'done' }
          },
        },
      )

    const auditTrail = (): string => readFileSync(join(project, AUDIT), 'utf-8')

    it('runs exactly the two cards the mapping routes, and leaves the trail to prove the other three', async () => {
      for (const { card, tags } of BOARD) expect(await trigger(card, tags)).toBe(0)

      // AC1 — routed cards ran the MAPPED workflow, scoped to their own card, and NOTHING else ran.
      // Driven off the fixture: every row that declares a route is checked against the prompt the
      // engine was actually given, in the order the triggers fired.
      expect(spawned).toEqual(routed.map(row => row.routes))

      // AC2 — every card left the trail its own row declares, and the ones that ran nothing say
      // WHY. Read off the fixture, so a row added above is a row this checks.
      const trail = auditTrail()
      for (const row of BOARD) for (const line of row.trail) expect(trail).toMatch(line)
      // No card was ever routed to a workflow its tags do not name, and none of them started.
      for (const { card } of unrouted) {
        expect(trail).not.toMatch(new RegExp(`card=${card} (tag|workflow)=`))
        expect(trail).not.toMatch(new RegExp(`event=start card=${card}`))
      }

      // AC3 — the line the host adapter posts on the card exists for the runs that started, and
      // ONLY for those: a card that never ran must not get a comment claiming it did.
      const records = printed.filter(line => line.startsWith('DISPATCH-RECORD:'))
      expect(records).toEqual(routed.map(row => expect.stringContaining(`card=${row.card}`)))

      // Every lock was released: the board is left dispatchable, not parked.
      for (const { card } of BOARD) expect(existsSync(join(project, LOCKS, card))).toBe(false)
    })

    it('never starts a second run on a card a run already holds (trigger burst)', async () => {
      // The burst, exactly as a host produces it: the second trigger arrives WHILE the first run is
      // in flight. Re-entering from inside the iteration is what makes the lock the thing under
      // test rather than a sequence of two finished runs.
      let reentrant: number | undefined
      await trigger('301', ['auto-dev', 'risk:green'], async () => {
        reentrant = await trigger('301', ['auto-dev', 'risk:green'])
        return { outcome: 'success', detail: 'done' }
      })

      expect(reentrant).toBe(0)
      // One spawn, not two: the second dispatch was skipped, never queued behind the first.
      expect(spawned).toHaveLength(1)
      expect(auditTrail()).toMatch(/event=skip card=301 reason=run-in-progress/)
      // ...and the burst did not leave the card locked for the next trigger.
      expect(existsSync(join(project, LOCKS, '301'))).toBe(false)
      // The skip names the REAL holder — the directory the run probed, and how long it has held it.
      // Nothing reaps a lock, so a killed run leaves one behind and every later trigger on the card
      // skips forever; the age is what tells an operator this skip is not a healthy burst.
      const skip = printed.find(line => line.includes('run-in-progress'))
      expect(skip).toContain(join(project, LOCKS, '301'))
      expect(skip).toContain('held under a minute')
      expect(skip).toMatch(/stale/)
    })

    it('routes nothing at all when the project declares no mapping — the shipped default', async () => {
      write('.pair/adoption/tech/automation.md', '## Eligibility\n\nrisk:green\n')

      for (const { card, tags } of BOARD) expect(await trigger(card, tags)).toBe(0)

      expect(spawned).toHaveLength(0)
      expect(printed.some(line => line.includes('no mapping declared'))).toBe(true)
      // EVERY card on the board, not just the one that would otherwise have routed: with no
      // `## Workflows` section nothing is routable, and each card says so in the trail.
      const trail = auditTrail()
      for (const { card } of BOARD) {
        expect(trail).toMatch(new RegExp(`event=skip card=${card} reason=no-mapping-declared`))
      }
    })
  })
})
