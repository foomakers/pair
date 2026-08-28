import { describe, it, expect } from 'vitest'
import { resolveAutonomy, HEADLESS_STDIN, type AutonomyInput } from './autonomy'
import { ENGINES } from './engines'

const base = {
  autonomous: false,
  approveProjectTrust: false,
  cwd: '/project',
} satisfies Omit<AutonomyInput, 'engine'>

describe('resolveAutonomy — defaults', () => {
  it('keeps confirmations active and approves no trust with no flags (AC6)', () => {
    const decision = resolveAutonomy({ ...base, engine: ENGINES.claude })

    expect(decision.autonomous).toBe(false)
    expect(decision.args).toEqual([])
    expect(decision.notes.join('\n')).toContain('confirmations active (default')
  })

  it('translates the autonomy opt-in through the engine map, never hardcoded', () => {
    expect(resolveAutonomy({ ...base, engine: ENGINES.claude, autonomous: true }).args).toEqual([
      '--permission-mode',
      'bypassPermissions',
    ])
    expect(resolveAutonomy({ ...base, engine: ENGINES.opencode, autonomous: true }).args).toEqual([
      '--auto',
    ])
  })
})

describe('resolveAutonomy — an engine with no confirmation mechanism', () => {
  it('fails loudly rather than pretending confirmations are active', () => {
    expect(() => resolveAutonomy({ ...base, engine: ENGINES.pi })).toThrow(
      /cannot run with confirmations active/,
    )
  })

  it('runs under an explicit --autonomous, stating why', () => {
    const decision = resolveAutonomy({
      ...base,
      engine: ENGINES.pi,
      autonomous: true,
      approveProjectTrust: true,
    })

    expect(decision.autonomous).toBe(true)
    expect(decision.notes.join('\n')).toContain('no permission prompts')
  })
})

describe('resolveAutonomy — project trust', () => {
  const piInput = { ...base, engine: ENGINES.pi, autonomous: true }

  it('has nothing to approve for an engine with no trust gate', () => {
    const decision = resolveAutonomy({ ...base, engine: ENGINES.opencode })

    expect(decision.notes.join('\n')).toContain('nothing to approve')
  })

  it('fails on an untrusted project when no explicit flag was passed', () => {
    expect(() => resolveAutonomy({ ...piInput, isProjectTrusted: () => false })).toThrow(
      /does not trust this project/,
    )
  })

  it('treats an unreadable/absent trust store exactly like untrusted (fail-safe)', () => {
    expect(() => resolveAutonomy({ ...piInput, isProjectTrusted: () => undefined })).toThrow(
      /does not trust this project/,
    )
  })

  it('proceeds without any flag when the project is already trusted', () => {
    const decision = resolveAutonomy({ ...piInput, isProjectTrusted: () => true })

    expect(decision.notes.join('\n')).toContain('already trusted in ~/.pi/agent/trust.json')
  })

  it('never writes the trust store, even under the explicit flag', () => {
    const decision = resolveAutonomy({
      ...piInput,
      approveProjectTrust: true,
      isProjectTrusted: () => false,
    })

    expect(decision.notes.join('\n')).toContain('the driver wrote nothing')
  })

  it('probes the store the engine map declares, for the run cwd', () => {
    const probed: Array<[string, string]> = []
    resolveAutonomy({
      ...piInput,
      isProjectTrusted: (store, path) => {
        probed.push([store, path])
        return true
      },
    })

    expect(probed).toEqual([['~/.pi/agent/trust.json', '/project']])
  })
})

describe('the hang guard', () => {
  it('closes stdin so a prompt in headless mode gets EOF instead of an unbounded wait', () => {
    expect(HEADLESS_STDIN).toBe('ignore')
  })
})
