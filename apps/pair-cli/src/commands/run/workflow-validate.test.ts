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

  it('R764-07 (#674 AC-2/5): validates with the configured Codex runner and its literal arguments', async () => {
    const root = disk.mkdtempSync(join(tmpdir(), 'pair-runner-validation-'))
    const inventory = (name: string) => `
      require('node:readline').createInterface({ input: process.stdin }).on('line', line => {
        const { id, method } = JSON.parse(line);
        const result = method === 'skills/list'
          ? { data: [{ skills: [{ name: ${JSON.stringify(name)}, enabled: true }] }] }
          : {};
        if (id !== undefined) console.log(JSON.stringify({ id, result }));
      });
    `
    try {
      vi.stubEnv('PATH', root)
      const fallback = join(root, 'codex')
      disk.writeFileSync(fallback, `#!${process.execPath}\n${inventory('default-skill')}`)
      disk.chmodSync(fallback, 0o755)
      const runner = join(root, 'custom-runner.cjs')
      disk.writeFileSync(
        runner,
        `if (process.argv[2] !== 'custom profile' || process.argv[3] !== 'app-server')
           process.exit(1);
         ${inventory('runner-skill')}`,
      )
      fs = new InMemoryFileSystemService(
        {
          [join(root, 'pair.config.json')]: JSON.stringify({
            run: {
              defaults: { engine: 'codex' },
              agents: { codex: { command: process.execPath, args: [runner, 'custom profile'] } },
            },
          }),
          ...Object.fromEntries(
            ['runner-skill', 'default-skill'].map(skill => [
              join(root, `${skill}.yaml`),
              `version: 1\nname: ${skill}\nsteps:\n  build: { kind: generic, skill: ${skill} }\n`,
            ]),
          ),
        },
        root,
        root,
      )

      await validate('./runner-skill.yaml')
      expect(process.exitCode ?? 0, lines.join('\n')).toBe(0)
      await validate('./default-skill.yaml')
      expect(process.exitCode).toBe(1)
      expect(lines.join('\n')).toContain(
        "steps.build.skill: skill 'default-skill' is not installed",
      )
    } finally {
      disk.rmSync(root, { recursive: true, force: true })
    }
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
