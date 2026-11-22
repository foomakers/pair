import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dataset = join(__dirname, '../../dataset')
const read = (path: string) => readFileSync(join(dataset, path), 'utf8')

describe('workflow authoring (AC-1–8)', () => {
  it('requires discovery, validation, approval and honest alternatives', () => {
    const skill = read('.skills/capability/workflow/SKILL.md')
    for (const command of ['schema', 'kinds', 'list', 'validate'])
      expect(skill).toContain(`workflow.mjs ${command}`)
    for (const phrase of [
      'three times',
      'explicit yes',
      'warnings',
      'diff',
      'installed',
      'shipped',
      'closest alternative',
    ])
      expect(skill.toLowerCase()).toContain(phrase)
    expect(skill).toMatch(/temporary/i)
    expect(skill).toMatch(/never write.*invalid/i)
    expect(skill).toMatch(/engine.*model/i)
  })
  it('routes authoring and launching separately', () => {
    const assistant = read('plugin/skills/pair-assistant/SKILL.md')
    expect(assistant).toMatch(/\|[^\n]*create[^\n]*workflow[^\n]*\|[^\n]*pair-capability-workflow/i)
    expect(assistant).toMatch(/\|[^\n]*run[^\n]*workflow[^\n]*\|[^\n]*pair run/i)
  })
})
