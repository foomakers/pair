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
16. [Compatibility and Version Management](#compatibility-and-version-management)
17. [Documentation Quality Standards](#documentation-quality-standards)
18. [Related Documents](#related-documents)

## Prerequisites

- Write access to the chosen project management tool (e.g., GitHub repository, GitHub Projects, filesystem backlog directory)
- Understanding of the hierarchical structure: initiative → epic → user story → task
- Compliance with naming conventions, labeling, and templates specific to the tool
- Automation and traceability are active only if supported by the tool
- Ensure your integration is properly configured following the appropriate setup guide

## Key Concepts

- The project management tool is the source of truth for backlog management
- The hierarchical structure is always: initiative → epic → user story → task
- Item status is managed through native tool features (e.g., columns, folders, checklists)
- Parent/child traceability is mandatory and must be maintained via links, labels, or paths
- Automation (status sync, updates, comments) is implemented only if supported by the tool

## Hierarchical Principles

1. **Top-Down Planning:** Start with initiatives and break down systematically
2. **Bottom-Up Tracking:** Track progress from tasks up to initiatives
3. **Horizontal Coordination:** Coordinate work across the same levels
4. **Vertical Traceability:** Maintain clear links between all levels
5. **Status Synchronization:** Ensure status consistency across the hierarchy

## Framework Components

- **Strategic Level:** Initiatives (business objectives, 6-12 months)
  - States: Todo → In Progress → Done
  - Priority: P0 (Must-Have), P1 (Should-Have), P2 (Could-Have)
- **Tactical Level:** Epics (user value delivery, 2-4 sprints)
  - States: Todo → In Progress → Done
  - Priority: P0 (Must-Have), P1 (Should-Have), P2 (Could-Have)
- **Operational Level:** User Stories (specific user needs, 1 sprint)
  - States: Todo → Refined → In Progress → Done
  - Priority: P0 (Must-Have), P1 (Should-Have), P2 (Could-Have)
- **Implementation Level:** Tasks (development activities, hours/days)
  - Follow parent User Story state

## Supported Project Management Tools

Currently this guidelines support [Github](project-management-framework-github.md) and [filesystem](project-management-framework-filesystem.md) tools.
Please refer to the tools guideline based on the tool you choosen to manager your backlog.
If you need to use a different project management tool, please provide your tool specific guidelines and refer to it in the different sections.

## Retrieve edit or delete initiatives, epics or user story

Identify in your system which is your project management tool and follow the specific guidelines for that tool to retrieve, edit, or delete initiatives, epics, or user stories.

## State Management and Synchronization

### Universal States

All hierarchy levels use consistent states for synchronization:

- **Todo**: Work not yet begun (initial state for all items)
- **Refined**: (User Stories only) Story is detailed, estimated, and ready for development
- **In Progress**: Work actively being executed
- **Done**: Work finished and accepted

### State Workflow by Item Type

**Initiative Workflow**: Todo → In Progress → Done  
**Epic Workflow**: Todo → In Progress → Done  
**User Story Workflow**: Todo → Refined → In Progress → Done  
**Tasks**: Follow the parent User Story state

### Priority Levels

All items use consistent priority classification:

- **P0 (Must-Have)**: Critical items that must be delivered
- **P1 (Should-Have)**: Important items that should be delivered if possible
- **P2 (Could-Have)**: Nice-to-have items that could be delivered if time permits

### Example Usage

**Initiative Example:**

```markdown
**Priority**: P0 (Must-Have)
**State**: In Progress
```

**Epic Example:**

```markdown
**Priority**: P1 (Should-Have)
**State**: Todo
```

**User Story Example:**

```markdown
**Priority**: P0 (Must-Have)
**Status**: Refined
```

### Status Synchronization Rules

1. **Bottom-Up Status Propagation:**
   - Task completion triggers user story status updates
   - User story completion triggers epic status updates
   - Epic completion triggers initiative status updates
2. **Status Consistency Validation:**
   - Parent cannot be "Done" if any child is not "Done"
   - Parent moves to "In Progress" when first child starts
   - Parent moves to "Done" when all children are completed and accepted
3. **Refinement State (User Stories only):**
   - User stories must reach "Refined" state before moving to "In Progress"
   - Only refined user stories can be assigned to sprints
   - Epic can be "In Progress" when it has refined user stories ready for development

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

---

## Compatibility and Version Management

### Supported Versions

| Component           | Minimum Version | Recommended | Status       |
| ------------------- | --------------- | ----------- | ------------ |
| GitHub Projects API | 2024-01-01      | Latest      | ✅ Supported |
| GitHub REST API     | v4              | v4          | ✅ Supported |
| GitHub MCP Server   | 1.0.0           | Latest      | ✅ Supported |
| GitHub CLI          | 2.0.0           | Latest      | ✅ Fallback  |

### API Changes and Workarounds

**Common Issues and Solutions:**

- **Rate Limiting**: Use batch operations, implement delays between calls
- **Authentication Scopes**: Ensure `read:project`, `write:project`, `admin:org` scopes
- **Field Name Changes**: MCP server handles field mapping automatically
- **Legacy Projects**: Migrate to new GitHub Projects API (Classic deprecated 2024-12-31)

**Monitoring**: Check [GitHub API Changelog](https://docs.github.com/en/rest/overview/changelog) monthly

### Emergency Procedures

**If API Issues Occur:**

1. **Fallback to GitHub CLI**: `gh project item-list --owner ORG --number PROJECT`
2. **Manual Operations**: Use GitHub web interface temporarily
3. **Version Rollback**: `npm install -g @github/github-mcp-server@PREVIOUS_VERSION`

---

## Documentation Quality Standards

### Accessibility (WCAG 2.1 AA)

**Content Requirements:**

- ✅ Proper heading hierarchy (H1→H2→H3)
- ✅ Descriptive link text (avoid "click here")
- ✅ Alt text for images and diagrams
- ✅ Code blocks with language specification
- ✅ Minimum 4.5:1 contrast ratio for text

**Validation Tools:**

```bash
# Install accessibility tools
npm install -g markdownlint-cli2 markdown-link-check cspell

# Run checks
markdownlint-cli2 "**/*.md"
markdown-link-check *.md
cspell "**/*.md"
```

### Writing Standards

**Clarity Principles:**

- Use active voice and clear subjects
- Average 15-20 words per sentence
- Provide examples for complex concepts
- Include troubleshooting for common issues

---

## Related Documents

### Framework Documentation

- [General Collaboration & Process Guidelines](README.md)
- [Definition of Done](../06-definition-of-done.md)
- [Testing Strategy](../07-testing-strategy.md)
- [Security Guidelines](../10-security-guidelines.md)
- [Project Management Framework - GitHub](project-management-framework-github.md)
- [Project Management Framework - Filesystem](project-management-framework-filesystem.md)

### Complete Implementation Guide

- **[GitHub Projects Integration Guide](github-projects-integration-guide.md)** - Step-by-step GitHub Projects setup and workflows with troubleshooting
- **[Filesystem Workflow Integration Guide](filesystem-workflow-integration-guide.md)** - Step-by-step filesystem workflow setup and implementation with troubleshooting
