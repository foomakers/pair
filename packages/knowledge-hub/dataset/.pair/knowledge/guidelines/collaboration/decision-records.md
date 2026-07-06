# Decision Records: ADR, ADL, and DDR

## Overview

Decision records capture the **why** behind technical and domain choices. Three mutually exclusive formats exist:

- **ADR (Architecture Decision Record)** — for architectural decisions that affect system structure, patterns, service boundaries, or quality attributes.
- **ADL (Adoption Decision Log)** — for non-architectural decisions such as library choices, convention adoptions, tooling preferences, and process decisions.
- **DDR (Domain Decision Record)** — for domain decisions that are hard to reverse, surprising without context, and involve a real trade-off. A candidate that fails any of these three criteria is recorded as an ADL or an inline context-map note instead — the criteria act as a gate, not a preference.

**Adoption files** (`.pair/adoption/`) capture the **what** — the current state of facts. Decision records capture the **why** — the rationale behind those facts. For DDR specifically, the "what" lives in the domain context file (`context-map.md` or `<slug>.context.md`), not the tech adoption files — see [DDR Format](#ddr-format).

## ADR vs ADL vs DDR

| Aspect             | ADR                                          | ADL                                          | DDR                                          |
| ------------------ | -------------------------------------------- | -------------------------------------------- | --------------------------------------------- |
| **Scope**          | Architectural decisions                      | Non-architectural decisions                  | Domain decisions (business rules, terms, behavior) |
| **Examples**       | Service boundaries, data flow patterns, API design, infrastructure topology | Library choice, coding conventions, PM tool selection, estimation methodology | Business rule, glossary term, domain behavior meeting the 3-criteria gate |
| **Directory**      | `adoption/tech/adr/`                         | `adoption/decision-log/`                     | `adoption/product/ddr/`                       |
| **Template**       | [adr-template.md](templates/adr-template.md) | [adl-template.md](templates/adl-template.md) | [ddr-template.md](templates/ddr-template.md)  |
| **File naming**    | `YYYY-MM-DD-<topic>.md`                      | `YYYY-MM-DD-<topic>.md`                      | `ddr-NNN-<topic>.md` (sequential)             |
| **Sync target**    | Adoption files (tech-stack, architecture, way-of-working) | Adoption files | Context map (`context-map.md` or `<slug>.context.md`) — never allowed to diverge |
| **Gate**           | None — any architectural decision qualifies  | None — any non-architectural decision qualifies | 3 criteria (hard to reverse AND surprising without context AND real trade-off) |
| **Adoption/context update** | Always required                      | Always required                              | Always required (context sync)                |

**Mutual exclusivity**: A decision goes to exactly one of ADR, ADL, or DDR, never more than one. Routing:

- "Does this change the system's structure or boundaries?" → **ADR**.
- "Is it a domain rule/term/behavior meeting all 3 DDR criteria?" → **DDR**.
- Otherwise → **ADL** (also the fallback for a domain candidate that fails the DDR gate).
- Ambiguous ADR vs DDR: domain-behavior impact → DDR; system-structure impact → ADR. Ask when unclear.

## File Naming Convention

ADR and ADL use date-based naming: `YYYY-MM-DD-<topic>.md`

- **Date**: The date the decision was made (ISO 8601).
- **Topic**: Short kebab-case description (e.g., `streaming-downloads`, `date-library-choice`).
- **One file per decision**: Each decision entry gets its own file.
- **Sortable**: Files sort chronologically by default.

Examples:

- `2026-01-15-tty-detection-pattern.md` (ADR — architectural pattern)
- `2026-02-01-vitest-adoption.md` (ADL — library choice)

DDR uses sequential naming instead: `ddr-NNN-<topic>.md`

- **NNN**: Zero-padded 3-digit sequence number, incremented from the highest existing `ddr-NNN` in `adoption/product/ddr/` (starts at `001`).
- **Topic**: Short kebab-case description of the domain rule (e.g., `refund-window-30-days`).
- Rationale for the different convention: domain rules are referenced by number in brainstorm/refine conflict flags, and supersede chains read more naturally as `ddr-003 supersedes ddr-001` than as date deltas.

Example:

- `ddr-001-refund-window-30-days.md` (DDR — domain rule)

## ADL Format

The ADL template captures non-architectural decisions with these sections:

### Required Sections

1. **Date** — When the decision was made (YYYY-MM-DD)
2. **Status** — `Active` or `Superseded by ADL-YYYY-MM-DD-<topic>`
3. **Category** — One of: Library Choice, Convention Adoption, Tooling Preference, Process Decision
4. **Context** — What prompted this decision (problem, need, or opportunity)
5. **Decision** — What was decided and why (name the specific choice and rationale)
6. **Alternatives Considered** — Other options evaluated and why they were not chosen
7. **Consequences** — Impact on the project (what changes as a result)
8. **Adoption Impact** — Which adoption files must be updated and the specific change required

See [adl-template.md](templates/adl-template.md) for the full template.

## ADR Format

The ADR template captures architectural decisions with these sections:

1. **Status** — `Proposed`, `Accepted`, `Deprecated`, or `Superseded by ADR-YYYY-MM-DD-<topic>`
2. **Date** — When the decision was made
3. **Context** — Business requirement or technical challenge, current system state, stakeholders
4. **Options Considered** — Each option with description, pros, and cons
5. **Decision** — Chosen solution and justification
6. **Consequences** — Benefits and trade-offs/limitations
7. **Adoption Impact** — Which adoption files must be updated

See [adr-template.md](templates/adr-template.md) for the full template.

## DDR Format

The DDR template captures domain decisions with these sections:

1. **Status** — `Proposed`, `Accepted`, or `Superseded by ddr-NNN-<topic>`
2. **Date** — When the decision was made
3. **Context** — Domain rule/term/behavior affected, plus evidence for each of the 3 gate criteria (hard to reverse, surprising without context, real trade-off)
4. **Decision** — The rule now in force; references the predecessor DDR if superseding one
5. **Consequences** — Benefits and trade-offs/limitations
6. **Context Map Impact** — Which context file (`context-map.md` or `<slug>.context.md`) reflects the rule and the exact entry changed

See [ddr-template.md](templates/ddr-template.md) for the full template.

## Directory Structure

```text
.pair/adoption/
├── tech/
│   ├── adr/                    # Architecture Decision Records
│   │   ├── .keep
│   │   └── YYYY-MM-DD-topic.md
│   ├── architecture.md         # Current architecture (WHAT)
│   ├── tech-stack.md           # Current tech stack (WHAT)
│   └── way-of-working.md       # Current process (WHAT)
├── decision-log/               # Adoption Decision Log (non-architectural)
│   ├── .keep
│   └── YYYY-MM-DD-topic.md
└── product/
    ├── ddr/                    # Domain Decision Records
    │   ├── .keep
    │   └── ddr-NNN-topic.md
    ├── context-map.md          # Current domain glossary/rules (WHAT), if present
    └── ...
```

## Workflow

Decision records are created via the `/record-decision` skill:

1. **Classify**: Is the decision architectural, non-architectural, or domain? For domain candidates, run the 3-criteria gate first.
2. **Write**: Create the decision file in the appropriate directory using the template.
3. **Update adoption/context**: Update the relevant adoption files (ADR/ADL) or the context map (DDR) to reflect the current state.
4. **Verify consistency**: Ensure decision file and adoption/context files are aligned.

## Lifecycle

- **Active**: The decision is current and applicable.
- **Superseded**: A newer decision replaces this one. The old file is updated with a reference to the new one. For DDR, the context map is updated to reflect only the new rule — it never carries both.
- Superseded decisions are kept for historical context — never deleted.

## Integration with Skills

| Skill              | Interaction with Decision Records                        |
| ------------------ | -------------------------------------------------------- |
| `/record-decision` | Creates ADR, ADL, or DDR; updates adoption files or context map |
| `/assess-stack`    | Composes `/record-decision` for tech stack decisions     |
| `/assess-*`        | Compose `/record-decision` for domain-specific decisions |
| `/implement`       | Composes `/record-decision` when implementation decisions arise |
| `/review`          | Composes `/record-decision` when review identifies undocumented decisions |
| `/verify-adoption` | Reads adoption files (informed by ADR/ADL) to check compliance |
