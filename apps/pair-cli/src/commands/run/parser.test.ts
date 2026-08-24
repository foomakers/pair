import { describe, it, expect } from 'vitest'
import { parseRunCommand, DEFAULT_ITERATION_TIMEOUT_SECONDS } from './parser'

describe('parseRunCommand', () => {
  it('parses the flagless path off schema defaults (AC12)', () => {
    const config = parseRunCommand({})

    expect(config).toEqual({
      command: 'run',
      invocation: { kind: 'skill' },
      scope: {},
      autonomous: false,
      approveProjectTrust: false,
      iterationTimeoutSeconds: DEFAULT_ITERATION_TIMEOUT_SECONDS,
      dryRun: false,
    })
  })

  it('never defaults to an autonomous or trust-approving value (AC6)', () => {
    const config = parseRunCommand({ root: '212' })

    expect(config.autonomous).toBe(false)
    expect(config.approveProjectTrust).toBe(false)
  })

  it('carries every flag into the typed config', () => {
    const config = parseRunCommand({
      engine: 'pi',
      skill: 'pair-next',
      root: '212',
      filter: 'risk:green',
      cwd: '/tmp/project',
      maxIterations: '4',
      autonomous: true,
      approveProjectTrust: true,
      iterationTimeout: '90',
      dryRun: true,
    })

    expect(config).toEqual({
      command: 'run',
      engine: 'pi',
      invocation: { kind: 'skill', name: 'pair-next' },
      scope: { root: '212', filter: 'risk:green' },
      cwd: '/tmp/project',
      maxIterations: 4,
      autonomous: true,
      approveProjectTrust: true,
      iterationTimeoutSeconds: 90,
      dryRun: true,
    })
  })

  it('treats --prompt as a prompt invocation', () => {
    const config = parseRunCommand({ prompt: '/pair-next --root 212' })

    expect(config.invocation).toEqual({ kind: 'prompt', text: '/pair-next --root 212' })
  })

  it('rejects --skill together with --prompt', () => {
    expect(() => parseRunCommand({ skill: 'pair-loop', prompt: 'do the thing' })).toThrow(
      '--skill and --prompt are mutually exclusive',
    )
  })

  it('rejects an unknown engine, naming the supported ones', () => {
    expect(() => parseRunCommand({ engine: 'cursor' })).toThrow(
      "Unknown engine 'cursor'. Supported engines: pi, opencode, claude",
    )
  })

  it.each([
    ['0', '--max-iterations must be a positive integer (received: 0)'],
    ['-2', '--max-iterations must be a positive integer (received: -2)'],
    ['two', '--max-iterations must be a positive integer (received: two)'],
    ['1.5', '--max-iterations must be a positive integer (received: 1.5)'],
  ])('rejects --max-iterations %s', (value, message) => {
    expect(() => parseRunCommand({ maxIterations: value })).toThrow(message)
  })

  it('rejects a non-positive --iteration-timeout', () => {
    expect(() => parseRunCommand({ iterationTimeout: '0' })).toThrow(
      '--iteration-timeout must be a positive integer (received: 0)',
    )
  })

  it.each([
    ['skill', '--skill'],
    ['root', '--root'],
    ['filter', '--filter'],
    ['cwd', '--cwd'],
  ])('rejects an empty %s value', (key, flag) => {
    expect(() => parseRunCommand({ [key]: '   ' })).toThrow(
      `${flag} was passed with an empty value`,
    )
  })

  it('rejects an empty --prompt', () => {
    expect(() => parseRunCommand({ prompt: '  ' })).toThrow(
      '--prompt was passed with an empty value',
    )
  })

  it('rejects positional arguments', () => {
    expect(() => parseRunCommand({}, ['stray'])).toThrow(
      "Command 'run' does not accept positional arguments: stray",
    )
  })
})
