---
name: pair-capability-assess-observability
description: "Evaluates and recommends the observability strategy — monitoring, logging, tracing, alerting, telemetry — when the choice is open. Output-only: emits a proposal + target for /pair-capability-record-decision to persist."
version: 0.5.0
author: Foomakers
---

# /pair-capability-assess-observability — Observability Assessment

Evaluate and recommend the observability strategy: monitoring platform, logging approach, tracing, alerting, and dashboards. Follows the resolution cascade. **Output-only**: produces a proposal (rendered observability-section content + target) plus a report — writes no files. Persistence is delegated to `/pair-capability-record-decision`.

## Arguments

| Argument  | Required | Description                                                                          |
| --------- | -------- | ------------------------------------------------------------------------------------ |
| `$choice` | No       | Override: skip assessment, use this observability platform directly (e.g. `grafana`, `datadog`) |

## Composed Skills

**Output-only** — composes no skill, writes no files; the caller persists via `/pair-capability-record-decision` (see [Composition Interface](#composition-interface)).

## Proposal Target

The rendered adoption content is destined for this section — the caller writes it via `/pair-capability-record-decision`:

- **Target**: [adoption/tech/infrastructure.md](../../../.pair/adoption/tech/infrastructure.md) — **observability section only**
- **Ownership**: Observability section (shared file — /pair-capability-assess-infrastructure owns core sections)

## Algorithm

### Step 1: Resolution Cascade

Read [resolution cascade](../../../.pair/knowledge/skill-conventions/resolution-cascade.md) for the generic Path A/B/C mechanics (check → skip → act → verify).

- **Path A delta**: override argument is `$choice`. On confirm, proceed to Step 3.
- **Path B delta**: adoption check is [adoption/tech/infrastructure.md](../../../.pair/adoption/tech/infrastructure.md) — populated **observability** section. If a corresponding decision record is missing, report the gap (this skill still writes nothing; the caller persists a backfill via `/pair-capability-record-decision`).
- **Path C delta**: proceed to Step 2.

### Step 2: Read Guidelines

1. **Act**: Read observability guidelines:
   - [Observability README](../../../.pair/knowledge/guidelines/observability/README.md) — tool comparison, decision matrix, decision tree
   - [Observability Principles](../../../.pair/knowledge/guidelines/observability/observability-principles/README.md) — three pillars, proactive monitoring
   - [Observability Tools](../../../.pair/knowledge/guidelines/observability/observability-tools.md) — platform options
   - [Structured Logging](../../../.pair/knowledge/guidelines/observability/structured-logging/README.md) — logging standards
   - [Metrics](../../../.pair/knowledge/guidelines/observability/metrics/README.md) — metrics strategy
   - [Alerting](../../../.pair/knowledge/guidelines/observability/alerting/README.md) — alerting strategy
2. **Act**: Read project context:
   - [adoption/product/PRD.md](../../../.pair/adoption/product/PRD.md) — scale, budget
   - [adoption/tech/infrastructure.md](../../../.pair/adoption/tech/infrastructure.md) — existing infrastructure choices (observability must integrate)
3. **Verify**: Every file listed in 1-2 above has been read; any that's missing follows [Graceful Degradation](#graceful-degradation) (ask the developer directly) instead of silently proceeding to Step 3.

### Step 3: Evaluate Options

1. **Act**: Use the Observability Platform Options table and Decision Tree from guidelines:
   - Evaluate: DataDog, New Relic, Grafana Stack, ELK Stack, Prometheus/Grafana
   - Consider: budget, scale, AI features needed, self-hosted vs managed

2. **Act**: Also evaluate:
   - **Logging approach**: structured JSON, log levels, sensitive data handling
   - **Tracing**: distributed tracing needs based on architecture
   - **Alerting**: notification channels, escalation

3. **Act**: Present recommendation:

   > **Observability Recommendation:**
   > - Platform: [name] — [rationale]
   > - Logging: [approach] — [rationale]
   > - Tracing: [approach or "not needed"] — [rationale]
   > - Alerting: [strategy] — [rationale]

4. **Verify**: Developer approves.

### Step 4: Render Adoption Proposal

1. **Act**: Render the **observability section** content — the ready-to-write body for infrastructure.md:
   - Platform, logging, tracing, alerting decisions
   - Scope strictly to the observability section so the caller's write preserves all other sections (owned by /pair-capability-assess-infrastructure)
2. **Verify**: The rendered `content` and its `target` are ready to emit.

### Step 5: Emit Proposal

1. **Act**: Emit the proposal to the caller:
   - `content`: the rendered observability-section body from Step 4
   - `target`: [adoption/tech/infrastructure.md](../../../.pair/adoption/tech/infrastructure.md) (observability section)
   - `decision-metadata`: `$type: non-architectural` (observability tooling is typically a tool choice), `$topic: observability-strategy`, `$summary: "[Platform] adopted for observability with [logging approach]"`
   - plus the human-facing report (see Output Format)
2. **Verify**: Proposal emitted — see [record-decision invocation contract](../../../.pair/knowledge/skill-conventions/record-decision-contract.md) for the persistence contract (persistence is always the caller's responsibility, delegated to `/pair-capability-record-decision`).

## Output Format

Follows the [Decision Shape](../../../.pair/knowledge/skill-conventions/output-shapes.md#decision-shape).

```text
ASSESSMENT COMPLETE (output-only — no files written):
├── Domain:    Observability
├── Path:      [Argument Override | Adoption Exists | Full Assessment]
├── Decision:  [platform + logging + tracing + alerting]
├── Proposal:  [content rendered for infrastructure.md observability section]
├── Target:    adoption/tech/infrastructure.md (observability section)
├── Persist:   [caller composes /record-decision(content, target) → ADL]
└── Status:    [Proposal ready | Confirmed existing]
```

## Composition Interface

See [record-decision invocation contract](../../../.pair/knowledge/skill-conventions/record-decision-contract.md) for the generic tuple + Input/Output/Persistence shape.

When composed by `/pair-process-bootstrap`:

- **Input**: `/pair-process-bootstrap` invokes during Phase 2, after /pair-capability-assess-infrastructure.
- **Persistence**: `/pair-process-bootstrap` composes `/pair-capability-record-decision` to write the observability section and record the ADL.

When invoked **independently**: the human (or agent) persists the proposal by composing `/pair-capability-record-decision`, then commits.

## Edge Cases

- **Project doesn't need observability** (e.g. CLI tool, library): Render a minimal section noting "observability not applicable — [reason]" for the caller to persist.
- **infrastructure.md exists but no observability section**: Render content that adds the section; the caller's write preserves all other content.
- **Multiple valid platforms score equally**: Present top 2 with trade-off analysis.

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/skill-conventions/graceful-degradation.md) (guideline missing → ask developer for platform preference directly) and [record-decision contract](../../../.pair/knowledge/skill-conventions/record-decision-contract.md) (persistence unavailable → proposal stands as a report) for the standard scenarios. No additional cases.

## Notes

- Observability decisions are typically **non-architectural** → the caller records them as an ADL. Exception: if the observability choice requires infrastructure changes (e.g. service mesh for tracing), the caller uses ADR.
- **Section ownership**: this skill renders content ONLY for the observability section of infrastructure.md. The single adoption writer is `/pair-capability-record-decision`.
- Educational content (observability principles, three pillars, WHY) stays in guidelines.
