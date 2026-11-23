import { expect, it, vi } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileSystemService as fs } from '@pair/content-ops'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'

it('resumes the frozen workflow when the root and included sources become invalid (699 AC-7)', async () => {
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
    write('.pair/adoption/tech/workflows/root.yaml', 'invalid: [')
    write('.pair/adoption/tech/workflows/shared.yaml', 'invalid: [')
    expect(await run()).toBe(0)
    expect(launches).toBe(2)
    expect(lines.some(line => line.includes('included workflow sources changed'))).toBe(true)
  } finally {
    vi.restoreAllMocks()
    fs.rmSync(project, { recursive: true, force: true })
  }
})
