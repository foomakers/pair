import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// US-552 increment 4 (AC14-19): /pair-assistant is also the configuration guide.
// Asserts on the skill text only: menu, intent rows, area routing, delegation, validate-before-write.

const skill = readFileSync(
  join(__dirname, '../../dataset/plugin/skills/pair-assistant/SKILL.md'),
  'utf-8',
)

const configSection = skill.slice(skill.indexOf('## Configure'))

describe('pair-assistant configuration guide (US-552 AC14-19)', () => {
  it('AC14: capability menu lists CLI jobs and configuration areas', () => {
    expect(skill).toMatch(/## Capability menu/)
    const menu = skill.slice(skill.indexOf('## Capability menu'), skill.indexOf('## Configure'))
    for (const job of [
      'install',
      'update',
      'kb-info',
      'kb-validate',
      'package',
      'scaffold-kb',
      'update-link',
      'validate-config',
      'kb-cache',
      'tokens',
    ])
      expect(menu, job).toContain(job)
    expect(menu).toMatch(/Autonomy/)
    expect(menu).toMatch(/Cycle Hooks/)
  })

  it('AC15: intent table maps kb-cache and tokens, with no flag list', () => {
    expect(skill).toMatch(/\|[^|\n]*cache[^|\n]*\|\s*`kb-cache`/i)
    expect(skill).toMatch(/\|[^|\n]*token[^|\n]*\|\s*`tokens`/i)
    expect(skill).not.toMatch(/--dry-run|--json|--by-area/)
  })

  it.each([
    '## Autonomy',
    '## Cycle Hooks',
    '## Blocking Severities',
    'max-dispatches',
    'Publish-PR Hooks',
    'tech/automation.md',
    'workflowProfiles',
    'skipRegistries',
    'pair.config.json',
    'format-check-command',
    'worktree-setup-command',
    'Review enforcement',
    'Review identity',
    'Coverage guardrail',
    'PR states',
    'tech/way-of-working.md',
    '/pair-capability-setup-pm',
    '## State Mapping',
    'not-planned',
    'Definition of Ready',
    'Definition of Done',
    '## Process Profile',
    'risk matrix',
    '## Tag Projection',
    '/pair-capability-setup-harness',
    '/pair-capability-setup-gates',
    '/pair-process-bootstrap',
    'package-local adoption',
    'template overrides',
  ])('AC16: area %s is routed', area => {
    expect(configSection).toContain(area)
  })

  it('AC17: writes go through record-decision / owning skill, never directly', () => {
    expect(configSection).toContain('/pair-capability-record-decision')
    expect(configSection).toMatch(/shows? the diff/i)
    expect(configSection).toMatch(/never edit[s]? (the )?adoption files itself/i)
    expect(configSection).toContain('update --skip-registries')
  })

  it('AC18: validates with the installed cycle scripts before writing', () => {
    expect(configSection).toContain('.claude/skills/pair-workflow-cycle/scripts/')
    for (const s of [
      'autonomy-policy.mjs resolve',
      'cycle-hooks.mjs load',
      'blocking-severities.mjs read',
      'workflow-profile.mjs resolve',
    ])
      expect(configSection, s).toContain(s)
    expect(configSection).toMatch(/temp(orary)? copy/i)
    expect(configSection).toMatch(/nothing (is )?written/i)
    expect(configSection).toMatch(/offer `update`/)
  })

  it('AC19: no relative link out of the plugin', () => {
    expect(skill).not.toMatch(/\]\(\.\.?\//)
  })
})
