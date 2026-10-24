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
      undefined,
    ],
    ['  Merge gate: RESULT: ALL GATES PASS', '  checks: passed'],
    [
      '  [#572]   Merge: CI failed — re-run of the failed jobs requested',
      '  #572 CI: failed, re-running',
    ],
    [
      '  [#572]   Merge: CI still red on 84d8d7f5 — routed to the fix stage with the failing checks as findings',
      '  #572 CI: still red, fixing',
    ],
    [
      '  [#572]   Recovery: dirty worktree — stray files stashed (git stash list: pair-recovery), retrying (round 1/5)',
      '  #572 worktree: cleaned, retrying',
    ],
    [
      '  Stage implement:a0 — process success, handoff advanced (terminal event: success)',
      '  code: done, PR opened',
    ],
    [
      '  [#572]   Stage implement:a0 — process success, handoff advanced (terminal event: success) — final: status=ok next=verify',
      '  #572 code: done, PR opened',
    ],
    [
      '  [#572]   Escalated at stage verify: needs a human decision',
      '  #572 Escalated at stage verify: needs a human decision',
    ],
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
    'pair-cli run --parallel',
    '  Scope: pair-next --root 578 --filter * (## Autonomy)',
    '  Requested: --parallel 1 · ## Max Parallelism 3',
    '  Unit: one `pair-cli run --card <id>` process per card',
    '  Forwarded to each card: --preset escalate-red (argument)',
    '  Merge: each card merges per its gate (hold-when; has: risk:red, preset escalate-red)',
    '  Autonomy: confirmations active (default — no autonomy flag passed)',
    '  Project trust: nothing to approve',
    '  Loop (watch loop — each iteration re-selects; precedence: argument > adoption > KB default):',
    '  Excluded: escalated (until cleared), locked and terminal cards',
    '  [#572]     preset: escalate-red (argument)',
    '  [#572] pair run',
    '  [#572]   Dispatch: card 572 · no mapping declared',
    '  [#572] PREPARE-RESULT: prepared',
    '  [#572] 2026-10-24T15:57:45.833Z card-start #572',
    '  [#572]   Readiness: card 572 — board state `Refined` ⇒ Ready',
    '  Ended #572: failed — exit 1',
    '  Batch outcome:',
    '  Plan: Nothing eligible to run concurrently',
    '  Effective parallelism: 0 = min(dependency-allowed 0, ## Max Parallelism 3, --parallel 1)',
    '  [#572]   reason failed-preparation · refusal dirty',
    '  Started #572',
    '  excluded: 572 (failed-preparation, run run-1, 2026-10-24) — re-evaluated, not inherited',
  ])('hides %s', line => expect(plainNote(line)).toBeUndefined())

  it.each([
    [
      '  [#572]   Stage validate:r3-g1 stopped the card: seal-not-pushed — not retried.',
      '  #572 tests: stopped (seal-not-pushed)',
    ],
    [
      '  [#572]   Recovery: seal-not-pushed — retrying validate (round 1/5)',
      '  #572 tests: seal-not-pushed, retrying',
    ],
  ])('shortens %s', (line, note) => expect(plainNote(line)).toBe(note))

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
