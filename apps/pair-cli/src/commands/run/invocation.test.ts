import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import {
  buildSkillArgs,
  buildPromptText,
  filterDeliveryFor,
  scopeParameterFor,
  dispatchScopeParameterFor,
  DISPATCHABLE_WORKFLOWS,
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
      '--story',
    ])
  })

  it('scopes a catalogued workflow with the argument that workflow declares, not with --root', () => {
    // The dispatched card reaching `pair-process-refine-story` as `--root 304` is a card the skill
    // never sees: its Step 0 then selects the highest-priority `Draft` story on the board instead,
    // while the audit trail and the on-issue record both say card 304 was worked.
    expect(buildSkillArgs('pair-process-refine-story', { root: '304' })).toEqual(['--story', '304'])
    expect(buildSkillArgs('pair-process-plan-tasks', { root: '304' })).toEqual(['--story', '304'])
  })

  it('gives those workflows no --filter either — a single story carries no label selection', () => {
    expect(
      buildSkillArgs('pair-process-refine-story', { root: '304', filter: 'risk:green' }),
    ).toEqual(['--story', '304'])
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
  /** How `pair install` names an installed skill directory: `pair-<family>-<name>`. */
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

describe('filterDeliveryFor', () => {
  it('says HOW the eligibility label reaches the selection, per invocation (round 1, finding 1)', () => {
    // Passed as an argument: pair-next declares `--filter`.
    expect(filterDeliveryFor({ kind: 'skill', name: 'pair-next', source: 'cascade' })).toBe(
      'argument',
    )
    // Read by the skill: pair-loop declares none because it reads `## Eligibility` itself.
    expect(filterDeliveryFor({ kind: 'skill', name: 'pair-loop', source: 'cascade' })).toBe(
      'read-by-skill',
    )
    // Neither: a workflow scoped to ONE card applies no label at all, so reporting the policy's
    // label as this run's perimeter would name a boundary nothing applies.
    expect(
      filterDeliveryFor({ kind: 'skill', name: 'pair-process-refine-story', source: 'mapping' }),
    ).toBe('none')
    // An unknown skill gets the frozen pair-next scoping parameters, so it does accept one.
    expect(filterDeliveryFor({ kind: 'skill', name: 'my-skill', source: '--skill' })).toBe(
      'argument',
    )
    // A verbatim prompt carries no parameters at all.
    expect(filterDeliveryFor({ kind: 'prompt', text: 'go' })).toBe('none')
  })
})

/**
 * Every parameter name the driver spells, checked against the skills' OWN `## Arguments` tables.
 *
 * `SKILL_PARAMETERS` is data about someone else's declaration, and the failure it protects against
 * is silent by construction: an agent handed an argument its skill never declared does not reject
 * it, it ignores it — and a workflow that selects its own subject when unscoped (both
 * `pair-process-*` rows below do, from the highest-priority story on the board) then works a card
 * nobody dispatched, while `dispatch-audit.ts` and the on-issue `DISPATCH-RECORD:` line both name
 * the card that WAS dispatched. The same guard the `$approval` family already has, for the
 * parameter the dispatcher depends on to mean anything at all.
 */
describe('SKILL_PARAMETERS matches the corpus that defines it', () => {
  // apps/pair-cli/src/commands/run -> repo root
  const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')
  const DATASET = join(REPO_ROOT, 'packages/knowledge-hub/dataset')
  const CATALOG = join(
    DATASET,
    '.pair/knowledge/guidelines/collaboration/automation/automation-policy.md',
  )

  /**
   * Every skill in the dataset, under the name `pair install` gives its installed directory
   * (`pair-<path-segments>`): `.skills/process/refine-story` ⇒ `pair-process-refine-story`,
   * `.skills/loop` ⇒ `pair-loop`.
   */
  function skillFiles(): Map<string, string> {
    const found = new Map<string, string>()
    const walk = (directory: string, segments: readonly string[]): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const path = join(directory, entry.name)
        const trail = [...segments, entry.name]
        const skill = join(path, 'SKILL.md')
        if (existsSync(skill)) found.set(`pair-${trail.join('-')}`, skill)
        walk(path, trail)
      }
    }
    walk(join(DATASET, '.skills'), [])
    if (found.size === 0) throw new Error(`no SKILL.md found under ${DATASET} — the scan is broken`)
    return found
  }

  /**
   * The argument NAMES one SKILL.md declares, stripped of their sigil: `$story` and `--story` are
   * the documentation form and the invocation form of one argument (ADL 2026-08-28).
   *
   * FAIL CLOSED: a file with no `## Arguments` section, or a section this cannot parse, throws
   * rather than answering "declares nothing" — which would pass every assertion below.
   */
  function declaredArguments(file: string): string[] {
    const source = readFileSync(file, 'utf-8')
    const heading = /\n## Arguments[^\n]*\n/.exec(source)
    if (heading === null)
      throw new Error(`${file} has no \`## Arguments\` section — cannot decide, refusing to`)
    const rest = source.slice(heading.index + heading[0].length)
    const end = rest.indexOf('\n## ')
    const table = end === -1 ? rest : rest.slice(0, end)
    const names = [...table.matchAll(/^\|\s*`(?:\$|--)([a-z-]+)`/gm)].map(match => match[1]!)
    if (names.length === 0) throw new Error(`${file}: no argument row parsed out of its table`)
    return names
  }

  /** The workflows the KB catalog tells a team it may map a tag to. */
  function catalogWorkflows(): string[] {
    const source = readFileSync(CATALOG, 'utf-8')
    const start = source.indexOf('### The workflows a mapping can name')
    if (start === -1) throw new Error(`${CATALOG}: the workflow catalog section is gone`)
    const rest = source.slice(start + 1)
    const end = rest.search(/\n#{2,3} /)
    const section = end === -1 ? rest : rest.slice(0, end)
    const workflows = [...section.matchAll(/^\|\s*`(pair-[a-z-]+)`\s*\|/gm)].map(m => m[1]!)
    if (workflows.length === 0)
      throw new Error(`${CATALOG}: no workflow row parsed out of the catalog`)
    return workflows
  }

  const files = skillFiles()
  const fileFor = (skill: string): string => {
    const file = files.get(skill)
    if (file === undefined) throw new Error(`${skill} has no SKILL.md in the dataset corpus`)
    return file
  }
  const bare = (parameter: string): string => parameter.replace(/^--/, '')

  it('spells every parameter with the name the skill itself declares', () => {
    for (const [skill, parameters] of Object.entries(SKILL_PARAMETERS)) {
      const declared = declaredArguments(fileFor(skill))
      for (const parameter of Object.values(parameters)) {
        expect(
          declared,
          `${skill} does not declare ${parameter} in its \`## Arguments\` table`,
        ).toContain(bare(parameter))
      }
    }
  })

  /**
   * SET EQUALITY, not one-way inclusion — the two directions fail differently and both are real.
   *
   * catalogued ⊄ dispatchable: a team copies a mapping verbatim out of the guideline and the whole
   * board HALTs on it. dispatchable ⊄ catalogued: a workflow nothing documents as mappable is
   * accepted, and a team that maps a tag to it gets the card's exclusive lock taken, an
   * `event=start … workflow=<x>` audit line and a DISPATCH-RECORD comment on the card, for whatever
   * that skill happens to do — while the HALT message, the catalog, the tutorial and ADR-024 all
   * told them it was refused. Only equality holds the documented set and the enforced set together.
   */
  it('dispatches exactly the workflows the KB catalog names — no more, no fewer', () => {
    const catalogued = catalogWorkflows()
    // The catalog is the thing a team copies from: `auto-refine ⇒ pair-process-refine-story`
    // appears verbatim there, in adoption-files.mdx and in the tutorial.
    expect(catalogued.length).toBeGreaterThan(1)
    expect([...DISPATCHABLE_WORKFLOWS].sort()).toEqual([...catalogued].sort())
  })

  it('scopes every dispatchable workflow under the name that workflow itself declares', () => {
    for (const workflow of DISPATCHABLE_WORKFLOWS) {
      const parameter = dispatchScopeParameterFor(workflow)
      expect(
        parameter,
        `${workflow} is dispatchable but the driver declares no scoping parameter for it — a card routed to it would be dropped from the invocation`,
      ).toBeDefined()
      expect(declaredArguments(fileFor(workflow))).toContain(bare(parameter!))
    }
  })

  it('refuses to scope a dispatch to a skill the catalog does not name, however well it knows it', () => {
    // `pair-next` has a full `SKILL_PARAMETERS` row (`--skill pair-next --root 212` is a legitimate
    // hand-driven run) and is still not dispatchable: the argument table answers "how do I spell
    // this skill's scope", never "may a tag route a card here".
    expect(scopeParameterFor('pair-next')).toBe('--root')
    expect(dispatchScopeParameterFor('pair-next')).toBeUndefined()
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
