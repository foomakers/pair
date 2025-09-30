# Project Management Tool - Filesystem Implementation

_Step-by-Step Setup and Usage Guide for pair with Filesystem Project Management_

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

Update your project's way-of-working configuration to specify filesystem:

```markdown
# Way of Working

- Filesystem is adopted for project management, using markdown files and folder organization.
- The backlog is managed in `.pair/adoption/product/backlog/` directory structure.
- See `.pair/knowledge/guidelines/collaboration/project-management-tool/README.md` for usage.
```

### Step 2: Verify Directory Structure

Ensure the required filesystem structure exists:

**Primary Method (via pair Assistant):**

```bash
pair "Verify and create filesystem project management directory structure"
```

**Manual Method (Fallback):**

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
ls .pair/knowledge/guidelines/collaboration/assets/

# Required templates:
# - initiative-template.md
# - epic-template.md
# - user-story-template.md
# - task-template.md
```

## Filesystem Structure Setup

### Directory Organization

The filesystem uses a hierarchical structure that mirrors the project management hierarchy:

```
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

**Initiative Files:**

- Format: `[initiative-name].md`
- Example: `core-data-pipeline.md`
- Location: `01-initiatives/[YEAR]/`

**Epic Files:**

- Format: `[initiative-code]-[epic-code]-[epic-name].md`
- Example: `01-01-data-ingestion-pipeline.md`
- Location: `02-epics/[status]/`

**User Story Files:**

- Format: `[initiative-code]-[epic-code]-[story-code]-[story-name].md`
- Example: `01-01-001-user-registration.md`
- Location: `03-user-stories/[status]/`

### Status Management via File Location

Status changes are reflected by moving files between directories:

- **not-started/**: Items defined but not yet started
- **in-progress/**: Active work in progress
- **under-review/**: Completed work awaiting review/validation
- **completed/**: Finished and accepted items

## Working with Initiatives

### Creating Initiatives

**Step 1: Use pair Assistant (Primary Method)**

```bash
pair "Create filesystem initiative from PRD analysis"
```

**Step 2: Manual Creation (Fallback)**

```bash
# Navigate to initiatives directory
cd .pair/adoption/product/backlog/01-initiatives/2025

# Create initiative file
cp ../../../../../../knowledge/guidelines/collaboration/assets/initiative-template.md core-data-pipeline.md

# Edit with your preferred editor
code core-data-pipeline.md
```

**Step 3: Complete Initiative Details**
Fill out all sections of the initiative template:

- **Business Objective**: Clear statement of business goals
- **Success Metrics**: Measurable outcomes and KPIs
- **Priority**: P0 (Must-Have) | P1 (Should-Have) | P2 (Could-Have)
- **Estimated Timeline**: High-level timeframe
- **Dependencies**: External dependencies and blockers
- **Epic References**: Links to related epics (added as epics are created)

### Managing Initiative Status

**Update via pair Assistant:**

```bash
pair "Update initiative status and track epic completion progress"
```

**Manual Status Management:**

- Initiatives remain in yearly folders
- Status is tracked by completion of child epics
- Update the initiative file to reflect current progress

## Working with Epics

### Creating Epics from Initiatives

**Step 1: Use pair Assistant (Primary Method)**

```bash
pair "Break down epics from filesystem initiative"
```

**Step 2: Manual Epic Creation**

```bash
# Navigate to epics directory
cd .pair/adoption/product/backlog/02-epics/not-started

# Create epic file with proper naming
cp ../../../../../../../knowledge/guidelines/collaboration/assets/epic-template.md 01-01-data-ingestion-pipeline.md

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

**Status Transitions via File Movement:**

**Via pair Assistant:**

```bash
pair "Move epic to in-progress status and update parent initiative"
```

**Via Manual File Operations:**

```bash
# Move epic from not-started to in-progress
cd .pair/adoption/product/backlog/02-epics
mv not-started/01-01-data-ingestion-pipeline.md in-progress/

# Status progression:
# not-started/ → in-progress/ → under-review/ → completed/
```

## Working with User Stories

### Creating User Stories from Epics

**Step 1: Use pair Assistant (Primary Method)**

```bash
pair "Break down user stories from filesystem epic"
```

**Step 2: Manual User Story Creation**

```bash
# Navigate to user stories directory
cd .pair/adoption/product/backlog/03-user-stories/not-started

# Create story file with proper naming convention
cp ../../../../../../../knowledge/guidelines/collaboration/assets/user-story-template.md 01-01-001-user-registration.md

# Edit story details
code 01-01-001-user-registration.md
```

**Step 3: Complete Story Details**
Fill out all required sections:

- **Story Statement**: "As a [user type], I want [goal] so that [benefit]"
- **Parent Epic**: Link to parent epic file
- **Acceptance Criteria**: Clear, testable conditions
- **Priority and Sizing**: Business priority and development estimate

### Refining User Stories

**Step 1: Refinement Process**

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

**Task Breakdown Section:**

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

**Step 1: Start Development**

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

**File-Based Status System:**

- **not-started/**: Initial state, ready for refinement or development
- **in-progress/**: Active work, development started
- **under-review/**: Development complete, in code review or testing
- **completed/**: All work finished and accepted

### Bottom-Up Status Propagation

**Automatic Status Logic:**

- Parent items (epics/initiatives) are "in-progress" when any child is active
- Parent items are "completed" only when ALL children are completed
- User stories move to "completed" when all tasks are done and code is merged

### Status Update Commands

**Via pair Assistant (Primary Method):**

```bash
pair "Update filesystem user story status to in-progress and track epic progress"
pair "Mark filesystem user story as completed and update parent epic status"
pair "Move epic to completed status and update initiative progress"
```

**Via Manual File Operations (Fallback):**

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

**Branch Creation:**

```bash
# Create feature branch with story reference
git checkout -b "feature/01-01-001-user-registration"

# Include epic and initiative context if needed
git checkout -b "feature/01-01-data-ingestion/01-01-001-user-registration"
```

**Commit Message Format:**

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

**Step 1: Start Development**

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

- **Methodology Selection**: [methodology-selection-guide.md](../methodology/methodology-selection-guide.md)
- **Project Tracking**: [project-tracking-overview.md](../project-tracking/project-tracking-overview.md)
- **GitHub Integration**: [github-implementation.md](github-implementation.md)
- **Templates**: [templates/](../assets/templates/)

---

_This provides comprehensive step-by-step implementation instructions for filesystem-based project management with pair integration._
