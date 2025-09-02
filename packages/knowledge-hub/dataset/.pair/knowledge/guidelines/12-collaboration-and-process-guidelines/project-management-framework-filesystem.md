# Project Management Framework: Filesystem Backlog

---

## Purpose

Document the process, structure, and quality requirements for managing initiatives, epics, user stories, and tasks using a filesystem-based backlog organization with markdown files.

## 📋 Table of Contents

1. [Purpose](#purpose)
2. [Prerequisites](#prerequisites)
3. [Key Concepts](#key-concepts)
4. [Process Overview](#process-overview)
   - [Creation & Linking](#1-creation--linking)
   - [Status Synchronization](#2-status-synchronization)
   - [Folder & File Management](#3-folder--file-management)
   - [Progress Tracking](#4-progress-tracking)
   - [Quality Validation](#5-quality-validation)
5. [Filesystem Organization](#filesystem-organization)
6. [Example Backlog Structure](#example-backlog-structure)
7. [Backlog Management in Filesystem](#backlog-management-in-filesystem)
   - [Initiative Management](#initiative-management)
   - [Epic Management](#epic-management)
   - [User Story Management](#user-story-management)
   - [Task Management Within User Story Files](#task-management-within-user-story-files)
   - [Code Review Management](#code-review-management)
8. [Quality & Compliance](#quality--compliance)
9. [Related Documents](#related-documents)

---

## Prerequisites

- Access to the repository containing the `.pair/adoption/product/backlog/` directory
- Knowledge of naming conventions and folder organization
- Markdown editing tools
- Familiarity with initiative → epic → user story → task hierarchy
- Ignore this documentation if a different project management tool is adopted (see related guidelines)

---

## Key Concepts

- Filesystem is the **source of truth** for backlog management
- Hierarchical structure strictly follows initiative → epic → user story → task
- Status is represented by **file placement in state folders**
- All backlog items must follow prescribed templates
- Traceability is ensured via naming conventions and markdown links
- Manual status synchronization through file organization

---

## Process Overview

### 1. Creation & Linking

- Create initiatives, epics, and stories using their respective templates
- Follow naming conventions to avoid conflicts
- Use markdown links to maintain hierarchy traceability

### 2. Status Synchronization

- Status changes are reflected by moving files across folders:
  - `not-started/` → `in-progress/` → `under-review/` → `completed/`
- Parent item status depends on child item completion (bottom-up propagation)

### 3. Folder & File Management

- Initiatives, epics, and stories live in structured folders under `.pair/adoption/product/backlog/`
- Tasks are appended inside user story files, not stored separately
- File moves must preserve filenames for traceability

### 4. Progress Tracking

- Progress is tracked by embedded checklists in user story files
- Updates to tasks must reflect in user story body and status
- Parent epic/initiative progress is updated based on child item completion

### 5. Quality Validation

- All templates must be fully completed
- Traceability to parent/child hierarchy must be maintained
- INVEST principles apply to user stories
- Consistent documentation standards across backlog

---

## Filesystem Organization

- **01-initiatives/** → yearly folders with initiative files
- **02-epics/** → subfolders for states (`not-started/`, `in-progress/`, etc.)
- **03-user-stories/** → subfolders for states, each containing user stories with embedded tasks

---

## Example Backlog Structure

```
.pair/adoption/product/backlog/
├── 01-initiatives/
│   ├── 2025/
│   │   ├── core-data-pipeline.md
│   │   ├── unified-portfolio-experience.md
│   │   └── multi-broker-integration.md
├── 02-epics/
│   ├── not-started/
│   │   └── 01-01-data-ingestion-pipeline.md
│   ├── in-progress/
│   │   └── 02-01-user-dashboard.md
│   └── completed/
│       └── 03-03-broker-sync.md
├── 03-user-stories/
│   ├── backlog/
│   │   └── 01-01-001-user-registration.md
│   ├── in-progress/
│   │   └── 01-01-002-email-verification.md
│   └── completed/
│       └── 01-02-001-dashboard-overview.md
```

---

## Backlog Management in Filesystem

### Initiative Management

- Create from PRDs with template
- List existing initiatives in [`.pair/adoption/product/backlog/01-initiatives/`](.pair/adoption/product/backlog/01-initiatives/) to avoid numbering conflicts
- Store in yearly folders under `01-initiatives/`
- Move files across state folders to update status
- Link to related epics
- Organize initiatives in state-based subfolders:
  - `not-started/` for initiatives not yet begun
  - `in-progress/` for initiatives currently active
  - `under-review/` for initiatives awaiting approval/validation
  - `completed/` for finished initiatives
  - Move files between folders to update status (preserve filename for traceability)
  - Update initiative status based on epic completion progress

#### File System Example

```
.pair/adoption/product/backlog/01-initiatives/
├── 2025/
│   ├── core-data-pipeline.md
│   ├── unified-portfolio-experience.md
│   └── multi-broker-integration.md
└── [YYYY]/
    └── [future initiatives]
```

### Epic Management

- Created only after parent initiative exists
- Stored in `02-epics/` under state folders
- Move files between state folders to update status (don't change filenames)
- Update epic status based on user story completion progress
- Naming convention: `[initiative-code]-[epic-code]-[epic-name].md`
- If not different decided by the team, the epic is always "Application Bootstrap & Setup" (Epic 0)
- Store epics in [`.pair/adoption/product/backlog/02-epics/`](.pair/adoption/product/backlog/02-epics/) with state-based subfolders:
  - `not-started/` for epics not yet begun
  - `in-progress/` for epics currently being worked on
  - `under-review/` for epics awaiting final approval
  - `completed/` for finished epics

#### File System Example

```
.pair/adoption/product/backlog/02-epics/backlog/01-01-data-ingestion-pipeline.md
.pair/adoption/product/backlog/02-epics/backlog/01-02-data-validation-framework.md
.pair/adoption/product/backlog/02-epics/in-progress/02-01-user-dashboard.md
.pair/adoption/product/backlog/02-epics/done/03-03-broker-sync.md
```

### User Story Management

- Derived from epics using breakdown template
- Stored in `03-user-stories/` under state folders with state-based subfolders:
  - `not-started/` for stories not yet begun
  - `in-progress/` for stories currently being developed
  - `under-review/` for stories awaiting acceptance
  - `completed/` for finished and accepted stories
- Naming convention: `[initiative-code]-[epic-code]-[story-code]-[story-name].md`
- Task breakdown appended inside story file
- Move files between state folders to update user story status
- Link to parent epic via filename or relative path
- Use markdown links for all document references
- Append task breakdown directly to user story file (no separate task files)

#### File System Example

```
.pair/adoption/product/backlog/03-user-stories/backlog/01-01-001-user-registration.md
.pair/adoption/product/backlog/03-user-stories/backlog/01-01-002-email-verification.md
.pair/adoption/product/backlog/03-user-stories/backlog/01-02-001-dashboard-overview.md
```

### Task Management Within User Story Files

- Tasks are embedded at the end of user story markdown - no separate task files
- Follow task template structure
- Reference parent user story, epic, and initiative codes for traceability
- Add task breakdown section using the comprehensive task template
- Add review follow-up tasks to existing user story files
- Update user story status to reflect additional review work

### Code Review Management

- Review follow-up tasks appended to existing user stories
- Update story status accordingly
- Maintain traceability to epic and initiative

---

## Quality & Compliance

- Enforce template adherence at all backlog levels
- Validate hierarchy integrity and traceability
- Regular reviews of folder structure and naming
- Ensure compliance with technical standards (architecture, UX/UI, infra)

---

## Related Documents

- [Definition of Done](.pair/knowledge/guidelines/06-definition-of-done.md)
- [Testing Strategy](.pair/knowledge/guidelines/07-testing-strategy.md)
- [Security Guidelines](.pair/knowledge/guidelines/10-security-guidelines.md)
- [Observability Guidelines](.pair/knowledge/guidelines/11-observability-guidelines.md)
- [Architecture Guidelines](.pair/knowledge/guidelines/01-architectural-guidelines.md)
- [Tech Stack Guidelines](.pair/knowledge/guidelines/03-technical-guidelines.md)
- [Infrastructure Guidelines](.pair/knowledge/guidelines/04-infrastructure-guidelines.md)
- [UX/UI Guidelines](.pair/knowledge/guidelines/05-ux-guidelines.md)
