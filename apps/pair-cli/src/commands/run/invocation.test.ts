import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import {
  buildSkillArgs,
  buildPromptText,
  skillAcceptsFilter,
  SKILL_PARAMETERS,
  APPROVAL_DECLARING_SKILLS,
  APPROVAL_PARAMETER,
  describeApprovalPosture,
} from './invocation'
import { ENGINES } from './engines'

describe('buildSkillArgs', () => {
  it('passes pair-loop only the parameters pair-loop declares', () => {
    const args = buildSkillArgs('pair-loop', {
      root: '212',
      filter: 'risk:green',
      predicate: 'Done',
      iteration: 3,
    })

    // No --filter: pair-loop reads eligibility from tech/automation.md itself (AC8).
    expect(args).toEqual(['--root', '212', '--predicate', 'Done', '--iteration', '3'])
  })

  it('passes pair-next only the parameters pair-next declares', () => {
    const args = buildSkillArgs('pair-next', {
      root: '212',
      filter: 'risk:green',
      predicate: 'ignored',
      iteration: 2,
    })

    expect(args).toEqual(['--root', '212', '--filter', 'risk:green'])
  })

  it('gives an unknown skill the frozen scoping parameters and nothing else', () => {
    const args = buildSkillArgs('my-skill', { root: '212', filter: 'risk:green', iteration: 4 })

    expect(args).toEqual(['--root', '212', '--filter', 'risk:green'])
  })

  it('declares no parameter the skills do not own (anti-drift, AC8)', () => {
    const declared = [
      ...Object.values(SKILL_PARAMETERS).flatMap(map => Object.values(map)),
      ...Object.values(APPROVAL_PARAMETER),
    ]

    expect([...new Set(declared)].sort()).toEqual([
      '--approval',
      '--filter',
      '--iteration',
      '--predicate',
      '--root',
    ])
  })

  it('quotes a multi-word borrowed value, as the skill documents it (round 1, finding 2)', () => {
    // `pair-loop`'s SKILL.md renders the argument as `--predicate "<text>"`, and the workflow
    // behind it validates the predicate BY CONTENT before any agent starts — so an unquoted
    // multi-word value is either rejected or read as a DIFFERENT predicate on an unattended run.
    expect(
      buildSkillArgs('pair-loop', { root: '212', predicate: 'tag:risk:red ⇒ Done', iteration: 1 }),
    ).toEqual(['--root', '212', '--predicate', '"tag:risk:red ⇒ Done"', '--iteration', '1'])
  })

  it('quotes a label whose name contains spaces', () => {
    expect(buildSkillArgs('pair-next', { filter: 'good first issue' })).toEqual([
      '--filter',
      '"good first issue"',
    ])
  })

  it('escapes an embedded quote rather than closing the value early', () => {
    expect(buildSkillArgs('pair-next', { filter: 'say "hi" now' })).toEqual([
      '--filter',
      '"say \\"hi\\" now"',
    ])
  })

  it('leaves a single-token value unquoted', () => {
    expect(buildSkillArgs('pair-next', { root: '212', filter: 'risk:green' })).toEqual([
      '--root',
      '212',
      '--filter',
      'risk:green',
    ])
  })
})

/**
 * `$approval` — the borrowed non-interactive signal (US-464, ADR-021).
 *
 * The four quadrants of AC1/AC2/AC3 are (autonomous | not) x (skill declares `approval` | not).
 * Only the top-left corner emits anything: `--autonomous` is the operator's single "nobody is
 * watching" intent, and a skill that never declared the argument must never receive it.
 */
describe('buildSkillArgs — $approval (US-464)', () => {
  const DECLARES = 'pair-capability-assess-stack'
  const DECLARES_NOT = 'pair-next'

  it('AC1: passes --approval auto to a declaring skill under an autonomous run', () => {
    expect(buildSkillArgs(DECLARES, { approval: 'auto' })).toEqual(['--approval', 'auto'])
  })

  it('AC2: passes nothing when the run is not autonomous, so the skill defaults to interactive', () => {
    // The caller omits `approval` entirely on the non-autonomous path — the absent argument IS
    // the `interactive` default (ADR-021: "an omitted `$approval` resolves here").
    expect(buildSkillArgs(DECLARES, {})).toEqual([])
  })

  it('AC3: passes nothing to a skill that does not declare approval, autonomous or not', () => {
    expect(buildSkillArgs(DECLARES_NOT, { approval: 'auto' })).toEqual([])
    expect(buildSkillArgs('pair-loop', { approval: 'auto' })).toEqual([])
    // An unknown skill gets the frozen scoping parameters and nothing invented on top.
    expect(buildSkillArgs('my-skill', { approval: 'auto' })).toEqual([])
  })

  it('AC2 (no drift): a declaring skill keeps the exact non-autonomous rendering it had before', () => {
    // The regression that matters: adding `approval` to the map must not cost these skills the
    // unknown-skill scoping fallback they get today. A dedicated `SKILL_PARAMETERS` entry per
    // family member would have silently dropped both flags.
    expect(buildSkillArgs(DECLARES, { root: '212', filter: 'risk:green' })).toEqual([
      '--root',
      '212',
      '--filter',
      'risk:green',
    ])
  })

  it('threads approval and filter independently, with no interference (edge case)', () => {
    expect(
      buildSkillArgs(DECLARES, { root: '212', filter: 'risk:green', approval: 'auto' }),
    ).toEqual(['--root', '212', '--filter', 'risk:green', '--approval', 'auto'])
  })

  it('renders `interactive` verbatim when a caller passes it explicitly', () => {
    // Not the driver's own path (it only ever sends `auto`), but the enum has two members and a
    // value silently rewritten to the other one is the worst failure this argument could have.
    expect(buildSkillArgs(DECLARES, { approval: 'interactive' })).toEqual([
      '--approval',
      'interactive',
    ])
  })

  it('carries the flag into the rendered prompt on both invocation styles', () => {
    expect(
      buildPromptText(
        ENGINES.claude,
        { kind: 'skill', name: DECLARES, source: '--skill' },
        {
          approval: 'auto',
        },
      ),
    ).toBe(`/${DECLARES} --approval auto`)
    expect(
      buildPromptText(
        ENGINES.pi,
        { kind: 'skill', name: DECLARES, source: '--skill' },
        {
          approval: 'auto',
        },
      ),
    ).toBe(`Run the ${DECLARES} skill with these arguments: --approval auto`)
  })
})

/**
 * The family list is DATA (AC5) — and data about someone else's declaration goes stale silently.
 *
 * This is the guard that makes the data trustworthy: the set is checked against the skills' OWN
 * `## Arguments` tables in the dataset corpus, which is what actually defines who honours the
 * signal. Over-inclusion invents an argument (AC3/D18); omission leaves an unattended run asking a
 * question nobody can answer, which is the whole defect this story closes.
 */
describe('APPROVAL_DECLARING_SKILLS matches the corpus that defines it', () => {
  // apps/pair-cli/src/commands/run -> repo root
  const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')
  const DATASET_SKILLS = join(REPO_ROOT, 'packages/knowledge-hub/dataset/.skills')
  /** How `pair-cli install` names an installed skill directory: `pair-<family>-<name>`. */
  const installedName = (family: string, name: string) => `pair-${family}-${name}`

  /**
   * Whether a SKILL.md declares an `$approval` row in its `## Arguments` table.
   *
   * FAIL CLOSED (approval-rounds.md): a file with no `## Arguments` section, or one this cannot
   * parse, throws rather than answering "no". A detector that reports "nothing to check" when it
   * cannot read its input is indistinguishable from one that passes.
   */
  function declaresApproval(skillFile: string): boolean {
    const source = readFileSync(skillFile, 'utf-8')
    const start = source.indexOf('\n## Arguments\n')
    if (start === -1)
      throw new Error(`${skillFile} has no \`## Arguments\` section — cannot decide, refusing to`)
    const rest = source.slice(start + '\n## Arguments\n'.length)
    const end = rest.indexOf('\n## ')
    const table = end === -1 ? rest : rest.slice(0, end)
    return table.split('\n').some(line => /^\|\s*`\$approval`/.test(line))
  }

  /** Every installed skill name whose dataset SKILL.md declares the argument. */
  function corpusFamily(): string[] {
    const families = readdirSync(DATASET_SKILLS, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
    const declaring: string[] = []
    for (const family of families) {
      const skills = readdirSync(join(DATASET_SKILLS, family), { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
      for (const skill of skills) {
        const file = join(DATASET_SKILLS, family, skill, 'SKILL.md')
        if (!existsSync(file)) continue
        if (declaresApproval(file)) declaring.push(installedName(family, skill))
      }
    }
    if (declaring.length === 0)
      throw new Error(`no skill in ${DATASET_SKILLS} declares \`$approval\` — the scan is broken`)
    return declaring.sort()
  }

  it('is exactly the set of skills declaring $approval — no omission, no over-inclusion', () => {
    expect([...APPROVAL_DECLARING_SKILLS].sort()).toEqual(corpusFamily())
  })

  it('holds the eleven members ADR-021 converted, and excludes its callers', () => {
    // Spelled out because the derived assertion above would also pass if BOTH sides drifted the
    // same way (a member deleted from the corpus and from the set in one edit).
    expect([...APPROVAL_DECLARING_SKILLS].sort()).toEqual([
      'pair-capability-assess-ai',
      'pair-capability-assess-architecture',
      'pair-capability-assess-infrastructure',
      'pair-capability-assess-methodology',
      'pair-capability-assess-observability',
      'pair-capability-assess-pm',
      'pair-capability-assess-security',
      'pair-capability-assess-stack',
      'pair-capability-assess-testing',
      'pair-capability-map-contexts',
      'pair-capability-map-subdomains',
    ])
    // `assess-cost`/`assess-coupling` have no approval round; `bootstrap` PASSES the signal to the
    // family rather than declaring it. All three would be invented arguments (ADR-021 Trade-offs).
    for (const caller of [
      'pair-capability-assess-cost',
      'pair-capability-assess-coupling',
      'pair-process-bootstrap',
      'pair-process-refine-story',
    ])
      expect(APPROVAL_DECLARING_SKILLS.has(caller)).toBe(false)
  })
})

describe('describeApprovalPosture (AC6 — the dry-run must state the posture)', () => {
  const declaring = {
    kind: 'skill',
    name: 'pair-capability-assess-stack',
    source: '--skill',
  } as const

  it('states that --approval auto will be passed on an autonomous run', () => {
    expect(describeApprovalPosture(declaring, true)).toBe(
      'Approval: --approval auto will be passed (pair-capability-assess-stack declares it; --autonomous is set)',
    )
  })

  it('states the interactive default when the run is not autonomous', () => {
    expect(describeApprovalPosture(declaring, false)).toBe(
      'Approval: nothing passed — pair-capability-assess-stack keeps its interactive default (no --autonomous)',
    )
  })

  it('says nothing at all for a skill that does not declare approval', () => {
    expect(
      describeApprovalPosture({ kind: 'skill', name: 'pair-loop', source: 'cascade' }, true),
    ).toBe(undefined)
    expect(describeApprovalPosture({ kind: 'prompt', text: 'go' }, true)).toBe(undefined)
  })
})

describe('skillAcceptsFilter', () => {
  it('is true only for an invocation that can carry --filter (round 1, finding 1)', () => {
    expect(skillAcceptsFilter({ kind: 'skill', name: 'pair-next', source: 'cascade' })).toBe(true)
    expect(skillAcceptsFilter({ kind: 'skill', name: 'pair-loop', source: 'cascade' })).toBe(false)
    // An unknown skill gets the frozen pair-next scoping parameters, so it does accept one.
    expect(skillAcceptsFilter({ kind: 'skill', name: 'my-skill', source: '--skill' })).toBe(true)
    // A verbatim prompt carries no parameters at all.
    expect(skillAcceptsFilter({ kind: 'prompt', text: 'go' })).toBe(false)
  })
})

describe('buildPromptText', () => {
  it('renders a slash invocation for an engine that speaks slash commands', () => {
    expect(
      buildPromptText(
        ENGINES.claude,
        { kind: 'skill', name: 'pair-loop', source: 'cascade' },
        { root: '212' },
      ),
    ).toBe('/pair-loop --root 212')
  })

  it('keeps a quoted multi-word argument intact in the rendered prompt', () => {
    expect(
      buildPromptText(
        ENGINES.claude,
        { kind: 'skill', name: 'pair-loop', source: 'cascade' },
        { root: '212', predicate: 'tag:risk:red ⇒ Done', iteration: 1 },
      ),
    ).toBe('/pair-loop --root 212 --predicate "tag:risk:red ⇒ Done" --iteration 1')
  })

  it('renders a portable instruction for an engine without slash syntax', () => {
    expect(
      buildPromptText(
        ENGINES.pi,
        { kind: 'skill', name: 'pair-next', source: 'cascade-fallback' },
        { filter: 'risk:green' },
      ),
    ).toBe('Run the pair-next skill with these arguments: --filter risk:green')
  })

  it('passes a --prompt through verbatim, on every engine', () => {
    for (const engine of Object.values(ENGINES)) {
      expect(buildPromptText(engine, { kind: 'prompt', text: 'ship it' }, { root: '212' })).toBe(
        'ship it',
      )
    }
  })
})
