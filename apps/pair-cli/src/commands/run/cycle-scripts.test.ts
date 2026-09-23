import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  cpSync,
  existsSync,
  chmodSync,
  readFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import type { Config } from '#registry'
import { spawnSync } from 'child_process'
import {
  locateCycleScripts,
  createCycleScriptsBridge,
  classifyCardReadiness,
  CYCLE_WORKFLOW_VERSION,
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
  afterEach(() => {
    vi.unstubAllEnvs()
    rmSync(projectRoot, { recursive: true, force: true })
  })

  const bridge = () =>
    createCycleScriptsBridge({
      scriptsDir: join(projectRoot, '.claude/skills/pair-workflow-cycle/scripts'),
    })

  it('resolve() on an empty run directory returns the real implement/initial/a0 next — no up-front contract (AC1, US-506)', () => {
    const dir = join(runsRoot, 'story-487/487')
    const result = bridge().resolve({
      dir,
      workflowVersion: '4.0.1',
      policy: { maxFixRounds: 3, redRepairs: 1, greenRetries: 1, reviewers: 1 },
      entry: 'fresh',
      runsRoot,
    })

    expect(result.status).toBe('empty')
    expect(result.next).toMatchObject({
      step: 'implement',
      mode: 'initial',
      phase: 'a0',
      attempt: 1,
    })
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

  it('AC9: a cycle another realization started on the same runId continues from its next step — never failed-resume', () => {
    // The batch / in-session coordinator publishes `a0-red-spec` through the SAME cycle-state; this
    // driver then resolves that directory with its OWN inputs (its pinned workflow version, `{}` as
    // policy) and must read the cycle's next step, not an incompatible or unreadable state.
    const dir = join(runsRoot, 'story-487/487')
    // Hermetic (a0 repair, AC9-I1): the draft carries an `acHash`, so `publish` stamps the canonical
    // card hash through `gh issue view` — the REAL tracker, the network and the operator's auth
    // unless a fake stands in. A recording fake `gh` is BOTH the PAIR_GH_BIN the script honours and
    // the first `gh` on PATH, for the publish spawn AND the bridge's resolve spawn, so no real `gh`
    // process can start and the row's outcome never follows the network.
    const fakeBin = join(projectRoot, 'fake-bin')
    mkdirSync(fakeBin, { recursive: true })
    const fakeGh = join(fakeBin, 'gh')
    const ghLog = join(projectRoot, 'fake-gh.log')
    writeFileSync(
      fakeGh,
      `#!/bin/sh\necho "$@" >> ${JSON.stringify(ghLog)}\nprintf 'the card body'\n`,
    )
    chmodSync(fakeGh, 0o755)
    const hermeticEnv = {
      ...process.env,
      PAIR_GH_BIN: fakeGh,
      PATH: `${fakeBin}:${process.env['PATH'] ?? ''}`,
    }
    vi.stubEnv('PAIR_GH_BIN', fakeGh)
    vi.stubEnv('PATH', hermeticEnv.PATH)
    const draft = join(projectRoot, 'a0-draft.json')
    writeFileSync(
      draft,
      JSON.stringify({
        run: 'story-487',
        story: '487',
        branch: 'feature/US-487-x',
        phase: 'a0',
        skill: 'red-spec',
        inputHead: 'a'.repeat(40),
        inputsDigest: 'x',
        acHash: `sha256:${'0'.repeat(64)}`,
        attempt: 1,
        mode: 'initial',
        status: 'red',
        contractPath: '/x.json',
        contractHash: `sha256:${'1'.repeat(64)}`,
        reconciled: [],
        preserved: [],
        findings: { received: [], covered: [] },
        elapsedMs: 1,
      }),
    )
    const published = spawnSync(
      'node',
      [
        join(projectRoot, '.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs'),
        'publish',
        '--dir',
        dir,
        '--file',
        draft,
        '--phase',
        'a0',
        '--skill',
        'red-spec',
        '--workflowVersion',
        '4.0.1',
        '--attempt',
        '1',
      ],
      { encoding: 'utf8', env: hermeticEnv, timeout: 4000 },
    )
    expect(JSON.parse(published.stdout)).toMatchObject({ published: true })

    const result = bridge().resolve({
      dir,
      workflowVersion: CYCLE_WORKFLOW_VERSION,
      policy: {},
      entry: 'fresh',
      story: '487',
      runsRoot,
    })

    expect(result.status).toBe('in-progress')
    expect(result.next).toMatchObject({ step: 'validate', phase: 'a0' })
    // The card was read through the FAKE — exactly once, by publish — never by a real `gh`.
    expect(readFileSync(ghLog, 'utf8').trim().split('\n')).toEqual([
      'issue view 487 --json body -q .body',
    ])
  })

  const PREPARE = {
    step: 'prepare',
    mode: 'initial',
    phase: 'a0',
    round: 0,
    attempt: 1,
    context: 'fresh',
  }
  const CARD = { id: '487', branch: 'feature/US-487-x', base: 'origin/main', title: 't' }

  it('packet() propagates agent-definition-missing, naming the role, when the install has no agents (AC11)', () => {
    // The fixture installs the scripts WITHOUT `.claude/agents/` — a project that installed the
    // skill but not its roles. The HALT must reach the driver typed, never a role-less prompt.
    expect(() =>
      bridge().packet({
        next: PREPARE,
        card: CARD,
        run: 'story-487',
        workflowVersion: '4.0.1',
        style: 'instruction',
      }),
    ).toThrow(/agent-definition-missing.*pair-fix-test-author/s)
  })

  it("packet() hands --style through: with the roles installed, pi's instruction prompt opens with the role body (AC3)", () => {
    cpSync(join(__dirname, '../../../../../.claude/agents'), join(projectRoot, '.claude/agents'), {
      recursive: true,
    })

    const out = bridge().packet({
      next: PREPARE,
      card: CARD,
      run: 'story-487',
      workflowVersion: '4.0.1',
      style: 'instruction',
    })

    expect(out.prompt.startsWith('You own the preparation stage of a delivery cycle')).toBe(true)
    expect(out.prompt).toMatch(/Run the pair-workflow-red-spec skill with these arguments:/)
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
