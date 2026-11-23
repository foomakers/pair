import { expect, it, vi } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileSystemService as fs } from '@pair/content-ops'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'

it('applies configuration to an expanded step ID (699 AC-5)', async () => {
  const project = fs.mkdtempSync(join(tmpdir(), 'pair-include-config-'))
  const write = (path: string, text: string) => {
    const target = join(project, path)
    fs.mkdirSync(join(target, '..'), { recursive: true })
    fs.writeFileSync(target, text)
  }
  const models: (string | undefined)[] = []
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
    write(
      '.pair/adoption/tech/configurations/mine.yaml',
      'version: 1\nname: mine\ndefaults: { engine: claude, model: default-model }\nsteps:\n  shared/work: { model: chosen-model }\n',
    )
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const result = await handleRunCommand(
      parseRunCommand({ card: '699', cwd: project, config: 'mine' }, ['root']),
      fs,
      {
        workflow: {
          readCard: async () => ({ title: 'A card' }),
          engineAvailable: () => true,
          prepareWorktree: async () => project,
          runIteration: async input => {
            models.push(input.model)
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
    expect(result).toBe(0)
    expect(models).toEqual(['chosen-model'])
  } finally {
    vi.restoreAllMocks()
    fs.rmSync(project, { recursive: true, force: true })
  }
})
