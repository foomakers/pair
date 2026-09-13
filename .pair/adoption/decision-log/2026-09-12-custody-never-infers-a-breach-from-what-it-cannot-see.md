# Decision: custody never infers a breach from what it cannot see

## Date

2026-09-12

## Status

Active

## Category

Process Decision

## Context

`red-snapshot.mjs` proves custody of a sealed RED contract by walking the story branch backwards
from HEAD, collecting the `Pair-RED-Snapshot` trailers it finds and checking every change after each
seal against the scope that seal put in force. The walk uses `--first-parent`, and for a good
reason recorded by t9b-3: a seal belonging to a FOREIGN pull request, merged into the story branch,
must not become a segment boundary of this cycle. Following only the first parent makes another
cycle's seals invisible, which is exactly right.

The third independent review (t9c-1) observed the other half of that same property. A seal this
cycle OWNS is equally invisible when it arrives behind a `--no-ff` merge of a side branch — and
then the walk sees sealed tests changed, and production touched, with no seal in sight to authorise
either. It reports `unlisted-test-changed` and `out-of-scope`, which resolve to a terminal
`failed-custody`. The work was correct; the permission existed; the walk simply never passed by it.

Nothing live triggers this: seals and GREEN commits land directly on the story branch, so the side
branch never appears. But that is a practice, not an invariant anything enforces — a maintainer
merging by hand is one command away from it, and the failure it produces is the worst shape
available: terminal, on correct work, accusing the custody of forgery.

This is the same class as t9-1, where the chain listed by a single `pr` identity fabricated a breach
on the first remediation round of any fresh story. In both cases the guard concluded *violation*
from its own blindness. The pattern is worth deciding once rather than patching where it surfaces.

## Decision

**A custody check that cannot see something says so. It never converts an absence of evidence into
a finding of guilt.**

Concretely, for the `--first-parent` hole and for anything of its class:

**1. The fallback runs only on the failure path.** Before emitting `out-of-scope` or
`unlisted-test-changed`, and only then, the walk looks for a seal in the FULL history. In the
ordinary case — a breach that is real, or no breach at all — nothing extra is read, so the cost is
zero where it matters.

**2. It searches only the identities the cycle owns.** Those are known from the durable handoffs;
they are never guessed from the history. This preserves t9b-3 exactly: a foreign seal stays
invisible whether or not a merge put it off the first-parent path, because it is not in the set
being looked for.

**3. Finding one does not absolve — it re-classifies.** A seal of this cycle sitting off the
first-parent path is an anomaly no path of the workflow produces, so the fallback does NOT silently
adopt its scope and continue. It emits a typed `seal-off-first-parent`: the run stops and asks for
a look, without spending a corrective round the way a real violation does.

The distinction the outcome must preserve, in both directions: *"there is a seal outside my walk,
come and look"* is a different statement from *"you changed a sealed test without permission"*, and
a guard that cannot tell them apart is not fit to be terminal.

## Consequences

- The code change is deliberately NOT made on PR #480. Every round that touched custody on that
  branch produced new Major findings — t9-1 was custody, and four of the fourth review's seven
  Major sat in a rollback path added one commit earlier. With no live trigger, changing the history
  walk at the fifth round buys a hypothetical and risks a real one. The decision binds now; the
  implementation is scheduled separately.
- Until then the hole stands, documented, with its trigger named: a `--no-ff` merge of a side
  branch carrying a seal of the current cycle onto the story branch. Anyone who hits a
  `failed-custody` that makes no sense should look there first.
- `seal-off-first-parent` is a new outcome, so it needs a place in the breach vocabulary and a
  transition that stops without charging the fix budget. That is the bulk of the work, not the
  search itself.
- The principle generalises beyond this walk: any guard in the custody path that reports a breach
  where it should report a blind spot is in scope for the same treatment, t9-1's identity handling
  being the precedent already fixed.
