---
name: map-subdomains
description: "Classifies business capabilities into DDD subdomains (core/supporting/generic) with a Volatility rating, scoped to the caller's touched items. Falls back to 'system areas' when no DDD artifacts exist yet. Produces/updates files in adoption/product/subdomain/ using subdomain-template.md. Composed by /refine-story, /plan-initiatives, /plan-epics, /brainstorm — full scope only via /bootstrap. Idempotent."
version: 0.4.1
author: Foomakers
---

# /map-subdomains — Subdomain Placement (Capability)

Classify business capabilities into Domain-Driven Design subdomains — core, supporting, or generic — and place them with a Volatility rating. A **capability**, not a standalone lifecycle step: always invoked scoped to the items the caller just touched, never as a full re-mapping outside `/bootstrap`.

## Arguments

| Argument | Required | Description                                                                                                                              |
| -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `$scope` | Yes      | Items/areas touched by the caller (e.g. capability names, PRD sections, an initiative). `all` — full re-mapping, allowed only when composed by `/bootstrap`. |

## Composed Skills

| Caller              | When                                                             |
| ------------------- | ----------------------------------------------------------------- |
| `/refine-story`     | Functional/domain analysis phase — placement for the story's capability. |
| `/plan-initiatives` | Domain placement for a new initiative's capability area.          |
| `/plan-epics`       | Domain placement for an epic's capability area.                   |
| `/brainstorm`       | Broad brainstorm touching multiple capabilities (planned — #230). |
| `/bootstrap`        | Initial full-catalog mapping — the only caller allowed `$scope: all`. |

Invocable independently with an explicit `$scope` for ad hoc placement.

## Algorithm

### Step 0: Resolve Scope and DDD Adoption State

1. **Check**: Does [`adoption/product/subdomain/`](../../../.pair/adoption/product/subdomain/) contain `.md` files beyond README.md (DDD already adopted)?
2. **Check**: If not adopted, are PRD and initiatives available (business context to classify from)?
   - PRD: [`.pair/adoption/product/PRD.md`](../../../.pair/adoption/product/PRD.md)
   - Initiatives: query PM tool or check adoption files
3. **Act**: Resolve the working mode:
   - **DDD mode** — subdomain catalog exists, or PRD + initiatives are available for classification.
   - **System-areas fallback** (AC3) — no subdomain catalog AND no PRD/initiatives. No DDD prerequisite is enforced; do not HALT. Proceed to Step 1 in fallback mode.
4. **Check**: Does `$scope` resolve to any item in the current context?
5. **Skip**: If `$scope` resolves to nothing → report "no domain impact" and return control to the caller. No file changes.
6. **Verify**: Mode and non-empty scope determined.

### Step 1: Detect Existing Subdomains

1. **Check**: Scan [`adoption/product/subdomain/`](../../../.pair/adoption/product/subdomain/) for existing `.md` files (excluding README.md).
2. **Act**: Build a registry of existing subdomains:

   ```text
   EXISTING SUBDOMAINS:
   ├── [filename.md]: [Title] (Classification: [Core/Supporting/Generic], Volatility: [High/Medium/Low])
   └── ...
   ```

3. **Verify**: Registry built. Only entries touched by `$scope` are candidates for creation/update; the rest are left untouched.

### Step 2: Business Capability Analysis (DDD mode)

_Skip if in system-areas fallback — go to Step 2b._

1. **Act**: Analyze the capabilities in `$scope` (or the full PRD/initiatives set when `$scope: all`, bootstrap only):
   - Extract business function from PRD objectives and value propositions.
   - Map the touched initiative(s)/epic(s)/story to a business capability area.
   - Identify cross-cutting concerns and shared functionality patterns relevant to the scope.
2. **Verify**: Business capabilities in scope identified.

### Step 2b: System-Areas Fallback (no-DDD projects)

1. **Act**: Instead of business-capability analysis, derive placement from the codebase's existing structure: top-level packages/apps/services/modules touched by `$scope`.
2. **Act**: Treat each system area as a placeholder subdomain with `Classification: Generic` and `Volatility: Low` unless the caller has clear evidence otherwise — these are provisional, not a DDD classification.
3. **Verify**: Placement resolved to system area(s). Note in output that this is a fallback, not a DDD classification, and that `/bootstrap` or a full `/map-subdomains` run can upgrade it later.

### Step 3: DDD Classification, Volatility & Catalog Delta

1. **Act** (DDD mode): Classify each in-scope capability:
   - **Core** — competitive advantage, high business value, high complexity. Build in-house, invest deeply. Default `Volatility: High`.
   - **Supporting** — operational necessity, medium value. Important but not differentiating. Default `Volatility: Medium`.
   - **Generic** — commodity function, low differentiation. Buy or use standard solutions. Default `Volatility: Low`. Additionally assess **implementation volatility** — the probability of switching provider/technology; when High, note that relationships toward this subdomain require an integration contract (feeds `/map-contexts` strength assessment).
2. **Act**: Volatility default follows the classification above; the developer may override it (business-domain judgment, never inferred from commit history alone).
3. **Act**: Map relationships and data flow between in-scope subdomains and their existing dependencies.
4. **Check**: Does an in-scope subdomain already exist in the registry with different classification/volatility (catalog conflict)?
5. **Act**: If a conflict exists → propose the delta only (not a full re-map):

   > Existing: `[Name]` — Classification: [X], Volatility: [Y]
   > Proposed: Classification: [X'], Volatility: [Y']
   > Approve delta, keep existing, or override?

6. **Act**: Present the scoped catalog delta to the developer:

   > Proposed subdomain placement (scope: [$scope]):
   > **[Classification]**: [Name] — Volatility: [Level] ([default | override: reason])
   >
   > Relationships: [key dependencies within scope]
   > Approve or adjust?

7. **Verify**: Developer approves the delta.

### Step 4: Subdomain Specification

For each approved subdomain in scope:

1. **Check**: Does this subdomain already exist as a file?
2. **Act**: If exists and no conflict was raised → leave untouched; pre-existing entries without a `Volatility` field remain valid as-is (no forced migration — the field is added the next time this entry falls inside a `$scope`).
3. **Act**: If new, or an approved delta applies → create/update the subdomain file following [subdomain-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/subdomain-template.md):
   - Fill all template sections: Classification, Volatility, Business Purpose, Key Capabilities, Strategic Importance, Complexity Assessment, Data Ownership, Dependencies, Team Recommendations, Implementation Priority.
   - File path: `adoption/product/subdomain/[kebab-case-name].md`
4. **Verify**: File created/updated and parseable. Entries outside `$scope` are untouched.

### Step 5: Update Catalog README

1. **Act**: Update [`adoption/product/subdomain/README.md`](../../../.pair/adoption/product/subdomain/README.md) for the entries touched by this run:
   - List all subdomains by classification (Core, Supporting, Generic), with Volatility.
   - Include links to individual files.
   - Update the Subdomain Relationship Matrix for affected entries only.
2. **Verify**: README reflects the current catalog.

## Output Format

```text
SUBDOMAIN PLACEMENT COMPLETE:
├── Scope:      [$scope]
├── Mode:       [DDD | System-areas fallback]
├── Touched:    [N subdomains]
├── Created:    [X new files]
├── Updated:    [Y existing files]
├── Volatility: [defaults applied: A, overridden: B]
├── Location:   adoption/product/subdomain/
└── Next:       /map-contexts (scoped to the same items)
```

## Edge Cases and Error Handling

- **Scope resolves to nothing** — report "no domain impact", caller proceeds without HALT.
- **Existing catalog conflicts with scoped update** — propose the delta, human approves (idempotent behavior preserved); never silently overwrite.
- **Pre-existing files without `Volatility`** — treated as valid; field is added only when that entry falls inside a future `$scope`.
- **No `subdomain/` or `boundedcontext/` artifacts at all** — system-areas fallback (Step 2b); no error, no DDD prerequisite.
- **`$scope: all` requested by a caller other than `/bootstrap`** — warn and downgrade to the caller's actual touched items; full re-mapping stays bootstrap-only.

## Graceful Degradation

- If initiatives are not available but PRD is, proceed with PRD-only analysis and warn.
- If neither PRD nor initiatives nor an existing catalog are available, use the system-areas fallback (Step 2b) rather than halting.
- If the adoption directory doesn't exist, create it.
- If README.md doesn't exist, create it from scratch.

## Notes

- **Capability, not a process step**: this skill is always invoked scoped to the caller's touched items. `/bootstrap` is the only caller allowed a full-catalog `$scope: all` run.
- This skill **creates/updates adoption files** — not PM tool issues. Subdomains are design artifacts.
- Idempotent: re-invocation detects existing files by filename; only entries inside `$scope` are evaluated for changes.
- Volatility is evaluated from the business domain (classification-derived default + human override), never from commit history alone.
- DDD classification and Volatility drive downstream assessments — see `/map-contexts` (relationship strength/distance/volatility) and the architecture-quality capability that consumes them.
- Migration: this skill was reclassified from a process skill (`process/map-subdomains`) to a capability (`capability/map-subdomains`) — see [skills-guide.md](../../../.pair/knowledge/skills-guide.md#migration-notes) for the rename and new invocation paths.
