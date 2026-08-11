# Decision: no write is assumed — every write a skill makes is re-read back

## Date

2026-08-11

## Status

Active

## Category

Convention Adoption

## Context

[2026-07-31-pm-adapter-visibility-contract.md](2026-07-31-pm-adapter-visibility-contract.md) closed the adapter half of item visibility and explicitly deferred the skill half to #403: `$assignee` in the write contract, membership-precedes-state as a precondition, and a HALT on an unresolvable item — tool-agnostic, never a tool-shaped step.

While refining #403 (2026-08-04) the deferred half produced new evidence that changes what the fix has to be. Adding four cards to the board by hand reproduced the defect:

- `gh project item-add` **exited 0 and created nothing** on the first attempt for #413; `item-list` did not find the item. A second, identical invocation created it. Reproduced three times across the session.
- Every board write therefore had to be **membership → a read that confirms it → state**, in that order, with the read as the load-bearing beat.

So ordering the calls correctly is *not sufficient*. `/pair-capability-write-issue` Step 7 could add the membership before the state write, in the right order, following the adapter exactly — and still write the state field on an item that does not exist, because the add reported success. The same shape appeared on the code-host side: PRs #404, #405, #406 and #408 were published with no assignee, and #406 without its story's `risk:*` labels, all reported as successful publishes.

## Decision

**Any operation whose exit status can be 0 with no effect is verified by a read, and a skill reports what the read observed — never what the call returned.** A write that cannot be confirmed by a read is a failure or a finding, never a silent success.

Concretely:

1. The rule is stated **once, as an invariant**, in `/pair-capability-write-issue` Step 7 (the skill that owns item writes) and applied verbatim by `/pair-capability-publish-pr` (the skill that owns PR writes). Both are guarded by `packages/knowledge-hub/src/conformance/verified-writes-contract.test.ts`.
2. **Membership precedes state** is the ordering half, stated tool-agnostically in `/pair-capability-write-issue` Step 7b as three beats — membership, a read that confirms it, the state field — with all per-tool mechanics referenced out to the adapters (the constraint the 2026-07-31 ADL put on this story). An unconfirmable membership **HALTs with the specific reason**; a skipped board write is never reported as success.
3. **An unassigned item is a warning, not a blocker.** The assignee cascade (`$assignee` → adoption `default-assignee` → none) never HALTs: the failure mode is invisibility, and refusing to file the item is worse than filing it unassigned. The rejected-assignee case takes the same branch — reported, never silently dropped.
4. **The default assignee comes from a declared adoption key** (`default-assignee`, schema in `skill-conventions/way-of-working-pm-resolution.md` § *Assignee resolution*), never from the authenticated user: an agent under a bot token would assign every item to the bot and pass its own check.
5. **The cascade has one code-host branch**: a PR write resolves `code-host-assignee` first and `default-assignee` second, an item write resolves `default-assignee` only. Declared in the same section, applied by `/pair-capability-publish-pr`. Without the branch the key was a schema field no skill resolved — and a split project's PR would be assigned the PM tool's login, rejected by the host, and published unassigned.
6. **An update never reassigns an item away from its current assignee.** The resolved assignee is written on an update only when the caller passed `$assignee` explicitly or the item has none; otherwise the existing one stands. Add-vs-replace semantics stay the adapter's (only GitHub's `--add-assignee` adds; Linear, Azure and `filesystem` replace), so the skill states *which value and when*, never *how*.
7. **The D4 skip is expressed by the caller omitting `$status`**, never by the writer softening its HALT: once a macrostate is requested, an unmappable one can only HALT (route (c)). `/pair-capability-publish-pr` therefore resolves `## State Mapping` before composing the board write and omits `$status` when no board state maps to `Review` — which is this project's own case.

## Alternatives Considered

- **Fix the ordering only (membership before state), no read-back**: Rejected by the observed evidence. The bug reproduced *with* correct ordering, because the add itself lied. The ordering fix closes one instance; the read closes the class.
- **Retry blindly instead of reading**: Rejected. A retry without a read cannot distinguish "the first call worked" from "neither worked" — it only changes the odds. The retry is kept, but as a response to a *negative read*, not as a substitute for one.
- **Put the read-back in the adapters, next to the mechanics**: Rejected. Six adapters would carry six copies of one rule, and the rule is about what a skill may *claim*, not about how a tool is called. The mechanics stay per-tool; the claim discipline is single-sourced in the skill.
- **A distinct `$verify` flag callers can turn off**: Rejected. An unverified write is exactly the behavior being removed; making it opt-out re-creates the defect behind a parameter.
- **Treat an unassigned item as a HALT** (symmetry with the membership HALT): Rejected. The two failures are not equivalent — an item off the board has nowhere for a state field to go, while an unassigned item is written and merely under-visible. A HALT there would trade a warning for lost work.

## Consequences

- Every board write now costs at least one extra read, and a publish costs one PR read. Deliberate: the alternative price was items that look green and are not on the board.
- `/pair-capability-write-issue` gains a HALT (`membership could not be confirmed`) that did not exist before. It fires only where a board is present and membership is impossible — never on a project that simply has no board (the D4 minimal-board path stays a documented skip, and Step 6 now separates the two outcomes explicitly, because the pre-existing HALT for an unmappable `$status` was being read as covering both).
- Output shapes changed on both skills (`Labels`, `Assignee` and `Board` rows on the item write; `Assignee` and a read-confirmed `Tags` row on the publish), so both carry a minor version bump.
- On this project's board no column maps to `Review`, so every `/pair-capability-publish-pr` run takes the documented skip and reports `Board: n-a — no Review state on this board`. That is the intended outcome of decision 7, not a degraded publish: readiness is carried by the PR.
- A future skill that writes to a tracker inherits the rule by pointing at it — the invariant is prose in one skill plus a conformance guard, not a shared code path. That is the accepted limit of this decision: it binds the corpus, not a runtime.

## Adoption Impact

- [way-of-working.md](../tech/way-of-working.md): gains a `## Assignment` section declaring `default-assignee` — the machine-readable half of the Assignment rule that had been prose-only since 2026-07-30.
- [way-of-working-pm-resolution.md](../../knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md): owns the `Assignee resolution` schema and cascade, beside `code-host` / `base-branch`, plus the routing-table row that sends the item assignee to the PM tool and the PR assignee to the code host.
- No dataset mirror of this file: sibling ADLs in `adoption/decision-log/` are adoption-only records — the dataset is a curated seed, not an auto-mirror of adoption.
