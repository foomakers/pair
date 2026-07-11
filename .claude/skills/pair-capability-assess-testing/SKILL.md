---
name: pair-capability-assess-testing
description: "Assess testing strategy using resolution cascade (Argument > Adoption > Assessment). Reads testing guidelines, proposes framework and strategy and emits rendered adoption content + target (output-only, writes nothing); the caller persists via /pair-capability-record-decision. Idempotent."
version: 0.5.0
author: Foomakers
---

# /pair-capability-assess-testing — Testing Strategy Assessment

Evaluate and recommend the testing strategy: framework, pyramid distribution, coverage targets, and TDD approach. Follows the resolution cascade: explicit argument wins, then existing adoption, then full assessment from guidelines. **Output-only**: produces a proposal (rendered testing-section content + target) plus a report — writes no files. Persistence is delegated to `/pair-capability-record-decision`.

## Arguments

| Argument  | Required | Description                                                                          |
| --------- | -------- | ------------------------------------------------------------------------------------ |
| `$choice` | No       | Override: skip assessment, use this testing framework directly (e.g. `vitest`, `jest`) |

## Composed Skills

This skill is **output-only** — it composes no skill and writes no files. Persistence of the proposal is the caller's responsibility via `/pair-capability-record-decision` (see [Composition Interface](#composition-interface)).

## Proposal Target

The rendered adoption content is destined for this section — the caller writes it via `/pair-capability-record-decision`:

- **Target**: [adoption/tech/tech-stack.md](../../../.pair/adoption/tech/tech-stack.md) — **testing section only**
- **Ownership**: Testing section (shared file — /pair-capability-assess-stack owns core sections, /pair-capability-assess-ai owns AI section)

## Algorithm

### Step 1: Resolution Cascade

#### Path A — Argument Override

1. **Check**: Is `$choice` provided?
2. **Skip**: If not provided, go to Path B.
3. **Act**: Confirm the choice with the developer:

   > Testing framework override: **$choice**.
   > This will be proposed without full assessment.
   > Confirm?

4. **Check**: Does [tech-stack.md](../../../.pair/adoption/tech/tech-stack.md) already have a testing section with a different framework?
   - If yes, warn: "Current testing framework is **[existing]**. Override to **$choice**?"
5. **Verify**: Developer confirms. Proceed to Step 2.

#### Path B — Adoption Exists

1. **Check**: Does [adoption/tech/tech-stack.md](../../../.pair/adoption/tech/tech-stack.md) exist and contain a populated **Testing** section?
2. **Skip**: If no testing section or section is empty/template, go to Path C.
3. **Act**: Read current testing adoption. Present:

   > Testing strategy already adopted:
   > - Framework: **[name vX.Y]**
   > - Coverage tool: **[name vX.Y]**
   > - Additional tools: **[list]**
   >
   > Adoption is current and valid.

4. **Check**: Does a corresponding decision record exist? (Scan [adoption/decision-log/](../../../.pair/adoption/decision-log) or [adoption/tech/adr/](../../../.pair/adoption/tech/adr) for `*testing*` files.)
5. **Act**: If decision record missing, report it as a gap in the output — this skill writes nothing; the caller persists a backfill via `/pair-capability-record-decision`.
6. **Verify**: Adoption and decision record consistent. Done — exit skill.

#### Path C — Full Assessment

1. **Act**: Proceed to Step 2 (full assessment mode).

### Step 2: Read Guidelines

1. **Act**: Read testing guidelines:
   - [Test Strategy README](../../../.pair/knowledge/guidelines/testing/test-strategy/README.md) — strategic framework and philosophy
   - [Test Pyramid](../../../.pair/knowledge/guidelines/testing/test-strategy/test-pyramid.md) — distribution strategy
   - [Coverage Strategy](../../../.pair/knowledge/guidelines/testing/test-strategy/coverage-strategy.md) — coverage requirements
   - [TDD](../../../.pair/knowledge/guidelines/testing/test-strategy/tdd-test-driven-development.md) — TDD practices
2. **Act**: Read project context:
   - [adoption/tech/tech-stack.md](../../../.pair/adoption/tech/tech-stack.md) — language and framework (testing tools must be compatible)
   - [adoption/product/PRD.md](../../../.pair/adoption/product/PRD.md) — project type and quality requirements (if available)
3. **Verify**: Guidelines and project context loaded.

### Step 3: Evaluate Options

1. **Act**: Based on adopted language/framework, identify compatible testing frameworks:
   - For TypeScript/JavaScript: Vitest, Jest, Mocha, Playwright, Cypress
   - For other stacks: framework-appropriate options

2. **Act**: Evaluate frameworks against project needs:
   - Speed and DX (developer experience)
   - Compatibility with adopted tech stack
   - Coverage tooling quality
   - Community and maintenance status
   - TypeScript support quality

3. **Act**: Present recommendation with rationale:

   > **Testing Strategy Recommendation:**
   > - **Framework**: [name] v[X.Y] — [rationale]
   > - **Coverage**: [tool] v[X.Y] — [rationale]
   > - **Additional**: [e.g. path resolution plugin] — [rationale]
   > - **Pyramid**: Unit [N%] > Integration [N%] > E2E [N%]
   > - **Coverage target**: [N%] minimum

4. **Verify**: Developer approves the strategy.

### Step 4: Render Adoption Proposal

1. **Act**: Render the **Testing section** content — the ready-to-write body for tech-stack.md:
   - Framework name and version
   - Coverage tool and version
   - Additional testing tools with versions
   - Scope strictly to the Testing section so the caller's write preserves all other sections (core, AI, etc.)
2. **Verify**: The rendered `content` and its `target` are ready to emit. **This skill writes no files.**

### Step 5: Emit Proposal

1. **Act**: Emit the proposal to the caller:
   - `content`: the rendered Testing-section body from Step 4
   - `target`: [adoption/tech/tech-stack.md](../../../.pair/adoption/tech/tech-stack.md) (Testing section)
   - `decision-metadata`: `$type: non-architectural` (testing framework is a tooling choice), `$topic: testing-strategy`, `$summary: "[Framework] vX.Y adopted as testing framework with [coverage target]% coverage"`
   - plus the human-facing report (see Output Format)
2. **Verify**: Proposal emitted. Persistence is performed by the caller via `/pair-capability-record-decision(content, target, decision-metadata)`, never by this skill.

## Output Format

```text
ASSESSMENT COMPLETE (output-only — no files written):
├── Domain:    Testing
├── Path:      [Argument Override | Adoption Exists | Full Assessment]
├── Decision:  [framework vX.Y + coverage tool + pyramid distribution]
├── Proposal:  [content rendered for tech-stack.md testing section]
├── Target:    adoption/tech/tech-stack.md (Testing section)
├── Persist:   [caller composes /pair-capability-record-decision(content, target) → ADL]
└── Status:    [Proposal ready | Confirmed existing]
```

## Composition Interface

When composed by `/pair-process-bootstrap`:

- **Input**: `/pair-process-bootstrap` invokes `/pair-capability-assess-testing` during Phase 2. May pass `$choice` if developer pre-selected.
- **Output**: Returns `{ content, target, decision-metadata }` plus the report. Writes nothing.
- **Persistence**: `/pair-process-bootstrap` accepts the proposal and composes `/pair-capability-record-decision(content, target, decision-metadata)` to write the Testing section and record the ADL, then includes those changes in the next commit.

When invoked **independently**:

- Full interactive flow. The skill returns the proposal; the human (or agent) persists it by composing `/pair-capability-record-decision`, then commits the changes.

## Edge Cases

- **Argument conflicts with adoption**: Warn developer, ask for confirmation. If confirmed, the proposal supersedes the previous decision — the caller records the new decision.
- **tech-stack.md exists but no testing section**: Render content that adds the testing section; the caller's write preserves all other content.
- **Framework incompatible with adopted language**: HALT — warn developer of incompatibility, suggest compatible alternatives.
- **Decision record already exists for same scope+decision**: Report "already recorded" — no proposal to persist (no duplicates).
- **Multiple valid frameworks score equally**: Present top 2 with trade-off analysis, ask developer to choose.

## Graceful Degradation

- If testing guidelines are not found, use minimal assessment: ask developer for framework preference based on language.
- If the caller cannot persist (e.g. `/pair-capability-record-decision` not installed), the proposal stands as a report — adoption stays unchanged.
- If tech-stack.md doesn't exist, the assessment still runs and produces its proposal — the caller creates the file on persist via `/pair-capability-record-decision`.

## Notes

- Testing decisions are typically **non-architectural** → the caller records them as an ADL. Exception: if the testing strategy choice affects system structure (e.g. choosing contract testing that requires service boundaries), the caller uses ADR instead.
- **Section ownership**: this skill renders content ONLY for the Testing section of tech-stack.md. /pair-capability-assess-stack owns core sections, /pair-capability-assess-ai owns AI section. The single adoption writer is `/pair-capability-record-decision`.
- Version tracking: every testing tool includes specific version.
- The resolution cascade IS the idempotency mechanism: if testing section is populated, assessment is already done.
- Educational content (testing philosophy, principles, WHY) stays in guidelines. This skill references guidelines for framework comparison and strategy decisions.
