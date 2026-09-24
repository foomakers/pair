import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { execFileSync } from 'child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'
import type { LockAcquirer } from './card-lock'

/**
 * US-487 review r0-10 — the cycle's defaults (workflow version, base branch, worktree root,
 * dispatch cap) are the INSTALLED scripts' decision, never a TypeScript literal passed as one.
 *
 * The installed `cycle-state.mjs` here declares values that differ from pair-cli's mirrors
 * (`4.0.9`, `origin/trunk`, `../elsewhere-worktrees`, cap 7). The run goes through
 * `handleRunCommand` and the PRODUCTION driver over those real scripts; only `gh` and the engine
 * binary (a dead dispatch) are stood in for. Every observable — the transparency block, the
 * worktree the script created, the base it was cut from, the version the packet carries — must be
 * the installed scripts' own.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')

describe('r0-10: the cycle defaults come from the installed scripts', () => {
  let root: string
  let main: string
  let log: string
  let trunk: string

  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-installed-defaults-')))
    main = join(root, 'main')
    const bin = join(root, 'bin')
    log = join(root, 'engine.log')
    mkdirSync(main, { recursive: true })
    mkdirSync(bin, { recursive: true })
    git(main, 'init', '-q', '-b', 'main')
    git(
      main,
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@t',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'a',
    )
    git(main, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
    git(
      main,
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@t',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'b',
    )
    trunk = git(main, 'rev-parse', 'HEAD')
    git(main, 'update-ref', 'refs/remotes/origin/trunk', trunk)
    git(main, 'reset', '-q', '--hard', 'origin/main')

    const scripts = join(main, '.claude/skills/pair-workflow-cycle/scripts')
    mkdirSync(scripts, { recursive: true })
    const source = (f: string) =>
      readFileSync(join(REPO_ROOT, '.claude/skills/pair-workflow-cycle/scripts', f), 'utf8')
    const state = source('cycle-state.mjs')
      .replace(/export const WORKFLOW_VERSION = '[^']+'/, "export const WORKFLOW_VERSION = '4.0.9'")
      .replace("worktreeRoot: '../pair-worktrees'", "worktreeRoot: '../elsewhere-worktrees'")
      .replace("baseBranch: 'origin/main'", "baseBranch: 'origin/trunk'")
      .replace('dispatchesPerStory: 40', 'dispatchesPerStory: 7')
    expect(state).toContain("'4.0.9'")
    expect(state).toContain('elsewhere-worktrees')
    expect(state).toContain("'origin/trunk'")
    expect(state).toContain('dispatchesPerStory: 7')
    writeFileSync(join(scripts, 'cycle-state.mjs'), state)
    writeFileSync(join(scripts, 'cycle-dispatch.mjs'), source('cycle-dispatch.mjs'))
    // US-492: the PM/code-host adapters ship beside the scripts, in `host/`.
    cpSync(
      join(REPO_ROOT, '.claude/skills/pair-workflow-cycle/scripts/host'),
      join(scripts, 'host'),
      { recursive: true },
    )
    cpSync(join(REPO_ROOT, '.claude/agents'), join(main, '.claude/agents'), { recursive: true })

    writeFileSync(
      join(bin, 'gh'),
      `#!/usr/bin/env node
const a = process.argv.slice(2)
const body = '**Status**: Refined\\n\\n## Task Breakdown\\n\\n- [ ] T-1\\n'
if (a[0] === 'issue' && a[1] === 'view') process.stdout.write(a.includes('-q') ? body : JSON.stringify({ title: 'A story', body }))
else process.exit(1)
`,
    )
    chmodSync(join(bin, 'gh'), 0o755)
    writeFileSync(
      join(bin, 'fake-engine'),
      `#!/usr/bin/env node
require('fs').appendFileSync(process.env.FAKE_ENGINE_LOG, JSON.stringify(process.argv.slice(2)) + '\\n')
process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success' }) + '\\n')
`,
    )
    chmodSync(join(bin, 'fake-engine'), 0o755)
    vi.stubEnv('PATH', `${bin}:${process.env['PATH'] ?? ''}`)
    vi.stubEnv('PAIR_GH_BIN', join(bin, 'gh'))
    vi.stubEnv('FAKE_ENGINE_LOG', log)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    rmSync(root, { recursive: true, force: true })
  })

  async function run(): Promise<{ code: number; output: string }> {
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '))
    })
    const engine = join(root, 'bin', 'fake-engine')
    const fs = new InMemoryFileSystemService(
      {
        [`${main}/config.json`]: JSON.stringify({
          asset_registries: {
            skills: {
              source: '.skills',
              behavior: 'overwrite',
              description: 'skills',
              prefix: 'pair',
              targets: [{ path: '.claude/skills/', mode: 'canonical' }],
            },
          },
        }),
        [`${main}/pair.config.json`]: JSON.stringify({
          engine: { id: 'claude', bin: { claude: engine } },
        }),
        [`${main}/.claude/skills/pair-workflow-cycle/SKILL.md`]: '',
        [engine]: '',
      },
      main,
      main,
    )
    const acquireLock = (({ card }: { card: string }) => ({
      kind: 'acquired' as const,
      lock: { path: `/locks/${card}`, release: () => {} },
    })) as LockAcquirer
    const code = await handleRunCommand(
      parseRunCommand({ card: '7', cardTags: '', autonomous: true }),
      fs,
      { acquireLock, appendAudit: () => {}, cardReadiness: async () => 'ready' as const },
    )
    return { code, output: lines.join('\n') }
  }

  it('R10-W1: the transparency block prints the installed worktree root and dispatch cap', async () => {
    const { output } = await run()

    expect(output).toMatch(/^\s*Worktree root: \.\.\/elsewhere-worktrees\s*$/m)
    expect(output).toMatch(/^\s*Dispatch cap: 7\s*$/m)
  }, 60_000)

  it('R10-W2: the story worktree lands under the installed root, cut from the installed base', async () => {
    await run()

    const worktree = join(root, 'elsewhere-worktrees', '7')
    expect(existsSync(worktree)).toBe(true)
    expect(existsSync(join(root, 'pair-worktrees', '7'))).toBe(false)
    expect(git(worktree, 'rev-parse', 'HEAD')).toBe(trunk)
  }, 60_000)

  it('R10-W3: the stage packet carries the installed workflow version', async () => {
    await run()

    const first = readFileSync(log, 'utf8').split('\n').filter(Boolean)[0]!
    const argv = JSON.parse(first) as string[]
    expect(argv[argv.length - 1]).toContain('$workflowVersion=4.0.9')
  }, 60_000)
})
