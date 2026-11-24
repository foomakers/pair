import { afterEach, expect, it, vi } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { parse } from 'yaml'
import { fileSystemService as fs } from '@pair/content-ops'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'

it('previews the expanded IDs in frozen execution order (699 AC-6)', async () => {
  const project = fs.mkdtempSync(join(tmpdir(), 'pair-include-preview-'))
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
      'version: 1\nname: root\nsteps:\n  first: { kind: generic, skill: my-skill }\n  shared: { kind: generic, uses: shared }\n  last: { kind: generic, skill: my-skill }\n',
    )
    write(
      '.pair/adoption/tech/workflows/shared.yaml',
      'version: 1\nname: shared\nsteps:\n  one: { kind: generic, skill: my-skill }\n  two: { kind: generic, skill: my-skill }\n',
    )
    vi.spyOn(console, 'log').mockImplementation(
      (...args: unknown[]) => void lines.push(args.join(' ')),
    )
    vi.spyOn(console, 'error').mockImplementation(
      (...args: unknown[]) => void lines.push(args.join(' ')),
    )
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const run = (dryRun: boolean) =>
      handleRunCommand(parseRunCommand({ card: '699', cwd: project, dryRun }, ['root']), fs, {
        workflow: {
          readCard: async () => ({ title: 'A card' }),
          engineAvailable: () => true,
          prepareWorktree: async () => project,
          runIteration: async input => {
            launches++
            input.onEvent?.({
              type: 'result',
              subtype: 'success',
              result: '```json\n{"status":"ok","summary":"done"}\n```',
            })
            return { outcome: 'success', detail: 'success' }
          },
        },
      })
    expect(await run(true), lines.join('\n')).toBe(0)
    expect(launches).toBe(0)
    const preview = lines.flatMap(line => {
      const match = /^ {2}([\w/-]+): generic\b/.exec(line)
      return match ? [match[1]] : []
    })
    expect(await run(false), lines.join('\n')).toBe(0)
    const frozen = parse(
      fs.readFileSync(join(project, '.pair/working/runs/root-699/workflow.yaml')),
    ) as {
      steps: Record<string, unknown>
    }
    expect(Object.keys(frozen.steps)).toEqual(['first', 'shared/one', 'shared/two', 'last'])
    expect(preview).toEqual(Object.keys(frozen.steps))
  } finally {
    fs.rmSync(project, { recursive: true, force: true })
  }
})

afterEach(() => vi.restoreAllMocks())
