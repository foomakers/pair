import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  resolveWorkflowProfile,
  stageSettings,
  stageEngineIds,
  workflowProfileRequested,
} from './workflow-profile'

/**
 * US-488 — the TypeScript side of the ONE shared resolver: `pair-cli` calls the installed
 * `workflow-profile.mjs` (never a second implementation) and reads its answer. Every scenario runs
 * the REAL script over a real temporary project.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')
const SCRIPTS = join(REPO_ROOT, '.claude/skills/pair-workflow-cycle/scripts')

describe('resolveWorkflowProfile — the shared resolver, through the real script (US-488)', () => {
  let root: string
  const write = (rel: string, body: unknown) => {
    mkdirSync(join(root, rel, '..'), { recursive: true })
    writeFileSync(join(root, rel), typeof body === 'string' ? body : JSON.stringify(body))
  }

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-wfp-')))
    write('pair.config.json', {
      workflowProfiles: { default: 'cheap-green', files: 'profiles/*.json' },
    })
    write('profiles/cheap-green.json', {
      name: 'cheap-green',
      defaults: { engine: 'pi', effort: 'medium' },
      modelClasses: { cheap: 'm-cheap', frontier: 'm-front' },
      stages: {
        prepare: { model: 'cheap', context: 'reuse' },
        green: { model: 'cheap', context: 'reuse' },
        validate: { model: 'frontier', engine: 'claude' },
        verify: { model: 'frontier', effort: 'high' },
      },
    })
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('resolves the configured default, printing-ready: name, source, hash, table', () => {
    const p = resolveWorkflowProfile(SCRIPTS, { root, tier: 'risk:yellow' })

    expect(p.name).toBe('cheap-green')
    expect(p.source).toBe('pair.config.json')
    expect(p.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(p.table[0]).toMatch(/^Profile: cheap-green \(source: pair\.config\.json/)
    expect(p.table.join('\n')).toContain('m-cheap')
  })

  it('--profile is reported as `argument`; --workflow-config wins over it', () => {
    write('ext.json', { name: 'ext' })

    expect(resolveWorkflowProfile(SCRIPTS, { root, profile: 'cheap-green' }).source).toBe('argument')
    const external = resolveWorkflowProfile(SCRIPTS, {
      root,
      profile: 'cheap-green',
      workflowConfig: 'ext.json',
    })
    expect([external.name, external.source]).toEqual(['ext', '--workflow-config'])
  })

  it('an unresolvable name throws profile-unresolved naming what was searched — never the KB default', () => {
    expect(() => resolveWorkflowProfile(SCRIPTS, { root, profile: 'nope' })).toThrow(
      /profile-unresolved: .*nope.*profiles\/\*\.json/,
    )
  })

  it('an invalid profile throws profile-invalid before anything can dispatch', () => {
    write('bad.json', { name: 'bad', stages: { verify: { context: 'reuse' } } })

    expect(() =>
      resolveWorkflowProfile(SCRIPTS, { root, workflowConfig: 'bad.json' }),
    ).toThrow(/profile-invalid: .*stages\.verify\.context/)
  })

  it('stageSettings: the stage engine, resolved model id and effort — `default` means the run’s own', () => {
    const p = resolveWorkflowProfile(SCRIPTS, { root })

    expect(stageSettings(p, 'validate')).toEqual({
      engine: 'claude',
      model: 'm-front',
      effort: 'medium',
    })
    expect(stageSettings(p, 'verify')).toEqual({ engine: 'pi', model: 'm-front', effort: 'high' })
    const kb = resolveWorkflowProfile(SCRIPTS, { root: mkdtempSync(join(tmpdir(), 'pair-wfp-kb-')) })
    expect(stageSettings(kb, 'implement')).toEqual({})
  })

  it('stageEngineIds: every distinct non-default engine the profile uses; an unknown id is profile-invalid', () => {
    const p = resolveWorkflowProfile(SCRIPTS, { root })
    expect(stageEngineIds(p, ['pi', 'claude'])).toEqual(['pi', 'claude'])
    expect(() => stageEngineIds(p, ['pi'])).toThrow(
      /profile-invalid: stages\.validate\.engine: unknown engine 'claude' \(supported: pi\)/,
    )
  })

  it('workflowProfileRequested: only a flag or a declared workflowProfiles block asks for a profile (AC9)', () => {
    expect(workflowProfileRequested({}, {})).toBe(false)
    expect(workflowProfileRequested({}, { engine: { id: 'pi' } })).toBe(false)
    expect(workflowProfileRequested({ profile: 'x' }, {})).toBe(true)
    expect(workflowProfileRequested({ workflowConfig: 'x' }, {})).toBe(true)
    expect(workflowProfileRequested({}, { workflowProfiles: { default: 'x' } })).toBe(true)
  })
})
