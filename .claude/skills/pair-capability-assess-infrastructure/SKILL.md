---
name: pair-capability-assess-infrastructure
description: "Evaluates and recommends infrastructure strategy — cloud provider, CI/CD pipeline, deployment pattern, IaC, environments — when the choice is open. Output-only: emits a proposal + target for /pair-capability-record-decision to persist."
version: 0.5.0
author: Foomakers
---

# /pair-capability-assess-infrastructure — Infrastructure Assessment

Evaluate and recommend infrastructure strategy: cloud provider, CI/CD pipeline, deployment patterns, IaC approach, and environments. Follows the resolution cascade. **Output-only**: produces a proposal (rendered infrastructure.md content + target) plus a report — writes no files. Persistence is delegated to `/pair-capability-record-decision`.

## Arguments

| Argument  | Required | Description                                                                |
| --------- | -------- | -------------------------------------------------------------------------- |
| `$choice` | No       | Override: skip assessment, use this infrastructure choice directly (e.g. `github-actions`, `aws`) |

## Composed Skills

**Output-only** — composes no skill, writes no files; the caller persists via `/pair-capability-record-decision` (see [Composition Interface](#composition-interface)).

## Proposal Target

The rendered adoption content is destined for this file — the caller writes it via `/pair-capability-record-decision`:

- **Target**: [adoption/tech/infrastructure.md](../../../.pair/adoption/tech/infrastructure.md) — core infrastructure sections
- **Ownership**: Full file, except observability section (owned by /pair-capability-assess-observability)

## Algorithm

### Step 1: Resolution Cascade

Read [resolution cascade](../../../.pair/knowledge/skill-conventions/resolution-cascade.md) for the generic Path A/B/C mechanics (check → skip → act → verify).

- **Path A delta**: override argument is `$choice`. On confirm, proceed to Step 3.
- **Path B delta**: adoption check is [adoption/tech/infrastructure.md](../../../.pair/adoption/tech/infrastructure.md), populated. If a corresponding decision record is missing, report the gap (this skill still writes nothing; the caller persists a backfill via `/pair-capability-record-decision`).
- **Path C delta**: proceed to Step 2.

### Step 2: Read Guidelines

1. **Act**: Read infrastructure guidelines:
   - [Infrastructure README](../../../.pair/knowledge/guidelines/infrastructure/README.md) — practice areas and decision framework
   - [CI/CD Strategy](../../../.pair/knowledge/guidelines/infrastructure/cicd-strategy) — pipeline design and automation
   - [Cloud Services](../../../.pair/knowledge/guidelines/infrastructure/cloud-services) — cloud platform selection
   - [Deployment Patterns](../../../.pair/knowledge/guidelines/infrastructure/deployment-patterns) — deployment strategies
   - [Infrastructure as Code](../../../.pair/knowledge/guidelines/infrastructure/infrastructure-as-code) — IaC practices
2. **Act**: Read project context:
   - [adoption/product/PRD.md](../../../.pair/adoption/product/PRD.md) — scale, budget, compliance
   - [adoption/tech/architecture.md](../../../.pair/adoption/tech/architecture.md) — architecture pattern (infra must support it)
3. **Verify**: Guidelines and context loaded.

### Step 3: Evaluate Options

1. **Act**: Evaluate infrastructure options using the Practice Selection Matrix from guidelines:
   - **Cloud provider**: AWS, GCP, Azure, self-hosted, or none (desktop/CLI projects)
   - **CI/CD**: GitHub Actions, GitLab CI, Jenkins, CircleCI
   - **Deployment**: Containers vs serverless vs static, blue-green vs canary vs rolling
   - **IaC**: Terraform, CDK, Pulumi, none (simple projects)
   - **Environments**: dev, staging, production setup

2. **Act**: Present recommendation:

   > **Infrastructure Recommendation:**
   > - CI/CD: [tool] — [rationale]
   > - Deployment: [strategy] — [rationale]
   > - Cloud: [provider or "none"] — [rationale]
   > - IaC: [tool or "not needed"] — [rationale]

3. **Verify**: Developer approves.

### Step 4: Render Adoption Proposal

1. **Act**: Render the infrastructure.md content — the ready-to-write body for the target file:
   - Concise, prescriptive statements
   - Scope to the core infrastructure sections so the caller's write preserves the observability section (owned by /pair-capability-assess-observability)
2. **Verify**: The rendered `content` and its `target` are ready to emit.

### Step 5: Emit Proposal

1. **Act**: Emit the proposal to the caller:
   - `content`: the rendered infrastructure.md body from Step 4
   - `target`: [adoption/tech/infrastructure.md](../../../.pair/adoption/tech/infrastructure.md) (core sections)
   - `decision-metadata`: `$type: architectural` (infrastructure decisions affect system structure), `$topic: infrastructure-strategy`, `$summary: "[Summary of key infrastructure choices]"`
   - plus the human-facing report (see Output Format)
2. **Verify**: Proposal emitted — see [record-decision invocation contract](../../../.pair/knowledge/skill-conventions/record-decision-contract.md) for the persistence contract (never persisted by this skill).

## Output Format

Follows the [Decision Shape](../../../.pair/knowledge/skill-conventions/output-shapes.md#decision-shape).

```text
ASSESSMENT COMPLETE (output-only — no files written):
├── Domain:    Infrastructure
├── Path:      [Argument Override | Adoption Exists | Full Assessment]
├── Decision:  [key infrastructure choices]
├── Proposal:  [content rendered for infrastructure.md]
├── Target:    adoption/tech/infrastructure.md (core sections)
├── Persist:   [caller composes /pair-capability-record-decision(content, target) → ADR]
└── Status:    [Proposal ready | Confirmed existing]
```

## Composition Interface

See [record-decision invocation contract](../../../.pair/knowledge/skill-conventions/record-decision-contract.md) for the generic tuple + Input/Output/Persistence shape.

When composed by `/pair-process-bootstrap`:

- **Input**: `/pair-process-bootstrap` invokes during Phase 2.
- **Persistence**: `/pair-process-bootstrap` composes `/pair-capability-record-decision` to write infrastructure.md and record the ADR.

When invoked **independently**: the human (or agent) persists the proposal by composing `/pair-capability-record-decision`, then commits.

## Edge Cases

- **Project doesn't need infrastructure** (e.g. pure library, CLI tool): Render a minimal infrastructure.md noting CI/CD only, no cloud deployment, for the caller to persist.
- **Adoption file partially exists**: Render content that fills gaps; the caller's write preserves existing content.
- **Observability section exists**: Do not touch it — owned by /pair-capability-assess-observability. Scope the rendered content to core sections.

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/skill-conventions/graceful-degradation.md) (guideline missing → ask developer for CI/CD and deployment preferences directly) and [record-decision contract](../../../.pair/knowledge/skill-conventions/record-decision-contract.md) (persistence unavailable → proposal stands as a report) for the standard scenarios. No additional cases.

## Notes

- Infrastructure decisions are typically **architectural** → the caller records them as an ADR.
- **Section ownership**: /pair-capability-assess-observability owns the observability section of infrastructure.md if that section exists there; otherwise observability goes in its own section of way-of-working or a separate file. The single adoption writer is `/pair-capability-record-decision`.
- Educational content (cloud concepts, IaC principles) stays in guidelines.
