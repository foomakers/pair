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

1. **The mapping is adoption data**: a seventh section of the optional `.pair/adoption/tech/automation.md`, `## Workflows`, with entries `<tag> ⇒ <workflow>` and an optional `Precedence:` line. Its schema is owned by the KB guideline `collaboration/automation/automation-policy.md` (D21: adoption is the delta, the KB is the schema). The **tag is an opaque routing key** and the **workflow is a skill name** — so no classification criterion ever lives in code (D18). The *set of nameable workflows* is not open, and item 7 is why: it is the KB catalog, held in the driver as data and asserted equal to the guideline's table by test.

2. **The routing core is a pure function in the entry point** (`pair run`, ADR-021 tier 2): `dispatch.ts` takes the card, the labels a trigger observed, the policy and an installed-skill probe, and returns *route* or *skip*, or HALTs. It performs no I/O, holds no credentials, and knows nothing about the tracker. The order is normative — **mapping → eligibility → routing** — so an ineligible card is skipped before its tags are read at all.

3. **The card's labels are an input, not a lookup**: `pair run --card <id> --card-tags <list>`. The trigger's own **thin per-host adapter** (a GitHub Actions job, a webhook runner) supplies both, under the credentials it already runs with. Adding a code host is a new adapter, never a change to the core. Both values are untrusted host data and are content-checked at parse time, exactly as `--root`/`--filter` already are.

4. **The on-issue audit is split, and the split is the point**: every decision (start/skip/end) is appended to the run's `## Audit Location` file, and the `start` record — **and only that one** — is *also* printed as a single `DISPATCH-RECORD:` line for the host adapter to post as a comment on the card. The driver writes files and prints lines; it never posts to a tracker. Skips and ends stay in the file deliberately: a card that gets a comment for every unmapped label edit is unreadable within a day, and the `end` duplicates on the card what the trail already holds. AC3 asks for the run *start* on the issue, and that is exactly what ships.

5. **A trigger burst never starts two runs on one card**: the dispatch takes an **exclusive per-card lock** (an atomic `mkdir` under `working_path`) before spawning and releases it unconditionally afterwards — including when the run throws, which also writes the `end` record (`outcome=crashed`) rather than leaving the trail stopped at `start`. A locked card is **skipped and logged**, never queued — it is still tagged, so the next trigger picks it up — and the skip reports the holder's directory and how long it has been held, because nothing reaps a lock (see the limitation below).

6. **Fail-safe everywhere, in one direction**: no `## Workflows` section ⇒ "no mapping declared", clean exit; no mapped tag ⇒ skip; ineligible ⇒ skip; a workflow that is not installed, a workflow whose scoping argument the driver cannot spell (item 7), or a multi-tag card with no covering `Precedence:` ⇒ **HALT** with an adoption-fix message. Nothing ever falls back to a default workflow.

7. **A dispatched card IS the run's scope — under the routed workflow's own name for it, and nothing displaces it.** The card travels as an argument the workflow declares (`--root` for `pair-loop`, `--story` for `pair-process-plan-tasks`), borrowed from its `## Arguments` table and never invented (D18); the mapping from the driver's scope slot to each workflow's spelling is DATA in `invocation.ts`, pinned against the dataset corpus by a test. Three refusals hold that property up, and all three are needed:
   - **`--root` (and `--skill`/`--prompt`) alongside `--card` is refused at parse time.** A dispatched card is the whole answer to "what is this run about", and an operator or wrapper flag answering it a second time is not a narrowing: `--card 217 --root 300` would drive the agent over subtree 300 while the audit trail, the `DISPATCH-RECORD:` comment and the exclusive lock all named 217 — 300 unguarded, 217 credited with work nothing did on it. The handler additionally reads the dispatched card *before* `config.scope.root`, so the outcome stays unreachable for a caller that skips the parser.
   - **A mapped workflow outside the KB catalog is refused**, even when installed and even when the driver knows how it spells its scope. The mappable set (`DISPATCHABLE_WORKFLOWS`) is its own declaration, deliberately NOT derived from the argument table: `pair-next` has a row there because `--skill pair-next --root 212` is a legitimate hand-driven run, and routing a card to it would take the card's lock and post a `DISPATCH-RECORD:` comment for a run that prints a recommendation and changes nothing. The set is asserted EQUAL to the guideline's catalog table, in both directions.
   - **A catalogued workflow the driver holds no scoping row for is refused.** An argument a skill does not declare is *ignored*, not rejected, and the `pair-process-*` workflows then select the highest-priority story on the board themselves — the run works a card nobody tagged while the trail names the card that was.

   Refusing is in every case the only outcome that keeps item 4's record true.

8. **The mappable set admits only workflows that can finish with nobody watching.** A dispatch spawns its workflow under the operator's one-time `--autonomous` opt-in, holds the card's exclusive lock for the run, and has already posted a public `DISPATCH-RECORD:` comment saying a run started. A workflow whose own SKILL.md requires an explicit human decision has exactly two outcomes there, and both are worse than not running: it **stalls** on a question no one answers until the per-iteration timeout, or the agent — having no interlocutor — **supplies its own approval** and drives the card past the gate, satisfying the authorization control with the party it exists to constrain. So `pair-process-refine-story` is NOT mappable, even though the driver knows exactly how it spells its scope (`--story`): it is the single Draft→Ready path, its phase 0 is "the R3.11 AI↔human alignment gate — a prerequisite, not optional", it adds three per-step `Human-judgment gate`s, and it states that "what is never skipped is explicit human alignment before the story reaches `Ready`" (R3.11, D24). It keeps its `SKILL_PARAMETERS` row, because `--skill pair-process-refine-story --root <card>` is a legitimate HAND-DRIVEN run — someone is there to answer. The rule is enforced against the skills' own SKILL.md by a KB conformance guard, so putting a row back into the catalog table fails a test rather than shipping.

   Deliberately NOT enforced via `$approval`: none of the mappable workflows declares that argument either (`pair-loop` composes the family that does, `pair-process-plan-tasks` has no approval round at all), so a "must declare `$approval`" gate would refuse the whole catalog. What distinguishes the excluded case is a human-judgment gate in its own steps, not an argument on its interface.

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
- **Tag-driven automation does not cover refinement** (item 8). A team wanting Draft→Ready unattended gets nothing from this feature: the only Draft→Ready path requires a human, so refinement stays hand-driven (or batch-driven with a human present). Accepted rather than worked around — an unattended path past that gate would be a change to D24, not to this ADR.
- **The lock is filesystem-local**: two runners on different machines sharing no working area can still collide. Bounded by the same working area every other run artifact already assumes; a distributed lock is out of scope and out of the story's stated isolation model. **Consequence for the reference adapter**, stated because it inverts what a reader assumes: on GitHub-hosted runners every job checks out a fresh workspace, so the lock can never observe a holder from another job and the host's `concurrency` group is the cross-job guard there. Every path that dispatches a card must sit in that group; the per-card lock is the guard on the *persistent-daemon* deployments (the tutorial's Options A–C), where the host offers none.
- **Nothing reaps a lock.** A run killed by SIGKILL, an OOM kill or a job timeout leaves the directory behind, and every later trigger on that card then skips, exits `0` and looks exactly like a healthy burst — automation silently off for one card. Mitigated, not solved: the skip prints the holder's path and age (`holder.json`'s `acquiredAt`), and the KB's pre-flight documents clearing it. A TTL was rejected as the wrong default — a lock that expires while its run is alive re-creates the race the lock exists for, and no timeout is right for every workflow a mapping can name.
- **A mapping naming an uninstalled workflow — or one outside the KB catalog — HALTs the whole board**, not just the cards carrying that tag: both checks run before eligibility and routing. The second bounds what a mapping may name to the catalog's two: a project mapping a tag to any other skill is refused rather than dispatched blind, and widening that set is a deliberate change to the guideline's table plus the one-line data edit the equality assertion then demands. Deliberate — a broken mapping is broken configuration, and surfacing it only on whichever card happens to carry the tag would make the failure depend on which trigger fired first — but the blast radius is a property adopters must be told about, so it is stated in both the schema and the adapter's pre-flight.

## Adoption Impact

- `adoption/tech/architecture.md` — records tag-driven dispatch as the entry point's routing layer, and the agnostic-core / host-adapter boundary.
- `adoption/tech/automation.md` — **unchanged on purpose**: this project declares no `## Workflows` section, so tag-driven dispatch stays off here. The absent-section path is the shipped default and the one this repo exercises.
- KB (`packages/knowledge-hub/dataset/.pair/knowledge/...` + the root mirror) — `automation-policy.md` gains the `## Workflows` schema; `github-automation.md` gains the reference host adapter.
