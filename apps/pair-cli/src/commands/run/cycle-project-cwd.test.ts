import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { execFileSync } from 'child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { createCardReadinessProbe, createDefaultCycleDriver } from './cycle-wiring'
import { CYCLE_WORKFLOW_VERSION, CYCLE_BASE_BRANCH_DEFAULT } from './cycle-scripts'
import { ENGINES } from './engines'

/**
 * US-487 review r1-3 — every tracker read of a `--card` run asks `gh` from the PROJECT directory
 * (`--cwd`), never from the process's own cwd: `gh` resolves the repository from the git remote of
 * the directory it runs in, so a read from anywhere else routes on, and hashes, ANOTHER
 * repository's issue with the same number. Three reads: the readiness probe, the driver's own card
 * read, and `cycle-state.mjs ac-hash` (a script the bridge spawns).
 *
 * The process cwd under vitest is the package directory, never the throwaway project below, so a
 * read that falls back to `process.cwd()` shows up in the log as a different directory.
 * Hermetic: a recording stub `gh` (PATH + PAIR_GH_BIN) and a dead stub engine; real scripts.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')

describe('r1-3: gh is asked from the --cwd project, never the process cwd', () => {
  let root: string
  let main: string
  let ghLog: string

  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

  const ghCwds = (): Array<{ cwd: string; argv: string[] }> =>
    existsSync(ghLog)
      ? readFileSync(ghLog, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map(line => JSON.parse(line) as { cwd: string; argv: string[] })
      : []

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-r13-cwd-')))
    main = join(root, 'main')
    const bin = join(root, 'bin')
    ghLog = join(root, 'gh.log')
    mkdirSync(main, { recursive: true })
    mkdirSync(bin, { recursive: true })
    git(main, 'init', '-q', '-b', 'main')
    git(
      main,
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@t',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'i',
    )
    const scripts = join(main, '.claude/skills/pair-workflow-cycle/scripts')
    mkdirSync(scripts, { recursive: true })
    for (const f of ['cycle-state.mjs', 'cycle-dispatch.mjs', 'host'])
      cpSync(join(REPO_ROOT, '.claude/skills/pair-workflow-cycle/scripts', f), join(scripts, f), { recursive: true })
    cpSync(join(REPO_ROOT, '.claude/agents'), join(main, '.claude/agents'), { recursive: true })
    writeFileSync(
      join(root, 'card.json'),
      JSON.stringify({
        title: 'A story',
        body: '**Status**: Refined\n\n## Task Breakdown\n\n- [ ] T-1\n',
        projectItems: [{ status: { name: 'Refined' } }],
      }),
    )
    writeFileSync(
      join(bin, 'gh'),
      `#!/usr/bin/env node
const a = process.argv.slice(2)
require('fs').appendFileSync(${JSON.stringify(ghLog)}, JSON.stringify({ cwd: process.cwd(), argv: a }) + '\\n')
const card = JSON.parse(require('fs').readFileSync(${JSON.stringify(join(root, 'card.json'))}, 'utf8'))
if (a[0] === 'issue' && a[1] === 'view') process.stdout.write(a.includes('-q') ? card.body : JSON.stringify(card))
else process.exit(1)
`,
    )
    chmodSync(join(bin, 'gh'), 0o755)
    writeFileSync(
      join(bin, 'fake-engine'),
      `#!/usr/bin/env node
process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success' }) + '\\n')
`,
    )
    chmodSync(join(bin, 'fake-engine'), 0o755)
    vi.stubEnv('PATH', `${bin}:${process.env['PATH'] ?? ''}`)
    vi.stubEnv('PAIR_GH_BIN', join(bin, 'gh'))
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    rmSync(root, { recursive: true, force: true })
  })

  it('P3-W0: the precondition — this process does not run in the project directory', () => {
    expect(realpathSync(process.cwd())).not.toBe(main)
  })

  it('P3-W1: the readiness probe reads the card from the project directory', async () => {
    const fs = new InMemoryFileSystemService(
      {
        [`${main}/.pair/adoption/tech/way-of-working.md`]:
          '## State Mapping\n\n| Board State | Macrostate |\n| --- | --- |\n| Refined | Ready |\n| Done | Done |\n',
      },
      main,
      main,
    )

    await createCardReadinessProbe(fs, main)('12')

    const reads = ghCwds()
    expect(reads.length).toBeGreaterThan(0)
    for (const read of reads) expect(read.cwd).toBe(main)
  })

  it('P3-W2: the driver card read AND ac-hash ask gh from the project directory', async () => {
    await createDefaultCycleDriver({
      engine: { ...ENGINES.claude, command: join(root, 'bin', 'fake-engine') },
      cwd: main,
      fs: new InMemoryFileSystemService({}, main, main),
      location: { scriptsDir: join(main, '.claude/skills/pair-workflow-cycle/scripts') },
      autonomyArgs: [],
      timeoutSeconds: 60,
      workflowVersion: CYCLE_WORKFLOW_VERSION,
      baseBranch: CYCLE_BASE_BRANCH_DEFAULT,
    })({ runId: 'story-12', card: '12', rounds: 0 }).catch(() => undefined)

    const reads = ghCwds()
    const acHash = reads.filter(read => read.argv.includes('-q'))
    expect(acHash.length).toBeGreaterThan(0)
    for (const read of reads) expect(read.cwd, read.argv.join(' ')).toBe(main)
  }, 60_000)
})
