# Context Map

> **Optional artifact.** Not scaffolded during bootstrap — created and maintained inline the first time a brainstorm or refine session sharpens a domain term (see [Context Map Maintenance](../../knowledge/guidelines/architecture/design-patterns/context-map-maintenance.md)). Its absence is the expected steady state for small or new projects; loading skills degrade gracefully when this file doesn't exist.

Dispatcher + index + core for this project's domain model. The unit is the **subdomain** — no separate "domain" taxonomy. Consult this file (and any linked `subdomain/<slug>.context.md`) before proposing a feature that touches an existing term, entity, or rule; flag conflicts against the registered rule (and the DDR, when one exists) instead of silently overriding it.

This is Pair's own map — the framework dogfooding the mechanism it ships. It registers the canonical terms of the Pair way-of-working itself (states, classification, decision records, process phases, distribution). Pointers cite the deciding artifact: decision IDs `D1`–`D24` and gaps `G1`–`G11` live in the requirements-triage / gap-analysis working docs; adopted ADRs, decision-log entries, guidelines, and templates are linked directly; issues use `#<n>` (epic [#203](https://github.com/foomakers/pair/issues/203)).

## Subdomain Index

| Subdomain | Classification | Own Context | Volatility |
| --- | --- | --- | --- |
| [collaborative-workflow](subdomain/collaborative-workflow.md) | Core | No | |
| [code-documentation-generation](subdomain/code-documentation-generation.md) | Core | No | |
| [adoption-guidelines](subdomain/adoption-guidelines.md) | Supporting | No | |
| [how-to-knowledge](subdomain/how-to-knowledge.md) | Supporting | No | |
| [integration-process-standardization](subdomain/integration-process-standardization.md) | Supporting | No | |

- **Classification** and **Volatility** mirror the subdomain catalog (`subdomain/<slug>.md`) — one column each here, never invented in the map.
- **Own Context** flips to "Yes" only after a lazy, human-approved split: once a subdomain's inline context has grown, its Glossary and Entities rows move to the co-located `subdomain/<slug>.context.md` sibling (see the [Subdomain Context Template](../../knowledge/guidelines/collaboration/templates/subdomain-context-template.md)).
- **Volatility** is intentionally empty: the subdomain catalog files carry no Volatility rating, and the guideline forbids inventing one here. Fold it in once the catalog sets it.

## Glossary

Ubiquitous language, one row per term. Skip terms owned by a subdomain marked "Yes" in the index above — they live in that subdomain's context file instead.

| Term | Definition | Subdomain |
| --- | --- | --- |
| Macrostato (Macrostate) | A canonical Pair workflow state in the fixed model `Draft → Ready → In Progress → Review → Done`. Skills reason only over macrostates, never over raw board labels. | collaborative-workflow |
| State mapping (n-m) | The adoption delta (`way-of-working.md`) mapping many board states to one Pair macrostato; unmapped states are allowed, minimal boards (Todo/In Progress/Done) supported. Omitted mapping = canonical names (D21). Ref: [ADR canonical-states-state-mapping](../tech/adr/2026-07-07-canonical-states-state-mapping.md), [canonical-states guideline](../../knowledge/guidelines/collaboration/project-management-tool/canonical-states.md), D3. | integration-process-standardization |
| DoR (Definition of Ready) | Criteria a story must meet to enter development: clear title, problem/goal, verifiable AC, estimate, dependencies, design (not-required \| required+reference). Primary readiness signal is the mapped `Ready` macrostato; DoR-on-body is the fallback when mapping is absent (D4). Ref: [#241](https://github.com/foomakers/pair/issues/241) (Canonical DoR/DoD), D4, G1, R3.8. | collaborative-workflow |
| DoD / DoS (Definition of Done) | Criteria for a story to be Done: AC satisfied, PR approved for its risk tier, CI green, no critical bugs (deployment excluded). Ref: [#241](https://github.com/foomakers/pair/issues/241) (Canonical DoR/DoD), G1, R3.9. **Open naming**: the canonical-terms annotation ([#248](https://github.com/foomakers/pair/issues/248)) writes "DoS", the gap body (G1, [#241](https://github.com/foomakers/pair/issues/241)) writes "DoD" — see Common Rules note; treated as the same term pending a decision. | collaborative-workflow |
| Risk Tier | The 🟢/🟡/🔴 criticality band that modulates process (review depth, pipeline, human-gate). A projection of the Risk Matrix. Ref: [ADR quality-model-resolution-cascade](../tech/adr/2026-07-11-quality-model-resolution-cascade.md), quality-model (#221), D17. | adoption-guidelines |
| Macro-fase (Macro-phase) | One of the two autonomous AI phases — **refinement** (Draft→Ready) and **implementation** — whose boundary is a Checkpoint. Also the pair-next mode that advances a phase. Ref: R4.2, G2/G5, D8. | collaborative-workflow |
| Supervisore (Supervisor) | The evolution from orchestrator to supervisor: autonomous phases advance via a declarative `pair-next --root --filter --until` loop, guardrailed by classification tags, with explicit human-intervention points (🔴 review approval, state promotions). The supervisor holds no classification logic (grep-verifiable). Ref: G10, R4.5, D9. | collaborative-workflow |
| Working area (`.pair/working/`) | The operational, per-project runtime area (checkpoints, reports). Task-scoped, excluded from KB registries, never touched by install/update. Ref: [decision-log working-artifacts-task-scoped](../decision-log/2026-07-11-working-artifacts-task-scoped.md), D14. | adoption-guidelines |
| Marketplace | The `.claude-plugin/marketplace.json` in the Pair repo that publishes skills as Claude Code plugins; the CLI stays the agnostic multi-tool channel. One source of truth (`knowledge-hub`), two formats. Ref: G11, D1 (under #64). | integration-process-standardization |
| Quickstart | The opinionated "one command" install path (standard config: GitHub Projects, default gates, default/`poc` process profile), alongside the unchanged guided bootstrap. Ref: G11, D2. | integration-process-standardization |
| Process profile | A named process configuration (`default`, `poc`, custom) declared as a section of `way-of-working.md`; pair-next reads the active profile from the WoW. Ref: G2, D19. | adoption-guidelines |

## Entities

Domain entities and aggregates, one row per entity. Same rule as Glossary — skip entities owned by a split-out subdomain. These are the artifacts the framework creates and maintains, each with its own identity, location, and lifecycle.

| Entity | Description | Subdomain |
| --- | --- | --- |
| Context Map | This artifact: `adoption/product/context-map.md` = dispatcher + subdomain index + core (glossary, entities, common rules). Holds all domain context while the project is small; a subdomain's context lazily splits to `subdomain/<slug>.context.md` on human approval. Represents the **current state** of the domain rules. Ref: [context-map template](../../knowledge/guidelines/collaboration/templates/context-map-template.md), [maintenance guideline](../../knowledge/guidelines/architecture/design-patterns/context-map-maintenance.md), #244, D6. | _domain-wide_ |
| DDR (Domain Decision Record) | A distinct decision-record type in `adoption/product/ddr/`, own template, managed by `record-decision`. Captures the **history / why** of a domain rule (Context Map = current state, DDR = rationale). Creation criteria: hard to reverse + surprising without context + real trade-off. Ref: D5, G4, `pair-capability-record-decision`. | adoption-guidelines |
| Checkpoint / Handoff | Resumable progress state (story, branch, tasks done, decisions, remaining todos) written under `.pair/working/checkpoints/<story-id>.md`; a task-scoped handoff a zero-context session or subagent resumes from. The boundary primitive between macro-phases. Ref: [checkpoint-template](../../knowledge/guidelines/collaboration/templates/checkpoint-template.md), pair-capability-checkpoint, G5, D8. | collaborative-workflow |
| Risk Matrix | The criticality classification, built **twice**: at refinement over the story context, at review over the code diff (and never lowered in review). One quality model (KB) + a project delta in `tech/risk-matrix.md` (services/domains criticality). Risk Tier and tags are projections of it. Ref: quality-model (#221), D17. | adoption-guidelines |
| Report consolidato (pannello) | A generated, idempotently regenerable consolidated report (md/html) under `.pair/working/reports/` — costs + vulnerabilities per service, expected-vs-real, trends. Not a log. Ref: R6.4, G8, D14. | adoption-guidelines |

## Common Rules and Invariants

Domain-wide business rules — the "common parts" the map keeps even after subdomains split out their own context. Subdomain-specific rules belong in that subdomain's context file, not here.

- **Skills never read board state names directly** — they resolve every state through the state mapping to a Pair macrostato. Violation: a skill hardcodes a board label and breaks on any project that renamed it. Ref: [ADR canonical-states-state-mapping](../tech/adr/2026-07-07-canonical-states-state-mapping.md), D3.
- **Adoption is delta-only (convention over configuration).** Every new schema (state mapping, classification model, process profile) ships a complete default in the KB; an adoption file exists only to record a project's deviation and contains only the delta. No new adoption artifact is mandatory. Violation: duplicating KB defaults into adoption creates drift. Ref: D21.
- **The working area (`.pair/working/`) is excluded from KB registries and never overwritten by install/update.** It is operational, task-scoped runtime state — not distributed knowledge. Violation: treating a checkpoint/report as knowledge lets install clobber live state. Ref: [decision-log working-artifacts-task-scoped](../decision-log/2026-07-11-working-artifacts-task-scoped.md), D14.
- **The Risk Matrix is built twice and never lowered in review.** Refinement classifies from the story context; review re-classifies from the diff and may only raise the tier. Violation: a review that inherits and downgrades the story-time tier hides risk introduced by the code. Ref: D17.
- **Current-state vs history separation.** The Context Map holds the current domain rules; the DDR holds why they were decided (same relation as `context-map ↔ ddr` and `adoption file ↔ analysis-log`). Splitting the map is **lazy and human-approved, never automatic**. Violation: rewriting rules without a DDR loses the rationale; auto-splitting fragments the map without consent. Ref: D5, D6, [maintenance guideline](../../knowledge/guidelines/architecture/design-patterns/context-map-maintenance.md).
- **Reading budget.** Reviews and issues lead with the verdict/classification (tag + one line); details go in collapsed `<details>` blocks or linked reports under `.pair/working/reports/` — never inline walls of text. Target: review verdict in ~30s, story in ~2 min. Violation: an inline dump of findings breaks the scannability the template guarantees. Ref: D22.
- **Open — DoD vs DoS naming.** The canonical-terms annotation abbreviates the Done gate as "DoS" while the gap analysis and every template use "DoD" (Definition of Done). Both denote the same concept; registered here as an open naming question until a decision settles it (edge case: the map tracks reality, competing labels side by side). Ref: [#248](https://github.com/foomakers/pair/issues/248) (canonical-terms annotation) vs G1, [#241](https://github.com/foomakers/pair/issues/241).
