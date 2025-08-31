# Project Management Framework

## Purpose

Defines the guidelines, key concepts, and prerequisites for backlog management using a project management tool (e.g., GitHub Projects with MCP server or filesystem). This document focuses exclusively on the management, traceability, and automation methods provided by the selected project management tool.

## 📋 Table of Contents

1. [Purpose](#purpose)
2. [Prerequisites](#prerequisites)
3. [Key Concepts](#key-concepts)
4. [File Links](#file-links)
5. [Hierarchical Principles](#hierarchical-principles)
6. [Framework Components](#framework-components)
7. [Supported Project Management Tools](#supported-project-management-tools)
8. [Retrieve edit or delete initiatives, epics or user story](#retrieve-edit-or-delete-initiatives-epics-or-user-story)
9. [State Management and Synchronization](#state-management-and-synchronization)
   - [Universal States](#universal-states)
   - [Status Synchronization Rules](#status-synchronization-rules)
10. [Initiative Template](#initiative-template)
11. [Epic Template](#epic-template)
12. [User Story Template (Initial Breakdown)](#user-story-template-initial-breakdown)
13. [User Story Refined Template](#user-story-refined-template)
14. [Task Template](#task-template)
15. [Code Review Template](#code-review-template)
16. [Related Documents](#related-documents)

## Prerequisites

- Write access to the chosen project management tool (e.g., GitHub repository, GitHub Projects, filesystem backlog directory)
- Understanding of the hierarchical structure: initiative → epic → user story → task
- Compliance with naming conventions, labeling, and templates specific to the tool
- Automation and traceability are active only if supported by the tool

## Key Concepts

- The project management tool is the source of truth for backlog management
- The hierarchical structure is always: initiative → epic → user story → task
- Item status is managed through native tool features (e.g., columns, folders, checklists)
- Parent/child traceability is mandatory and must be maintained via links, labels, or paths
- Automation (status sync, updates, comments) is implemented only if supported by the tool

### 📄 File Links

- [Project Management Framework - GitHub](project-management-framework-github.md)
- [Project Management Framework - Filesystem](project-management-filesystem.md)
- [Initiative Template](assets/initiative-template.md)
- [Epic Template](assets/epic-template.md)
- [User Story Template](assets/user-story-template.md)
- [Task Template](assets/task-template.md)
- [Code Review Template](assets/code-review-template.md)

## Hierarchical Principles

1. **Top-Down Planning:** Start with initiatives and break down systematically
2. **Bottom-Up Tracking:** Track progress from tasks up to initiatives
3. **Horizontal Coordination:** Coordinate work across the same levels
4. **Vertical Traceability:** Maintain clear links between all levels
5. **Status Synchronization:** Ensure status consistency across the hierarchy

## Framework Components

- **Strategic Level:** Initiatives (business objectives, 6-12 months)
- **Tactical Level:** Epics (user value delivery, 2-4 sprints)
- **Operational Level:** User Stories (specific user needs, 1 sprint)
- **Implementation Level:** Tasks (development activities, hours/days)

## Supported Project Management Tools

Currently this guidelines support [filesystem](project-management-framework-github.md) and [Github](project-management-filesystem.md) tools.
Please refer to the tools guideline based on the tool you choosen to manager your backlog.
If you need to use a different project management tool, please provide your tool specific guidelines and refer to it in the different sections.

## Retrieve edit or delete initiatives, epics or user story

Identify in your system which is your project management tool and follow the specific guidelines for that tool to retrieve, edit, or delete initiatives, epics, or user stories.

## State Management and Synchronization

### Universal States

All hierarchy levels use consistent states for synchronization:

- **Not Started:** Work not yet begun
- **In Progress:** Work actively being executed
- **Under Review:** Work completed but awaiting review/approval
- **Completed:** Work finished and accepted

### Status Synchronization Rules

1. **Bottom-Up Status Propagation:**
   - Task completion triggers user story status updates
   - User story completion triggers epic status updates
   - Epic completion triggers initiative status updates
2. **Status Consistency Validation:**
   - Parent cannot be "Completed" if any child is not "Completed"
   - Parent moves to "In Progress" when first child starts
   - Parent moves to "Under Review" when all children are completed
   - Parent moves to "Completed" when all children are completed and accepted

## Initiative Template

[See Initiative Template](assets/initiative-template.md)

## Epic Template

[See Epic Template](assets/epic-template.md)

## User Story Template (Initial Breakdown)

[See Initial Breakdown Section](assets/user-story-template.md#initial-breakdown)

## User Story Refined Template

[See Refined User Story Section](assets/user-story-template.md#refined-user-story)

## Task Template

[See Task Template](assets/task-template.md)

## 📋 Code Review Template

[See Code Review Management Template](assets/code-review-template.md)

## Related Documents

- [General Collaboration & Process Guidelines](README.md)
- [Definition of Done](../06-definition-of-done.md)
- [Testing Strategy](../07-testing-strategy.md)
- [Security Guidelines](../10-security-guidelines.md)
- [Project Management Framework - GitHub](project-management-framework-github.md)
- [Project Management Framework - Filesystem](project-management-filesystem.md)
