# Decision: pi's in-session cycle runs through the pinned `pi-subagents` package, bridged by a skill-local script, installed only on an explicit yes

## Date

2026-09-23

## Status

Active

## Category

Library Choice

## Context

US-503. pi's base agent has no sub-agent primitive, so `pair-workflow-cycle` HALTed `realization-unavailable` inside pi and the only path was `pair-cli run --card` (one process per stage; `reuse` degrades to `fresh`, [2026-09-22 ADL](2026-09-22-tier-2-is-realized-at-the-stage-level-and-reuse-degrades-to-fresh.md)). The third-party `pi-subagents` package adds a `subagent` tool with fresh dispatch and retained-run resume. #503's live probe (2026-09-23, pi 0.84.3, `pi-subagents@0.71.0`) showed a resumed stage recalls what only the previous stage was told and both stages publish their handoff; it also showed a resume is a NEW child that decides by itself whether to read the old session file.

## Decision

- **Primitive**: `pi-subagents`, pinned at `0.71.0` (the probed version). One `pi` row in `cycle-dispatch.mjs` `REALIZATIONS` binds it by the probed tool `subagent` (or its loader `subagents_enable`), never by product name.
- **Bridge, not package**: pair ships no package of its own. `pair-workflow-cycle/scripts/pi-bridge.mjs` renders the `subagent` arguments (fresh `runs.run`, `reuse` ⇒ `runs.run({ resume })` on the role's latest run id), checks the tool's name and parameters against the pin before each dispatch (typed `subagent-tool-mismatch` naming the version), and holds no cycle rule (ADR-024 §7). It spawns nothing.
- **Deterministic rehydration**: every resumed task opens with the order to read the previous session file, by path — the context step no longer depends on the model's choice.
- **Consent**: nothing is installed without an explicit yes. `/pair-capability-setup-harness` now installs or verifies `pi` (≥ `0.86.1`, `pi-subagents`' requirement) and, only on request, `pi-subagents` at the pin; the cycle proposes the install inside pi (detected by pi's `PI_CODING_AGENT=true` process marker), stops on no (`pi-subagents-missing`), and on drift warns and proceeds as unverified if declined.
- **One version, two readers**: the pin lives in `pi-bridge.mjs` `PIN`; `agent-harness/pi.md` § 9 records it as verified-against; a test keeps them equal. The setup skill reads them and never edits the KB.

## Alternatives Considered

- **Own pi package wrapping `pi-subagents`** (the earlier leaning): a distribution and release surface for a thin translation — replaced by the bridge script at refinement.
- **Native child processes with SIGSTOP/SIGCONT** (explored on the card): rebuilds what `pi-subagents` already provides, with process lifecycle and crash recovery to own.
- **Leave rehydration to the model**: works on the probed model, not guaranteed on weaker ones.
- **Auto-install on first use**: violates the story's consent rule for third-party code with execution rights.

## Consequences

- pi sessions get session-persistent stage transitions like Claude/Codex; `pair-cli run --card` on pi is unchanged (rollback = remove the row).
- `pi-subagents` is single-author and volatile: a new version means re-probing, then a data edit to `PIN` + pi.md § 9. A drifted install runs only after the user accepts it as unverified.
- The paired run (same card on pi and on Claude reaching the same terminal status) is deferred to a paid-model session; hermetic tests stub the tool.

## Adoption Impact

- `adoption/tech/tech-stack.md` (Runtime & CLI tooling): `pi-subagents v0.71.0` listed as the pinned, user-installed in-pi sub-agent primitive.
