import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { spawnSync } from 'child_process'
import { fileSystemService } from '@pair/content-ops'
import { handleInstallCommand } from './handler'
import { handleUpdateCommand } from '../update/handler'

// #617 AC-16: use the public commands, shipped dataset and real filesystem; only console output is muted.
const CLI = join(__dirname, '..', '..', '..')
const DATASET = join(CLI, '..', '..', 'packages/knowledge-hub/dataset')
const PROFILES = '.pair/adoption/tech/workflow-profiles'
const PRESETS = [
  'claude-cheap',
  'claude-medium',
  'claude-high',
  'codex-cheap',
  'codex-medium',
  'codex-high',
]
const roots: string[] = []

function project() {
  const root = mkdtempSync(join(tmpdir(), 'pair-install-presets-'))
  roots.push(root)
  const fs = {
    ...fileSystemService,
    currentWorkingDirectory: () => root,
    rootModuleDirectory: () => CLI,
  }
  vi.spyOn(console, 'log').mockImplementation(() => {})
  return { root, fs }
}

function installedProfile(root: string, host: string) {
  const result = spawnSync(
    process.execPath,
    [
      join(root, '.claude/skills/pair-workflow-cycle/scripts/workflow-profile.mjs'),
      'resolve',
      '--root',
      root,
      '--host',
      host,
    ],
    { encoding: 'utf8' },
  )
  expect(result.status, result.stderr || result.stdout).toBe(0)
  return JSON.parse(result.stdout) as {
    name: string
    stages: { implement: { model: { resolved: { id: string } } } }
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('#617 AC-16 shipped workflow presets', () => {
  it('fresh installation supplies six presets and selects medium for each actual host', async () => {
    const { root, fs } = project()
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
    const config = JSON.parse(readFileSync(join(root, 'pair.config.json'), 'utf8'))
    expect(config.workflowProfiles.default).toEqual({
      codex: 'codex-medium',
      claude: 'claude-medium',
    })
    expect(
      readdirSync(join(root, PROFILES))
        .filter(name => name.endsWith('.json'))
        .sort(),
    ).toEqual(PRESETS.map(name => `${name}.json`).sort())
    expect(installedProfile(root, 'codex').name).toBe('codex-medium')
    expect(installedProfile(root, 'codex').stages.implement.model.resolved.id).toBe('gpt-6-sol')
    expect(installedProfile(root, 'claude').name).toBe('claude-medium')
    expect(installedProfile(root, 'claude').stages.implement.model.resolved.id).toBe(
      'claude-sonnet-5-5',
    )
    // AC-16 + existing #550 round-trip: runtime defaults must not hide the registry declaration.
    const zip = `${root}.zip`
    roots.push(zip)
    const cli = join(CLI, 'dist/cli.js')
    const validated = spawnSync(process.execPath, [cli, 'validate-config'], {
      cwd: root,
      env: { ...process.env, INIT_CWD: root },
      encoding: 'utf8',
      timeout: 15000,
    })
    expect(validated.status, validated.stderr || validated.stdout).toBe(0)
    expect(validated.stdout).toMatch(/Configuration valid \([1-9]\d* registries\)/)
    const targets = spawnSync(process.execPath, [cli, 'install', '--list-targets'], {
      cwd: root,
      env: { ...process.env, INIT_CWD: root },
      encoding: 'utf8',
      timeout: 15000,
    })
    expect(targets.status, targets.stderr || targets.stdout).toBe(0)
    expect(targets.stdout).toMatch(
      /project-config\s+target:\s+pair\.config\.json\s+behavior:\s+add/,
    )

    const packaged = spawnSync(process.execPath, [cli, 'package', '--output', zip], {
      cwd: root,
      env: { ...process.env, INIT_CWD: root },
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: 8 * 1024 * 1024,
    })
    expect(packaged.status, packaged.stderr || packaged.stdout).toBe(0)
    const verified = spawnSync(process.execPath, [cli, 'kb-verify', zip, '--json'], {
      cwd: root,
      env: { ...process.env, INIT_CWD: root },
      encoding: 'utf8',
      timeout: 15000,
    })
    expect(verified.status, verified.stderr || verified.stdout).toBe(0)
    const destination = mkdtempSync(join(tmpdir(), 'pair-presets-roundtrip-'))
    roots.push(destination)
    const reinstalled = spawnSync(
      process.execPath,
      [cli, 'install', '--source', zip, '--offline', '--no-kb'],
      {
        cwd: destination,
        env: { ...process.env, INIT_CWD: destination },
        encoding: 'utf8',
        timeout: 15000,
        maxBuffer: 8 * 1024 * 1024,
      },
    )
    expect(reinstalled.status, reinstalled.stderr || reinstalled.stdout).toBe(0)
    expect(installedProfile(destination, 'codex').name).toBe('codex-medium')
    expect(installedProfile(destination, 'claude').name).toBe('claude-medium')
    expect(
      readdirSync(join(destination, PROFILES))
        .filter(name => name.endsWith('.json'))
        .sort(),
    ).toEqual(PRESETS.map(name => `${name}.json`).sort())
  }, 20000)

  it.each(['install', 'update'] as const)(
    '%s preserves custom config/profile bytes while supplying missing presets',
    async operation => {
      const { root, fs } = project()
      mkdirSync(join(root, PROFILES), { recursive: true })
      const configBytes =
        '{ "workflowProfiles": { "default": "codex-medium", "files": ".pair/adoption/tech/workflow-profiles/*.json" } }\n'
      const profileBytes =
        '{ "name": "codex-medium", "defaults": { "engine": "codex", "model": "gpt-custom" } }\n'
      writeFileSync(join(root, 'pair.config.json'), configBytes)
      writeFileSync(join(root, PROFILES, 'codex-medium.json'), profileBytes)
      const result =
        operation === 'install'
          ? await handleInstallCommand(
              {
                command: 'install',
                resolution: 'local',
                path: DATASET,
                offline: true,
                kb: false,
                target: root,
              },
              fs,
            )
          : await handleUpdateCommand(
              {
                command: 'update',
                resolution: 'local',
                path: DATASET,
                offline: true,
                kb: false,
                target: root,
              },
              fs,
            )
      expect(result).toBe(0)
      expect(readFileSync(join(root, 'pair.config.json'), 'utf8')).toBe(configBytes)
      expect(readFileSync(join(root, PROFILES, 'codex-medium.json'), 'utf8')).toBe(profileBytes)
      for (const name of PRESETS)
        expect(existsSync(join(root, PROFILES, `${name}.json`))).toBe(true)
      expect(installedProfile(root, 'codex').stages.implement.model.resolved.id).toBe('gpt-custom')
    },
    20000,
  )
})
