# ADR-032: Step kinds, contracts and result collection

## Status

Accepted

## Date

2026-11-20

## Context

A workflow step runs a skill in a fresh agent process. The engine needs to know what each step receives, which options it accepts and what it returned, without parsing free text and without changing the skills. Story #652 ships three kinds: `implement`, `review`, `generic`.

## Options Considered

### Option 1: A wrapper skill per kind

- **Description**: Each kind has its own skill that calls the process skill and formats the result.
- **Pros**: The result format lives in a skill.
- **Cons**: One more skill per kind to install and keep in step; `uses` could not point at any skill.

### Option 2: A contract object per kind, the result asked for in the launch message

- **Description**: A kind is data: default skill, inputs, outputs, options, escalations. The launch message ends with a block generated from that data, asking for one JSON object.
- **Pros**: Skills stay as they are; any skill can be a step; the contract, the message and the reference page share one source.
- **Cons**: A skill may ignore the block; the step then fails.

## Decision

Choose option 2.

- **Contract.** `StepKind` = `name`, `defaultUses`, `inputs`, `outputs`, `with` (JSON Schema objects) and `escalations`. One file per kind in `packages/workflows/src/kinds`.
- **Common result.** Every step returns `status` (`ok`, `failed`, `needs-human`), `summary` and optionally `reason`. A kind's outputs are required only when `status` is `ok`.
- **Inputs.** An input is a launch argument (`--card`) or an output of an earlier step with the same name. The validator refuses a workflow in which an input is neither. A `generic` step receives every scalar produced so far.
- **Launch message.** `buildMessage` writes the skill invocation in the engine's style (a parameter: the package holds no engine table), the inputs, the `with` values, then the fixed result block. Every spliced value passes the host's prompt-safety check; a value that fails it fails the step with `unsafe-value` before any launch.
- **Result collection.** `readResult` takes the last fenced `json` block of the agent's final message and validates it against the common fields and the kind's outputs. Missing or invalid: the step is `failed`, reason `invalid-result`, with the field and the violation. An agent that died or timed out: `failed`, reason `no-result`. No automatic re-ask.
- **One schema validator.** The grammar, the `with` options and the results are checked by one small validator over the JSON Schema subset the package uses. No validator dependency is added.
- **Gate keys.** The Custom Gate Registry in `way-of-working.md` gains a unique `Key` column. `implement` takes `with.gates`, a list of those keys; the validator refuses an unknown key. The `gate` kind (#680) will use the same keys.
- **Kind reference.** `workflow-kinds.md` is generated from the kind objects (`pnpm --filter @pair/workflows kinds:reference`); a test fails when the published page differs.

**Scope clarification (2026-11-23).** Kind contracts describe invocation, data and result validation. The selected skill owns step procedure and completion, as specified in [ADR-031](adr-031-workflows-package-and-hosts.md#workflow-and-skill-responsibilities-2026-11-23). The launch message may pass an interaction mode and handoff boundary. Step-specific escalation policy, task instructions and quality execution belong to the step implementation.

## Consequences

### Benefits

- A new kind is one data file; the message, the validation and the reference follow.
- A result is typed and validated before any later step reads it.
- No skill is modified and no wrapper skill is installed.

### Trade-offs and Limitations

- A skill that does not end with the JSON block fails its step (`invalid-result`); the fake-skill tests cover each kind.
- The schema validator covers a subset (no `$ref`, `oneOf`, formats); a kind that needs more needs a real validator.
- A registry with no `Key` column has no keys: a workflow that names a gate is refused until the column is filled.

## Supersedes later

- The cycle's per-stage final-result parsing (`StageFinalResult`) and its handoff envelopes, when the old path is deleted in #700. Nothing is superseded by this story.

## Adoption Impact

- `adoption/tech/way-of-working.md`: the Custom Gate Registry has a `Key` column (`quality-gate`, `smoke-tests`, `e2e-tests`).
- The dataset template of `way-of-working.md` and the registry schema in `quality-gates.md` carry the same column.
