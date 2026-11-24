import { expect, it, vi } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileSystemService as fs } from '@pair/content-ops'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'

it.each([false, true])('applies included settings (699 AC-5, INC-05), alias=%s', async alias => {
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
      alias
        ? 'version: 1\nname: shared\naliases:\n  worker: { model: chosen-model }\nsteps:\n  work: { kind: generic, skill: my-skill, alias: worker }\n'
        : 'version: 1\nname: shared\nsteps:\n  work: { kind: generic, skill: my-skill }\n',
    )
    write(
      '.pair/adoption/tech/configurations/mine.yaml',
      alias ? 'version: 1\nname: mine\ndefaults: { engine: claude, model: default-model }\n' : 'version: 1\nname: mine\ndefaults: { engine: claude, model: default-model }\nsteps:\n  shared/work: { model: chosen-model }\n',
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
