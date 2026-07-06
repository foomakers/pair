# How to Define Bounded Contexts - AI-Assisted Guide

## Overview

Transform subdomain analysis and technical architecture into bounded context boundaries through collaborative Domain-Driven Design implementation. Bounded contexts establish service boundaries, data ownership, integration patterns, and team responsibilities.

**Role**: Product Engineer (Bounded Context Definition)
**Process**: AI analyzes & proposes, Developer validates & approves
**Skill**: `/map-contexts` is a **capability**, not a standalone process step — it is invoked scoped (`$scope` = the contexts/services just touched) by `/refine-story`, `/plan-tasks`, or `/bootstrap` (full scope). When available, it automates the operational steps of this workflow (constraint extraction, context catalog, relationship assessment, file creation). This how-to describes the workflow and its HALT conditions.

## Skill Composition

This how-to is realized by the `/map-contexts` capability, invoked by another skill.

| Skill            | Purpose                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| `/map-contexts`  | Executes the scoped process: subdomain synthesis, context boundary analysis, relationship assessment, BC file creation. |

> **If skills are not installed**, follow the manual workflow below.
> **No DDD artifacts yet and no caller context**: falls back to "system areas" (existing services/modules) instead of requiring subdomains — no HALT.

## Orchestration Flow

1. **Verify prerequisites**: subdomains defined in [`adoption/product/subdomain/`](../../adoption/product/subdomain), architecture adopted per [architecture.md](../../adoption/tech/architecture.md), tech stack defined per [tech-stack.md](../../adoption/tech/tech-stack.md). If subdomains are missing, the system-areas fallback applies instead of halting.
2. **Invoke `/map-contexts`** with `$scope` set to the contexts/services just touched (`all` only when composed by `/bootstrap`). The skill handles:
   - Existing bounded context detection (idempotent — only entries inside `$scope` are evaluated)
   - Context boundary analysis from subdomains, architecture, tech stack, way of working (or system-areas fallback)
   - Context catalog delta (Core / Supporting / Infrastructure)
   - Per-relationship assessment on integration strength, socio-technical distance, and volatility → balanced/unbalanced outcome and derived pattern (sync, async, ACL, contract); an unbalanced + volatile relationship is gated at approval until mitigated or explicitly accepted
   - BC file creation/update following [bounded-context-template.md](../guidelines/collaboration/templates/bounded-context-template.md)
   - Catalog README update for the touched entries
3. **Developer validates** the scoped context delta and any gated relationships when prompted.
4. **Re-invoke** (scoped to new items) to create missing contexts or request explicit update for existing ones.

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

- **Developer rejects catalog delta** — must resolve before file creation
- **Template not found** — [bounded-context-template.md](../guidelines/collaboration/templates/bounded-context-template.md) required
- **Unbalanced + volatile relationship without mitigation/acceptance** — blocks approval for that relationship
- **Subdomains/architecture missing** no longer halts — the capability falls back to "system areas" instead

## Key Principles

- **Scoped capability, not a process step** — invoked with `$scope` set to the caller's touched contexts/services; full-catalog `$scope: all` is bootstrap-only
- **Subdomains first** — business boundaries drive technical boundaries, not the reverse (system-areas fallback when unavailable)
- **Catalog before details** — validate the scoped delta first, then define individually
- **Integration patterns derived, not chosen freely** — every relationship's pattern follows from its strength/distance/volatility assessment; unbalanced + volatile relationships are gated at approval
- **Team alignment** — context ownership maps to team structure
- **Idempotent** — re-invocation detects existing files; only entries inside `$scope` are evaluated
- **Design artifacts** — bounded contexts are adoption files, not PM tool issues

## References

- Template: [Bounded Context Template](../guidelines/collaboration/templates/bounded-context-template.md)
- Input: [Subdomain Definition](04-how-to-define-subdomains.md)
- Patterns: [Bounded Context Patterns](../guidelines/architecture/design-patterns/bounded-contexts.md)
- DDD: [Domain-Driven Design](../guidelines/architecture/design-patterns/domain-driven-design.md)
- Architecture: [`.pair/adoption/tech/architecture.md`](../../adoption/tech/architecture.md)
- Next: [Breakdown Epics](06-how-to-breakdown-epics.md)
