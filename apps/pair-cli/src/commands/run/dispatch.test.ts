import { describe, it, expect } from 'vitest'
import { decideDispatch, describeDispatch, lockedSkip, type DispatchRequest } from './dispatch'
import { readWorkflowMapping } from './workflow-mapping'

const MAPPING = readWorkflowMapping(`## Workflows

auto-dev ⇒ pair-loop
auto-refine ⇒ pair-process-refine-story
Precedence: auto-refine, auto-dev
`)

const INSTALLED = new Set(['pair-loop', 'pair-process-refine-story', 'pair-next'])

function request(overrides: Partial<DispatchRequest> = {}): DispatchRequest {
  return {
    card: '217',
    tags: ['auto-dev', 'risk:green'],
    eligibility: 'risk:green',
    mapping: MAPPING,
    isInstalled: name => INSTALLED.has(name),
    ...overrides,
  }
}

describe('decideDispatch — routing an eligible, mapped card (AC1)', () => {
  it('routes the card to the workflow its tag maps to', () => {
    expect(decideDispatch(request())).toEqual({
      kind: 'route',
      card: '217',
      tag: 'auto-dev',
      workflow: 'pair-loop',
    })
  })

  it('resolves a card carrying two mapped tags through the declared precedence', () => {
    const decision = decideDispatch(request({ tags: ['auto-dev', 'auto-refine', 'risk:green'] }))

    expect(decision).toMatchObject({ kind: 'route', tag: 'auto-refine' })
  })

  it('matches a tag by plain string equality, never by prefix or family', () => {
    const decision = decideDispatch(request({ tags: ['auto-develop', 'risk:green'] }))

    expect(decision).toMatchObject({ kind: 'skip', reason: 'unmapped' })
  })
})

describe('decideDispatch — nothing runs where nothing was declared (AC2, AC4)', () => {
  it('skips a card carrying no mapped tag, and says so', () => {
    const decision = decideDispatch(request({ tags: ['risk:green'] }))

    expect(decision).toMatchObject({ kind: 'skip', reason: 'unmapped' })
    expect(describeDispatch(decision)).toContain('no mapped tag')
  })

  it('skips an untagged card — it matches neither eligibility nor any route', () => {
    const decision = decideDispatch(request({ tags: [] }))

    expect(decision.kind).toBe('skip')
    // Eligibility is evaluated first, so an untagged card never even reaches routing — the same
    // fail-safe `## Eligibility` already carries (untagged ⇒ never), not a second rule.
    expect(decision).toMatchObject({ reason: 'ineligible' })
  })

  it('skips a card that IS eligible but carries no mapped tag — no default workflow exists', () => {
    expect(decideDispatch(request({ tags: ['risk:green'] }))).toMatchObject({
      kind: 'skip',
      reason: 'unmapped',
    })
  })

  it('reports "no mapping declared" when the adoption has no `## Workflows` section', () => {
    const decision = decideDispatch(request({ mapping: undefined }))

    expect(decision).toMatchObject({ kind: 'skip', reason: 'no-mapping-declared' })
    expect(describeDispatch(decision)).toContain('no mapping declared')
    expect(describeDispatch(decision)).toContain('.pair/adoption/tech/automation.md')
  })

  it('never routes when no `## Eligibility` is declared — automation is off, not widened', () => {
    const decision = decideDispatch(request({ eligibility: undefined }))

    expect(decision).toMatchObject({ kind: 'skip', reason: 'automation-off' })
  })
})

describe('decideDispatch — eligibility is applied BEFORE routing (BR3)', () => {
  it('skips a mapped card that does not carry the eligibility label, and logs the skip', () => {
    const decision = decideDispatch(request({ tags: ['auto-dev', 'risk:red'] }))

    expect(decision).toMatchObject({ kind: 'skip', reason: 'ineligible' })
    expect(describeDispatch(decision)).toContain('risk:green')
  })

  it('skips an ineligible card even when its tags would resolve a workflow', () => {
    const decision = decideDispatch(request({ tags: ['auto-dev', 'auto-refine'] }))

    expect(decision).toMatchObject({ kind: 'skip', reason: 'ineligible' })
  })
})

describe('decideDispatch — HALTs, never a silent choice', () => {
  it('HALTs on two mapped tags with no precedence declared', () => {
    const mapping = readWorkflowMapping(`## Workflows

auto-dev ⇒ pair-loop
auto-refine ⇒ pair-process-refine-story
`)

    expect(() =>
      decideDispatch(request({ mapping, tags: ['auto-dev', 'auto-refine', 'risk:green'] })),
    ).toThrow(/Precedence/)
  })

  it('HALTs when precedence lists none of the tags the card actually carries', () => {
    const mapping = readWorkflowMapping(`## Workflows

auto-dev ⇒ pair-loop
auto-refine ⇒ pair-process-refine-story
auto-triage ⇒ pair-next
Precedence: auto-triage
`)

    expect(() =>
      decideDispatch(request({ mapping, tags: ['auto-dev', 'auto-refine', 'risk:green'] })),
    ).toThrow(/Precedence/)
  })

  it('HALTs on a declared workflow that is not installed, with an adoption-fix message', () => {
    expect(() =>
      decideDispatch(request({ isInstalled: name => name !== 'pair-process-refine-story' })),
    ).toThrow(/pair-process-refine-story/)
  })

  it('detects an uninstalled workflow before deciding, not only when a card routes to it', () => {
    expect(() =>
      decideDispatch(
        request({
          tags: ['risk:green'],
          isInstalled: name => name !== 'pair-process-refine-story',
        }),
      ),
    ).toThrow(/not installed/)
  })

  it('HALTs on a mapped workflow whose scoping argument the driver cannot spell', () => {
    // The defect this closes: the workflow IS installed, so the check above passed, and the card
    // was then handed to it under a scoping parameter nobody verified it declares. An unrecognised
    // scope does not fail loudly inside the agent — it is ignored, and a workflow that selects its
    // own subject when unscoped (both `pair-process-*` rows of the KB catalog do) then works a
    // DIFFERENT card than the one the audit trail and the on-issue `DISPATCH-RECORD:` name.
    const mapping = readWorkflowMapping(`## Workflows

auto-review ⇒ pair-process-review
`)
    const installed = (name: string): boolean =>
      INSTALLED.has(name) || name === 'pair-process-review'

    let thrown: unknown
    try {
      decideDispatch(
        request({ mapping, tags: ['auto-review', 'risk:green'], isInstalled: installed }),
      )
    } catch (error) {
      thrown = error
    }

    expect(String(thrown)).toMatch(/pair-process-review/)
    expect(String(thrown)).toMatch(/scop/i)
    expect(String(thrown)).toMatch(/automation\.md/)
  })

  it('detects an unscopable workflow before deciding, not only when a card routes to it', () => {
    const mapping = readWorkflowMapping(`## Workflows

auto-dev ⇒ pair-loop
auto-review ⇒ pair-process-review
Precedence: auto-review, auto-dev
`)

    // This card carries `auto-dev` only — it would route cleanly to pair-loop. The mapping is
    // broken configuration either way, and which trigger fires first must not decide whether the
    // board finds out.
    expect(() =>
      decideDispatch(
        request({
          mapping,
          tags: ['auto-dev', 'risk:green'],
          isInstalled: name => INSTALLED.has(name) || name === 'pair-process-review',
        }),
      ),
    ).toThrow(/pair-process-review/)
  })

  it('routes to every workflow the KB catalog recommends, each under its own scoping argument', () => {
    // The three rows of `automation-policy.md` § "The workflows a mapping can name": a mapping
    // copied verbatim out of the guideline must dispatch, not HALT.
    const mapping = readWorkflowMapping(`## Workflows

auto-refine ⇒ pair-process-refine-story
auto-plan ⇒ pair-process-plan-tasks
auto-dev ⇒ pair-loop
Precedence: auto-refine, auto-plan, auto-dev
`)
    const installed = new Set([...INSTALLED, 'pair-process-plan-tasks'])

    expect(
      decideDispatch(
        request({ mapping, tags: ['auto-plan', 'risk:green'], isInstalled: n => installed.has(n) }),
      ),
    ).toMatchObject({ kind: 'route', workflow: 'pair-process-plan-tasks' })
  })

  it('never falls back to another workflow when the declared one is missing', () => {
    let thrown: unknown
    try {
      decideDispatch(request({ isInstalled: () => false }))
    } catch (error) {
      thrown = error
    }

    expect(String(thrown)).toMatch(/automation\.md/)
    expect(String(thrown)).not.toMatch(/falling back/)
  })
})

describe('describeDispatch — every decision is legible before anything spawns', () => {
  it('names the card, the tag and the workflow on a route', () => {
    const line = describeDispatch(decideDispatch(request()))

    expect(line).toContain('217')
    expect(line).toContain('auto-dev')
    expect(line).toContain('pair-loop')
  })
})

// The one skip nothing releases on its own: a lock survives the process that took it, so a run
// killed by SIGKILL, an OOM kill or a host job timeout turns every later trigger on that card into
// a silent, exit-0 skip. Automation is then off for that card, permanently, with no alert.
describe('lockedSkip — a held card reports the holder, not just the refusal', () => {
  const path = '/w/.pair/working/automation/locks/217'
  const now = new Date('2026-08-30T12:00:00.000Z')

  it('names the directory to remove and how long the holder has had it', () => {
    const decision = lockedSkip('217', { path, since: '2026-08-30T08:48:00.000Z' }, now)

    expect(decision).toMatchObject({ kind: 'skip', reason: 'run-in-progress' })
    const line = describeDispatch(decision)
    expect(line).toContain(path)
    expect(line).toContain('held 3h 12m')
    expect(line).toContain('2026-08-30T08:48:00.000Z')
    expect(line).toMatch(/stale/)
  })

  it.each([
    ['a fresh burst', '2026-08-30T11:59:30.000Z', 'held under a minute'],
    ['minutes', '2026-08-30T11:23:00.000Z', 'held 37m'],
    ['days', '2026-08-27T09:00:00.000Z', 'held 3d 3h'],
  ])('renders %s as an age an operator can judge', (_, since, expected) => {
    expect(describeDispatch(lockedSkip('217', { path, since }, now))).toContain(expected)
  })

  it('reports the path alone when the holder note said nothing readable', () => {
    const line = describeDispatch(lockedSkip('217', { path }, now))

    expect(line).toContain(path)
    expect(line).not.toContain('held ')
  })

  it('does not render a garbage age from a garbage timestamp', () => {
    const line = describeDispatch(lockedSkip('217', { path, since: 'not-a-date' }, now))

    expect(line).toContain(path)
    expect(line).not.toContain('NaN')
    expect(line).not.toContain('held ')
  })
})
