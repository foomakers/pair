# Filesystem - Complete Implementation Guide

_Comprehensive setup and usage guide for filesystem-based project management with pair_

Complete guide for implementing filesystem-based project management using markdown files and directories, including setup, workflow configuration, status management, and team collaboration patterns.

## Overview

This guide provides comprehensive instructions for integrating pair with filesystem-based project management. Unlike external tools like GitHub Projects, the filesystem approach uses local markdown files organized in structured directories to manage initiatives, epics, user stories, and tasks.

### Key Benefits

- **Local Control**: All project management files are version-controlled with your code
- **Hierarchical Organization**: Clear folder structure reflecting Initiative → Epic → User Story → Task hierarchy
- **Markdown Native**: Human-readable files that integrate naturally with documentation
- **No External Dependencies**: Works without internet connectivity or external tool configuration
- **Full Customization**: Complete control over templates and organization structure

## Prerequisites

### Required Setup

- **Git Repository**: Initialized repository with `.pair/` directory structure
- **Markdown Editor**: Any text editor with markdown support
- **Filesystem Access**: Read/write permissions to repository directory
- **pair Assistant**: Configured and running for AI-assisted workflow

### Required Knowledge

- Basic Git operations and markdown formatting
- Understanding of Agile/Scrum concepts (initiatives, epics, user stories, tasks)
- Familiarity with file organization and naming conventions

## Initial Setup

### Step 1: Configure way-of-working.md

Update your project's way-of-working configuration to specify filesystem — and, because filesystem hosts no code, the code host:

```markdown
# Way of Working

- Filesystem is adopted for project management, using markdown files and folder organization.
- The backlog is managed in `.pair/adoption/product/backlog/` directory structure.
- See `.pair/knowledge/guidelines/collaboration/project-management-tool/README.md` for usage.

## Git Workflow

- `code-host`: `github` — repository `<org>/<repo>`.
- `base-branch`: `main`.
```

`code-host` is optional in general — omitted, it resolves to the PM tool — but **not optional here**: filesystem owns no repositories, branches or pull requests, so there is nothing to fall back to and a PR operation without it HALTs before it starts (see the [code-host resolution rule](../../technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md)).

### Step 2: Verify Directory Structure

Ensure the required filesystem structure exists:

#### Primary Method (via pair Assistant):

```bash
pair "Verify and create filesystem project management directory structure"
```

#### Manual Method (Fallback):

```bash
# Navigate to project root
cd /path/to/your/project

# Create directory structure if needed
mkdir -p .pair/adoption/product/backlog/01-initiatives/2025
mkdir -p .pair/adoption/product/backlog/02-epics/{not-started,in-progress,under-review,completed}
mkdir -p .pair/adoption/product/backlog/03-user-stories/{not-started,in-progress,under-review,completed}

# Verify structure
tree .pair/adoption/product/backlog/
```

### Step 3: Verify Templates

Ensure project management templates are available:

```bash
# Check for templates
ls ../guidelines/collaboration/templates/

# Required templates:
# - initiative-template.md
# - epic-template.md
# - user-story-template.md
# - task-template.md
```

## Filesystem Tool Usage Across Topics

### Issue Management

#### → See [../issue-management/](../issue-management/README.md)

- Local issue tracking with markdown files
- Directory-based status management
- File naming conventions and organization
- Simple automation with shell scripts

### Project Tracking

#### → See [../project-tracking/](../project-tracking/README.md)

- Hierarchical directory structure
- Status tracking via file location
- Progress monitoring with file operations
- Local reporting and metrics

### Automation

#### → See [../automation/](../automation/README.md)

- Shell script automation
- File operation automation
- Directory management scripts
- Integration with development tools

### Board Management

#### → See [README.md](README.md)

- Directory-based board visualization
- Local backlog management
- File-based workflow optimization
- Simple progress tracking

### Communication

#### → See [../communication-protocols/](../../README.md)

- Documentation-based communication
- Local changelog management
- File-based review processes
- Markdown documentation patterns

### Estimation Integration

#### → See [../estimation/](../estimation/README.md)

- File-based estimation tracking
- Simple effort recording in metadata
- Local velocity calculations
- Lightweight forecasting approaches

### Methodology Integration

#### → See [../methodology/](../methodology/README.md)

- Scrum integration with filesystem structure
- Kanban workflow with directory states
- Sprint planning with file organization
- Retrospective notes and improvements

## Filesystem Structure Setup

### Directory Organization

The filesystem uses a hierarchical structure that mirrors the project management hierarchy:

```text
.pair/adoption/product/backlog/
├── 01-initiatives/
│   └── 2025/                    # Year-based organization
│       ├── core-data-pipeline.md
│       └── user-experience-revamp.md
├── 02-epics/
│   ├── not-started/             # Todo epics
│   ├── in-progress/             # Active epics
│   ├── under-review/            # Review/validation phase
│   └── completed/               # Finished epics
└── 03-user-stories/
    ├── not-started/             # Todo user stories
    ├── in-progress/             # Active development
    ├── under-review/            # Code review/testing
    └── completed/               # Finished stories
```

### Naming Conventions

#### Initiative Files:

- Format: `[initiative-name].md`
- Example: `core-data-pipeline.md`
- Location: `01-initiatives/[YEAR]/`

#### Epic Files:

- Format: `[initiative-code]-[epic-code]-[epic-name].md`
- Example: `01-01-data-ingestion-pipeline.md`
- Location: `02-epics/[status]/`

#### User Story Files:

- Format: `[initiative-code]-[epic-code]-[story-code]-[story-name].md`
- Example: `01-01-001-user-registration.md`
- Location: `03-user-stories/[status]/`

### Status Management via File Location

Status changes are reflected by moving files between directories:

- **not-started/**: Items defined but not yet started
- **in-progress/**: Active work in progress
- **under-review/**: Completed work awaiting review/validation
- **completed/**: Finished and accepted items

### Item Visibility: Membership and Assignee

**Board membership is implicit here — the file's location _is_ its membership.** Writing the file under `03-user-stories/[status]/` puts the item in the tracked view; there is **no separate add-to-board step**. Do not invent one: unlike GitHub Projects, where an issue and a project item are distinct objects requiring an explicit `addProjectV2ItemById`, a file that exists in the backlog tree is already a member of it. Consequently a status write can never fail for "not a member yet" — the failure mode is a file in the _wrong_ directory, not a missing one.

**The assignee is not implicit** and is still required — the backlog is read filtered by assignee (Assignment rule in [way-of-working.md](../../../../adoption/tech/way-of-working.md)). There is no assignee field in a filesystem board, so it lives in the item file's header as an **`Assignee`** line, written as part of the create, never as a follow-up step:

```markdown
**Assignee**: [name or handle of the person the work is done for]
```

**Where the line goes**: the item templates carry **no `Assignee` field**, so copying a template does not leave a slot for it. Add it to the item's context block — for a user story, in **`## Epic Context`** immediately after `**Priority**`; for a task, in the same header block that carries the parent story; for an **epic** or an **initiative**, in its own header/context block, the one carrying `**Priority**`. Writing it anywhere the grep below finds it is correct; leaving it out because the template lacked a field is not.

**Why the slot is not in the shared templates** (a deliberate choice, not an oversight): on every other adapter the assignee is a **native tracker field** — GitHub's `assignees`, Azure's `--assigned-to`, Linear's `assigneeId` — so a template slot would be dead weight there, and a second source of truth competing with the field the board actually filters on. The templates therefore stay tool-neutral and this adapter owns the convention, which is why the placement rule is stated here and is looser than a template field would be. Recorded with the rest of the contract rationale in this repository's `.pair/adoption/decision-log/2026-07-31-pm-adapter-visibility-contract.md`.

Grep is the filtered view: `grep -rl 'Assignee.*<name>' .pair/adoption/product/backlog/` — which is exactly why an item with the line missing is invisible. **If the assignee cannot be resolved**: **report it** — never drop it silently by writing the file with the line omitted or left as a placeholder.

## Working with Initiatives

### Creating Initiatives

#### Step 1: Use pair Assistant (Primary Method)

```bash
pair "Create filesystem initiative from PRD analysis"
```

#### Step 2: Manual Creation (Fallback)

```bash
# Navigate to initiatives directory
cd .pair/adoption/product/backlog/01-initiatives/2025

# Create initiative file
cp ../../../../../.pair/knowledge/guidelines/collaboration/assets/initiative-template.md core-data-pipeline.md

# Edit with your preferred editor
code core-data-pipeline.md
```

**Step 3: Complete Initiative Details**
Fill out all sections of the initiative template:

- **Business Objective**: Clear statement of business goals
- **Success Metrics**: Measurable outcomes and KPIs
- **Priority**: P0 (Must-Have) | P1 (Should-Have) | P2 (Could-Have)
- **Assignee**: the person the work is done for — required, see [Item Visibility](#item-visibility-membership-and-assignee)
- **Estimated Timeline**: High-level timeframe
- **Dependencies**: External dependencies and blockers
- **Epic References**: Links to related epics (added as epics are created)

### Managing Initiative Status

#### Update via pair Assistant:

```bash
pair "Update initiative status and track epic completion progress"
```

#### Manual Status Management:

- Initiatives remain in yearly folders
- Status is tracked by completion of child epics
- Update the initiative file to reflect current progress

## Working with Epics

### Creating Epics from Initiatives

#### Step 1: Use pair Assistant (Primary Method)

```bash
pair "Break down epics from filesystem initiative"
```

#### Step 2: Manual Epic Creation

```bash
# Navigate to epics directory
cd .pair/adoption/product/backlog/02-epics/not-started

# Create epic file with proper naming
cp ../../../../../../.pair/knowledge/guidelines/collaboration/assets/epic-template.md 01-01-data-ingestion-pipeline.md

# Edit epic details
code 01-01-data-ingestion-pipeline.md
```

**Step 3: Link to Parent Initiative**
In the epic file, establish clear linkage:

```markdown
**Parent Initiative**: [Core Data Pipeline](01-initiatives/2025/core-data-pipeline.md)
**Initiative Code**: 01
**Epic Code**: 01
```

### Managing Epic Status

#### Status Transitions via File Movement:

#### Via pair Assistant:

```bash
pair "Move epic to in-progress status and update parent initiative"
```

#### Via Manual File Operations:

```bash
# Move epic from not-started to in-progress
cd .pair/adoption/product/backlog/02-epics
mv not-started/01-01-data-ingestion-pipeline.md in-progress/

# Status progression:
# not-started/ → in-progress/ → under-review/ → completed/
```

## Working with User Stories

### Creating User Stories from Epics

#### Step 1: Use pair Assistant (Primary Method)

```bash
pair "Break down user stories from filesystem epic"
```

#### Step 2: Manual User Story Creation

```bash
# Navigate to user stories directory
cd .pair/adoption/product/backlog/03-user-stories/not-started

# Create story file with proper naming convention
cp ../../../../../../.pair/knowledge/guidelines/collaboration/assets/user-story-template.md 01-01-001-user-registration.md

# Edit story details
code 01-01-001-user-registration.md
```

**Step 3: Complete Story Details**
Fill out all required sections:

- **Story Statement**: "As a [user type], I want [goal] so that [benefit]"
- **Parent Epic**: Link to parent epic file
- **Acceptance Criteria**: Clear, testable conditions
- **Priority and Sizing**: Business priority and development estimate
- **Assignee**: the person the work is done for — required, see [Item Visibility](#item-visibility-membership-and-assignee)

### Refining User Stories

#### Step 1: Refinement Process

```bash
pair "Refine filesystem user story and update status to refined"
```

**Step 2: Update Refinement Status**
Add refinement details to the user story:

```markdown
## Refinement Status

**Refined Date**: YYYY-MM-DD
**Refined By**: [Team member]
**Status**: Refined - Ready for Development
**Story Points**: [Estimate]
```

## Working with Tasks

### Task Management Within User Stories

Unlike separate task files, tasks are embedded within user story files:

#### Task Breakdown Section:

```markdown
## Task Breakdown

### Task Checklist

- [ ] **Task-001:** Set up user registration API endpoint
- [ ] **Task-002:** Create user registration form UI
- [ ] **Task-003:** Implement email verification workflow
- [ ] **Task-004:** Add registration validation and error handling

---

### Task-001: Set up user registration API endpoint

**What to implement:**
Create REST API endpoint for user registration with proper validation and security.

**Technical approach:**

- Use Express.js router for endpoint creation
- Implement bcrypt for password hashing
- Add input validation using Joi schema
- Set up database models for user storage

**Acceptance criteria addressed:**

- AC1: Users can register with email and password
- AC2: Passwords are securely hashed before storage

**Estimated effort:** 4 hours
**Dependencies:** Database schema setup
```

### Task Implementation Workflow

#### Step 1: Start Development

```bash
pair "Start development for filesystem user story - assign and create implementation branch"
```

**Step 2: Update Story Status**
Move the user story file to in-progress:

```bash
# Move story to in-progress
cd .pair/adoption/product/backlog/03-user-stories
mv not-started/01-01-001-user-registration.md in-progress/
```

**Step 3: Track Task Progress**
Update task checkboxes as you complete them:

```markdown
- [x] **Task-001:** Set up user registration API endpoint ✅ 2025-09-01
- [ ] **Task-002:** Create user registration form UI
- [x] **Task-003:** Implement email verification workflow ✅ 2025-09-01
- [ ] **Task-004:** Add registration validation and error handling
```

**Step 4: Complete Story**
When all tasks are done:

```bash
pair "Complete user story development and move to review status"
```

## Status Management

### Status Transitions

#### File-Based Status System:

- **not-started/**: Initial state, ready for refinement or development
- **in-progress/**: Active work, development started
- **under-review/**: Development complete, in code review or testing
- **completed/**: All work finished and accepted

### Bottom-Up Status Propagation

#### Automatic Status Logic:

- Parent items (epics/initiatives) are "in-progress" when any child is active
- Parent items are "completed" only when ALL children are completed
- User stories move to "completed" when all tasks are done and code is merged

### Status Update Commands

#### Via pair Assistant (Primary Method):

```bash
pair "Update filesystem user story status to in-progress and track epic progress"
pair "Mark filesystem user story as completed and update parent epic status"
pair "Move epic to completed status and update initiative progress"
```

#### Via Manual File Operations (Fallback):

```bash
# Move user story to different status
cd .pair/adoption/product/backlog/03-user-stories
mv in-progress/01-01-001-user-registration.md completed/

# Move epic to completed
cd .pair/adoption/product/backlog/02-epics
mv under-review/01-01-data-ingestion-pipeline.md completed/
```

## Development Workflow

### Branch Naming and Integration

#### Branch Creation:

```bash
# Create feature branch with story reference
git checkout -b "feature/01-01-001-user-registration"

# Include epic and initiative context if needed
git checkout -b "feature/01-01-data-ingestion/01-01-001-user-registration"
```

#### Commit Message Format:

```bash
git commit -m "Implement user registration API endpoint

- Add Express.js registration route
- Implement bcrypt password hashing
- Add Joi input validation
- Create User model with database schema

Story: 01-01-001-user-registration
Epic: 01-01-data-ingestion-pipeline
Initiative: core-data-pipeline"
```

### Development Integration

#### Step 1: Start Development

```bash
pair "Start filesystem user story development - move to in-progress and create branch"
```

**Step 2: Track Implementation Progress**
Update task checkboxes and add implementation notes:

```markdown
### Implementation Progress

**2025-09-01**: Started Task-001 - API endpoint setup

- Created Express router structure
- Added basic validation schema
- Next: Implement password hashing

**2025-09-01**: Completed Task-001 ✅

- Registration endpoint fully functional
- Password hashing with bcrypt implemented
- Input validation working correctly
```

**Step 3: Code Review Integration**
When ready for review:

```bash
pair "Create pull request for filesystem user story and move to under-review"
```

**Step 4: Code Review Follow-up**
Add review tasks to the story file:

```markdown
### Code Review Follow-Up Tasks

- [ ] **Review-001:** Add additional test cases for edge scenarios
- [ ] **Review-002:** Improve error handling in validation middleware
- [ ] **Review-003:** Update API documentation with new endpoint
```

## Comments on an Item (Activity Log)

Filesystem has no comment API — the item **is** a markdown file — so a comment is an **append** to one dedicated section of that file: `## Activity Log`, at the end of the item file, created on first use.

```markdown
## Activity Log

- **2026-07-29** — PR: https://github.com/acme/platform/pull/412
```

This is the mechanism `/write-issue $mode: comment` resolves for `filesystem` (it is how the PR back-link of a split setup reaches the item, since the code host is always a separate tool here — filesystem hosts no code). The rules that make it equivalent to a comment elsewhere:

1. **Append only, one section.** Add a bullet under `## Activity Log` and change nothing else — the statement, acceptance criteria, Definition of Done, task checkboxes, Implementation Progress and any front-matter stay byte-identical.
2. **Never a status write.** Board state on filesystem is the item's **directory** (see Status Management via File Location) — an activity entry never moves or renames the file.
3. **Not idempotent by itself.** The bullet carries no id, so re-running appends a second one: a caller that can re-run (e.g. `/publish-pr`'s back-link) greps the section for the value first and skips when present.
4. **Distinct from `Implementation Progress`**, which is the author's own dated work log; `## Activity Log` holds cross-links and annotations written _by tooling_.
5. **Reading it is a grep of this section**, not an API call: a caller checking "does a comment with this URL already exist?" (e.g. `/publish-pr`'s back-link check) greps `## Activity Log` in the item file.
6. **It survives later body renders through the caller's contract.** `$mode: write` is a **full-body overwrite**, so a skill that re-renders an item (`/plan-tasks`, a re-refinement) must pass the already-merged full body — which includes the existing `## Activity Log`. Read → merge → write; a render that drops the section is a caller bug, not a property of this mechanism.
7. **The item `$id` is the file stem** (`01-01-001`), never a path: the file moves between the status directories as its state changes, so a caller resolves the item by **glob across them** (`**/01-01-001*.md`). That stem is also what the PR's `Refs:` line carries (see the [cross-linking convention](../../technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md)).

## Best Practices

### File Management

1. **Consistent Naming**: Always follow the established naming conventions
2. **Preserve Filenames**: Never rename files when changing status, only move them
3. **Maintain Links**: Keep relative path links updated when reorganizing
4. **Regular Cleanup**: Periodically check for broken links and inconsistencies
5. **Version Control**: Commit backlog changes regularly with meaningful messages

### Content Management

1. **Complete Templates**: Fill out all sections of templates completely
2. **Clear Descriptions**: Write clear, actionable descriptions and acceptance criteria
3. **Proper Linking**: Always link child items to their parents
4. **Regular Updates**: Keep progress tracking current and detailed
5. **Consistent Formatting**: Use standard markdown formatting across all files

### Workflow Integration

1. **Status Synchronization**: Keep file status in sync with development progress
2. **Branch References**: Include story/epic codes in branch names and commits
3. **Progress Tracking**: Update task checkboxes and implementation notes regularly
4. **Code Review Integration**: Add review follow-up tasks to story files
5. **Documentation**: Maintain clear implementation notes and decisions

### Team Collaboration

1. **Clear Ownership**: Assign clear ownership for each story and epic
2. **Regular Reviews**: Conduct regular reviews of backlog organization
3. **Consistent Updates**: Ensure all team members follow the same update patterns
4. **Communication**: Use story files for implementation discussions and decisions
5. **Knowledge Sharing**: Document implementation approaches and lessons learned

## Related Tools

- **Methodology Selection**: [methodology-selection-guide.md](../methodology/README.md)
- **Project Tracking**: [project-tracking/README.md](../project-tracking/README.md)
- **GitHub Integration**: [github-implementation.md](github-implementation.md)
- **Templates**: [assets/README.md](../templates/README.md)

---

_This provides comprehensive step-by-step implementation instructions for filesystem-based project management with pair integration._
