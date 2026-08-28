# Process Step Catalogue

The single list of the process **steps** a project can run, each with a stable id, its two possible representations, and its prerequisites. It is the data a [process profile](process-profiles.md) whitelists against, and the boundary that decides what a profile governs at all.

## The unit is the step, never its representation

A step has up to two representations, and they are two ways of doing the same thing:

- a **how-to guide** — the manual path, for a project with no skills installed;
- an **executable** — the same step made runnable, as a `process` skill or, for the DDD-mapping steps, as a `capability`.

Whitelisting a representation instead of the step looks equivalent and is not, because **the two sets do not coincide**:

| Representation                                | Count | Consequence of keying on it                                                                     |
| --------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------ |
| how-to guides (`knowledge/how-to/`)           | 9     | `brainstorm` has none — a profile could never disable discovery                                   |
| `process/*` skills                            | 10    | the DDD-mapping steps are **capabilities** — "a PoC never does DDD mapping" becomes inexpressible |

The second row is the decisive one: the flagship reason a profile exists is a PoC that skips domain mapping, and that case lives exactly in the asymmetric part. So the profile governs the **step**, and this catalogue is what ties the two representations to it.

## The Catalogue

`—` means the step has no representation of that kind. `Requires` is an **any-of**: satisfied when the list is empty, or when **at least one** listed step is enabled.

| Step id                   | How-to                                                                                                | Executable          | Requires (any-of)                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------- |
| `specify-prd`             | [`01-how-to-create-PRD.md`](../../../how-to/01-how-to-create-PRD.md)                                    | `/specify-prd`      | —                                  |
| `bootstrap`               | [`02-how-to-complete-bootstrap-checklist.md`](../../../how-to/02-how-to-complete-bootstrap-checklist.md) | `/bootstrap`        | `specify-prd`                      |
| `brainstorm`              | —                                                                                                       | `/brainstorm`       | —                                  |
| `plan-initiatives`        | [`03-how-to-create-and-prioritize-initiatives.md`](../../../how-to/03-how-to-create-and-prioritize-initiatives.md) | `/plan-initiatives` | `specify-prd`            |
| `define-subdomains`       | —                                                                                                       | `/map-subdomains`   | —                                  |
| `define-bounded-contexts` | —                                                                                                       | `/map-contexts`     | `define-subdomains`                |
| `plan-epics`              | [`06-how-to-breakdown-epics.md`](../../../how-to/06-how-to-breakdown-epics.md)                          | `/plan-epics`       | `plan-initiatives`, `brainstorm`   |
| `plan-stories`            | [`07-how-to-breakdown-user-stories.md`](../../../how-to/07-how-to-breakdown-user-stories.md)            | `/plan-stories`     | `plan-epics`, `brainstorm`         |
| `refine-story`            | [`08-how-to-refine-a-user-story.md`](../../../how-to/08-how-to-refine-a-user-story.md)                  | `/refine-story`     | `plan-stories`                     |
| `plan-tasks`              | [`09-how-to-create-tasks.md`](../../../how-to/09-how-to-create-tasks.md)                                | `/plan-tasks`       | `refine-story`                     |
| `implement`               | [`10-how-to-implement-a-task.md`](../../../how-to/10-how-to-implement-a-task.md)                        | `/implement`        | `plan-tasks`                       |
| `review`                  | [`11-how-to-code-review.md`](../../../how-to/11-how-to-code-review.md)                                  | `/review`           | `implement`                        |

## The three asymmetric steps, as declared data

Every asymmetry below is a cell in the table above — not a conditional in `/next` and not a special case in any skill. That is the whole point of the catalogue: the same three facts handled as logic would be three branches to keep in step across `/next` and twelve step skills.

- **`define-subdomains` / `define-bounded-contexts`** — how-to guides `04` and `05` were **retired**; the executable form of both is a capability, not a `process` skill. They are still steps: a project decides whether it does DDD mapping, and that is a process decision.
- **`brainstorm`** — a `process` skill with **no** how-to guide. On a project running the manual path it is therefore **unreachable**: no representation exists, so no path can propose it. Readers of this catalogue must treat a step whose only representation is absent as not proposable, rather than pointing at a guide that does not exist.

## Why `Requires` is an any-of

`brainstorm` and the strategic chain are **alternative producers of the same input**: a story tree reaches `plan-stories` either from `plan-epics` or from a discovery run. An all-of would make the shipped `poc` profile — which drops strategic planning and keeps discovery — permanently self-inconsistent, and the inconsistency report ([`process-profiles.md`](process-profiles.md)) would fire on the KB's own profile. One rule, uniformly applied: a single-element list is just an any-of with one member.

## What this catalogue does NOT govern

A capability that is **not a step** is outside the profile entirely. The profile configures the process a team runs, not every tool a skill may reach for:

| Capability                    | Why it is never a step                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `/estimate`, `/classify`      | Composed inside a step (refinement); a team does not "decide not to size stories" as a phase |
| `/verify-quality`, `/verify-done` | Quality mechanics that apply to whatever process runs                                    |
| `/record-decision`, `/write-issue` | Writers composed by steps; disabling one would break every step that composes it        |
| `/next`, `/loop`              | Navigators — they READ the profile, they are not governed by it                              |

The boundary is the table, not a judgement call: if an id is not in **The Catalogue**, a whitelist naming it HALTs.

## Drift is a gate failure, not a review finding

`skills:conformance` binds this file to the corpus in both directions — every how-to guide and every `process/*` skill must appear in a row, and every row's representations must resolve. Each executable additionally declares its own step id inline:

```text
<!-- process-step: id=refine-story -->
```

so a skill and the catalogue cannot disagree about which step the skill is. Adding a process skill without a row here fails the gate.
