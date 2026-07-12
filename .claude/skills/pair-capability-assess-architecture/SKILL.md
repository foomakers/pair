---
name: pair-capability-assess-architecture
description: "Assess architecture pattern using resolution cascade (Argument > Adoption > Assessment). Reads architecture guidelines, proposes a pattern and emits rendered adoption content + target (output-only, writes nothing); the caller persists via /pair-capability-record-decision. Idempotent."
version: 0.5.0
author: Foomakers
---

# /pair-capability-assess-architecture — Architecture Assessment

Evaluate and recommend the system architecture pattern. Follows the resolution cascade: explicit argument wins, then existing adoption, then full assessment from guidelines. **Output-only**: this skill produces a proposal (rendered adoption content + target) plus a report — it writes no files. Persistence is delegated to `/pair-capability-record-decision`.

## Arguments

| Argument  | Required | Description                                                                 |
| --------- | -------- | --------------------------------------------------------------------------- |
| `$choice` | No       | Override: skip assessment, use this architecture directly (e.g. `hexagonal`) |

## Composed Skills

**Output-only** — composes no skill, writes no files; the caller persists via `/pair-capability-record-decision` (see [Composition Interface](#composition-interface)).

## Proposal Target

The rendered adoption content is destined for this file — the caller writes it via `/pair-capability-record-decision`:

- **Target**: [adoption/tech/architecture.md](../../../.pair/adoption/tech/architecture.md)
- **Ownership**: Full file (sole owner)

## Algorithm

### Step 1: Resolution Cascade

#### Path A — Argument Override

1. **Check**: Is `$choice` provided?
2. **Skip**: If not provided, go to Path B.
3. **Act**: Confirm the choice with the developer:

   > Architecture override: **$choice**.
   > This will be proposed without full assessment.
   > Confirm?

4. **Check**: Does an adoption file already exist with a different pattern?
   - If yes, warn: "Current adoption is **[existing]**. Override to **$choice**?"
5. **Verify**: Developer confirms. Proceed to Step 2.

#### Path B — Adoption Exists

1. **Check**: Does [adoption/tech/architecture.md](../../../.pair/adoption/tech/architecture.md) exist and is it populated (not template)?
2. **Skip**: If not populated or missing, go to Path C.
3. **Act**: Read current adoption. Present:

   > Architecture already adopted: **[pattern name]**.
   > Adoption file is current and valid.

4. **Check**: Does a corresponding decision record exist? (Scan [adoption/tech/adr/](../../../.pair/adoption/tech/adr) for `*architecture*` files.)
5. **Act**: If decision record missing, report it as a gap in the output — this skill writes nothing; the caller persists a backfill via `/pair-capability-record-decision`.
6. **Verify**: Adoption and decision record consistent. Done — exit skill.

#### Path C — Full Assessment

1. **Act**: Proceed to Step 2 (full assessment mode).

### Step 2: Read Guidelines

1. **Act**: Read architecture guidelines:
   - [Architecture README](../../../.pair/knowledge/guidelines/architecture/README.md) — decision tree, complexity matrix, selection criteria
   - [Architectural Patterns](../../../.pair/knowledge/guidelines/architecture/architectural-patterns/README.md) — pattern descriptions and trade-offs
   - [Project Constraints](../../../.pair/knowledge/guidelines/architecture/project-constraints/README.md) — team, platform, deployment constraints
2. **Act**: If PRD exists, read [adoption/product/PRD.md](../../../.pair/adoption/product/PRD.md) for project context (team size, scale, compliance).
3. **Verify**: Guidelines and project context loaded.

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
2. **Verify**: Proposal emitted. Persistence is performed by the caller via `/pair-capability-record-decision(content, target, decision-metadata)`, never by this skill.

## Output Format

```text
ASSESSMENT COMPLETE (output-only — no files written):
├── Domain:    Architecture
├── Path:      [Argument Override | Adoption Exists | Full Assessment]
├── Decision:  [pattern name]
├── Proposal:  [content rendered for adoption/tech/architecture.md]
├── Target:    adoption/tech/architecture.md (full file)
├── Persist:   [caller composes /pair-capability-record-decision(content, target) → ADR]
└── Status:    [Proposal ready | Confirmed existing]
```

## Composition Interface

When composed by `/pair-process-bootstrap`:

- **Input**: `/pair-process-bootstrap` invokes `/pair-capability-assess-architecture` during Phase 2 (checklist completion). May pass `$choice` if developer pre-selected.
- **Output**: Returns `{ content, target, decision-metadata }` plus the report. Writes nothing.
- **Persistence**: `/pair-process-bootstrap` accepts the proposal and composes `/pair-capability-record-decision(content, target, decision-metadata)` to write the adoption file and record the ADR, then includes those changes in the next commit.

When invoked **independently**:

- Full interactive flow. The skill returns the proposal; the human (or agent) persists it by composing `/pair-capability-record-decision`, then commits.

## Edge Cases

- **Argument conflicts with adoption**: Warn developer, ask for confirmation. If confirmed, the proposal supersedes the previous decision — the caller records the new decision record via `/pair-capability-record-decision`.
- **Adoption file partially exists** (e.g. has some sections but missing architecture pattern): Render content that fills the gap while preserving existing sections; the caller's write is a section-scoped update.
- **No PRD available**: Proceed with assessment using developer-provided constraints. Warn: "No PRD found — relying on developer input for project context."
- **Decision record already exists for same scope+decision**: Report "already recorded" — no proposal to persist (no duplicates).

## Graceful Degradation

- If architecture guidelines are not found, use minimal decision framework: ask developer to choose between Modular Monolith, Hexagonal, and Microservices based on team size and scale needs.
- If the caller cannot persist (e.g. `/pair-capability-record-decision` not installed), the proposal stands as a report — adoption stays unchanged until an explicit decision is recorded.
- If adoption files are missing, the assessment still runs and produces its proposal (nothing to write anyway).

## Notes

- This skill establishes the base pattern for all assess-* skills: resolution cascade + guidelines reference + **rendered adoption proposal (output-only)**. The single adoption writer is `/pair-capability-record-decision`, invoked by the caller.
- Architecture decisions are **architectural** type → the caller records them as an ADR (never ADL).
- The resolution cascade IS the idempotency mechanism: if adoption exists, assessment is already done.
- Educational content (pattern descriptions, trade-offs, WHY) stays in guidelines. This skill references guidelines for decision matrices and scoring.
