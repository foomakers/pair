# ADR-031: The `workflows` package and its hosts

## Status

Accepted

## Date

2026-11-20

## Context

Epic #641 describes a process as a YAML file of typed steps instead of fixing it in code. Story #652 delivers the first slice: a linear workflow run with `pair-cli run <workflow> --card <id>`. Today the delivery cycle lives in `apps/pair-cli` and in the cycle scripts: process rules, process launch, git and PM access share modules, so a second host (an in-session skill, a batch) would have to copy the rules.

## Options Considered

### Option 1: Add the workflow interpreter to `apps/pair-cli`

- **Description**: New modules under `commands/run`, beside the cycle.
- **Pros**: No new package.
- **Cons**: Nothing stops the interpreter from importing launch, git or PM code; a second host cannot reuse it.

### Option 2: A pure package with one interpreter, hosts outside it

- **Description**: `packages/workflows` (`@pair/workflows`) holds grammar, validator, kinds, engine and dispatch. A host launches agents and owns the worktree and the console.
- **Pros**: One interpreter for every host; the rules are testable with no process, git or network.
- **Cons**: The host passes in what the package may not read itself (installed skills, gate keys, the disk).

## Decision

Choose option 2.

- **Boundary.** `apps/pair-cli` depends on `@pair/workflows`, never the reverse. The package launches no process, uses no git and calls no PM tool. `src/boundary.test.ts` holds an allow-list of imports (`yaml`, `node:crypto`, `node:path`, the package's own modules) and fails on anything else.
- **Disk as a port.** The package imports no `fs`. The engine takes a `RunFiles` port, a structural subset of the host's `FileSystemService`, and touches only the run directory through it. This keeps the direct-fs inventory (US-621) unchanged and lets tests run on an in-memory double. It departs from the design's `next(runDir)` signature in one point: the functions take `{ files, dir }`.
- **One interpreter, `next` / `record`.** `start` freezes the workflow and writes `state.json`; `next` returns the step to launch and marks it `running`; `record` validates and stores a result. `state.json` is the only source for `next` and is written through a temp file then a rename. The host loop is `next` → launch → `record` until the run is `done`, `failed` or `parked`; the package ships that loop (`runSteps`) over the `WorkflowHost` interface.
- **One validator.** `validate(text, file, deps)` checks form and coherence. `pair-cli run <workflow>` calls it before any launch and for `--dry-run`; later hosts call the same function. There is no `pair workflow` command.
- **Host of this story.** `apps/pair-cli/src/commands/run/workflow-host.ts`, selected only by a workflow name as positional argument. It reuses the engine map, the agent launch, the stream reader, the timeouts, the run lock, the interrupt handling, the console renderer, the prompt-safety check and the cycle's worktree mechanism. `pair-cli run --card <id>` with no workflow name is the old cycle, unchanged.
- **Settings per step.** The host asks the package for the settings of a step through `settingsOf`, which returns the run's settings for every step until #672.
- **Step ids.** A step id matches `^[a-z][a-z0-9-]*$`: it names a directory of the run, and the pattern keeps file order (no integer-like keys).

### Workflow and skill responsibilities (2026-11-23)

- **Workflow.** Resolve the declared step, dispatch it in an independent session, pass inputs and durable context, validate and record its result, and route according to the workflow definition. Run-level state, locks, timeouts and telemetry are execution infrastructure. Conditions, failure routing and bounded loops remain explicit in the workflow.
- **Step.** The selected skill owns how the step works, which work items it must process, its local checks, and how it determines its outcome. Deterministic steps may execute through their own handlers with the same input and result boundary. The scheduler must not embed their policy or silently add retries based on step-specific results.
- **Invocation parity.** The `implement` step executes `pair-process-implement` with the same behavior as a direct invocation given the same inputs, context and interaction mode. The invocation may declare unattended mode and the handoff boundary. Their meaning belongs to the skill. Dispatch prompts must not override the procedure, confirmations, or checks of the selected skill.
- **Completion.** A step tracks and accounts for all in-scope work. It continues independent work after an item fails or requires a person, respects dependencies, and reports why any remaining item cannot run. The step decides its outcome after processing all available work. An interruption or a prerequisite that prevents the step from starting is reported separately from successful completion.

### Shared host adapters (2026-11-25)

The interpreter boundary applies to the `@pair/workflows` root entry and its core modules. Separate host entry points share worktree preparation through the existing Git bridge and lock the run directory through the existing PID-based lock. The import guard enforces the direction from host adapters to interpreter. Step state can record the host and the model used for execution independently of telemetry. [Technical design and acceptance criteria for #696](https://github.com/foomakers/pair/issues/696#issuecomment-7039644396).

Both hosts resolve implicit step skills through the installer's recorded names and targets in `.pair/.skill-name-map.json`. A one-off installer configuration can change either value. Older manifests supply names only. Both hosts look up those names in the configured targets. A project using an older single-use install override can declare that target in `pair.config.json` or rerun the update with its install configuration. Installations without a manifest use the configured layout. Explicit workflow skill names use the project registry literally.

The standalone session commands open the same run directory as `pair run`. Each open returns a token for a one-hour idle lease in `run.lock`. A command claims the lease with its live PID and renews it when it exits. Calling `next` during a long step renews the lease and returns the outstanding packet with the same attempt. `stop` releases the lease. A new owner on the same machine can take over after the idle lease expires or the active PID dies. It gets a new token and reopens the interrupted step from the frozen run. A host on another machine keeps its ownership.

## Consequences

### Benefits

- A second host reuses grammar, validation, state and result handling as they are.
- Process rules are covered by unit tests that run in milliseconds.
- The boundary is enforced by a test, not by review.

### Trade-offs and Limitations

- Two paths exist under `pair-cli run` until the old cycle is removed (#700).
- The host injects skills, gate keys, the safety check and the disk: more wiring than a direct read.
- The run lock stays in the host: the package trusts the host to run one process per run directory.

## Supersedes later

- ADR-021 (fan-out, three realizations) and the cycle's own state scripts, when the old path is deleted in #700. Nothing is superseded by this story.

## Adoption Impact

- `adoption/tech/architecture.md` names the package, its boundary and its host.
- `adoption/tech/tech-stack.md`: `yaml` becomes a runtime dependency of `@pair/workflows`.
- `adoption/tech/risk-matrix.md`: `packages/workflows | Low`.
