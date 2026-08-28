# ADR: The unit a process profile configures is the STEP, never one of its representations

## Status

Accepted

## Date

2026-08-28

## Context

- Story #251 (epic #204) asks for a `process-profile` section in `way-of-working.md` with "a per-step whitelist of enabled how-to/skills", so a team adopting a subset of the process is never offered a step it does not run.
- That phrasing hides a modelling question, because a process step has **two representations** and pair ships both: a numbered **how-to guide** (`knowledge/how-to/`) — the manual path `AGENTS.md` sends a project with no skills installed down — and an **executable skill**. Whitelisting "how-to or skills" is choosing between the recipe and the stove.
- **The two sets do not coincide** (measured on the corpus at implementation time, 2026-08-28):

  | Representation                       | Count | The asymmetry                                                                 |
  | ------------------------------------ | ----- | ----------------------------------------------------------------------------- |
  | how-to guides                        | 9     | `brainstorm` has none (ADL 2026-07-28)                                        |
  | `process/*` skills                   | 10    | `define-subdomains` / `define-bounded-contexts` are **capabilities** (ADR-012) |

  Guides `04`/`05` were retired when ADR-012 turned DDD mapping from process skills into capabilities, so those two steps today have an executable form and **no** guide, while `brainstorm` has a skill and **no** guide.
- The flagship case for the whole feature — the `poc` profile that never proposes DDD mapping (epic #204's own acceptance) — lives **exactly** in the asymmetric part. Keying the whitelist on process skills makes it inexpressible; keying it on how-to guides leaves `brainstorm` ungovernable.
- A second question rides along: the corpus already has three lists that can drift (the skills tree, the how-to directory, and now a configuration surface). A third list nobody compares to the first two is a defect generator, not a feature.

## Options Considered

### Option 1: Whitelist skill names

- **Description**: `whitelist: [refine-story, implement, review]` naming `process/*` skills.
- **Pros**: One obvious list; nothing new to author.
- **Cons**: Fails the feature's headline case — the DDD-mapping steps are capabilities, and putting `map-subdomains` in a list of "process skills" makes the boundary "which capabilities are steps?" implicit and unanswerable. Also leaves a skill-less project (the manual how-to path) entirely ungoverned, which contradicts the story's AC8.

### Option 2: Whitelist how-to guide filenames

- **Description**: `whitelist: [08-how-to-refine-a-user-story.md, …]`.
- **Pros**: Governs the manual path natively; the files already exist.
- **Cons**: `brainstorm` has no guide, so discovery could never be disabled; DDD mapping has no guide either, so the headline case fails again. Also couples configuration to filenames that carry a numbering the project renumbers.

### Option 3: A step catalogue, with both representations attached (chosen)

- **Description**: A KB file gives every step a **stable id** and attaches its representations as **nullable** fields — `how-to` and `executable`, either of which may be `—`. The profile whitelists step ids. Prerequisites are declared per step as an **any-of** list.
- **Pros**: The three asymmetries become **rows**, not conditionals in `/pair-next` and in twelve skills. Both execution paths (skills, manual how-to) are governed by one configuration. The catalogue is also the **boundary**: a capability absent from it (`/pair-capability-estimate`, `/pair-capability-classify`, `/pair-capability-verify-quality`) is provably not a step, so "is this governed?" has a lookup answer instead of a judgement.
- **Cons**: A third list to keep in step with the corpus — mitigated, not accepted: `skills:conformance` binds it **bidirectionally** (every how-to guide and every `process/*` skill must appear in a row; every row's representations must resolve) and each executable declares its own step id inline (`<!-- process-step: id=… -->`), so a skill and the catalogue cannot disagree about which step the skill is.

## Decision

**The unit of configuration is the step.** A process profile whitelists step ids from the [step catalogue](../../../knowledge/guidelines/technical-standards/ai-development/step-catalogue.md); the catalogue attaches the how-to guide and the executable to each step, either of which may be absent. Neither representation is ever the unit.

Three consequences are part of the decision, not incidental:

1. **The asymmetries are declared data.** `define-subdomains` / `define-bounded-contexts` (executable = capability, no guide) and `brainstorm` (skill, no guide) are catalogue rows. A step whose only representation is absent is declared unreachable rather than proposed.
2. **Prerequisites are an any-of**, satisfied when the list is empty or **at least one** member is enabled. This is the corpus's real shape, not a generalisation: `brainstorm` and the strategic chain are alternative producers of the same input, so `plan-stories` requires `plan-epics` **or** `brainstorm`. An all-of would make the shipped `poc` profile — which drops strategic planning and keeps discovery — permanently self-inconsistent, and the inconsistency report would fire on the KB's own profile.
3. **The catalogue is the scope boundary.** A capability that is not a step is outside the profile entirely; a whitelist naming an id the catalogue does not have HALTs.

The profile itself lives **only** in `way-of-working.md` (D19); the KB owns the schema, the built-in profiles and the catalogue. An absent section means `default` — the full process, byte for byte (D21).

## Consequences

### Benefits

- Epic #204's `poc` requirement is expressible and enforced end to end: `/pair-next` drops the strategic rows, and no DDD-mapping step is reachable from it.
- A project with **no skills installed** gets the same governance through the how-to path, with no second configuration surface.
- The "is X governed by the profile?" question is answered by a lookup, and drift between the catalogue and the corpus is a gate failure rather than a review finding.
- Twelve skills carry a one-line delta pointing at one convention; the profile's semantics are edited in one place.

### Trade-offs and Limitations

- The catalogue must be authored and maintained. The bidirectional conformance check makes forgetting it fail loudly, but adding a `process/*` skill now costs a catalogue row.
- Step ids are a **public configuration vocabulary**: renaming one is a breaking change to every adopter's `way-of-working.md`, so ids are deliberately independent of both skill names and guide filenames (`define-subdomains`, not `map-subdomains`).
- The any-of prerequisite model cannot express "needs both A and B". No step needs it today; a step that does would need the model widened, and widening it must keep `poc` closed.
- Selecting a profile per invocation (a `/pair-next` argument) is deliberately out of scope — the profile is a property of the project.

## Adoption Impact

- `adoption/tech/way-of-working.md` — a `## Process Profile` section is added (nothing declared: pair runs the full process, so `default` applies), and the shipped template documents the section's shape.
- No other adoption file changes: the catalogue, the schema and the built-in profiles are **knowledge**, not adoption (D19) — they live under `knowledge/guidelines/technical-standards/ai-development/`.
