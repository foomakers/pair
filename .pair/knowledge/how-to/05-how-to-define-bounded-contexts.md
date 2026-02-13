# How to Define Bounded Contexts - AI-Assisted Guide

## Overview

Transform subdomain analysis and technical architecture into bounded context boundaries through collaborative Domain-Driven Design implementation. Bounded contexts establish service boundaries, data ownership, integration patterns, and team responsibilities.

**Role**: Product Engineer (Bounded Context Definition)
**Process**: AI analyzes & proposes, Developer validates & approves
**Skill**: When `/pair-process-map-contexts` is available, invoke it — it automates the operational steps of this workflow (constraint extraction, context catalog, integration validation, file creation). This how-to describes the workflow and its HALT conditions.

## Skill Composition

This how-to orchestrates the `/pair-process-map-contexts` skill.

| Skill            | Purpose                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| `/pair-process-map-contexts`  | Executes the full process: subdomain synthesis, context boundary analysis, BC file creation.               |

> **If skills are not installed**, follow the manual workflow below.

## Orchestration Flow

1. **Verify prerequisites**: subdomains defined in [`adoption/product/subdomain/`](../../adoption/product/subdomain), architecture adopted per [architecture.md](../../adoption/tech/architecture.md), tech stack defined per [tech-stack.md](../../adoption/tech/tech-stack.md).
2. **Invoke `/pair-process-map-contexts`** with optional `$scope` argument (`all` or `single`). The skill handles:
   - Existing bounded context detection (idempotent — skips already-defined files)
   - Context boundary analysis from subdomains, architecture, tech stack, way of working
   - Context catalog proposal (Core / Supporting / Infrastructure)
   - Integration pattern identification (sync, async, ACL)
   - BC file creation following [bounded-context-template.md](../guidelines/collaboration/templates/bounded-context-template.md)
   - Catalog README update
3. **Developer validates** the context catalog and integration patterns when prompted.
4. **Re-invoke** to create missing contexts or request explicit update for existing ones.

## Manual Workflow (without skills)

### Phase 1: Foundation Analysis

- Verify subdomains complete in [`adoption/product/subdomain/`](../../adoption/product/subdomain)
- Load adoption files: [architecture.md](../../adoption/tech/architecture.md), [tech-stack.md](../../adoption/tech/tech-stack.md), [way-of-working.md](../../adoption/tech/way-of-working.md)
- Reference [Bounded Context Patterns](../guidelines/architecture/design-patterns/bounded-contexts.md)

### Phase 2: Context Catalog

- Group subdomains by business cohesion and technical constraints
- Classify contexts:
  - **Core** — high autonomy, competitive advantage
  - **Supporting** — medium autonomy, operational necessity
  - **Infrastructure** — shared services, platform capabilities
- Identify integration patterns (sync, async, ACL) between contexts
- Map upstream/downstream relationships
- Present catalog for developer approval

### Phase 3: Context Definition & Documentation

- For each approved context, create file following [bounded-context-template.md](../guidelines/collaboration/templates/bounded-context-template.md)
- Store in `adoption/tech/boundedcontext/[kebab-case-name].md`
- Define: subdomains covered, business scope, relationships, integration patterns, data ownership, team alignment, ubiquitous language, quality attributes

### Phase 4: Catalog Update

- Update [`adoption/tech/boundedcontext/README.md`](../../adoption/tech/boundedcontext/README.md) with complete catalog
- Include integration overview and context map

## HALT Conditions

- **Subdomains not defined** — business boundaries drive technical boundaries
- **Architecture undefined** — technical patterns determine integration approaches
- **Developer rejects catalog** — must resolve before file creation
- **Template not found** — [bounded-context-template.md](../guidelines/collaboration/templates/bounded-context-template.md) required

## Key Principles

- **Subdomains first** — business boundaries drive technical boundaries, not the reverse
- **Catalog before details** — validate complete context landscape, then define individually
- **Integration patterns explicit** — every context relationship has a defined pattern
- **Team alignment** — context ownership maps to team structure
- **Idempotent** — re-invocation detects existing files, creates only missing ones
- **Design artifacts** — bounded contexts are adoption files, not PM tool issues

## References

- Template: [Bounded Context Template](../guidelines/collaboration/templates/bounded-context-template.md)
- Input: [Subdomain Definition](04-how-to-define-subdomains.md)
- Patterns: [Bounded Context Patterns](../guidelines/architecture/design-patterns/bounded-contexts.md)
- DDD: [Domain-Driven Design](../guidelines/architecture/design-patterns/domain-driven-design.md)
- Architecture: [`.pair/adoption/tech/architecture.md`](../../adoption/tech/architecture.md)
- Next: [Breakdown Epics](06-how-to-breakdown-epics.md)
