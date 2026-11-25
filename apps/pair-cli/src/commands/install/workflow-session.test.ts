import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { fileSystemService } from '@pair/content-ops'
import { handleInstallCommand } from './handler'

const CLI = join(__dirname, '../../..')
const DATASET = join(CLI, '../../packages/knowledge-hub/dataset')
const roots: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

it.each([
  { prefix: 'pair', target: '.claude/skills', skills: undefined },
  { prefix: 'team', target: '.claude/skills', skills: { prefix: 'team' } },
  {
    prefix: 'team',
    target: 'team/skills',
    skills: { prefix: 'team', targets: [{ path: 'team/skills', mode: 'canonical' }] },
  },
])(
  'R754-06 / AC-8: runs installed $prefix skills from $target',
  async ({ prefix, target, skills }) => {
    const root = mkdtempSync(join(tmpdir(), 'pair-install-session-'))
    roots.push(root)
    const fs = {
      ...fileSystemService,
      currentWorkingDirectory: () => root,
      rootModuleDirectory: () => CLI,
    }
    vi.spyOn(console, 'log').mockImplementation(() => {})
    writeFileSync(
      join(root, 'pair.config.json'),
      JSON.stringify({
        worktreeRoot: 'worktrees',
        ...(skills !== undefined && { asset_registries: { skills } }),
      }),
    )
    expect(
      await handleInstallCommand(
        {
          command: 'install',
          resolution: 'local',
          path: DATASET,
          offline: true,
          kb: false,
          target: root,
        },
        fs,
      ),
    ).toBe(0)

    const write = (path: string, value: string) => {
      const file = join(root, path)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, value)
    }
    const adoption =
      '- `pm-tool`: `filesystem`\n\n## State Mapping\n\n| Board State | Macrostate |\n| --- | --- |\n| Todo | Draft |\n'
    write('.pair/adoption/tech/way-of-working.md', adoption)
    write(
      '.pair/adoption/product/backlog/03-user-stories/not-started/42.md',
      `
# Prepare release notes

**Status**: Todo

## Story Statement

As a maintainer
I want release notes
So that I can announce the release

## Task Breakdown

- [ ] Draft the notes

## Technical Analysis

Design: not required
`,
    )
    write(
      '.pair/adoption/tech/workflows/installed.yaml',
      `version: 1
name: installed
steps:
  refine: { kind: refine-story }
  estimate: { kind: generic, skill: ${prefix}-capability-estimate }
`,
    )
    const runSkill = join(root, target, `${prefix}-workflow-run`, 'SKILL.md')
    const runner = join(root, target, `${prefix}-capability-workflow/scripts/workflow.mjs`)
    const link = /\[workflow script\]\(([^)]+)\)/.exec(readFileSync(runSkill, 'utf8'))?.[1]
    expect.soft(link && resolve(dirname(runSkill), link)).toBe(runner)
    const invoke = (file: string, ...args: string[]) =>
      spawnSync(process.execPath, [file, ...args], { cwd: root, encoding: 'utf8', timeout: 5_000 })
    const ready = invoke(
      join(root, target, `${prefix}-workflow-cycle/scripts/workflow-facts.mjs`),
      'board-state',
      '42',
      JSON.stringify({ state: 'Ready', adoption }),
    )
    expect.soft(ready.status, ready.stderr || ready.stdout).toBe(0)
    expect.soft(ready.stdout).toContain('"confirmed":true')
    const validated = invoke(runner, 'validate', 'installed')
    expect(validated.status, validated.stderr || validated.stdout).toBe(0)

    for (const args of [
      ['init', '-b', 'main'],
      [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.test',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '--allow-empty',
        '-m',
        'Fixture',
      ],
    ]) {
      const git = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
      expect(git.status, git.stderr).toBe(0)
    }
    const opened = invoke(runner, 'start', 'installed', '--card', '42', '--engine', 'codex')
    expect(opened.status, opened.stderr || opened.stdout).toBe(0)
    const { runId, lease } = JSON.parse(opened.stdout)
    const advanced = invoke(runner, 'next', runId, '--lease', lease)
    expect(advanced.status, advanced.stderr || advanced.stdout).toBe(0)
    expect(JSON.parse(advanced.stdout)).toMatchObject({
      ready: [
        {
          uses: `${prefix}-process-refine-story`,
          message: expect.stringContaining(`Run the ${prefix}-process-refine-story skill.`),
        },
      ],
    })
  },
  15_000,
)
