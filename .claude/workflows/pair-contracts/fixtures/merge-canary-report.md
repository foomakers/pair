# Paired merge-decision canary (US-490)

- Oracle: the removed `pair-loop.js` Advance block, frozen verbatim from `origin/main` f9e48eb7
  (lines 72 and 628-765, sha256 `7ed8a32b2fec7083e7428e79a11c69d9fb890c1f9b6c95801ea27822d88e8f48`), evaluated as-is
- Subject: `cycle-merge.mjs` `checkMerge` then `runMerge` (`decideMerge`) through fake adapters
- Compared: merge or park, park kind, first failed condition, its detail text (the gate detail excepted)
- Reproduce: `cd .claude/workflows && node --test pair-contracts/merge-canary.test.mjs`

## Scenario space

| dimension | classes |
| --- | --- |
| card tier | risk:green, risk:yellow, risk:red |
| Auto-Advance | `[]`, `[<card tier>]` |
| tier re-read | same, changed:<other tier>, untagged, non-risk-labels-only, unreadable, malformed:risk:gr een, malformed:risk:a.b |
| signals | unreadable:host-error, unreadable:head-not-sha, unreadable:pair-review-not-string, unreadable:explicit-approval-not-string, pr:success,ea:success, pr:success,ea:failure, pr:success,ea:missing, pr:failure,ea:success, pr:failure,ea:failure, pr:failure,ea:missing, pr:pending,ea:success, pr:pending,ea:failure, pr:pending,ea:missing, pr:missing,ea:success, pr:missing,ea:failure, pr:missing,ea:missing |
| head | reviewed, moved |
| gate | green, red |

Scenarios: 3072

Decision diffs: 0

## Outcomes (old rule)

| decision | park kind | first failed condition | scenarios |
| --- | --- | --- | --- |
| merge | — | — | 8 |
| park | awaiting-human | tier-not-auto-advance | 512 |
| park | halted | explicit-approval | 32 |
| park | halted | gate-red | 8 |
| park | halted | head-moved | 192 |
| park | halted | pair-review | 144 |
| park | halted | signals-unreadable | 128 |
| park | halted | tier-changed | 2048 |

## Decision diffs

None.
