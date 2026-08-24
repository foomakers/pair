# Collaborative Workflow — Context

> Co-located sibling of `subdomain/collaborative-workflow.md`. Created lazily when this subdomain's inline context in `context-map.md` outgrew the shared file — the maintaining session proposed the split, the human approved. Maintained inline per the [Context Map Maintenance](../../../knowledge/guidelines/architecture/design-patterns/context-map-maintenance.md) guideline.

Collaborative Workflow is Pair's Core subdomain — coordinating developers and AI across every phase of product development. Its ubiquitous language is both the **collaboration domain** (epics, stories, decisions) and the **way-of-working mechanics** that implement it (states, phases, checkpoints). Pointers cite the deciding artifact: decision codes `D*` and gaps `G*` live in the requirements-triage / gap-analysis working docs; adopted ADRs, decision-log entries, and guidelines are linked; issues use `#<n>` (epic [#202](https://github.com/foomakers/pair/issues/202)).

## Glossary

Ubiquitous language scoped to this subdomain.

| Term | Definition |
| --- | --- |
| Epic | A major area of functionality; the top of the work-item hierarchy Pair helps break down. |
| User Story | A vertical slice of user value under an epic, carrying its own acceptance criteria. |
| Task | An implementation unit under a story — the granularity a coding session executes. |
| Phase | A stage of the development lifecycle Pair guides, from requirements definition to delivery. |
| Decision validation | Real-time confirmation of an AI-proposed choice against the project's/team's choices *before* acting — the mechanism that mitigates misalignment. |
| Project type | The project category (pet / startup-scaleup / enterprise) that selects a tailored workflow and guideline set. |
| Macrostato (Macrostate) | A canonical Pair workflow state in the fixed model `Draft → Ready → In Progress → Review → Done`. Skills reason only over macrostates, never over raw board labels. Ref: [ADR canonical-states](../../tech/adr/adr-011-canonical-states-state-mapping.md), D3. |
| State mapping (n-m) | The adoption delta (`way-of-working.md`) mapping many board states to one macrostato; omitted mapping ⇒ canonical names. Ref: [canonical-states guideline](../../../knowledge/guidelines/collaboration/project-management-tool/canonical-states.md), D21. |
| DoR (Definition of Ready) | Criteria a story must meet to enter development; the primary signal is the mapped `Ready` macrostato, with DoR-on-body as fallback. Ref: [#241](https://github.com/foomakers/pair/issues/241), D4. |
| DoD (Definition of Done) | Criteria for a story to be Done: AC satisfied, PR approved for its risk tier, CI green, no critical bugs. Ref: [#241](https://github.com/foomakers/pair/issues/241), G1. |
| Macro-fase (Macro-phase) | One of the two autonomous AI phases — **refinement** (Draft→Ready) and **implementation** — whose boundary is a checkpoint. Ref: G2/G5, D8. |
| Supervisore (Supervisor) | The evolution from orchestrator to supervisor: autonomous phases advance via a declarative `pair-next` loop, guardrailed by classification tags, with explicit human-intervention points. Ref: G10, D9. |
| Discovery level | Whether a brainstorm explores **broad** (a feature/initiative spanning several capabilities) or **punctual** (a single story) scope; deduced from the `$root` issue type, or asked as the first interview question. Ref: [#230](https://github.com/foomakers/pair/issues/230), Q7. |
| Discovery orientation | Whether a brainstorm reads a scope as **functional** (business capability) or **technical** (contexts/integrations); deduced from the `$root` issue's tags (`tech`/`tech-debt`/`infra` ⇒ technical), which win over the type-derived default. Ref: [#230](https://github.com/foomakers/pair/issues/230), R3.2. |
| Raw requirements blob | The unstructured output of a brainstorm's interview phase — findings per sub-question, open items, flagged assumptions — carried into the domain phase; never written to the PM tool as-is. Ref: [#230](https://github.com/foomakers/pair/issues/230), R3.7. |
| Candidate tree | The set of proposed vertical slices a discovery or decomposition pass produces, triaged EXTEND-vs-CREATE against the existing backlog *before* any write. Ref: [to-issues triage](../../../knowledge/guidelines/technical-standards/ai-development/skill-conventions/to-issues-triage.md), [#230](https://github.com/foomakers/pair/issues/230), R3.1. |
| Automation policy | The project's `tech/automation.md` adoption delta declaring how much of the delivery flow may run unattended — eligibility, auto-advance, stop predicate, `max_parallelism`, audit location. Optional; absent ⇒ automation off (D21). Ref: [automation-policy.md](../../../knowledge/guidelines/collaboration/automation/automation-policy.md), ADR-017 §6, [#250](https://github.com/foomakers/pair/issues/250). |
| Eligibility filter | The single `risk:*` (or renamed tag-family) label an unattended run may pick up at all — a label predicate over tags `classify` already emits, never a dedicated tag of its own. Ref: [#216](https://github.com/foomakers/pair/issues/216), [#250](https://github.com/foomakers/pair/issues/250). |
| Dependency analysis | `pair-loop`'s per-iteration derivation of card ordering (from declared PM-tool links, a dependent held out until its prerequisite is *merged*) and parallel safety (from each card's declared mutex resources) — transparent (audited) and overridable (narrowing only). Ref: [#250](https://github.com/foomakers/pair/issues/250). |
| Mutex resource | A shared skill, file, or module a card's declared touched surface names; two cards sharing one are never placed in the same parallel batch. Ref: [#250](https://github.com/foomakers/pair/issues/250). |
| `max_parallelism` | The user-set ceiling on `pair-loop`'s parallel batch size (`min(dependency-allowed, max_parallelism)`) — a single global integer with an optional per-tier override; a ceiling, never a target. Ref: ADR-017 §6, [#250](https://github.com/foomakers/pair/issues/250). |
| Stop predicate | A `<selector> ⇒ <condition>` expression (over canonical macrostates/tags, never issue-body content) plus a mandatory max-iterations backstop, ending an unattended `pair-loop` run at whichever bound is reached first. Ref: [#250](https://github.com/foomakers/pair/issues/250), D18. |
| Continue-token | The re-invocation line (`pair-loop --root … --iteration n+1`) the portable `/loop` skill prints after its degraded one-card path, letting the caller resume with no new persistence format. Ref: ADR-017 §4-5, [#250](https://github.com/foomakers/pair/issues/250). |
| Audit trail | The append-only, per-iteration record an unattended `pair-loop` run writes under the working area (`## Audit Location`) — every selection, exclusion, and stop reconstructable by a human; an unwritable destination fails the run rather than proceeding unaudited. Ref: [#250](https://github.com/foomakers/pair/issues/250), D14. |

## Entities

Domain entities and aggregates owned by this subdomain.

| Entity | Description |
| --- | --- |
| Collaboration artifact | An epic, story, or task and its refinement outputs — the shared work products Pair orchestrates collaboratively. Catalog data owner: collaboration artifacts. |
| Decision log | The record of workflow decisions and their outcomes over the project's life. Catalog data owner: decision logs. |
| Workflow state | The current macrostato of a work item; the value the state mapping resolves board labels to. Catalog data owner: workflow states. |
| Checkpoint / Handoff | Resumable progress state (story, branch, tasks done, decisions, remaining todos) written under `.pair/working/checkpoints/<story-id>.md`; the boundary primitive a zero-context session or subagent resumes from between macro-phases. Ref: `pair-capability-checkpoint`, D8, G5. |

## Rules and Invariants

Business rules scoped to this subdomain. Domain-wide rules stay in `context-map.md`'s Common Rules — not duplicated here.

- **Skills never read board state names directly** — they resolve every state through the state mapping to a macrostato. Violation: a skill hardcodes a board label and breaks on any project that renamed it. Ref: [ADR canonical-states](../../tech/adr/adr-011-canonical-states-state-mapping.md), D3.
- **The macro-phase boundary is a checkpoint.** A fresh, zero-context session or subagent resumes from the checkpoint rather than re-deriving state. Violation: lost context and duplicated work across the refinement→implementation handoff. Ref: D8.
- **Discovery never touches the PRD.** A brainstorm writes to the backlog (Draft items) and to domain context files only; a finding that changes product vision is surfaced as a `/pair-process-specify-prd` recommendation. Violation: product vision mutated by an exploratory session, outside the PRD's own review path. Ref: [#230](https://github.com/foomakers/pair/issues/230), R3.4.
- **Human gates are explicit; auto-advance is opt-in and fail-closed.** 🟡/🔴 review approval and state promotions always require a human; the supervisor (`pair-loop`) holds no classification logic of its own (grep-verifiable, D18) — it only ever *enacts* the quality model's existing per-tier policy. Auto-merge for `risk:green` exists but ships **off** (`## Auto-Advance` defaults to `(none)`) until a project explicitly opts in, and even then the loop verifies the gate set itself rather than trusting branch protection. Violation: the loop merges an unreviewed/non-green tier, or a project's shipped default merges unattended before anyone enabled it. Ref: G10, D9, [#250](https://github.com/foomakers/pair/issues/250).
