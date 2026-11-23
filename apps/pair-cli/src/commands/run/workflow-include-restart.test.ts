import { expect, it, vi } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileSystemService as fs } from '@pair/content-ops'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'

it('restarts without retaining the previous include sources (699 AC-7)', async () => {
  const project = fs.mkdtempSync(join(tmpdir(), 'pair-include-restart-'))
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
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const run = (restart: boolean) =>
      handleRunCommand(parseRunCommand({ card: '699', cwd: project, restart }, ['root']), fs, {
        workflow: {
          readCard: async () => ({ title: 'A card' }),
          engineAvailable: () => true,
          prepareWorktree: async () => project,
          runIteration: async input => {
            input.onEvent?.({
              type: 'result',
              subtype: 'success',
              result: '```json\n{"status":"ok","summary":"done"}\n```',
            })
            return { outcome: 'success', detail: 'success' }
          },
        },
      })
    expect(await run(false)).toBe(0)
    write(
      '.pair/adoption/tech/workflows/root.yaml',
      'version: 1\nname: root\nsteps:\n  work: { kind: generic, skill: my-skill }\n',
    )
    expect(await run(true)).toBe(0)
    const manifest = join(project, '.pair/working/runs/root-699/sources.json')
    expect(fs.existsSync(manifest) && fs.readFileSync(manifest)).not.toContain('shared.yaml')
  } finally {
    vi.restoreAllMocks()
    fs.rmSync(project, { recursive: true, force: true })
  }
})
