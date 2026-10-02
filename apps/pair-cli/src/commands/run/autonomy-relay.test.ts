import { describe, it, expect, afterEach, vi } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createCycleScriptsBridge } from './cycle-scripts'
import { spawnAutonomyResolver } from './autonomy-policy'

/**
 * US-521 T-7 — `pair-cli run` owns NO autonomy rule: the effective policy is the shared script's answer,
 * relayed verbatim (the same answer `/pair-workflow-cycle` reads). Real script, real spawn — no stub.
 */

const SCRIPTS = join(
  __dirname,
  '../../../../../packages/knowledge-hub/dataset/.skills/workflow/cycle/scripts',
)
const location = { scriptsDir: SCRIPTS } as never

function project(automation: string): string {
  const root = mkdtempSync(join(tmpdir(), 'autonomy-relay-'))
  const dir = join(root, '.pair', 'adoption', 'tech')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'automation.md'), automation)
  return root
}

const direct = (adoption: string, args: object): unknown =>
  JSON.parse(
    execFileSync(
      'node',
      [
        join(SCRIPTS, 'autonomy-policy.mjs'),
        'resolve',
        '--adoption',
        adoption,
        '--args',
        JSON.stringify(args),
      ],
      {
        encoding: 'utf8',
      },
    ),
  )

describe('autonomy policy relay (verbatim, no re-derivation)', () => {
  it('V1: the bridge returns byte-for-byte what the script prints', () => {
    const root = project('## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\nrisk:green\n')
    const adoption = join(root, '.pair/adoption/tech/automation.md')
    const args = { until: 'pr' }
    const relayed = createCycleScriptsBridge(location, root).autonomyResolve({ adoption, args })
    expect(relayed).toEqual(direct(adoption, args))
    // legacy translation is visible in the relayed answer — produced by the script, not by pair-cli
    expect(relayed.translated['merge']?.equivalent).toBe('merge: when; lacks: risk:green')
  })

  it('V2: precedence and sources come from the script: argument beats adoption beats default', () => {
    const root = project('## Autonomy\n\nuntil: merged\nmerge: never\n')
    const out = spawnAutonomyResolver({
      location,
      main: root,
      cwd: root,
      args: { until: 'ready' },
    })!
    expect(out.lines).toContain('until: ready (argument)')
    expect(out.lines).toContain('merge: never (adoption)')
    expect(out.lines.some(l => l.startsWith('filter: (all) (default)'))).toBe(true)
    expect(out.active).toBe(true)
  })

  it('V3: nothing declared, nothing passed ⇒ all defaults and NOT active (default off)', () => {
    const root = project('# nothing\n')
    const out = spawnAutonomyResolver({ location, main: root, cwd: root, args: {} })!
    expect(out.ok).toBe(true)
    expect(out.active).toBe(false)
    expect(out.lines.every(l => /\(default\)/.test(l))).toBe(true)
  })

  it('V4: a malformed declaration comes back as errors naming the key (the CLI turns them into a HALT)', () => {
    const root = project('## Autonomy\n\nmerge: always; has: a:b\n')
    const out = spawnAutonomyResolver({ location, main: root, cwd: root, args: {} })!
    expect(out.ok).toBe(false)
    expect(out.errors[0]).toMatchObject({ key: 'merge' })
  })

  it('V5: an installation without the script resolves nothing when nothing is passed, and refuses when something is', () => {
    const empty = { scriptsDir: mkdtempSync(join(tmpdir(), 'no-script-')) } as never
    expect(
      spawnAutonomyResolver({ location: empty, main: '/m', cwd: '/m', args: {} }),
    ).toBeUndefined()
    expect(() =>
      spawnAutonomyResolver({ location: empty, main: '/m', cwd: '/m', args: { until: 'merged' } }),
    ).toThrow(/skill-outdated/)
  })

  it('V6: pair-cli carries no autonomy decision of its own (grep-verifiable): no decide()/gate evaluation in run/*.ts', () => {
    const offenders = readdirSync(__dirname)
      .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .filter(f =>
        /escalationConditions|\.lacks\.|lacks\.some|has\.some|decideAutonomy/.test(
          readFileSync(join(__dirname, f), 'utf8'),
        ),
      )
    expect(offenders).toEqual([])
  })
})

describe('platform independence on darwin and linux of the policy read (AC6 path handling)', () => {
  const original = process.platform
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: original })
    vi.restoreAllMocks()
  })

  it.each(['darwin', 'linux'] as const)(
    'W1: on platform %s the adoption path and the script path are joined the same way and the answer is identical',
    platform => {
      Object.defineProperty(process, 'platform', { value: platform })
      const root = project('## Autonomy\n\nuntil: pr\n')
      const out = spawnAutonomyResolver({ location, main: root, cwd: root, args: {} })!
      expect(out.lines).toContain('until: pr (adoption)')
      // an installation without the script resolves nothing on either platform
      const empty = { scriptsDir: mkdtempSync(join(tmpdir(), 'no-script-')) } as never
      expect(
        spawnAutonomyResolver({ location: empty, main: root, cwd: root, args: {} }),
      ).toBeUndefined()
    },
  )
})
