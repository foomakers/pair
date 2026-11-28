import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
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

  it.each([
    ['directory', './fixtures/local-tools', [], [true, true, true, false, false]],
    ['collection', './fixtures', [], [true, true, true, false, false]],
    ['ZIP', './local-tools.zip', [], [true, true, true, false, false]],
    ['wrapped ZIP', './wrapped.zip', [], [true, true, true, false, false]],
    [
      'additional directories',
      './fixtures/local-tools',
      ['--add-dir', '../extra-skills', '/other-skills'],
      [true, true, true, true, true],
    ],
    [
      'bare',
      './fixtures/local-tools',
      ['--bare', '--add-dir=../extra-skills', '--add-dir', '/other-skills'],
      [true, false, false, true, true],
    ],
    [
      'user settings only',
      './fixtures/local-tools',
      ['--add-dir', '../extra-skills', '--setting-sources', 'user'],
      [true, false, true, false, false],
    ],
    [
      'project settings only',
      './fixtures/local-tools',
      [
        '--setting-sources=user',
        '--setting-sources=project, local',
        '--add-dir',
        '../extra-skills',
      ],
      [true, true, false, true, false],
    ],
    [
      'safe mode',
      './fixtures/local-tools',
      ['--add-dir', '../extra-skills', '--safe-mode'],
      [false, false, false, false, false],
    ],
    [
      'slash commands disabled',
      './fixtures/local-tools',
      ['--disable-slash-commands'],
      [false, false, false, false, false],
    ],
  ] as const)(
    'R764-07 (#674 AC-2/3/5): validates the Claude %s inventory',
    async (_mode, source, flags, expected) => {
      vi.stubEnv('CLAUDE_CONFIG_DIR', join(project, 'claude-config'))
      vi.stubEnv('CLAUDE_CODE_SIMPLE', '0')
      vi.stubEnv('CLAUDE_CODE_SAFE_MODE', '0')
      const plugin = './fixtures/local-tools'
      const manifest = JSON.stringify({ name: 'runner-tools', skills: './extra-skills/' })
      const inspect = '---\nname: inspect\ndescription: Inspect a fixture\n---\n'
      fs = new InMemoryFileSystemService(
        {
          [join(project, 'pair.config.json')]: JSON.stringify({
            run: {
              defaults: { engine: 'claude' },
              agents: { claude: { args: ['--plugin-dir', source, ...flags] } },
            },
          }),
          [join(project, plugin, '.claude-plugin/plugin.json')]: manifest,
          [join(project, plugin, 'extra-skills/inspect/SKILL.md')]: inspect,
          [join(project, '.claude/skills/project-control/SKILL.md')]:
            '---\nname: project-control\ndescription: Project control\n---\n',
          [join(project, 'claude-config/skills/user-control/SKILL.md')]:
            '---\nname: user-control\ndescription: User control\n---\n',
          '/extra-skills/.claude/skills/relative-skill/SKILL.md':
            '---\nname: relative-skill\ndescription: Skill in a relative directory\n---\n',
          '/other-skills/.claude/skills/absolute-skill/SKILL.md':
            '---\nname: absolute-skill\ndescription: Skill in an absolute directory\n---\n',
        },
        project,
        project,
      )

      if (source.endsWith('.zip')) {
        const archive = new AdmZip()
        const prefix = source === './wrapped.zip' ? 'local-tools/' : ''
        archive.addFile(`${prefix}.claude-plugin/plugin.json`, Buffer.from(manifest))
        archive.addFile(`${prefix}extra-skills/inspect/SKILL.md`, Buffer.from(inspect))
        await fs.writeFileBinary(join(project, source), archive.toBuffer())
      }

      const cases = [
        ['runner-tools:inspect', expected[0]],
        ['project-control', expected[1]],
        ['user-control', expected[2]],
        ['relative-skill', expected[3]],
        ['absolute-skill', expected[4]],
        ['runner-tools:absent', false],
        ['local-tools:inspect', false],
      ] as const
      const steps = cases.map(
        ([skill], index) => `  skill-${index}: { kind: generic, skill: ${skill} }`,
      )
      fs.writeFileSync(
        join(project, 'plugin.yaml'),
        `version: 1\nname: plugin\nsteps:\n${steps.join('\n')}\n`,
      )
      await validate('./plugin.yaml')
      expect(process.exitCode).toBe(1)
      const errors = lines.join('\n')
      expect(
        cases.map(
          ([skill], index) =>
            !errors.includes(`steps.skill-${index}.skill: skill '${skill}' is not installed`),
        ),
      ).toEqual(cases.map(([, installed]) => installed))
    },
  )

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
