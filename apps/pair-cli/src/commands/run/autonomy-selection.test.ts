import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand, type IterationRunner } from './handler'
import { parseRunCommand } from './parser'
import { POLICY_PATH } from './automation-policy'

/**
 * US-521 remediation r1-g1, finding r0-3 (pair-cli half) — the `pair-cli run` perimeter borrows the
 * `## Autonomy` selection keys (`filter`, `assignee`, `status`) exactly as it borrows `## Eligibility`:
 * through the ONE shared script (`autonomy-policy.mjs resolve`, run for real here), argument >
 * adoption > default, every value printed with its source. The same declared selection reaches
 * `/pair-next` the same way whichever adoption section — or argument — declared it.
 *
 * Hermetic: in-memory project rooted at a real temp dir holding the real script and the adoption
 * file on disk, injected engine runner, PATH holding only `node` (no `gh`, no engine directory).
 */

const SCRIPT_SRC = join(
  __dirname,
  '../../../../../packages/knowledge-hub/dataset/.skills/workflow/cycle/scripts/autonomy-policy.mjs',
)

let root: string
let bin: string

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'autonomy-selection-')))
  const scripts = join(root, '.claude/skills/pair-workflow-cycle/scripts')
  mkdirSync(scripts, { recursive: true })
  copyFileSync(SCRIPT_SRC, join(scripts, 'autonomy-policy.mjs'))
  mkdirSync(join(root, '.pair/adoption/tech'), { recursive: true })
  bin = join(root, 'bin')
  mkdirSync(bin)
  symlinkSync(process.execPath, join(bin, 'node'))
  vi.stubEnv('PATH', bin)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
})

/** The same adoption text on disk (what the script reads) and in memory (what the CLI reads). */
function project(policy?: string) {
  if (policy !== undefined) writeFileSync(join(root, POLICY_PATH), policy)
  return new InMemoryFileSystemService(
    {
      [`${root}/config.json`]: JSON.stringify({
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
      [`${root}/.claude/skills/pair-next/SKILL.md`]: '',
      [`${root}/.claude/skills/pair-loop/SKILL.md`]: '',
      [`${root}/.claude/skills/pair-workflow-cycle/SKILL.md`]: '',
      [`${root}/.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs`]: '',
      [`${root}/.claude/skills/pair-workflow-cycle/scripts/autonomy-policy.mjs`]: '',
      [`${bin}/claude`]: '',
      ...(policy !== undefined && { [`${root}/${POLICY_PATH}`]: policy }),
    },
    root,
    root,
  )
}

async function run(flags: Record<string, string | boolean>, policy?: string) {
  const stdout: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    stdout.push(args.map(String).join(' '))
  })
  const calls: Array<Parameters<IterationRunner>[0]> = []
  const runIteration: IterationRunner = async input => {
    calls.push(input)
    return { outcome: 'success', detail: 'done' }
  }
  const fs = project(policy)
  const outcome = handleRunCommand(
    parseRunCommand({ skill: 'pair-next', maxIterations: '1', ...flags }),
    fs,
    { runIteration },
  )
  return { outcome, stdout, calls }
}

const AUTONOMY = '## Autonomy\n\nfilter: PIPPO\nassignee: @me\n'
const perimeterLine = (stdout: string[]) => stdout.find(line => line.includes('Perimeter:')) ?? ''

describe('r0-3: the perimeter borrows `## Autonomy` selection through the shared script', () => {
  it('R3-W1: dry run, `## Autonomy filter: PIPPO / assignee: @me`, no args ⇒ the perimeter applies both and names the adoption source', async () => {
    const r = await run({ dryRun: true }, AUTONOMY)
    expect(await r.outcome).toBe(0)
    const perimeter = perimeterLine(r.stdout)
    expect(perimeter).toContain('PIPPO')
    expect(perimeter).toContain('assignee @me')
    expect(r.stdout.join('\n')).toMatch(/PIPPO[^\n]*(Autonomy|adoption)/)
  })

  it('R3-W2: `## Autonomy filter: PIPPO` reaches /pair-next exactly as `## Eligibility PIPPO` does', async () => {
    const legacy = await run({}, '## Eligibility\n\nPIPPO\n')
    expect(await legacy.outcome).toBe(0)
    const declared = await run({}, '## Autonomy\n\nfilter: PIPPO\n')
    expect(await declared.outcome).toBe(0)
    expect(declared.calls).toHaveLength(1)
    expect(declared.calls[0]?.promptText).toBe(legacy.calls[0]?.promptText)
  })

  it('R3-W3: `## Autonomy` assignee/status reach /pair-next exactly as the same values passed as arguments do', async () => {
    const args = await run({ filter: 'PIPPO', assignee: '@me', status: 'Draft,Ready' })
    expect(await args.outcome).toBe(0)
    const declared = await run(
      {},
      '## Autonomy\n\nfilter: PIPPO\nassignee: @me\nstatus: Draft,Ready\n',
    )
    expect(await declared.outcome).toBe(0)
    expect(declared.calls).toHaveLength(1)
    expect(declared.calls[0]?.promptText).toBe(args.calls[0]?.promptText)
  })

  it('R3-W4: precedence per key — `--filter X` wins over adoption `filter`, adoption `assignee` still applies', async () => {
    const r = await run({ filter: 'X' }, AUTONOMY)
    expect(await r.outcome).toBe(0)
    const prompt = r.calls[0]?.promptText ?? ''
    expect(prompt).toContain('--filter X')
    expect(prompt).toContain('--assignee @me')
    expect(prompt).not.toContain('PIPPO')
  })

  it('R3-W5: a malformed `## Autonomy` selection key HALTs naming it, nothing spawned', async () => {
    const r = await run({ root: '1' }, '## Autonomy\n\nfilter: a,a\n')
    await expect(r.outcome).rejects.toThrow(/`filter`/)
    expect(r.calls).toHaveLength(0)
  })

  it('R3-W6: `## Autonomy filter` differing from `## Eligibility` HALTs naming both (the script’s coexistence rule)', async () => {
    const r = await run({}, '## Eligibility\n\nrisk:green\n\n## Autonomy\n\nfilter: PIPPO\n')
    await expect(r.outcome).rejects.toThrow(/`filter`[\s\S]*## Eligibility/)
    expect(r.calls).toHaveLength(0)
  })
})

describe('r0-3: `root` is a selection key of the same model', () => {
  it('R3-W7: `## Autonomy root: 7`, no args ⇒ /pair-next --root 7 and the Perimeter names the adoption source', async () => {
    const r = await run({}, '## Autonomy\n\nroot: 7\n')
    expect(await r.outcome).toBe(0)
    expect(r.calls).toHaveLength(1)
    expect(r.calls[0]?.promptText).toBe('/pair-next --root 7')
    expect(perimeterLine(r.stdout)).toContain('root 7')
    expect(r.stdout.join('\n')).toMatch(/root:? 7[^\n]*(Autonomy|adoption)/)
  })

  it('R3-C4: --root 1 + `## Autonomy root: 7` ⇒ /pair-next --root 1 (argument wins)', async () => {
    const r = await run({ root: '1' }, '## Autonomy\n\nroot: 7\n')
    expect(await r.outcome).toBe(0)
    expect(r.calls[0]?.promptText).toBe('/pair-next --root 1')
  })
})

describe('r0-3: identical legacy + `## Autonomy` declarations', () => {
  it('R3-W8: `## Eligibility PIPPO` + `## Autonomy filter: PIPPO` ⇒ delivered once, the script’s drop-the-legacy warning printed once', async () => {
    const r = await run({}, '## Eligibility\n\nPIPPO\n\n## Autonomy\n\nfilter: PIPPO\n')
    expect(await r.outcome).toBe(0)
    expect(r.calls[0]?.promptText).toBe('/pair-next --filter PIPPO')
    expect(r.stdout.filter(line => line.includes('drop the legacy section'))).toHaveLength(1)
  })
})

describe('r0-3 controls: legacy and default-off selection unchanged', () => {
  it('R3-C1: `## Eligibility risk:green` only ⇒ /pair-next --filter risk:green, as before', async () => {
    const r = await run({}, '## Eligibility\n\nrisk:green\n')
    expect(await r.outcome).toBe(0)
    expect(r.calls[0]?.promptText).toBe('/pair-next --filter risk:green')
  })

  it('R3-C2: nothing declared, --root 1 ⇒ /pair-next --root 1, no selection key invented', async () => {
    const r = await run({ root: '1' })
    expect(await r.outcome).toBe(0)
    expect(r.calls[0]?.promptText).toBe('/pair-next --root 1')
  })

  it('R3-C3: an explicit --filter with `## Autonomy filter` declared ⇒ the argument wins', async () => {
    const r = await run({ filter: 'X' }, '## Autonomy\n\nfilter: PIPPO\n')
    expect(await r.outcome).toBe(0)
    expect(r.calls[0]?.promptText).toBe('/pair-next --filter X')
  })
})
