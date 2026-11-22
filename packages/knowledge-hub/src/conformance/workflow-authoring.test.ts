import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dataset = join(__dirname, '../../dataset')
const read = (path: string) => readFileSync(join(dataset, path), 'utf8')

describe('workflow authoring (AC-1–8)', () => {
  it('requires discovery, validation, approval and honest alternatives', () => {
    const skill = read('.skills/capability/workflow/SKILL.md')
    for (const reference of ['workflow-schema.md', 'workflow-kinds.md'])
      expect(skill).toContain(reference)
    expect(skill).toContain('pair-cli run <workflow> --card 1 --dry-run')
    expect(skill).toMatch(/install.*pair-cli/i)
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
    expect(skill).toMatch(/main checkout[\s\S]*way-of-working\.md/i)
    expect(skill).toMatch(/current.directory[\s\S]*pair\.config\.json/i)
    expect(skill).toMatch(/temporary/i)
    expect(skill).toMatch(/never write.*invalid/i)
    expect(skill).toMatch(/engine.*model/i)
  })
  it('stages the launcher lookup roots and destination (AC-1, AC-5, AC-7)', () => {
    const skill = read('.skills/capability/workflow/SKILL.md')
    expect(skill).toContain('named workflows and named configurations from the main checkout')
    expect(skill).toContain('non-Git directory, use the current directory')
    expect(skill).toContain('approved destination in the main checkout')
    expect(skill).toContain('temporary linked worktree')
    expect(skill).toContain('without `--config`')
    expect(skill).toContain('path-selected configurations in the temporary worktree')
    expect(skill).toContain('translate an absolute workflow argument to the staged workflow path')
    expect(skill).toContain(
      'verify the resolved workflow file is the staged proposal before writing',
    )
  })
  it('routes authoring and launching separately', () => {
    const assistant = read('plugin/skills/pair-assistant/SKILL.md')
    expect(assistant).toMatch(/\|[^\n]*create[^\n]*workflow[^\n]*\|[^\n]*pair-capability-workflow/i)
    expect(assistant).toContain('pair-cli run <workflow> --card <id>')
  })
})
