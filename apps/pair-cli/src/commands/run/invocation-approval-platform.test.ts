import { describe, it, expect, afterEach } from 'vitest'
import { APPROVAL_DECLARING_SKILLS, buildSkillArgs, describeApprovalPosture } from './invocation'

const realPlatform = process.platform
const DECLARING = ['pair-process-refine-story', 'pair-process-plan-tasks'] as const
const OUTSIDE = 'pair-loop'

describe('$approval forwarding under --autonomous (US-523), per platform', () => {
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: realPlatform })
  })

  const argvOn = (platform: 'darwin' | 'linux', skill: string): string[] => {
    Object.defineProperty(process, 'platform', { value: platform })
    return buildSkillArgs(skill, { root: '304', approval: 'auto' })
  }

  for (const skill of DECLARING) {
    it(`${skill} is in the declaring set`, () => {
      expect(APPROVAL_DECLARING_SKILLS.has(skill)).toBe(true)
    })

    it(`${skill} builds the same --approval auto argv on darwin and linux`, () => {
      const darwin = argvOn('darwin', skill)
      const linux = argvOn('linux', skill)
      expect(darwin).toEqual(linux)
      expect(darwin).toEqual(['--story', '304', '--approval', 'auto'])
    })

    it(`${skill} passes no --approval when not autonomous, on both platforms`, () => {
      for (const platform of ['darwin', 'linux'] as const) {
        Object.defineProperty(process, 'platform', { value: platform })
        expect(buildSkillArgs(skill, { root: '304' })).toEqual(['--story', '304'])
      }
    })

    it(`${skill} shows the approval posture on darwin and linux alike`, () => {
      const posture = (platform: 'darwin' | 'linux'): string | undefined => {
        Object.defineProperty(process, 'platform', { value: platform })
        return describeApprovalPosture({ kind: 'skill', name: skill } as never, true)
      }
      expect(posture('darwin')).toBe(posture('linux'))
      expect(posture('darwin')).toMatch(/--approval auto will be passed/)
    })
  }

  it('a skill outside the set still gets no --approval on either platform', () => {
    expect(argvOn('darwin', OUTSIDE)).not.toContain('--approval')
    expect(argvOn('linux', OUTSIDE)).not.toContain('--approval')
    expect(argvOn('darwin', OUTSIDE)).toEqual(argvOn('linux', OUTSIDE))
  })
})
