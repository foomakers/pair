import { describe, it, expect } from 'vitest'
import { readdirSync } from 'fs'
import { join } from 'path'
import { resolveWorkflowProfile } from './workflow-profile'

/** #617 AC-3: every shipped profile resolves the four routing stages (declared, not yet wired). */
const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')
const SCRIPTS = join(REPO_ROOT, '.claude/skills/pair-workflow-cycle/scripts')
const DIR = join(REPO_ROOT, '.pair/adoption/tech/workflow-profiles')
const NEW = ['refine-story', 'plan-tasks', 'triage', 'classify']

describe('shipped workflow profiles x #617 stages', () => {
  const files = readdirSync(DIR).filter(f => f.endsWith('.json'))
  it('ships the six profiles', () => expect(files).toHaveLength(6))
  it.each(files)('%s resolves the new stages, always fresh', file => {
    const p = resolveWorkflowProfile(SCRIPTS, {
      root: REPO_ROOT,
      workflowConfig: join(DIR, file),
      tier: 'risk:yellow',
    })
    for (const s of NEW) expect(p.stages[s]?.context.value).toBe('fresh')
    expect(p.contextPolicy).not.toHaveProperty('prepare->refine-story')
  })
})
