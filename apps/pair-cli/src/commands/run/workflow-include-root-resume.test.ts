import { expect, it, vi } from 'vitest'
import { tmpdir } from 'os'
import { createHash } from 'crypto'
import { join } from 'path'
import { fileSystemService as fs } from '@pair/content-ops'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'

it.each([false, true])(
  'warns on changed sources while resuming (699 AC-7, INC-06), rootOnly=%s',
  async rootOnly => {
    const project = fs.mkdtempSync(join(tmpdir(), 'pair-include-resume-'))
    const write = (path: string, text: string) => {
      const target = join(project, path)
      fs.mkdirSync(join(target, '..'), { recursive: true })
      fs.writeFileSync(target, text)
    }
    const lines: string[] = []
    let launches = 0
    try {
      write('.claude/skills/my-skill/SKILL.md', '# skill\n')
      write(
        '.pair/adoption/tech/workflows/root.yaml',
        'version: 1\nname: root\nsteps:\n  shared: { kind: generic, uses: shared }\n',
      )
      write(
        '.pair/adoption/tech/workflows/shared.yaml',
        'version: 1\nname: shared\nsteps:\n  work: { kind: generic, skill: my-skill }\n',
      )
      vi.spyOn(console, 'log').mockImplementation(
        (...args: unknown[]) => void lines.push(args.join(' ')),
      )
      vi.spyOn(console, 'error').mockImplementation(
        (...args: unknown[]) => void lines.push(args.join(' ')),
      )
      vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
      const run = () =>
        handleRunCommand(parseRunCommand({ card: '699', cwd: project }, ['root']), fs, {
          workflow: {
            readCard: async () => ({ title: 'A card' }),
            engineAvailable: () => true,
            prepareWorktree: async () => project,
            runIteration: async input => {
              launches++
              const result =
                launches === 1
                  ? '{"status":"failed","summary":"retry","reason":"retry"}'
                  : '{"status":"ok","summary":"done"}'
              input.onEvent?.({
                type: 'result',
                subtype: 'success',
                result: `\`\`\`json\n${result}\n\`\`\``,
              })
              return { outcome: 'success', detail: 'success' }
            },
          },
        })
      expect(await run()).toBe(1)
      if (rootOnly)
        write(
          '.pair/adoption/tech/workflows/root.yaml',
          'version: 1\nname: root\nsteps:\n  renamed: { kind: generic, uses: shared }\n',
        )
      if (!rootOnly) write('.pair/adoption/tech/workflows/shared.yaml', 'invalid: [')
      if (!rootOnly) {
        const preview = await handleRunCommand(
          parseRunCommand({ card: '699', cwd: project, dryRun: true }, ['root']),
          fs,
          {},
        )
        expect(preview).toBe(1)
        write('.pair/adoption/tech/workflows/root.yaml', 'invalid: [')
      }
      expect(await run()).toBe(0)
      expect(launches).toBe(2)
      expect(lines.some(line => line.includes('included workflow sources changed'))).toBe(true)
    } finally {
      vi.restoreAllMocks()
      fs.rmSync(project, { recursive: true, force: true })
    }
  },
)

it('does not report source drift for an unchanged ordinary loop (INC-10)', async () => {
  const project = fs.mkdtempSync(join(tmpdir(), 'pair-loop-resume-'))
  const write = (path: string, text: string) => {
    const target = join(project, path)
    fs.mkdirSync(join(target, '..'), { recursive: true })
    fs.writeFileSync(target, text)
  }
  const lines: string[] = []
  let succeeds = false
  try {
    write('.claude/skills/my-skill/SKILL.md', '# skill\n')
    write(
      '.pair/adoption/tech/workflows/root.yaml',
      `version: 1
name: root
steps:
  loop:
    kind: loop
    until: work
    max: 2
    on-max: fail
    steps:
      work: { kind: generic, skill: my-skill }
`,
    )
    vi.spyOn(console, 'log').mockImplementation(
      (...args: unknown[]) => void lines.push(args.join(' ')),
    )
    vi.spyOn(console, 'error').mockImplementation(
      (...args: unknown[]) => void lines.push(args.join(' ')),
    )
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const run = () =>
      handleRunCommand(parseRunCommand({ card: '699', cwd: project }, ['root']), fs, {
        workflow: {
          readCard: async () => ({ title: 'A card' }),
          engineAvailable: () => true,
          prepareWorktree: async () => project,
          runIteration: async input => {
            const result = !succeeds
              ? '{"status":"failed","summary":"retry","reason":"retry"}'
              : '{"status":"ok","summary":"done"}'
            input.onEvent?.({
              type: 'result',
              subtype: 'success',
              result: `\`\`\`json\n${result}\n\`\`\``,
            })
            return { outcome: 'success', detail: 'success' }
          },
        },
      })
    await run()
    const runDir = join(project, '.pair/working/runs/root-699')
    const original = fs.readFileSync(join(project, '.pair/adoption/tech/workflows/root.yaml'))
    const statePath = join(runDir, 'state.json')
    const state = JSON.parse(fs.readFileSync(statePath))
    state.workflow.hash = `sha256:${createHash('sha256').update(original).digest('hex')}`
    fs.writeFileSync(statePath, JSON.stringify(state))
    fs.writeFileSync(join(runDir, 'workflow.yaml'), original)
    fs.rmSync(join(runDir, 'sources.json'), { force: true })
    succeeds = true
    await run()
    expect(lines.some(line => line.includes('changed after this run started'))).toBe(false)
  } finally {
    vi.restoreAllMocks()
    fs.rmSync(project, { recursive: true, force: true })
  }
})
