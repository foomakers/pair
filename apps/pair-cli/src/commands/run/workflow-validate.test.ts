import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InMemoryFileSystemService, MockHttpClientService } from '@pair/content-ops'
import { runCli } from '../../cli'

const project = '/validation-project'
const workflow = `version: 1
name: validation
steps:
  build: { kind: implement, on-failed: continue }
  retry: { kind: implement, when: { output: build.status, is: [failed] } }
`
const warned = workflow.replace('[failed]', '[exhausted]')
const invalid = workflow.replace('build.status', 'missing.status')

describe('pair workflow validate (#728 AC-15, AC-16)', () => {
  let fs: InMemoryFileSystemService
  let lines: string[]
  let previousExitCode: typeof process.exitCode

  beforeEach(() => {
    fs = new InMemoryFileSystemService(
      {
        [`${project}/.claude/skills/pair-process-implement/SKILL.md`]: '# Implement',
        [`${project}/.pair/adoption/tech/workflows/validation.yaml`]: warned,
        [`${project}/clean.yaml`]: workflow.replace('name: validation', 'name: clean'),
        [`${project}/invalid.yaml`]: invalid.replace('name: validation', 'name: invalid'),
      },
      project,
      project,
    )
    previousExitCode = process.exitCode
    process.exitCode = undefined
    lines = []
    const capture = (...args: unknown[]) => void lines.push(args.join(' '))
    vi.spyOn(console, 'log').mockImplementation(capture)
    vi.spyOn(console, 'warn').mockImplementation(capture)
    vi.spyOn(console, 'error').mockImplementation(capture)
  })

  afterEach(() => {
    process.exitCode = previousExitCode
    vi.restoreAllMocks()
  })

  const validate = (name: string) =>
    runCli(['node', 'pair-cli', 'workflow', 'validate', name], {
      fs,
      httpClient: new MockHttpClientService(),
    })

  it('reports a warning for an adopted workflow name without failing or writing run files', async () => {
    const writes = [
      vi.spyOn(fs, 'writeFile'),
      vi.spyOn(fs, 'writeFileSync'),
      vi.spyOn(fs, 'mkdirSync'),
    ]

    await validate('validation')

    expect(process.exitCode ?? 0).toBe(0)
    expect(lines.join('\n')).toMatch(/warning:.*validation\.yaml:5.*exhausted/i)
    for (const write of writes) expect(write).not.toHaveBeenCalled()
  })

  it('validates a relative file without a card or engine configuration', async () => {
    await validate('./clean.yaml')

    expect(process.exitCode ?? 0).toBe(0)
    expect(lines.join('\n')).toMatch(/\bvalid\b/i)
    expect(lines.join('\n')).not.toMatch(/warning:/i)
  })

  it('rejects an invalid file and reports its location and missing status producer', async () => {
    await validate('./invalid.yaml')

    expect(process.exitCode).toBe(1)
    expect(lines.join('\n')).toMatch(
      /invalid\.yaml:5.*missing.*earlier step|invalid\.yaml:5.*missing.*step before/i,
    )
  })
})
