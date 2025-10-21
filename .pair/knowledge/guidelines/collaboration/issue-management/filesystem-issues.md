# Filesystem Issue Tracking

Local file-based issue tracking for teams preferring filesystem-based project management over external tools.

## Overview

This guide covers implementing issue tracking using local markdown files, git workflow integration, and filesystem organization for teams that prefer version-controlled, text-based issue management.

## Issue File Structure

### Directory Organization

```
project-root/
├── .pair/
│   ├── product/
│   │   └── backlog/
│   │       ├── 01-initiatives/
│   │       │   └── 2025/
│   │       │       └── core-platform-initiative.md
│   │       ├── 02-epics/
│   │       │   ├── not-started/
│   │       │   ├── in-progress/
│   │       │   │   └── 01-01-user-authentication.md
│   │       │   └── completed/
│   │       └── 03-user-stories/
│   │           ├── backlog/
│   │           │   ├── 01-01-001-user-registration.md
│   │           │   └── 01-01-002-login-system.md
│   │           ├── in-progress/
│   │           │   └── 01-01-003-password-reset.md
│   │           └── completed/
│   │               └── 01-01-000-initial-setup.md
│   └── tech/
│       ├── adopted/
│       │   └── tech-stack.md
│       └── knowledge-base/
│           └── technical-decisions.md
```

### User Story File Format

```markdown
# User Story #01-01-001: User Registration System

**Initiative**: 01 - Core Platform Initiative  
**Epic**: 01-01 - User Authentication  
**Type**: Feature  
**Priority**: High  
**Assignee**: @developer-username  
**Created**: 2025-09-30  
**Updated**: 2025-09-30  
**Status**: Backlog

## Description

As a new user, I want to register for an account so that I can access the platform features.

## Acceptance Criteria

- [ ] User can register with email and password
- [ ] Email validation is required
- [ ] Password meets security requirements
- [ ] Account activation via email confirmation
- [ ] Error handling for duplicate emails

## Technical Notes

- Use bcrypt for password hashing
- Implement JWT for session tokens
- Follow OWASP authentication guidelines

## Tasks

- [ ] Create user registration API endpoint
- [ ] Implement password validation
- [ ] Set up email confirmation system
- [ ] Add error handling and validation
- [ ] Write unit and integration tests

## Related Stories

- Related to #01-01-002 (Login System)
- Blocks #01-01-004 (User Profile Management)
```

- Implement JWT for session tokens
- Follow OWASP authentication guidelines

## Related Issues

- Related to #002 (Database Migration)
- Blocks #005 (User Profile Management)

````

## Workflow Integration

### Git-Based Backlog Management
```bash
# Create new user story
mkdir -p .pair/product/backlog/03-user-stories/backlog
cp .pair/assets/user-story-template.md .pair/product/backlog/03-user-stories/backlog/01-01-$(date +%Y%m%d)-story-title.md

# Move story through workflow
git mv .pair/product/backlog/03-user-stories/backlog/01-01-001-user-auth.md .pair/product/backlog/03-user-stories/in-progress/
git mv .pair/product/backlog/03-user-stories/in-progress/01-01-001-user-auth.md .pair/product/backlog/03-user-stories/completed/

# Link commits to stories
git commit -m "feat: implement user registration endpoint

Addresses #01-01-001
- Add POST /auth/register endpoint
- Implement password hashing with bcrypt
- Add email validation and duplicate checking
- Update user registration task completion"
````

### Status Management

```markdown
# Story Status Transitions

Backlog → In Progress → Review → Completed
Backlog → Blocked → In Progress → Review → Completed
Backlog → Cancelled (if no longer needed)

# Epic Status (based on contained stories)

Not Started → In Progress → Completed

# Initiative Status (based on contained epics)

Planning → In Progress → Under Review → Completed
```

## Automation Scripts

### Story Management Scripts

```bash
#!/bin/bash
# create-story.sh
EPIC_PREFIX="$1"  # e.g., "01-01"
STORY_TITLE="$2"
STORY_TYPE="${3:-feature}"

# Get next story number for this epic
STORY_COUNT=$(ls .pair/product/backlog/03-user-stories/*/ | grep "^${EPIC_PREFIX}-" | wc -l | awk '{print $1+1}')
STORY_ID="${EPIC_PREFIX}-$(printf "%03d" $STORY_COUNT)"

cp ".pair/assets/user-story-template.md" \
   ".pair/product/backlog/03-user-stories/backlog/${STORY_ID}-${STORY_TITLE}.md"

echo "Created story #${STORY_ID}: ${STORY_TITLE}"
```

### Status Reports

```bash
#!/bin/bash
# backlog-report.sh
echo "## Product Backlog Status Report"
echo "Generated: $(date)"
echo

echo "### Active Initiatives:"
find .pair/product/backlog/01-initiatives/ -name "*.md" | sed 's/^/- /'
echo

echo "### Epics In Progress:"
ls .pair/product/backlog/02-epics/in-progress/ | sed 's/^/- /'
echo

echo "### Stories This Sprint:"
ls .pair/product/backlog/03-user-stories/in-progress/ | sed 's/^/- /'
echo

echo "### Recently Completed Stories:"
find .pair/product/backlog/03-user-stories/completed/ -name "*.md" -mtime -7 | sed 's/^/- /'
```

## Integration Patterns

### Project Management Integration

```markdown
# .pair/product/adopted/sprint-status.md

# Sprint Status Dashboard

## Current Sprint

- Sprint Goal: User authentication and security foundation
- Start Date: 2025-09-16
- End Date: 2025-09-30

## Initiative Progress

- Core Platform Initiative: 40% complete
  - User Authentication Epic: In Progress
  - Database Foundation Epic: Not Started
  - API Framework Epic: Not Started

## Story Summary

- Backlog: 12 stories
- In Progress: 4 stories
- Completed: 8 stories
- Total Story Points: 89 points

## This Sprint Focus

- [ ] Complete user registration (#01-01-001)
- [ ] Implement login system (#01-01-002)
- [ ] Start password reset flow (#01-01-003)
```

### CI/CD Integration

```yaml
# .github/workflows/backlog-tracking.yml
name: Backlog Tracking
on:
  push:
    paths: ['.pair/product/backlog/**']

jobs:
  update-dashboard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Generate backlog report
        run: |
          ./scripts/backlog-report.sh > .pair/product/adopted/current-backlog.md
          git add .pair/product/adopted/current-backlog.md
          git commit -m "docs: update backlog dashboard" || exit 0
          git push
```

## Related Documents

- **[.pair/knowledge/guidelines/collaboration/project-tracking/filesystem-tracking.md](.pair/knowledge/guidelines/collaboration/project-tracking/filesystem-tracking.md)** - Project progress tracking
- **[.pair/knowledge/guidelines/collaboration/automation/filesystem-automation.md](.pair/knowledge/guidelines/collaboration/automation/filesystem-automation.md)** - Automation workflows
- **[github-issues.md](github-issues.md)** - Comparison with GitHub Issues workflow
