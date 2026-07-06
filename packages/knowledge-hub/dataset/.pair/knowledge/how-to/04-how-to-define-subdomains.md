# How to Define Subdomains - AI-Assisted Guide

## Overview

Transform PRD and strategic initiatives into Domain-Driven Design subdomains through business capability analysis and systematic domain modeling.

**Role**: Product Engineer & Product Owner/Manager (Subdomain Definition)
**Process**: AI analyzes & proposes, Developer validates & approves
**Skill**: `/map-subdomains` is a **capability**, not a standalone process step — it is invoked scoped (`$scope` = the items just touched) by `/plan-initiatives`, `/plan-epics`, `/refine-story`, or `/bootstrap` (full scope). When available, it automates the operational steps of this workflow (capability analysis, DDD classification, file creation). This how-to describes the workflow and its HALT conditions.

## Skill Composition

This how-to is realized by the `/map-subdomains` capability, invoked by another skill.

| Skill              | Purpose                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| `/map-subdomains`  | Executes the scoped process: business analysis, DDD classification + Volatility, subdomain file creation. |

> **If skills are not installed**, follow the manual workflow below.
> **No DDD artifacts yet and no caller context**: falls back to "system areas" (services/modules) instead of requiring PRD/initiatives — no HALT.

## Orchestration Flow

1. **Verify prerequisites**: PRD exists at [PRD.md](../../adoption/product/PRD.md), initiatives exist, bootstrap complete per [way-of-working.md](../../adoption/tech/way-of-working.md). If none exist, the system-areas fallback applies instead of halting.
2. **Invoke `/map-subdomains`** with `$scope` set to the items just touched (`all` only when composed by `/bootstrap`). The skill handles:
   - Existing subdomain detection (idempotent — only entries inside `$scope` are evaluated)
   - Business capability analysis from PRD and initiatives (or system-areas fallback)
   - DDD classification (Core / Supporting / Generic) with a `Volatility` rating (defaulted from classification, human override)
   - Subdomain file creation/update following [subdomain-template.md](../guidelines/collaboration/templates/subdomain-template.md)
   - Catalog README update for the touched entries
3. **Developer validates** the scoped subdomain delta when prompted by the skill.
4. **Re-invoke** (scoped to new items) to create missing subdomains or request explicit update for existing ones.

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

- **Developer rejects catalog delta** — must resolve before file creation
- **Template not found** — [subdomain-template.md](../guidelines/collaboration/templates/subdomain-template.md) required
- **PRD/Initiatives missing** no longer halts — the capability falls back to "system areas" (services/modules) instead

## Key Principles

- **Scoped capability, not a process step** — invoked with `$scope` set to the caller's touched items; full-catalog `$scope: all` is bootstrap-only
- **PRD-driven** — business capabilities come from PRD, not technical assumptions (system-areas fallback when unavailable)
- **DDD classification + Volatility** — Core/Supporting/Generic drives architectural investment; Volatility defaults from classification, human override
- **Catalog before details** — validate the scoped delta first, then define individually
- **Idempotent** — re-invocation detects existing files; only entries inside `$scope` are evaluated
- **Design artifacts** — subdomains are adoption files, not PM tool issues

## References

- Template: [Subdomain Template](../guidelines/collaboration/templates/subdomain-template.md)
- DDD: [Domain-Driven Design](../guidelines/architecture/design-patterns/domain-driven-design.md)
- Strategic: [Strategic Subdomain Definition](../guidelines/architecture/design-patterns/strategic-subdomain-definition.md)
- PRD: [`.pair/adoption/product/PRD.md`](../../adoption/product/PRD.md)
- Bootstrap: [Bootstrap Checklist](02-how-to-complete-bootstrap-checklist.md)
- Next: [Define Bounded Contexts](05-how-to-define-bounded-contexts.md)
