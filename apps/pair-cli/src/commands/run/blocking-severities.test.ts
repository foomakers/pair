import { describe, it, expect } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import {
  readBlockingSeverities,
  resolveBlockingSeverities,
  POLICY_PATH,
} from './blocking-severities'

const cwd = '/project'

function policyFrom(markdown?: string) {
  const fs = new InMemoryFileSystemService(
    markdown === undefined ? {} : { [`${cwd}/${POLICY_PATH}`]: markdown },
    cwd,
    cwd,
  )
  return { fs, resolve: () => resolveBlockingSeverities(fs, cwd) }
}

describe('readBlockingSeverities — US-514 T-1 (AC1/AC2)', () => {
  it('absent section ⇒ the KB default floor, Minor, no ceiling', () => {
    expect(readBlockingSeverities('## Something Else\n\nx\n')).toEqual({
      blockingFloor: 'Minor',
    })
  })

  it('`Major` ⇒ the floor Major, no ceiling', () => {
    expect(readBlockingSeverities('## Blocking Severities\n\nMajor\n')).toEqual({
      blockingFloor: 'Major',
    })
  })

  it('US-514 r1-g1 g1-w13: a severity LIST is not a floor — `Critical, Major` HALTs, naming the line', () => {
    expect(() => readBlockingSeverities('## Blocking Severities\n\nCritical, Major\n')).toThrow(
      /Critical, Major/,
    )
  })

  it('`max-dispatches: 40` ⇒ { n: 40, mode: warn } — warn is the default mode', () => {
    expect(readBlockingSeverities('## Blocking Severities\n\nMinor\nmax-dispatches: 40\n')).toEqual(
      {
        blockingFloor: 'Minor',
        maxDispatches: { n: 40, mode: 'warn' },
      },
    )
  })

  it('`max-dispatches: 40 block` ⇒ mode block', () => {
    expect(
      readBlockingSeverities('## Blocking Severities\n\nMajor\nmax-dispatches: 40 block\n'),
    ).toEqual({
      blockingFloor: 'Major',
      maxDispatches: { n: 40, mode: 'block' },
    })
  })

  it('an unknown severity HALTs, naming the value', () => {
    expect(() => readBlockingSeverities('## Blocking Severities\n\nYikes\n')).toThrow(
      /unknown severity `Yikes`/,
    )
  })

  it('an empty declared floor HALTs', () => {
    expect(() => readBlockingSeverities('## Blocking Severities\n\n,  ,\n')).toThrow(
      /Blocking Severities/,
    )
  })

  it('a malformed `max-dispatches` line HALTs — non-numeric, zero, negative, bad mode', () => {
    expect(() =>
      readBlockingSeverities('## Blocking Severities\n\nCritical\nmax-dispatches: soon\n'),
    ).toThrow(/max-dispatches: <positive integer>/)
    expect(() =>
      readBlockingSeverities('## Blocking Severities\n\nCritical\nmax-dispatches: 0\n'),
    ).toThrow(/positive integer/)
    expect(() =>
      readBlockingSeverities('## Blocking Severities\n\nCritical\nmax-dispatches: -5\n'),
    ).toThrow(/positive integer/)
    expect(() =>
      readBlockingSeverities('## Blocking Severities\n\nCritical\nmax-dispatches: 5 maybe\n'),
    ).toThrow(/mode must be warn \| block/)
  })

  it('resolveBlockingSeverities: absent file ⇒ the same KB default as an absent section', () => {
    expect(policyFrom(undefined).resolve()).toEqual({
      blockingFloor: 'Minor',
    })
  })

  it("resolveBlockingSeverities: pair itself declares nothing — the default reproduces today's behaviour byte for byte", () => {
    // pair's own adoption/tech/automation.md carries no `## Blocking Severities` section.
    const { resolve } = policyFrom('## Eligibility\n\nrisk:green\n')
    expect(resolve()).toEqual({ blockingFloor: 'Minor' })
  })

  // #135 AC6: `resolveBlockingSeverities` joins `projectRoot` and `POLICY_PATH` with node's own
  // `path.join` — platform-abstracted (backslash on win32, forward slash on darwin/linux), never a
  // hand-built separator this project would have to test per platform itself.
  it("the policy path join is platform-abstracted (darwin/linux/win32 all resolve through node's own path.join, never a hand-built separator)", () => {
    const fs = new InMemoryFileSystemService(
      { [`${cwd}/${POLICY_PATH}`]: '## Blocking Severities\n\nMajor\n' },
      cwd,
      cwd,
    )
    expect(resolveBlockingSeverities(fs, cwd)).toEqual({ blockingFloor: 'Major' })
  })
})
