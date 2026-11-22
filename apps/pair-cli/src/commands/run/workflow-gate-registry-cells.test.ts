import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileSystemService as fs } from '@pair/content-ops'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'
import type { WorkflowHostDependencies } from './workflow-host'

/**
 * #652 r0-4 — `pair run <workflow> --dry-run` checks `with.gates` against the keys of the Custom
 * Gate Registry as the registry writes them: a Key in inline code, or a row with an escaped pipe,
 * is still that key. Through the command's own entry point; a dry run launches nothing, and the
 * launcher here fails the test if it is ever called. The disk is real (a temp project).
 */

const QUICK = `version: 1
name: quick
steps:
  implement:
    kind: implement
    gates: [quality-gate]
  review:
    kind: review
`
const registry = (header: string, row: string) =>
  `### Custom Gate Registry\n\n${header}\n| --- |\n${row}\n`
const HEADER = '| Order | Key | Gate | Command |'

let project: string
let lines: string[]

const write = (path: string, content: string) => {
  fs.mkdirSync(join(project, path, '..'), { recursive: true })
  fs.writeFileSync(join(project, path), content)
}

const dryRun = (wayOfWorking: string, quick = QUICK) => {
  write('.pair/adoption/tech/way-of-working.md', wayOfWorking)
  write('.pair/adoption/tech/workflows/quick.yaml', quick)
  const workflow: WorkflowHostDependencies = {
    runIteration: async () => {
      throw new Error('a dry run launched an agent')
    },
    readCard: async () => ({ title: 'A card' }),
    prepareWorktree: async ({ main, card }) => {
      const dir = join(main, 'worktrees', card)
      fs.mkdirSync(dir, { recursive: true })
      return dir
    },
    engineAvailable: () => true,
  }
  return handleRunCommand(
    parseRunCommand({ card: '627', cwd: project, dryRun: true }, ['quick']),
    fs,
    { workflow },
  )
}

beforeEach(() => {
  project = fs.mkdtempSync(join(tmpdir(), 'pair-workflow-registry-'))
  lines = []
  for (const skill of ['pair-process-implement', 'pair-process-review'])
    write(`.claude/skills/${skill}/SKILL.md`, `# ${skill}\n`)
  const keep = (...args: unknown[]) => void lines.push(args.join(' '))
  vi.spyOn(console, 'log').mockImplementation(keep)
  vi.spyOn(console, 'error').mockImplementation(keep)
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(project, { recursive: true, force: true })
})

describe('pair run quick --dry-run: the registry cells as Markdown writes them (r0-4)', () => {
  it.each([
    [
      'i3 a key written as inline code',
      registry(HEADER, '| 1 | `quality-gate` | Quality Gate | `pnpm quality-gate` |'),
    ],
    [
      'i4 an escaped pipe in a cell before the Key column',
      registry(
        '| Gate | Key | Command |',
        '| Build \\| test | quality-gate | `pnpm quality-gate` |',
      ),
    ],
  ])('%s is a known gate key: the workflow is valid', async (_name, wayOfWorking) => {
    expect(await dryRun(wayOfWorking)).toBe(0)

    expect(lines).toContain('  Dry run: the workflow is valid; nothing was launched.')
    expect(lines.filter(line => line.includes('unknown gate key'))).toEqual([])
  })

  it('i5 refusing another key names the registry key without its backticks', async () => {
    const wayOfWorking = registry(
      HEADER,
      '| 1 | `quality-gate` | Quality Gate | `pnpm quality-gate` |',
    )

    expect(await dryRun(wayOfWorking, QUICK.replace('[quality-gate]', '[e2e]'))).toBe(1)

    expect(lines.filter(line => line.includes('unknown gate key')).join('\n')).toMatch(
      /unknown gate key 'e2e' — fix: use one of quality-gate$/,
    )
  })

  it('c7 a plain key is a known gate key', async () => {
    const wayOfWorking = registry(
      HEADER,
      '| 1 | quality-gate | Quality Gate | `pnpm quality-gate` |',
    )

    expect(await dryRun(wayOfWorking)).toBe(0)

    expect(lines).toContain('  Dry run: the workflow is valid; nothing was launched.')
  })
})
