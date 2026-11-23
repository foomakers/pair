import { afterEach, expect, it, vi } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileSystemService as fs } from '@pair/content-ops'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'

it('records include source hashes when a run starts (699 AC-7)', async () => {
  const project = fs.mkdtempSync(join(tmpdir(), 'pair-include-sources-'))
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
    const result = await handleRunCommand(
      parseRunCommand({ card: '699', cwd: project }, ['root']),
      fs,
      {
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
      },
    )
    expect(result).toBe(0)
    const sources = fs.readFileSync(join(project, '.pair/working/runs/root-699/sources.json'))
    expect(sources).toContain('shared.yaml')
    expect(sources).toMatch(/[0-9a-f]{64}/)
  } finally {
    fs.rmSync(project, { recursive: true, force: true })
  }
})

afterEach(() => vi.restoreAllMocks())
