# Decision Records: ADR and ADL

## Overview

Decision records capture the **why** behind technical choices. Two mutually exclusive formats exist:

- **ADR (Architecture Decision Record)** — for architectural decisions that affect system structure, patterns, service boundaries, or quality attributes.
- **ADL (Adoption Decision Log)** — for non-architectural decisions such as library choices, convention adoptions, tooling preferences, and process decisions.

**Adoption files** (`.pair/adoption/`) capture the **what** — the current state of facts. Decision records capture the **why** — the rationale behind those facts.

## ADR vs ADL

| Aspect             | ADR                                          | ADL                                          |
| ------------------ | -------------------------------------------- | -------------------------------------------- |
| **Scope**          | Architectural decisions                      | Non-architectural decisions                  |
| **Examples**       | Service boundaries, data flow patterns, API design, infrastructure topology | Library choice, coding conventions, PM tool selection, estimation methodology |
| **Directory**      | `adoption/tech/adr/`                         | `adoption/decision-log/`                     |
| **Template**       | [adr-template.md](templates/adr-template.md) | [adl-template.md](templates/adl-template.md) |
| **File naming**    | `YYYY-MM-DD-<topic>.md`                      | `YYYY-MM-DD-<topic>.md`                      |
| **Adoption update**| Always required                              | Always required                              |

**Mutual exclusivity**: A decision goes to ADR **or** ADL, never both. If unsure, ask: "Does this change the system's structure or boundaries?" If yes → ADR. If no → ADL.

## File Naming Convention

Both ADR and ADL use date-based naming: `YYYY-MM-DD-<topic>.md`

- **Date**: The date the decision was made (ISO 8601).
- **Topic**: Short kebab-case description (e.g., `streaming-downloads`, `date-library-choice`).
- **One file per decision**: Each decision entry gets its own file.
- **Sortable**: Files sort chronologically by default.

Examples:

- `2026-01-15-tty-detection-pattern.md` (ADR — architectural pattern)
- `2026-02-01-vitest-adoption.md` (ADL — library choice)

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
    └── ...
```

## Workflow

Decision records are created via the `/pair-capability-record-decision` skill:

1. **Classify**: Is the decision architectural or non-architectural?
2. **Write**: Create the decision file in the appropriate directory using the template.
3. **Update adoption**: Update the relevant adoption files to reflect the current state.
4. **Verify consistency**: Ensure decision file and adoption files are aligned.

## Lifecycle

- **Active**: The decision is current and applicable.
- **Superseded**: A newer decision replaces this one. The old file is updated with a reference to the new one.
- Superseded decisions are kept for historical context — never deleted.

## Integration with Skills

| Skill              | Interaction with Decision Records                        |
| ------------------ | -------------------------------------------------------- |
| `/pair-capability-record-decision` | Creates ADR or ADL, updates adoption files               |
| `/pair-capability-assess-stack`    | Composes `/pair-capability-record-decision` for tech stack decisions     |
| `/assess-*`        | Compose `/pair-capability-record-decision` for domain-specific decisions |
| `/pair-process-implement`       | Composes `/pair-capability-record-decision` when implementation decisions arise |
| `/pair-process-review`          | Composes `/pair-capability-record-decision` when review identifies undocumented decisions |
| `/pair-capability-verify-adoption` | Reads adoption files (informed by ADR/ADL) to check compliance |
