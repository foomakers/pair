import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { execFileSync, spawn } from 'child_process'
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

/**
 * US-487 review r1-2 — AC9 × the per-card lock: a driver killed with SIGTERM (a CI cancellation, a
 * `timeout`) or SIGINT (Ctrl-C) stops its engine child, releases the card's lock, writes the `end`
 * record and exits with the conventional code (128 + signal). Re-invoking the same command then
 * CONTINUES — it is never skipped `run-in-progress` by a lock nobody holds.
 *
 * A REAL driver process — the built CLI (`dist/cli.js`; turbo builds before `test`) — over a
 * throwaway repository with the real cycle scripts. Only `gh` and the engine are stubs: the engine
 * records its pid and, while `STUB_ENGINE_SLEEP_MS` is set, stays alive long enough to be the child
 * the signal lands on. SIGKILL stays the KB's documented stale-lock case, not tested here.
 */

const PKG_ROOT = join(__dirname, '..', '..', '..')
const REPO_ROOT = join(PKG_ROOT, '..', '..')
const CLI = join(PKG_ROOT, 'dist', 'cli.js')

const CARD = '12'
const EXIT_CODE = { SIGTERM: 143, SIGINT: 130 } as const

/**
 * The built CLI must exist. Freshness is turbo's (`test` dependsOn `build`, content-hashed): an
 * mtime check here misfires on a cache-restored `dist`. Run directly with vitest, rebuild first.
 */
function assertBuilt(): void {
  if (!existsSync(CLI)) throw new Error(`${CLI} is missing: build @pair/pair-cli first`)
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function until(predicate: () => boolean, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (predicate()) return true
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  return predicate()
}

describe('r1-2: a signalled driver releases the card lock, stops its engine, and the rerun resumes', () => {
  let root: string
  let main: string
  let bin: string
  const spawnedPids: number[] = []

  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const lockDir = () => join(main, '.pair/working/automation/locks', CARD)
  const auditFile = () => join(main, '.pair/working/automation/loop-audit.md')
  const engineLog = () => join(root, 'engine.log')
  const engineRuns = (): Array<{ pid: number; prompt: string }> =>
    existsSync(engineLog())
      ? readFileSync(engineLog(), 'utf8')
          .split('\n')
          .filter(Boolean)
          .map(line => JSON.parse(line) as { pid: number; prompt: string })
      : []

  beforeAll(assertBuilt)

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-r12-signal-')))
    main = join(root, 'main')
    bin = join(root, 'bin')
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
    git(main, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
    cpSync(
      join(REPO_ROOT, '.claude/skills/pair-workflow-cycle'),
      join(main, '.claude/skills/pair-workflow-cycle'),
      { recursive: true },
    )
    cpSync(join(REPO_ROOT, '.claude/agents'), join(main, '.claude/agents'), { recursive: true })
    mkdirSync(join(main, '.pair/adoption/tech'), { recursive: true })
    writeFileSync(
      join(main, '.pair/adoption/tech/way-of-working.md'),
      '## State Mapping\n\n| Board State | Macrostate |\n| --- | --- |\n| Todo | Draft |\n| Refined | Ready |\n| Done | Done |\n',
    )
    writeFileSync(
      join(root, 'card.json'),
      JSON.stringify({
        title: 'A story',
        body: '**Status**: Refined\n\n## Task Breakdown\n\n- [ ] **T-1**: build it\n',
        projectItems: [{ status: { name: 'Refined' } }],
      }),
    )
    writeFileSync(
      join(bin, 'gh'),
      `#!/usr/bin/env node
const a = process.argv.slice(2)
const card = JSON.parse(require('fs').readFileSync(${JSON.stringify(join(root, 'card.json'))}, 'utf8'))
if (a[0] === 'issue' && a[1] === 'view') process.stdout.write(a.includes('-q') ? card.body : JSON.stringify(card))
else process.exit(1)
`,
    )
    writeFileSync(
      join(bin, 'claude'),
      `#!/usr/bin/env node
const argv = process.argv.slice(2)
require('fs').appendFileSync(${JSON.stringify(engineLog())}, JSON.stringify({ pid: process.pid, prompt: argv[argv.length - 1] }) + '\\n')
const done = () => process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success' }) + '\\n')
const ms = Number(process.env.STUB_ENGINE_SLEEP_MS || 0)
if (ms > 0) setTimeout(done, ms)
else done()
`,
    )
    chmodSync(join(bin, 'gh'), 0o755)
    chmodSync(join(bin, 'claude'), 0o755)
  })

  afterEach(() => {
    for (const pid of spawnedPids.splice(0)) if (alive(pid)) process.kill(pid, 'SIGKILL')
    rmSync(root, { recursive: true, force: true })
  })

  function driver(sleepMs: number) {
    const child = spawn(
      process.execPath,
      [CLI, 'run', '--card', CARD, '--autonomous', '--cwd', main],
      {
        cwd: main,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env['PATH'] ?? ''}`,
          PAIR_GH_BIN: join(bin, 'gh'),
          STUB_ENGINE_SLEEP_MS: String(sleepMs),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    let output = ''
    child.stdout.on('data', chunk => (output += String(chunk)))
    child.stderr.on('data', chunk => (output += String(chunk)))
    const exited = new Promise<{ code: number | null; signal: string | null }>(resolve =>
      child.on('exit', (code, signal) => resolve({ code, signal })),
    )
    return { child, exited, output: () => output }
  }

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    it(`S2-W-${signal}: ${signal} on the driver ⇒ exit ${EXIT_CODE[signal]}, lock released, engine gone, end audited; the rerun resumes`, async () => {
      const first = driver(60_000)
      const engineUp = await until(() => engineRuns().length > 0, 30_000)
      expect(engineUp, first.output()).toBe(true)
      const enginePid = engineRuns()[0]!.pid
      spawnedPids.push(enginePid)
      expect(existsSync(lockDir())).toBe(true)

      first.child.kill(signal)
      const exit = await first.exited

      expect(exit, first.output()).toEqual({ code: EXIT_CODE[signal], signal: null })
      expect(existsSync(lockDir()), 'the card lock outlived the driver').toBe(false)
      expect(await until(() => !alive(enginePid), 5_000), 'the engine outlived the driver').toBe(
        true,
      )
      const audit = readFileSync(auditFile(), 'utf8')
      expect(audit).toMatch(new RegExp(`event=start card=${CARD}\\b`))
      expect(audit).toMatch(new RegExp(`event=end card=${CARD}\\b.*outcome=interrupted`))

      const spawnsBefore = engineRuns().length
      const rerun = driver(0)
      await rerun.exited
      expect(rerun.output()).not.toMatch(/run-in-progress/)
      const resumed = engineRuns().slice(spawnsBefore)
      expect(resumed.length, rerun.output()).toBeGreaterThan(0)
      expect(resumed[0]!.prompt).toMatch(/^\/pair-workflow-red-spec /)
    }, 120_000)
  }
})
