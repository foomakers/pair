# How Pair Works

## Overview

Pair is a CLI tool that solves a concrete problem: when developers and AI assistants collaborate, they lack structured, shared resources. Generated code is inconsistent across sessions, the AI hallucinates due to missing context, and decisions drift away from the team's adopted standards.

The solution is a **Knowledge Base (KB)** — a structured set of documents (guidelines, how-tos, architecture decisions, standards, templates) that gets **installed into your project** (in the `.pair/` folder) and provides persistent context to AI assistants like Claude, Copilot, or Cursor.

Think of it as onboarding documentation for your AI teammate: instead of explaining everything from scratch every session, you give it a comprehensive manual that it reads and follows.

## What Gets Installed

When you run `pair install`, the CLI creates a `.pair/` folder and optionally a `.skills/` folder in your project:

```
.pair/
  knowledge/                    # Reference material (the "how to")
    way-of-working.md           # The development process definition
    getting-started.md          # Onboarding guide
    how-to/                     # 11 step-by-step process guides
    guidelines/                 # Technical standards (architecture, testing, code design...)
    assets/                     # Templates (PRD, checklist, etc.)
  adoption/                     # Your decisions (the "what we chose")
    product/                    # PRD, subdomain definitions
    tech/                       # Architecture, tech stack, infrastructure, ADRs

.skills/                        # Agent skills (agentskills.io standard)
  navigator/next/SKILL.md       # Example: /next skill for task navigation
  ...
```

The **knowledge/** section is the shared reference material — process guides and technical standards that apply broadly. The **adoption/** section is where **your project's specific decisions** are recorded: which tech stack you chose, what architecture pattern you follow, what your way of working is. The **.skills/** directory contains **agent skills** — structured instructions that AI assistants can discover and execute, following the [Agent Skills](https://agentskills.io) open standard.

## The Development Process — End to End

Pair defines a structured lifecycle with four levels, each with specific how-to guides that the AI follows.

### Level 1: Induction (one-time setup)

This happens once when starting a new project.

#### Step 1 — Create the PRD

You tell the AI: *"I need to build a task management app for small teams."*

The AI reads `how-to/01-how-to-create-PRD.md` and `assets/PRD_template.md`, then follows a 4-phase process:

1. **Template analysis** — Studies the 13-section PRD template
2. **Information gathering** — Asks structured questions: *"Who are the target users? What pain points are you solving? What KPIs do you want to measure?"*
3. **Writing** — Generates the PRD following the exact template, with Vision, Problem Statement, Features (P0/P1/P2), Technical Considerations, Timeline
4. **Review** — Submits the document for iterative approval

**Output**: `.pair/adoption/product/PRD.md` — your approved product requirements.

#### Step 2 — Complete the Bootstrap Checklist

The AI reads `how-to/02-how-to-complete-bootstrap-checklist.md` and `assets/bootstrap-checklist.md`, then guides you through technical decisions:

1. **Project categorization** — Type A (Pet/PoC), Type B (Startup), Type C (Enterprise)
2. **Technical choices** via structured checklists:
   - Architecture: Monolith vs microservices?
   - Tech Stack: Language, framework, database, testing tools
   - Infrastructure: Deployment strategy, CI/CD
   - Way of Working: Kanban vs Scrum, branching strategy

**Output**: Five decision documents in `.pair/adoption/tech/`:

```
.pair/adoption/tech/
  architecture.md       # "Monolith, REST API, SQLite"
  tech-stack.md         # "TypeScript 5.x, React 19, Vitest 3.x, ..."
  infrastructure.md     # "Vercel, GitHub Actions"
  ux-ui.md              # "shadcn/ui, responsive, desktop-first"
  way-of-working.md     # "Kanban, feature branches, squash merge"
```

From this point on, every time the AI generates code, **it reads these files** and stays aligned with your choices.

#### Step 3 — Create and Prioritize Initiatives

The AI reads `how-to/03-how-to-create-and-prioritize-initiatives.md`, extracts objectives from the PRD, and proposes prioritized initiatives:

- **P0**: Core Task Management (CRUD tasks, list view, status)
- **P1**: Team Collaboration (assign tasks, share lists)
- **P2**: Advanced Features (labels, due dates, search)

Initiatives are created as issues in your PM tool (GitHub Projects).

### Level 2: Strategic Planning (per initiative)

#### Step 4 — Break Down into Epics

The AI reads `how-to/06-how-to-breakdown-epics.md` and decomposes initiatives into manageable epics:

- **Epic 0**: Project Setup (bootstrap repo, CI/CD, dev environment) — 1 sprint
- **Epic 1**: Task CRUD (create, read, update, delete tasks) — 2 sprints
- **Epic 2**: Task Organization (lists, status, filtering) — 2 sprints

Each epic is created as an issue with a standardized template.

### Level 3: Customer-Facing Iterations (per epic)

#### Step 5 — Break Down into User Stories

The AI reads `how-to/07-how-to-breakdown-user-stories.md` and applies **vertical slicing**:

- US-1: *"As a user, I want to create a task with title and description"*
- US-2: *"As a user, I want to see my task list"*
- US-3: *"As a user, I want to edit an existing task"*
- US-4: *"As a user, I want to delete a task"*

Each story is validated against the **INVEST** framework (Independent, Negotiable, Valuable, Estimable, Small, Testable).

#### Step 6 — Refine User Stories

The AI reads `how-to/08-how-to-refine-a-user-story.md` and adds **acceptance criteria** in Given-When-Then format:

```
Given: the user is on the main page
When:  they click "New Task" and enter the title "Buy milk"
Then:  the task appears in the list with status "Todo"

Given: the user tries to create a task without a title
When:  they click "Save"
Then:  an error message appears: "Title is required"
```

Plus technical analysis: API endpoints, DB schema, UI components, risks.

### Level 4: Sprint Execution (per story)

#### Step 7 — Create Tasks

The AI reads `how-to/09-how-to-create-tasks.md` **and** the adopted standards in `.pair/adoption/tech/`. It generates tasks that **respect the architectural decisions**:

```
[ ] Task 1: Create SQLite schema for tasks table
    → Ref: architecture.md (SQLite), tech-stack.md (drizzle-orm)

[ ] Task 2: Implement POST /api/tasks endpoint
    → Ref: architecture.md (REST API)

[ ] Task 3: Create CreateTaskForm component with shadcn/ui
    → Ref: ux-ui.md (shadcn/ui), tech-stack.md (React 19)

[ ] Task 4: Write E2E test for the creation flow
    → Ref: testing guidelines (Vitest, Playwright)
```

Every task references specific adoption documents. The AI does not improvise — it follows constraints.

#### Step 8 — Implement

The AI reads `how-to/10-how-to-implement-a-task.md` and follows a strict process:

**Phase 0 — Analysis** (blocking: no code is written without full understanding):
- Reads the user story and all tasks
- Reads `adoption/tech/architecture.md`, `tech-stack.md`
- Reads relevant guidelines (code-design, testing)

**Phase 1 — Setup**:
- Creates a feature branch: `feat/US-1-create-task-api`

**Phase 2 — TDD** (mandatory for development tasks):

- **RED**: Write the test first — `POST /api/tasks` with valid body returns 201
- **GREEN**: Write the minimum code to make the test pass
- **REFACTOR**: Improve the code while keeping tests green, applying SOLID principles from `guidelines/code-design/`

Critical constraint: the AI **never modifies tests and implementation in the same session**. Tests first, then code.

During implementation, the AI continuously consults:
- `guidelines/code-design/design-principles/` for SOLID, pure functions, error handling
- `guidelines/testing/` for AAA pattern, 80% minimum coverage
- `guidelines/technical-standards/` for naming, git workflow
- `adoption/tech/tech-stack.md` to use adopted libraries only

#### Step 9 — Code Review

The AI reads `how-to/11-how-to-code-review.md` and performs a structured review:

**Phase 1 — Technical Standards Validation** (blocking):
- Verifies that libraries used match `tech-stack.md`
- If a new library is introduced without an ADR → **BLOCKS** and requests ADR creation
- Verifies adherence to `architecture.md`

**Phase 2 — Requirements Validation**:
- Every acceptance criterion covered?
- All tasks completed?
- Business logic correct?

**Phase 3 — Report**:
Generates a structured report with a decision: `APPROVED`, `CHANGES REQUESTED`, or `TECH DEBT CREATION`.

## Why It Works

| Problem | How Pair Solves It |
|---------|--------------------|
| Inconsistent code across sessions | The AI always reads the same `adoption/tech/*.md` files |
| AI hallucinating libraries/patterns | `tech-stack.md` lists adopted libraries; review blocks deviations |
| Decisions not aligned with team | Every task references specific adoption documents |
| Unstructured process | 11 how-to guides define every step from idea to merge |
| Variable quality | 18-point Definition of Done + automated quality gates |
| Slow onboarding | New dev (or AI) reads `.pair/` and has full context |

## KB Management

The Knowledge Base follows a lifecycle managed by the `pair` CLI:

1. **Packaging** — `pair package` creates a distributable ZIP from `.pair/` with a `manifest.json` (version, checksums, file list)
2. **Release** — CI publishes the ZIP as a GitHub Release artifact with SHA256 checksum
3. **Install** — `pair install` downloads the KB (from GitHub releases, custom URL, or local ZIP), validates it, caches it at `~/.pair/kb/{version}/`, and copies it into the target project
4. **Update** — `pair update` refreshes an existing installation
5. **Link Processing** — `pair update-link` normalizes internal markdown links after installation

### Source Resolution

The CLI supports three KB sources with this precedence:

1. `--source` flag — Remote URL, local ZIP, or local directory
2. Monorepo default — `packages/knowledge-hub/dataset` (during development)
3. GitHub Release auto-download — Automatic fallback with progress bar, resume support, and checksum validation

### Asset Registries

The CLI uses five asset registries, each with a specific copy behavior:

| Registry | Behavior | Target(s) | Description |
|----------|----------|-----------|-------------|
| `github` | mirror | `.github` | GitHub workflows and configuration |
| `knowledge` | mirror | `.pair/knowledge` | Knowledge base and documentation |
| `adoption` | add | `.pair/adoption` | Adopted decisions (never overwrites) |
| `agents` | mirror | `AGENTS.md` | AI agent configuration |
| `skills` | mirror | `.claude/skills/` (canonical), `.github/skills/` + `.cursor/skills/` (symlinks) | Agent skills distributed to AI tool directories |

The `mirror` behavior synchronizes content (overwrites and removes stale files). The `add` behavior only copies files that don't already exist, preserving your project-specific adoption decisions.

The `skills` registry uses **flatten** and **prefix** transforms to convert skill directory hierarchies (e.g., `navigator/next`) into flat, prefixed names (e.g., `pair-navigator-next`) suitable for AI tool skill directories. It also uses **multi-target distribution**: the canonical copy goes to `.claude/skills/`, then symlinks are created for `.github/skills/` and `.cursor/skills/` so all AI tools share the same skill definitions.

## Further Reading

- **[Quick Start Guide](getting-started/01-quickstart.md)** — Install and run pair in minutes
- **[CLI Commands Reference](cli/commands.md)** — Complete command documentation
- **[CLI Help Examples](cli/help-examples.md)** — Copy-paste ready examples
- **[Way of Working](.pair/knowledge/way-of-working.md)** — Full process definition
