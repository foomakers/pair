import { describe, it, expect } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops/test-utils/in-memory-fs'
import { applyScaffoldPlan } from './apply-plan'
import type { ScaffoldPlan } from './scaffold-plan'

const root = '/work/acme-kb'

function plan(): ScaffoldPlan {
  return {
    root,
    directories: ['.pair/knowledge', '.skills'],
    files: [
      { path: 'pair.config.json', content: '{"owned":true}\n', kind: 'scaffold-owned' },
      { path: '.pair/knowledge/README.md', content: '# seed\n', kind: 'seed' },
    ],
  }
}

function newFs(seed: Record<string, string> = {}) {
  return new InMemoryFileSystemService(seed, root, root)
}

function actionFor(outcomes: { path: string; action: string }[], path: string) {
  return outcomes.find(o => o.path === path)?.action
}

const alwaysConfirm = async () => true
const neverConfirm = async () => false

describe('applyScaffoldPlan', () => {
  it('creates directories and files on a fresh target', async () => {
    const fs = newFs()

    const result = await applyScaffoldPlan(plan(), fs, {
      force: false,
      confirmOverwrite: neverConfirm,
    })

    expect(fs.existsSync(`${root}/.skills`)).toBe(true)
    expect(fs.readFileSync(`${root}/pair.config.json`)).toBe('{"owned":true}\n')
    expect(fs.readFileSync(`${root}/.pair/knowledge/README.md`)).toBe('# seed\n')
    expect(result.outcomes.every(o => o.action === 'created')).toBe(true)
  })

  it('reports identical files as unchanged and never prompts (idempotent re-run)', async () => {
    const fs = newFs()
    await applyScaffoldPlan(plan(), fs, { force: false, confirmOverwrite: neverConfirm })

    let prompted = 0
    const result = await applyScaffoldPlan(plan(), fs, {
      force: false,
      confirmOverwrite: async () => {
        prompted += 1
        return true
      },
    })

    expect(prompted).toBe(0)
    expect(result.outcomes.map(o => o.action)).toEqual(['unchanged', 'unchanged'])
  })

  it('never overwrites authored KB content, even when confirmation is granted', async () => {
    const fs = newFs({ [`${root}/.pair/knowledge/README.md`]: '# my own knowledge\n' })

    const result = await applyScaffoldPlan(plan(), fs, {
      force: true,
      confirmOverwrite: alwaysConfirm,
    })

    expect(fs.readFileSync(`${root}/.pair/knowledge/README.md`)).toBe('# my own knowledge\n')
    expect(actionFor(result.outcomes, '.pair/knowledge/README.md')).toBe('skipped')
  })

  it('asks before overwriting a modified scaffold-owned file and skips on refusal', async () => {
    const fs = newFs({ [`${root}/pair.config.json`]: '{"custom":true}\n' })
    const asked: string[] = []

    const result = await applyScaffoldPlan(plan(), fs, {
      force: false,
      confirmOverwrite: async path => {
        asked.push(path)
        return false
      },
    })

    expect(asked).toEqual(['pair.config.json'])
    expect(fs.readFileSync(`${root}/pair.config.json`)).toBe('{"custom":true}\n')
    expect(actionFor(result.outcomes, 'pair.config.json')).toBe('skipped')
  })

  it('regenerates a modified scaffold-owned file once confirmed', async () => {
    const fs = newFs({ [`${root}/pair.config.json`]: '{"custom":true}\n' })

    const result = await applyScaffoldPlan(plan(), fs, {
      force: false,
      confirmOverwrite: alwaysConfirm,
    })

    expect(fs.readFileSync(`${root}/pair.config.json`)).toBe('{"owned":true}\n')
    expect(actionFor(result.outcomes, 'pair.config.json')).toBe('overwritten')
  })

  it('overwrites scaffold-owned files without prompting under force', async () => {
    const fs = newFs({ [`${root}/pair.config.json`]: '{"custom":true}\n' })
    let prompted = 0

    const result = await applyScaffoldPlan(plan(), fs, {
      force: true,
      confirmOverwrite: async () => {
        prompted += 1
        return true
      },
    })

    expect(prompted).toBe(0)
    expect(actionFor(result.outcomes, 'pair.config.json')).toBe('overwritten')
  })

  it('writes a file marked executable with mode 0o755 (release script carries a shebang)', async () => {
    const fs = newFs()
    const scriptPlan: ScaffoldPlan = {
      root,
      directories: [],
      files: [
        {
          path: 'scripts/release.sh',
          content: '#!/usr/bin/env bash\n',
          kind: 'scaffold-owned',
          executable: true,
        },
      ],
    }

    await applyScaffoldPlan(scriptPlan, fs, { force: false, confirmOverwrite: neverConfirm })

    expect(fs.getMode(`${root}/scripts/release.sh`)).toBe(0o755)
  })

  it('does not set the executable bit on a file not marked executable', async () => {
    const fs = newFs()

    await applyScaffoldPlan(plan(), fs, { force: false, confirmOverwrite: neverConfirm })

    expect(fs.getMode(`${root}/pair.config.json`)).toBeUndefined()
  })

  it('repairs the executable bit on an unchanged file scaffolded before it was set', async () => {
    const fs = newFs({ [`${root}/scripts/release.sh`]: '#!/usr/bin/env bash\n' })
    const scriptPlan: ScaffoldPlan = {
      root,
      directories: [],
      files: [
        {
          path: 'scripts/release.sh',
          content: '#!/usr/bin/env bash\n',
          kind: 'scaffold-owned',
          executable: true,
        },
      ],
    }

    const result = await applyScaffoldPlan(scriptPlan, fs, {
      force: false,
      confirmOverwrite: neverConfirm,
    })

    expect(actionFor(result.outcomes, 'scripts/release.sh')).toBe('unchanged')
    expect(fs.getMode(`${root}/scripts/release.sh`)).toBe(0o755)
  })

  it('leaves the mode alone on a skipped file, so the "kept" report stays truthful', async () => {
    // Maintainer customized the script AND tightened its permissions, then declines
    // regeneration (or runs unattended, no TTY): resetting the mode to 0755 here would
    // change the file on disk while the report line says it was kept.
    const fs = newFs({ [`${root}/scripts/release.sh`]: '#!/usr/bin/env bash\n# customized\n' })
    await fs.chmod(`${root}/scripts/release.sh`, 0o700)
    const scriptPlan: ScaffoldPlan = {
      root,
      directories: [],
      files: [
        {
          path: 'scripts/release.sh',
          content: '#!/usr/bin/env bash\n',
          kind: 'scaffold-owned',
          executable: true,
        },
      ],
    }

    const result = await applyScaffoldPlan(scriptPlan, fs, {
      force: false,
      confirmOverwrite: neverConfirm,
    })

    expect(actionFor(result.outcomes, 'scripts/release.sh')).toBe('skipped')
    expect(fs.readFileSync(`${root}/scripts/release.sh`)).toBe(
      '#!/usr/bin/env bash\n# customized\n',
    )
    expect(fs.getMode(`${root}/scripts/release.sh`)).toBe(0o700)
  })

  it('leaves the mode alone on a skipped seed file', async () => {
    const fs = newFs({ [`${root}/.skills/example-skill/run.sh`]: '#!/usr/bin/env bash\n# mine\n' })
    await fs.chmod(`${root}/.skills/example-skill/run.sh`, 0o600)
    const seedPlan: ScaffoldPlan = {
      root,
      directories: [],
      files: [
        {
          path: '.skills/example-skill/run.sh',
          content: '#!/usr/bin/env bash\n',
          kind: 'seed',
          executable: true,
        },
      ],
    }

    const result = await applyScaffoldPlan(seedPlan, fs, {
      force: true,
      confirmOverwrite: alwaysConfirm,
    })

    expect(actionFor(result.outcomes, '.skills/example-skill/run.sh')).toBe('skipped')
    expect(fs.getMode(`${root}/.skills/example-skill/run.sh`)).toBe(0o600)
  })
})
