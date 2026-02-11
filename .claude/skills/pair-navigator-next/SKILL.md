---
name: pair-navigator-next
description: Determines the most relevant next action for your project by reading adoption files and PM tool state. Suggests which skill to invoke next. Use at the start of a session, when switching tasks, or whenever you need guidance on what to work on.
---

# /pair-navigator-next — Project Navigator

Analyze project state and recommend the single most relevant next skill to invoke.

## Algorithm

Execute these checks **in order**. Stop at the first match.

### Step 1: Read Adoption Files

Read the following files and classify each as **populated** or **template**:

| File | Template indicator |
|---|---|
| [.pair/adoption/product/PRD.md](../../../packages/knowledge-hub/dataset/.pair/adoption/product/PRD.md) | Contains `[Product/feature name]` or `[Creation date]` |
| [.pair/adoption/product/subdomain/README.md](../../../packages/knowledge-hub/dataset/.pair/adoption/product/subdomain/README.md) | Contains `[list here core subdomain]` or `[PROJECT_NAME]` |
| [.pair/adoption/tech/architecture.md](../../../packages/knowledge-hub/dataset/.pair/adoption/tech/architecture.md) | Contains only placeholder headings with no real content |
| [.pair/adoption/tech/tech-stack.md](../../../packages/knowledge-hub/dataset/.pair/adoption/tech/tech-stack.md) | Contains only placeholder headings with no real content |
| [.pair/adoption/tech/boundedcontext/README.md](../../../packages/knowledge-hub/dataset/.pair/adoption/tech/boundedcontext/README.md) | Contains only placeholder headings with no real content |
| [.pair/adoption/tech/way-of-working.md](../../../packages/knowledge-hub/dataset/.pair/adoption/tech/way-of-working.md) | No PM tool specified or only template text |

**Template detection rule**: A file is a template if it contains square-bracket placeholders (e.g., `[Product/feature name]`) or if its substantive sections contain no project-specific content.

### Step 2: Cascade — Fresh Project Detection

| # | Condition | Suggestion | Rationale |
|---|-----------|------------|-----------|
| 1 | PRD.md is template | `/specify-prd` | Product vision must come first |
| 2 | PRD.md populated AND 3+ tech adoption files are templates | `/bootstrap` | Project needs foundational setup |
| 3 | subdomain/README.md is template | `/map-subdomains` | Domain decomposition needed |
| 4 | boundedcontext/README.md is template | `/map-contexts` | Architecture boundaries needed |

If any of the above matched, output the suggestion and stop.

### Step 3: Cascade — Established Project Detection

All adoption files are populated. Query the PM tool to determine backlog state.

**PM tool discovery**: Read [.pair/adoption/tech/way-of-working.md](../../../packages/knowledge-hub/dataset/.pair/adoption/tech/way-of-working.md) to identify the PM tool (GitHub Projects, Jira, Linear, etc.) and access method.

| # | Condition | Suggestion | Rationale |
|---|-----------|------------|-----------|
| 5 | No initiatives or epics exist in PM tool | `/plan-initiatives` | Strategic planning needed |
| 6 | Initiatives exist but no epics | `/plan-epics` | Epic decomposition needed |
| 7 | Epics exist but no user stories | `/plan-stories` | Story breakdown needed |
| 8 | Stories exist without acceptance criteria or with `status:draft` | `/refine-story` | Stories need refinement before work |
| 9 | Refined stories exist but have no task breakdown | `/plan-tasks` | Tasks must be created before implementation |
| 10 | Tasks in "ready" or "todo" state exist | `/pair-process-implement` | Work is ready to start |
| 11 | Open pull requests or tasks in "review" state | `/review` | Code review pending |

If no condition matched, all work is complete for the current iteration.

### Step 4: Fallback

If no condition matched in Steps 2-3:

> All adoption files are populated and no actionable backlog items detected.
> Consider: starting a new iteration with `/plan-stories`, or running `/review`
> to check for open items.

## Output Format

Present results as:

```
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

- If a suggested skill is not installed, tell the user which skill is needed and where to find it.
- If the PM tool is not accessible (no MCP connection, no credentials), skip Step 3 and report: "PM tool not accessible — recommendation based on adoption files only."
- If adoption files cannot be read (not installed yet), suggest `/bootstrap` as the entry point.

## Notes

- This skill is read-only: it inspects state but never modifies files or PM tool data.
- When multiple items are actionable (e.g., tasks to implement AND PRs to review), prefer the item closest to delivery (`/review` > `/pair-process-implement` > `/plan-tasks`).
- Re-run `/pair-navigator-next` after completing any skill to get an updated recommendation.
