---
name: map-contexts
description: "Defines DDD bounded contexts from subdomain catalog. Maps subdomains to contexts with integration patterns, produces files in adoption/tech/boundedcontext/ using bounded-context-template.md. Idempotent: detects existing files, creates only missing ones."
---

# /map-contexts — Bounded Context Definition

Transform subdomain analysis and technical architecture into bounded context boundaries. Maps subdomains to implementation contexts with integration patterns, team alignment, and ubiquitous language. Produces adoption files directly.

## Arguments

| Argument | Required | Description                                                                                      |
| -------- | -------- | ------------------------------------------------------------------------------------------------ |
| `$scope` | No       | `all` (default) — define all contexts. `single` — define one context at a time.                  |

## Algorithm

### Step 0: Prerequisite Check

1. **Check**: Prerequisites present?
   - Subdomains defined: [`adoption/product/subdomain/`](../../../.pair/adoption/product/subdomain/) has `.md` files beyond README.md
   - Architecture adopted: [architecture.md](../../../.pair/adoption/tech/architecture.md)
   - Tech stack defined: [tech-stack.md](../../../.pair/adoption/tech/tech-stack.md)
   - Way of working: [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md)
2. **Skip**: If all present, proceed to Step 1.
3. **Act**: If subdomains missing → **HALT**:

   > Subdomains not defined. Run `/map-subdomains` first.

   If other files missing, warn and proceed with available constraints.

4. **Verify**: Subdomain catalog and technical context loaded.

### Step 1: Detect Existing Bounded Contexts

1. **Check**: Scan [`adoption/tech/boundedcontext/`](../../../.pair/adoption/tech/boundedcontext/) for existing `.md` files (excluding README.md).
2. **Act**: Build a registry of existing contexts:

   ```text
   EXISTING CONTEXTS:
   ├── [filename.md]: [Title] (Type: [Core/Supporting/Infrastructure])
   └── ...
   ```

3. **Verify**: Registry built. Existing contexts will be skipped during creation.

### Step 2: Context Boundary Analysis

1. **Act**: Synthesize context boundaries from multiple inputs:
   - **Subdomains**: group related subdomains based on business cohesion.
   - **Architecture** ([architecture.md](../../../.pair/adoption/tech/architecture.md)): service decomposition patterns, consistency requirements.
   - **Tech stack** ([tech-stack.md](../../../.pair/adoption/tech/tech-stack.md)): database choices, communication protocols.
   - **Way of working** ([way-of-working.md](../../../.pair/adoption/tech/way-of-working.md)): team structure, ownership model.
2. **Act**: For each proposed context, determine:
   - Type: Core (high autonomy), Supporting (medium autonomy), Infrastructure (shared services).
   - Subdomain grouping rationale.
   - Integration patterns (sync, async, ACL).
   - Data ownership boundaries.
3. **Verify**: Context boundaries identified.

### Step 3: Context Catalog Proposal

1. **Act**: Present the bounded context catalog to developer:

   > Proposed bounded contexts:
   > **Core**: [list with subdomains covered]
   > **Supporting**: [list with subdomains covered]
   > **Infrastructure**: [list with subdomains covered]
   >
   > Integration patterns: [sync: X, async: Y, ACL: Z]
   > [N] already exist (will be skipped).
   > Approve or adjust?

2. **Verify**: Developer approves the catalog.

### Step 4: Context Specification

For each approved context not already in the registry:

1. **Check**: Does this context already exist as a file?
2. **Skip**: If exists → skip, report:

   > Bounded context `[Name]` already exists ([filename.md]). Skipping. Request update explicitly if needed.

3. **Act**: Create the context file following [bounded-context-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/bounded-context-template.md):
   - Fill all template sections: Type, Subdomains Covered, Business Scope, Relationships, Integration Patterns, Data Ownership, Team Alignment, Ubiquitous Language, Quality Attributes.
   - File path: `adoption/tech/boundedcontext/[kebab-case-name].md`
4. **Verify**: File created and parseable.

### Step 5: Update Catalog README

1. **Act**: Update [`adoption/tech/boundedcontext/README.md`](../../../.pair/adoption/tech/boundedcontext/README.md):
   - List all contexts with subdomain mappings.
   - Include integration overview.
   - Link to individual context files.
2. **Verify**: README reflects complete catalog.

## Output Format

```text
CONTEXTS COMPLETE:
├── Total:          [N contexts]
├── Created:        [X new files]
├── Skipped:        [Y existing]
├── Core:           [A contexts]
├── Supporting:     [B contexts]
├── Infrastructure: [C contexts]
├── Integration:    [sync: X, async: Y, ACL: Z]
├── Location:       adoption/tech/boundedcontext/
└── Next:           /plan-epics
```

## HALT Conditions

- **Subdomains not defined** (Step 0) — business boundaries drive technical boundaries.
- **Developer rejects catalog** (Step 3) — must resolve before file creation.
- **Template not found** (Step 4) — [bounded-context-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/bounded-context-template.md) required.

## Graceful Degradation

- If architecture or tech-stack adoption files are missing, warn and infer boundaries from subdomains alone.
- If adoption directory doesn't exist, create it.
- If README.md doesn't exist, create it from scratch.

## Notes

- This skill **creates adoption files** — not PM tool issues. Bounded contexts are design artifacts.
- Idempotent: re-invocation detects existing files by filename and skips them. Offers update on explicit request.
- Context boundaries drive service decomposition, team ownership, and deployment independence.
- After context definition, proceed to `/plan-epics` for epic breakdown.
- Context files follow [bounded-context-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/bounded-context-template.md) structure exactly.
