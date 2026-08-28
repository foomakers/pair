# Harness Realization — Probe, Bind, Announce, Degrade

The generic rule a skill follows when the **same capability** can be executed by more than one mechanism, and which mechanisms exist depends on the **agent harness** the session happens to be running in.

This is not the [resolution cascade](resolution-cascade.md), and the difference is the whole reason this file exists. The resolution cascade resolves a **value** the project declares (argument > adoption > assessment): every tier is readable, stable and under the team's control. A harness realization resolves an **execution mechanism** the *vendor* controls: it can be renamed, put behind a default-off feature flag, or removed between two releases of the same product, and none of that reaches an adoption file. A skill that treats the second like the first ends up asserting a capability from a product name.

Fan-out — driving several work items without the orchestrator's context growing with them — is the capability this convention was extracted from, but nothing below is specific to it.

## The four steps

Always in this order. A skill that skips one has picked a mechanism it cannot justify.

### 1. Probe

**Establish availability by observation, never by inference.** The only admissible evidence is that the mechanism is *present in this session*: the tool is exposed, the executable answers on `PATH`, the API responds.

Never admissible as evidence:

- the product name ("this is Codex, therefore it has subagents"),
- a version string or a version range,
- a feature being documented, or having been available in a previous session,
- the presence of a config key that *would* enable the mechanism — a key can be set in a file the running surface never reads.

The probe reads a **surface map**: one declarative structure holding, per known realization, the handles to probe, the namespace they live under, and the config keys that gate or bound them. See [the surface map is data](#the-surface-map-is-data).

### 2. Bind

Take the **first realization the probe confirmed**, in the preference order the capability declares. A skill never re-derives that order and never widens it: a realization the probe did not confirm is not available, however strongly the environment suggests it should be.

A caller may deliberately ask for a **lower** tier than the probe confirmed — a lower tier is a legitimate choice, not a failure — but never a higher one.

### 3. Announce

**Before dispatching anything**, print which realization won, which primitive it bound to, and why. Three reasons this is a step and not a nicety:

- an unattended run is read from its output afterwards, and "which mechanism ran this" is not recoverable later;
- a silent fallback and a successful bind look identical in the result;
- the announcement is what makes a vendor-side change visible on the first run after it happens, instead of on the first anomaly it causes.

The same line goes to the run's audit, where the capability has one.

### 4. Degrade — fail-closed

When no realization binds, take the **next tier down**, and record the reason in the audit alongside the announcement. Two rules hold at every tier:

- **The invariant survives the degradation.** A tier exists because it preserves the property the capability is *for* by another means. A "degradation" that drops the property is a defect: for fan-out, an orchestrator that iterates several items inside one context is that defect, not a lower tier.
- **Unknown is not available.** An unrecognised probe result, an unparseable response, an unexpected namespace: all read as *absent*. The mechanism is bound only on positive evidence.

## The surface map is data

Every vendor-specific name — tool handles, namespaces, config keys, their defaults — lives in **one declarative structure**, never as conditionals spread through the skill's logic. The test of the rule is mechanical: a vendor rename must be an edit to that structure and nothing else, and a search for any vendor handle outside it must return nothing.

Each entry states, at minimum:

| Field | What it holds |
| --- | --- |
| Realization id | The name the skill binds and announces |
| Tier | Its position in the capability's preference order |
| Dispatch shape | How much of the work the mechanism takes — see [below](#the-dispatch-shape-decides-what-the-caller-owns) |
| Handles | The primitives to probe, and what each one does in the capability's own vocabulary |
| Namespace | Where the handles live, when the harness namespaces them |
| Gating keys | The config that turns the mechanism on, and whether it is on by default |
| Bounding keys | Concurrency ceilings and timeout bounds the harness imposes |
| Verified against | Which product build the entry was read off, and when |

`Verified against` is not decoration: it is what tells the next maintainer whether a probe miss means "the vendor moved" or "this entry was always wrong". An entry nobody could verify is **not added to the map**: handles are what the cascade probes for, so an entry that cannot state a verified set of them has nothing to contribute, and its absence is the fail-closed answer — nothing binds, the cascade degrades. Do not park an unverified guess in the map with placeholder handles; a handle nobody observed is exactly the inadmissible evidence the probe rule exists to keep out.

**The map holds EVERY realization, the skill's own harness included.** Leaving that one out is the tempting omission — the session obviously has it — and it costs the whole convention: the `bind` a skill tells every session to run answers `degraded` for a session that then runs the mechanism anyway, so the announcement printed and audited is false, the degradation branch's stated condition ("the probe missed") is satisfied at the same moment as the in-harness branch, and the skill is back to routing on the product name it was written to stop reading. No realization is exempt from being probed.

### The dispatch shape decides what the caller owns

Realizations of one capability differ in more than a handle's name, and the difference the caller must know is **how much of the work the mechanism takes**. Two shapes cover what has been observed so far:

| Shape | Handles it requires | What the skill still owns |
| --- | --- | --- |
| The skill sequences | A start handle **and** a wait handle | The concurrency cap, the wait bounds, collecting each dispatch |
| The skill delegates | One handle the whole run is handed to | None of those — the delegated runtime schedules and waits |

The shape belongs to the entry and comes back in the binding, and **the caller branches on it, never on the harness's name**. Bounding keys belong only to entries of the first kind: declared on a delegated one, they would announce a bound nobody applies.

### The bind returns the bounds it read

A skill required to bound its waits, and rightly barred from naming vendor config keys in its own text, has no sanctioned way to learn the bound unless the bind hands it over. So it does: the resolved value where the probe reported one, and otherwise the keys to read it from. Anything less leaves the caller inventing a number, or omitting the argument and relying on a default nobody observed — step 1's inference, reappearing as a timeout.

## Ceilings compose, they never replace

Where a realization imposes its own limit (a concurrency ceiling, a maximum wait), the effective limit is the **minimum** of the harness's limit and every limit the project's policy already declares. The skill introduces **no limit of its own**, and reports which of the composed limits bound the result — a run capped by the harness and a run capped by policy are different situations for whoever reads the output.

## What this convention does not do

- **It does not decide the preference order.** The capability declares its own tiers; this file only says that they are taken in order, on positive evidence.
- **It does not introduce a policy parameter.** Selecting a realization is a mechanism decision. What to work on, and whether it may proceed, stay wherever the project's policy already puts them.
- **It does not add a store.** Whatever the bound realization writes — audit, checkpoint, result — it writes through the stores the capability already has.

## Per-skill delta (what stays in the skill, not here)

- The capability's **tiers**, in order, with what each one is.
- The **surface map** for that capability, or the pointer to where it lives.
- The **announcement line's** shape, in the skill's own output format.
- Which behaviour is the fail-closed floor when nothing binds.

See [graceful degradation](graceful-degradation.md) for the standard scenarios: a realization that does not bind is a *degradation of mechanism*, and the rule of thumb there still applies — degrade when a lower tier preserves the invariant, HALT when none does.
