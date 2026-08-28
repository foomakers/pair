import { describe, expect, it } from 'vitest'
import {
  appendAudit,
  assertBlind,
  auditLine,
  BLIND_DENY_PREFIXES,
  buildPacket,
  collectOutcome,
  COMMANDS,
  effectiveParallelism,
  HARNESS_SURFACE_MAP,
  main,
  PacketRejected,
  PHASE_CONTRACTS,
  PHASES,
  REALIZATION_TIERS,
  reconstructState,
  resolveRealization,
  resumePlan,
  schemaViolations,
  TERMINAL_OUTCOMES,
  type AuditFs,
  type AuditRecord,
  type Card,
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
  it('holds both known Codex toolsets, in preference order, each with a verification note', () => {
    expect(HARNESS_SURFACE_MAP.map(r => r.id)).toEqual([
      'codex-multi-agent-v2',
      'codex-multi-agent-v1',
    ])
    for (const realization of HARNESS_SURFACE_MAP) {
      expect(realization.tier).toBe(REALIZATION_TIERS.IN_HARNESS)
      expect(realization.handles.spawn).toBeTruthy()
      expect(realization.handles.wait).toBeTruthy()
      expect(realization.gating.featureKey).toMatch(/^features\./)
      expect(realization.bounding.concurrencyKey).toBeTruthy()
      expect(realization.verifiedAgainst).toMatch(/codex-cli/)
    }
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
      const packet = buildPacket({ phase, card: CARD })
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
      attachments: ['.pair/working/checkpoints/441.md'],
    })
    expect(packet.attachments).toHaveLength(1)
  })

  it('is assertable on its own, independently of packet assembly', () => {
    expect(() => assertBlind(['.pair/working/x.md'], 'review')).toThrow(PacketRejected)
    expect(() => assertBlind(['src/index.ts'], 'review')).not.toThrow()
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
    expect(plan.redispatch).toEqual(['review', 'fix'])
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
    expect(plan.redispatch).toEqual([...PHASES])
    expect(plan.note).toContain('full pipeline')
  })

  it('skips a truncated last line rather than refusing to resume', () => {
    const state = reconstructState(`${audit}\n{"iteration":1,"id":"44`)
    expect(Object.keys(state).sort()).toEqual(['441', '442', '443'])
  })

  it('ignores a line with no card id', () => {
    expect(reconstructState('{"iteration":0,"note":"nothing eligible"}')).toEqual({})
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

  it('rejects an unknown command and non-JSON stdin', () => {
    expect(main(['merge'], '{}').code).toBe(1)
    expect(JSON.parse(main(['merge'], '{}').out).error).toContain('unknown command')
    expect(main(['bind'], 'not json').code).toBe(1)
  })

  it('declares exactly the six commands the skill invokes', () => {
    expect([...COMMANDS]).toEqual(['bind', 'cap', 'packet', 'collect', 'audit', 'resume'])
  })
})
