import { describe, it, expect } from 'vitest'
import { renderKnowledgeReadme, renderExampleSkill } from './seed-content'

const identity = { name: 'acme-kb', slug: 'acme-kb', skillPrefix: 'acme-kb' }

describe('renderKnowledgeReadme', () => {
  it('explains what belongs under .pair/knowledge/', () => {
    const content = renderKnowledgeReadme({ identity })

    expect(content.startsWith('# acme-kb — knowledge\n')).toBe(true)
    expect(content).toContain('guidelines')
  })
})

describe('renderExampleSkill', () => {
  const skill = renderExampleSkill({ identity })

  it('carries the frontmatter an agent skill needs', () => {
    expect(skill.startsWith('---\n')).toBe(true)
    expect(skill).toMatch(/^name: example-skill$/m)
    expect(skill).toMatch(/^description: /m)
  })

  it('states the installed skill name so the prefix convention is visible', () => {
    expect(skill).toContain('acme-kb-example-skill')
  })
})
