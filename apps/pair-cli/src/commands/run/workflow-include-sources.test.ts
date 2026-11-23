import { afterEach, expect, it, vi } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileSystemService as fs } from '@pair/content-ops'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'

const platforms = ['darwin', 'linux'] as const

it.each(platforms)('records include source hashes on platform %s (699 AC-7)', async platform => {
  const project = fs.mkdtempSync(join(tmpdir(), 'pair-include-sources-'))
  const write = (path: string, text: string) => {
    const target = join(project, path)
    fs.mkdirSync(join(target, '..'), { recursive: true })
    fs.writeFileSync(target, text)
  }
  const originalPlatform = Object.getOwnPropertyDescriptor(
    process,
    'platform',
  ) as PropertyDescriptor
  try {
    Object.defineProperty(process, 'platform', { ...originalPlatform, value: platform })
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
    expect(JSON.parse(sources)).toEqual({
      [join(project, '.pair/adoption/tech/workflows/shared.yaml')]:
        expect.stringMatching(/^[0-9a-f]{64}$/),
    })
  } finally {
    Object.defineProperty(process, 'platform', originalPlatform)
    fs.rmSync(project, { recursive: true, force: true })
  }
})

afterEach(() => vi.restoreAllMocks())
