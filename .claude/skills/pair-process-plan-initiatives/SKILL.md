---
name: pair-process-plan-initiatives
description: "Turns a PRD into prioritized (P0/P1/P2) strategic initiatives through structured analysis and validation. Composes /pair-capability-write-issue."
version: 0.4.1
author: Foomakers
---

# /pair-process-plan-initiatives — Strategic Initiative Creation

Transform Product Requirements Documents into strategic initiatives through PRD analysis, prioritization, and collaborative validation. Composes `/pair-capability-write-issue` for PM tool integration.

## Composed Skills

| Skill          | Type       | Required                                                        |
| -------------- | ---------- | --------------------------------------------------------------- |
| `/pair-capability-write-issue` | Capability | Yes — creates or updates initiative issues in the PM tool       |

## Arguments

| Argument | Required | Description                                                                                     |
| -------- | -------- | ----------------------------------------------------------------------------------------------- |
| `$scope` | No       | `all` (default) — create all initiatives. `single` — create one initiative at a time.           |

## Algorithm

### Step 0: Prerequisite Check

1. **Check**: Prerequisites present?
   - PRD exists: [`.pair/adoption/product/PRD.md`](../../../.pair/adoption/product/PRD.md)
   - Bootstrap complete: [`.pair/adoption/tech/`](../../../.pair/adoption/tech) has `way-of-working.md`, `architecture.md`, `tech-stack.md`
   - PM tool configured: [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) specifies the adopted tool
2. **Skip**: If all present, proceed to Step 1.
3. **Act**: If any missing → **HALT**:

   > Prerequisites incomplete: [list missing]. Complete bootstrap first (`/pair-process-bootstrap`).

4. **Verify**: PRD.md has project-specific (non-template) content, `.pair/adoption/tech/` has way-of-working.md/architecture.md/tech-stack.md, and way-of-working.md names an accessible PM tool — the "prerequisites present" check from Step 0.

### Step 1: Detect Existing Initiatives

1. **Check**: Query the PM tool for existing initiative issues (label: `initiative`).
2. **Act**: Build a registry of existing initiatives:

   ```text
   EXISTING INITIATIVES:
   ├── #ID: [Title] (Priority: [P0/P1/P2])
   └── ...
   ```

3. **Verify**: Registry built. If initiatives already exist, they will be skipped during creation.

### Step 2: PRD Analysis

1. **Act**: Analyze the PRD systematically:
   - Extract primary business objectives and user value propositions.
   - Identify technical constraints and success metrics.
   - Map user pain points to solution areas.
   - Assess market timing and competitive requirements.
2. **Act**: Identify candidate initiatives:
   - Group related functionality into coherent business value streams.
   - Estimate complexity and resource requirements.
   - Identify dependencies between candidates.
3. **Verify**: Candidate list prepared.

### Step 3: Prioritization

1. **Act**: Apply P0/P1/P2 prioritization framework:
   - **P0 (Must-Have)**: Core value proposition enablers — launch-critical.
   - **P1 (Should-Have)**: Competitive advantages — growth drivers.
   - **P2 (Could-Have)**: Experience enhancements — retention improvements.
2. **Act**: Validate dependency flow — higher-priority initiatives must not depend on lower-priority ones.
3. **Act**: Present prioritized catalog to developer:

   > Proposed initiatives:
   > **P0**: [list] — Core value delivery
   > **P1**: [list] — Competitive advantages
   > **P2**: [list] — Experience enhancements
   >
   > [N] already exist in PM tool (will be skipped).
   > Approve or adjust?

4. **Verify**: Developer approves the catalog.

### Step 4: Initiative Creation

Process initiatives by priority (P0 → P1 → P2). For each initiative:

1. **Check**: Does this initiative already exist in the registry (Step 1)?
2. **Skip**: If exists → skip, report:

   > Initiative `[Title]` already exists (#ID). Skipping.

3. **Act**: Draft the initiative following the [initiative-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/initiative-template.md):
   - Fill template sections with PRD-derived content.
   - Include business rationale, scope, success metrics, risk assessment, timeline.
   - Present to developer for validation.
4. **Act**: Compose `/pair-capability-write-issue` with:
   - `$type: initiative`
   - `$content`: the filled initiative template
5. **Verify**: Initiative created in PM tool. Record the ID.

### Step 5: Dependency Mapping & Roadmap

1. **Act**: Map dependencies between all initiatives (new and existing).
2. **Act**: Present proposed roadmap:

   > Roadmap:
   > Phase 1: [P0 initiatives] — Core value delivery
   > Phase 2: [P1 initiatives] — Competitive advantages
   > Phase 3: [P2 initiatives] — Experience enhancements
   >
   > Dependencies: [critical path items]

3. **Verify**: Developer approves roadmap.

## Output Format

```text
INITIATIVES COMPLETE:
├── Total:    [N initiatives]
├── Created:  [X new]
├── Skipped:  [Y existing]
├── Priority: [P0: A, P1: B, P2: C]
├── PM Tool:  [adopted tool]
└── Next:     /pair-capability-map-subdomains (scoped to this initiative) or /pair-process-plan-epics
```

## HALT Conditions

- **PRD missing** (Step 0) — cannot analyze business objectives.
- **Bootstrap incomplete** (Step 0) — PM tool and tech context required.
- **PM tool not accessible** — cannot query or create initiatives.
- **Developer rejects catalog** (Step 3) — must resolve before creation.

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/skill-conventions/graceful-degradation.md) (optional skill `/pair-capability-write-issue` not installed / PM tool not accessible → produce initiative documents, ask developer to create manually) for the standard scenarios. Additional cases:

- If adoption files (architecture, tech-stack) are missing, proceed with PRD analysis only and warn.

## Notes

- This skill **modifies PM tool state** — creates initiative issues.
- **Idempotent** — see [idempotency convention](../../../.pair/knowledge/skill-conventions/idempotency.md). This skill's check: detects existing initiatives by title matching and skips them.
- Initiative = highest-level work item. Hierarchy: initiative → epic → story → task.
