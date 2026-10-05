import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { dirname, join, resolve } from 'path'

// US-493 review r0-1 — story DoD: each owning SKILL.md of the cycle stories (#486-#492) carries a
// "see the automation overview" backlink to the delivery-cycle page. Owners: pair-workflow-cycle
// (#486, #488, #489, #490, #492) and pair-loop (#490, #491). #487 and #491's console realizations
// (`pair-cli run`) have no SKILL.md of their own.

const REPO_ROOT = join(__dirname, '../../../..')
const DATASET = join(__dirname, '../../dataset')

const owners = {
  'pair-workflow-cycle': {
    dataset: join(DATASET, '.skills/workflow/cycle/SKILL.md'),
    installed: join(REPO_ROOT, '.claude/skills/pair-workflow-cycle/SKILL.md'),
  },
  'pair-loop': {
    dataset: join(DATASET, '.skills/loop/SKILL.md'),
    installed: join(REPO_ROOT, '.claude/skills/pair-loop/SKILL.md'),
  },
}

const PAGE = /\]\(([^)\s]*automation\/delivery-cycle\.md)(#[^)\s]*)?\)/

describe.each(Object.entries(owners))('r0-1: %s links the automation overview', (_name, paths) => {
  it('g1-w1: dataset SKILL.md links delivery-cycle.md and the target resolves', () => {
    const doc = readFileSync(paths.dataset, 'utf-8')
    const m = PAGE.exec(doc)
    expect(m, 'no markdown link to automation/delivery-cycle.md').not.toBeNull()
    expect(existsSync(resolve(dirname(paths.dataset), m![1]))).toBe(true)
  })

  it('g1-w2: installed mirror links delivery-cycle.md and the target resolves', () => {
    const doc = readFileSync(paths.installed, 'utf-8')
    const m = PAGE.exec(doc)
    expect(m, 'no markdown link to automation/delivery-cycle.md').not.toBeNull()
    expect(existsSync(resolve(dirname(paths.installed), m![1]))).toBe(true)
  })

  it('g1-c1: the backlink reads as the automation overview', () => {
    const doc = readFileSync(paths.dataset, 'utf-8')
    const line = doc.split('\n').find(l => PAGE.test(l)) ?? ''
    expect(line).toMatch(/overview/i)
  })
})
