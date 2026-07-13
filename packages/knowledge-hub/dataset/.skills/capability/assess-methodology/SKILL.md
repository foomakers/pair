---
name: assess-methodology
description: "Evaluates and recommends the development methodology (Scrum, Kanban, Lean, SAFe, hybrid) — iterations, ceremonies, flow — when the choice is open. Output-only: emits a proposal + target for /record-decision to persist."
version: 0.5.0
author: Foomakers
---

# /assess-methodology — Methodology Assessment

Evaluate and recommend the development methodology: Scrum, Kanban, Lean, Waterfall, SAFe, LeSS, or hybrid. Follows the resolution cascade. **Output-only**: produces a proposal (rendered methodology-section content + target) plus a report — writes no files. Persistence is delegated to `/record-decision`.

## Arguments

| Argument  | Required | Description                                                                     |
| --------- | -------- | ------------------------------------------------------------------------------- |
| `$choice` | No       | Override: skip assessment, use this methodology directly (e.g. `kanban`, `scrum`) |

## Composed Skills

**Output-only** — composes no skill, writes no files; the caller persists via `/record-decision` (see [Composition Interface](#composition-interface)).

## Proposal Target

The rendered adoption content is destined for this section — the caller writes it via `/record-decision`:

- **Target**: [adoption/tech/way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) — **methodology section**
- **Ownership**: Methodology section (shared file — /assess-pm owns PM tool section)

## Algorithm

### Step 1: Resolution Cascade

#### Path A — Argument Override

1. **Check**: Is `$choice` provided?
2. **Skip**: If not provided, go to Path B.
3. **Act**: Confirm the choice. Check for conflicts with existing adoption.
4. **Verify**: Developer confirms. Proceed to Step 3.

#### Path B — Adoption Exists

1. **Check**: Does [adoption/tech/way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) exist and contain a methodology reference (e.g. "Kanban", "Scrum", or similar)?
2. **Skip**: If no methodology defined, go to Path C.
3. **Act**: Read current adoption. Confirm it's valid.
4. **Check**: Does a corresponding decision record exist?
5. **Act**: If decision record missing, report it as a gap in the output — this skill writes nothing; the caller persists a backfill via `/record-decision`.
6. **Verify**: Done — exit skill.

#### Path C — Full Assessment

1. **Act**: Proceed to Step 2.

### Step 2: Read Guidelines

1. **Act**: Read methodology guidelines:
   - [Methodology README](../../../.pair/knowledge/guidelines/collaboration/methodology/README.md) — decision framework, comparison matrix, decision tree, cost-benefit analysis
   - Individual methodology files as needed for detail:
     - [Kanban](../../../.pair/knowledge/guidelines/collaboration/methodology/kanban.md)
     - [Scrum](../../../.pair/knowledge/guidelines/collaboration/methodology/scrum.md)
     - [Lean](../../../.pair/knowledge/guidelines/collaboration/methodology/lean.md)
     - [Waterfall](../../../.pair/knowledge/guidelines/collaboration/methodology/waterfall.md)
     - [SAFe](../../../.pair/knowledge/guidelines/collaboration/methodology/safe.md)
     - [LeSS](../../../.pair/knowledge/guidelines/collaboration/methodology/less.md)
2. **Act**: Read project context:
   - [adoption/product/PRD.md](../../../.pair/adoption/product/PRD.md) — team size, timeline, requirements stability
   - [adoption/tech/architecture.md](../../../.pair/adoption/tech/architecture.md) — system complexity
3. **Verify**: Guidelines and context loaded.

### Step 3: Evaluate Options

1. **Act**: Apply the Methodology Comparison Matrix from guidelines:
   - Score each methodology on: Requirements Stability, Change Tolerance, Team Size/Complexity, Time to Market, Predictability Needs, Quality Focus, Learning/Innovation.
   - Weight criteria based on project type.

2. **Act**: Apply the Methodology Selection Decision Tree for quick validation.

3. **Act**: Present recommendation:

   > **Methodology Recommendation: [Name]**
   > - Score: [weighted total]
   > - Rationale: [evidence from project context and matrix]
   > - Key ceremonies: [list main ceremonies/practices]
   > - Trade-offs: [acknowledged limitations]

4. **Act**: If two methodologies score within 10%, present both with trade-off analysis.

5. **Verify**: Developer approves.

### Step 4: Render Adoption Proposal

1. **Act**: Render the **methodology-related content** — the ready-to-write body for way-of-working.md:
   - Methodology name and key practices
   - Development cycle description (iterations, flow, etc.)
   - Scope strictly to the methodology section so the caller's write preserves all other sections (quality gates, PM tool, etc.)
2. **Verify**: The rendered `content` and its `target` are ready to emit.

### Step 5: Emit Proposal

1. **Act**: Emit the proposal to the caller:
   - `content`: the rendered methodology-section body from Step 4
   - `target`: [adoption/tech/way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) (methodology section)
   - `decision-metadata`: `$type: non-architectural`, `$topic: methodology-choice`, `$summary: "[Methodology] adopted for development workflow"`
   - plus the human-facing report (see Output Format)
2. **Verify**: Proposal emitted. Persistence is performed by the caller via `/record-decision(content, target, decision-metadata)`, never by this skill.

## Output Format

```text
ASSESSMENT COMPLETE (output-only — no files written):
├── Domain:    Methodology
├── Path:      [Argument Override | Adoption Exists | Full Assessment]
├── Decision:  [methodology name]
├── Proposal:  [content rendered for way-of-working.md methodology section]
├── Target:    adoption/tech/way-of-working.md (methodology section)
├── Persist:   [caller composes /record-decision(content, target) → ADL]
└── Status:    [Proposal ready | Confirmed existing]
```

## Composition Interface

When composed by `/bootstrap`:

- **Input**: `/bootstrap` invokes during Phase 2.
- **Output**: Returns `{ content, target, decision-metadata }` plus the report. Writes nothing.
- **Persistence**: `/bootstrap` accepts the proposal and composes `/record-decision(content, target, decision-metadata)` to write the methodology section and record the ADL.

When invoked **independently**:

- Full interactive flow. The skill returns the proposal; the human (or agent) persists it by composing `/record-decision`, then commits.

## Edge Cases

- **way-of-working.md exists but no methodology section**: Render content that adds the methodology section; the caller's write preserves all other sections.
- **Team uses hybrid approach**: Document the hybrid: which elements from which methodology, how they combine.
- **Methodology change mid-project**: The proposal supersedes the previous decision — the caller records the new decision referencing the old one.

## Graceful Degradation

- If methodology guidelines not found, use minimal assessment: ask developer for methodology preference based on team size and requirements stability.
- If the caller cannot persist (e.g. `/record-decision` not installed), the proposal stands as a report — adoption stays unchanged.
- If way-of-working.md doesn't exist, the assessment still runs — the caller creates the file on persist via `/record-decision`.

## Notes

- Methodology decisions are **non-architectural** → the caller records them as an ADL.
- **Section ownership**: this skill renders content ONLY for the methodology section of way-of-working.md. /assess-pm owns PM tool section. Quality gates section is managed by /bootstrap. The single adoption writer is `/record-decision`.
- Educational content (methodology descriptions, ceremonies, WHY each works) stays in guidelines.
