# Process Profiles

A **process profile** declares which of the [catalogued process steps](step-catalogue.md) a project runs. A team adopting a subset of the process configures it once, in adoption, and no disabled step is ever proposed — by `/pair-next`, by a skill, or by the how-to path a project with **no skills installed** follows.

The KB owns the **schema**, the **built-in profiles** and the **step catalogue**. The profile itself lives **only** in the project's `way-of-working.md`, in a `## Process Profile` section (D19) — nothing here is per-project, and nothing per-project is here.

## Schema

The section carries two keys, in the same shape as the file's other optional sections:

```text
## Process Profile

- `profile`: `poc`
```

```text
## Process Profile

- `profile`: `custom`
- `whitelist`: `specify-prd`, `plan-initiatives`, `plan-epics`, `plan-stories`, `refine-story`, `plan-tasks`, `implement`, `review`
```

| Key         | Values                        | Meaning                                                                          |
| ----------- | ----------------------------- | ---------------------------------------------------------------------------------- |
| `profile`   | `default` \| `poc` \| `custom` | Which step set is in force.                                                        |
| `whitelist` | catalogue step ids            | The enabled steps. **Required with `custom`, and invalid with anything else.**     |

Both keys are **backticked list items, and so are their values** — copy a fenced example above verbatim, not the bare key spellings the table uses. The reader detects a key **loosely** (a bolded or unbackticked key is still a declaration) and accepts its value **strictly**: that split is what makes a mis-shaped line a HALT instead of a silent `default`.

**An absent `## Process Profile` section means `default`** — the full process, today's behaviour byte for byte. This is convention over configuration (D21): a project that runs everything configures nothing, and adding this feature changes no existing project's behaviour.

## Built-in Profiles

| Profile   | Enabled steps                                                                                                       |
| --------- | --------------------------------------------------------------------------------------------------------------------- |
| `default` | `*` — every step in the catalogue                                                                                     |
| `poc`     | `specify-prd`, `bootstrap`, `brainstorm`, `plan-stories`, `refine-story`, `plan-tasks`, `implement`, `review`          |

`poc` is the "we are proving something works" subset: **no DDD mapping** (`define-subdomains`, `define-bounded-contexts`) and **no strategic planning layer** (`plan-initiatives`, `plan-epics`) — stories come from discovery instead. It is a subset of the process, not a different one: the **guidelines still apply** to the code produced (testing, security, code design, the quality gates), because those are not steps and are not governed here.

`custom` names its own steps. It is not "a third built-in": it is the escape hatch for a subset neither built-in expresses.

## Error cases — all normative, none inferred

A profile misread does not surface as an error a user sees; it silently removes a step from every suggestion, which looks exactly like that step not being due yet. Every case below therefore **HALTs** rather than narrowing quietly.

| Case                                        | Outcome                                                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Unknown profile name** (`profile: pocc`)  | **HALT**, listing the known profiles (`default`, `poc`, `custom`).                                              |
| **Unknown step id** in a whitelist          | **HALT**, listing the valid ids from the catalogue.                                                             |
| **`custom` with no `whitelist` key**        | **HALT** — `custom` requires one. A *different* message from the row below: "you wrote none" is not "you wrote an empty one", and one message sends the reader hunting for a line their file does not have. |
| **Empty custom whitelist**                  | **HALT** — read as a **misconfiguration**, never as "everything disabled".                                      |
| **A key in a shape the reader rejects** (`- profile: poc`, value unbackticked) | **HALT**, restating the schema shape. Detection of the key is loose (bold, missing backticks); acceptance of the VALUE is strict — otherwise an unreadable line resolves to `default` and **widens** the profile to the whole process, silently. |
| **`whitelist` under `default` / `poc`**     | **HALT** — a built-in carries its own set, so the whitelist would be silently ignored.                          |
| **`whitelist` with no `profile`**           | **HALT** — a whitelist only applies to `profile: custom`.                                                        |
| **Enabled step, all prerequisites disabled** | **Reported, not fatal**: flag the inconsistency with the **minimal fix**, never silently repaired.              |

The first two are deliberately **two different messages**. A typo in a step id and a profile name that does not exist are **not the same mistake** — one is "you meant a step that exists", the other is "you meant a profile that does not" — and a single generic message would send the reader looking in the wrong file.

The last row is the one non-HALT: the configuration is readable, so the run continues and reports, e.g.

```text
`plan-stories` is enabled but none of its prerequisites are — minimal fix: enable
`plan-epics` or `brainstorm`, or drop `plan-stories`
```

Prerequisites are an **any-of** ([why](step-catalogue.md#why-requires-is-an-any-of)): satisfied when at least one listed step is enabled.

## Who reads the profile

| Reader                                | What it does with it                                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `/pair-next`                               | Never proposes a disabled step; reports the HALTs above and the prerequisite inconsistency.                             |
| A step skill invoked **directly**     | Warns and asks for confirmation before proceeding — the [process-profile gate](skill-conventions/process-profile-gate.md). |
| A step skill reached by **composition** | Nothing to ask: it degrades exactly as a skill that is **not installed**. See the same convention.                      |
| A human following the **how-to** path | Reads the same profile: the catalogue maps each step to its how-to guide, so a project with **no skills installed** is governed identically (there is no second configuration for the manual path). |

The profile is **re-read every run**, never cached — an edit to `way-of-working.md` takes effect on the next invocation.

## Out of scope

Selecting a profile through a `/pair-next` argument is a **future extension**. Today the profile is a property of the project, declared once in adoption, not a per-invocation switch.
