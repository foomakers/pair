# ADR-033: One telemetry file per workflow run

## Status

Accepted

## Date

2026-11-21

## Context

- Story #697 (epic #641). A workflow run (`pair run <workflow>`, ADR-031) keeps everything it produces in its run directory: state, step results, logs.
- ADR-029 gave the delivery cycle one shared, append-only file, `.pair/working/telemetry/records.jsonl`, and rejected per-run files because they split a card's history.
- The workflows package reads and writes only the run directory it is given. It launches no process and knows no path outside it (ADR-031).
- The delivery cycle and its telemetry are deleted by #700 and #710. Until then both paths exist.

## Options Considered

1. Append workflow records to the ADR-029 file — one history per card; the package must write outside the run directory, and the records need the cycle's keys (`phase`, `block`, `round`, `group`), which a workflow does not have.
2. One `telemetry.jsonl` per run, in the run directory, with its own versioned shape — chosen.
3. Both: per-run file and a copy in the shared file — two writers to keep equal.

## Decision

- A workflow run with telemetry on writes `telemetry.jsonl` in its run directory. Two record types: `step` (one per execution of a step) and `run` (one closing record, the last line).
- Every record carries a schema number. The initial schema was `1`. Incompatible changes raise the number. The analysis script refuses schema numbers it cannot read. [ADR-037](adr-037-workflow-escalation.md) records the later additive fields in schema `2`.
- The format is independent of ADR-029: no shared keys are required, no record is written to `.pair/working/telemetry/records.jsonl`. ADR-029 stays in force for the delivery cycle only, until #700 removes it.
- A card's history across runs is a read concern: the analysis script (`pair-capability-analyze-workflow-runs`) reads the run directories it is given. A restarted run starts an empty file; the archived run keeps its own.
- Tokens hold `read`, `cached`, `written`, each with `source` `measured`, `estimated` or `unknown`. Sums never count `unknown` as zero.
- Allow-listed fields only, as in ADR-029: no card text, prompts or secrets.

## Consequences

### Benefits

- The package keeps one boundary: the run directory. Deleting a run deletes its telemetry.
- No concurrent writers on one file when several runs execute in parallel (#678).

### Trade-offs and Limitations

- Two telemetry formats exist until #700. Reports of the old cycle and of workflow runs are not comparable record by record.
- A view across runs or machines needs a reader that collects the files; none is built here.

## Adoption Impact

- `workflow-telemetry.md` documents the records and the `schema` field.
- ADR-029 is not superseded; #700 supersedes it when the delivery cycle is deleted.
