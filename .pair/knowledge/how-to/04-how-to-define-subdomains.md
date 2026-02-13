# How to Define Subdomains - AI-Assisted Guide

## Overview

Transform PRD and strategic initiatives into Domain-Driven Design subdomains through business capability analysis and systematic domain modeling.

**Role**: Product Engineer & Product Owner/Manager (Subdomain Definition)
**Process**: AI analyzes & proposes, Developer validates & approves
**Skill**: When `/pair-process-map-subdomains` is available, invoke it — it automates the operational steps of this workflow (capability analysis, DDD classification, file creation). This how-to describes the workflow and its HALT conditions.

## Skill Composition

This how-to orchestrates the `/pair-process-map-subdomains` skill.

| Skill              | Purpose                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| `/pair-process-map-subdomains`  | Executes the full process: business analysis, DDD classification, subdomain file creation.           |

> **If skills are not installed**, follow the manual workflow below.

## Orchestration Flow

1. **Verify prerequisites**: PRD exists at [PRD.md](../../adoption/product/PRD.md), initiatives exist, bootstrap complete per [way-of-working.md](../../adoption/tech/way-of-working.md).
2. **Invoke `/pair-process-map-subdomains`** with optional `$scope` argument (`all` or `single`). The skill handles:
   - Existing subdomain detection (idempotent — skips already-defined files)
   - Business capability analysis from PRD and initiatives
   - DDD classification (Core / Supporting / Generic)
   - Subdomain file creation following [subdomain-template.md](../guidelines/collaboration/templates/subdomain-template.md)
   - Catalog README update
3. **Developer validates** the subdomain catalog when prompted by the skill.
4. **Re-invoke** to create missing subdomains or request explicit update for existing ones.

## Manual Workflow (without skills)

### Phase 1: Foundation Setup

- Verify PRD complete, initiatives identified, bootstrap done
- Load [Subdomain Template](../guidelines/collaboration/templates/subdomain-template.md)
- Reference [DDD Guidelines](../guidelines/architecture/design-patterns/domain-driven-design.md)

### Phase 2: Business Analysis & Catalog

- Extract core business functions from PRD objectives
- Map initiatives to business capability areas
- Identify cross-cutting concerns and shared functionality
- Propose complete catalog with DDD classification:
  - **Core** — competitive advantage, high value, high complexity. Build in-house.
  - **Supporting** — operational necessity, medium value. Important but not differentiating.
  - **Generic** — commodity function, low differentiation. Buy or use standard solutions.

### Phase 3: Validation & Definition

- Present catalog for developer approval
- For each approved subdomain, create file following [subdomain-template.md](../guidelines/collaboration/templates/subdomain-template.md)
- Store in `adoption/product/subdomain/[kebab-case-name].md`

### Phase 4: Documentation

- Update [`adoption/product/subdomain/README.md`](../../adoption/product/subdomain/README.md) with complete catalog
- Include links, classification, and relationship matrix

## HALT Conditions

- **PRD missing** — business context required for domain analysis
- **Initiatives missing** — strategic priorities drive classification
- **Developer rejects catalog** — must resolve before file creation
- **Template not found** — [subdomain-template.md](../guidelines/collaboration/templates/subdomain-template.md) required

## Key Principles

- **PRD-driven** — business capabilities come from PRD, not technical assumptions
- **DDD classification** — Core/Supporting/Generic drives architectural investment
- **Catalog before details** — validate complete landscape first, then define individually
- **Idempotent** — re-invocation detects existing files, creates only missing ones
- **Design artifacts** — subdomains are adoption files, not PM tool issues

## References

- Template: [Subdomain Template](../guidelines/collaboration/templates/subdomain-template.md)
- DDD: [Domain-Driven Design](../guidelines/architecture/design-patterns/domain-driven-design.md)
- Strategic: [Strategic Subdomain Definition](../guidelines/architecture/design-patterns/strategic-subdomain-definition.md)
- PRD: [`.pair/adoption/product/PRD.md`](../../adoption/product/PRD.md)
- Bootstrap: [Bootstrap Checklist](02-how-to-complete-bootstrap-checklist.md)
- Next: [Define Bounded Contexts](05-how-to-define-bounded-contexts.md)
