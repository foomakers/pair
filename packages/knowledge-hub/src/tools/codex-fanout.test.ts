import { describe, expect, it } from 'vitest'
import {
  appendAudit,
  assertBlind,
  auditLine,
  BLIND_DENY_PREFIXES,
  blindDenyPrefixes,
  buildPacket,
  collectOutcome,
  COMMANDS,
  converge,
  effectiveParallelism,
  HARNESS_SURFACE_MAP,
  main,
  MAX_FIX_ROUNDS_DEFAULT,
  OWED_PHASES,
  PacketRejected,
  PHASE_CONTRACTS,
  PHASES,
  REALIZATION_TIERS,
  reconstructState,
  requiredHandles,
  resolveRealization,
  resumePlan,
  schemaViolations,
  TERMINAL_OUTCOMES,
  type AuditFs,
  type AuditRecord,
  type Card,
  type Finding,
} from './codex-fanout'

/**
 * The conformance suite for the Codex in-harness fan-out realization.
 *
 * Every case here runs against MOCKED harness primitives — a probe stub in each of its
 * states and hand-written return values — so CI needs no Codex binary and no network. That
 * is not a convenience: the far side of this integration is observably in motion, and a
 * suite that depended on the vendor would go red for reasons that are not this repo's.
 */

const V1_TOOLS = ['spawn_agent', 'wait_agent', 'send_input', 'resume_agent', 'close_agent']
const V2_TOOLS = [
  'spawn',
  'wait',
  'list_agents',
  'send_message',
  'followup_task',
  'interrupt_agent',
]

/** What a Claude Code session exposes — the delegated-run handle plus ordinary tools. */
const CLAUDE_TOOLS = ['Workflow', 'Task', 'Read', 'Bash', 'Edit']

/** `fix` is the one phase whose packet is refused without findings; the rest carry none. */
const FIX_FINDINGS: Readonly<Record<string, Finding[] | undefined>> = {
  fix: [{ location: 'a.ts:1', severity: 'Major' }],
}

const CARD: Card = {
  id: '441',
  title: 'Codex workflow orchestration',
  branch: 'feature/US-441-codex-workflow-orchestration',
}

/** In-memory double — no mocks, no real filesystem (the testing guideline's preference). */
class InMemoryAuditFs implements AuditFs {
  readonly files = new Map<string, string>()
  readonly dirs: string[] = []
  failOn: 'mkdir' | 'append' | 'read' | 'none' = 'none'
  /** Simulates a write that silently does not land — the case a returned flag would hide. */
  swallowAppends = false

  mkdirSync(path: string): void {
    if (this.failOn === 'mkdir') throw new Error('EACCES')
    this.dirs.push(path)
  }

  appendFileSync(path: string, data: string): void {
    if (this.failOn === 'append') throw new Error('EROFS')
    if (this.swallowAppends) return
    this.files.set(path, (this.files.get(path) ?? '') + data)
  }

  readFileSync(path: string): string {
    if (this.failOn === 'read') throw new Error('ENOENT')
    return this.files.get(path) ?? ''
  }
}

describe('the surface map is data', () => {
  it('holds EVERY known in-harness realization, in preference order, each with a verification note', () => {
    // Claude Code belongs here as much as Codex does. While it was missing, `bind` answered a
    // Claude session with `degraded-one-card` — the announcement the skill prints and audits
    // said "no fan-out primitive is exposed" on the very session that then fanned out through
    // the workflow, and the step whose condition is "the probe missed" was satisfied at the
    // same time as the step that routes on the product name.
    expect(HARNESS_SURFACE_MAP.map(r => r.id)).toEqual([
      'claude-code-workflow',
      'codex-multi-agent-v2',
      'codex-multi-agent-v1',
    ])
    for (const realization of HARNESS_SURFACE_MAP) {
      expect(realization.tier).toBe(REALIZATION_TIERS.IN_HARNESS)
      expect(requiredHandles(realization.handles).every(h => h !== '')).toBe(true)
      expect(realization.gating.featureKey).toBeTruthy()
      expect(realization.verifiedAgainst).toMatch(/\d{4}-\d{2}-\d{2}/)
    }
  })

  it('declares a dispatch shape per entry — the orchestrator sequences, or it delegates', () => {
    const shapes = Object.fromEntries(HARNESS_SURFACE_MAP.map(r => [r.id, r.handles.dispatch]))
    expect(shapes).toEqual({
      'claude-code-workflow': 'delegated-run',
      'codex-multi-agent-v2': 'spawn-wait',
      'codex-multi-agent-v1': 'spawn-wait',
    })
  })

  it('bounds only the realizations this orchestrator waits on itself', () => {
    for (const realization of HARNESS_SURFACE_MAP)
      if (realization.handles.dispatch === 'spawn-wait') {
        expect(realization.bounding?.concurrencyKey).toBeTruthy()
        // The bound to apply when NOTHING observable yields one is data on the entry. A
        // `spawn-wait` entry without it leaves the caller with no legal wait bound at all,
        // and AC10 ("every wait is bounded") unmet on the path that entry serves.
        expect(realization.bounding?.fallbackWaitTimeoutMs).toBeGreaterThan(0)
        const keys = realization.bounding?.waitTimeoutKeys
        if (keys !== null) expect(keys?.max).toBeTruthy()
      } else expect(realization.bounding).toBeUndefined()
  })

  it('never borrows another feature’s config keys as its own bound', () => {
    // v1 declared `features.multi_agent_v2.{min,max,default}_wait_timeout_ms` while gated by
    // `features.multi_agent`. Verified on codex-cli 0.150.1: `codex features list` reports
    // `multi_agent stable true` and `multi_agent_v2 stable false`, and the only wait-timeout
    // keys in the binary hang off `MultiAgentV2ConfigToml`. So on the DEFAULT session — v1, the
    // one a bare session binds — the caller was pointed at keys belonging to a feature that is
    // OFF and therefore unset, the read returned nothing, and the step offered no third branch.
    for (const realization of HARNESS_SURFACE_MAP) {
      const keys = realization.bounding?.waitTimeoutKeys
      if (!keys) continue
      for (const key of Object.values(keys))
        expect(key.startsWith(`${realization.gating.featureKey}.`)).toBe(true)
    }
    expect(
      HARNESS_SURFACE_MAP.find(r => r.id === 'codex-multi-agent-v1')?.bounding?.waitTimeoutKeys,
    ).toBeNull()
  })

  it('is frozen, so a caller cannot mutate the map instead of editing it', () => {
    expect(Object.isFrozen(HARNESS_SURFACE_MAP)).toBe(true)
  })
})

describe('probe → bind → announce', () => {
  it('binds the v1 toolset when the session exposes it', () => {
    const binding = resolveRealization({ tools: V1_TOOLS })
    expect(binding.realization).toBe('codex-multi-agent-v1')
    expect(binding.tier).toBe(1)
    expect(binding.primitive).toBe('spawn_agent')
    expect(binding.announcement).toContain('spawn_agent')
    expect(binding.announcement).toContain('wait_agent')
    expect(binding.reason).toContain('probed this session')
  })

  it('prefers the v2 toolset when both are exposed', () => {
    const binding = resolveRealization({ tools: [...V1_TOOLS, ...V2_TOOLS] })
    expect(binding.realization).toBe('codex-multi-agent-v2')
    expect(binding.primitive).toBe('spawn')
  })

  it('resolves a renamed v2 namespace from the probe, not from a hard-coded name', () => {
    const binding = resolveRealization({
      tools: ['agents.spawn', 'agents.wait'],
      namespace: 'agents',
    })
    expect(binding.realization).toBe('codex-multi-agent-v2')
    expect(binding.primitive).toBe('agents.spawn')
  })

  it('applies the reported namespace only to the entry that HAS a renameable one', () => {
    // The session exposes the default-on, un-namespaced toolset AND reports the other entry's
    // configured namespace. Applying the override to every entry matched neither and degraded
    // a session that had tier 1 — the whole fan-out lost to a false negative.
    const binding = resolveRealization({
      tools: ['spawn_agent', 'wait_agent'],
      namespace: 'agents',
    })
    expect(binding.tier).toBe(REALIZATION_TIERS.IN_HARNESS)
    expect(binding.realization).toBe('codex-multi-agent-v1')
    expect(binding.primitive).toBe('spawn_agent')
  })

  it('does not bind a realization whose wait handle is missing', () => {
    const binding = resolveRealization({ tools: ['spawn_agent'] })
    expect(binding.tier).toBe(REALIZATION_TIERS.DEGRADED)
  })

  it('degrades to the external driver when the probe misses and one is available', () => {
    const binding = resolveRealization({ tools: ['read', 'shell'], externalDriverAvailable: true })
    expect(binding.tier).toBe(REALIZATION_TIERS.EXTERNAL_DRIVER)
    expect(binding.realization).toBe('external-driver')
    expect(binding.primitive).toBeNull()
    expect(binding.reason).toContain('never by the product name')
  })

  it('degrades to the one-card path when neither a primitive nor a driver is available', () => {
    const binding = resolveRealization({})
    expect(binding.tier).toBe(REALIZATION_TIERS.DEGRADED)
    expect(binding.realization).toBe('degraded-one-card')
    expect(binding.announcement).toContain('continue-token')
  })

  it('carries the observed harness ceiling into the binding, and only when it is an integer', () => {
    expect(resolveRealization({ tools: V1_TOOLS, harnessCeiling: 3 }).harnessCeiling).toBe(3)
    expect(resolveRealization({ tools: V1_TOOLS }).harnessCeiling).toBeNull()
  })

  it('binds a Claude Code session to its own tier-1 realization instead of degrading it', () => {
    const binding = resolveRealization({
      tools: CLAUDE_TOOLS,
      externalDriverAvailable: false,
    })
    expect(binding.tier).toBe(REALIZATION_TIERS.IN_HARNESS)
    expect(binding.realization).toBe('claude-code-workflow')
    expect(binding.dispatch).toBe('delegated-run')
    expect(binding.primitive).toBe('Workflow')
    expect(binding.announcement).toContain('Workflow')
    expect(binding.announcement).not.toContain('degrading')
  })

  it('reports the dispatch shape, so a caller routes on the binding and not on a product name', () => {
    expect(resolveRealization({ tools: V1_TOOLS }).dispatch).toBe('spawn-wait')
    expect(resolveRealization({ tools: ['shell'] }).dispatch).toBeNull()
  })

  it('still degrades a session that exposes neither harness’s primitive', () => {
    expect(resolveRealization({ tools: ['Task', 'Read', 'Bash', 'Edit'] }).tier).toBe(
      REALIZATION_TIERS.DEGRADED,
    )
  })

  it('always hands a spawn/wait caller a NUMBER to bound its wait with, and says where it came from', () => {
    // AC10 requires every wait to be bounded, and the skill is barred from naming vendor config
    // keys itself. Returning `{waitTimeoutMs: null, waitTimeoutKeys: <v2 triple>}` for the
    // DEFAULT v1 session met neither half: the keys named a default-off feature, so the read
    // returned nothing, and the only remaining moves — invent a number, or omit the argument —
    // are both forbidden. An unbounded wait on a dead subagent hangs the unattended run.
    const probed = resolveRealization({ tools: V1_TOOLS, harnessWaitTimeoutMs: 900_000 })
    expect(probed).toMatchObject({ waitTimeoutMs: 900_000, waitTimeoutSource: 'probe' })

    const bare = resolveRealization({ tools: V1_TOOLS })
    expect(bare.waitTimeoutMs).toBeGreaterThan(0)
    expect(bare.waitTimeoutSource).toBe('realization-default')
    expect(bare.waitTimeoutKeys).toBeNull()
    expect(bare.announcement).toContain('wait bound')
  })

  it('keeps the config keys where a generation actually has them, alongside the fallback', () => {
    const v2 = resolveRealization({ tools: V2_TOOLS })
    expect(v2.waitTimeoutKeys?.max).toBeTruthy()
    expect(v2.waitTimeoutMs).toBeGreaterThan(0)
    expect(v2.waitTimeoutSource).toBe('realization-default')
  })

  it('declares no wait bound for a delegated run or a degraded one — neither waits here', () => {
    for (const binding of [resolveRealization({ tools: CLAUDE_TOOLS }), resolveRealization({})]) {
      expect(binding.waitTimeoutMs).toBeNull()
      expect(binding.waitTimeoutKeys).toBeNull()
      expect(binding.waitTimeoutSource).toBeNull()
    }
  })

  it('falls back to the declared bound rather than passing on a non-integer or non-positive one', () => {
    for (const value of [0, -1, 1.5, Number.NaN]) {
      const binding = resolveRealization({ tools: V1_TOOLS, harnessWaitTimeoutMs: value })
      expect(binding.waitTimeoutSource).toBe('realization-default')
      expect(binding.waitTimeoutMs).toBeGreaterThan(0)
    }
  })
})

describe('cap arithmetic', () => {
  it('takes the minimum of the three ceilings and names the binding one', () => {
    expect(
      effectiveParallelism({ dependencyAllowed: 5, policyMax: 3, harnessCeiling: 8 }),
    ).toMatchObject({
      cap: 3,
      boundBy: 'policy',
    })
    expect(
      effectiveParallelism({ dependencyAllowed: 5, policyMax: 6, harnessCeiling: 2 }),
    ).toMatchObject({
      cap: 2,
      boundBy: 'harness',
    })
    expect(
      effectiveParallelism({ dependencyAllowed: 1, policyMax: 6, harnessCeiling: 8 }),
    ).toMatchObject({
      cap: 1,
      boundBy: 'dependency',
    })
  })

  it('never exceeds the policy ceiling, even with no harness ceiling observed', () => {
    const cap = effectiveParallelism({ dependencyAllowed: 99, policyMax: 2, harnessCeiling: null })
    expect(cap.cap).toBe(2)
    expect(cap.line).toContain('dependency=99')
    expect(cap.line).toContain('policy=2')
  })

  it('reports a cap of 0 as a no-dispatch iteration rather than as a smaller batch', () => {
    const cap = effectiveParallelism({ dependencyAllowed: 0, policyMax: 4 })
    expect(cap.cap).toBe(0)
    expect(cap.line).toContain('nothing is dispatched')
  })

  it('refuses a malformed ceiling instead of rounding it into a usable one', () => {
    expect(() => effectiveParallelism({ dependencyAllowed: -1, policyMax: 2 })).toThrow(
      /non-negative integer/,
    )
    expect(() => effectiveParallelism({ dependencyAllowed: 1.5, policyMax: 2 })).toThrow(
      /non-negative integer/,
    )
  })
})

describe('context packets', () => {
  it('carries exactly one card, its worktree, the role text and the return schema', () => {
    const packet = buildPacket({ phase: 'implement', card: CARD })
    expect(packet.card).toEqual(CARD)
    expect(packet.worktree).toBe('../pair-worktrees/441')
    expect(packet.skill).toBe('/pair-process-implement')
    expect(packet.schema).toBe(PHASE_CONTRACTS.implement.schema)
    expect(packet.instructions).toContain('NEVER merge')
  })

  it('works with no harness profile configured — the role text travels in the request', () => {
    for (const phase of PHASES) {
      const packet = buildPacket({ phase, card: CARD, findings: FIX_FINDINGS[phase] })
      expect(packet.instructions.length).toBeGreaterThan(0)
      expect(packet.role).toBe(PHASE_CONTRACTS[phase].role)
    }
  })

  it('rejects a packet assembled from an incomplete card', () => {
    expect(() => buildPacket({ phase: 'implement', card: { id: '441' } as Card })).toThrow(
      PacketRejected,
    )
  })

  it('rejects an unknown phase before anything is assembled', () => {
    expect(() => buildPacket({ phase: 'deploy' as 'implement', card: CARD })).toThrow(
      /unknown phase/,
    )
  })

  it('rejects an absolute attachment path', () => {
    expect(() =>
      buildPacket({ phase: 'implement', card: CARD, attachments: ['/etc/passwd'] }),
    ).toThrow(/absolute/)
  })

  it.each(['../secrets.md', '../../pair/.pair/working/checkpoints/441.md', '..'])(
    'rejects an attachment that escapes the project — %s',
    entry => {
      expect(() => buildPacket({ phase: 'implement', card: CARD, attachments: [entry] })).toThrow(
        /escapes the project/,
      )
    },
  )

  it('rejects an unknown packet key rather than silently dropping it', () => {
    expect(() =>
      buildPacket({ phase: 'implement', card: CARD, working_path: '.pair/scratch' } as never),
    ).toThrow(/working_path/)
  })

  it('rejects an unknown card key — a misspelled `prNumber` would open a second PR', () => {
    expect(() => buildPacket({ phase: 'pr', card: { ...CARD, pr_number: 700 } as never })).toThrow(
      /pr_number/,
    )
  })
})

describe('the fix packet carries the findings it must fix', () => {
  const finding: Finding = {
    location: 'a.ts:1',
    severity: 'Major',
    description: 'd',
    recommendation: 'r',
  }

  it('carries the review’s actionable findings into the fixer’s packet', () => {
    expect(buildPacket({ phase: 'fix', card: CARD, findings: [finding] }).findings).toEqual([
      finding,
    ])
  })

  it('refuses a `fix` packet with no findings instead of spawning a fixer with nothing to fix', () => {
    // The silent version of this burned the whole round cap: the fixer returned `fixed:true`
    // having fixed nothing determinable, the mandated re-review re-raised the same findings,
    // and the card reached `escalate` — a human gate hit by a mechanical omission.
    expect(() => buildPacket({ phase: 'fix', card: CARD })).toThrow(/findings/)
    expect(() => buildPacket({ phase: 'fix', card: CARD, findings: [] })).toThrow(/findings/)
  })

  it('never hands findings to the blind reviewer — it derives its own', () => {
    expect(() => buildPacket({ phase: 'review', card: CARD, findings: [finding] })).toThrow(
      /derives its own/,
    )
  })

  it('leaves the other authoring phases with an empty finding list', () => {
    for (const phase of ['implement', 'pr'] as const)
      expect(buildPacket({ phase, card: CARD }).findings).toEqual([])
  })

  it('rejects a finding that is not an object', () => {
    expect(() => buildPacket({ phase: 'fix', card: CARD, findings: ['fix it'] as never })).toThrow(
      PacketRejected,
    )
  })
})

describe('reviewer blindness is a pre-spawn rejection', () => {
  it('declares the working area as the denied prefix', () => {
    expect(BLIND_DENY_PREFIXES).toContain('.pair/working/')
  })

  it('marks the review phase blind and the authoring phases not', () => {
    expect(PHASE_CONTRACTS.review.blind).toBe(true)
    expect(PHASE_CONTRACTS.implement.blind).toBe(false)
    expect(PHASE_CONTRACTS.pr.blind).toBe(false)
    expect(PHASE_CONTRACTS.fix.blind).toBe(false)
  })

  it.each([
    '.pair/working/checkpoints/441.md',
    '.pair/working/reports/review.md',
    './.pair/working/checkpoints/441.md',
    '.pair/working/../working/checkpoints/441.md',
  ])('rejects a review packet carrying %s, naming the offending entry', entry => {
    expect(() => buildPacket({ phase: 'review', card: CARD, attachments: [entry] })).toThrow(
      /\.pair\/working/,
    )
    expect(() => buildPacket({ phase: 'review', card: CARD, attachments: [entry] })).toThrow(
      PacketRejected,
    )
  })

  it('accepts a review packet carrying only the story and the diff', () => {
    const packet = buildPacket({
      phase: 'review',
      card: CARD,
      attachments: ['.pair/adoption/tech/architecture.md'],
    })
    expect(packet.attachments).toEqual(['.pair/adoption/tech/architecture.md'])
  })

  it('lets the authoring chain carry its own checkpoint — blindness is the reviewer’s alone', () => {
    const packet = buildPacket({
      phase: 'fix',
      card: CARD,
      findings: [{ location: 'a.ts:1', severity: 'Major' }],
      attachments: ['.pair/working/checkpoints/441.md'],
    })
    expect(packet.attachments).toHaveLength(1)
  })

  it('is assertable on its own, independently of packet assembly', () => {
    expect(() => assertBlind(['.pair/working/x.md'], 'review')).toThrow(PacketRejected)
    expect(() => assertBlind(['src/index.ts'], 'review')).not.toThrow()
  })

  it('guards the project’s OWN working area when `working_path` overrides the default', () => {
    // `.pair/scratch` is working-area.md's own documented override example. Against a
    // hard-coded `.pair/working/` the packet below was accepted and the reviewer got the
    // author's checkpoint — the rejection silently no-opped for every project that overrides.
    expect(() =>
      buildPacket({
        phase: 'review',
        card: CARD,
        attachments: ['.pair/scratch/checkpoints/441.md'],
        workingPath: '.pair/scratch',
      }),
    ).toThrow(/\.pair\/scratch/)
  })

  it('keeps the default area denied under an override — a moved area leaves the old one behind', () => {
    expect(blindDenyPrefixes('.pair/scratch')).toEqual(['.pair/scratch/', '.pair/working/'])
    expect(() =>
      assertBlind(['.pair/working/checkpoints/441.md'], 'review', '.pair/scratch'),
    ).toThrow(PacketRejected)
  })

  it('refuses a working path it cannot resolve rather than falling back to the default', () => {
    for (const bad of ['/abs/working', '../outside', '.'])
      expect(() => blindDenyPrefixes(bad)).toThrow(/project-relative/)
    expect(blindDenyPrefixes(undefined)).toBe(BLIND_DENY_PREFIXES)
    expect(blindDenyPrefixes('  ')).toBe(BLIND_DENY_PREFIXES)
  })

  it('rejects a parent-relative spelling of a denied path instead of prefix-matching past it', () => {
    // Worktrees live at `../pair-worktrees/<id>`, so from a dispatched subagent's cwd the main
    // checkout's working area IS `../../<repo>/.pair/working/...`. Prefix-matching the
    // normalized string let that spelling through while the sibling `./.pair/working/../…` in
    // the same call was rejected — the guard looked alive while the traversal passed.
    expect(() =>
      buildPacket({
        phase: 'review',
        card: CARD,
        attachments: ['../../pair/.pair/working/checkpoints/441.md'],
      }),
    ).toThrow(PacketRejected)
  })
})

describe('the result contract, fail-closed', () => {
  it('accepts a schema-valid return and lets the card advance', () => {
    const collected = collectOutcome('implement', {
      status: 'completed',
      value: { gatesPassed: true, branch: 'feature/US-441' },
    })
    expect(collected).toMatchObject({ outcome: 'completed', advances: true })
    expect(collected.value).toMatchObject({ gatesPassed: true })
  })

  it('fails a return missing a required contract field', () => {
    const collected = collectOutcome('pr', { status: 'completed', value: { url: 'https://x' } })
    expect(collected.outcome).toBe('failed-validation')
    expect(collected.advances).toBe(false)
    expect(collected.reason).toContain('prNumber')
  })

  it('fails a return whose field carries the wrong type', () => {
    const collected = collectOutcome('pr', { status: 'completed', value: { prNumber: '42' } })
    expect(collected.outcome).toBe('failed-validation')
    expect(collected.reason).toContain('must be number')
  })

  it('fails an absent return rather than reading it as success', () => {
    expect(collectOutcome('implement', { status: 'completed' }).outcome).toBe('failed-validation')
    expect(collectOutcome('implement', null).outcome).toBe('not-started')
    expect(collectOutcome('implement', undefined).advances).toBe(false)
  })

  it('validates nested arrays — a malformed finding is a contract violation', () => {
    const collected = collectOutcome('review', {
      status: 'completed',
      value: { verdict: 'CHANGES-REQUESTED', findings: [{ severity: 3 }] },
    })
    expect(collected.outcome).toBe('failed-validation')
    expect(collected.reason).toContain('findings[0].severity')
  })

  it('honours a schema override, so a contract derived from an adopter template still binds', () => {
    const stricter = {
      type: 'object',
      properties: { verdict: { type: 'string' }, needsHumanDecision: { type: 'boolean' } },
      required: ['verdict', 'needsHumanDecision'],
    }
    expect(
      collectOutcome('review', { status: 'completed', value: { verdict: 'APPROVED' } }, stricter)
        .outcome,
    ).toBe('failed-validation')
    expect(
      collectOutcome(
        'review',
        { status: 'completed', value: { verdict: 'APPROVED', needsHumanDecision: false } },
        stricter,
      ).outcome,
    ).toBe('completed')
  })

  it('lets an override TIGHTEN the phase contract, never replace it', () => {
    // The party composing the request is the model itself. A replacing override turned the
    // validation into whatever the model typed: `{"schema":{"type":"object"}}` accepted an
    // EMPTY review return as completed/advances — and under `## Auto-Advance` that merges.
    const collected = collectOutcome(
      'review',
      { status: 'completed', value: {} },
      { type: 'object' },
    )
    expect(collected.outcome).toBe('failed-validation')
    expect(collected.advances).toBe(false)
    expect(collected.reason).toContain('verdict')
  })

  it('enforces an enum the generated contract locks, so a free-text verdict is rejected', () => {
    const enumLocked = {
      type: 'object',
      properties: { verdict: { type: 'string', enum: ['APPROVED', 'CHANGES-REQUESTED'] } },
      required: ['verdict'],
    }
    expect(
      collectOutcome(
        'review',
        { status: 'completed', value: { verdict: 'looks good to me' } },
        enumLocked,
      ).outcome,
    ).toBe('failed-validation')
    expect(
      collectOutcome('review', { status: 'completed', value: { verdict: 'APPROVED' } }, enumLocked)
        .outcome,
    ).toBe('completed')
  })

  it('names an unknown phase as a declared terminal outcome, never as a raw TypeError', () => {
    const collected = collectOutcome('deploy' as 'review', {
      status: 'completed',
      value: { verdict: 'APPROVED' },
    })
    expect(collected.outcome).toBe('failed-validation')
    expect(collected.reason).toContain('unknown phase')
    const { code, out } = main(
      ['collect'],
      JSON.stringify({ phase: 'deploy', result: { status: 'completed', value: {} } }),
    )
    expect(code).toBe(0)
    expect(JSON.parse(out)).toMatchObject({ outcome: 'failed-validation', advances: false })
  })

  it('reports every violation, not just the first', () => {
    expect(schemaViolations({}, PHASE_CONTRACTS.implement.schema)).toEqual([
      'value.gatesPassed is required and absent',
    ])
    expect(schemaViolations('nope', PHASE_CONTRACTS.pr.schema)).toEqual(['value must be an object'])
  })
})

describe('terminal phase outcomes and bounded waits', () => {
  it('names every way a dispatch can end, keeping validation failure distinct', () => {
    expect([...TERMINAL_OUTCOMES]).toEqual([
      'completed',
      'failed-validation',
      'timed-out',
      'cancelled',
      'died',
      'not-started',
    ])
  })

  it.each([
    ['timeout', 'timed-out'],
    ['timed-out', 'timed-out'],
    ['cancelled', 'cancelled'],
    ['interrupted', 'cancelled'],
    ['failed', 'died'],
    ['error', 'died'],
    ['spawn-failed', 'not-started'],
  ])('maps a %s wait to the %s outcome', (status, expected) => {
    const collected = collectOutcome('implement', { status })
    expect(collected.outcome).toBe(expected)
    expect(collected.advances).toBe(false)
  })

  it('fails closed on an outcome it cannot name', () => {
    const collected = collectOutcome('implement', {
      status: 'quantum-superposition',
      value: { gatesPassed: true },
    })
    expect(collected.outcome).toBe('failed-validation')
    expect(collected.advances).toBe(false)
  })

  it('collects the surviving siblings of a partial batch instead of discarding them', () => {
    const dispatches = [
      { id: 'a', result: { status: 'completed', value: { gatesPassed: true } } },
      { id: 'b', result: { status: 'timeout' } },
      { id: 'c', result: { status: 'completed', value: { gatesPassed: false } } },
    ]
    const collected = dispatches.map(d => ({ id: d.id, ...collectOutcome('implement', d.result) }))
    expect(collected.map(c => c.outcome)).toEqual(['completed', 'timed-out', 'completed'])
    expect(collected.filter(c => c.advances)).toHaveLength(2)
  })
})

describe('review ↔ fix convergence', () => {
  const finding = (severity: string, extra: Partial<Finding> = {}): Finding => ({
    location: 'src/x.ts:1',
    severity,
    description: 'd',
    ...extra,
  })
  const RANKS = { Critical: 4, Major: 3, Minor: 2, Questions: 1 }

  it('never owes a fix on an approved review with nothing to fix', () => {
    const decision = converge({ review: { verdict: 'APPROVED', findings: [] } })
    expect(decision.action).toBe('converged')
    expect(decision.actionable).toEqual([])
  })

  it('owes ONE fix round per review, and a re-review after it — never a single terminal fix', () => {
    // Five actionable findings used to get exactly one fix round whose result was never
    // re-reviewed: all four phases recorded complete, the card treated as converged, and under
    // `## Auto-Advance` that PR merged with nobody having looked at the fixes.
    const findings = ['Major', 'Major', 'Minor', 'Minor', 'Minor'].map(s => finding(s))
    let round = 0
    const rounds: string[] = []
    for (let i = 0; i < 5; i++) {
      const decision = converge({ review: { verdict: 'CHANGES-REQUESTED', findings }, round })
      rounds.push(decision.action)
      if (decision.action !== 'fix') break
      round = decision.round
    }
    expect(rounds).toEqual(['fix', 'fix', 'fix', 'escalate'])
    expect(round).toBe(MAX_FIX_ROUNDS_DEFAULT)
  })

  it('escalates at the cap, naming what is still open', () => {
    const decision = converge({
      review: { verdict: 'CHANGES-REQUESTED', findings: [finding('Major')] },
      round: MAX_FIX_ROUNDS_DEFAULT,
    })
    expect(decision.action).toBe('escalate')
    expect(decision.reason).toContain('still open')
  })

  it('honours a caller-configured cap instead of the default', () => {
    expect(
      converge({
        review: { verdict: 'CHANGES-REQUESTED', findings: [finding('Major')] },
        round: 1,
        maxFixRounds: 1,
      }).action,
    ).toBe('escalate')
  })

  it('spends one fix round before escalating a `needsHumanDecision`, then escalates', () => {
    const review = {
      verdict: 'CHANGES-REQUESTED',
      needsHumanDecision: true,
      findings: [finding('Major')],
    }
    const first = converge({ review })
    expect(first).toMatchObject({ action: 'fix', humanDecisionPending: true, round: 1 })
    const second = converge({ review, round: first.round, humanDecisionPending: true })
    expect(second.action).toBe('escalate')
    expect(second.reason).toContain('genuine disagreement')
  })

  it('escalates a review with no verdict instead of reading zero findings as approval', () => {
    for (const review of [null, undefined, {}, { findings: [] }, { verdict: '  ' }])
      expect(converge({ review }).action).toBe('escalate')
    expect(converge({ review: {} }).reason).toContain('no verdict')
  })

  it('never counts a by-design finding as owed work', () => {
    const decision = converge({
      review: {
        verdict: 'APPROVED',
        findings: [finding('Major', { nonActionable: true }), finding('Minor')],
      },
      severityFloor: 'Major',
      severityRanks: RANKS,
    })
    expect(decision.action).toBe('converged')
    expect(decision.nonActionable).toHaveLength(1)
    expect(decision.belowFloor).toHaveLength(1)
  })

  it('blocks on everything actionable when no floor is declared', () => {
    expect(converge({ review: { verdict: 'X', findings: [finding('Minor')] } }).action).toBe('fix')
  })

  it('blocks on a finding whose severity the ranks do not name — the safe direction', () => {
    const decision = converge({
      review: { verdict: 'X', findings: [finding('Blocker')] },
      severityFloor: 'Major',
      severityRanks: RANKS,
    })
    expect(decision.action).toBe('fix')
    expect(decision.actionable).toHaveLength(1)
    expect(decision.belowFloor).toEqual([])
  })

  it('refuses a floor it cannot rank rather than guessing an order', () => {
    expect(() => converge({ review: { verdict: 'X' }, severityFloor: 'Major' })).toThrow(
      /never inferred/i,
    )
    expect(() =>
      converge({ review: { verdict: 'X' }, severityFloor: 'Blocker', severityRanks: RANKS }),
    ).toThrow(/not ranked/)
  })

  it('answers the converge command from the CLI', () => {
    const { code, out } = main(
      ['converge'],
      JSON.stringify({ review: { verdict: 'APPROVED', findings: [] } }),
    )
    expect(code).toBe(0)
    expect(JSON.parse(out)).toMatchObject({ action: 'converged' })
  })
})

describe('audit persistence', () => {
  const record: AuditRecord = { iteration: 0, id: '441', phase: 'implement', outcome: 'completed' }

  it('appends one JSON line per record and reads it back', () => {
    const fs = new InMemoryAuditFs()
    const result = appendAudit('.pair/working/automation/loop-audit.md', [record], fs)
    expect(result).toEqual({ written: 1, path: '.pair/working/automation/loop-audit.md' })
    expect(fs.files.get('.pair/working/automation/loop-audit.md')).toBe(auditLine(record))
    expect(fs.dirs).toContain('.pair/working/automation')
  })

  it('appends without truncating what a previous iteration wrote', () => {
    const fs = new InMemoryAuditFs()
    appendAudit('a.md', [record], fs)
    appendAudit('a.md', [{ ...record, iteration: 1 }], fs)
    expect(fs.files.get('a.md')?.trim().split('\n')).toHaveLength(2)
  })

  it.each(['mkdir', 'append', 'read'] as const)(
    'fails loudly when the audit cannot be %sed',
    failOn => {
      const fs = new InMemoryAuditFs()
      fs.failOn = failOn
      expect(() => appendAudit('a.md', [record], fs)).toThrow(/not an acceptable degraded mode/)
    },
  )

  it('fails loudly when the append silently does not land', () => {
    const fs = new InMemoryAuditFs()
    fs.swallowAppends = true
    expect(() => appendAudit('a.md', [record], fs)).toThrow(/could not be written and read back/)
  })

  it('takes a run-level record with no card id — the realization announcement owns no card', () => {
    const fs = new InMemoryAuditFs()
    const announcement: AuditRecord = {
      kind: 'run',
      run: 'r1',
      realization: 'claude-code-workflow',
      announcement: 'fan-out realization: claude-code-workflow (tier 1, claude-code)',
    }
    expect(appendAudit('a.md', [announcement], fs).written).toBe(1)
    expect(fs.files.get('a.md')).toBe(auditLine(announcement))
  })

  it('refuses a record that names neither a card nor a run — it would be unreadable on resume', () => {
    // Both spellings of the omission were losses: with no `id` the record was silently dropped
    // by `parseAudit`, so the announcement was unreadable on resume; with an invented one
    // (`"run-2026-08-28"`) it materialized as a phantom card owed a full pipeline.
    const fs = new InMemoryAuditFs()
    expect(() => appendAudit('a.md', [{ iteration: 0, realization: 'x' }], fs)).toThrow(
      /names no card `id` and is not marked/,
    )
  })

  it('refuses a completed `review` record that does not say what `converge` decided', () => {
    // The sequence that lost work: `converge` returns {action:'fix', actionable:[3 findings]},
    // the run audits the review outcome but omits `action`, and the run is killed before the fix
    // dispatch. On re-invocation the reconstruction read the record as a finished review, so the
    // plan listed nothing, the card fell through to auto-advance, and a PR carrying three
    // unresolved actionable findings merged at a tier `## Auto-Advance` permits. The record even
    // carried `round:1` — evidence a fix was owed. The stamp was prose in SKILL.md; it is now a
    // write-time refusal, because the party writing it is the non-deterministic one.
    const fs = new InMemoryAuditFs()
    const reviewed = {
      kind: 'card',
      id: '441',
      run: 'r1',
      phase: 'review',
      outcome: 'completed',
      round: 1,
    } as const
    expect(() => appendAudit('a.md', [reviewed], fs)).toThrow(/`action`/)
    expect(() =>
      appendAudit('a.md', [{ ...reviewed, action: 'fixed' as unknown as 'fix' }], fs),
    ).toThrow(/`action`/)
    for (const action of ['converged', 'fix', 'escalate'] as const)
      expect(appendAudit('a.md', [{ ...reviewed, action }], fs).written).toBe(1)
  })

  it('leaves every other record shape untouched — only a COMPLETED review owes an action', () => {
    const fs = new InMemoryAuditFs()
    expect(
      appendAudit(
        'a.md',
        [
          { id: '441', run: 'r1', phase: 'review', outcome: 'timed-out' },
          { id: '441', run: 'r1', phase: 'implement', outcome: 'completed' },
        ],
        fs,
      ).written,
    ).toBe(2)
  })
})

describe('resume', () => {
  const audit = [
    { iteration: 0, id: '441', phase: 'implement', outcome: 'completed' },
    { iteration: 0, id: '441', phase: 'pr', outcome: 'completed', prNumber: 700 },
    { iteration: 0, id: '442', phase: 'implement', outcome: 'timed-out', reason: 'wait exceeded' },
    { iteration: 0, id: '443', excluded: true, reason: 'mutex conflict on pair-loop' },
  ]
    .map(r => JSON.stringify(r))
    .join('\n')

  it('re-dispatches only the phases not recorded complete', () => {
    const plan = resumePlan('441', reconstructState(audit)['441'])
    expect(plan.skipped).toEqual(['implement', 'pr'])
    expect(plan.redispatch).toEqual(['review'])
  })

  it('never owes a phantom `fix` — a fix is owed by findings, not by a plan', () => {
    for (const id of ['441', '999'])
      expect(resumePlan(id, reconstructState(audit)[id]).redispatch).not.toContain('fix')
  })

  it('re-enters an open review cycle at `review`, so the fixes are re-reviewed', () => {
    const open = [
      { run: 'r1', iteration: 0, id: '441', phase: 'implement', outcome: 'completed' },
      { run: 'r1', iteration: 0, id: '441', phase: 'pr', outcome: 'completed', prNumber: 700 },
      {
        run: 'r1',
        iteration: 0,
        id: '441',
        phase: 'review',
        outcome: 'completed',
        action: 'fix',
        round: 1,
      },
      { run: 'r1', iteration: 0, id: '441', phase: 'fix', outcome: 'completed', round: 1 },
    ]
      .map(r => JSON.stringify(r))
      .join('\n')
    const plan = resumePlan('441', reconstructState(open)['441'])
    expect(plan.redispatch).toEqual(['review'])
    expect(plan.round).toBe(1)
    expect(plan.note).toContain('re-enters at `review`')
  })

  it('reads a completed review carrying NO action as an open cycle, never as converged', () => {
    // The read half of the same loss, and the one that survives a hand-edited or older audit
    // line the write check never saw. Before: redispatch [], skipped [implement, pr, review],
    // halted false — the card advances to the merge gate on a review whose fixes were never
    // applied. `converged` is now the only spelling that closes the cycle.
    const actionless = [
      { run: 'r1', id: '441', phase: 'implement', outcome: 'completed' },
      { run: 'r1', id: '441', phase: 'pr', outcome: 'completed', prNumber: 9 },
      { run: 'r1', id: '441', phase: 'review', outcome: 'completed', round: 1 },
    ]
      .map(r => JSON.stringify(r))
      .join('\n')
    const plan = resumePlan('441', reconstructState(actionless, { run: 'r1' })['441'])
    expect(plan.redispatch).toEqual(['review'])
    expect(plan.skipped).not.toContain('review')
    expect(plan.note).toContain('re-enters at `review`')
  })

  it('closes the cycle on `converged`, and only on it', () => {
    const converged = [
      { run: 'r1', id: '441', phase: 'implement', outcome: 'completed' },
      { run: 'r1', id: '441', phase: 'pr', outcome: 'completed', prNumber: 9 },
      { run: 'r1', id: '441', phase: 'review', outcome: 'completed', action: 'converged' },
    ]
      .map(r => JSON.stringify(r))
      .join('\n')
    const plan = resumePlan('441', reconstructState(converged, { run: 'r1' })['441'])
    expect(plan.redispatch).toEqual([])
    expect(plan.skipped).toEqual(['implement', 'pr', 'review'])
  })

  it('halts a card whose review cycle escalated to a human', () => {
    const escalated = JSON.stringify({
      run: 'r1',
      iteration: 0,
      id: '441',
      phase: 'review',
      outcome: 'completed',
      action: 'escalate',
      reason: 'non-convergence',
    })
    expect(resumePlan('441', reconstructState(escalated)['441']).halted).toBe(true)
  })

  it('retires a halt once a later record completes the SAME phase', () => {
    // implement timed out at iteration 1 and completed at iteration 2. Reading the audit whole
    // with a halt flag that is never cleared refused the card anyway.
    const retried = [
      { iteration: 1, id: '441', phase: 'implement', outcome: 'timed-out' },
      { iteration: 2, id: '441', phase: 'implement', outcome: 'completed' },
    ]
      .map(r => JSON.stringify(r))
      .join('\n')
    const plan = resumePlan('441', reconstructState(retried)['441'])
    expect(plan.halted).toBe(false)
    expect(plan.skipped).toEqual(['implement'])
    expect(plan.redispatch).toEqual(['pr', 'review'])
  })

  it('scopes a halt to the run that recorded it — Monday’s timeout is not Tuesday’s refusal', () => {
    // The audit is ONE persistent append-only project file. Unscoped, a review that timed out
    // once refused the card in EVERY later invocation, forever, and only hand-editing an
    // append-only file unblocked it — stricter than the in-harness lane, whose exclusion is
    // scoped to "every later iteration in the same run".
    const history = [
      { run: 'monday', iteration: 0, id: '441', phase: 'review', outcome: 'timed-out' },
      { run: 'monday', iteration: 0, id: '442', phase: 'review', outcome: 'timed-out' },
    ]
      .map(r => JSON.stringify(r))
      .join('\n')
    expect(resumePlan('441', reconstructState(history, { run: 'tuesday' })['441']).halted).toBe(
      false,
    )
    // Within its own run the exclusion still holds.
    expect(resumePlan('441', reconstructState(history, { run: 'monday' })['441']).halted).toBe(true)
    // With no run named, the audit's own last run is the boundary.
    expect(resumePlan('442', reconstructState(history)['442']).halted).toBe(true)
  })

  it('scopes a halt by iteration when the caller counts iterations instead of runs', () => {
    const history = [
      { iteration: 1, id: '441', phase: 'review', outcome: 'timed-out' },
      { iteration: 4, id: '441', phase: 'implement', outcome: 'completed' },
    ]
      .map(r => JSON.stringify(r))
      .join('\n')
    expect(resumePlan('441', reconstructState(history, { sinceIteration: 4 })['441']).halted).toBe(
      false,
    )
    expect(resumePlan('441', reconstructState(history, { sinceIteration: 0 })['441']).halted).toBe(
      true,
    )
  })

  it('never re-opens a PR for a story that already carries one', () => {
    const plan = resumePlan('441', reconstructState(audit)['441'])
    expect(plan.redispatch).not.toContain('pr')
    expect(plan.prNumber).toBe(700)
    expect(plan.note).toContain('never a second PR')
  })

  it('does not re-drive a card a previous iteration halted', () => {
    expect(resumePlan('442', reconstructState(audit)['442']).redispatch).toEqual([])
    expect(resumePlan('443', reconstructState(audit)['443']).halted).toBe(true)
  })

  it('runs the full pipeline for a card the audit never mentions', () => {
    const plan = resumePlan('999', reconstructState(audit)['999'])
    expect(plan.redispatch).toEqual([...OWED_PHASES])
    expect(plan.note).toContain('full pipeline')
  })

  it('skips a truncated last line rather than refusing to resume', () => {
    const state = reconstructState(`${audit}\n{"iteration":1,"id":"44`)
    expect(Object.keys(state).sort()).toEqual(['441', '442', '443'])
  })

  it('ignores a line with no card id', () => {
    expect(reconstructState('{"iteration":0,"note":"nothing eligible"}')).toEqual({})
  })

  it('never materializes a run-level record as a card owed a full pipeline', () => {
    const withRun = [
      '{"kind":"run","run":"r1","realization":"codex-multi-agent-v1","announcement":"bound"}',
      '{"run":"r1","iteration":0,"id":"441","phase":"implement","outcome":"completed"}',
    ].join('\n')
    expect(Object.keys(reconstructState(withRun))).toEqual(['441'])
    const plans = JSON.parse(main(['resume'], JSON.stringify({ audit: withRun })).out) as {
      id: string
    }[]
    expect(plans.map(p => p.id)).toEqual(['441'])
  })

  it('reads the current run off a run-level record, so an older run’s halt is history', () => {
    const audit = [
      '{"run":"r1","iteration":0,"id":"441","phase":"implement","outcome":"timed-out"}',
      '{"kind":"run","run":"r2","realization":"codex-multi-agent-v1","announcement":"bound"}',
    ].join('\n')
    expect(reconstructState(audit)['441']?.halted).toBe(false)
  })
})

describe('the command surface', () => {
  it('answers bind from a probe on stdin', () => {
    const { code, out } = main(['bind'], JSON.stringify({ probe: { tools: V1_TOOLS } }))
    expect(code).toBe(0)
    expect(JSON.parse(out).realization).toBe('codex-multi-agent-v1')
  })

  it('answers cap, packet, collect and resume', () => {
    expect(
      JSON.parse(
        main(['cap'], JSON.stringify({ ceilings: { dependencyAllowed: 4, policyMax: 2 } })).out,
      ).cap,
    ).toBe(2)
    expect(
      JSON.parse(main(['packet'], JSON.stringify({ packet: { phase: 'review', card: CARD } })).out)
        .blind,
    ).toBe(true)
    expect(
      JSON.parse(
        main(
          ['collect'],
          JSON.stringify({ phase: 'pr', result: { status: 'completed', value: { prNumber: 7 } } }),
        ).out,
      ).outcome,
    ).toBe('completed')
    expect(
      JSON.parse(
        main(
          ['resume'],
          JSON.stringify({
            audit: '{"iteration":0,"id":"441","phase":"pr","outcome":"completed"}',
          }),
        ).out,
      ),
    ).toHaveLength(1)
  })

  it('exits non-zero with a named error on a rejected packet', () => {
    const { code, out } = main(
      ['packet'],
      JSON.stringify({
        packet: { phase: 'review', card: CARD, attachments: ['.pair/working/x.md'] },
      }),
    )
    expect(code).toBe(1)
    expect(JSON.parse(out).error).toContain('.pair/working/x.md')
  })

  it('reads `workingPath` and `worktreeRoot` at the TOP level too, where every sibling field lives', () => {
    // `phase`, `result`, `schema`, `ceilings`, `audit`, `run`, `id`, `review` and `round` are all
    // top-level in this same request shape, and the party composing the JSON is the model. With
    // `workingPath` readable only inside `packet`, a top-level spelling exited 0 and produced a
    // packet with `blind:true` carrying `.pair/scratch/checkpoints/441.md` — the author's
    // checkpoint handed to the independent reviewer, silently, in exactly the project that set
    // `working_path`.
    const misplaced = main(
      ['packet'],
      JSON.stringify({
        workingPath: '.pair/scratch',
        packet: {
          phase: 'review',
          card: CARD,
          attachments: ['.pair/scratch/checkpoints/441.md'],
        },
      }),
    )
    expect(misplaced.code).toBe(1)
    expect(JSON.parse(misplaced.out).error).toContain('.pair/scratch/')
    const root = main(
      ['packet'],
      JSON.stringify({ worktreeRoot: '/tmp/wt', packet: { phase: 'implement', card: CARD } }),
    )
    expect(JSON.parse(root.out).worktree).toBe('/tmp/wt/441')
  })

  it('lets the nested value win when both levels carry one', () => {
    const { out } = main(
      ['packet'],
      JSON.stringify({
        worktreeRoot: '/tmp/outer',
        packet: { phase: 'implement', card: CARD, worktreeRoot: '/tmp/inner' },
      }),
    )
    expect(JSON.parse(out).worktree).toBe('/tmp/inner/441')
  })

  it('carries top-level `findings` into a fix packet, so `converge`’s output pipes straight in', () => {
    const { code, out } = main(
      ['packet'],
      JSON.stringify({
        findings: [{ location: 'a.ts:1', severity: 'Major' }],
        packet: { phase: 'fix', card: CARD },
      }),
    )
    expect(code).toBe(0)
    expect(JSON.parse(out).findings).toHaveLength(1)
  })

  it('rejects an unknown top-level key rather than falling back to the default it overrides', () => {
    const { code, out } = main(
      ['packet'],
      JSON.stringify({ working_path: '.pair/scratch', packet: { phase: 'review', card: CARD } }),
    )
    expect(code).toBe(1)
    expect(JSON.parse(out).error).toContain('working_path')
  })

  it('rejects an unknown key inside `ceilings` — the surplus dispatch is charged to real cards', () => {
    // `{"dependencyAllowed":5,"policyMax":5,"harnessCieling":2}` exited 0 with
    // {"cap":5,"boundBy":"dependency"}: the harness's ceiling of 2 vanished, 1b.2 dispatched 5
    // concurrent subagents into a harness that allows 2, the surplus came back
    // `not-started`/`died` and were charged to their cards as failed phases — and the AC7 line
    // the skill prints named the wrong binding limit.
    const { code, out } = main(
      ['cap'],
      JSON.stringify({ ceilings: { dependencyAllowed: 5, policyMax: 5, harnessCieling: 2 } }),
    )
    expect(code).toBe(1)
    expect(JSON.parse(out).error).toContain('harnessCieling')
    expect(
      JSON.parse(
        main(
          ['cap'],
          JSON.stringify({ ceilings: { dependencyAllowed: 5, policyMax: 5, harnessCeiling: 2 } }),
        ).out,
      ),
    ).toMatchObject({ cap: 2, boundBy: 'harness' })
  })

  it('rejects an unknown key inside `probe` — a misspelling silently demotes the run', () => {
    // A misspelled `harnessCeling` bound tier 1 with `harnessCeiling: null`; a misspelled
    // `externalDriverAvailable` demoted an available tier-2 run to tier-3 degraded.
    for (const probe of [
      { tools: V1_TOOLS, harnessCeling: 2 },
      { tools: ['shell'], externalDriverAvailble: true },
    ]) {
      const { code, out } = main(['bind'], JSON.stringify({ probe }))
      expect(code).toBe(1)
      expect(JSON.parse(out).error).toContain('unknown key')
    }
  })

  it('rejects an unknown command and non-JSON stdin', () => {
    expect(main(['merge'], '{}').code).toBe(1)
    expect(JSON.parse(main(['merge'], '{}').out).error).toContain('unknown command')
    expect(main(['bind'], 'not json').code).toBe(1)
  })

  it('declares exactly the seven commands the skill invokes', () => {
    expect([...COMMANDS]).toEqual([
      'bind',
      'cap',
      'packet',
      'collect',
      'converge',
      'audit',
      'resume',
    ])
  })
})
