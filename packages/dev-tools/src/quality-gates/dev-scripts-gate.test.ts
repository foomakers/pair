// r0-1 / #693 R8: execute the gate commands from package.json and ci.yml against one probe
// per test file. The hook regressions use the corresponding real suite in the same sandbox.
import { spawn } from 'child_process'
import { fileSystemService } from '@pair/content-ops'
import { tmpdir } from 'os'
import { isAbsolute, join, relative, resolve, sep } from 'path'
import { describe, expect, it, onTestFinished } from 'vitest'
import { parse } from 'yaml'

import { REPO_ROOT } from './repo-root'

const { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } =
  fileSystemService

type Invocation = { cwd: string; args: string[]; from: string }
type Step = { run?: unknown; ['continue-on-error']?: unknown }
type Job = { steps?: Step[]; ['continue-on-error']?: unknown }

const DEV = join(REPO_ROOT, 'scripts/dev')
const SCRIPTS: Record<string, string> = JSON.parse(
  readFileSync(join(REPO_ROOT, 'package.json')),
).scripts
const GUARD = "JSON.parse(stdin).agent_type !== 'pair-reviewer' || "
const REVIEW_SUITE = 'rtk-review-hook.test.mjs'
const SESSION_SUITE = 'rtk-session-path.test.mjs'
const testFiles = readdirSync(DEV)
  .filter(entry => entry.isFile() && entry.name.endsWith('.test.mjs'))
  .map(entry => entry.name)

const insideDev = (p: string): boolean => p === DEV || p.startsWith(DEV + sep)
// only a plain `&&` chain propagates a failure; a segment carrying `;`, `|` or `||` is opaque
const segments = (body: string): string[] => body.split('&&').map(s => s.trim())
const opaque = (seg: string): boolean => /[;|]/.test(seg)
const words = (seg: string): string[] => seg.split(/\s+/).filter(Boolean)
const scriptRef = (w: string[]): string | undefined => {
  if (w[0] !== 'pnpm') return undefined
  const name = w[1] === 'run' ? w[2] : w[1]
  return name !== undefined && name in SCRIPTS ? name : undefined
}

// every `node --test` reached from `body`, through root `pnpm <script>` references
const invocations = (body: string, from: string, seen = new Set<string>()): Invocation[] => {
  let cwd = REPO_ROOT
  const found: Invocation[] = []
  for (const seg of segments(body)) {
    if (opaque(seg)) continue
    const w = words(seg)
    const ref = scriptRef(w)
    if (w[0] === 'cd' && w[1]) cwd = resolve(cwd, w[1])
    else if (w[0] === 'node' && w[1] === '--test') found.push({ cwd, args: w.slice(2), from })
    else if (ref && !seen.has(ref)) {
      seen.add(ref)
      found.push(...invocations(SCRIPTS[ref] as string, `${from} > ${ref}`, seen))
    }
  }
  return found
}

const positional = (inv: Invocation): string[] => inv.args.filter(a => !a.startsWith('-'))
const targetsDev = (inv: Invocation): boolean =>
  insideDev(inv.cwd) || positional(inv).some(a => insideDev(resolve(inv.cwd, a)))
const devInvocations = (all: Invocation[]): Invocation[] => all.filter(targetsDev)

const gateInvocations = (): Invocation[] =>
  devInvocations(invocations(SCRIPTS['quality-gate'] ?? '', 'quality-gate'))

const ciInvocations = (): Invocation[] => {
  const wf = parse(readFileSync(join(REPO_ROOT, '.github/workflows/ci.yml'))) as {
    jobs?: Record<string, Job>
  }
  const runs = Object.entries(wf.jobs ?? {})
    .filter(([, job]) => job['continue-on-error'] === undefined)
    .flatMap(([id, job]) =>
      (job.steps ?? [])
        .filter(s => typeof s.run === 'string' && s['continue-on-error'] === undefined)
        .flatMap(s => (s.run as string).split('\n').map(line => ({ id, line }))),
    )
  return devInvocations(runs.flatMap(({ id, line }) => invocations(line, `ci.yml:${id}`)))
}

const requireOne = (found: Invocation[], where: string): Invocation => {
  expect(found, `${where} reaches no \`node --test\` targeting scripts/dev`).not.toHaveLength(0)
  return found[0] as Invocation
}

const sandbox = (realSuite?: string, mutate?: (root: string) => void): string => {
  const root = mkdtempSync(join(tmpdir(), 'devgate-'))
  onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  const dev = join(root, 'scripts/dev')
  mkdirSync(dev, { recursive: true })
  for (const file of testFiles) {
    if (file === realSuite) cpSync(join(DEV, file), join(dev, file))
    else {
      const probe = [
        "import { writeFileSync } from 'node:fs'",
        "import { test } from 'node:test'",
        `test(${JSON.stringify(file)}, () => writeFileSync(new URL(import.meta.url + '.ran'), ''))`,
      ]
      writeFileSync(join(dev, file), probe.join('\n'))
    }
  }
  if (realSuite) {
    mkdirSync(join(root, '.claude'))
    cpSync(join(REPO_ROOT, '.claude/settings.json'), join(root, '.claude/settings.json'))
    for (const hook of ['rtk-review-hook.mjs', 'rtk-session-path.mjs']) {
      cpSync(join(DEV, hook), join(dev, hook))
    }
  }
  mutate?.(root)
  return root
}
const rewrite = (root: string, file: string, from: string, to: string): void => {
  const path = join(root, 'scripts/dev', file)
  const src = readFileSync(path)
  expect(src.includes(from), `${file}: injection anchor not found`).toBe(true)
  writeFileSync(path, src.replace(from, to))
}
const dropGuard = (root: string): void => rewrite(root, 'rtk-review-hook.mjs', GUARD, '')
const noopSessionPath = (root: string): void =>
  rewrite(root, 'rtk-session-path.mjs', 'try {', 'process.exit(0)\ntry {')

const mapPath = (root: string, p: string): string => join(root, relative(REPO_ROOT, p))
// run the gate's own invocation in the sandbox, under /bin/sh as pnpm runs it (a shell glob
// expands there); positional paths outside scripts/dev are dropped
const run = (command: string, args: string[], cwd: string) =>
  new Promise<{ status: number | null; stdout: string; stderr: string }>(resolve => {
    const child = spawn(command, args, {
      cwd,
      env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => (stdout += chunk))
    child.stderr.on('data', chunk => (stderr += chunk))
    child.on('close', status => resolve({ status, stdout, stderr }))
  })
const runGate = (inv: Invocation, root: string) => {
  const args = inv.args
    .filter(a => a.startsWith('-') || insideDev(resolve(inv.cwd, a)))
    .map(a => (isAbsolute(a) ? mapPath(root, a) : a))
  return run(
    '/bin/sh',
    ['-c', `"${process.execPath}" --test ${args.join(' ')}`],
    mapPath(root, inv.cwd),
  )
}
const runFile = (root: string, file: string) =>
  run(process.execPath, ['--test', join(root, 'scripts/dev', file)], root)
// node --test summary lines: `# pass N` (TAP reporter) or `ℹ pass N` (spec reporter)
const summary = (out: string, key: string): number =>
  Number(new RegExp(`^(?:#|ℹ) ${key} (\\d+)$`, 'm').exec(out)?.[1] ?? NaN)
// red because a test FAILED, not because the runner could not load its input
const assertTestsFailed = (r: { status: number | null; stdout: string }): void => {
  expect(r.status, r.stdout).not.toBe(0)
  expect(summary(r.stdout, 'fail'), r.stdout).toBeGreaterThan(0)
}

describe('root gate runs the scripts/dev suites (r0-1)', () => {
  it('r0-1-w1 quality-gate reaches a node --test invocation targeting scripts/dev', () => {
    requireOne(gateInvocations(), 'package.json quality-gate')
  })

  it('r0-1-w2 a ci.yml step reaches a node --test invocation targeting scripts/dev', () => {
    requireOne(ciInvocations(), '.github/workflows/ci.yml')
  })

  it('r0-1-w3 the gate invocation fails when the agent_type guard is removed', async () => {
    assertTestsFailed(
      await runGate(
        requireOne(gateInvocations(), 'quality-gate'),
        sandbox(REVIEW_SUITE, dropGuard),
      ),
    )
  }, 60_000)

  it('r0-1-w4 the gate invocation fails when the SessionStart PATH hook is a no-op', async () => {
    const inv = requireOne(gateInvocations(), 'quality-gate')
    assertTestsFailed(await runGate(inv, sandbox(SESSION_SUITE, noopSessionPath)))
  }, 60_000)

  it.each([
    ['quality-gate', gateInvocations],
    ['ci.yml', ciInvocations],
  ] as const)(
    'r0-1-w5 %s runs every test file',
    async (where, invocations) => {
      const root = sandbox()
      const r = await runGate(requireOne(invocations(), where), root)
      expect(r.status, r.stdout + r.stderr).toBe(0)
      const ran = readdirSync(join(root, 'scripts/dev'))
        .map(entry => entry.name)
        .filter(name => name.endsWith('.ran'))
        .map(name => name.slice(0, -'.ran'.length))
      expect(ran.sort()).toEqual([...testFiles].sort())
    },
    60_000,
  )

  // a QUOTED glob is expanded by node --test itself, a Node 21+ feature: engines.node is >=20.19
  // and ci.yml pins Node 20 (the #219 workflows:test break). A shell glob is expanded by /bin/sh.
  it('r0-1-b1 the scripts/dev invocation carries no quoted (node-expanded) glob', () => {
    requireOne(gateInvocations(), 'quality-gate')
    for (const inv of [...gateInvocations(), ...ciInvocations()])
      expect(inv.args.join(' '), inv.from).not.toMatch(/(['"])[^'"]*[*?[{][^'"]*\1/)
  })

  it('r0-1-c1 the hook suite itself fails when the agent_type guard is removed', async () => {
    expect((await runFile(sandbox(REVIEW_SUITE), REVIEW_SUITE)).status).toBe(0)
    assertTestsFailed(await runFile(sandbox(REVIEW_SUITE, dropGuard), REVIEW_SUITE))
  }, 60_000)

  it('r0-1-c2 the session-path suite itself fails when the SessionStart hook is a no-op', async () => {
    expect((await runFile(sandbox(SESSION_SUITE), SESSION_SUITE)).status).toBe(0)
    assertTestsFailed(await runFile(sandbox(SESSION_SUITE, noopSessionPath), SESSION_SUITE))
  }, 60_000)
})
