import { describe, it, expect } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { pathToFileURL } from 'url'

// US-521 remediation r1-g2, finding r0-1 — the in-session coordinator (`/pair-workflow-cycle`) and
// `pair-cli run --card` must hand `cycle-state.mjs resolve` the SAME policy for the same declaration.
// pair-cli forwards the resolved autonomy policy ONLY when the resolution is `active` and otherwise
// keeps the legacy `autoAdvance` + `--tier` path (cycle-entry.ts / cycle-wiring.ts). The SKILL must
// state the same rule, in both copies, with ONE canonical phrase per clause:
//
//   - Step 1, every sentence handing `"autonomy"` to `resolve`: "only when `active` is `true`";
//   - Step 1, every sentence keeping `"autoAdvance"` + `--tier`:  "only when `active` is `false`";
//   - Step 5 Merge, a sentence naming `--mergeGate`:              "only when `active` is `true`".
//
// A sentence that names `active` together with a negator or override (not, never, regardless,
// whether or not, even when/if, always, also, irrespective, unconditionally) states NO condition:
// it is read as unconditional. The rule so read is then EXECUTED — through the real
// `autonomy-policy.mjs` and `cycle-state.mjs` — on a legacy-only adoption and compared with the
// pair-cli composition. The extractor itself is proven on in-test mutated copies of the real SKILL
// text as shipped at 15c99bc4 (frozen in __fixtures__/cycle-skill-r0-1-base.md; rows G2-X*): every backwards wording is read as unconditional and the comparison fails on it;
// the canonical wording is read as conditional and the comparison holds.
//
// Hermetic: dataset scripts, temp run directories, no `gh`, no engine.

const DATASET = join(__dirname, '../../dataset')
const SCRIPTS = join(DATASET, '.skills/workflow/cycle/scripts')
const COPIES: Array<[string, string]> = [
  ['dataset', join(DATASET, '.skills/workflow/cycle/SKILL.md')],
  ['mirror', join(__dirname, '../../../../.claude/skills/pair-workflow-cycle/SKILL.md')],
]

type Json = Record<string, unknown>
interface Resolution {
  ok: boolean
  active: boolean
  policy: { until: string; merge: Json; prepare: Json; legacyTiers?: string[] }
}
interface PolicyScript {
  resolvePolicy: (input: { args?: Json; adoptionText?: string }) => Resolution
}
interface StateScript {
  resolve: (input: Json) => { status: string; next: Json }
  publish: (input: Json) => { published: boolean }
}
const policyScript = async (): Promise<PolicyScript> =>
  (await import(pathToFileURL(join(SCRIPTS, 'autonomy-policy.mjs')).href)) as PolicyScript
const stateScript = async (): Promise<StateScript> =>
  (await import(pathToFileURL(join(SCRIPTS, 'cycle-state.mjs')).href)) as StateScript

// ── the extractor ───────────────────────────────────────────────────────────────────────────
/** Sentences as a reader splits them: a period inside `code` ends no sentence. */
function sentences(text: string): string[] {
  const out: string[] = []
  let current = ''
  let code = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    current += ch
    if (ch === '`') code = !code
    if (!code && ch === '.' && /\s/.test(text[i + 1] ?? ' ')) {
      out.push(current.trim())
      current = ''
    }
  }
  if (current.trim()) out.push(current.trim())
  return out
}
function between(content: string, startMarker: string, endMarker: string): string {
  const start = content.indexOf(startMarker)
  if (start === -1) return ''
  const end = content.indexOf(endMarker, start + startMarker.length)
  return content.slice(start, end === -1 ? undefined : end)
}
/** Step 1's autonomy block: from its bold lead to the workflow-profile paragraph that follows it. */
const autonomyBlock = (c: string) =>
  between(c, '**Autonomy policy (US-521).**', 'The workflow profile is resolved ONCE')
const mergeParagraph = (c: string) => between(c, '**Merge (`next.step: merge`).**', '\n\n')

const CANON_TRUE = /only when `active` is `true`/i
const CANON_FALSE = /only when `active` is `false`/i
const OVERRIDE =
  /\b(not|never|regardless|whether or not|even when|even if|always|also|irrespective|unconditionally)\b/i
const MENTIONS_ACTIVE = /\bactive\b/

/** A sentence states the condition only with the canonical phrase and no negator/override. */
const states = (sentence: string, canon: RegExp) => canon.test(sentence) && !OVERRIDE.test(sentence)
/** Any sentence naming `active` with a negator/override voids the condition of its whole block. */
const overridden = (block: string) =>
  sentences(block).some(s => MENTIONS_ACTIVE.test(s) && OVERRIDE.test(s))

interface ReadRule {
  /** `"autonomy"` handed only when active. */
  readonly handOffConditional: boolean
  /** `"autoAdvance"` + `--tier` kept only when NOT active. */
  readonly legacyConditional: boolean
  /** `--mergeGate` only when active. */
  readonly mergeConditional: boolean
}
function readRule(content: string): ReadRule {
  const block = autonomyBlock(content)
  const all = sentences(block)
  const handOff = all.filter(s => s.includes('"autonomy"'))
  const legacy = all.filter(s => s.includes('"autoAdvance"'))
  const merge = mergeParagraph(content)
  const voided = overridden(block)
  return {
    handOffConditional: !voided && handOff.length > 0 && handOff.every(s => states(s, CANON_TRUE)),
    legacyConditional: !voided && legacy.length > 0 && legacy.every(s => states(s, CANON_FALSE)),
    mergeConditional:
      merge.includes('--mergeGate') &&
      !overridden(merge) &&
      sentences(merge).some(s => s.includes('--mergeGate') && states(s, CANON_TRUE)),
  }
}

/** The policy the SKILL, as READ, makes the coordinator hand `resolve` — two independent switches. */
function skillPolicy(rule: ReadRule, resolution: Resolution, tiers: string[]): Json {
  const autonomy = { until: resolution.policy.until, merge: resolution.policy.merge }
  const passAutonomy = rule.handOffConditional ? resolution.active : true
  const passLegacy = (rule.legacyConditional ? !resolution.active : true) && tiers.length > 0
  return { ...(passLegacy && { autoAdvance: { tiers } }), ...(passAutonomy && { autonomy }) }
}
/** pair-cli's composition (cycle-entry.ts `autonomy?.active === true`, cycle-wiring.ts resolvePolicyFor). */
function pairCliPolicy(resolution: Resolution, tiers: string[]): Json {
  if (resolution.active)
    return { autonomy: { until: resolution.policy.until, merge: resolution.policy.merge } }
  return tiers.length > 0 ? { autoAdvance: { tiers } } : {}
}
/** Labels are handed only when `until: merged` and the gate is `when` — the same rule in both. */
const labelsFor = (policy: Json, labels: string[]): Json => {
  const a = policy['autonomy'] as { until?: string; merge?: { mode?: string } } | undefined
  return a?.until === 'merged' && a.merge?.mode === 'when' ? { labels } : {}
}

// ── fixtures ────────────────────────────────────────────────────────────────────────────────
const V = '3.0.0'
const SHA = (c: string) => c.repeat(40)
const BASE = { maxFixRounds: 3, redRepairs: 1, greenRetries: 1, reviewers: 1 }
const LEGACY = '## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\nrisk:green\n'
const DECLARED = '## Autonomy\n\nuntil: merged\nmerge: when; has: cost:red\n'

function runRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'cycle-autonomy-active-'))
  mkdirSync(join(root, '.pair', 'adoption', 'tech'), { recursive: true })
  writeFileSync(
    join(root, '.pair', 'adoption', 'tech', 'way-of-working.md'),
    '## Assignment\n\n- `default-assignee`: `rucka` — the maintainer.\n',
  )
  const dir = join(root, '.pair', 'working', 'runs', 'run-1', '42')
  mkdirSync(dir, { recursive: true })
  return dir
}
async function approvedRun(): Promise<string> {
  const { publish } = await stateScript()
  const dir = runRoot()
  const file = join(dir, 'tmp-r0.json')
  writeFileSync(
    file,
    JSON.stringify({
      run: 'run-1',
      story: '42',
      pr: 7,
      branch: 'feature/US-42',
      phase: 'r0',
      skill: 'review-phase',
      inputHead: SHA('a'),
      reviewedHead: SHA('c'),
      verdict: 'APPROVED',
      findings: [],
      custody: { verified: true, contractBreach: false },
      readiness: { ready: true, remoteHead: SHA('c') },
      mode: 'first',
    }),
  )
  expect(
    publish({ dir, file, phase: 'r0', skill: 'review-phase', workflowVersion: V }).published,
  ).toBe(true)
  return dir
}

interface Scenario {
  readonly adoption: string
  readonly args?: Json
  readonly tier: string
  readonly labels: string[]
  readonly at: 'fresh' | 'approved'
}
async function nextOf(policy: Json, s: Scenario): Promise<Json> {
  const { resolve } = await stateScript()
  const dir = s.at === 'fresh' ? runRoot() : await approvedRun()
  const entry = s.at === 'fresh' ? { entry: 'fresh' } : { entry: 'pr', pr: 7 }
  const out = resolve({
    dir,
    workflowVersion: V,
    ...entry,
    tier: s.tier,
    policy: { ...BASE, ...policy },
    ...labelsFor(policy, s.labels),
  })
  return {
    status: out.status,
    step: out.next['step'],
    reason: out.next['reason'],
    tier: out.next['tier'],
  }
}
async function compare(content: string, s: Scenario) {
  const { resolvePolicy } = await policyScript()
  const resolution = resolvePolicy({ args: s.args ?? {}, adoptionText: s.adoption })
  expect(resolution.ok).toBe(true)
  const tiers = resolution.policy.legacyTiers ?? []
  return {
    resolution,
    skill: await nextOf(skillPolicy(readRule(content), resolution, tiers), s),
    cli: await nextOf(pairCliPolicy(resolution, tiers), s),
  }
}
const I1: Scenario = { adoption: LEGACY, tier: 'risk:yellow', labels: ['risk:yellow'], at: 'fresh' }

// ── the real SKILL, both copies ─────────────────────────────────────────────────────────────
describe.each(COPIES)(
  'r0-1 — %s cycle SKILL.md states the canonical `active` condition',
  (_, path) => {
    const content = readFileSync(path, 'utf-8')

    it('G2-S1: Step 1 hands `"autonomy"` to `resolve` only when `active` is `true`', () => {
      expect(readRule(content).handOffConditional).toBe(true)
    })

    it('G2-S2: Step 1 keeps the legacy `"autoAdvance"` + `--tier` path only when `active` is `false`', () => {
      expect(readRule(content).legacyConditional).toBe(true)
    })

    it('G2-S3: Step 5 Merge passes `--mergeGate` only when `active` is `true`', () => {
      expect(readRule(content).mergeConditional).toBe(true)
    })
  },
)

describe.each(COPIES)('r0-1 — %s: the SKILL rule, as read, gives pair-cli’s `next`', (_, path) => {
  const content = readFileSync(path, 'utf-8')

  it('G2-C1: the producer — a legacy-only adoption resolves ok and NOT active', async () => {
    const { resolvePolicy } = await policyScript()
    const r = resolvePolicy({ adoptionText: LEGACY })
    expect(r.ok).toBe(true)
    expect(r.active).toBe(false)
    expect(r.policy.legacyTiers).toEqual(['risk:green'])
  })

  it('G2-I1: legacy-only, risk:yellow card, fresh entry ⇒ same next (pair-cli: implement)', async () => {
    const r = await compare(content, I1)
    expect(r.cli.step).toBe('implement')
    expect(r.skill).toEqual(r.cli)
  })

  it('G2-I3: legacy-only, risk:yellow card, review-approved ⇒ same next (pair-cli: done, no merge offered)', async () => {
    const r = await compare(content, { ...I1, at: 'approved' })
    expect(r.cli.step).toBe('done')
    expect(r.skill).toEqual(r.cli)
  })

  it('G2-I2: legacy-only, risk:green card, review-approved ⇒ same next (pair-cli: merge with the tier)', async () => {
    const r = await compare(content, {
      adoption: LEGACY,
      tier: 'risk:green',
      labels: ['risk:green'],
      at: 'approved',
    })
    expect(r.cli).toMatchObject({ step: 'merge', tier: 'risk:green' })
    expect(r.skill).toEqual(r.cli)
  })

  it('G2-C2: nothing declared, nothing passed ⇒ same next at both boundaries', async () => {
    for (const at of ['fresh', 'approved'] as const) {
      const r = await compare(content, { adoption: '', tier: 'risk:yellow', labels: [], at })
      expect(r.resolution.active).toBe(false)
      expect(r.skill).toEqual(r.cli)
    }
  })

  it('G2-C3: `## Autonomy` declared (active) ⇒ both forward autonomy — same escalation on cost:red', async () => {
    const r = await compare(content, {
      adoption: DECLARED,
      tier: 'risk:green',
      labels: ['cost:red'],
      at: 'approved',
    })
    expect(r.resolution.active).toBe(true)
    expect(r.cli.status).toBe('escalated')
    expect(r.skill).toEqual(r.cli)
  })

  it('G2-C4: legacy-only adoption made active by an argument (`until: pr`) ⇒ same next', async () => {
    const r = await compare(content, {
      adoption: LEGACY,
      args: { until: 'pr' },
      tier: 'risk:green',
      labels: ['risk:green'],
      at: 'approved',
    })
    expect(r.resolution.active).toBe(true)
    expect(r.cli.step).toBe('done')
    expect(r.skill).toEqual(r.cli)
  })
})

// ── the extractor, proven on mutated copies of the real SKILL text ──────────────────────────
/**
 * The text the mutations run on is FROZEN: the base excerpt (r0-1 as shipped) committed beside this file,
 * not the live SKILL — so these rows keep proving the extractor after the fix rewrites the SKILL.
 */
const ORIGINAL = readFileSync(join(__dirname, '__fixtures__/cycle-skill-r0-1-base.md'), 'utf-8')
const HAND_OFF = 'Hand `resolve` the result as'
const LEGACY_LEAD = 'With no `## Autonomy` but a legacy `## Auto-Advance` tier, keep passing'
const MERGE_FLAGS =
  "(--autoAdvance '<the tiers JSON array>' | --mergeGate '<the merge gate JSON {mode,has,lacks}>')`."

/** One literal substitution on the real text — refused if the anchor is gone (a stale mutation proves nothing). */
function mutate(edits: ReadonlyArray<readonly [string, string]>): string {
  let text = ORIGINAL
  for (const [from, to] of edits) {
    expect(text.includes(from), `mutation anchor ${JSON.stringify(from)}`).toBe(true)
    text = text.replace(from, to)
  }
  return text
}
const CANONICAL = mutate([
  [HAND_OFF, 'Only when `active` is `true`, hand `resolve` the result as'],
  [LEGACY_LEAD, 'Only when `active` is `false`, keep passing'],
  [
    MERGE_FLAGS,
    `${MERGE_FLAGS} Pass \`--mergeGate\` only when \`active\` is \`true\`; \`--autoAdvance\` otherwise.`,
  ],
])
/** A copy that keeps the r0-1 behaviour, worded in a way that names `active` (verifier counterexample). */
const BACKWARDS = mutate([
  [HAND_OFF, 'Whether or not the resolution is `active`, ALWAYS hand `resolve` the result as'],
  [LEGACY_LEAD, 'Even when `active` is true, also keep passing'],
  [MERGE_FLAGS, `${MERGE_FLAGS} Pass \`--mergeGate\` regardless of \`active\`.`],
])
const HAND_OFF_VARIANTS: ReadonlyArray<readonly [string, string]> = [
  ['G2-X2', 'Regardless of `active`, hand `resolve` the result as'],
  ['G2-X3', 'Even when `active` is `false`, hand `resolve` the result as'],
  [
    'G2-X4',
    'Only when `active` is `true` — and also always otherwise — hand `resolve` the result as',
  ],
  ['G2-X5', 'Only when `active` is not `true`, hand `resolve` the result as'],
]

describe('r0-1 — the extractor on mutated copies of the real SKILL text', () => {
  it('G2-X0: the canonical wording is read as conditional on all three clauses, and I1 holds on it', async () => {
    expect(readRule(CANONICAL)).toEqual({
      handOffConditional: true,
      legacyConditional: true,
      mergeConditional: true,
    })
    const r = await compare(CANONICAL, I1)
    expect(r.skill).toEqual(r.cli)
  })

  it('G2-X1: the verifier’s backwards wording is read as unconditional on all three, and I1 FAILS on it', async () => {
    expect(readRule(BACKWARDS)).toEqual({
      handOffConditional: false,
      legacyConditional: false,
      mergeConditional: false,
    })
    const r = await compare(BACKWARDS, I1)
    expect(r.cli.step).toBe('implement')
    expect(r.skill).not.toEqual(r.cli)
    expect(r.skill.status).toBe('escalated')
  })

  it.each(HAND_OFF_VARIANTS)(
    '%s: a hand-off naming `active` with a negator/override is unconditional, and I1 FAILS on it',
    async (_, wording) => {
      const text = mutate([
        [HAND_OFF, wording],
        [LEGACY_LEAD, 'Only when `active` is `false`, keep passing'],
      ])
      expect(readRule(text).handOffConditional).toBe(false)
      const r = await compare(text, I1)
      expect(r.skill).not.toEqual(r.cli)
    },
  )

  it('G2-X6: a backwards legacy sentence alone (hand-off canonical) is unconditional — legacy and autonomy both handed', () => {
    const text = mutate([
      [HAND_OFF, 'Only when `active` is `true`, hand `resolve` the result as'],
      [LEGACY_LEAD, 'Even when `active` is `true`, also keep passing'],
    ])
    expect(readRule(text).legacyConditional).toBe(false)
  })

  it('G2-X7: a Merge sentence `--mergeGate regardless of active` voids the canonical one beside it', () => {
    const text = mutate([
      [
        MERGE_FLAGS,
        `${MERGE_FLAGS} Pass \`--mergeGate\` only when \`active\` is \`true\`. Pass \`--mergeGate\` regardless of \`active\`.`,
      ],
    ])
    expect(readRule(text).mergeConditional).toBe(false)
  })

  it('G2-X8: the frozen base text (r0-1 as shipped) is read as unconditional and I1 fails on it — the defect', async () => {
    expect(readRule(ORIGINAL).handOffConditional).toBe(false)
    const r = await compare(ORIGINAL, I1)
    expect(r.skill).not.toEqual(r.cli)
  })
})
