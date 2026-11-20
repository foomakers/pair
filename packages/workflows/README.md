# @pair/workflows

Workflows described in YAML: a file of typed steps that `pair run <workflow>` executes in order. Used by [`@pair/pair-cli`](../../apps/pair-cli/README.md), which is its host.

The package launches no process, uses no git and calls no PM tool: a host does. `src/boundary.test.ts` fails on an import that breaks this.

## Modules

| Module      | Content                                                                    |
| ----------- | -------------------------------------------------------------------------- |
| `grammar/`  | JSON Schema of grammar v1, strict YAML parse, errors with file, line, fix  |
| `kinds/`    | `StepKind` contract, one file per kind, the gate registry reader           |
| `validate/` | The one validator: form and coherence                                      |
| `engine/`   | `start`, `next`, `record`; `state.json` of the run directory               |
| `dispatch/` | The message for the agent, the result read back from its final message     |
| `host/`     | The interface a host implements, and the run loop over it                  |

Decisions: [ADR-031](../../.pair/adoption/tech/adr/adr-031-workflows-package-and-hosts.md), [ADR-032](../../.pair/adoption/tech/adr/adr-032-step-kinds-contracts-and-result-collection.md).
