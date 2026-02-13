---
name: pair-process-map-subdomains
description: "Defines DDD subdomains from PRD and initiatives. Classifies as core/supporting/generic, produces subdomain files in adoption/product/subdomain/ using subdomain-template.md. Idempotent: detects existing files, creates only missing ones."
---

# /pair-process-map-subdomains — Subdomain Definition

Transform PRD and strategic initiatives into Domain-Driven Design subdomains through business capability analysis, DDD classification, and structured specification. Produces adoption files directly (not PM tool issues).

## Arguments

| Argument | Required | Description                                                                                     |
| -------- | -------- | ----------------------------------------------------------------------------------------------- |
| `$scope` | No       | `all` (default) — define all subdomains. `single` — define one subdomain at a time.             |

## Algorithm

### Step 0: Prerequisite Check

1. **Check**: Prerequisites present?
   - PRD exists: [`.pair/adoption/product/PRD.md`](../../../.pair/adoption/product/PRD.md)
   - Initiatives exist: query PM tool or check adoption files
   - Bootstrap complete: [`.pair/adoption/tech/way-of-working.md`](../../../.pair/adoption/tech/way-of-working.md)
2. **Skip**: If all present, proceed to Step 1.
3. **Act**: If any missing → **HALT**:

   > Prerequisites incomplete: [list missing]. PRD and initiatives required for domain analysis.

4. **Verify**: PRD loaded, initiatives available.

### Step 1: Detect Existing Subdomains

1. **Check**: Scan [`adoption/product/subdomain/`](../../../.pair/adoption/product/subdomain) for existing `.md` files (excluding README.md).
2. **Act**: Build a registry of existing subdomains:

   ```text
   EXISTING SUBDOMAINS:
   ├── [filename.md]: [Title] (Classification: [Core/Supporting/Generic])
   └── ...
   ```

3. **Verify**: Registry built. Existing subdomains will be skipped during creation.

### Step 2: Business Capability Analysis

1. **Act**: Analyze PRD and initiatives systematically:
   - Extract core business functions from PRD objectives and value propositions.
   - Map strategic initiatives to business capability areas.
   - Identify cross-cutting concerns and shared functionality patterns.
   - Assess business complexity and strategic importance per capability.
2. **Verify**: Business capabilities identified.

### Step 3: DDD Classification & Catalog

1. **Act**: Classify each capability using the DDD framework:
   - **Core** — competitive advantage, high business value, high complexity. Build in-house, invest deeply.
   - **Supporting** — operational necessity, medium value. Important but not differentiating.
   - **Generic** — commodity function, low differentiation. Buy or use standard solutions.
2. **Act**: Map relationships and data flow between subdomains.
3. **Act**: Present the subdomain catalog to developer:

   > Proposed subdomains:
   > **Core**: [list with business purpose]
   > **Supporting**: [list with business purpose]
   > **Generic**: [list with business purpose]
   >
   > Relationships: [key dependencies]
   > [N] already exist (will be skipped).
   > Approve or adjust?

4. **Verify**: Developer approves the catalog.

### Step 4: Subdomain Specification

For each approved subdomain not already in the registry:

1. **Check**: Does this subdomain already exist as a file?
2. **Skip**: If exists → skip, report:

   > Subdomain `[Name]` already exists ([filename.md]). Skipping. Request update explicitly if needed.

3. **Act**: Create the subdomain file following [subdomain-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/subdomain-template.md):
   - Fill all template sections: Classification, Business Purpose, Key Capabilities, Strategic Importance, Complexity Assessment, Data Ownership, Dependencies, Team Recommendations, Implementation Priority.
   - File path: `adoption/product/subdomain/[kebab-case-name].md`
4. **Verify**: File created and parseable.

### Step 5: Update Catalog README

1. **Act**: Update [`adoption/product/subdomain/README.md`](../../../.pair/adoption/product/subdomain/README.md):
   - List all subdomains by classification (Core, Supporting, Generic).
   - Include links to individual files.
   - Update the Subdomain Relationship Matrix.
2. **Verify**: README reflects complete catalog.

## Output Format

```text
SUBDOMAINS COMPLETE:
├── Total:     [N subdomains]
├── Created:   [X new files]
├── Skipped:   [Y existing]
├── Core:      [A subdomains]
├── Supporting: [B subdomains]
├── Generic:   [C subdomains]
├── Location:  adoption/product/subdomain/
└── Next:      /pair-process-map-contexts
```

## HALT Conditions

- **PRD missing** (Step 0) — business context required for domain analysis.
- **Initiatives missing** (Step 0) — strategic priorities drive classification.
- **Developer rejects catalog** (Step 3) — must resolve before file creation.
- **Template not found** (Step 4) — [subdomain-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/subdomain-template.md) required.

## Graceful Degradation

- If initiatives are not available, proceed with PRD-only analysis and warn.
- If adoption directory doesn't exist, create it.
- If README.md doesn't exist, create it from scratch.

## Notes

- This skill **creates adoption files** — not PM tool issues. Subdomains are design artifacts.
- Idempotent: re-invocation detects existing files by filename and skips them. Offers update on explicit request.
- DDD classification drives architectural decisions downstream — core subdomains get deeper investment.
- After subdomain definition, proceed to `/pair-process-map-contexts` for bounded context definition.
- Subdomain files follow [subdomain-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/subdomain-template.md) structure exactly.
