# ADR-024: Tag-driven dispatch — the mapping is adoption, the routing core is host-agnostic, the on-issue record belongs to the host adapter

## Status

Accepted

## Date

2026-08-30

## Context

- Story #217 (R4.4, epic #212) asks for **tag-driven workflows**: different tags trigger different workflows, exclusively on tagged issues, with the tag→workflow mapping declared in adoption. Automation must start **only** where a team explicitly enabled it, and each tag must route to the right behavior.
- The pieces around it already exist and must not be re-decided: `## Eligibility` (#216) selects *which cards* an unattended run may pick up; `pair-next` stays the frozen selector atom (ADR-017 §1); `pair run` is the portable execution adapter and the ADR-021 tier-2 entry point (#451); `pair-loop` and the other process skills are the workflows themselves.
- What was **not** decided anywhere: where the tag→workflow mapping lives, who evaluates it, how the "run start is recorded on the issue" (AC3) happens given that the driver deliberately holds **no tracker credentials**, and how a trigger burst is prevented from starting two runs on one card.
- **Hard to reverse**: the mapping's grammar becomes adoption content in every adopting project, and the entry point's flags become a public CLI contract that host triggers are written against.
- **Surprising without context**: that the driver is *told* the card's labels instead of reading them from the tracker; that an unmapped card is skipped by *absence of a route* rather than by a guard; and that the on-issue comment is emitted as a line on stdout for someone else to post.
- **Real trade-off**: the alternatives (a dispatcher inside the loop skill, a tracker client inside the CLI) were both available and were rejected for reasons recorded below.

## Options Considered

### Option 1: routing inside the loop skill (`pair-loop` reads the mapping and decides)

- **Description**: the mapping stays in `tech/automation.md`, but the agent skill reads it, matches tags and picks the workflow.
- **Pros**: no new CLI surface; the skill already reads the policy file.
- **Cons**: the routing decision — an **authorization** decision, since "untagged ⇒ never" is the opt-in boundary — would live in prose executed by an LLM, with no test able to pin it. Every safety property of the story (untagged never runs, no default workflow, no silent multi-tag choice) would be unverifiable by anything but another prompt.

### Option 2: the CLI grows a tracker client and reads the card's labels itself

- **Description**: `pair run --card 217` fetches the issue from the code host, reads its labels, then routes.
- **Pros**: one argument instead of two; the operator cannot pass stale labels.
- **Cons**: puts host credentials and a per-host API client into the driver, which is the one component that is deliberately host-agnostic — and multiplies by every tracker pair supports. It also duplicates what the trigger already knows: a host workflow firing on a label event *has* the labels in hand.

### Option 3 (chosen): adoption mapping + a pure routing core in the entry point, fed by a thin per-host adapter

See Decision.

## Decision

1. **The mapping is adoption data**: a seventh section of the optional `.pair/adoption/tech/automation.md`, `## Workflows`, with entries `<tag> ⇒ <workflow>` and an optional `Precedence:` line. Its schema is owned by the KB guideline `collaboration/automation/automation-policy.md` (D21: adoption is the delta, the KB is the schema). The **tag is an opaque routing key** and the **workflow is a skill name**, resolved against the *installed* skill set — so no classification criterion and no workflow catalog ever lives in code (D18).

2. **The routing core is a pure function in the entry point** (`pair run`, ADR-021 tier 2): `dispatch.ts` takes the card, the labels a trigger observed, the policy and an installed-skill probe, and returns *route* or *skip*, or HALTs. It performs no I/O, holds no credentials, and knows nothing about the tracker. The order is normative — **mapping → eligibility → routing** — so an ineligible card is skipped before its tags are read at all.

3. **The card's labels are an input, not a lookup**: `pair run --card <id> --card-tags <list>`. The trigger's own **thin per-host adapter** (a GitHub Actions job, a webhook runner) supplies both, under the credentials it already runs with. Adding a code host is a new adapter, never a change to the core. Both values are untrusted host data and are content-checked at parse time, exactly as `--root`/`--filter` already are.

4. **The on-issue audit is split, and the split is the point**: every decision (start/skip/end) is appended to the run's `## Audit Location` file, and the `start` record is *also* printed as a single `DISPATCH-RECORD:` line for the host adapter to post as a comment on the card. The driver writes files and prints lines; it never posts to a tracker.

5. **A trigger burst never starts two runs on one card**: the dispatch takes an **exclusive per-card lock** (an atomic `mkdir` under `working_path`) before spawning and releases it unconditionally afterwards. A locked card is **skipped and logged**, never queued — it is still tagged, so the next trigger picks it up.

6. **Fail-safe everywhere, in one direction**: no `## Workflows` section ⇒ "no mapping declared", clean exit; no mapped tag ⇒ skip; ineligible ⇒ skip; a workflow that is not installed, or a multi-tag card with no covering `Precedence:` ⇒ **HALT** with an adoption-fix message. Nothing ever falls back to a default workflow.

## Consequences

### Benefits

- Every safety property of the feature is a **tested production module**, not prose: untagged-never, eligibility-before-routing, no-silent-choice and one-run-per-card each have unit tests, and the KB's normative claims have a conformance guard.
- The driver stays credential-free and tracker-agnostic; pair can gain a host by gaining an adapter.
- The mapping composes existing skills, so a "workflow" costs a line of adoption rather than an engine.
- `pair-next` and the eligibility filter are untouched — dispatch narrows what runs, it never widens what is selected.

### Trade-offs and Limitations

- **Labels are as fresh as the trigger that passed them.** A card whose tag changed between the trigger firing and the dispatch starting is routed on the observed value. Accepted: re-reading them would require the tracker client this ADR exists to avoid, and the eligibility label is re-checked by the invoked skill on every iteration anyway.
- **`--card-tags` is comma-separated**, so a label containing a comma is not routable. Same over-inclusive direction `## Eligibility` already takes: the fix is to rename or re-project the label, never to widen the separator.
- **The on-issue comment is the adapter's job**, so a project whose adapter does not post it gets the file trail only. Documented per host in the KB rather than silently degraded.
- **The lock is filesystem-local**: two runners on different machines sharing no working area can still collide. Bounded by the same working area every other run artifact already assumes; a distributed lock is out of scope and out of the story's stated isolation model.

## Adoption Impact

- `adoption/tech/architecture.md` — records tag-driven dispatch as the entry point's routing layer, and the agnostic-core / host-adapter boundary.
- `adoption/tech/automation.md` — **unchanged on purpose**: this project declares no `## Workflows` section, so tag-driven dispatch stays off here. The absent-section path is the shipped default and the one this repo exercises.
- KB (`packages/knowledge-hub/dataset/.pair/knowledge/...` + the root mirror) — `automation-policy.md` gains the `## Workflows` schema; `github-automation.md` gains the reference host adapter.
