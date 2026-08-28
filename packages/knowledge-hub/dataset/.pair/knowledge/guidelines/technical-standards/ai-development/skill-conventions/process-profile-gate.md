# Process-Profile Gate — Direct Invocation of a Disabled Step

A project may run a **subset** of the process, declared once in `way-of-working.md` as a [process profile](../process-profiles.md) over the [step catalogue](../step-catalogue.md). This convention is what a skill representing a step does when it is invoked while its step is **disabled** — written once here, referenced by a one-line pointer from each step skill, never re-implemented per skill.

There are exactly two ways to reach a disabled step, and they behave differently on purpose.

## Direct invocation — warn, then confirm

The user typed the skill's name. They asked for this step, and the profile says the project does not run it. Both facts matter, so the skill neither refuses nor proceeds silently:

1. **Check**: resolve the profile (absent `## Process Profile` section ⇒ `default` ⇒ every step enabled). Is this skill's step id in the enabled set?
2. **Skip**: enabled — or no section at all — ⇒ **proceed silently**. Nothing is printed, nothing is asked: behaviour is unchanged, byte for byte, from a project that has never heard of profiles. This is the overwhelmingly common path and it must stay free.
3. **Act**: disabled ⇒ warn and ask, before doing any work:

   > `<step-id>` is disabled by this project's process profile (`<profile>`, declared in `way-of-working.md`). Run it anyway?

4. **Verify**: confirmed ⇒ run the skill normally. Declined ⇒ stop, having changed nothing.

A profile is a **project convention, not a permission system**. Disabling a step says "we do not normally do this", not "you may not"; a gate that refused outright would make the profile a thing users work around instead of configure.

**Under an unattended run** (`$approval: auto`, for the skills that expose the signal — see [approval rounds](approval-rounds.md)) there is nobody to answer, and the two possible defaults are not equivalent: "proceed" runs a step the project declared it does not run, silently and repeatedly, while "stop" costs one reported HALT. So this round resolves to **`auto=halt`** — `kind=gate`, the judgement class the signal never suppresses. A profile is a project convention, but overriding one is a human's call, not an unattended default.

**HALT cases** ([schema](../process-profiles.md#error-cases--all-normative-none-inferred)) are not this gate: an unknown profile name, an unknown step id, an empty custom whitelist and a whitelist under a built-in profile stop the run and are reported — a typo must never resolve to "disabled" and then be waved through by a confirmation.

## Composition — degrade exactly as "not installed", never prompt

A composing step reaches this step because ITS algorithm composes it — `/refine-story` composing `/map-subdomains`, `/plan-tasks` composing `/map-contexts`. The user did not name it, so **there is no question to ask them**: a composed step that stopped to ask would make `/refine-story` under `poc` interrupt itself over a step the user never mentioned.

**The composing skill applies the check, before composing**, and treats a disabled step exactly as it already treats an optional composed skill that is **not installed** — scenario 3 of [graceful degradation](graceful-degradation.md): skip that step, note the gap in the output, continue. That reuses a degradation path the corpus already has and already exercises, rather than inventing a second one.

Two consequences worth stating, because both have been got wrong:

- **The composed skill's own gate never fires under composition.** It is written for the direct path; a composed invocation short-circuits it. A skill must not print the confirmation prompt above when it was composed.
- **A required composed step is not silently skipped.** The not-installed rule already distinguishes these: an **optional** composed step degrades, a **required** one HALTs. A profile that disables a step another enabled step requires is the prerequisite inconsistency `/next` reports with its minimal fix — a configuration error to fix in `way-of-working.md`, not something to resolve mid-run.

## What stays in the skill (the delta)

A `## Process Profile` section at the skill's invocation entry point, carrying its **declared step id** — the marker is the contract `skills:conformance` checks, and the sentence is what the executor reads. This is the block the corpus ships, quoted from `/refine-story` verbatim (a conformance test pins the two together, so this snippet cannot drift from the twelve deltas it governs):

```markdown
<!-- process-step: id=refine-story -->

Executable form of the **`refine-story`** step, and a composer of `define-subdomains`, `define-bounded-contexts`. A **direct** invocation while a step is disabled by the project's profile warns and asks for confirmation; a **composed** one never prompts — it degrades exactly as a step that is not installed. No section ⇒ no-op. See [process-profile gate](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/process-profile-gate.md).
```

Substitute the skill's own step id in the marker and in the sentence, and its own composed step ids (drop that clause when it composes none).

Nothing else is per-skill. The step ids, the profiles and the error cases all live in the two KB files this points at, so a change to the schema is one edit, not twelve.
