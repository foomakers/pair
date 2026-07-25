---
name: assess-architecture
description: "Evaluates and recommends an architecture pattern (layered, hexagonal, microservices, modular monolith, etc.) when the choice is open. Output-only: emits a proposal + target for /record-decision to persist."
version: 0.6.0
author: Foomakers
---

# /assess-architecture — Architecture Assessment

Evaluate and recommend the system architecture pattern. Follows the resolution cascade: explicit argument wins, then existing adoption, then full assessment from guidelines. **Output-only**: this skill produces a proposal (rendered adoption content + target) plus a report — it writes no files. Persistence is delegated to `/record-decision`.

## Arguments

| Argument  | Required | Description                                                                 |
| --------- | -------- | --------------------------------------------------------------------------- |
| `$choice` | No       | Override: skip assessment, use this architecture directly (e.g. `hexagonal`) |

## Composed Skills

**Output-only** — composes no skill, writes no files; the caller persists via `/record-decision` (see [Composition Interface](#composition-interface)).

## Proposal Target

The rendered adoption content is destined for this file — the caller writes it via `/record-decision`:

- **Target**: [adoption/tech/architecture.md](../../../.pair/adoption/tech/architecture.md)
- **Ownership**: Full file (sole owner)

## Algorithm

### Step 1: Resolution Cascade

Read [resolution cascade](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/resolution-cascade.md) for the generic Path A/B/C mechanics (check → skip → act → verify).

- **Path A delta**: override argument is `$choice`. Confirmation prompt: "Architecture override: **$choice**. This will be proposed without full assessment. Confirm?" — also warn if adoption already holds a different pattern. On confirm, proceed to Step 2.
- **Path B delta**: adoption check is [adoption/tech/architecture.md](../../../.pair/adoption/tech/architecture.md), populated (not template). Decision-record check scans [adoption/tech/adr/](../../../.pair/adoption/tech/adr/) for `*architecture*` files; if missing, report the gap (this skill still writes nothing; the caller persists a backfill via `/record-decision`).
- **Path C delta**: proceed to Step 2 (full assessment mode).

### Step 2: Read Guidelines

1. **Act**: Read architecture guidelines:
   - [Architecture README](../../../.pair/knowledge/guidelines/architecture/README.md) — decision tree, complexity matrix, selection criteria
   - [Architectural Patterns](../../../.pair/knowledge/guidelines/architecture/architectural-patterns/README.md) — pattern descriptions and trade-offs
   - [Project Constraints](../../../.pair/knowledge/guidelines/architecture/project-constraints/README.md) — team, platform, deployment constraints
   - [Coupling Balance](../../../.pair/knowledge/guidelines/architecture/design-patterns/coupling-balance.md) — the three-dimensional coupling model (integration strength × distance × volatility + balance rule); its criteria inform pattern scoring in Step 3 (a pattern that lowers strength or aligns distance to volatility scores higher for a volatile, tightly-coupled domain)
2. **Act**: If PRD exists, read [adoption/product/PRD.md](../../../.pair/adoption/product/PRD.md) for project context (team size, scale, compliance).
3. **Verify**: Every file listed in 1-2 above has been read; any that's missing follows [Graceful Degradation](#graceful-degradation) (ask the developer directly) instead of silently proceeding to Step 3.

### Step 3: Evaluate Options

1. **Act**: Apply the Architecture Complexity Matrix from guidelines against project constraints:
   - Score each candidate pattern on: Implementation Complexity, Team Skill Required, Maintenance Overhead, Scalability, Best For.
   - Weight criteria based on project type (from PRD or developer input).

2. **Act**: If two or more patterns score within 10% of each other, present top 2 with trade-off analysis:

   > **Top candidates:**
   > 1. **[Pattern A]** — Score: X. Strengths: ... Weaknesses: ...
   > 2. **[Pattern B]** — Score: Y. Strengths: ... Weaknesses: ...
   >
   > Recommendation: **[Pattern A]** because [reason].

3. **Act**: If one pattern clearly wins, present recommendation:

   > **Recommendation: [Pattern]**
   > - Rationale: [evidence from constraints and matrix]
   > - Trade-offs: [key trade-offs acknowledged]

4. **Verify**: Developer approves the choice.

### Step 4: Render Adoption Proposal

1. **Act**: Render the adoption content for the chosen pattern — the ready-to-write body for the target file:
   - Concise, prescriptive statements (what IS adopted, not options)
   - Reference guidelines for detailed rationale
   - Scope the content to this skill's owned section so the caller's write preserves other sections
2. **Verify**: The rendered `content` and its `target` are ready to emit.

### Step 5: Emit Proposal

1. **Act**: Emit the proposal to the caller (human or composing flow):
   - `content`: the rendered adoption body from Step 4
   - `target`: [adoption/tech/architecture.md](../../../.pair/adoption/tech/architecture.md) (owned section)
   - `decision-metadata`: `$type: architectural`, `$topic: architecture-pattern`, `$summary: "[Pattern] adopted as system architecture"`
   - plus the human-facing report (see Output Format)
2. **Verify**: Proposal emitted — see [record-decision invocation contract](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/record-decision-contract.md) for the persistence contract (persistence is always the caller's responsibility, delegated to `/record-decision`).

## Output Format

Follows the [Decision Shape](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/output-shapes.md#decision-shape).

```text
ASSESSMENT COMPLETE (output-only — no files written):
├── Domain:    Architecture
├── Path:      [Argument Override | Adoption Exists | Full Assessment]
├── Decision:  [pattern name]
├── Proposal:  [content rendered for adoption/tech/architecture.md]
├── Target:    adoption/tech/architecture.md (full file)
├── Persist:   [caller composes /record-decision(content, target) → ADR]
└── Status:    [Proposal ready | Confirmed existing]
```

## Composition Interface

See [record-decision invocation contract](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/record-decision-contract.md) for the generic tuple + Input/Output/Persistence shape.

When composed by `/bootstrap`:

- **Input**: `/bootstrap` invokes `/assess-architecture` during Phase 2 (checklist completion). May pass `$choice` if developer pre-selected.
- **Persistence**: `/bootstrap` composes `/record-decision` to write the adoption file and record the ADR, then includes those changes in the next commit.

When invoked **independently**: the human (or agent) persists the proposal by composing `/record-decision`, then commits.

## Edge Cases

- **Argument conflicts with adoption**: Warn developer, ask for confirmation. If confirmed, the proposal supersedes the previous decision — the caller records the new decision record via `/record-decision`.
- **Adoption file partially exists** (e.g. has some sections but missing architecture pattern): Render content that fills the gap while preserving existing sections; the caller's write is a section-scoped update.
- **No PRD available**: Proceed with assessment using developer-provided constraints. Warn: "No PRD found — relying on developer input for project context."
- **Decision record already exists for same scope+decision**: Report "already recorded" — no proposal to persist (no duplicates).

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/graceful-degradation.md) (guideline missing → minimal decision framework: ask developer to choose between Modular Monolith, Hexagonal, and Microservices based on team size/scale) and [record-decision contract](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/record-decision-contract.md) (persistence unavailable → proposal stands as a report) for the standard scenarios. No additional cases.

## Notes

- This skill establishes the base pattern for all assess-* skills: resolution cascade + guidelines reference + **rendered adoption proposal (output-only)**. The single adoption writer is `/record-decision`, invoked by the caller.
- Architecture decisions are **architectural** type → the caller always records them as an ADR (not ADL).
- The resolution cascade IS the idempotency mechanism: if adoption exists, assessment is already done.
- Educational content (pattern descriptions, trade-offs, WHY) stays in guidelines. This skill references guidelines for decision matrices and scoring.
