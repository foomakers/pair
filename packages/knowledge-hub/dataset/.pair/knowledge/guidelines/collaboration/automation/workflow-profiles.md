# Workflow Profiles — engine, model, effort and context per delivery-cycle stage

A **workflow profile** declares which engine, model, effort level and context policy each stage of the delivery cycle (`prepare`, `validate`, `implement`, `green`, `verify`, `contract`, `merge`) uses — so `prepare`/`green` can run on a cheap model with a resumed session while `validate`/`verify` run on a frontier one with a fresh session, without touching any skill or script.

It is consumed by both realizations of the cycle through **one** resolver, `workflow-profile.mjs` (shipped beside `pair-workflow-cycle`'s scripts): the in-session coordinator runs it, and `pair-cli run --card` spawns it. Neither reimplements the cascade, the validation or the model-class lookup.

Profiles are **adoption content**, and read-only configuration: the KB ships the schema and an example, never a profile file for your project. A `prepare`/`validate` entry applies to remediation rounds only — a fresh card runs `implement` and `verify` first (#506), so a profile must not assume every stage runs on every card.

## Zero-configuration path — stated first, on purpose

No `pair.config.json`, no `workflowProfiles` block, no `--profile` / `--workflow-config` ⇒ the **KB default**: the schema-default engine and model, default effort, a `fresh` context on every stage. Nothing is resolved, nothing is written, and the cycle runs exactly as it did before profiles existed. The coordinator says so in one line (`Profile: KB default (source: KB default)`).

## Where profiles live

`pair.config.json` is the resolution root:

```json
{
  "workflowProfiles": {
    "default": "cheap-green",
    "files": ".pair/adoption/tech/workflow-profiles/*.json",
    "inline": { "quick": { "name": "quick", "defaults": { "effort": "low" } } }
  }
}
```

- **`default`** — the profile name used when nothing is passed.
- **`files`** — a glob or an array of globs (project-relative; `*` inside a segment, `**` as a whole segment; never above the project root). Each file is one profile, **indexed by its own `name`**, never by its filename.
- **`inline`** — profiles declared directly, keyed by name, for a project that wants no extra file.
- Anything else under `workflowProfiles` is `profile-invalid`.

## Profile shape

```json
{
  "name": "cheap-green",
  "defaults": { "engine": "claude", "model": "by-tier", "effort": "medium", "context": "fresh" },
  "modelClasses": { "cheap": "claude-haiku-x", "balanced": "claude-sonnet-x", "frontier": "claude-opus-x" },
  "stages": {
    "prepare": { "model": "cheap", "context": "reuse" },
    "validate": { "model": "frontier" },
    "green": { "model": "cheap", "context": "reuse" },
    "verify": { "model": "frontier", "effort": "high" }
  }
}
```

| Field | Values |
| --- | --- |
| `name` | non-empty string (required) |
| `defaults` / `stages.<stage>` | `engine`, `model`, `effort`, `context` — every field optional; a stage entry overrides **only** the fields it declares, then `defaults`, then the KB default |
| `engine` | `default` (the run's own engine) or a supported engine id (`pi`, `opencode`, `claude`, `codex`) — honoured by `pair-cli`; in-session the session's harness is the engine |
| `model` | `default` (the engine's own), an explicit model id, a class (`cheap` \| `balanced` \| `frontier`), or `by-tier` |
| `effort` | `default`, `low`, `medium`, `high`, `xhigh`, `max` |
| `context` | `fresh` \| `reuse` |
| `modelClasses` | optional map class → concrete model id, so a class resolves to an id without the KB naming vendors |
| `description` | optional free text |

Anything else — an unknown top-level key, an unknown stage (`verfy`), an unknown stage field — is `profile-invalid`, naming it. Fail-closed.

### `context` is validated against the cycle's transition table

`reuse` resumes the previous subagent of the same role, and `cycle-state.mjs` alone decides where that is allowed (`prepare→prepare`, `implement→green`, `green→green`). A stage entry asking `reuse` into any other stage — `validate` and `verify` above all, whose value is an independent verifier — is rejected **at load** as `profile-invalid`, never accepted and silently overridden at dispatch. A `defaults.context: reuse` is not an error: it applies only where the table admits it. The profile becomes the `contextPolicy` `resolve` is given, which contains only admissible transitions.

### Model classes

`model` may be an explicit id, a class, or `by-tier`. A class resolves through the profile's own `modelClasses`; `by-tier` reads the card's `risk:*` label, maps it to a class through [`## Model Policy`](automation-policy.md) (`risk:yellow: balanced`) and then to an id — the same convention `/pair-capability-setup-harness` reads, no second taxonomy. The resolution line names the class, the tier and the concrete id. No `## Model Policy`, an untagged card, a tier the policy omits, or a class the profile gives no id ⇒ the engine's own default, never a HALT.

## Resolution cascade — once per run

1. `--workflow-config <path>` (`$workflowConfig` in the skill): an external file, **used verbatim**, wins over everything. Missing ⇒ `profile-unresolved`; malformed JSON ⇒ `profile-invalid` with the parse error.
2. `--profile <name>` (`$profile`): looked up in `files` / `inline`. Source `argument`.
3. `workflowProfiles.default`. Source `pair.config.json`.
4. The KB default. Source `KB default`.

`inline` beats a `files` profile of the same name, and says so. Two `files` declaring the same `name` ⇒ `profile-name-collision`, naming both paths. An unresolvable name ⇒ `profile-unresolved`, naming the sources searched — **never** a silent fall back to the KB default: a typo in `--profile` must not quietly run the whole cycle on the wrong model.

The profile is resolved **once**, before the first dispatch, and its table is printed once (profile, source, hash, then every stage with each field's value and the level that decided it). It is never re-resolved mid-cycle.

## Audit, not input

The resolved profile's **name and content hash** are recorded in every handoff (`workflowProfile`) via the run directory's `.workflow-profile.json`. They are **excluded from the effective-inputs digest**, exactly like the fix-round budget: swapping the profile between invocations invalidates no evidence and triggers no re-validation.

## What each realization applies

| | `pair-cli run --card` | in-session (`pair-workflow-cycle`) |
| --- | --- | --- |
| `engine` | spawns that engine for the stage (proven installed before the first dispatch) | reported only — the session is the engine |
| `model` | passed under the engine's model flag | applied to the dispatch primitive's model parameter where it has one |
| `effort` | passed only to an engine declaring an effort flag (none does yet — recorded and printed, not sent) | the packet's `--profile` effort: enforced for Codex, a prompt request for Claude |
| `context` | `reuse` is reported and run fresh (the driver spawns a new process per stage) | honoured as `next.context` |

## Example

The `cheap-green` profile above is the shipped example: `prepare`/`green` on a cheap model with a resumed session, `validate`/`verify` on a frontier model, fresh. Copy it to `.pair/adoption/tech/workflow-profiles/cheap-green.json`, replace the ids in `modelClasses`, and set `"workflowProfiles": { "default": "cheap-green", "files": ".pair/adoption/tech/workflow-profiles/*.json" }` in `pair.config.json`.

## Refusals

| HALT | When |
| --- | --- |
| `profile-unresolved` | a requested name (or `--workflow-config` path) matches no source |
| `profile-invalid` | unknown key/stage/field, bad value, forbidden `reuse`, malformed JSON, unknown stage engine |
| `profile-name-collision` | two files declare the same `name` |

`--profile` / `--workflow-config` apply only to a card that enters the delivery cycle; on a card routed to a mapped workflow or a preparation skill they are refused, never silently ignored.
