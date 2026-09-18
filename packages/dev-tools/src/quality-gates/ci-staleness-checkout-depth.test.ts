import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { parse } from 'yaml'

import { REPO_ROOT } from './repo-root'

/**
 * Every job that RUNS a history-reading gate must check out history (r1-1).
 *
 * `pnpm docs:staleness` check 2d dates `packages/knowledge-hub/dataset/.skills/` with
 * `git log -1 -- <path>`. In a shallow checkout the grafted tip has no parents, so git sees
 * it as ADDING every file and answers with the tip's own date — on a `pull_request` event the
 * synthetic merge commit GitHub makes when the run starts, i.e. today. That is how CI run
 * 35305574304 failed on ce10aea9 with a diagnosis naming the wrong cause, having passed the
 * day before on identical content. `secret-scan` already carries `fetch-depth: 0` for the same
 * reason; this file states the rule instead of leaving it to whoever remembers.
 *
 * DERIVATION (r2-g1-v1). The set of gate-running jobs is derived, never named:
 *   - every document under `.github/workflows`, not one chosen file, and
 *   - the transitive closure of ROOT package.json scripts that reach `docs:staleness`,
 *     so a job that spells the gate indirectly (`pnpm quality-gate`, which chains it) is a
 *     runner too.
 * Both halves are load-bearing. Pinned to `ci.yml` and to the literal substring
 * `docs:staleness`, this guard saw ONE runner where the repository has two, and rewriting
 * ci.yml's step as `run: pnpm quality-gate` would have emptied it altogether.
 *
 * The workflows are PARSED, never read line by line (ADL 2026-09-01, amended 2026-09-03):
 * `yaml` resolves the document GitHub runs, so a flow mapping, a quoted scalar or an anchor
 * is read rather than rejected or silently missed — and a `#` comment mentioning the gate is
 * not mistaken for a step that runs it.
 */
const WORKFLOW_DIR = join(REPO_ROOT, '.github/workflows')
const ROOT_PACKAGE_JSON = join(REPO_ROOT, 'package.json')

/** The gate's own root script — the seed of the closure below. */
const GATE_SCRIPT = 'docs:staleness'

/**
 * The paths this remediation group may edit (contract r2-g1 `fixScope.allowedPaths`).
 * A runner OUTSIDE this set is still derived and still reported — it is simply not this
 * group's to fix; obligation `r2-g1-rem1` carries it.
 */
const OWNED_WORKFLOWS = ['.github/workflows/ci.yml']

type Step = { uses?: unknown; run?: unknown; with?: Record<string, unknown> }
type Job = { steps?: unknown }
type Doc = { jobs?: Record<string, Job> }
/** Every workflow document, keyed by its repo-relative path. */
type Docs = Record<string, Doc>

/** `pnpm <name>` / `pnpm run <name>` as a whole token — `quality-gates/` is not `quality-gate`. */
const invokes = (body: string, script: string): boolean =>
  new RegExp(
    `\\bpnpm(?:\\s+run)?\\s+${script.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w:-])`,
  ).test(body)

const rootScripts = (): Record<string, string> =>
  (JSON.parse(readFileSync(ROOT_PACKAGE_JSON, 'utf-8')) as { scripts?: Record<string, string> })
    .scripts ?? {}

/** Least fixed point: root script names whose body transitively runs the gate. */
export const scriptsReachingTheGate = (scripts = rootScripts()): Set<string> => {
  const reaching = new Set<string>([GATE_SCRIPT])
  for (let grew = true; grew; ) {
    grew = false
    for (const [name, body] of Object.entries(scripts)) {
      if (reaching.has(name) || typeof body !== 'string') continue
      if ([...reaching].some(target => invokes(body, target))) {
        reaching.add(name)
        grew = true
      }
    }
  }
  return reaching
}

const readWorkflows = (): Docs =>
  Object.fromEntries(
    readdirSync(WORKFLOW_DIR)
      .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
      .sort()
      .map(f => [
        `.github/workflows/${f}`,
        (parse(readFileSync(join(WORKFLOW_DIR, f), 'utf-8')) ?? {}) as Doc,
      ]),
  )

const stepsOf = (job: Job): Step[] => (Array.isArray(job.steps) ? (job.steps as Step[]) : [])

const checkoutDepths = (job: Job): unknown[] =>
  stepsOf(job)
    .filter(s => typeof s.uses === 'string' && s.uses.startsWith('actions/checkout'))
    .map(s => s.with?.['fetch-depth'])

/** `<workflow path>:<job>` for every job with a step that reaches the gate. Derived, never named. */
export const gateRunners = (docs: Docs, reaching: Set<string>): string[] =>
  Object.entries(docs).flatMap(([path, doc]) =>
    Object.entries(doc.jobs ?? {})
      .filter(([, job]) =>
        stepsOf(job).some(
          s =>
            typeof s.run === 'string' &&
            [...reaching].some(script => invokes(s.run as string, script)),
        ),
      )
      .map(([name]) => `${path}:${name}`),
  )

/**
 * Gate runners that cannot read history: NO checkout step at all (fail-closed — an absent step
 * is an absent clone, never "nothing to check"), or a checkout that is not `fetch-depth: 0`.
 */
export const gateRunnersWithoutHistory = (docs: Docs, reaching: Set<string>): string[] =>
  gateRunners(docs, reaching).filter(id => {
    const [path, name] = id.split(':')
    const depths = checkoutDepths((docs[path] as Doc).jobs?.[name] as Job)
    return depths.length === 0 || depths.some(d => Number(d) !== 0)
  })

const shallowMessage = (offenders: string[]): string =>
  `these jobs run \`pnpm ${GATE_SCRIPT}\` on a shallow checkout, where \`git log -1 -- <path>\` ` +
  `answers with the tip commit's date whatever it touched: ${offenders.join(', ')}`

describe('every workflow job that runs the docs-staleness gate checks out history (r1-1)', () => {
  // r1-1-b4 — BOUNDARY/MECHANISM: the closure's premise. `quality-gate` is a gate runner only
  // because the root script chains the gate into it; if that chain is renamed, b3's second
  // member silently disappears and this row says so instead.
  it('derives the root scripts that reach the gate from package.json, closure and all', () => {
    const scripts = rootScripts()
    expect([...scriptsReachingTheGate(scripts)].sort()).toEqual(['docs:staleness', 'quality-gate'])
    expect(scripts['quality-gate'], 'the chain b3 depends on').toContain(`pnpm ${GATE_SCRIPT}`)
    // A path segment is not a script invocation.
    expect(
      invokes('pnpm --filter x lint packages/dev-tools/src/quality-gates/a.ts', 'quality-gate'),
    ).toBe(false)
  })

  // r1-1-b3 — BOUNDARY/DERIVATION: the runner set itself, across every workflow document and
  // through the script closure. TWO members live at this head; a guard that reported one was
  // measuring the wrong repository. Survives the fix (both jobs keep running the gate) and
  // fails the moment the crawl or the closure regresses.
  it('finds every gate runner in the repository, directly or through a script chain', () => {
    expect(gateRunners(readWorkflows(), scriptsReachingTheGate()).sort()).toEqual([
      '.github/workflows/ci.yml:build', // runs `pnpm docs:staleness` directly
      '.github/workflows/release.yml:release', // runs `pnpm quality-gate`, which chains it
    ])
  })

  // r1-1-w2 — WITNESS (regression row, r1-1 is missedUpstream): of the derived offenders, the
  // ones this group OWNS must be none. At this base: ['.github/workflows/ci.yml:build']
  // (checkout@v3, line 51, no `with:`). The release-side offender is derived and reported by
  // b3/rem1 above, not silently dropped — it is outside `fixScope.allowedPaths`.
  it('checks out full history in every gate-running job this group owns', () => {
    const offenders = gateRunnersWithoutHistory(readWorkflows(), scriptsReachingTheGate()).filter(
      id => OWNED_WORKFLOWS.includes(id.split(':')[0] as string),
    )
    expect(offenders, shallowMessage(offenders)).toEqual([])
  })

  // r1-1-c4 — CONTROL: the sibling job that already does it right must keep doing it.
  it('keeps the full-history checkout secret-scan already declares', () => {
    const ci = readWorkflows()['.github/workflows/ci.yml'] as Doc
    expect(checkoutDepths(ci.jobs?.['secret-scan'] as Job)).toEqual([0])
  })

  // r1-1-b1 — BOUNDARY (C7, fail-closed): exercised on the PREDICATE, not on the helper. A
  // gate-running job with NO checkout step is an offender; deleting the `depths.length === 0`
  // arm turns this row red. The second shape — a checkout with no `with:` block, the defect's
  // own spelling in ci.yml — must read as shallow, never as compliance.
  it('reports a gate-running job with no checkout step, and an omitted fetch-depth, as shallow', () => {
    const reaching = new Set([GATE_SCRIPT, 'quality-gate'])
    const docs = {
      'w.yml': parse(
        'jobs:\n' +
          '  no-checkout:\n    steps:\n      - run: pnpm docs:staleness\n' +
          '  omitted-depth:\n    steps:\n      - uses: actions/checkout@v3\n      - run: pnpm quality-gate\n' +
          '  compliant:\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          fetch-depth: 0\n      - run: pnpm docs:staleness\n',
      ) as Doc,
    }
    expect(gateRunners(docs, reaching).sort()).toEqual([
      'w.yml:compliant',
      'w.yml:no-checkout',
      'w.yml:omitted-depth',
    ])
    expect(gateRunnersWithoutHistory(docs, reaching).sort()).toEqual([
      'w.yml:no-checkout',
      'w.yml:omitted-depth',
    ])
  })
})
