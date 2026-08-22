import { describe, it, expect } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { generateLlmsTxt, writeProjectLlmsTxt } from './llms-generation'

function createFs(files: Record<string, string>): InMemoryFileSystemService {
  return new InMemoryFileSystemService(files, '/project', '/project')
}

describe('generateLlmsTxt', () => {
  it('generates llmstxt.org format with adoption and knowledge sections', async () => {
    const fs = createFs({
      '/project/.pair/adoption/product/PRD.md': '# Product Requirements Document\n\nContent.',
      '/project/.pair/adoption/tech/architecture.md': '# Architecture\n\nArch content.',
      '/project/.pair/adoption/tech/tech-stack.md': '# Tech Stack\n\nStack content.',
      '/project/.pair/knowledge/how-to/01-create-PRD.md': '# How to Create a PRD\n\nGuide content.',
      '/project/.pair/knowledge/how-to/10-implement.md':
        '# How to Implement a Task\n\nImpl content.',
    })

    const result = await generateLlmsTxt(fs, '/project')

    expect(result).toMatch(/^# pair/)
    expect(result).toContain('> AI-assisted development knowledge base')
    expect(result).toContain('## Adoption — Product')
    expect(result).toContain('- [Product Requirements Document](.pair/adoption/product/PRD.md)')
    expect(result).toContain('## Adoption — Tech')
    expect(result).toContain('- [Architecture](.pair/adoption/tech/architecture.md)')
    expect(result).toContain('- [Tech Stack](.pair/adoption/tech/tech-stack.md)')
    expect(result).toContain('## How-To Guides')
    expect(result).toContain('- [How to Create a PRD](.pair/knowledge/how-to/01-create-PRD.md)')
    expect(result).toContain('- [How to Implement a Task](.pair/knowledge/how-to/10-implement.md)')
  })

  it('indexes the decision log — ADRs are not the whole decision record', async () => {
    // `.pair/adoption/decision-log/` is where ADL/analysis entries land (ADRs live
    // under `adoption/tech/adr/`, already reached by the Tech section). Scanned by
    // no section, the index misrepresents the project's decision record as ADR-only:
    // an agent reading `.pair/llms.txt` for "why is eligibility one literal label"
    // finds nothing, and re-decides a question that was already settled.
    const fs = createFs({
      '/project/.pair/adoption/decision-log/2026-08-20-one-literal-label.md':
        '# Decision: eligibility is one literal label\n\nContent.',
    })

    const result = await generateLlmsTxt(fs, '/project')

    expect(result).toContain('## Adoption — Decisions')
    expect(result).toContain(
      '- [Decision: eligibility is one literal label](.pair/adoption/decision-log/2026-08-20-one-literal-label.md)',
    )
  })

  it('omits the decision-log section when the directory is absent', async () => {
    // Adopters without a decision log must be unaffected: `scanSection` returns []
    // for an absent directory and an empty section is never emitted.
    const fs = createFs({
      '/project/.pair/adoption/tech/tech-stack.md': '# Tech Stack\n\nContent.',
    })

    const result = await generateLlmsTxt(fs, '/project')

    expect(result).not.toContain('## Adoption — Decisions')
  })

  it('includes skills guide when present', async () => {
    const fs = createFs({
      '/project/.pair/knowledge/skills-guide.md': '# Skills Guide\n\nSkills overview.',
    })

    const result = await generateLlmsTxt(fs, '/project')

    expect(result).toContain('## Skills')
    expect(result).toContain('- [Skills Guide](.pair/knowledge/skills-guide.md)')
  })

  it('skips missing sections gracefully', async () => {
    const fs = createFs({
      '/project/.pair/adoption/tech/tech-stack.md': '# Tech Stack\n\nContent.',
    })

    const result = await generateLlmsTxt(fs, '/project')

    expect(result).toMatch(/^# pair/)
    expect(result).toContain('## Adoption — Tech')
    expect(result).not.toContain('## Adoption — Product')
    expect(result).not.toContain('## How-To Guides')
  })

  it('returns valid llmstxt.org with empty .pair directory', async () => {
    const fs = createFs({})

    const result = await generateLlmsTxt(fs, '/project')

    expect(result).toMatch(/^# pair/)
    expect(result).toContain('> AI-assisted development knowledge base')
    expect(result).not.toContain('## ')
  })

  it('extracts title from first heading in file', async () => {
    const fs = createFs({
      '/project/.pair/adoption/tech/way-of-working.md': '# Way of Working\n\nContent.',
    })

    const result = await generateLlmsTxt(fs, '/project')

    expect(result).toContain('- [Way of Working]')
  })

  it('falls back to filename when no heading found', async () => {
    const fs = createFs({
      '/project/.pair/adoption/tech/no-heading.md': 'Just content, no heading.',
    })

    const result = await generateLlmsTxt(fs, '/project')

    expect(result).toContain('- [no-heading]')
  })

  it('sorts entries by path within each section', async () => {
    const fs = createFs({
      '/project/.pair/adoption/tech/z-stack.md': '# Z Stack\nContent.',
      '/project/.pair/adoption/tech/a-arch.md': '# A Arch\nContent.',
    })

    const result = await generateLlmsTxt(fs, '/project')
    const aIdx = result.indexOf('[A Arch]')
    const zIdx = result.indexOf('[Z Stack]')

    expect(aIdx).toBeLessThan(zIdx)
  })
})

describe('writeProjectLlmsTxt', () => {
  it('writes .pair/llms.txt to project root', async () => {
    const fs = createFs({
      '/project/.pair/adoption/tech/arch.md': '# Architecture\nContent.',
    })
    const logs: string[] = []
    const pushLog = (_level: string, msg: string) => logs.push(msg)

    await writeProjectLlmsTxt(fs, '/project', pushLog as never)

    const content = await fs.readFile('/project/.pair/llms.txt')
    expect(content).toMatch(/^# pair/)
    expect(content).toContain('[Architecture]')
    expect(logs).toContain('Generated .pair/llms.txt')
  })

  it('warns on failure without throwing', async () => {
    const fs = createFs({})
    // Make writeFile throw
    const origWriteFile = fs.writeFile.bind(fs)
    fs.writeFile = async () => {
      throw new Error('disk full')
    }
    const logs: { level: string; msg: string }[] = []
    const pushLog = (level: string, msg: string) => logs.push({ level, msg })

    await writeProjectLlmsTxt(fs, '/project', pushLog as never)

    expect(logs.some(l => l.level === 'warn' && l.msg.includes('Failed'))).toBe(true)
    fs.writeFile = origWriteFile
  })
})
