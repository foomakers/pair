# Project Management Integration Guide

**Complete Setup and Workflow Guide for GitHub Projects and Filesystem Workflows**

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Tool Selection](#tool-selection)
3. [GitHub Projects Setup](#github-projects-setup)
4. [Filesystem Workflow Setup](#filesystem-workflow-setup)
5. [Common Workflows](#common-workflows)
6. [Troubleshooting](#troubleshooting)

---

## Overview

This guide provides complete setup and workflow instructions for both GitHub Projects and filesystem-based project management approaches. Choose the method that best fits your team's needs and infrastructure.

### Quick Comparison

| Feature                | GitHub Projects                  | Filesystem                          |
| ---------------------- | -------------------------------- | ----------------------------------- |
| **Best For**           | Teams, collaboration, automation | Individual developers, offline work |
| **Setup Complexity**   | Medium (requires MCP server)     | Low (directory structure)           |
| **Automation**         | Full automation via API          | Manual status management            |
| **Offline Support**    | Limited                          | Full                                |
| **Team Collaboration** | Excellent                        | Basic (via git)                     |

---

## Tool Selection

### Choose GitHub Projects if:

- Working in a team environment
- Need automated status tracking
- Want integration with GitHub workflows
- Require advanced project management features

### Choose Filesystem if:

- Working solo or small team
- Need offline capability
- Prefer simple, file-based organization
- Want version control for project management

---

## GitHub Projects Setup

### Prerequisites

**Required Tools:**

- GitHub repository with Projects enabled
- Node.js 18+ and npm
- GitHub CLI (optional, for fallback)

**Required Permissions:**

- Repository access (read/write)
- Projects access (admin for creation, write for updates)
- Organization membership (for org projects)

### Step 1: Install GitHub MCP Server

```bash
# Install MCP server globally
npm install -g @github/github-mcp-server

# Verify installation
npm list -g @github/github-mcp-server
```

### Step 2: Configure Authentication

```bash
# Authenticate with GitHub CLI (recommended)
gh auth login --scopes "read:project,write:project,admin:org"

# Verify authentication
gh auth status
```

### Step 3: Create Project Structure

**Option A: Using pair assistant**

```bash
pair "Create new GitHub Project for pair project management with Status and Priority fields"
```

**Option B: Manual setup**

1. Go to GitHub repository → Projects → New project
2. Choose "Table" view
3. Add custom fields:
   - **Status**: Single select (Todo, Refined, In Progress, Done)
   - **Priority**: Single select (P0, P1, P2)
   - **Type**: Single select (initiative, epic, user story)

### Step 4: Configure Labels

**Create required labels in repository:**

```bash
pair "Create project management labels for initiatives, epics, and user stories"
```

**Manual label creation:**

- `initiative` (purple #8B5CF6)
- `epic` (blue #3B82F6)
- `user story` (green #10B981)
- `P0` (red #EF4444)
- `P1` (orange #F59E0B)
- `P2` (yellow #EAB308)

### GitHub Projects Workflows

#### Creating and Managing Issues

**1. Create Initiative:**

```bash
pair "Create new initiative issue with proper template and project assignment"
```

**2. Create Epic:**

```bash
pair "Create new epic under initiative [INITIATIVE_NUMBER] with project assignment"
```

**3. Create User Story:**

```bash
pair "Create new user story under epic [EPIC_NUMBER] with Refined state"
```

#### Status Management

**Update Status via pair:**

```bash
# Move user story to In Progress
pair "Update user story #[NUMBER] status to In Progress and assign to me"

# Complete user story
pair "Complete user story #[NUMBER] and update epic progress"
```

**Manual status updates:**

1. Open issue in GitHub
2. Update Status field in Projects
3. Move to appropriate column

#### Task Management

Tasks are managed as checkboxes within user story issues:

```markdown
## Task Breakdown

### Task Checklist

- [ ] **Task-001:** API endpoint implementation
- [ ] **Task-002:** Frontend component creation
- [ ] **Task-003:** Integration testing

### Task-001: API Endpoint Implementation

**What to implement:** Create REST endpoint with validation
**Technical approach:** Express.js with Joi validation
**Acceptance criteria addressed:** AC1, AC2
```

---

## Filesystem Workflow Setup

### Prerequisites

**Required:**

- Git repository access
- File system write permissions
- Text editor or IDE

### Step 1: Create Directory Structure

```bash
# Create backlog directory structure
mkdir -p .pair/adoption/product/backlog/{01-initiatives,02-epics,03-user-stories}

# Create status subdirectories
cd .pair/adoption/product/backlog
mkdir -p 01-initiatives/2025
mkdir -p 02-epics/{not-started,in-progress,under-review,completed}
mkdir -p 03-user-stories/{not-started,in-progress,under-review,completed}

# Create README files
echo "# Initiatives 2025" > 01-initiatives/2025/README.md
echo "# Epics" > 02-epics/README.md
echo "# User Stories" > 03-user-stories/README.md
```

### Step 2: Configure Way of Working

```bash
# Update way-of-working.md to specify filesystem
echo "Filesystem workflows adopted for project management. See filesystem guide for usage." >> .pair/adoption/tech/way-of-working.md
```

### Filesystem Workflows

#### File Naming Conventions

**Format:** `[PREFIX]-[ID]-[TITLE].md`

- **Initiatives:** `01-YYYY-initiative-title.md`
- **Epics:** `01-NN-epic-title.md` (NN = sequence within initiative)
- **User Stories:** `01-NN-NNN-user-story-title.md` (epic-story sequence)

**Examples:**

```
01-initiatives/2025/01-2025-user-management-system.md
02-epics/in-progress/01-01-user-authentication.md
03-user-stories/in-progress/01-01-001-user-registration.md
```

#### Creating Items

**1. Create Initiative:**

```bash
# Copy template and customize
cp .pair/tech/knowledge-base/12-collaboration-and-process-guidelines/assets/initiative-template.md \
   .pair/adoption/product/backlog/01-initiatives/2025/01-2025-my-initiative.md
```

**2. Create Epic:**

```bash
# Copy template and link to initiative
cp .pair/tech/knowledge-base/12-collaboration-and-process-guidelines/assets/epic-template.md \
   .pair/adoption/product/backlog/02-epics/not-started/01-01-my-epic.md
```

**3. Create User Story:**

```bash
# Copy template and link to epic
cp .pair/tech/knowledge-base/12-collaboration-and-process-guidelines/assets/user-story-template.md \
   .pair/adoption/product/backlog/03-user-stories/not-started/01-01-001-my-story.md
```

#### Status Management

**Move files between status directories:**

```bash
# Start work on user story
mv .pair/adoption/product/backlog/03-user-stories/not-started/01-01-001-user-registration.md \
   .pair/adoption/product/backlog/03-user-stories/in-progress/

# Complete user story
mv .pair/adoption/product/backlog/03-user-stories/in-progress/01-01-001-user-registration.md \
   .pair/adoption/product/backlog/03-user-stories/completed/
```

#### Task Management

Tasks are embedded within user story files:

```markdown
## Task Breakdown

### Task Checklist

- [ ] **Task-001:** Set up user registration API endpoint
- [x] **Task-002:** Create user registration form UI ✅ 2025-09-01
- [ ] **Task-003:** Implement email verification workflow

### Task-001: Set up user registration API endpoint

**What to implement:** Create REST API endpoint for user registration
**Technical approach:** Use Express.js router with bcrypt for passwords
**Acceptance criteria addressed:** AC1: Users can register with email and password
**Estimated effort:** 4 hours
**Dependencies:** Database schema setup
```

---

## Common Workflows

### Development Workflow Integration

**1. Start Development:**

```bash
# For GitHub Projects
pair "Start development for user story #[NUMBER] - create branch and update status"

# For Filesystem
git checkout -b feature/US-001-user-registration
# Move story file to in-progress directory
```

**2. Track Progress:**

```bash
# Update task completion in both approaches
# GitHub: Update issue body with checked tasks
# Filesystem: Edit story file and check off completed tasks
```

**3. Complete Story:**

```bash
# For GitHub Projects
pair "Complete user story #[NUMBER] and update epic status"

# For Filesystem
# Move story file to completed directory
mv .pair/adoption/product/backlog/03-user-stories/in-progress/story.md \
   .pair/adoption/product/backlog/03-user-stories/completed/
```

### Sprint Management

**Sprint Planning:**

```bash
# GitHub Projects: Use project views and filters
pair "List refined user stories with P0 priority for sprint planning"

# Filesystem: Query files in directories
find .pair/adoption/product/backlog/03-user-stories/not-started -name "*P0*" -type f
```

**Daily Standups:**

```bash
# Check current work status
pair "List in-progress user stories assigned to me"

# Or for filesystem
ls .pair/adoption/product/backlog/03-user-stories/in-progress/
```

---

## Troubleshooting

### GitHub Projects Issues

#### MCP Server Connection Failed

**Symptoms:** pair assistant cannot access GitHub
**Solutions:**

1. Check MCP server installation: `npm list -g @github/github-mcp-server`
2. Re-authenticate: `gh auth refresh --scopes "read:project,write:project"`
3. Restart MCP client (Claude Desktop)

#### Project Board Not Updating

**Symptoms:** Issues not appearing in project
**Solutions:**

1. Check project assignment: Issues must be explicitly added to project
2. Verify automation rules are active
3. Check permissions: Ensure write access to project

#### Rate Limiting

**Symptoms:** "Rate limit exceeded" errors
**Solutions:**

1. Use batch operations: `pair "Perform bulk GitHub operations"`
2. Implement delays between operations
3. Check rate limit status: `gh api rate_limit`

### Filesystem Issues

#### Broken Directory Structure

**Symptoms:** Missing directories or wrong file placement
**Solutions:**

1. Recreate structure: Run setup commands from Step 1
2. Fix file placement: Use `find` to locate misplaced files
3. Standardize naming: Follow naming conventions strictly

#### Broken Links Between Files

**Symptoms:** Markdown links not working
**Solutions:**

1. Use relative paths: `../../02-epics/in-progress/epic-file.md`
2. Check file existence: Verify target files exist
3. Update links when moving files

#### Inconsistent Status

**Symptoms:** Files in wrong status directories
**Solutions:**

1. Audit status: Check parent-child relationships
2. Move files to correct directories
3. Update cross-references in related files

### General Issues

#### Tool Configuration Problems

**Check:** `.pair/adoption/tech/way-of-working.md` has correct tool specified

#### Authentication Issues

**Check:** GitHub CLI status with `gh auth status`

#### Performance Problems

**Solutions:**

- Limit query scope for large projects
- Use pagination for bulk operations
- Cache frequently accessed data

### Emergency Procedures

**Complete Reset:**

1. Backup current state
2. Reset configuration
3. Recreate from templates
4. Validate restoration

**Quick Fixes:**

```bash
# Health check
.pair/scripts/health-check.sh

# Test connectivity
pair "Test GitHub connectivity and permissions"

# Validate directory structure
tree .pair/adoption/product/backlog/
```

---

This unified guide provides complete setup and workflow instructions for both approaches, with condensed troubleshooting integrated directly into each section. Choose the approach that best fits your team's needs and follow the appropriate setup and workflow sections.

**Related Documentation:**

- [Project Management Framework](project-management-framework.md) - Core concepts and templates
- [Project Management Framework - GitHub](project-management-framework-github.md) - GitHub-specific implementation details
- [Project Management Framework - Filesystem](project-management-framework-filesystem.md) - Filesystem-specific implementation details
