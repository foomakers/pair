# DDR: "Supervisor" names the workflow's escalation agent

## Status

Accepted

## Date

2026-11-23

## Context

- Subdomain Collaborative Workflow. The glossary used "Supervisore (Supervisor)" for the autonomy model (G10, D9). Brainstorm #704 + #737 introduces an agent declared in a workflow under the `supervisor` key.
- **Hard to reverse**: `supervisor` becomes a workflow grammar key, a CLI-visible concept and a dataset workflow name; renaming it later breaks user workflow files.
- **Surprising without context**: a reader of G10/D9 would take "supervisor" for the autonomy model, not for an agent in a run.
- **Real trade-off**: keeping the old meaning and naming the agent otherwise ("guardian", "escalation agent") was rejected: "supervisor" is the name maintainers use and the old meaning is a model, better named as such.

## Decision

- **Supervisor**: an agent a workflow declares as its first escalation level; it talks only to the host over MCP, reaches a human only through the host, and never approves, merges or skips a review, gate or approval.
- The former meaning is renamed **Supervision model** (G10, D9).
- Escalation is an approval step, a step's `escalate` (#728), or the Supervisor when declared.

## Consequences

### Benefits

- One meaning per term; #737 and its watch-mode sibling use "Supervisor" without ambiguity.

### Trade-offs and Limitations

- Older docs citing "Supervisore" for G10/D9 read as the Supervision model.

## Context Map Impact

`adoption/product/subdomain/collaborative-workflow.context.md`: row "Supervisore (Supervisor)" renamed "Supervision model"; rows "Supervisor" and "Process fault" added; "Approval step" escalation sentence widened.
