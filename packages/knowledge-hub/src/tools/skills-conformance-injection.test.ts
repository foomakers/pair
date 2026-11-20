import { describe, it, expect } from 'vitest'
import { fileSystemService, InMemoryFileSystemService } from '@pair/content-ops'
import { join } from 'node:path'
import { runChecks } from './skills-conformance-check'

const read = (...p: string[]) => fileSystemService.readFileSync(join(__dirname, ...p))

// Body of the top-level `describe('<title>'` up to the next top-level describe.
const describeBody = (src: string, title: string): string => {
  const start = src.indexOf(`describe('${title}'`)
  const end = src.indexOf('\ndescribe(', start + 1)
  return src.slice(start, end === -1 ? undefined : end)
}

const FIXTURE_DESCRIBES = [
  'runChecks (fixture corpus)',
  'runChecks — block-scalar size-gate cannot be bypassed (finding 1)',
]

describe('r4-5 fixture-corpus injection (AC2/AC3)', () => {
  it('runChecks reads the injected service, not the global singleton', () => {
    const fs = new InMemoryFileSystemService({}, '/module', '/')
    const root = '/virtual-skills-corpus'
    fs.mkdirSync(join(root, 'capability/bad'), { recursive: true })
    fs.writeFileSync(
      join(root, 'capability/bad', 'SKILL.md'),
      '---\nname: bad\ndescription: "x"\ndisable-model-invocation: true\n---\n',
    )
    const { errors, skillCount } = runChecks(root, fs)
    expect(skillCount).toBe(1)
    expect(errors.some(e => e.includes('disable-model-invocation'))).toBe(true)
  })

  it.each(FIXTURE_DESCRIBES)('"%s" seeds an in-memory double, not the real disk', title => {
    const body = describeBody(read('skills-conformance-check.test.ts'), title)
    expect(body).toContain('new InMemoryFileSystemService(')
    expect(body).not.toContain('fileSystemService.mkdtempSync')
  })

  it.each(FIXTURE_DESCRIBES)('"%s" derives no root from the OS tmpdir()', title => {
    const body = describeBody(read('skills-conformance-check.test.ts'), title)
    expect(body).not.toMatch(/\btmpdir\(/)
  })

  it('inventory doc records no skills-conformance "follow-up" known gap', () => {
    const doc = read('../../../..', 'docs/engineering/direct-fs-inventory.md')
    expect(doc).not.toMatch(/known gap/i)
    expect(doc).not.toMatch(/service parameter \(follow-up\)/i)
  })
})
