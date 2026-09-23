import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'child_process'
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createCycleScriptsBridge, locateAgentDefinitions } from './cycle-scripts'

/**
 * US-487 review r0-9 — the role packet's agent definition is located through the
 * `agent-definitions` registry target, never at `<script>/../../../agents` alone.
 *
 * With the skill installed under a redirected skills target (`.agents/skills/`, a target
 * `locateCycleScripts` supports) while the definitions live at the registry's own target
 * (`.claude/agents/`), the script-relative guess points at `.agents/agents/` and HALTs
 * `agent-definition-missing` for a role whose definition is installed. Real scripts (byte copies),
 * no engine, no `gh`.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')
const ROLE_LINE = 'You own the preparation stage of a delivery cycle'
const CARD = { id: '135', branch: 'feature/US-135-x', base: 'origin/main', title: 't' }
const PREPARE = { step: 'prepare', mode: 'initial', phase: 'a0', round: 0, attempt: 1 }

describe('r0-9: the role packet finds its agent definition through the registry target', () => {
  let root: string
  let scriptsDir: string
  let agentsDir: string

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-agents-dir-')))
    scriptsDir = join(root, '.agents/skills/pair-workflow-cycle/scripts')
    agentsDir = join(root, '.claude/agents')
    mkdirSync(scriptsDir, { recursive: true })
    for (const f of ['cycle-state.mjs', 'cycle-dispatch.mjs', 'host'])
      cpSync(join(REPO_ROOT, '.claude/skills/pair-workflow-cycle/scripts', f), join(scriptsDir, f), { recursive: true })
    cpSync(join(REPO_ROOT, '.claude/agents'), agentsDir, { recursive: true })
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const packet = (extra: string[]) => {
    const r = spawnSync(
      process.execPath,
      [
        join(scriptsDir, 'cycle-dispatch.mjs'),
        'packet',
        '--next',
        JSON.stringify(PREPARE),
        '--card',
        JSON.stringify(CARD),
        '--run',
        'story-135',
        '--workflow-version',
        '4.0.1',
        '--style',
        'instruction',
        ...extra,
      ],
      { encoding: 'utf8' },
    )
    return JSON.parse(r.stdout) as { prompt?: string; halt?: string; error?: string }
  }

  it('R9-W1: `packet --agents-dir <registry target>` carries the role body from that target', () => {
    const out = packet(['--agents-dir', agentsDir])

    expect(out.halt).toBeUndefined()
    expect(out.error).toBeUndefined()
    expect(out.prompt?.startsWith(ROLE_LINE)).toBe(true)
  })

  it('R9-C1: without it the script-relative guess still HALTs typed, naming the path it looked at', () => {
    const out = packet([])

    expect(out.halt).toBe('agent-definition-missing')
  })

  it('R9-W2: the bridge passes the registry-resolved agents directory to `packet`', () => {
    const bridge = createCycleScriptsBridge({
      scriptsDir,
      agentsDir: locateAgentDefinitions(
        {
          asset_registries: {
            'agent-definitions': {
              source: '.agents',
              behavior: 'overwrite',
              description: 'agents',
              targets: [{ path: '.claude/agents/', mode: 'canonical' }],
            },
          },
        } as never,
        root,
      ),
    })

    const out = bridge.packet({ next: PREPARE, card: CARD, run: 'story-135', style: 'instruction' })

    expect(out.prompt.startsWith(ROLE_LINE)).toBe(true)
  })

  it('R9-C2: no `agent-definitions` registry declared ⇒ the canonical `.claude/agents` under the project', () => {
    expect(locateAgentDefinitions({} as never, root)).toBe(join(root, '.claude/agents'))
  })
})
