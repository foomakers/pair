import { describe, it, expect } from 'vitest'
import { parseCoverageRatchetCommand } from './parser'
import { RATCHET_DEFAULTS, BASE_BRANCH_ENV } from './ratchet'

const measured = { measured: 'backend=87.4' }

describe('parseCoverageRatchetCommand — defaults', () => {
  it('applies the module defaults for every unnamed option', () => {
    expect(parseCoverageRatchetCommand(measured, [], {})).toEqual({
      command: 'coverage-ratchet',
      configPath: RATCHET_DEFAULTS.configPath,
      wowPath: RATCHET_DEFAULTS.wowPath,
      measured: { backend: '87.4' },
      baseBranch: RATCHET_DEFAULTS.baseBranch,
      remote: RATCHET_DEFAULTS.remote,
      marginPp: RATCHET_DEFAULTS.marginPp,
      dryRun: false,
    })
  })

  it('takes the base branch from the environment when the invocation is silent', () => {
    const config = parseCoverageRatchetCommand(measured, [], { [BASE_BRANCH_ENV]: 'trunk' })
    expect(config.baseBranch).toBe('trunk')
  })

  it('prefers the explicit flag over the environment', () => {
    const config = parseCoverageRatchetCommand({ ...measured, baseBranch: 'release' }, [], {
      [BASE_BRANCH_ENV]: 'trunk',
    })
    expect(config.baseBranch).toBe('release')
  })

  it('ignores an environment variable set to the empty string', () => {
    // CI writing an unset value must not name a branch called "".
    const config = parseCoverageRatchetCommand(measured, [], { [BASE_BRANCH_ENV]: '' })
    expect(config.baseBranch).toBe(RATCHET_DEFAULTS.baseBranch)
  })

  it('carries every explicitly named option through', () => {
    const config = parseCoverageRatchetCommand(
      {
        measured: 'shared=90',
        coverageConfig: 'docs/cov.md',
        wayOfWorking: 'docs/wow.md',
        remote: 'upstream',
        margin: '3',
        dryRun: true,
      },
      [],
      {},
    )
    expect(config).toMatchObject({
      configPath: 'docs/cov.md',
      wowPath: 'docs/wow.md',
      remote: 'upstream',
      marginPp: 3,
      dryRun: true,
    })
  })
})

describe('parseCoverageRatchetCommand — the measured list', () => {
  it('parses several types', () => {
    const config = parseCoverageRatchetCommand({ measured: 'backend=87.4,frontend=62' }, [], {})
    expect(config.measured).toEqual({ backend: '87.4', frontend: '62' })
  })

  it('tolerates whitespace and a trailing separator', () => {
    const config = parseCoverageRatchetCommand(
      { measured: ' backend=87.4 , frontend=62 , ' },
      [],
      {},
    )
    expect(config.measured).toEqual({ backend: '87.4', frontend: '62' })
  })

  it('keeps an EMPTY measurement — the pipeline saying "no usable number for this type"', () => {
    // The ratchet reports it as `not-measured` and writes nothing, which is the
    // conservative outcome; dropping the key here would hide the type entirely.
    const config = parseCoverageRatchetCommand({ measured: 'backend=,frontend=62' }, [], {})
    expect(config.measured).toEqual({ backend: '', frontend: '62' })
  })

  it('rejects an entry with no `=`', () => {
    expect(() => parseCoverageRatchetCommand({ measured: 'backend' }, [], {})).toThrow(
      /--measured expects <type>=<pct>/,
    )
  })

  it('rejects an entry with no type', () => {
    expect(() => parseCoverageRatchetCommand({ measured: '=87' }, [], {})).toThrow(
      /--measured expects <type>=<pct>/,
    )
  })

  it('rejects a missing --measured — an invocation that can only be a no-op', () => {
    expect(() => parseCoverageRatchetCommand({}, [], {})).toThrow(/--measured is required/)
  })

  it('rejects a blank --measured', () => {
    expect(() => parseCoverageRatchetCommand({ measured: '  ' }, [], {})).toThrow(
      /--measured is required/,
    )
  })
})

describe('parseCoverageRatchetCommand — loud on a malformed invocation', () => {
  it.each(['abc', '-1', '', 'NaN'])('rejects --margin %j', raw => {
    // A non-numeric margin would make every comparison false and the ratchet
    // would silently never raise: a workflow-authoring bug must exit non-zero.
    expect(() => parseCoverageRatchetCommand({ ...measured, margin: raw }, [], {})).toThrow(
      /--margin expects a non-negative number/,
    )
  })

  it('accepts a margin of 0', () => {
    expect(parseCoverageRatchetCommand({ ...measured, margin: '0' }, [], {}).marginPp).toBe(0)
  })

  it('rejects positional arguments', () => {
    expect(() => parseCoverageRatchetCommand(measured, ['oops'], {})).toThrow(
      /does not accept positional arguments/,
    )
  })
})
