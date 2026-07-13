---
name: assess-pm
description: "Evaluates and recommends which project management tool fits this project (Jira, Linear, GitHub Projects, etc.) when the choice is still open — proposes a choice, doesn't configure anything. /setup-pm configures the tool once picked; otherwise the caller persists the proposal via /record-decision."
version: 0.5.0
author: Foomakers
---

# /assess-pm — PM Tool Assessment

Evaluate and recommend the project management tool. Follows the resolution cascade. **Output-only** for adoption: this skill produces a proposal (rendered PM-section content + target) plus a report and never writes adoption itself. When `/setup-pm` is installed it delegates tool configuration and persistence to it; otherwise the caller persists the proposal via `/record-decision`.

## Arguments

| Argument  | Required | Description                                                                  |
| --------- | -------- | ---------------------------------------------------------------------------- |
| `$choice` | No       | Override: skip assessment, use this PM tool directly (e.g. `github`, `filesystem`) |

## Composed Skills

| Skill              | Type       | Required                                         |
| ------------------ | ---------- | ------------------------------------------------ |
| `/setup-pm`        | Capability | Optional — delegates tool configuration + persistence if installed |

This skill writes no adoption files itself. When `/setup-pm` is absent, persistence of the proposal is the caller's responsibility via `/record-decision` (see [Composition Interface](#composition-interface)).

## Proposal Target

The rendered adoption content is destined for this section — the caller (or `/setup-pm`) writes it:

- **Target**: [adoption/tech/way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) — **PM tool section**
- **Ownership**: PM tool section (shared file — /assess-methodology owns methodology section)

## Algorithm

### Step 1: Resolution Cascade

See [resolution cascade](../../../.pair/knowledge/skill-conventions/resolution-cascade.md) for the generic Path A/B/C mechanics (check → skip → act → verify).

- **Path A delta**: override argument is `$choice`. On confirm, proceed to Step 3.
- **Path B delta**: adoption check is a PM tool configuration in [adoption/tech/way-of-working.md](../../../.pair/adoption/tech/way-of-working.md). If a corresponding decision record is missing, report the gap (this skill still writes nothing; the caller persists a backfill via `/record-decision`).
- **Path C delta**: proceed to Step 2.

### Step 2: Read Guidelines

1. **Act**: Read PM tool guidelines:
   - [PM Tool README](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/README.md) — decision matrix, decision tree, cost-benefit analysis
   - Implementation guides for supported tools:
     - [GitHub Implementation](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/github-implementation.md)
     - [Filesystem Implementation](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/filesystem-implementation.md)
2. **Act**: Read project context:
   - [adoption/product/PRD.md](../../../.pair/adoption/product/PRD.md) — team size, collaboration needs
   - [adoption/tech/way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) — methodology (PM tool should support it)
3. **Verify**: Guidelines and context loaded.

### Step 3: Evaluate Options

1. **Act**: Apply the PM Tool Decision Matrix from guidelines:
   - Score tools on: Team Size, Complexity, Integration, Cost, Learning Curve, Customization, Reporting, Mobile Support.
   - Apply the Decision Tree for quick validation.

2. **Act**: Present recommendation:

   > **PM Tool Recommendation: [Name]**
   > - Score: [weighted total]
   > - Rationale: [evidence from project context]
   > - Implementation guide: [available | not available]
   > - Cost: [free | paid — details]

3. **Act**: If tool has no implementation guide, warn:

   > No implementation guide available for **[tool]**. Setup will be manual.

4. **Verify**: Developer approves.

### Step 4: Delegate Setup or Render Proposal

1. **Check**: Is `/setup-pm` installed?
2. **Act** (installed): Compose `/setup-pm` with `$tool: [chosen tool]`. `/setup-pm` handles tool configuration, adoption update, and decision recording. Done — exit skill.
3. **Act** (not installed): Render the **PM tool section** content — the ready-to-write body for way-of-working.md:
   - Tool name
   - Workflow methodology integration
   - Access method (MCP, CLI, filesystem)
   - Scope strictly to the PM tool section so the caller's write preserves all other sections
4. **Verify**: The rendered `content` and its `target` are ready to emit.

### Step 5: Emit Proposal (only if /setup-pm not invoked)

1. **Check**: Was `/setup-pm` composed in Step 4? If yes, it already configured and persisted — skip.
2. **Act**: Emit the proposal to the caller:
   - `content`: the rendered PM-section body from Step 4
   - `target`: [adoption/tech/way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) (PM tool section)
   - `decision-metadata`: `$type: non-architectural`, `$topic: pm-tool-choice`, `$summary: "[Tool] adopted for project management"`
   - plus the human-facing report (see Output Format)
3. **Verify**: Proposal emitted — see [record-decision invocation contract](../../../.pair/knowledge/skill-conventions/record-decision-contract.md) for the persistence contract (never persisted by this skill).

## Output Format

Follows the [Decision Shape](../../../.pair/knowledge/skill-conventions/output-shapes.md#decision-shape) (with a `Delegated` status for the /setup-pm handoff — a legitimate per-skill variant, see that file).

```text
ASSESSMENT COMPLETE (output-only for adoption — no files written by this skill):
├── Domain:    Project Management
├── Path:      [Argument Override | Adoption Exists | Full Assessment]
├── Decision:  [tool name]
├── Proposal:  [content rendered for way-of-working.md PM section | delegated to /setup-pm]
├── Target:    adoption/tech/way-of-working.md (PM tool section)
├── Persist:   [caller composes /record-decision(content, target) → ADL | delegated to /setup-pm]
└── Status:    [Proposal ready | Confirmed existing | Delegated]
```

## Composition Interface

See [record-decision invocation contract](../../../.pair/knowledge/skill-conventions/record-decision-contract.md) for the generic tuple + Input/Output/Persistence shape.

When composed by `/bootstrap`:

- **Input**: `/bootstrap` invokes during Phase 2 (checklist completion). May pass `$choice`.
- **Persistence**: if `/setup-pm` was composed, it already persisted — otherwise `/bootstrap` composes `/record-decision`.

When invoked **independently**: if `/setup-pm` is present it persists; otherwise the human (or agent) persists the proposal by composing `/record-decision`, then commits.

## Edge Cases

- **way-of-working.md exists but no PM section**: Render content that adds the PM section; the caller's write preserves all other content.
- **Tool without implementation guide**: Emit the proposal but warn about manual setup.
- **Multiple PM tools needed**: Not supported — one tool per project. Document primary tool.

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/skill-conventions/graceful-degradation.md) (guideline missing → ask developer for tool preference directly; optional skill `/setup-pm` not installed → emit the proposal for the caller to persist via `/record-decision`, no tool-specific configuration) and [record-decision contract](../../../.pair/knowledge/skill-conventions/record-decision-contract.md) (persistence unavailable → proposal stands as a report) for the standard scenarios. No additional cases.

## Notes

- PM tool decisions are **non-architectural** → the caller records them as an ADL.
- **Section ownership**: this skill renders content ONLY for the PM tool section of way-of-working.md. The single adoption writer is `/record-decision` (or `/setup-pm` when it handles configuration).
- **Delegation pattern**: /assess-pm decides WHICH tool, /setup-pm configures it — handling both adoption write and decision recording when installed.
- Educational content (tool descriptions, integration details) stays in guidelines.
