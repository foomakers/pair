import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops/test-utils/in-memory-fs'
import { handleScaffoldKbCommand } from './handler'
import type { ScaffoldKbCommandConfig } from './parser'

const cwd = '/work/acme-kb'

function config(overrides: Partial<ScaffoldKbCommandConfig> = {}): ScaffoldKbCommandConfig {
  return { command: 'scaffold-kb', path: '.', host: 'github', force: false, ...overrides }
}

function newFs(seed: Record<string, string> = {}) {
  return new InMemoryFileSystemService(seed, cwd, cwd)
}

describe('handleScaffoldKbCommand', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('scaffolds a pure KB repo in the current directory', async () => {
    const fs = newFs()

    await handleScaffoldKbCommand(config(), fs)

    expect(fs.existsSync(`${cwd}/pair.config.json`)).toBe(true)
    expect(fs.existsSync(`${cwd}/README.md`)).toBe(true)
    expect(fs.existsSync(`${cwd}/.gitignore`)).toBe(true)
    expect(fs.existsSync(`${cwd}/scripts/release.sh`)).toBe(true)
    expect(fs.existsSync(`${cwd}/.github/workflows/release.yml`)).toBe(true)
    expect(fs.existsSync(`${cwd}/.pair/knowledge/README.md`)).toBe(true)
    expect(fs.existsSync(`${cwd}/.skills/example-skill/SKILL.md`)).toBe(true)
  })

  it('never scaffolds .pair/adoption — a KB is knowledge, not a configured project', async () => {
    const fs = newFs()

    await handleScaffoldKbCommand(config(), fs)

    expect(fs.existsSync(`${cwd}/.pair/adoption`)).toBe(false)
  })

  it('derives the KB name from the target directory when not given', async () => {
    const fs = newFs()

    await handleScaffoldKbCommand(config(), fs)

    const parsed = JSON.parse(fs.readFileSync(`${cwd}/pair.config.json`))
    expect(parsed.asset_registries.skills.prefix).toBe('acme-kb')
  })

  it('honours an explicit name', async () => {
    const fs = newFs()

    await handleScaffoldKbCommand(config({ name: 'Globex Standards' }), fs)

    expect(fs.readFileSync(`${cwd}/README.md`)).toContain('# Globex Standards')
  })

  it('scaffolds into a relative sub-path', async () => {
    const fs = newFs()

    await handleScaffoldKbCommand(config({ path: 'nested/kb' }), fs)

    expect(fs.existsSync(`${cwd}/nested/kb/pair.config.json`)).toBe(true)
  })

  it('scaffolds into an absolute path outside the working directory', async () => {
    const fs = newFs()

    await handleScaffoldKbCommand(config({ path: '/elsewhere/globex-kb' }), fs)

    expect(fs.existsSync('/elsewhere/globex-kb/pair.config.json')).toBe(true)
    expect(fs.readFileSync('/elsewhere/globex-kb/README.md')).toContain('# globex-kb')
  })

  it('re-running against its own output is idempotent (no prompts, no corruption)', async () => {
    const fs = newFs()
    await handleScaffoldKbCommand(config(), fs)
    const before = fs.readFileSync(`${cwd}/pair.config.json`)
    let prompted = 0

    await handleScaffoldKbCommand(config(), fs, {
      confirmOverwrite: async () => {
        prompted += 1
        return true
      },
    })

    expect(prompted).toBe(0)
    expect(fs.readFileSync(`${cwd}/pair.config.json`)).toBe(before)
  })

  it('preserves authored KB content on re-scaffold', async () => {
    const fs = newFs()
    await handleScaffoldKbCommand(config(), fs)
    await fs.writeFile(`${cwd}/.pair/knowledge/README.md`, '# hand-authored\n')
    await fs.writeFile(`${cwd}/.skills/example-skill/SKILL.md`, '# hand-authored skill\n')

    await handleScaffoldKbCommand(config(), fs, { confirmOverwrite: async () => true })

    expect(fs.readFileSync(`${cwd}/.pair/knowledge/README.md`)).toBe('# hand-authored\n')
    expect(fs.readFileSync(`${cwd}/.skills/example-skill/SKILL.md`)).toBe('# hand-authored skill\n')
  })

  it('asks before overwriting a customized scaffold-owned file', async () => {
    const fs = newFs()
    await handleScaffoldKbCommand(config(), fs)
    await fs.writeFile(`${cwd}/.gitignore`, 'dist/\nmy-own-rule\n')
    const asked: string[] = []

    await handleScaffoldKbCommand(config(), fs, {
      confirmOverwrite: async path => {
        asked.push(path)
        return false
      },
    })

    expect(asked).toEqual(['.gitignore'])
    expect(fs.readFileSync(`${cwd}/.gitignore`)).toBe('dist/\nmy-own-rule\n')
  })

  it('omits the GitHub workflow on the generic host', async () => {
    const fs = newFs()

    await handleScaffoldKbCommand(config({ host: 'generic' }), fs)

    expect(fs.existsSync(`${cwd}/.github/workflows/release.yml`)).toBe(false)
    expect(fs.existsSync(`${cwd}/scripts/release.sh`)).toBe(true)
  })

  it('prints the scaffold report', async () => {
    const fs = newFs()

    await handleScaffoldKbCommand(config(), fs)

    const printed = vi.mocked(console.log).mock.calls.flat().join('\n')
    expect(printed).toContain('bash scripts/release.sh')
  })
})
