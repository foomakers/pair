# Project Management Framework: GitHub Projects & MCP Server

---

## Purpose

Document the process, automation, and error handling for managing initiatives, epics, user stories, and tasks in GitHub Projects using the MCP server and pair integration.

## 📋 Table of Contents

1. [Purpose](#purpose)
2. [Prerequisites](#prerequisites)
3. [Key Concepts](#key-concepts)
4. [Process Overview](#process-overview)
   - [Creation & Linking](#1-creation--linking)
   - [Status Synchronization](#2-status-synchronization)
   - [Assignment & Branch Management](#3-assignment--branch-management)
   - [Progress Tracking](#4-progress-tracking)
   - [Error Handling](#5-error-handling)
5. [Automation Details](#automation-details)
6. [Example Validation Commands](#example-validation-commands)
7. [Issues Management in GitHub Projects](#issues-management-in-github-projects)
   - [Epic Management](#epic-management)
   - [User Story Management](#user-story-management)
   - [Task Management Within User Story Issues](#task-management-within-user-story-issues)
   - [Code Review Management](#code-review-management)
8. [Quality & Compliance](#quality--compliance)
9. [Related Documents](#related-documents)

## Prerequisites

- MCP server setup and access with required permissions (**mandatory for any interaction with GitHub Projects and Issues**)
- Write access to the target GitHub Project or repository
- Organization and repository deduced from git config unless specified
- Project must have required custom labels for initiative/epic/story tracking

## Key Concepts

- All automation applies only if GitHub Projects is the configured project management tool
- Integration with development workflow
- Automated tracking and linking
- Issue-based management
- Automated status synchronization capabilities
- Hierarchy: initiative → epic → user story → task
- Status propagation follows bottom-up rules
- All items must be linked and traceable in GitHub Projects

## Process Overview

### 1. Creation & Linking

- Use MCP API to create initiatives and epics as issues in GitHub Projects
- Assign correct labels, hierarchy, and link parent/child items
- Validate permissions before creation

### 2. Status Synchronization

- Status changes in child items trigger updates in parent items
- Parent cannot be marked as completed if any child is not completed
- Status updates are automated via MCP API
- Close the user story issue when all tasks are completed, the code review is done and reported, the PR is raised and merged
- User story without status is considered not refined

### 3. Assignment & Branch Management

- Set a user story in Todo only when the story has been refined
- When a developer resumes a user story, assign the story, set status to 'In Progress', and assign the story to a dedicated branch
- Don't start working on the story or task without proper assignment and status updates

### 4. Progress Tracking

- When a task is completed, update the user story body (checkbox) and add a comment explaining the work done
- Before picking up a task, reload the issue from Github to refresh the status
- Save the user story code review report as a comment on the user story issue
- When update the task DO NOT overwrite the user story body, only update the checkbox status leaving the rest of the body untouched

### 5. Error Handling

- Log and surface errors for API changes, permission issues, rate limits, or inconsistent hierarchy
- Abort and notify user on permission errors
- Validate hierarchy before updates
- Prompt for manual input if organization/repo deduction fails

## Automation Details

- All changes must be visible and traceable in GitHub Projects
- Use MCP API for all project management actions
- Log all operations and errors for traceability
- Retry logic for rate limits and progress tracking failures
- Adapt automation if a different project management tool is configured

## Example Validation Commands

```bash
# Check repository context
git remote -v
```

## Issues Management in GitHub Projects

### Initiative Management

1. **Field Mapping and Template Adaptation**

   - Create GitHub Project issue with initiative [template content](assets/initiative-template.md)
   - Map template fields to GitHub fields:
     - **Title**: Initiative name (include initiative number)
     - **Labels**: `initiative`, priority (`P0`, `P1`, `P2`), year, business value
     - **Description**: Full markdown template content
     - **Assignees**: Responsible owner(s)
     - **Custom Fields**: Business value, planned dates, etc.
     - **Status**: Use project board columns (Not Started, In Progress, Under Review, Completed)

2. **Automation and Creation**

   - Ensure required labels exist before creation. If the label does not exist, create it first
   - Link to related epics, user stories, and tasks for traceability
   - Set up automation for status transitions based on child epic completion

3. **Status Synchronization**

   - Configure automated status updates based on child epic progress
   - Use GitHub Actions or project board automation for status propagation
   - Maintain status consistency across the initiative-epic hierarchy

### Epic Management

1. **Issue Creation and Labeling**

   - Create epic as GitHub issue with full [template content](assets/epic-template.md)
   - Apply labels: `epic`, initiative code, priority, status. If the label does not exist, create it first.
   - Link to parent initiative issue
   - Set up project board columns: Not Started, In Progress, Under Review, Completed

2. **Project Board Management**

   - Use project board columns for epic states with consistent naming
   - Set up automation for status transitions based on user story completion
   - Track epic progress through user story completion percentage
   - Configure automated status propagation to parent initiative

3. **Status Synchronization**

   - Implement automation rules for status updates based on child user story progress
   - Ensure epic status reflects aggregated user story completion status
   - Maintain bidirectional sync between epic and initiative status

### User Story Management

1. **Issue Management**

   - Create user story as GitHub issue with [template content](assets/user-story-template.md)
   - Apply labels: `user-story`, epic code, priority, story points, status. If the label does not exist, create it first.
   - Link to parent epic and initiative issues
   - Set up project board columns: Not Started, In Progress, Under Review, Completed

2. **Sprint Planning Integration**

   - Move stories to sprint backlog when ready for development
   - Update status through development lifecycle with automated transitions
   - Track story progress through task completion (separate issues or checklist items)
   - Configure status propagation to parent epic
   - Move stories to sprint backlog when ready for development
   - Update status through development lifecycle with automated transitions
   - Track story progress through task completion (separate issues or checklist items)
   - Configure status propagation to parent epic

3. **Status Synchronization**

   - Configure automation for status updates based on task completion
   - Ensure user story status reflects task progress accurately
   - Maintain status consistency with parent epic through automated rules

### Task Management Within User Story Issues

1. **Task Integration Options: tasks Within User Story Issues**

   - Add task breakdown as checklist items within the user story issue ([Task Template](assets/task-template.md))
   - Use GitHub's task list functionality for tracking completion
   - Reference technical standards and bounded contexts in the task descriptions
   - Update user story status based on task checklist completion
   - Don't overwrite the user story body when updating (or breakdown) tasks; only update the checklist items

2. **Development Integration**

   - Connect user story issue to pull requests that implement tasks
   - Track overall story progress through task completion
   - Update user story status based on task checklist completion
   - Add details about task implementation in comments

### Code Review Management

- Create review follow-up tasks as checklist items ([Code Review Template](assets/code-review-template.md))
- Apply appropriate labels for tracking and filtering
- Track the review report through comments on the user story issue

## Quality & Compliance

- Automated tests for all integration points
- Documentation for MCP setup and troubleshooting
- All templates, links, and hierarchy must be validated
- Error handling and automation sections must be clear and reproducible

## Related Documents

- [General Collaboration & Process Guidelines](README.md)
- [Definition of Done](.pair/knowledge/guidelines/quality/standards/definition-of-done.md)
- [Testing Strategy](.pair/knowledge/guidelines/development/testing/testing-strategy.md)
- [Security Guidelines](.pair/knowledge/guidelines/quality/security/security-guidelines.md)
- [MCP Server Documentation](https://github.com/github/github-mcp-server)
