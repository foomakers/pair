import { describe, it, expect, afterEach } from 'vitest'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { POLICY_PATH } from './automation-policy'
import { readAutoAdvanceTiers } from './cycle-wiring'

const ROOT = '/repo'
const realPlatform = process.platform

const fsWith = (policy: string | undefined) =>
  new InMemoryFileSystemService(
    policy === undefined ? {} : { [join(ROOT, POLICY_PATH)]: policy },
    ROOT,
    ROOT,
  )

describe('Auto-Advance tiers handed to resolve (US-490 r1-g2), per platform', () => {
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: realPlatform })
  })

  for (const platform of ['darwin', 'linux'] as const) {
    it(`reads the declared tier under platform ${platform}`, () => {
      Object.defineProperty(process, 'platform', { value: platform })
      const policy = '## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\nrisk:green\n'
      expect(readAutoAdvanceTiers(fsWith(policy), ROOT)).toEqual(['risk:green'])
    })

    it(`(none) and an absent policy file mean no tiers under platform ${platform}`, () => {
      Object.defineProperty(process, 'platform', { value: platform })
      expect(
        readAutoAdvanceTiers(
          fsWith('## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\n(none)\n'),
          ROOT,
        ),
      ).toEqual([])
      expect(readAutoAdvanceTiers(fsWith(undefined), ROOT)).toEqual([])
    })
  }
})
