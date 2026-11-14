// r2-g2 (finding r0-1): the root gate — `pnpm quality-gate` and the CI workflow — must execute
// the scripts/dev/*.test.mjs suites (rtk-review-hook + rtk-session-path), so that removing the
// agent_type guard of the rtk review hook turns the gate red. The gate command is not
// reimplemented here: its `node --test` invocation is read from package.json / ci.yml, then RUN
// against an isolated copy of scripts/dev with an injected regression.
import { spawnSync } from 'child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { isAbsolute, join, relative, resolve, sep } from 'path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import { REPO_ROOT } from './repo-root'

type Invocation = { cwd: string; args: string[]; from: string }
type Step = { run?: unknown; ['continue-on-error']?: unknown }
type Job = { steps?: Step[]; ['continue-on-error']?: unknown }

const DEV = join(REPO_ROOT, 'scripts/dev')
const SCRIPTS: Record<string, string> = JSON.parse(
  readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8'),
).scripts
const GUARD = "JSON.parse(stdin).agent_type !== 'pair-reviewer' || "

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
  const wf = parse(readFileSync(join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf-8')) as {
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

// an isolated copy of what the suites read: scripts/dev + .claude/settings.json
const sandbox = (mutate?: (root: string) => void): string => {
  const root = mkdtempSync(join(tmpdir(), 'devgate-'))
  cpSync(DEV, join(root, 'scripts/dev'), { recursive: true })
  mkdirSync(join(root, '.claude'), { recursive: true })
  cpSync(join(REPO_ROOT, '.claude/settings.json'), join(root, '.claude/settings.json'))
  mutate?.(root)
  return root
}
const rewrite = (root: string, file: string, from: string, to: string): void => {
  const path = join(root, 'scripts/dev', file)
  const src = readFileSync(path, 'utf-8')
  expect(src.includes(from), `${file}: injection anchor not found`).toBe(true)
  writeFileSync(path, src.replace(from, to))
}
const dropGuard = (root: string): void => rewrite(root, 'rtk-review-hook.mjs', GUARD, '')
const noopSessionPath = (root: string): void =>
  rewrite(root, 'rtk-session-path.mjs', 'try {', 'process.exit(0)\ntry {')

const mapPath = (root: string, p: string): string => join(root, relative(REPO_ROOT, p))
// run the gate's own invocation in the sandbox, under /bin/sh as pnpm runs it (a shell glob
// expands there); positional paths outside scripts/dev are dropped
const runGate = (inv: Invocation, root: string) => {
  const args = inv.args
    .filter(a => a.startsWith('-') || insideDev(resolve(inv.cwd, a)))
    .map(a => (isAbsolute(a) ? mapPath(root, a) : a))
  return spawnSync('/bin/sh', ['-c', `"${process.execPath}" --test ${args.join(' ')}`], {
    cwd: mapPath(root, inv.cwd),
    encoding: 'utf-8',
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' },
  })
}
const runFile = (root: string, file: string) =>
  spawnSync(process.execPath, ['--test', join(root, 'scripts/dev', file)], {
    encoding: 'utf-8',
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' },
  })
// node --test summary lines: `# pass N` (TAP reporter) or `ℹ pass N` (spec reporter)
const summary = (out: string, key: string): number =>
  Number(new RegExp(`^(?:#|ℹ) ${key} (\\d+)$`, 'm').exec(out)?.[1] ?? NaN)
const passCount = (out: string): number => summary(out, 'pass')
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

  it('r0-1-w3 the gate invocation fails when the agent_type guard is removed', () => {
    assertTestsFailed(runGate(requireOne(gateInvocations(), 'quality-gate'), sandbox(dropGuard)))
  })

  it('r0-1-w4 the gate invocation fails when the SessionStart PATH hook is a no-op', () => {
    const inv = requireOne(gateInvocations(), 'quality-gate')
    assertTestsFailed(runGate(inv, sandbox(noopSessionPath)))
  })

  it('r0-1-w5 the gate invocation passes on the unmodified suites and runs every test file', () => {
    const r = runGate(requireOne(gateInvocations(), 'quality-gate'), sandbox())
    expect(r.status, r.stdout + r.stderr).toBe(0)
    const files = readdirSync(DEV).filter(f => f.endsWith('.test.mjs'))
    expect(files.length).toBeGreaterThanOrEqual(2)
    const direct = files.map(f => passCount(runFile(sandbox(), f).stdout))
    expect(passCount(r.stdout)).toBe(direct.reduce((a, b) => a + b, 0))
  })

  // a QUOTED glob is expanded by node --test itself, a Node 21+ feature: engines.node is >=20.19
  // and ci.yml pins Node 20 (the #219 workflows:test break). A shell glob is expanded by /bin/sh.
  it('r0-1-b1 the scripts/dev invocation carries no quoted (node-expanded) glob', () => {
    requireOne(gateInvocations(), 'quality-gate')
    for (const inv of [...gateInvocations(), ...ciInvocations()])
      expect(inv.args.join(' '), inv.from).not.toMatch(/(['"])[^'"]*[*?[{][^'"]*\1/)
  })

  it('r0-1-c1 the hook suite itself fails when the agent_type guard is removed', () => {
    expect(runFile(sandbox(), 'rtk-review-hook.test.mjs').status).toBe(0)
    assertTestsFailed(runFile(sandbox(dropGuard), 'rtk-review-hook.test.mjs'))
  })

  it('r0-1-c2 the session-path suite itself fails when the SessionStart hook is a no-op', () => {
    expect(runFile(sandbox(), 'rtk-session-path.test.mjs').status).toBe(0)
    assertTestsFailed(runFile(sandbox(noopSessionPath), 'rtk-session-path.test.mjs'))
  })
})
