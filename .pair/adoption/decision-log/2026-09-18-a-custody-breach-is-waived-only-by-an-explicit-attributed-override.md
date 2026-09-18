# Decision: a custody breach is waived only by an explicit, attributed, verified override

## Date

2026-09-18

## Status

Active

## Category

Process Decision

## Context

`red-snapshot.mjs verify-chain` proves custody of a sealed RED contract per SEGMENT: every change
between one seal and the next is checked against the `fixScope` that seal put in force. The check is
literal, and deliberately so — a path outside `allowedPaths` is `out-of-scope`, an unlisted test file
is `unlisted-test-changed`, and any breach is terminal for the attempt.

Two shapes of legitimate change break that literalness, and both are real, not hypothetical:

1. **Merge-carried content.** A story branch merges `origin/main` to pick up a fix it needs (often to
   close an unrelated finding). The merge carries files nobody in this cycle wrote, into a segment
   whose scope was declared before those files existed.
2. **A direct, tracked fix to the delivery engine itself.** The remediation touches the workflow
   scripts the cycle is running under — a path no group's `fixScope` can name without the contract
   authoring the tool that verifies it.

US-486, remediation round 1, hit both at once: **18 breaches, every one a false positive**, on work
that was correct and authorized. The only resolutions available were discarding correct work,
re-sealing to launder the change, or abandoning the cycle. The 2026-09-12 decision already named this
class — a guard must not convert what it cannot see into a finding of guilt — but its remedy was
about blind spots. Here the guard sees everything correctly; what is missing is a way for a **human**
to say "this one is authorized, and here is why", without weakening what the guard proves for
everything else.

The pressure to widen the scope instead is exactly what makes this worth deciding once: widening is
always available, always cheaper in the moment, and always silent afterwards.

## Decision

**A custody breach is never inferred away. It is waived only by an explicit, attributed, verified
override — and an honored override stays visible in the output as what it is.**

The mechanism, and the properties that make it a decision rather than an escape hatch:

1. **Human-authored, out of band.** Overrides live in `<runDir>/custody-overrides.json`, beside the
   story's working files — never on the sealed contract (that would mutate a seal already committed)
   and never written by an agent of the cycle. The reviewer READS them; it does not author them.
2. **Attributed, per coordinate.** Each entry names `{ code, path, segment, reason, authorizedBy, at }`.
   It waives ONE breach code on ONE path in ONE segment. A malformed entry — any missing field, an
   unparseable `at` — is dropped entirely; the breach it would have covered stays blocking. Fail-safe
   is the default in every ambiguous case.
3. **Allow-listed by code, never duck-typed.** Only the codes named in `OVERRIDABLE_BREACH_CODES`
   accept an override (`out-of-scope`, `unlisted-test-changed`, `test-mode-production-change`,
   `behavioral-adds-or-moves-module`, the segment-scoped `test-blob-changed`). Ancestry and seal
   integrity — `parent-not-base`, `snapshot-missing`, blob identity at HEAD — are **not human
   waivable at all**. A future breach code does not become overridable by growing the fields an
   override matches on; it becomes overridable by being added to that list, deliberately.
4. **Verified where verification is possible.** `verifyAgainst`, when declared, is proven: the path's
   blob at HEAD must be byte-identical to that ref, and the ref must PEEL (`^{commit}`) to a commit
   other than HEAD's own — `rev-parse --verify` alone returns the object a ref NAMES, not what it
   peels to, so an annotated tag at HEAD or `HEAD^{tree}` both differ from HEAD's raw commit id while
   still resolving the path through HEAD's own tree; peeling both sides closes that. ABSENT claims
   nothing and is honored on the attribution alone; DECLARED must prove something — an empty or
   non-string value, an unresolvable ref, or a ref peeling to HEAD's own commit (a self-comparison,
   true by construction) all refuse the override rather than skip the proof.
5. **Never invisible.** An honored override does not delete a breach: it moves it from `breaches` to
   `overriddenBreaches`, carrying `override: { authorizedBy, reason, at, verifyAgainst? }`. The
   reviewer copies that array into its `custody` handoff verbatim, so the durable record says who
   authorized what, on what evidence — the same record a merge decision is later audited from.

Custody is therefore still the machine's to judge; only the exception is the human's to grant, and
granting one leaves a trace that outlives the run.

## Alternatives Considered

- **Widen the `fixScope` to cover the carried paths**: rejected. It is the cheapest fix and the worst
  record: after the widening, nothing distinguishes "a human authorized this specific merge-carried
  file" from "this scope was always this broad". The scope stays widened for every later segment, so
  one exception silently buys permanent permission, and the reviewer cannot tell it happened.
- **Re-seal the contract with the new reality**: rejected. The seal's whole value is that it is
  immutable once committed — an attempt that can re-seal to match what it did proves nothing about
  what it promised. It also destroys the segment boundary the breach was measured against.
- **A global "custody override" flag on the run**: rejected. It waives everything at once, is not
  attributable to a path or a reason, and would apply to ancestry and blob identity — the properties
  that must never be waivable.
- **Leave it to the reviewer's judgment (report, let a human read the breaches)**: rejected. A
  terminal `failed-custody` kills the cycle before any judgment is published, so "a human decides
  later" is not reachable; and it makes the machine's verdict advisory, which is the one thing
  custody must not be.

## Consequences

- A cycle blocked by merge-carried content or an engine fix now has a resolution that costs one
  authored file and leaves an audit trail, instead of discarded work or an abandoned run.
- The reviewer gains a reporting obligation: `overriddenBreaches` MUST be carried into the published
  handoff whenever the script returns it. Omitting it is the failure mode this decision guards
  against (it already happened on PR #494: a human authorization with no trace in the record).
- The waivable set is now a named list with a decision behind it. Adding a code to it is a decision
  to record here, not an implementation detail.
- `verifyAgainst` is best-effort by design: it proves the content came from where the author says it
  did, not that the author was right to carry it. The `authorizedBy` + `reason` pair carries the
  judgment, and that is the part a human is accountable for.
- Nothing about the strict path changes: with no overrides file, or with a malformed one, custody
  behaves exactly as it did before this decision.

## Adoption Impact

- `.pair/knowledge/guidelines/...` — none: the mechanism is documented where it is executed, in the
  `review-phase` skill (custody step + Output Format) and in `red-snapshot.mjs`'s own header.
- No `way-of-working.md` change: this is a property of the delivery workflow's custody check, not a
  new process step.
