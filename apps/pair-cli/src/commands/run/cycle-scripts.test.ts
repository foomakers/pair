import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, copyFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import type { Config } from '#registry'
import {
  locateCycleScripts,
  createCycleScriptsBridge,
  classifyCardReadiness,
} from './cycle-scripts'

/**
 * US-487 T-2 — the script bridge: locates the INSTALLED `pair-workflow-cycle` scripts through the
 * same registry `skill-probe.ts` reads (never a hardcoded `.claude/skills` path, never a second copy
 * shipped inside `pair-cli` — epic AC1, story business rule 2), and wraps `resolve`/`worktree`/
 * `packet` as typed functions over the real scripts.
 *
 * `locateCycleScripts`'s FOUND/ABSENT cases are proven against an in-memory tree (mirrors
 * `skill-probe.test.ts` exactly — same registry shape, same fixture style): the property under test
 * there is PATH RESOLUTION, not process execution.
 *
 * `createCycleScriptsBridge`'s wrapper functions are proven by REAL SPAWN against REAL copies of the
 * installed scripts (`.claude/skills/pair-workflow-cycle/scripts/*.mjs`, copied byte-for-byte into a
 * throwaway temp directory) — a fixture standing in for the real producer would be reasoning about a
 * twin instead of exercising the actual contract these scripts already keep with every other cycle
 * stage (US-479 T-20's rule: a producer that takes real inputs is run, not modelled).
 */

const cwd = '/project'

const skillsConfig = (targets: string[], prefix?: string): Config =>
  ({
    asset_registries: {
      skills: {
        source: '.skills',
        behavior: 'overwrite',
        description: 'skills',
        include: [],
        flatten: true,
        ...(prefix && { prefix }),
        targets: targets.map(path => ({ path, mode: 'canonical' as const })),
      },
    },
  }) as unknown as Config

describe('locateCycleScripts', () => {
  it('finds the scripts directory of an installed pair-workflow-cycle, through the skills registry', () => {
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/.claude/skills/pair-workflow-cycle/SKILL.md`]: '',
        [`${cwd}/.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs`]: '',
        [`${cwd}/.claude/skills/pair-workflow-cycle/scripts/cycle-dispatch.mjs`]: '',
      },
      cwd,
      cwd,
    )

    const location = locateCycleScripts(fs, skillsConfig(['.claude/skills/'], 'pair'), cwd)

    expect(location.scriptsDir).toBe(join(cwd, '.claude/skills/pair-workflow-cycle/scripts'))
  })

  it('probes every declared registry target, not just the canonical one (mirrors skill-probe.ts)', () => {
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/.agents/skills/pair-workflow-cycle/SKILL.md`]: '',
        [`${cwd}/.agents/skills/pair-workflow-cycle/scripts/cycle-state.mjs`]: '',
      },
      cwd,
      cwd,
    )

    const location = locateCycleScripts(
      fs,
      skillsConfig(['.claude/skills/', '.agents/skills/'], 'pair'),
      cwd,
    )

    expect(location.scriptsDir).toBe(join(cwd, '.agents/skills/pair-workflow-cycle/scripts'))
  })

  it('HALTs skill-missing, naming pair-workflow-cycle, when the skill is not installed', () => {
    const fs = new InMemoryFileSystemService(
      { [`${cwd}/.claude/skills/pair-loop/SKILL.md`]: '' },
      cwd,
      cwd,
    )

    expect(() => locateCycleScripts(fs, skillsConfig(['.claude/skills/'], 'pair'), cwd)).toThrow(
      /skill-missing/,
    )
    try {
      locateCycleScripts(fs, skillsConfig(['.claude/skills/'], 'pair'), cwd)
    } catch (error) {
      expect(String((error as Error).message)).toMatch(/pair-workflow-cycle/)
    }
  })

  it('never resolves outside the registry target (traversal, mirrors skill-probe.ts round 7)', () => {
    const fs = new InMemoryFileSystemService(
      {
        '/outside/pair-workflow-cycle/scripts/cycle-state.mjs': '',
        [`${cwd}/.claude/skills/pair-loop/SKILL.md`]: '',
      },
      cwd,
      cwd,
    )

    expect(() => locateCycleScripts(fs, skillsConfig(['.claude/skills/'], 'pair'), cwd)).toThrow(
      /skill-missing/,
    )
  })
})

describe('createCycleScriptsBridge — real spawn against the installed scripts', () => {
  let projectRoot: string
  let runsRoot: string

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'pair-cycle-scripts-'))
    const scriptsDir = join(projectRoot, '.claude/skills/pair-workflow-cycle/scripts')
    mkdirSync(scriptsDir, { recursive: true })
    // Byte-for-byte copies of the REAL, installed scripts this repo runs its own cycle on — never a
    // hand-written stand-in for what `resolve`/`worktree`/`packet` actually do.
    const realScriptsDir = join(
      __dirname,
      '../../../../../.claude/skills/pair-workflow-cycle/scripts',
    )
    copyFileSync(join(realScriptsDir, 'cycle-state.mjs'), join(scriptsDir, 'cycle-state.mjs'))
    copyFileSync(join(realScriptsDir, 'cycle-dispatch.mjs'), join(scriptsDir, 'cycle-dispatch.mjs'))
    runsRoot = join(projectRoot, '.pair/working/runs')
  })
  afterEach(() => rmSync(projectRoot, { recursive: true, force: true }))

  const bridge = () =>
    createCycleScriptsBridge({
      scriptsDir: join(projectRoot, '.claude/skills/pair-workflow-cycle/scripts'),
    })

  it('resolve() on an empty run directory returns the real prepare/initial/a0 next (AC1)', () => {
    const dir = join(runsRoot, 'story-487/487')
    const result = bridge().resolve({
      dir,
      workflowVersion: '4.0.1',
      policy: { maxFixRounds: 3, redRepairs: 1, greenRetries: 1, reviewers: 1 },
      entry: 'fresh',
      runsRoot,
    })

    expect(result.status).toBe('empty')
    expect(result.next).toMatchObject({ step: 'prepare', mode: 'initial', phase: 'a0', attempt: 1 })
  })

  it('resolve() on a PR entry starts at {verify, first, r0} — no prepare precedes it (AC2, ADR-024 b)', () => {
    const dir = join(runsRoot, 'story-487/487')
    const prResult = bridge().resolve({
      dir,
      workflowVersion: '4.0.1',
      policy: {},
      entry: 'pr',
      pr: 42,
      story: '487',
      runsRoot,
    })
    expect(prResult.next).toMatchObject({ step: 'verify', mode: 'first', phase: 'r0' })
  })

  it('worktree() propagates a real HALT from cycle-dispatch.mjs verbatim (branch-invalid)', () => {
    expect(() =>
      bridge().worktree({
        main: projectRoot,
        story: '487',
        branch: 'bad ref',
        base: 'origin/main',
      }),
    ).toThrow(/branch-invalid/)
  })

  it('a malformed script output is a typed cycle-state-unreadable HALT, never a silent "assume prepare"', () => {
    // A corrupted install — the exact edge case the story names: "`resolve` output unparseable: HALT
    // `cycle-state-unreadable`, never assume prepare".
    const scriptsDir = join(projectRoot, '.claude/skills/pair-workflow-cycle/scripts')
    writeFileSync(join(scriptsDir, 'cycle-state.mjs'), "process.stdout.write('not json at all')\n")

    expect(() =>
      bridge().resolve({
        dir: join(runsRoot, 'story-487/487'),
        workflowVersion: '4.0.1',
        policy: {},
        entry: 'fresh',
        runsRoot,
      }),
    ).toThrow(/cycle-state-unreadable/)
  })

  it('the scripts directory really exists on disk after the fixture setup (sanity on the harness itself)', () => {
    expect(
      existsSync(join(projectRoot, '.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs')),
    ).toBe(true)
  })
})

/**
 * AC14 — the DoR-gated fallback half of the entry-point discriminator: reads the card's own
 * macrostate (Draft / Refined-without-breakdown / Ready) from the SAME markdown shape the card
 * template produces, never a second source of truth. A pure classification: no PM-tool call lives
 * here (that adapter call is `handler.ts`'s, T-5) — this is the DECISION grammar over the body it is
 * handed.
 */
describe('classifyCardReadiness (AC14)', () => {
  it('classifies a card with no Status: Refined marker as Draft', () => {
    expect(classifyCardReadiness({ status: 'Draft', hasTaskBreakdown: false })).toBe('draft')
  })

  it('classifies Refined with no Task Breakdown section as refined-no-breakdown', () => {
    expect(classifyCardReadiness({ status: 'Refined', hasTaskBreakdown: false })).toBe(
      'refined-no-breakdown',
    )
  })

  it('classifies Refined WITH a task breakdown as ready (DoR satisfied)', () => {
    expect(classifyCardReadiness({ status: 'Refined', hasTaskBreakdown: true })).toBe('ready')
  })

  it('an unrecognised status is refused rather than defaulted to Draft or Ready', () => {
    expect(() => classifyCardReadiness({ status: 'In Progress', hasTaskBreakdown: true })).toThrow(
      /In Progress/,
    )
  })
})
