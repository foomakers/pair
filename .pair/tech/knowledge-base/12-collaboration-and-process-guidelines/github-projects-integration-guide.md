# GitHub Projects Integration Guide

**Step-by-Step Setup and Usage Guide for pair with GitHub Projects**

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Initial Setup](#initial-setup)
4. [Project Structure Setup](#project-structure-setup)
5. [Working with Initiatives](#working-with-initiatives)
6. [Working with Epics](#working-with-epics)
7. [Working with User Stories](#working-with-user-stories)
8. [Working with Tasks](#working-with-tasks)
9. [Status Management](#status-management)
10. [Priority and Labels Management](#priority-and-labels-management)
11. [Branch and Development Workflow](#branch-and-development-workflow)
12. [Code Review Integration](#code-review-integration)
13. [Troubleshooting](#troubleshooting)
14. [Best Practices](#best-practices)

---

## Overview

This guide provides step-by-step instructions for integrating pair with GitHub Projects to manage initiatives, epics, user stories, and tasks. GitHub Projects serves as the project management tool while pair provides AI-assisted development workflows.

### Key Benefits

- **Hierarchical Management**: Initiative → Epic → User Story → Task structure
- **Automated Status Tracking**: Bottom-up status propagation
- **Development Integration**: Branch linking and PR management
- **Priority Management**: P0/P1/P2 priority system
- **State Management**: Todo → Refined → In Progress → Done workflow

---

## Prerequisites

### Required Setup

- **GitHub Account**: With write access to your organization/repository
- **GitHub MCP Server**: Install and configure the official [GitHub MCP Server](https://github.com/github/github-mcp-server)
- **Repository Access**: Clone access to your pair-managed repository
- **Organization Permissions**: Ability to create labels and manage projects

### GitHub MCP Server Installation

**Install the GitHub MCP Server:**

```bash
# Install via npm
npm install -g @github/github-mcp-server

# Or install via your preferred package manager
# The server provides full GitHub API access via MCP protocol
```

**Configure Authentication:**
The GitHub MCP server handles authentication automatically when configured properly in your MCP client. Ensure your MCP client is configured to use the GitHub server.

**Verify Installation:**
Test the MCP server connection through your pair assistant - it should be able to access GitHub repositories, issues, and projects directly.

### Fallback Tool (Optional)

- **GitHub CLI**: Install as fallback option when MCP is not available

```bash
# Install GitHub CLI (fallback only)
gh --version
# If not installed: brew install gh (macOS) or follow GitHub CLI installation guide
```

### Required Knowledge

- Basic Git/GitHub operations
- Understanding of Agile/Scrum concepts
- Familiarity with markdown formatting

---

## Initial Setup

### Step 1: Configure way-of-working.md

Update your project's way-of-working configuration to specify GitHub Projects:

```markdown
# Way of Working

- GitHub Projects is adopted for project management, using Kanban as the workflow methodology.
- The project is [PROJECT_NAME] under the github organization [ORG_NAME].
- See `/.pair/tech/knowledge-base/12-collaboration-and-process-guidelines/project-management-framework.md` for usage.
```

### Step 2: Verify MCP GitHub Server Connection

Test your MCP server connection through pair assistant:

**Primary Method (MCP):**
Ask your pair assistant to verify GitHub access:

```bash
pair "Check GitHub repository access and verify MCP connection"
```

The assistant should be able to:

- Access your GitHub repository
- List issues and projects
- Create/update labels and project fields

**Fallback Method (GitHub CLI):**
If MCP is not available, verify GitHub CLI access:

```bash
# Check GitHub authentication (fallback only)
gh auth status

# Verify repository access (fallback only)
gh repo view [ORG]/[REPO]
```

### Step 3: Initialize Project Management Framework

Ensure the project management framework is loaded:

```bash
# Navigate to your project root
cd /path/to/your/project

# Verify pair configuration
ls .pair/adoption/tech/way-of-working.md
```

---

## Project Structure Setup

### Step 1: Set Up Project Board (Recommended Approach)

Create a GitHub Project with custom fields for better management:

1. **Access GitHub Projects**: Go to `https://github.com/orgs/[ORG]/projects`
2. **Create New Project**: Click "New project" → "Board"

### Step 2: Configure Project Status Field

Set up status columns that include the Refined state:

**Recommended Columns:**

- `📋 Todo` - Items not yet started
- `🔍 Refined` - User stories ready for development
- `🔧 In Progress` - Active work items
- `👀 Review` - Items in code review
- `✅ Done` - Completed items

**Configuration Steps:**

1. Go to your project settings
2. Edit the "Status" field
3. Add/modify values to include "Refined" state
4. Set appropriate column ordering

### Step 3: Add Priority Field

Create a custom Priority single-select field:

**Field Configuration:**

1. **Field Name**: "Priority"
2. **Field Type**: Single select
3. **Options**:
   - `P0` (color: `#d73a4a`) - Must-Have
   - `P1` (color: `#fbca04`) - Should-Have
   - `P2` (color: `#0075ca`) - Could-Have

**Setup Instructions:**

Follow [GitHub's single-select field documentation](https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields/about-single-select-fields) for detailed configuration.

1. **Add Field**: In project settings, click "Add field" → "Single select"
2. **Configure Options**: Add P0, P1, P2 with appropriate colors
3. **Set Default**: Optionally set P1 as default priority

**Editing Field Options:**

Follow [GitHub's field editing documentation](https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields/about-single-select-fields#editing-a-single-select-field) to modify priority options.

### Step 4: Add Type Field (Optional)

Create a Type field to distinguish item types:

**Field Configuration:**

1. **Field Name**: "Type"
2. **Field Type**: Single select
3. **Options**:
   - `Initiative` (color: `#7057ff`) - Strategic Initiative
   - `Epic` (color: `#a2eeef`) - Epic
   - `User Story` (color: `#1d76db`) - User Story
   - `Task` (color: `#0e8a16`) - Development Task

### Step 5: Configure Project Automation

Set up GitHub Project automation rules:

**Status Synchronization Rules:**

- Move to "In Progress" when assigned
- Move to "Review" when PR is opened
- Move to "Done" when PR is merged

**Priority Management:**

- Use project fields instead of labels for priority tracking
- Maintain priority consistency across related items

---

## Alternative Setup: Labels-Based Approach

**⚠️ Use this approach only if you prefer not to use GitHub Project custom fields**

### Create Required Labels

Set up standard labels in your GitHub repository:

**Priority Labels:**

- `P0` (color: `#d73a4a`) - Must-Have
- `P1` (color: `#fbca04`) - Should-Have
- `P2` (color: `#0075ca`) - Could-Have

**Type Labels:**

- `initiative` (color: `#7057ff`) - Strategic Initiative
- `epic` (color: `#a2eeef`) - Epic
- `user story` (color: `#1d76db`) - User Story
- `task` (color: `#0e8a16`) - Development Task

**State Labels:**

- `refined` (color: `#d4c5f9`) - Ready for Development

**Creation Commands:**

**Primary Method (via MCP GitHub Server):**
Use your pair assistant to create labels:

```bash
pair "Create GitHub repository labels for project management: P0 (red), P1 (yellow), P2 (blue) priorities, and type labels for initiative, epic, user story, task"
```

**Fallback Method (GitHub CLI):**

```bash
# Create priority labels (fallback approach)
gh label create "P0" --color "d73a4a" --description "Must-Have priority"
gh label create "P1" --color "fbca04" --description "Should-Have priority"
gh label create "P2" --color "0075ca" --description "Could-Have priority"

# Create type labels
gh label create "initiative" --color "7057ff" --description "Strategic Initiative"
gh label create "epic" --color "a2eeef" --description "Epic"
gh label create "user story" --color "1d76db" --description "User Story"
gh label create "task" --color "0e8a16" --description "Development Task"

# Create state labels (fallback for refined state)
gh label create "refined" --color "d4c5f9" --description "Ready for Development"
```

**Basic Project Board Setup:**

- `📋 Backlog` - Items not yet started
- `🔧 In Progress` - Active work items
- `👀 Review` - Items in code review
- `✅ Done` - Completed items

---

## Project Field Management

### Working with Priority Field

**Set Priority via MCP GitHub Server (Primary Method):**
Use your pair assistant to manage project fields:

```bash
pair "Set priority P0 for GitHub issue #[ISSUE_NUMBER] in project board"
pair "Update GitHub project field Priority to P1 for issue #[ISSUE_NUMBER]"
```

**Set Priority via GitHub UI:**

1. Open issue in project board
2. Set Priority field to P0/P1/P2
3. Priority automatically syncs across project views

**Set Priority via GitHub CLI (Fallback):**

```bash
# Note: Project field management via CLI requires project ID and field ID
# Recommended to use MCP or GitHub UI for field management
gh issue edit [ISSUE_NUMBER] --add-label "P0"
```

### Working with Status Field

**Status Transitions:**

- **Todo → Refined**: After story refinement process
- **Refined → In Progress**: When development starts
- **In Progress → Review**: When PR is created
- **Review → Done**: When PR is merged

**Update Status via MCP GitHub Server (Primary Method):**
Use your pair assistant to manage status transitions:

```bash
pair "Move GitHub issue #[ISSUE_NUMBER] to Refined status in project board"
pair "Update GitHub project Status field to 'In Progress' for issue #[ISSUE_NUMBER]"
pair "Set GitHub project status to Done for completed issue #[ISSUE_NUMBER]"
```

**Manual Status Updates:**
Use project board interface to drag items between columns or update Status field directly.

**Status Updates via GitHub CLI (Fallback):**

```bash
# Add in-progress label and remove todo (fallback only)
gh issue edit [ISSUE_NUMBER] --remove-label "todo" --add-label "in-progress"

# Mark as done (fallback only)
gh issue edit [ISSUE_NUMBER] --remove-label "in-progress" --add-label "done"
```

### Best Practices for Project Fields

1. **Consistent Field Usage**: Always use project fields instead of mixing with labels
2. **Automation Rules**: Set up automation to sync status with development lifecycle
3. **Field Validation**: Ensure all items have appropriate Priority and Status values
4. **Regular Maintenance**: Review and update field configurations as needed

**Status Synchronization Rules:**

- Move to "In Progress" when assigned
- Move to "Review" when PR is opened
- Move to "Done" when PR is merged

**Label Synchronization:**

- Auto-apply state labels based on column position
- Maintain priority labels across moves

---

## Working with Initiatives

### Creating an Initiative

**Step 1: Use pair Assistant**

```bash
# Start initiative creation process
pair "Create and prioritize initiatives from PRD"
```

**Step 2: Review Initiative Proposal**
The AI will analyze your PRD and propose initiatives with priorities.

**Step 3: Confirm Initiative Creation**
When prompted, confirm the initiative details and priority assignment.

### Manual Initiative Creation

If creating manually:

**Step 1: Create Initiative Issue via MCP (Primary Method)**
Use your pair assistant to create initiatives:

```bash
pair "Create GitHub initiative issue with title '[INIT-001] Initiative Name' using initiative template, priority P0, and assign to me"
```

**Step 1: Create Initiative Issue via GitHub CLI (Fallback)**

```bash
gh issue create \
  --title "[INIT-001] Initiative Name" \
  --body-file .pair/tech/knowledge-base/12-collaboration-and-process-guidelines/assets/initiative-template.md \
  --label "initiative,P0" \
  --assignee @me
```

**Step 2: Fill Initiative Template**
Complete all sections in the initiative template:

- **Priority**: P0 (Must-Have) | P1 (Should-Have) | P2 (Could-Have)
- **State**: Todo | In Progress | Done
- **Business rationale and key results**
- **Success metrics and scope definition**

**Step 3: Add to Project Board**
Use pair assistant or manually add the initiative issue to your project board in the "Todo" column.

---

## Working with Epics

### Creating Epics from Initiatives

**Step 1: Use pair Assistant**

```bash
# Start epic breakdown process
pair "Break down epics from initiative"
```

**Step 2: Select Initiative**
Choose the initiative to break down (highest priority Todo initiatives first).

**Step 3: Review Epic Breakdown**
The AI will propose epic structure and priorities based on the initiative.

### Manual Epic Creation

**Step 1: Create Epic Issue via MCP (Primary Method)**
Use your pair assistant to create epics:

```bash
pair "Create GitHub epic issue with title '[EP-001] Epic Name' using epic template, priority P0, linked to initiative INIT-001, and assign to me"
```

**Step 1: Create Epic Issue via GitHub CLI (Fallback)**

```bash
gh issue create \
  --title "[EP-001] Epic Name" \
  --body-file .pair/tech/knowledge-base/12-collaboration-and-process-guidelines/assets/epic-template.md \
  --label "epic,P0,INIT-001" \
  --assignee @me
```

**Step 2: Link to Parent Initiative**
In the epic description, reference the parent initiative:

```markdown
**Initiative**: [INIT-001] Initiative Name (#[ISSUE_NUMBER])
```

**Step 3: Set Epic Properties**

- **Priority**: Inherit from initiative or adjust based on business value
- **State**: Todo (initial state)
- **Planned dates**: Set after detailed planning

---

## Working with User Stories

### Creating User Stories from Epics

**Step 1: Use pair Assistant**

```bash
# Start user story breakdown process
pair "Break down user stories from epic"
```

**Step 2: Select Epic**
Choose the epic to break down (highest priority Todo epics first).

**Step 3: Review Story Breakdown**
The AI will propose user stories following INVEST principles.

### Manual User Story Creation

**Step 1: Create User Story Issue via MCP (Primary Method)**
Use your pair assistant to create user stories:

```bash
pair "Create GitHub user story issue with title '[US-001] User Story Title' using user story template, priority P0, linked to epic EP-001, and assign to me"
```

**Step 1: Create User Story Issue via GitHub CLI (Fallback)**

```bash
gh issue create \
  --title "[US-001] User Story Title" \
  --body-file .pair/tech/knowledge-base/12-collaboration-and-process-guidelines/assets/user-story-template.md \
  --label "user story,P0,EP-001,todo" \
  --assignee @me
```

**Step 2: Link to Parent Epic**

```markdown
**Parent Epic**: [EP-001] Epic Name (#[ISSUE_NUMBER])
```

**Step 3: Complete Story Details**

- **Status**: Todo (initial) → Refined (after refinement) → In Progress → Done
- **Story statement** (As a... I want... So that...)
- **Acceptance criteria** with testable conditions
- **Priority** and **sizing**

### Refining User Stories

**Step 1: Use pair Assistant for Refinement**

```bash
pair "Refine user story #[ISSUE_NUMBER] - analyze requirements and update status to Refined"
```

**Step 2: Update Story Status**
After refinement, the pair assistant will automatically:

- Change state from "Todo" to "Refined" in project board
- Update any labels if using fallback approach
- Move to "Refined" column in project board

**Manual Update (Fallback):**

```bash
# Update labels manually if needed (fallback only)
gh issue edit [ISSUE_NUMBER] --remove-label "todo" --add-label "refined"
```

---

## Working with Tasks

### Creating Tasks from User Stories

**Step 1: Use pair Assistant**

```bash
# Start task creation process
pair "Create tasks from user story"
```

**Step 2: Select Refined User Story**
Choose a user story in "Refined" state for task breakdown.

**Step 3: Review Task Breakdown**
The AI will create a technical task breakdown addressing acceptance criteria.

### Task Management in User Stories

Tasks are managed as checkboxes within the user story issue body:

**Task Checklist Format:**

```markdown
## Task Breakdown

### Task Checklist

- [ ] **Task-001:** Task description and technical approach
- [ ] **Task-002:** Another task with clear implementation guidance
- [ ] **Task-003:** Additional task with acceptance criteria reference

---

### Task-001: Detailed Task Name

**What to implement:**  
Detailed description of what needs to be implemented.

**Technical approach:**  
Specific technical approach and implementation details.

**Acceptance criteria addressed:**  
Which acceptance criteria this task fulfills.
```

### Task Implementation Workflow

**Step 1: Assign User Story via MCP (Primary Method)**
Use your pair assistant to start development:

```bash
pair "Assign user story #[ISSUE_NUMBER] to me and update status to In Progress"
```

**Step 1: Assign User Story via GitHub CLI (Fallback)**

```bash
# Assign story to yourself and set to In Progress
gh issue edit [ISSUE_NUMBER] --add-assignee @me
```

**Step 2: Update Story Status**
The pair assistant will automatically:

- Change project field from "Refined" to "In Progress"
- Update any labels if using fallback approach
- Move to "In Progress" column
- Help create implementation branch

**Manual Update (Fallback):**

```bash
# Change labels manually (fallback only)
gh issue edit [ISSUE_NUMBER] --remove-label "refined" --add-label "in-progress"
```

**Step 3: Implement Tasks**
For each task:

1. Use pair assistant to implement functionality
2. Update the checkbox: `- [x] **Task-001:** Completed task`
3. Use pair assistant to add implementation comments

**Step 4: Complete Story**
When all tasks are done:

```bash
pair "Create pull request for user story #[ISSUE_NUMBER] and request code review"
```

The pair assistant will:

- Create pull request with proper linking
- Update story status to "Review"
- Set status to "Done" after merge

---

## Status Management

### Universal States

**For All Items (Initiative/Epic):**

- **Todo**: Item defined but work not started
- **In Progress**: Active work ongoing
- **Done**: Item completed and accepted

**For User Stories (Additional State):**

- **Refined**: Story detailed and ready for development

### Status Transition Rules

**Bottom-Up Propagation:**

- Parent items automatically progress when all children are complete
- Parent items cannot be "Done" if any child is not "Done"

**Manual Transitions:**

- Todo → Refined (user stories only, after refinement process)
- Refined → In Progress (when development starts)
- In Progress → Done (when implementation complete)

### Status Update Commands

**Update Issue Status via MCP (Primary Method):**
Use your pair assistant for status updates:

```bash
pair "Update GitHub issue #[ISSUE_NUMBER] status to In Progress"
pair "Mark GitHub issue #[ISSUE_NUMBER] as Done in project board"
pair "Move issue #[ISSUE_NUMBER] to Refined column in GitHub project"
```

**Update Issue Status via GitHub CLI (Fallback):**

```bash
# Add in-progress label and remove todo (fallback only)
gh issue edit [ISSUE_NUMBER] --remove-label "todo" --add-label "in-progress"

# Mark as done (fallback only)
gh issue edit [ISSUE_NUMBER] --remove-label "in-progress" --add-label "done"
```

---

## Priority and Labels Management

### Priority System

**P0 (Must-Have)**:

- Critical for product success
- Highest implementation priority
- Color: `#d73a4a` (red)

**P1 (Should-Have)**:

- Important but not critical
- Medium implementation priority
- Color: `#fbca04` (yellow)

**P2 (Could-Have)**:

- Nice to have features
- Lowest implementation priority
- Color: `#0075ca` (blue)

### Label Management Commands

**Add Priority Labels via MCP (Primary Method):**
Use your pair assistant for label management:

```bash
pair "Set priority P0 for GitHub issue #[ISSUE_NUMBER]"
pair "Change priority from P1 to P0 for issue #[ISSUE_NUMBER]"
pair "Add epic EP-001 label to GitHub issue #[ISSUE_NUMBER]"
```

**Add Priority Labels via GitHub CLI (Fallback):**

```bash
# Set issue priority (fallback only)
gh issue edit [ISSUE_NUMBER] --add-label "P0"

# Change priority (fallback only)
gh issue edit [ISSUE_NUMBER] --remove-label "P1" --add-label "P0"
```

**Add Hierarchy Labels via MCP (Primary Method):**

```bash
pair "Link user story #[ISSUE_NUMBER] to epic EP-001"
pair "Associate epic #[ISSUE_NUMBER] with initiative INIT-001"
```

**Add Hierarchy Labels via GitHub CLI (Fallback):**

```bash
# Link user story to epic (fallback only)
gh issue edit [ISSUE_NUMBER] --add-label "EP-001"

# Link epic to initiative (fallback only)
gh issue edit [ISSUE_NUMBER] --add-label "INIT-001"
```

---

## Branch and Development Workflow

### Branch Naming Convention

Follow consistent branch naming that includes story reference:

```bash
# Feature branch format
git checkout -b "feature/US-001-user-authentication"

# Hotfix branch format
git checkout -b "hotfix/US-042-login-fix"

# Epic branch format (for large features)
git checkout -b "epic/EP-005-payment-system"
```

### Branch Linking to Issues

**Automatic Linking:**

- Include issue number in branch name for automatic linking
- GitHub will automatically link branches to issues

**Manual Linking:**

```bash
# In commit messages, reference the issue
git commit -m "Implement user authentication logic

Addresses authentication requirements for user login flow.

Resolves #25"
```

### Development Flow Integration

**Step 1: Start Development via MCP (Primary Method)**
Use your pair assistant to initiate development:

```bash
pair "Start development for user story #[ISSUE_NUMBER] - assign to me, create feature branch, and update status to In Progress"
```

**Step 1: Start Development via GitHub CLI (Fallback)**

```bash
# Assign yourself to the user story (fallback only)
gh issue edit [ISSUE_NUMBER] --add-assignee @me

# Create feature branch
git checkout -b "feature/US-001-feature-name"

# Update issue status (fallback only)
gh issue edit [ISSUE_NUMBER] --remove-label "refined" --add-label "in-progress"
```

**Step 2: During Development**

- Use pair assistant to update task checkboxes as you complete them
- Let pair assistant add implementation comments to the issue
- Push commits with descriptive messages

**Step 3: Complete Development via MCP (Primary Method)**

```bash
pair "Complete development for user story #[ISSUE_NUMBER] - create pull request and request code review"
```

**Step 3: Complete Development via GitHub CLI (Fallback)**

```bash
# Push final changes
git push origin feature/US-001-feature-name

# Create pull request linked to issue (fallback only)
gh pr create --title "Implement feature name" --body "Resolves #[ISSUE_NUMBER]"
```

---

## Code Review Integration

### Code Review Process

**Step 1: Request Review via MCP (Primary Method)**
Use your pair assistant to manage code reviews:

```bash
pair "Request code review for pull request #[PR_NUMBER] and update user story status"
pair "Approve pull request #[PR_NUMBER] with review comment"
pair "Request changes for pull request #[PR_NUMBER] with specific feedback"
```

**Step 1: Request Review via GitHub CLI (Fallback)**
After creating PR, request code review:

```bash
gh pr review [PR_NUMBER] --approve
# or
gh pr review [PR_NUMBER] --request-changes --body "Review feedback"
```

**Step 2: Track Review in User Story**
The pair assistant will automatically add code review status to user story as comment, or add manually:

```markdown
## Code Review Status

**PR**: #[PR_NUMBER]  
**Reviewer**: @reviewer-username  
**Status**: Approved / Changes Requested  
**Review Date**: YYYY-MM-DD

### Review Findings

- Issue 1: Description and resolution
- Issue 2: Description and resolution
```

**Step 3: Address Review Feedback via MCP (Primary Method)**
If changes requested:

```bash
pair "Address code review feedback for PR #[PR_NUMBER] and create follow-up tasks"
```

**Step 3: Address Review Feedback via Manual Process (Fallback)**
If changes requested:

1. Create follow-up tasks as checkboxes in user story
2. Address feedback in commits
3. Update PR and request re-review

### Review Follow-Up Tasks

Add review tasks to the user story checklist:

```markdown
### Code Review Follow-Up Tasks

- [ ] **Review-001:** Address security concern in authentication module
- [ ] **Review-002:** Add unit tests for edge cases
- [ ] **Review-003:** Improve error handling in API endpoints
```

---

## Troubleshooting

### Common Issues

**Issue: MCP GitHub server connection failed**

```bash
# Test MCP connection through pair assistant
pair "Test GitHub repository access and list recent issues"

# If MCP fails, verify GitHub CLI as fallback
gh auth status

# Re-authenticate if needed
gh auth login
```

**Issue: Labels not found**

```bash
# Use pair assistant to check and create labels (primary method)
pair "List all GitHub repository labels and create missing project management labels"

# Fallback: Check existing labels with GitHub CLI
gh label list

# Fallback: Create missing labels with GitHub CLI
gh label create "P0" --color "d73a4a" --description "Must-Have priority"
```

**Issue: Project board not updating**

- Use pair assistant to verify project board automation rules
- Check if issues are properly assigned to project via MCP
- Verify project board permissions through GitHub UI
- Ensure project board fields are configured correctly

**Issue: Branch not linking to issue**

- Verify branch name includes issue number
- Check if issue number is correct
- Use pair assistant to create proper linking in commit messages

### Permission Issues

**Repository Access via MCP (Primary Method):**

```bash
# Test repository access through pair assistant
pair "Check GitHub repository permissions and test issue creation"
```

**Repository Access via GitHub CLI (Fallback):**

```bash
# Check repository permissions (fallback only)
gh repo view [ORG]/[REPO]

# Check if you can create issues (fallback only)
gh issue create --title "Test" --body "Test issue" --dry-run
```

**Organization Access:**

- Verify you're a member of the organization through GitHub UI
- Check if you have project board access in organization settings
- Ensure label and project management permissions
- Use pair assistant to test organization-level operations

### API Rate Limits

If hitting GitHub API rate limits:

```bash
# Use pair assistant to check rate limits (primary method)
pair "Check GitHub API rate limit status and suggest optimization"

# Fallback: Check rate limit status with GitHub CLI
gh api rate_limit

# Wait for rate limit reset or use personal access token
# MCP server typically handles rate limiting more efficiently
```

---

## Best Practices

### Issue Management

1. **Consistent Naming**: Use prefixes (INIT-, EP-, US-) for easy identification
2. **Complete Templates**: Fill all required template sections
3. **Proper Linking**: Always link child items to parents
4. **Regular Updates**: Keep status and progress updated
5. **Clear Descriptions**: Write clear, actionable descriptions

### Label Management

1. **Standard Labels**: Use consistent label names and colors
2. **Hierarchy Labels**: Apply parent item labels to children
3. **Status Labels**: Keep status labels current with actual progress
4. **Priority Labels**: Assign and maintain accurate priorities

### Development Workflow

1. **Branch Naming**: Follow consistent naming conventions
2. **Commit Messages**: Write clear, descriptive commit messages
3. **Issue References**: Always reference issues in PRs and commits
4. **Status Updates**: Update issue status at each workflow stage
5. **Code Review**: Always request and address code reviews

### Project Board Management

1. **Column Organization**: Keep columns organized and meaningful
2. **Automation Rules**: Set up and maintain automation rules
3. **Regular Grooming**: Regularly review and update board status
4. **Clear Criteria**: Define clear criteria for column transitions

### Communication

1. **Issue Comments**: Use comments for status updates and clarifications
2. **Documentation**: Keep implementation notes in issue comments
3. **Review Feedback**: Document code review feedback and resolutions
4. **Team Updates**: Regular communication about progress and blockers

---

This guide provides comprehensive instructions for integrating pair with GitHub Projects. For technical automation details, see [project-management-framework-github.md](project-management-framework-github.md).

For additional support, refer to the [troubleshooting section](#troubleshooting) or consult the [project management framework documentation](project-management-framework.md).
