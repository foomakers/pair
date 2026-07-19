---
name: next
description: "Determines the most relevant next action for your project by reading adoption files and PM tool state. Suggests which skill to invoke next. Use at the start of a session, when switching tasks, or whenever you need guidance on what to work on."
version: 0.4.2
author: Foomakers
---

# /next — Project Navigator

Analyze project state and recommend the single most relevant next skill to invoke. Covers the full 38-skill catalog across all lifecycle phases.

## Skill Catalog (38 skills)

The catalog is **derived from the installed corpus**: every skill directory under `.skills/` must appear here — 9 process + 28 capability + `/next` itself = 38. If an installed skill is missing from these tables (or a row names a skill that is not installed), the catalog has drifted: update the tables, the stated counts, and the cascade rows together.

### Process Skills (9)

| Skill              | Lifecycle Phase    | Description                                     |
| ------------------ | ------------------ | ----------------------------------------------- |
| `/specify-prd`     | Induction          | Create or update Product Requirements Document  |
| `/bootstrap`       | Induction          | Orchestrate full project setup                  |
| `/plan-initiatives`| Strategic          | Create strategic initiatives from PRD           |
| `/plan-epics`      | Strategic          | Break initiatives into epics                    |
| `/plan-stories`    | Sprint Planning    | Break epics into user stories                   |
| `/refine-story`    | Sprint Planning    | Refine story with AC and technical analysis     |
| `/plan-tasks`      | Sprint Planning    | Break story into implementation tasks           |
| `/implement`       | Sprint Execution   | Implement story tasks with TDD                  |
| `/review`          | Sprint Execution   | Review PR through structured phases             |

### Capability Skills (28)

| Skill                    | Category        | Description                                                                  |
| ------------------------ | --------------- | ---------------------------------------------------------------------------- |
| `/map-subdomains`        | Domain Modeling | Scoped DDD subdomain placement (+ Volatility)                                |
| `/map-contexts`          | Domain Modeling | Scoped DDD bounded-context placement + relationship assessment               |
| `/classify`              | Classification  | Apply the quality model → risk/cost matrix + tags (composed by refine-story, review) |
| `/grill`                 | Alignment       | Interview engine: explore a topic or sync on a story, one question at a time |
| `/record-decision`       | Decision        | Record ADR or ADL with adoption update                                       |
| `/checkpoint`            | Session State   | Write/resume story progress checkpoint (work survives context resets)        |
| `/publish-pr`            | Delivery        | Publish a story branch as a PR: gate, PR from template, tags, board state    |
| `/write-issue`           | PM Tool         | Create/update issues in adopted PM tool                                      |
| `/setup-pm`              | PM Tool         | Configure project management tool                                            |
| `/verify-quality`        | Quality         | Check quality gates against codebase                                         |
| `/verify-done`           | Quality         | Check Definition of Done criteria                                            |
| `/verify-adoption`       | Quality         | Check code against adoption files per scope                                  |
| `/assess-stack`          | Assessment      | Assess tech stack (lifecycle-spanning)                                       |
| `/assess-architecture`   | Assessment      | Assess architecture pattern                                                  |
| `/assess-testing`        | Assessment      | Assess testing strategy                                                      |
| `/assess-ai`             | Assessment      | Assess AI development tools                                                  |
| `/assess-methodology`    | Assessment      | Assess development methodology                                               |
| `/assess-pm`             | Assessment      | Assess project management tool                                               |
| `/assess-infrastructure` | Assessment      | Assess infrastructure strategy                                               |
| `/assess-observability`  | Assessment      | Assess observability strategy                                                |
| `/assess-security`       | Assessment      | Assess security posture (review verdict + one-shot audit)                    |
| `/analyze-debt`          | Analysis        | Analyze technical debt with prioritization                                   |
| `/analyze-code-quality`  | Analysis        | Analyze code quality with metrics                                            |
| `/estimate`              | Planning        | Estimate story using adopted methodology                                     |
| `/setup-gates`           | Configuration   | Configure CI/CD quality gates                                                |
| `/manage-flags`          | Configuration   | Manage feature flag lifecycle                                                |
| `/design-manual-tests`   | Testing         | Generate manual test suite from project analysis                             |
| `/execute-manual-tests`  | Testing         | Execute manual test suite + generate report                                  |

## Algorithm

Execute these checks **in order**. Stop at the first match.

### Step 1: Read Adoption Files

Read the following files and classify each as **populated** or **template**:

| File                                                                                               | Template indicator                                        |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| [.pair/adoption/product/PRD.md](../../.pair/adoption/product/PRD.md)                               | Contains `[Product/feature name]` or `[Creation date]`    |
| [.pair/adoption/product/subdomain/README.md](../../.pair/adoption/product/subdomain/README.md)     | Contains `[list here core subdomain]` or `[PROJECT_NAME]` |
| [.pair/adoption/tech/architecture.md](../../.pair/adoption/tech/architecture.md)                   | Contains only placeholder headings with no real content   |
| [.pair/adoption/tech/tech-stack.md](../../.pair/adoption/tech/tech-stack.md)                       | Contains only placeholder headings with no real content   |
| [.pair/adoption/tech/boundedcontext/README.md](../../.pair/adoption/tech/boundedcontext/README.md) | Contains only placeholder headings with no real content   |
| [.pair/adoption/tech/way-of-working.md](../../.pair/adoption/tech/way-of-working.md)               | No PM tool specified or only template text                |

**Template detection rule**: A file is a template if it contains square-bracket placeholders (e.g., `[Product/feature name]`) or if its substantive sections contain no project-specific content.

### Step 2: Cascade — Fresh Project Detection

| #   | Condition                                                 | Suggestion        | Rationale                        |
| --- | --------------------------------------------------------- | ----------------- | -------------------------------- |
| 1   | PRD.md is template                                        | `/specify-prd`    | Product vision must come first   |
| 2   | PRD.md populated AND 3+ tech adoption files are templates | `/bootstrap`      | Project needs foundational setup |

If any of the above matched, output the suggestion and stop.

> DDD domain mapping (`/map-subdomains`, `/map-contexts`) is a scoped capability, not a mandatory fresh-project step — it is invoked by `/plan-initiatives`, `/plan-epics`, `/refine-story`, `/plan-tasks`, or `/bootstrap` when they touch a capability/context, not suggested directly here. Projects without DDD artifacts fall back to "system areas" gracefully — no HALT.

### Step 3: Cascade — Established Project Detection

All adoption files are populated. Query the PM tool to determine backlog state.

**PM tool discovery**: Read [.pair/adoption/tech/way-of-working.md](../../.pair/adoption/tech/way-of-working.md) to identify the PM tool (GitHub Projects, Jira, Linear, etc.) and access method.

**State resolution**: The conditions below refer to canonical **macrostates** (`Draft`, `Ready`, `In Progress`, `Review`, `Done`), never board-specific labels. Resolve each item's board state to a macrostate via the `## State Mapping` section in way-of-working.md — omitted ⇒ canonical names are assumed. See [canonical-states.md](../../.pair/knowledge/guidelines/collaboration/project-management-tool/canonical-states.md) for the full resolution rule. When a board can't distinguish `Draft` from `Ready` (no dedicated Ready column), apply the Readiness Fallback: evaluate the [Definition of Ready criteria](../../.pair/knowledge/guidelines/collaboration/project-management-tool/definition-of-ready-and-done.md) against the item instead of guessing from the board-state name.

| #   | Condition                                                        | Suggestion          | Rationale                                   |
| --- | ---------------------------------------------------------------- | ------------------- | ------------------------------------------- |
| 3   | No initiatives or epics exist in PM tool                         | `/plan-initiatives` | Strategic planning needed                   |
| 4   | Initiatives exist but no epics                                   | `/plan-epics`       | Epic decomposition needed                   |
| 5   | Epics exist but no user stories                                  | `/plan-stories`     | Story breakdown needed                      |
| 6   | Open pull requests, or items resolve to macrostate `Review`       | `/review`           | Code review pending — closest to delivery   |
| 7   | A story resolves to macrostate `In Progress` AND its checkpoint file exists (`.pair/working/checkpoints/<story-id>.md`) | `/checkpoint` | Resume interrupted work (`$mode: resume`) before re-analysis |
| 8   | A story resolves to macrostate `In Progress` but has NO checkpoint file | `/implement`   | Continue the in-progress work — `/implement` re-derives state from scratch when no checkpoint exists |
| 9   | Stories resolve to macrostate `Ready` AND a task breakdown exists | `/implement`        | Work is ready to start                      |
| 10  | Stories resolve to macrostate `Ready` but have NO task breakdown  | `/plan-tasks`       | Tasks must be created before implementation |
| 11  | Stories resolve to macrostate `Draft` (missing acceptance criteria, or failing Definition of Ready via the Readiness Fallback) | `/refine-story` | Stories need refinement before work |

**Tie-break**: on a real backlog several of rows 6–11 can hold at once (e.g. Draft stories AND an open PR). Row order resolves this — rows are sorted by delivery proximity (`/review` > `/checkpoint` > `/implement` > `/plan-tasks` > `/refine-story`): evaluate top-to-bottom, stop at the first match. For a single item the distinguishing predicates (macrostate, checkpoint file present/absent, task breakdown present/absent) make rows 7–11 mutually exclusive; across items, row order decides. Every `In Progress` story matches row 7 or row 8 — the fallback (Step 5) is never reached for active work.

### Step 4: Capability Skill Suggestions

If no process skill matched in Steps 2-3, check for capability skill opportunities (same rule: evaluate in order, stop at the first match):

| #   | Condition                                                                | Suggestion           | Rationale                                      |
| --- | ------------------------------------------------------------------------ | -------------------- | ---------------------------------------------- |
| 12  | Quality gate not configured (no Quality Gates section in way-of-working) | `/setup-gates`       | Quality gates should be established             |
| 13  | Tech stack has unlisted dependencies detected                            | `/assess-stack`      | Stack registry needs updating                   |
| 14  | Technical debt flags present (TODO/FIXME/HACK comments detected)         | `/analyze-debt`      | Debt should be cataloged and prioritized        |
| 15  | No estimation methodology adopted in way-of-working                      | `/estimate`          | Estimation process should be established        |
| 16  | A backlog item or topic carries open questions or unclear scope (question markers, conflicting comments) that block planning | `/grill` | Structured one-question-at-a-time alignment before planning |

### Step 5: Fallback

If no condition matched in Steps 2-4:

> All adoption files are populated and no actionable backlog items detected.
> Consider: starting a new iteration with `/plan-stories`, or running `/review`
> to check for open items.

## Output Format

Present results as:

```text
PROJECT STATE:
├── PRD: [populated | template]
├── Bootstrap: [complete | incomplete — N/M adoption files populated]
├── Subdomains: [populated | template]
├── Bounded Contexts: [populated | template]
├── PM Tool: [tool name | not configured]
└── Backlog: [summary of current items]

RECOMMENDATION: /skill-name
REASON: [one-line explanation]
```

Then ask: "Shall I run `/skill-name`?"

## Graceful Degradation

See [graceful degradation](../../.pair/knowledge/skill-conventions/graceful-degradation.md) (PM tool not accessible → skip Step 3, recommend from adoption files only; adoption files missing → suggest `/bootstrap` as the entry point) for the standard scenarios. Additional cases:

- If a suggested skill is not installed, tell the user which skill is needed and where to find it.
- If way-of-working.md has no `## State Mapping` section, canonical macrostate names are assumed — this is the zero-configuration default, not a degradation.
- If a board can't distinguish `Draft` from `Ready` (no dedicated Ready column), apply the Readiness Fallback ([Definition of Ready criteria](../../.pair/knowledge/guidelines/collaboration/project-management-tool/definition-of-ready-and-done.md)) rather than treating row 11's condition as unresolvable.

## Notes

- This skill is read-only: it inspects state but never modifies files or PM tool data.
- Row order encodes the tie-break (delivery proximity) — see the **Tie-break** note under the Step 3 table.
- Re-run `/next` after completing any skill to get an updated recommendation.
- **Full catalog coverage**: nearly all of the 38 skills can be suggested — process skills via the cascading checks (Steps 2-3), capability skills via targeted checks (row 7 `/checkpoint`, rows 12-16 including `/grill`) or process-skill composition. `/publish-pr` will be reachable via `/implement` once wired (not yet composed), so `/next` cannot surface it today.
