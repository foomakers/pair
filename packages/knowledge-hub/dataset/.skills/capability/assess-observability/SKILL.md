---
name: assess-observability
description: "Assess observability strategy using resolution cascade (Argument > Adoption > Assessment). Reads observability guidelines, proposes monitoring/logging/tracing choices and emits rendered adoption content + target (output-only, writes nothing); the caller persists via /record-decision. Idempotent."
version: 0.5.0
author: Foomakers
---

# /assess-observability — Observability Assessment

Evaluate and recommend the observability strategy: monitoring platform, logging approach, tracing, alerting, and dashboards. Follows the resolution cascade. **Output-only**: produces a proposal (rendered observability-section content + target) plus a report — writes no files. Persistence is delegated to `/record-decision`.

## Arguments

| Argument  | Required | Description                                                                          |
| --------- | -------- | ------------------------------------------------------------------------------------ |
| `$choice` | No       | Override: skip assessment, use this observability platform directly (e.g. `grafana`, `datadog`) |

## Composed Skills

**Output-only** — composes no skill, writes no files; the caller persists via `/record-decision` (see [Composition Interface](#composition-interface)).

## Proposal Target

The rendered adoption content is destined for this section — the caller writes it via `/record-decision`:

- **Target**: [adoption/tech/infrastructure.md](../../../.pair/adoption/tech/infrastructure.md) — **observability section only**
- **Ownership**: Observability section (shared file — /assess-infrastructure owns core sections)

## Algorithm

### Step 1: Resolution Cascade

#### Path A — Argument Override

1. **Check**: Is `$choice` provided?
2. **Skip**: If not provided, go to Path B.
3. **Act**: Confirm the choice. Check for conflicts with existing adoption.
4. **Verify**: Developer confirms. Proceed to Step 3.

#### Path B — Adoption Exists

1. **Check**: Does [adoption/tech/infrastructure.md](../../../.pair/adoption/tech/infrastructure.md) exist and contain a populated **observability** section?
2. **Skip**: If no observability section or empty, go to Path C.
3. **Act**: Read current observability adoption. Confirm it's valid.
4. **Check**: Does a corresponding decision record exist?
5. **Act**: If decision record missing, report it as a gap in the output — this skill writes nothing; the caller persists a backfill via `/record-decision`.
6. **Verify**: Done — exit skill.

#### Path C — Full Assessment

1. **Act**: Proceed to Step 2.

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
3. **Verify**: Guidelines and context loaded.

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
   - Scope strictly to the observability section so the caller's write preserves all other sections (owned by /assess-infrastructure)
2. **Verify**: The rendered `content` and its `target` are ready to emit.

### Step 5: Emit Proposal

1. **Act**: Emit the proposal to the caller:
   - `content`: the rendered observability-section body from Step 4
   - `target`: [adoption/tech/infrastructure.md](../../../.pair/adoption/tech/infrastructure.md) (observability section)
   - `decision-metadata`: `$type: non-architectural` (observability tooling is typically a tool choice), `$topic: observability-strategy`, `$summary: "[Platform] adopted for observability with [logging approach]"`
   - plus the human-facing report (see Output Format)
2. **Verify**: Proposal emitted. Persistence is performed by the caller via `/record-decision(content, target, decision-metadata)`, never by this skill.

## Output Format

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

When composed by `/bootstrap`:

- **Input**: `/bootstrap` invokes during Phase 2, after /assess-infrastructure.
- **Output**: Returns `{ content, target, decision-metadata }` plus the report. Writes nothing.
- **Persistence**: `/bootstrap` accepts the proposal and composes `/record-decision(content, target, decision-metadata)` to write the observability section and record the ADL.

When invoked **independently**:

- Full interactive flow. The skill returns the proposal; the human (or agent) persists it by composing `/record-decision`, then commits.

## Edge Cases

- **Project doesn't need observability** (e.g. CLI tool, library): Render a minimal section noting "observability not applicable — [reason]" for the caller to persist.
- **infrastructure.md exists but no observability section**: Render content that adds the section; the caller's write preserves all other content.
- **Multiple valid platforms score equally**: Present top 2 with trade-off analysis.

## Graceful Degradation

- If observability guidelines not found, use minimal assessment: ask developer for platform preference.
- If the caller cannot persist (e.g. `/record-decision` not installed), the proposal stands as a report — adoption stays unchanged.
- If infrastructure.md doesn't exist, the assessment still runs — the caller creates the file on persist via `/record-decision`.

## Notes

- Observability decisions are typically **non-architectural** → the caller records them as an ADL. Exception: if the observability choice requires infrastructure changes (e.g. service mesh for tracing), the caller uses ADR.
- **Section ownership**: this skill renders content ONLY for the observability section of infrastructure.md. The single adoption writer is `/record-decision`.
- Educational content (observability principles, three pillars, WHY) stays in guidelines.
