# Decision: A demonstrably new scope proposal is queued and never absorbed or carded automatically — the maintainer alone chooses ignore, extend-current-card or new-card

## Date

2026-09-10

## Status

Active

## Category

Process Decision

## Context

Story #479's delivery-engine delta (D4) requires the review stage to tell two things apart that
the 2026-08-12 decision did not need to distinguish:

- a **defect** — an accepted obligation (AC, adoption rule, security rule, a supported integration)
  is violated. That decision already governs this case: fix it in the same PR, or extend the
  story's scope section and acceptance criteria and still fix it there. Unchanged here.
- a **scope proposal** — the reviewer or implementer notices something demonstrably **absent**
  from the story's baseline, the adoption or a supported boundary: not a violation of anything
  approved, a genuinely new requirement or an extension of one. The 2026-08-12 decision's default
  ("if it does not fit the story's stated scope, extend the story") read literally would have an
  agent widen the card's scope and implement the new requirement **without anyone having agreed
  it belongs there** — the same failure mode that decision closed for filed cards (work the human
  never asked for, now shipped instead of merely backlogged), moved one step earlier.

Canary evidence (`.pair/working/canary/us-479/runs-archive/canary-479-v3/482/`) shows reviewers
proposing new checks/behaviour beyond the approved AC inside otherwise-clean remediation rounds;
nothing in the engine stopped that proposal from being treated as an ordinary defect and fixed.

## Decision

**A scope proposal is never a defect and is never auto-applied.** When preparation or review
identifies something that is demonstrably new — not an approved obligation's violation — it is
recorded as a `scopeChanges[]` entry (`type: new-requirement | scope-extension`, `status: pending`),
with the evidence that it is new. It:

1. **Never** carries a severity (Critical/Major/Minor), never blocks the merge gate on its own,
   never enters a remediation fix plan, never counts toward the defect/late-defect counters.
2. Is **not implemented** until the maintainer applies one explicit decision, after quality
   convergence (S5 of #479): `ignore` (rationale recorded, nothing changes), `extend-current-card`
   (the maintainer's approved delta names the exact new/changed AC; only then does it enter a
   targeted prepare/validate/implement/review cycle, as a new `scopeEpoch`), or `new-card` (an
   existing issue is linked, or an explicitly authorized new one is filed — never invented by the
   agent from the proposal text alone).
3. Is applied **mechanically** from the maintainer's authenticated decision (a verified PR comment
   from the adopted default assignee) — never generated, inferred or auto-approved by an agent.

This does not touch the 2026-08-12 decision's territory: a **defect** is still fixed or absorbed
in the same PR without waiting on a human gate. Only genuinely new scope waits.

## Alternatives Considered

- **Extend the 2026-08-12 default to cover scope proposals too**: rejected — that decision exists
  precisely to stop debt from leaking into a separate, unprioritized backlog; applying its
  "extend and fix" default to a proposal nobody has approved would ship unrequested behaviour
  instead, which is a different and worse failure than the one it was written to close.
- **Let the reviewer decide case by case whether a finding is scope or a defect**: rejected for the
  same reason ADL 2026-08-12 rejected it for cards — given a legitimate-looking escape hatch
  ("this is really new scope, so I can skip the fix"), an agent under pressure to converge takes
  it. The classification test in #479 S2 (cite the accepted obligation violated, or it is scope) is
  mechanical, not a judgment call left to the same agent proposing the change.
- **Auto-create the card and let the maintainer close it later if unwanted**: rejected — same
  reasoning as the 2026-08-12 decision's rejected "keep filing cards" alternative: it fixes
  visibility, not the authority question of who decides new work happens.

## Consequences

- A review or preparation round can converge cleanly (zero defects) while still surfacing scope
  proposals — the PR is `awaiting-scope-decision`, not silently `ready-for-merge` and not silently
  widened.
- The maintainer sees a single consolidated packet of proposals per PR, not one scattered across
  review comments across rounds.
- `pair-loop` halts on `awaiting-scope-decision` like any other non-ready status (AC-11) — no
  automatic advance, no automatic card creation.
- The story itself stays open regardless of the choice; merge still requires the existing human
  gate (S5 of #479).

## Adoption Impact

- [ADR-024](../tech/adr/adr-024-delivery-phases-are-skills.md) — Amendment 2026-09-10 § 6 records
  this decision's engine-side scope and version pin; the behavioural wiring (queue, packet,
  `apply-scope-decisions`) lands in T-22.
- `way-of-working.md` is unchanged: its existing "implementation and review never file a new card"
  bullet already scopes itself to defects/debt; this decision adds the sibling rule for proposals
  without editing that bullet.

## References

- Story #479, PR #480 — D4 specification, S2 (findings vs. scope) and S5 (developer scope
  decision).
- ADL [2026-08-12-implementation-never-files-a-card-it-extends-the-story.md](2026-08-12-implementation-never-files-a-card-it-extends-the-story.md)
  — governs defects/debt; unchanged, and explicitly not superseded by this entry.
- `.pair/working/canary/us-479/runs-archive/canary-479-v3/482/` — canary evidence of unbounded
  scope proposals inside remediation rounds.
