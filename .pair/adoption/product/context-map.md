# Context Map

> **Optional artifact.** Not scaffolded during bootstrap — created and maintained inline the first time a brainstorm or refine session sharpens a domain term (see [Context Map Maintenance](../../knowledge/guidelines/architecture/design-patterns/context-map-maintenance.md)). Its absence is the expected steady state for small or new projects; loading skills degrade gracefully when this file doesn't exist.

Dispatcher + index + core for this project's domain model. The unit is the **subdomain** — no separate "domain" taxonomy. Consult this file (and any linked `subdomain/<slug>.context.md`) before proposing a feature that touches an existing term, entity, or rule; flag conflicts against the registered rule (and the DDR, when one exists) instead of silently overriding it.

This is Pair's own map — the framework dogfooding the mechanism it ships. Its ubiquitous language is **derived from Pair's domain sources**: the [PRD](PRD.md) and the [subdomain catalog](subdomain/README.md) (business purpose, capabilities, data ownership). It is grown **lazily**, one term at a time as sessions touch it — not front-loaded as an exhaustive checklist. The way-of-working *mechanics* (states, checkpoints, phases, risk tiers) are the implementation vocabulary of the **Collaborative Workflow** subdomain and live in its own context file, not here.

## Subdomain Index

| Subdomain | Classification | Own Context | Volatility |
| --- | --- | --- | --- |
| [Collaborative Workflow](subdomain/collaborative-workflow.md) | Core | [Yes](subdomain/collaborative-workflow.context.md) | |
| [Code & Documentation Generation](subdomain/code-documentation-generation.md) | Core | No | |
| [Adoption & Guidelines](subdomain/adoption-guidelines.md) | Supporting | No | |
| [How-To Knowledge](subdomain/how-to-knowledge.md) | Supporting | No | |
| [Integration & Process Standardization](subdomain/integration-process-standardization.md) | Supporting | No | |

- **Classification** and **Volatility** mirror the subdomain catalog (`subdomain/<slug>.md`) — one column each here, never invented in the map. Volatility is intentionally empty: the catalog files carry no rating yet.
- **Own Context** is "Yes" for Collaborative Workflow: its glossary and entities (the way-of-working mechanics) outgrew the shared file and split to the co-located [`collaborative-workflow.context.md`](subdomain/collaborative-workflow.context.md) (see the [Subdomain Context Template](../../knowledge/guidelines/collaboration/templates/subdomain-context-template.md)).

## Glossary

Ubiquitous language, one row per term. Terms owned by Collaborative Workflow (marked "Yes" above) live in its context file, not here.

| Term | Definition | Subdomain |
| --- | --- | --- |
| Context | Project-specific information supplied to the AI so generated output is grounded and consistent — the antidote to the hallucination and misalignment pain points ([PRD](PRD.md) §3). | Code & Documentation Generation |
| Generated artifact | Code and documentation produced from validated requirements + guidelines; homogeneity across coding sessions is its defining quality goal (PRD §3, §4). | Code & Documentation Generation |
| Guideline | A documented decision point (product / engineering / organization / way-of-working) with its options, living in the Knowledge Base and citable by adoptions and process steps. | Adoption & Guidelines |
| Adoption | A project's committed choice of a practice, tool, or process — recorded as a **delta** over the KB defaults, in an adoption file. | Adoption & Guidelines |
| Knowledge Base (KB) | The structured corpus of guidelines Pair ships and a project customizes; the shared source of truth every adoption and how-to references. | Adoption & Guidelines |
| How-to | An operational instruction describing *how* the assistant executes a given task, so the workflow is transparent and repeatable. | How-To Knowledge |
| Integration | A connection to an external code assistant or project-management tool (GitHub and the local file system as the base). | Integration & Process Standardization |

## Entities

Domain entities and aggregates, one row per entity. Same rule as Glossary — entities owned by Collaborative Workflow live in its context file.

| Entity | Description | Subdomain |
| --- | --- | --- |
| Guideline document | A single KB entry: a decision point with its options and rationale, the unit adoptions link to. Data owner: the KB. | Adoption & Guidelines |
| Adoption file | The persisted record of an adopted practice/tool/process — the project's delta over KB defaults. Data owner: adoption records, validation logs. | Adoption & Guidelines |
| Integration connector | A configured link to a code assistant or PM tool; standardizes how external processes exchange data/commands with Pair. | Integration & Process Standardization |

## Common Rules and Invariants

Domain-wide business rules — the "common parts" the map keeps even after subdomains split out their own context. Subdomain-specific rules belong in that subdomain's context file, not here.

- **No silent override.** Every AI-proposed decision must be validatable against the project's/team's recorded choices; a conflict is flagged, never silently overridden. Violation → the misalignment and rework the product exists to prevent ([PRD](PRD.md) §3 pain points, §4 goal 2).
- **Consistency across sessions.** Generated output must stay homogeneous across coding sessions and contributors. Violation → the "inconsistent, non-homogeneous code" pain point (PRD §3), the primary quality metric (§4).
- **Context sufficiency.** Enough project context must reach the AI to prevent hallucination; missing context is a defect, not the AI's fault (PRD §3).
- **Adoption is delta-only.** Every schema ships a complete default in the KB; an adoption file records only the project's deviation. Duplicating KB defaults into adoption creates drift (D21).
- **Local-first.** Core features work without an internet connection and data stays local unless explicitly configured (PRD §8 constraints/security).
- **Integrations are pluggable.** GitHub and the local file system are the base; additional code assistants and PM tools are additive, never assumed (PRD §6).
