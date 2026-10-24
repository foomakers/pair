import { describe, it, expect } from 'vitest'
import { plainConsole, plainNote } from './plain-console'

describe('plain console: technical lines hidden, finished steps as short notes', () => {
  it.each([
    [
      '  Stage verify:r0 — process success, handoff advanced (terminal event: success) — final: status=reviewed verdict=CHANGES-REQUESTED next=prepare',
      '  review: changes requested',
    ],
    [
      '  Stage verify:r3 — process success, handoff advanced (terminal event: success) — final: status=reviewed verdict=APPROVED next=done',
      '  review: approved',
    ],
    [
      '  Stage validate:r1-g1 — process success, handoff advanced (terminal event: success) — final: status=rejected reason=inventory-incomplete next=prepare',
      '  tests: not accepted, rewriting',
    ],
    [
      '  Stage validate:r1-g1 — process success, handoff advanced (terminal event: success) — final: status=verified next=green',
      '  tests: accepted',
    ],
    [
      '  Stage green:r1-g1 — process success, handoff advanced (terminal event: success) — final: status=fixed next=verify',
      '  fix: done',
    ],
    [
      '  Stage implement:a0 — process success, handoff advanced (terminal event: success) — final: status=ok next=verify',
      '  code: done, PR opened',
    ],
    [
      '  Stage verify:r1 — process success, handoff NOT advanced (terminal event: success) — final: status=redirect next=prepare',
      '  review: retrying',
    ],
    ['  Merge gate: RESULT: ALL GATES PASS', '  checks: passed'],
    [
      '  Audit: /p/.pair/working/automation/loop-audit.md (live JSONL — tail -f it)',
      '  audit: /p/.pair/working/automation/loop-audit.md',
    ],
  ])('%s', (line, note) => expect(plainNote(line)).toBe(note))

  it.each([
    '  Stage prepare:r1-g1 — process success, handoff advanced (terminal event: success) — final: status=red next=validate',
    'DISPATCH-RECORD: 2026-10-24T06:34:03.808Z event=start card=575 workflow=pair-workflow-cycle',
    'PREPARE-RESULT: prepared',
    '  Engine: claude — `claude -p --output-format stream-json --verbose` (from schema default)',
    '  Merge: CI pending — waiting 30s',
    '    filter: risk:green (adoption (translated from ## Eligibility))',
    'pair-cli run',
  ])('hides %s', line => expect(plainNote(line)).toBeUndefined())

  it('never hides an unknown line (errors, questions)', () => {
    expect(plainNote('  Escalated at stage verify: needs a human decision')).toBe(
      '  Escalated at stage verify: needs a human decision',
    )
  })

  const platformCases = ['darwin', 'linux']
  it.each(platformCases)(
    'applies only to a live terminal without --verbose (platform %s)',
    platform => {
      const original = Object.getOwnPropertyDescriptor(process, 'platform')!
      Object.defineProperty(process, 'platform', { value: platform })
      try {
        expect(plainConsole({ isTTY: true })).toBe(true)
        expect(plainConsole({ isTTY: false })).toBe(false)
        expect(plainConsole({ isTTY: true, verbose: true })).toBe(false)
        expect(plainConsole({ isTTY: true, output: 'quiet' })).toBe(false)
      } finally {
        Object.defineProperty(process, 'platform', original)
      }
    },
  )
})
