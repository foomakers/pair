import { afterEach, expect, it, vi } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileSystemService as fs } from '@pair/content-ops'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'

it('expands includes before validation, freezing and execution (699 AC-1)', async () => {
  const project = fs.mkdtempSync(join(tmpdir(), 'pair-include-'))
  const write = (path: string, text: string) => {
    const target = join(project, path)
    fs.mkdirSync(join(target, '..'), { recursive: true })
    fs.writeFileSync(target, text)
  }
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
    const prompts: string[] = []
    const output: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.join(' '))
    })
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      output.push(args.join(' '))
    })
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const result = await handleRunCommand(
      parseRunCommand({ card: '699', cwd: project }, ['root']),
      fs,
      {
        workflow: {
          readCard: async () => ({ title: 'A card' }),
          engineAvailable: () => true,
          prepareWorktree: async () => project,
          runIteration: async input => {
            prompts.push(input.promptText)
            input.onEvent?.({
              type: 'result',
              subtype: 'success',
              result: '```json\n{"status":"ok","summary":"done"}\n```',
            })
            return { outcome: 'success', detail: 'success' }
          },
        },
      },
    )
    expect(result, output.join('\n')).toBe(0)
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toContain('my-skill')
    const frozen = fs.readFileSync(join(project, '.pair/working/runs/root-699/workflow.yaml'))
    expect(frozen).toContain('shared/work')
    expect(frozen).not.toContain('uses: shared')
  } finally {
    fs.rmSync(project, { recursive: true, force: true })
  }
})

afterEach(() => vi.restoreAllMocks())
