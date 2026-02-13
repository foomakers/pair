# Skills in Knowledge Base — Design Specification

> Temporary design document. Will be converted to GitHub issues for implementation tracking.

## Overview

Introduce Agent Skills (agentskills.io open standard) into the pair Knowledge Base, transforming passive markdown documentation into executable, invocable skills that AI assistants can use directly.

## The Three Pillars of Pair KB

- **how-to/** = WHAT to do (process phases, 11 files)
- **guidelines/** = HOW to do it (multiple approaches, 9 categories)
- **adoption/** = WHICH choices were made (project-specific decisions)

---

## 1. Architecture

### Inverted Relationship

**Before**: Skill references how-to ("read and follow this file")
**After**: How-to orchestrates skills. How-to = workflow map, Skill = atomic executable unit.

```markdown
# How-to (thin, ~30-40% of current size)
## Phase 2: Technical Choices
1. `/assess-architecture` — Select architectural pattern
2. `/assess-testing` — Define test pyramid and framework
```

### Skill contains the operational logic

- Arguments (`$0`, `$1`)
- Tool restrictions (`allowed-tools`)
- Context management (`fork`)
- References to specific guidelines + adoption files
- The actual step-by-step process

### How-to ↔ Process Skill Split

How-to KEEPS (orchestration):

- Phase sequence and transitions
- HALT conditions and prerequisites
- Developer approval gates
- Decision trees (task type, review logic)
- WHY each phase exists
- State management structure

How-to LOSES → moves to skills (operational):

- Procedural operations (git, template filling, tool updates)
- Requirements gathering (questionnaires, question strategies)
- Technical analysis details (assessment frameworks)
- Report generation (review templates, task docs)
- Quality gate validation (specific checklists)

**Result: how-to reduces to ~30-40% of current size**

### Guidelines ↔ Capability Skill Split

Symmetric pattern:

- **How-to orchestrates, skill executes** (process axis)
- **Guideline educates, skill operates** (capability axis)

Guideline KEEPS:

- Educational content (WHY, trade-offs, background)
- All available options explained
- Rules and constraints
- Cross-references

Guideline LOSES → moves to capability skill:

- Decision matrices and frameworks
- Operational workflows
- Output format specifications
- Integration with adoption binding

Guidelines that DON'T lose anything (pure reference):

- code-design/design-principles/ — SOLID, FP, error handling
- code-design/framework-patterns/ — React/Fastify patterns
- code-design/code-organization/ — file structure patterns
- technical-standards/coding-standards/ — conventions
- collaboration/team/ — communication, roles
- collaboration/templates/ — consumed BY skills
- user-experience/ — design system, UI patterns
- quality-assurance/security/ — security constraints

### Zero Duplication Principle

- Operational procedure lives ONLY in the skill
- Educational/WHY content lives ONLY in the guideline
- Adoption produced by assess-* skills, consumed by process skills

---

## 2. Two-Dimensional Skill Model: Process vs Capability

Skills are organized along two orthogonal axes that map directly to the existing KB structure.

### Process Axis (from how-to)

Process skills follow the **development lifecycle**. Each maps 1:1 to a how-to file and represents a phase of the development process:

```text
Induction          Strategic            Iteration         Execution    Review
─────────────      ──────────           ──────────        ──────────   ──────
specify-prd   →    plan-initiatives →   plan-stories  →   implement →  review
bootstrap     →    map-subdomains  →    refine-story  →
               →   map-contexts    →    plan-tasks    →
               →   plan-epics      →
```

**Characteristics of process skills:**

- Sequential: they follow the lifecycle order (though not rigidly)
- Orchestrating: they COMPOSE capability skills to execute phases
- Stateful: they manage session state across phases
- Interactive: they have HALT conditions and developer approval gates
- Source: the operational detail migrates FROM how-to files

### Capability Axis (from guidelines)

Capability skills are **cross-cutting** — they can be invoked by any process skill at any lifecycle phase. They map to actionable parts of guidelines:

```text
Assessment          Workflow             Setup
(produce choice)    (produce artifact)   (one-time config)
──────────────      ──────────────       ──────────────
assess-architecture verify-quality       setup-pm
assess-testing      verify-done          setup-gates
assess-infra        record-decision
assess-observ       write-issue
assess-methodology  manage-flags
assess-pm
assess-ai
assess-debt
assess-code-quality
estimate
```

**Characteristics of capability skills:**

- Atomic: they do ONE thing well, no multi-phase orchestration
- Reusable: composed by multiple process skills
- Context-aware: they read adoption to know WHICH approach to use
- Source: the operational detail migrates FROM actionable guidelines

### How the Two Axes Interact

Process skills invoke capability skills at specific points in their workflow:

```text
PROCESS SKILL (lifecycle phase)
    │
    ├── reads adoption → knows WHICH choices are active
    │
    ├── invokes capability skills → they do the operational work
    │   ├── /verify-quality   (quality gates)
    │   ├── /record-decision  (when HALT for missing ADR)
    │   └── /write-issue      (format output for PM tool)
    │
    ├── manages flow → phases, transitions, approval gates
    │
    └── produces outcome → task implemented, PR created, story refined
```

Example — `/review` (process) composing capabilities:

```text
/review
  Phase 1: Technical Standards Validation
    → /verify-quality              ← capability/workflow
  Phase 2: Completeness Check
    → /verify-done                 ← capability/workflow
  Phase 3: Decision Points
    → /record-decision (if HALT)   ← capability/workflow
    → /assess-debt (if tech debt)  ← capability/assessment
  Phase 4: Report & Decision
    → produces review report       ← own logic
```

### Guidelines Actionability Analysis

Not all guidelines become capability skills. The split depends on whether the guideline contains **actionable decision logic** or is **pure reference/educational content**.

#### Actionable Guidelines → become capability skills

| Guideline Category | Why Actionable | Skill |
|-------------------|----------------|-------|
| quality-assurance/quality-standards/ | Quality gates with pass/fail criteria, DoD checklist | `verify-quality`, `verify-done` |
| architecture/decision-frameworks/ | ADR process with structured template | `record-decision` |
| collaboration/issue-management/ | Issue lifecycle, classification, template | `write-issue` |
| collaboration/project-management-tool/ | Decision matrix + implementation steps | `assess-pm`, `setup-pm` |
| collaboration/estimation/ | Decision matrix, multi-method workflow | `estimate` |
| collaboration/methodology/ | Selection algorithm, scoring framework | `assess-methodology` |
| architecture/architectural-patterns/ | Pattern selection, complexity matrix | `assess-architecture` |
| testing/test-strategy/ | Test pyramid, framework comparison | `assess-testing` |
| infrastructure/ | Cloud provider selection, IaC decision framework | `assess-infrastructure` |
| observability/ | Tool comparison, decision tree | `assess-observability` |
| technical-standards/ai-development/ | Tool selection matrix, maturity model | `assess-ai` |
| code-design/quality-standards/ | Code metrics formula, tech debt prioritization | `assess-code-quality`, `assess-debt` |
| technical-standards/feature-flags/ | Flag lifecycle, implementation patterns | `manage-flags` |
| technical-standards/git-workflow/ | Quality gates configuration | `setup-gates` |

**What migrates**: decision matrices, operational workflows, output format specs.
**What stays in the guideline**: educational WHY, trade-off explanations, all options listed.

#### Reference-Only Guidelines → stay as knowledge

| Guideline Category | Why Reference | Consumed By |
|-------------------|---------------|-------------|
| code-design/design-principles/ | SOLID, FP, error handling — constraints, not decisions | `/implement` reads as rules |
| code-design/framework-patterns/ | React/Fastify patterns — reference during coding | `/implement` reads as patterns |
| code-design/code-organization/ | File structure — reference | `/implement` reads as structure |
| technical-standards/coding-standards/ | Naming, formatting — rules | `/implement`, `/review` enforce |
| collaboration/team/ | Communication, roles — cultural standards | No skill, human reference |
| collaboration/templates/ | Commit, PR, branch templates | Consumed BY skills as format |
| user-experience/ | Design system, UI patterns | `/implement` reads during UI work |
| quality-assurance/security/ | Security rules | `/implement`, `/review` enforce |
| testing/* (detail files) | Unit/integration/e2e patterns | `/implement` reads during TDD |

**These don't lose content** — skills READ them as constraints and reference, but the guideline content stays where it is.

### The Symmetric Pattern

The same architectural principle applies to both axes:

| | Process Axis | Capability Axis |
|---|---|---|
| **Source** | how-to file | guideline |
| **Keeps** | Orchestration, phases, HALT, WHY | Education, WHY, all options |
| **Loses** | Operational detail → process skill | Decision matrix, workflow → capability skill |
| **Skill role** | Orchestrates + executes phases | Atomic execution unit |
| **Adoption** | READS adoption (consumer) | WRITES adoption (producer, via assess-*) |

### Navigator: The Third Dimension

The navigator skill (`/next`) sits outside both axes. It doesn't execute anything — it reads project state and points to the right process skill:

```text
          /next (navigator)
            │
            ├── reads project state
            │
            └── suggests → /refine-story (process)
                              │
                              └── composes → /write-issue (capability)
                                              │
                                              └── reads → adoption + guidelines
```

---

## 3. Adoption as Selector

### Resolution Cascade: Argument > Adoption > Assessment

1. **Argument provided** → use specified method directly. Warn if conflicts with adoption (one-time override, adoption not modified).
2. **Adoption exists** → read adoption file (markdown, contextual read by LLM).
3. **Neither** → skill enters assessment mode → reads guideline → applies decision matrix → proposes to developer → writes to adoption on approval.

### Who writes adoption

- `assess-*` skills and `/record-decision` (with developer approval)
- `/specify-prd` writes `product/PRD.md`
- `/map-subdomains` writes `product/subdomain/`
- `/map-contexts` writes `tech/boundedcontext/`

### Who reads adoption

ALL process and workflow skills.

### Rules

- Override is one-time, does NOT modify adoption, warns on conflict
- Adoption grows progressively (not born complete at bootstrap)
- Skill NEVER silently overwrites adoption choices
- Every adoption change → entry in `adoption/decision-log.md` (ADL)

### Adoption Decision Log (ADL)

Single unified file: `adoption/decision-log.md`

```markdown
## ADL-001 — Initial Bootstrap
- **Date**: 2025-02-01
- **Scope**: architecture, tech-stack, way-of-working, infrastructure, ux-ui
- **Change**: Initial project setup
- **Skill**: /bootstrap
- **Approved by**: @developer

## ADL-002 — Estimation method selected
- **Date**: 2025-03-15
- **Scope**: way-of-working
- **Previous**: (none)
- **New**: complexity-based (story points)
- **Reason**: Team found time estimates unreliable for exploratory work
- **Skill**: /estimate (assessment mode)
- **Approved by**: @developer
```

- Lightweight changelog: date, scope, previous/new, reason, skill, approved-by
- ADL entry written by ANY skill that modifies adoption (same approval gate)
- ADRs remain separate for heavyweight architecture decisions (`adoption/tech/adr/`)
- ADL can reference ADR when architectural impact exists

### Adoption Files Mapping

```text
architecture.md     ← /assess-architecture
tech-stack.md       ← /assess-testing, /assess-ai
infrastructure.md   ← /assess-infrastructure, /assess-observability
way-of-working.md   ← /assess-methodology, /assess-pm, /estimate
ux-ui.md            ← (bootstrap, no dedicated skill)
adr/                ← /record-decision
boundedcontext/     ← /map-contexts
product/PRD.md      ← /specify-prd
product/subdomain/  ← /map-subdomains
```

---

## 3. Complete Skill Catalog (29 skills)

### Process Skills (11) — from how-to lifecycle

| Skill | How-to | Description |
|-------|--------|-------------|
| `specify-prd` | 01 | Create Product Requirements Document |
| `bootstrap` | 02 | Complete bootstrap checklist, compose assess-* skills |
| `plan-initiatives` | 03 | Create and prioritize initiatives |
| `map-subdomains` | 04 | Define product subdomains |
| `map-contexts` | 05 | Define bounded contexts |
| `plan-epics` | 06 | Break down initiatives into epics |
| `plan-stories` | 07 | Break down epics into user stories |
| `refine-story` | 08 | Refine user story for sprint readiness |
| `plan-tasks` | 09 | Break down story into implementation tasks |
| `implement` | 10 | Implement task with TDD, git workflow, quality gates |
| `review` | 11 | Code review with technical and requirements validation |

### Capability Skills: Assessment (10) — produce recommendation

| Skill | Guideline Source | Description |
|-------|-----------------|-------------|
| `assess-architecture` | architecture/ | Select architectural pattern |
| `assess-testing` | testing/ | Define test strategy and framework |
| `assess-infrastructure` | infrastructure/ | Select cloud, CI/CD, deployment |
| `assess-observability` | observability/ | Select monitoring and logging tools |
| `assess-methodology` | collaboration/methodology/ | Select development methodology |
| `assess-pm` | collaboration/project-management-tool/ | Select PM tool |
| `assess-ai` | technical-standards/ai-development/ | Select AI development tools |
| `assess-debt` | code-design/quality-standards/ | Prioritize technical debt |
| `assess-code-quality` | code-design/quality-standards/ | Evaluate code quality metrics |
| `estimate` | collaboration/estimation/ | Estimate work items (dual: assessment + execution) |

### Capability Skills: Workflow (5) — produce artifact/verification

| Skill | Guideline Source | Description |
|-------|-----------------|-------------|
| `verify-quality` | quality-assurance/quality-gates.md | Run quality gates |
| `verify-done` | quality-assurance/definition-of-done.md | Check Definition of Done |
| `record-decision` | architecture/decision-frameworks/ | Create/update ADR |
| `write-issue` | collaboration/issue-management/ | Write issue for PM tool |
| `manage-flags` | technical-standards/feature-flags.md | Feature flag lifecycle |

### Capability Skills: Setup (2) — one-time configuration

| Skill | Guideline Source | Description |
|-------|-----------------|-------------|
| `setup-pm` | collaboration/project-management-tool/ | Configure PM tool |
| `setup-gates` | technical-standards/git-workflow/ | Configure quality gates |

### Navigator (1)

| Skill | Description |
|-------|-------------|
| `next` | Read project state, suggest next skill |

### Composition Pattern

```text
/bootstrap
  ├── /assess-architecture      → produces adoption/tech/architecture.md
  ├── /assess-testing           → informs adoption/tech/tech-stack.md
  ├── /assess-infrastructure    → produces adoption/tech/infrastructure.md
  ├── /assess-observability     → informs adoption/tech/infrastructure.md
  ├── /assess-methodology       → produces adoption/tech/way-of-working.md
  ├── /assess-pm                → informs adoption/tech/way-of-working.md
  ├── /assess-ai                → informs adoption/tech/tech-stack.md
  └── /setup-pm                 → configures chosen tool

/plan-epics, /plan-stories, /plan-tasks
  └── /write-issue              → formats issue for chosen PM tool
      └── /estimate             → sizing (optional)

/implement
  ├── /verify-quality           → Phase 4 quality validation
  └── /manage-flags             → if task requires feature flags

/review
  ├── /verify-quality           → Phase 1 technical standards
  ├── /verify-done              → Phase 2 completeness
  ├── /record-decision          → when ADR missing (HALT)
  └── /assess-debt              → when tech debt identified
```

---

## 4. SKILL.md Format

Agent Skills standard: YAML frontmatter + Markdown body.

```yaml
---
name: skill-name
description: What this skill does and when to use it.
allowed-tools: Bash Read Edit Write Grep Glob
---

# /skill-name

## Arguments
- `$0` (optional): description

## Context Loading
Read adoption and guideline files.

## Behavior
Step-by-step operational logic.

## HALT Conditions
When to stop and ask.

## Developer Collaboration Points
When to involve the human.
```

### Five Skill Types

| Type | Key Characteristic | Example |
|------|-------------------|---------|
| **Process** | Composes other skills, has phases + HALT + approval gates | `implement` |
| **Assessment** | Resolution cascade (arg > adoption > assessment), produces choice | `estimate` |
| **Workflow** | Executes and produces report/artifact | `verify-quality` |
| **Setup** | One-time, configures tooling, writes adoption | `setup-pm` |
| **Navigator** | Read-only, analyzes state, suggests next action | `next` |

### Type 1: Process Skill — `implement`

Process skills orchestrate the development lifecycle. They compose capability skills,
manage phases, enforce HALT conditions, and require developer approval at key gates.

```yaml
---
name: implement
description: >
  Implement a task following TDD methodology, adopted tech stack, and code
  design guidelines. Handles branch creation, TDD sessions (RED/GREEN/REFACTOR),
  quality validation, and PR creation. Use when a task is ready for development.
allowed-tools: Bash Read Edit Write Grep Glob
---
```

**Structure:**

```markdown
# /implement

## Arguments
- `$0` (optional): Task ID or description. If omitted, reads from PM tool the
  first task in "Ready" state for the current story.

## Context Loading
Read adoption files before starting:
- `.pair/adoption/tech/tech-stack.md` — allowed libraries and versions
- `.pair/adoption/tech/architecture.md` — architectural patterns and constraints
- `.pair/adoption/tech/way-of-working.md` — PM tool, commit strategy, git workflow

Read guidelines as constraints:
- `.pair/knowledge/guidelines/code-design/design-principles/README.md`
- `.pair/knowledge/guidelines/testing/test-strategy/README.md`
- `.pair/knowledge/guidelines/collaboration/templates/`

## Behavior

### 1. Task Loading
- Load task from PM tool (per way-of-working.md)
- Validate task follows task template
- Classify: Development (TDD) | Non-Development (Direct)
- HALT if: task specs incomplete, story not "In Progress", libraries not in tech-stack

### 2. Branch Setup
- Create branch per branch template
- Pattern: `<type>/#<story-id>-<brief-description>`

### 3. Implementation (Development Tasks)
Execute strict TDD cycle:
- RED: Write failing tests only. NO implementation code.
- GREEN: Write minimal implementation only. NO test changes.
- REFACTOR: Improve structure. All tests must stay green.

### 3b. Implementation (Non-Development Tasks)
- Documentation, Configuration, Research: implement directly.

### 4. Quality Validation
→ Invoke `/verify-quality`
- HALT if quality gates fail.

### 5. Commit & Push
- Commit per commit template: `[STORY-ID] type: description`

### 6. PR Creation
- Create PR → transition to `/review`

## HALT Conditions
- Task specs incomplete
- Library not in tech-stack → propose via `/record-decision`
- Architectural pattern not in adoption → discuss with developer

## Developer Collaboration Points
- After task loading: confirm understanding
- Before branch creation: confirm commit strategy
- After RED phase: confirm test coverage
- After quality validation: confirm PR readiness
```

**Key characteristics:**

- Composes `/verify-quality` and `/record-decision`
- Multiple phases with HALT conditions between them
- Reads adoption for tech-stack, architecture, way-of-working
- Developer approval gates at each phase transition

### Type 2: Assessment Skill — `estimate`

Assessment skills implement the resolution cascade (Argument > Adoption > Assessment).
They can both select a method AND execute it. They may write to adoption when a new
choice is made.

```yaml
---
name: estimate
description: >
  Estimate work items using the project's adopted estimation method. Supports
  complexity-based, time-based, AI-assisted, forecast-based, and hybrid methods.
  If no method is adopted, guides selection through a decision matrix.
---
```

**Structure:**

```markdown
# /estimate

## Arguments
- `$0` (optional): estimation method override — one of: `complexity`,
  `time-based`, `ai-assisted`, `forecast`, `hybrid`.

## Resolution Cascade

### 1. Argument provided ($0)
→ Use specified method directly.
→ If adoption has a different method, WARN:
  "Adoption specifies [X]. This is a one-time override, adoption won't change."

### 2. Adoption exists (no argument)
→ Read `.pair/adoption/tech/way-of-working.md`
→ Look for estimation method choice → use it.

### 3. Neither (assessment mode)
→ Read `.pair/knowledge/guidelines/collaboration/estimation/README.md`
→ Apply decision matrix:

| Project Context     | Team Maturity | Recommended Primary |
|---------------------|---------------|---------------------|
| New product         | Novice        | AI-Assisted         |
| Feature enhancement | Experienced   | Complexity-Based    |
| Maintenance work    | Experienced   | Forecast-Based      |
| R&D/Exploration     | Expert        | AI-Assisted         |
| Fixed contracts     | Any           | Time-Based          |
| Large-scale         | Expert        | Hybrid              |

→ Present recommendation → on approval → write to adoption + ADL entry.

## Execution
Once method is determined, read corresponding guideline detail file
and apply the method to produce structured output.

## Output Format
  ESTIMATE:
  ├── Work Item: [ID — Title]
  ├── Method: [chosen method]
  ├── Size: [estimate value + unit]
  ├── Confidence: [High | Medium | Low]
  ├── Assumptions: [list]
  └── Risks: [factors that could affect accuracy]
```

**Key characteristics:**

- Resolution cascade: argument > adoption > assessment
- Dual behavior: can BOTH select method AND execute estimation
- May write to adoption (only in assessment mode, with approval)
- Warn on override without modifying adoption

### Type 3: Workflow Skill — `verify-quality`

Workflow skills execute a specific operation and produce a report or artifact.
They read adoption for context but don't modify it.

```yaml
---
name: verify-quality
description: >
  Run quality gates against adopted standards. Validates code quality, test
  coverage, security, accessibility, and performance requirements. Use after
  implementation and before PR creation.
allowed-tools: Bash Read Grep Glob
---
```

**Structure:**

```markdown
# /verify-quality

## Arguments
- `$0` (optional): scope filter — one of: `all`, `tests`, `lint`, `security`,
  `accessibility`, `performance`. Default: `all`.

## Context Loading
Read adoption to determine which standards apply:
- `.pair/adoption/tech/tech-stack.md` — testing framework, linter config
- `.pair/adoption/tech/architecture.md` — architectural constraints
- `.pair/adoption/tech/ux-ui.md` — accessibility requirements (if adopted)

## Quality Gates

### Gate 1: Tests
- Run test suite. Verify coverage meets threshold.
- FAIL if: tests fail, coverage below threshold.

### Gate 2: Lint & Format
- Run linter and formatter per tech-stack.md.
- FAIL if: lint errors.

### Gate 3: Type Safety
- Run type checker.
- FAIL if: type errors.

### Gate 4: Security (if scope includes)
- Check dependencies for vulnerabilities. No secrets in code.
- FAIL if: critical/high vulnerabilities.

### Gate 5: Accessibility (if adopted in ux-ui.md)
- Run checks per adopted WCAG level.
- SKIP if: "No accessibility standards" in adoption.

### Gate 6: Build
- Verify project builds. FAIL if: build errors.

## Output Format
  QUALITY REPORT:
  ├── Tests:         ✅ PASS (coverage: 87%)
  ├── Lint:          ✅ PASS (0 errors, 3 warnings)
  ├── Types:         ✅ PASS
  ├── Security:      ⚠️  WARN (1 medium vulnerability)
  ├── Accessibility: ⏭️  SKIP (not adopted)
  ├── Build:         ✅ PASS
  └── Result:        ✅ QUALITY GATES PASSED

## On Failure
Report which gate(s) failed. Suggest fixes. Do NOT proceed to PR.
```

**Key characteristics:**

- Reads adoption (read-only, never writes)
- Scoped execution via argument (`$0`)
- Skips non-adopted gates (accessibility, performance)
- Produces structured report
- No developer collaboration needed (autonomous)

### Type 4: Setup Skill — `setup-pm`

Setup skills are one-time configuration operations. They read adoption for the chosen
tool, execute setup steps, and may update adoption with access details.

```yaml
---
name: setup-pm
description: >
  Configure the project management tool based on adoption choices. Sets up
  project boards, labels, templates, and workflows for the adopted PM tool.
---
```

**Structure:**

```markdown
# /setup-pm

## Arguments
- `$0` (optional): PM tool override — one of: `github`, `jira`, `linear`,
  `trello`, `filesystem`.

## Resolution Cascade
1. Argument provided → use specified tool
2. Read `.pair/adoption/tech/way-of-working.md` → PM tool choice
3. Neither → ask developer which tool to use

## Execution
Based on chosen tool, read implementation guide from guidelines:
- `github` → guidelines/collaboration/project-management-tool/github-implementation.md
- `filesystem` → guidelines/collaboration/project-management-tool/filesystem-implementation.md

### GitHub Projects Setup
1. Create project board with Kanban columns
2. Configure labels per issue-management guidelines
3. Set up issue templates (story, task, bug)
4. Configure branch protection if applicable

### Filesystem Setup
1. Create directory structure: `project-management/{backlog,sprint,done}/`
2. Create template files for stories and tasks

### Post-Setup
- Update way-of-working.md with PM tool access details if missing
- Write ADL entry if tool was newly selected
- Verify access by reading/writing a test item

## HALT Conditions
- No write access to chosen PM tool
- Tool requires credentials not available
```

**Key characteristics:**

- One-time execution (not repeated each sprint)
- Uses resolution cascade (same as assessment)
- Reads implementation guide from guidelines
- May write to adoption (access details)
- Produces configured tool as output

### Type 5: Navigator Skill — `next`

The navigator is a read-only skill that analyzes project state and suggests
the next action. It never modifies files.

```yaml
---
name: next
description: >
  Analyze project state and suggest the next skill to invoke. Reads adoption
  files, PM tool status, and project artifacts to determine where you are in
  the development lifecycle and what to do next.
---
```

**Structure:**

```markdown
# /next

## Arguments
None.

## Behavior
Read project state and determine lifecycle phase:

### State Detection Cascade
1. Does .pair/adoption/product/PRD.md exist?
   → NO: "No PRD found. Start with /specify-prd"

2. Does .pair/adoption/tech/architecture.md exist?
   → NO: "PRD exists but no technical adoption. Run /bootstrap"

3. Is bootstrap complete? (architecture + tech-stack + way-of-working?)
   → NO: "Bootstrap incomplete. Resume /bootstrap"

4. Check PM tool for project state:
   → No initiatives?       → /plan-initiatives
   → No subdomains?        → /map-subdomains
   → No bounded contexts?  → /map-contexts
   → No epics?             → /plan-epics
   → No stories?           → /plan-stories

5. Check story states:
   → Stories "Todo"?               → /refine-story
   → Stories "Ready" without tasks? → /plan-tasks
   → Tasks ready?                  → /implement
   → PR open?                      → /review

6. All done? → "Sprint complete. Run /next after next planning."

### Multiple Suggestions
If mixed state, present up to 3 options ranked by priority:

  PROJECT STATE:
  ├── PRD: ✅
  ├── Bootstrap: ✅
  ├── Current Sprint: Sprint 2
  │
  SUGGESTED NEXT ACTIONS:
  1. /implement — Task US-45.3 is ready
  2. /refine-story — Story US-48 needs acceptance criteria
  3. /review — PR #12 awaits review

## Context Required
- `.pair/adoption/` — all adoption files
- PM tool access per way-of-working.md
```

**Key characteristics:**

- Pure read-only (never modifies anything)
- No arguments
- Reads entire project state (adoption + PM tool)
- Suggests 1-3 next actions with context
- Entry point for skill-enabled assistants (AGENTS.md points here)
| **Workflow** | Executes and produces report/artifact | `verify-quality` |
| **Setup** | One-time, configures tooling, writes adoption | `setup-pm` |
| **Navigator** | Read-only, analyzes state, suggests next action | `next` |

---

## 5. .skills/ Structure & Registry

### Source Structure (in dataset/)

```text
dataset/.skills/
  process/
    next/SKILL.md
    specify-prd/SKILL.md
    bootstrap/SKILL.md
    plan-initiatives/SKILL.md
    map-subdomains/SKILL.md
    map-contexts/SKILL.md
    plan-epics/SKILL.md
    plan-stories/SKILL.md
    refine-story/SKILL.md
    plan-tasks/SKILL.md
    implement/SKILL.md
    review/SKILL.md
  capability/
    assess-architecture/SKILL.md
    assess-testing/SKILL.md
    assess-infrastructure/SKILL.md
    assess-observability/SKILL.md
    assess-methodology/SKILL.md
    assess-pm/SKILL.md
    assess-ai/SKILL.md
    assess-debt/SKILL.md
    assess-code-quality/SKILL.md
    estimate/SKILL.md
    verify-quality/SKILL.md
    verify-done/SKILL.md
    record-decision/SKILL.md
    write-issue/SKILL.md
    manage-flags/SKILL.md
    setup-pm/SKILL.md
    setup-gates/SKILL.md
```

### Registry-Based Installation

Registry config is a **generic content-ops feature** (not skills-specific). New options:

- `prefix`: prepended to name (e.g., `pair`)
- `flatten: true` → hierarchy becomes hyphens: `process/implement/` → `pair-process-implement/`
- `flatten: false` → hierarchy preserved as folders: `process/implement/` → `pair-process/implement/`
- `prefix` and `flatten` are orthogonal options
- Today: `flatten: true` required (no tool supports hierarchical skills)
- Future: `flatten: false` ready for when tools add subfolder support

### Target Modes

Each target in a registry has a mode:

| Mode | Behavior |
|------|----------|
| `copy` | Independent copy of files (default) |
| `canonical` | Real files, source for symlinks |
| `symlink` | Directory symlink pointing to canonical |

**Mode inference rules:**

- Default mode = `copy`
- If symlinks exist + exactly 1 default (unspecified) target → inferred as `canonical`
- If symlinks exist + 2+ defaults → **error**: "specify canonical"
- If symlinks exist + 0 non-symlink targets → **error**: "needs canonical"
- `canonical` without any `symlink` → **error**: "canonical requires symlink"
- Max 1 canonical

### Supported AI Tools

| Tool | Path | Default Mode |
|------|------|-------------|
| Claude Code | `.claude/skills/` | canonical (inferred) |
| GitHub Copilot | `.github/skills/` | symlink |
| Cursor | `.cursor/skills/` | symlink |
| OpenAI Codex | `.agents/skills/` | symlink |
| Windsurf | `.windsurf/skills/` | symlink |

NOT supported (proprietary formats): Amazon Q (JSON), JetBrains AI (ACP).

### Example Registry Config

```yaml
registries:
  # Existing registries (unchanged)
  - name: pair-knowledge
    source: dataset/.pair
    targets:
      - path: .pair

  - name: pair-agents
    source: dataset/AGENTS.md
    targets:
      - path: AGENTS.md

  - name: pair-copilot
    source: dataset/.github
    targets:
      - path: .github

  # Skill registries (new)
  - name: pair-process-skills
    source: dataset/.skills/process
    prefix: pair
    flatten: true
    targets:
      - path: .claude/skills           # canonical (inferred)
      - path: .github/skills
        mode: symlink
      - path: .cursor/skills
        mode: symlink
      - path: .agents/skills
        mode: symlink
      - path: .windsurf/skills
        mode: symlink

  - name: pair-capability-skills
    source: dataset/.skills/capability
    prefix: pair
    flatten: true
    targets:
      - path: .claude/skills           # canonical (inferred)
      - path: .github/skills
        mode: symlink
      - path: .cursor/skills
        mode: symlink
      - path: .agents/skills
        mode: symlink
      - path: .windsurf/skills
        mode: symlink
```

### Installed Output (flatten: true, prefix: pair)

```text
.claude/skills/                            ← canonical (real files)
  pair-process-next/SKILL.md
  pair-process-implement/SKILL.md
  pair-process-review/SKILL.md
  pair-capability-estimate/SKILL.md
  pair-capability-verify-quality/SKILL.md
  ...

.github/skills → .claude/skills           ← symlink
.cursor/skills → .claude/skills           ← symlink
.agents/skills → .claude/skills           ← symlink
.windsurf/skills → .claude/skills         ← symlink
```

Team custom skills coexist:

```text
.claude/skills/
  pair-process-implement/SKILL.md          ← from pair registry
  acme-deploy/SKILL.md                    ← from team registry
```

---

## 6. Impact on Existing Bridges

### AGENTS.md

Simplified from ~230 to ~100 lines:

- Skill-enabled assistants → invoke `/next`
- Non-skill assistants → manual flow (current logic, simplified)
- Key references section stays
- Quick rules section stays (simplified)

### .github/prompts/

Deprecated incrementally as skills replace them. Each prompt that maps 1:1 to a skill gets removed when the skill is implemented.

### .github/agents/

Updated to reference skills instead of how-to files. Role-to-skills mapper instead of role-to-how-to mapper.

### Non-skill fallback

How-to files (thin) and SKILL.md files are both plain markdown. Any AI assistant can read them as documents and follow the instructions, even without native skill support.

---

## 7. Implementation Strategy

### Prerequisites

1. **content-ops**: extend registry to support `flatten`, `prefix`, and `targets` options with mode (canonical/symlink/copy) and inference rules
2. **content-ops**: update default configs with new registry settings
3. **dataset/.skills/**: create directory structure (process/, capability/)
4. **CLI install**: copy/symlink skills to correct assistant folder with flatten+prefix
5. **One how-to "thin" example**: validate how-to + skill work together
6. **AGENTS.md update**: point to `/next` for skill-enabled assistants

### Circle 1 — Sprint Cycle (9 skills)

Implementation order (atomics first, then composites):

| Order | Skill | Type | Composes |
|-------|-------|------|----------|
| 1 | `verify-quality` | Capability/Workflow | — |
| 2 | `verify-done` | Capability/Workflow | — |
| 3 | `record-decision` | Capability/Workflow | — |
| 4 | `write-issue` | Capability/Workflow | — |
| 5 | `next` | Navigator | — |
| 6 | `implement` | Process | verify-quality, record-decision |
| 7 | `review` | Process | verify-quality, verify-done, record-decision |
| 8 | `plan-tasks` | Process | write-issue |
| 9 | `refine-story` | Process | write-issue |

### Circle 2 — Bootstrap & Planning (20 skills)

**Process**: specify-prd, bootstrap, plan-initiatives, map-subdomains, map-contexts, plan-epics, plan-stories

**Assessment**: assess-architecture, assess-testing, assess-infrastructure, assess-observability, assess-methodology, assess-pm, assess-ai, assess-debt, assess-code-quality, estimate

**Setup/Workflow**: setup-pm, setup-gates, manage-flags

---

## Appendix: What Does NOT Become a Skill

These stay as knowledge, consumed by skills as reference:

- code-design/design-principles/ (SOLID, FP, error handling)
- collaboration/team/ (standards, rules)
- collaboration/templates/ (commit, PR, branch — consumed BY skills)
- methodology details (scrum.md, kanban.md, etc. — educational)
- estimation technique details (time-based, complexity-based, etc.)
- technical-standards/coding-standards/ (constraints for /implement)
- user-experience/ (consulted during UI implementation)
- git-workflow detail (rules for /implement)
- security/, accessibility/, performance/ (constraints for /implement and /review)
