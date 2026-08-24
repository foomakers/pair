import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { handleCoverageRatchetCommand } from './handler'
import type { CoverageRatchetCommandConfig } from './parser'

/**
 * The command's decisions are unit-tested white-box in `ratchet.test.ts` and its
 * WRITE path is exercised end-to-end by the `coverage-gate.sh` smoke scenario
 * (gate-tooling ADL 2026-07-13). What is asserted here is the one property the
 * wiring itself owns: an invocation that must not write does not write, and says
 * why — the state every adopter is in by default.
 */
const CONFIG = ['```ini', 'target.default=70', 'baseline.backend=80', '```', ''].join('\n')

function fixture(wayOfWorking: string): { configPath: string; wowPath: string } {
  const dir = mkdtempSync(join(tmpdir(), 'pair-ratchet-'))
  const configPath = join(dir, 'coverage-baseline.md')
  const wowPath = join(dir, 'way-of-working.md')
  writeFileSync(configPath, CONFIG)
  writeFileSync(wowPath, wayOfWorking)
  return { configPath, wowPath }
}

function command(paths: { configPath: string; wowPath: string }): CoverageRatchetCommandConfig {
  return {
    command: 'coverage-ratchet',
    configPath: paths.configPath,
    wowPath: paths.wowPath,
    // Well above the committed baseline: only the flags may stop this run.
    measured: { backend: '99' },
    baseBranch: 'main',
    remote: 'origin',
    marginPp: 1,
    dryRun: true,
  }
}

// `runRatchet` anchors to the repository root (`git rev-parse`), so the working
// directory must be put back or every later test in this worker inherits it.
const cwd = process.cwd()
afterEach(() => {
  process.chdir(cwd)
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('handleCoverageRatchetCommand', () => {
  it('writes nothing and names the reason when the opt-in is absent (the default state)', async () => {
    const paths = fixture('# way of working\n\n- **Coverage guardrail**: `enabled`\n')
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await handleCoverageRatchetCommand(command(paths))

    const output = log.mock.calls.map(args => String(args[0])).join('\n')
    expect(output).toContain('SKIPPED (flag-disabled)')
    expect(readFileSync(paths.configPath, 'utf-8')).toBe(CONFIG)
  })

  it('writes nothing when the parent guardrail is off, even with the opt-in on', async () => {
    const paths = fixture('# way of working\n\n- **Coverage baseline commit-back**: `enabled`\n')
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await handleCoverageRatchetCommand(command(paths))

    const output = log.mock.calls.map(args => String(args[0])).join('\n')
    expect(output).toContain('SKIPPED (guardrail-disabled)')
    expect(readFileSync(paths.configPath, 'utf-8')).toBe(CONFIG)
  })

  it('warns and still succeeds when the coverage config cannot be read', async () => {
    // Persistence must never be able to fail the coverage gate that ran before
    // it: an unreadable file is a warning, not a rejected promise and not a
    // non-zero exit.
    const paths = fixture(
      '- **Coverage guardrail**: `enabled`\n- **Coverage baseline commit-back**: `enabled`\n',
    )
    vi.stubEnv('GITHUB_EVENT_NAME', 'push')
    vi.stubEnv('GITHUB_REF_NAME', 'main')
    vi.stubEnv('PAIR_RATCHET_HEAD_COMMIT_MESSAGE', 'feat: a human commit')
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await expect(
      handleCoverageRatchetCommand({
        ...command(paths),
        configPath: join(paths.configPath, 'nope', 'missing.md'),
      }),
    ).resolves.toBeUndefined()

    const output = log.mock.calls.map(args => String(args[0])).join('\n')
    expect(output).toContain('::warning::')
    expect(output).toContain("the coverage gate's verdict is unaffected")
  })
})
