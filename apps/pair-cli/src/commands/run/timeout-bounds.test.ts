import { describe, it, expect } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { parseRunCommand } from './parser'
import { readAutomationPolicy, POLICY_PATH } from './automation-policy'
import { readEngineDeclaration } from '../../config/engine-block'

/** setTimeout's delay is a signed 32-bit ms count: 2147483 s is the largest whole-second bound. */
const MAX_SECONDS = 2147483
const OVER = String(MAX_SECONDS + 1)

const cwd = '/project'
const policy = (markdown: string) =>
  readAutomationPolicy(
    new InMemoryFileSystemService({ [`${cwd}/${POLICY_PATH}`]: markdown }, cwd, cwd),
    cwd,
  )
const engineBlock = (idleTimeout: number) =>
  readEngineDeclaration({ engine: { id: 'claude', idleTimeout } }, ['claude'])

describe('r0-4: idle and total timeouts are bounded to what setTimeout can hold', () => {
  it('W-r0-4a: --idle-timeout above 2147483 s is refused', () => {
    expect(() => parseRunCommand({ idleTimeout: OVER })).toThrow(/--idle-timeout/)
  })

  it('W-r0-4b: --iteration-timeout above 2147483 s is refused', () => {
    expect(() => parseRunCommand({ iterationTimeout: OVER })).toThrow(/--iteration-timeout/)
  })

  it('W-r0-4c: `## Stop Predicate` idle-timeout above 2147483 s is refused', () => {
    expect(() => policy(`## Stop Predicate\n\nidle-timeout: ${OVER}\n`)).toThrow(/idle-timeout/)
  })

  it('W-r0-4d: pair.config.json engine.idleTimeout above 2147483 s is an error', () => {
    const outcome = engineBlock(MAX_SECONDS + 1)
    expect(outcome.idleTimeout).toBeUndefined()
    expect(outcome.errors.join('\n')).toMatch(/idleTimeout/)
  })

  it('C-r0-4a: exactly 2147483 s is accepted by every source', () => {
    expect(parseRunCommand({ idleTimeout: String(MAX_SECONDS) }).idleTimeoutSeconds).toBe(
      MAX_SECONDS,
    )
    expect(parseRunCommand({ iterationTimeout: String(MAX_SECONDS) }).iterationTimeoutSeconds).toBe(
      MAX_SECONDS,
    )
    expect(policy(`## Stop Predicate\n\nidle-timeout: ${MAX_SECONDS}\n`).idleTimeoutSeconds).toBe(
      MAX_SECONDS,
    )
    expect(engineBlock(MAX_SECONDS)).toMatchObject({ idleTimeout: MAX_SECONDS, errors: [] })
  })

  it('C-r0-4b: the bound is timeout-specific — shared integer flags still accept values above it', () => {
    const above = MAX_SECONDS + 1
    expect(parseRunCommand({ maxIterations: OVER }).maxIterations).toBe(above)
    expect(parseRunCommand({ card: '487', pr: OVER }).dispatch?.pr).toBe(above)
    expect(parseRunCommand({ root: '1', parallel: OVER }).parallel).toBe(above)
    expect(policy(`## Stop Predicate\n\nmax-iterations: ${OVER}\n`).maxIterations).toBe(above)
  })
})
