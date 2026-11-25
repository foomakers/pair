import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  fileSystemService as disk,
  InMemoryFileSystemService,
  MockHttpClientService,
} from '@pair/content-ops'
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
const clean = workflow
  .replace('name: validation', 'name: clean')
  .replace(
    'on-failed: continue',
    'on-failed: continue, escalate: { blocked: stop, needs-decision: stop }',
  )
  .replace(
    'kind: implement, when:',
    'kind: implement, escalate: { failed: stop, blocked: stop, needs-decision: stop }, when:',
  )
const commented = `version: 1
name: commented
steps:
  build:
    kind: implement
    escalate: { needs-decision: { do: stop, comment: 'Please decide: {reason}' } }
`

describe('pair workflow validate (#728 AC-15, AC-16)', () => {
  let fs: InMemoryFileSystemService
  let lines: string[]
  let previousExitCode: typeof process.exitCode

  beforeEach(() => {
    fs = new InMemoryFileSystemService(
      {
        [`${project}/.claude/skills/pair-process-implement/SKILL.md`]: '# Implement',
        [`${project}/.pair/adoption/tech/workflows/validation.yaml`]: warned,
        [`${project}/clean.yaml`]: clean,
        [`${project}/invalid.yaml`]: invalid.replace('name: validation', 'name: invalid'),
        [`${project}/commented.yaml`]: commented,
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
    vi.unstubAllEnvs()
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
    expect(lines.join('\n')).toMatch(/warning:.*validation\.yaml:4.*'blocked' is unhandled/i)
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

  it('warns on a card comment when the installed host is absent (#728 AC-8)', async () => {
    await validate('./commented.yaml')

    expect(process.exitCode ?? 0).toBe(0)
    expect(lines.join('\n')).toMatch(/warning:.*commented\.yaml:6.*does not support card comments/i)
  })

  it('recognizes a GitHub card-comment host without a GitHub executable (#728 AC-8)', async () => {
    const hosted = disk.mkdtempSync(join(tmpdir(), 'pair-comment-validation-'))
    const skills = join(hosted, '.claude', 'skills')
    const cycle = '../../../../../.claude/skills/pair-workflow-cycle'
    try {
      disk.mkdirSync(join(skills, 'pair-process-implement'), { recursive: true })
      disk.writeFileSync(join(skills, 'pair-process-implement', 'SKILL.md'), '# Implement')
      disk.symlinkSync(join(__dirname, cycle), join(skills, 'pair-workflow-cycle'))
      disk.writeFileSync(join(hosted, 'commented.yaml'), commented)
      vi.stubEnv('PAIR_GH_BIN', join(hosted, 'no-github-executable'))

      await runCli(['node', 'pair-cli', 'workflow', 'validate', './commented.yaml'], {
        fs: { ...disk, currentWorkingDirectory: () => hosted },
        httpClient: new MockHttpClientService(),
      })

      expect(process.exitCode ?? 0).toBe(0)
      expect(lines.join('\n')).toMatch(/valid workflow:.*commented\.yaml/i)
      expect(lines.join('\n')).not.toMatch(/does not support card comments/i)
    } finally {
      disk.rmSync(hosted, { recursive: true, force: true })
    }
  })
})
