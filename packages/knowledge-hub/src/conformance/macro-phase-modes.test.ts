import { describe, it, expect } from 'vitest'
import { execFileSync } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { MACRO_PHASE_MODES, parseModeTable } from '../tools/macro-phase-modes'

// Conformance guard for story #252: `/next` gains three macro-phase MODES (analysis /
// implementation / review) — pure facades over the cascade (D24: zero new skills, zero
// duplicated logic). The mode ↔ step mapping lives ONLY in the KB guideline; everything else
// either links to it or is asserted equal to it. The executable half (table ↔ catalogue ↔
// cascade partition, mode session = manual sequence) lives in `tools/macro-phase-modes.test.ts`.

const PKG = join(__dirname, '../..')
const ROOT = join(PKG, '../..')
const DATASET = join(PKG, 'dataset')

const NEXT_DATASET = join(DATASET, '.skills/next/SKILL.md')
const NEXT_MIRROR = join(ROOT, '.claude/skills/pair-next/SKILL.md')
const GUIDELINE = join(
  DATASET,
  '.pair/knowledge/guidelines/technical-standards/ai-development/macro-phase-modes.md',
)
const GUIDELINES_README = join(
  DATASET,
  '.pair/knowledge/guidelines/technical-standards/ai-development/README.md',
)
const SKILLS_GUIDE = join(DATASET, '.pair/knowledge/skills-guide.md')
const SKILLS_GUIDE_MIRROR = join(ROOT, '.pair/knowledge/skills-guide.md')
const DOCS_PAGE = join(ROOT, 'apps/website/content/docs/reference/pair-next.mdx')
const ADL = join(
  ROOT,
  '.pair/adoption/decision-log/2026-10-06-macro-phase-modes-are-a-selection-facade.md',
)
const ADR_017 = join(ROOT, '.pair/adoption/tech/adr/adr-017-automation-loop-pair-loop-over-atom.md')

const read = (p: string): string => readFileSync(p, 'utf-8')

const nextSources: Array<[string, string]> = [
  ['dataset', read(NEXT_DATASET)],
  ['mirror', read(NEXT_MIRROR)],
]

/** The body of the heading matching `heading` up to the next heading of the same or a higher level; '' when absent. */
const section = (content: string, heading: RegExp): string => {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const start = lines.findIndex(l => heading.test(l))
  if (start === -1) return ''
  const level = /^#+/.exec(lines[start] as string)?.[0].length ?? 1
  const body: string[] = []
  for (const line of lines.slice(start + 1)) {
    const m = /^(#+) /.exec(line)
    if (m && (m[1] as string).length <= level) break
    body.push(line)
  }
  return body.join('\n').trim()
}

/** Non-empty lines (list items, table rows, paragraphs). */
const linesOf = (text: string): string[] =>
  text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

/** Sentences, never crossing a line: the unit a behavior is stated in. */
const sentencesOf = (text: string): string[] =>
  linesOf(text).flatMap(l => l.split(/(?<=[.!?])\s+(?=[A-Z`*([])/))

const hasSentence = (text: string, ...patterns: RegExp[]): boolean =>
  sentencesOf(text).some(s => patterns.every(p => p.test(s)))

const hasLine = (text: string, ...patterns: RegExp[]): boolean =>
  linesOf(text).some(l => patterns.every(p => p.test(l)))

const STEP_0_6 = /^### Step 0\.6/
const STEP_6 = /^### Step 6: Run the Phase/
const MODE_SECTION = /^### `--mode/
const STEP_0_ITEM_0 = /^0\. \*\*Resolve the effective selection first\*\*/
const WITHHELD = /\b(never|not|without|excluding|except|withh\w+|outside)\b/i
const MODE_WORD = /`--mode`|\bmode\b/i

/** The Step 0 item the skill tells the agent to resolve the scope with. */
const stepZeroItemZero = (content: string): string =>
  content.split('\n').find(l => STEP_0_ITEM_0.test(l)) ?? ''

/** The statement that a session hands row 7 (/checkpoint resume) over to row 8's implement. */
const statesHandOff = (text: string): boolean =>
  hasSentence(text, /row 7/i, /row 8/i, /checkpoint/i, /implement/i, /(same unit|the unit)/i) &&
  hasSentence(text, /read-only/i, /unchanged/i, /\b(not|never)\b/i)

/** The statement that a mode RUNS its fallback-only step, once. */
const statesFallbackRuns = (text: string): boolean =>
  hasSentence(text, /fallback-only/i, /once/i, /\b(runs?|invok\w+)\b/i)

/**
 * The precondition of the run: a mode runs its fallback-only step only when the cascade run once
 * WITHOUT the mode filter also reaches the Step 5 fallback (no enabled row of any mode holds).
 */
const statesFallbackPrecondition = (text: string): boolean =>
  hasSentence(
    text,
    /fallback-only/i,
    /(without the mode filter|unmoded)/i,
    /Step 5/,
    /\b(only when|only if|only after)\b/i,
  )

/** The consequence: when a row of another mode holds, the step is not run: wrong context, suggesting that mode. */
const statesOtherModeWrongContext = (text: string): boolean =>
  hasSentence(
    text,
    /fallback-only/i,
    /(another|other) mode/i,
    /\b(row|rows)\b/i,
    /\bnot\b/i,
    /wrong[- ]context/i,
  )

/** The retired carve-out: the step "even when" a row of another mode holds. */
const statesRetiredCarveOut = (text: string): boolean =>
  hasSentence(
    text,
    /(fallback-only|brainstorm|discovery)/i,
    /(another|other) mode/i,
    /\beven (when|if)\b/i,
  )

const POLICY_SCRIPT = join(DATASET, '.skills/workflow/cycle/scripts/autonomy-policy.mjs')

/** The shared autonomy-policy script, run for real (no network, no spawn) over an empty adoption file. */
const resolvePolicy = (
  args: Record<string, unknown>,
): { ok: boolean; errors: Array<{ key: string }> } => {
  const dir = mkdtempSync(join(tmpdir(), 'policy-'))
  const adoption = join(dir, 'automation.md')
  writeFileSync(adoption, '')
  const out = execFileSync(
    process.execPath,
    [POLICY_SCRIPT, 'resolve', '--adoption', adoption, '--args', JSON.stringify(args)],
    { encoding: 'utf-8' },
  )
  return JSON.parse(out) as { ok: boolean; errors: Array<{ key: string }> }
}

describe.each(nextSources)('/next — %s SKILL.md documents the mode argument', (_, content) => {
  const lower = content.toLowerCase()

  it('accepts an optional --mode with the three macro-phases (AC1, AC2)', () => {
    expect(content).toMatch(/`--mode`/)
    for (const mode of MACRO_PHASE_MODES) expect(content).toContain(`\`${mode}\``)
    expect(lower).toMatch(/macro-phase/)
  })

  it('states a mode is a facade over the cascade — no new skill, no new step, no duplicated logic (AC3, D24)', () => {
    expect(lower).toMatch(/facade/)
    expect(content).toMatch(/D24/)
    expect(lower).toMatch(/no new (skill|process step)|zero new skills/)
  })

  it('points at the KB for the mode ↔ step mapping and does not restate it', () => {
    expect(content).toMatch(/macro-phase-modes\.md/)
    // No table of modes, and no line pairing a mode name with a process-step command.
    expect(content).not.toMatch(/\|\s*Mode\s*\|/)
    const stepCommand =
      /`\/(specify-prd|bootstrap|plan-initiatives|plan-epics|plan-stories|refine-story|plan-tasks|implement|review)`/
    const offenders = content
      .split('\n')
      .filter(l => /`(analysis|implementation)`/.test(l) && stepCommand.test(l))
    expect(offenders).toEqual([])
  })

  it('composes the mode with scope and profile: a row filter, the same intersection, a disabled step skipped (AC4)', () => {
    const mode = section(content, MODE_SECTION)
    expect(mode, 'the `--mode` section is missing').not.toBe('')
    expect(
      hasLine(mode, /row filter/i, /intersection/i, /process profile/i, /skipped/i),
      'the row-filter bullet must compose with the intersection and the process profile',
    ).toBe(true)
    const step06 = section(content, STEP_0_6)
    expect(step06, 'Step 0.6 (Resolve the Mode) is missing').not.toBe('')
    expect(
      hasSentence(step06, /row outside/i, /skipped/i, /disabled step/i),
      'Step 0.6 must skip a row outside the mode set exactly like a disabled step',
    ).toBe(true)
  })

  it('keeps macrostates and DoR in force inside a mode', () => {
    const mode = section(content, MODE_SECTION)
    expect(mode, 'the `--mode` section is missing').not.toBe('')
    expect(
      hasLine(
        mode,
        /macrostates?/i,
        /(definition of ready|readiness fallback)/i,
        /\b(stay in force|never)\b/i,
      ),
    ).toBe(true)
  })

  it('reports a mode invoked in the wrong context and suggests the right mode', () => {
    expect(lower).toMatch(/wrong context/)
    expect(lower).toMatch(/suggest/)
  })

  it('surfaces a step HALT as-is (never swallowed)', () => {
    expect(lower).toMatch(/halt[^.]*as-is|as-is[^.]*halt|surface[sd]? (the|a) halt/)
  })

  it('an unknown mode HALTs listing the valid ones, never a quiet fallback', () => {
    expect(content).toMatch(/unknown mode/i)
  })

  it('drives one work unit per invocation (context isolation, ADR-017 §3)', () => {
    expect(lower).toMatch(/one (work )?unit/)
  })

  it('stays read-only without --mode and writes nothing itself with it', () => {
    expect(lower).toMatch(/read-only/)
    expect(lower).toMatch(/without `--mode`|plain `\/(pair-)?next`/)
  })

  it('keeps the selection atom: --mode is a row filter, not loop state, --steps or --until (ADR-017 §1)', () => {
    expect(content).toMatch(/ADR-017/)
    expect(content).not.toMatch(/`--steps`|`--until`\s*\|/)
  })
})

describe('KB guideline macro-phase-modes.md — the one home of the mapping', () => {
  const guideline = read(GUIDELINE)
  const lower = guideline.toLowerCase()
  const table = parseModeTable(guideline)

  it('declares the three modes, each with rows, steps and an exit condition', () => {
    expect(table.modes.map(m => m.mode)).toEqual([...MACRO_PHASE_MODES])
    for (const m of table.modes) {
      expect(m.rows.length).toBeGreaterThan(0)
      expect(m.steps.length).toBeGreaterThan(0)
      expect(m.exit.length).toBeGreaterThan(10)
    }
  })

  it('analysis chains the brainstorm / refinement family (AC1)', () => {
    const analysis = table.modes.find(m => m.mode === 'analysis')
    expect(analysis?.steps).toEqual(expect.arrayContaining(['refine-story']))
    expect(analysis?.fallbackSteps).toContain('brainstorm')
  })

  it('states the session rules: facade, one unit, re-evaluate, HALT as-is, wrong context, profile skip', () => {
    expect(lower).toMatch(/facade/)
    expect(lower).toMatch(/one unit per invocation/)
    expect(lower).toMatch(/re-evaluate/)
    expect(lower).toMatch(/halts? surface as-is|surface as-is/)
    expect(lower).toMatch(/wrong context/)
    expect(lower).toMatch(/skipped/)
    expect(lower).toMatch(/narration/)
  })

  it('is indexed from the ai-development README', () => {
    expect(read(GUIDELINES_README)).toMatch(/\]\(macro-phase-modes\.md\)/)
  })
})

describe('skills guide — the mode table sits next to the skills catalog (facade-drift mitigation)', () => {
  it.each([
    ['dataset', SKILLS_GUIDE],
    ['mirror', SKILLS_GUIDE_MIRROR],
  ])('%s skills-guide points at the table and carries the authoring checklist item', (_, file) => {
    const content = read(file)
    expect(content).toMatch(/Macro-Phase Modes/)
    expect(content).toMatch(/macro-phase-modes\.md/)
    expect(content.toLowerCase()).toMatch(
      /new (process )?step[^.]*mode table|mode table[^.]*new (process )?step/,
    )
  })
})

describe('granular skills are untouched — modes are facades, never skills (AC3)', () => {
  const skillFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true, recursive: true })
      .filter(e => e.isFile() && e.name.endsWith('.md'))
      .map(e => join(e.parentPath, e.name))

  it('no other skill mentions macro-phase modes or --mode', () => {
    const skillsDir = join(DATASET, '.skills')
    const mentions = skillFiles(skillsDir)
      .filter(f => !f.startsWith(join(skillsDir, 'next')))
      .filter(f => /macro-phase modes?|`--mode`/i.test(read(f)))
    expect(mentions).toEqual([])
  })

  it('no skill directory was added for a mode', () => {
    const skillsDir = join(DATASET, '.skills')
    const dirs = readdirSync(skillsDir, { withFileTypes: true, recursive: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
    expect(dirs.filter(d => /mode|macro/.test(d))).toEqual([])
  })
})

describe('docs site — the three modes documented for end users', () => {
  const docs = read(DOCS_PAGE)
  const kb = parseModeTable(read(GUIDELINE))

  it('has a section per mode invocation', () => {
    expect(docs).toMatch(/^## Macro-phase modes/m)
    for (const mode of MACRO_PHASE_MODES) expect(docs).toContain(`/pair-next --mode ${mode}`)
  })

  it('lists the same steps per mode as the KB table (derived equality, not a second source)', () => {
    const rows = docs
      .split('\n')
      .filter(l => /^\|\s*`(analysis|implementation|review)`\s*\|/.test(l))
      .map(l => l.split('|').map(c => c.trim()))
    expect(rows.map(r => (r[1] as string).replace(/`/g, ''))).toEqual([...MACRO_PHASE_MODES])
    for (const r of rows) {
      const mode = (r[1] as string).replace(/`/g, '')
      const steps = [...(r[2] as string).matchAll(/`([^`]+)`/g)].map(m => m[1])
      expect(steps, `docs steps for ${mode}`).toEqual(kb.modes.find(m => m.mode === mode)?.steps)
    }
  })

  it('states the facade contract: granular skills unchanged, profile skipping, HALT as-is, wrong context', () => {
    const lower = docs.toLowerCase()
    expect(lower).toMatch(/granular skills? (is|are|stays?|remain)[^.]*unchanged|unchanged/)
    expect(lower).toMatch(/process profile/)
    expect(lower).toMatch(/halt/)
    expect(lower).toMatch(/wrong context|no open pr/)
    expect(docs).toMatch(/macro-phase-modes\.md/)
  })
})

describe('decision record', () => {
  it('records the facade decision and the ADR-017 §1 clarification', () => {
    expect(existsSync(ADL)).toBe(true)
    const adl = read(ADL)
    expect(adl).toMatch(/ADR-017/)
    expect(adl).toMatch(/--mode/)
    expect(read(ADR_017)).toMatch(/macro-phase-modes-are-a-selection-facade/)
  })
})

// --- US-252 review r0: the run mechanism, pinned to the text that carries it --------------------

describe.each(nextSources)(
  '/next — %s SKILL.md run mechanism (Step 0.6 and Step 6)',
  (_, content) => {
    const step06 = section(content, STEP_0_6)
    const step6 = section(content, STEP_6)

    it('Step 0.6 validates the mode and HALTs on an unknown one, listing the three (AC1, AC2)', () => {
      expect(step06, 'Step 0.6 (Resolve the Mode) is missing').not.toBe('')
      expect(
        hasSentence(step06, /unknown mode/i, /halt/i, /`analysis`/, /`implementation`/, /`review`/),
      ).toBe(true)
    })

    it('Step 0.6 HALTs on a missing mode table naming the file, never falling back to plain next', () => {
      expect(step06, 'Step 0.6 (Resolve the Mode) is missing').not.toBe('')
      expect(
        hasSentence(step06, /(missing|unreadable)/i, /table/i, /halt/i, /naming the file/i),
      ).toBe(true)
      expect(hasSentence(step06, /never fall back to plain/i)).toBe(true)
    })

    it('Step 6 invokes the granular skill the row names and leaves its gates to it (AC1, AC2)', () => {
      expect(step6, 'Step 6 (Run the Phase) is missing').not.toBe('')
      expect(hasSentence(step6, /invoke/i, /granular skill/i)).toBe(true)
      expect(hasSentence(step6, /gates/i, /halts/i, /belong to it/i)).toBe(true)
    })

    it('Step 6 re-evaluates against the current board state after every step, never a cached selection', () => {
      expect(step6, 'Step 6 (Run the Phase) is missing').not.toBe('')
      expect(hasSentence(step6, /re-evaluate/i, /step 0/i, /current board state/i)).toBe(true)
    })

    it('Step 6 stops on the phase exit, on a HALT (surfaced as-is) or on an unchanged unit', () => {
      expect(step6, 'Step 6 (Run the Phase) is missing').not.toBe('')
      expect(
        hasSentence(step6, /\bstop\b/i, /exit/i, /halt/i, /as-is/i, /unchanged unit/i),
        'Step 6 must name all three stop conditions',
      ).toBe(true)
    })

    it('Step 6 reports a wrong context and suggests the mode of the unmoded answer (AC edge case)', () => {
      expect(step6, 'Step 6 (Run the Phase) is missing').not.toBe('')
      expect(hasSentence(step6, /wrong context/i, /suggest/i, /mode/i)).toBe(true)
    })

    it('Step 6 reports at phase level and lists the remaining units without running them', () => {
      expect(step6, 'Step 6 (Run the Phase) is missing').not.toBe('')
      expect(hasSentence(step6, /phase level/i)).toBe(true)
      expect(hasSentence(step6, /remaining units/i, /without running/i)).toBe(true)
    })
  },
)

describe.each(nextSources)('/next — %s SKILL.md — r0-1 row 7 hands over to row 8', (_, content) => {
  it('Step 6 states that, after the read-only /checkpoint resume ran for the unit, the same unit continues with row 8 implement, and the unchanged-unit stop does not apply to it', () => {
    const step6 = section(content, STEP_6)
    expect(step6, 'Step 6 (Run the Phase) is missing').not.toBe('')
    expect(statesHandOff(step6), 'Step 6 must state the row 7 -> row 8 hand-off').toBe(true)
  })
})

describe.each(nextSources)(
  '/next — %s SKILL.md — r0-3 Step 0 item 0 never passes the mode',
  (_, content) => {
    const item0 = stepZeroItemZero(content)

    it('names the selection keys it passes and withholds `mode` from autonomy-policy.mjs', () => {
      expect(item0, 'Step 0 item 0 is missing').not.toBe('')
      expect(item0, 'item 0 must not tell the agent to pass every argument given').not.toMatch(
        /<JSON of the arguments given>/,
      )
      for (const key of ['root', 'filter', 'assignee', 'status']) {
        expect(item0, `item 0 must name \`${key}\``).toContain(`\`${key}\``)
      }
      expect(
        hasSentence(item0, MODE_WORD, WITHHELD),
        'item 0 must state that the mode is not passed to the policy script',
      ).toBe(true)
    })

    it('a --mode invocation resolves through the real autonomy-policy.mjs once item 0 is followed', () => {
      const given = { filter: 'ui', mode: 'analysis' }
      const withheld = hasSentence(item0, MODE_WORD, WITHHELD)
      const passed = withheld ? { filter: given.filter } : given
      expect(resolvePolicy(passed).ok, JSON.stringify(passed)).toBe(true)
    })
  },
)

describe.each(nextSources)(
  '/next — %s SKILL.md — r0-4 a mode runs its fallback-only step once',
  (_, content) => {
    it('Step 6 states that, when no row selects and the mode lists a fallback-only step, it invokes the step Step 5 names once under its own gates', () => {
      const step6 = section(content, STEP_6)
      expect(step6, 'Step 6 (Run the Phase) is missing').not.toBe('')
      expect(
        statesFallbackRuns(step6),
        'Step 6 must state that the fallback-only step is run once',
      ).toBe(true)
    })
  },
)

describe.each(nextSources)(
  '/next — %s SKILL.md — r0-4 the fallback-only step needs the unmoded cascade to be empty',
  (_, content) => {
    const step6 = section(content, STEP_6)

    it('R04-I2p: Step 6 states the fallback-only step is run only when the cascade without the mode filter also reaches the Step 5 fallback', () => {
      expect(step6, 'Step 6 (Run the Phase) is missing').not.toBe('')
      expect(
        statesFallbackPrecondition(step6),
        'Step 6 must state the fallback-only step runs only when the unmoded cascade also reaches Step 5',
      ).toBe(true)
    })

    it('R04-I2p: Step 6 states a row of another mode holding is a wrong-context report and the fallback-only step is not run', () => {
      expect(
        statesOtherModeWrongContext(step6),
        'Step 6 must state a row of another mode is wrong context, not a fallback-only run',
      ).toBe(true)
    })

    it('R04-I2p: no sentence of the skill runs the fallback-only step "even when" a row of another mode holds', () => {
      expect(statesRetiredCarveOut(content)).toBe(false)
    })
  },
)

describe('KB macro-phase-modes.md — How a session runs states the same two rules as Step 6', () => {
  const session = section(read(GUIDELINE), /^## How a session runs/)

  it('states the row 7 -> row 8 hand-off (r0-1)', () => {
    expect(session, '`## How a session runs` is missing').not.toBe('')
    expect(statesHandOff(session), 'the KB must state the row 7 -> row 8 hand-off').toBe(true)
  })

  it('R04-I2p: states the fallback-only step is run only when the cascade without the mode filter also reaches the Step 5 fallback (r0-4)', () => {
    expect(session, '`## How a session runs` is missing').not.toBe('')
    expect(
      statesFallbackPrecondition(session),
      'the KB must state the fallback-only step runs only when the unmoded cascade also reaches Step 5',
    ).toBe(true)
    expect(
      statesOtherModeWrongContext(session),
      'the KB must state a row of another mode is wrong context, not a fallback-only run',
    ).toBe(true)
  })

  it('states that a fallback-only step is run once (r0-4)', () => {
    expect(session, '`## How a session runs` is missing').not.toBe('')
    expect(
      statesFallbackRuns(session),
      'the KB must state the fallback-only step is run once',
    ).toBe(true)
  })
})

describe('KB macro-phase-modes.md — Wrong context agrees with the fallback-only precondition (r0-4)', () => {
  it('R04-I2w: states a row of another mode holding is a wrong-context report and the fallback-only step is not run', () => {
    const wrong = section(read(GUIDELINE), /^## Wrong context/)
    expect(wrong, '`## Wrong context` is missing').not.toBe('')
    expect(
      statesOtherModeWrongContext(wrong),
      'the Wrong context section must state a row of another mode is wrong context, not a fallback-only run',
    ).toBe(true)
    expect(statesRetiredCarveOut(read(GUIDELINE))).toBe(false)
  })
})

describe('docs site — analysis and the discovery run (r0-4)', () => {
  const docs = section(read(DOCS_PAGE), /^## Macro-phase modes/)

  it('states that analysis runs brainstorm once when the profile leaves an empty backlog (agrees with Step 6 and the KB)', () => {
    expect(docs, '`## Macro-phase modes` is missing').not.toBe('')
    expect(hasSentence(docs, /brainstorm/i, /once/i, /\b(runs?|invok\w+)\b/i)).toBe(true)
  })

  it('R04-I2d: states the discovery run needs no row of any mode to hold, and that a row of another mode is a wrong-context report', () => {
    expect(docs, '`## Macro-phase modes` is missing').not.toBe('')
    expect(
      hasSentence(docs, /brainstorm/i, /once/i, /\bany mode\b/i),
      'the docs must state the brainstorm run needs no row of any mode to hold',
    ).toBe(true)
    expect(
      hasSentence(docs, /analysis/i, /(another|other) mode/i, /wrong[- ]context/i),
      'the docs must state a story another mode would select is a wrong-context report under analysis',
    ).toBe(true)
  })

  it('R04-I2d: the docs no longer run the discovery run "even when" a row of another mode would select', () => {
    expect(statesRetiredCarveOut(read(DOCS_PAGE))).toBe(false)
  })
})

describe('r0-3 premise: the real policy script refuses `mode` and accepts the selection keys', () => {
  it('control: {"filter":"ui"} resolves, {"mode":"analysis"} is refused naming `mode`', () => {
    expect(resolvePolicy({ filter: 'ui' }).ok).toBe(true)
    const refused = resolvePolicy({ mode: 'analysis' })
    expect(refused.ok).toBe(false)
    expect(refused.errors.map(e => e.key)).toContain('mode')
  })
})
