# Filesystem Project Tracking

Local file-based project tracking for teams using filesystem-based project management approaches.

## Overview

This guide covers implementing project progress tracking using local markdown files, automated reporting, and filesystem organization for transparent project monitoring without external tools.

## Tracking Structure

### Directory Organization

```
project-root/
├── .pair/
│   ├── product/
│   │   ├── adopted/
│   │   │   ├── sprint-status.md
│   │   │   ├── current-milestone.md
│   │   │   └── velocity-metrics.md
│   │   └── backlog/
│   │       ├── 01-initiatives/
│   │       ├── 02-epics/
│   │       └── 03-user-stories/
│   ├── tech/
│   │   ├── adopted/
│   │   │   └── way-of-working.md
│   │   └── knowledge-base/
│   └── how-to/
│       └── sprint-tracking/
│           ├── current-sprint.md
│           ├── sprint-history/
│           │   ├── 2025-09-sprint-1.md
│           │   └── 2025-09-sprint-2.md
│           ├── milestones/
│           │   ├── v1.0-release.md
│           │   └── mvp-milestone.md
│           └── metrics/
│               ├── velocity.csv
│               ├── burndown.csv
│               └── team-capacity.md
```

### Sprint Tracking

```markdown
# .pair/how-to/sprint-tracking/current-sprint.md

# Sprint 2025-09-2 (Sep 16-30, 2025)

**Sprint Goal**: Complete user authentication and begin UI framework

**Team Capacity**: 80 hours (4 developers × 20 hours/week)

## Planned Work (32 story points)

- [ ] #01-01-001: User Registration (8 pts) - @alice
- [ ] #01-01-002: Login System (5 pts) - @bob
- [ ] #01-01-003: Password Reset (8 pts) - @carol
- [ ] #01-02-001: UI Framework (8 pts) - @david
- [ ] #01-02-002: Testing Setup (3 pts) - @alice

## Daily Progress

### 2025-09-16

- Alice: Started user registration implementation
- Bob: Completed login API design
- Carol: Research password reset patterns
- David: Set up UI framework structure

### 2025-09-17

- Alice: Implemented password hashing (50% complete #01-01-001)
- Bob: Created login endpoint (80% complete #01-01-002)
- Carol: Started reset flow design
- David: Configured React components

## Sprint Metrics

- **Completed**: 13 story points
- **Remaining**: 19 story points
- **Velocity**: On track for 32 points
- **Blockers**: None currently
```

### Milestone Tracking

```markdown
# .pair/how-to/sprint-tracking/milestones/mvp-milestone.md

# MVP Milestone

**Target Date**: 2025-10-31  
**Status**: In Progress (60% complete)

## Success Criteria

- [x] User registration and authentication
- [x] Basic dashboard UI
- [ ] Core feature implementation
- [ ] Mobile responsiveness
- [ ] Performance optimization
- [ ] Security audit

## Progress Summary

- **Completed Features**: 8/12
- **Remaining Work**: 4 features, ~45 story points
- **Risk Level**: Medium (API integration complexity)
- **Projected Completion**: 2025-11-05 (5 days late)

## Dependencies

- External API access (waiting on vendor)
- Security review (scheduled for 2025-10-25)
- Performance testing environment setup

## Related Initiatives

- Core Platform Initiative (Primary)
- Security Foundation Initiative (Supporting)
```

## Automated Reporting

### Velocity Tracking

```bash
#!/bin/bash
# velocity-tracker.sh

# Calculate completed story points for current sprint
COMPLETED_POINTS=$(grep -r "^\- \[x\]" .pair/how-to/sprint-tracking/current-sprint.md | \
                   grep -o "([0-9]* pts)" | \
                   sed 's/[()]//g; s/ pts//' | \
                   awk '{sum += $1} END {print sum}')

# Update velocity.csv
echo "$(date +%Y-%m-%d),$COMPLETED_POINTS" >> .pair/how-to/sprint-tracking/metrics/velocity.csv

echo "Sprint velocity: $COMPLETED_POINTS story points"
```

### Status Dashboard Generation

```bash
#!/bin/bash
# generate-dashboard.sh

cat > .pair/product/adopted/current-status.md << EOF
# Project Status Dashboard
Generated: $(date)

## Current Sprint Summary
$(head -10 .pair/how-to/sprint-tracking/current-sprint.md)

## Story Status
- Backlog: $(ls .pair/product/backlog/03-user-stories/backlog/ | wc -l) stories
- In Progress: $(ls .pair/product/backlog/03-user-stories/in-progress/ | wc -l) stories
- Completed: $(ls .pair/product/backlog/03-user-stories/completed/ | wc -l) stories

## Recent Velocity
$(tail -5 .pair/how-to/sprint-tracking/metrics/velocity.csv | awk -F, '{print "- " $1 ": " $2 " points"}')

## Upcoming Milestones
$(find .pair/how-to/sprint-tracking/milestones/ -name "*.md" -exec grep -l "Status.*Progress" {} \; | head -3)
EOF
```

### Burndown Chart Data

```bash
#!/bin/bash
# burndown-tracker.sh

SPRINT_FILE=".pair/how-to/sprint-tracking/current-sprint.md"
TOTAL_POINTS=$(grep "story points" $SPRINT_FILE | grep -o "[0-9]*" | head -1)
COMPLETED_POINTS=$(grep -c "^\- \[x\]" $SPRINT_FILE)
REMAINING_POINTS=$((TOTAL_POINTS - COMPLETED_POINTS))

echo "$(date +%Y-%m-%d),$REMAINING_POINTS" >> .pair/how-to/sprint-tracking/metrics/burndown.csv
```

## Integration with Development Workflow

### Git Hook Integration

```bash
#!/bin/bash
# .git/hooks/post-commit

# Auto-update tracking when stories are completed
if git diff HEAD~1 --name-only | grep -q ".pair/product/backlog/"; then
    # Check if any stories moved to completed
    COMPLETED_STORIES=$(git diff HEAD~1 --name-only | grep ".pair/product/backlog/03-user-stories/completed/")

    if [ ! -z "$COMPLETED_STORIES" ]; then
        echo "Stories completed - updating sprint tracking"
        ./scripts/update-sprint-progress.sh
    fi
fi
```

### Commit Message Integration

```bash
# Link commits to tracking
git commit -m "feat: complete user registration endpoint

Completes #01-01-001 (8 story points)
Sprint progress: 21/32 points complete
Remaining: login system and password reset implementation"
```

## Metrics and Analysis

### Velocity Analysis

```csv
# .pair/how-to/sprint-tracking/metrics/velocity.csv
Date,Completed Points,Team Size,Velocity per Person
2025-09-02,28,4,7.0
2025-09-16,32,4,8.0
2025-09-30,29,4,7.25
```

### Capacity Planning

```markdown
# .pair/how-to/sprint-tracking/metrics/team-capacity.md

## Team Capacity Analysis

### Current Team (Q3 2025)

- **Alice**: Senior Developer (25 hrs/week, velocity: 8-10 pts/sprint)
- **Bob**: Full-stack Developer (30 hrs/week, velocity: 6-8 pts/sprint)
- **Carol**: Frontend Specialist (20 hrs/week, velocity: 5-7 pts/sprint)
- **David**: Backend Developer (25 hrs/week, velocity: 7-9 pts/sprint)

### Sprint Capacity

- **Total Hours**: 100 hours/sprint (2 weeks)
- **Development Hours**: 80 hours (after meetings/overhead)
- **Average Velocity**: 28-32 story points/sprint
- **Velocity Range**: 26-35 points (based on complexity)

### Forecasting

- **Stories per Sprint**: 4-6 medium stories
- **Release Cadence**: Every 3-4 sprints
- **Annual Capacity**: ~650 story points (25 sprints)
```

## Reporting Templates

### Weekly Status Report

```markdown
# Weekly Status Report - Week of $(date +%Y-%m-%d)

## Sprint Progress

- **Current Sprint**: Sprint 2025-09-2
- **Days Remaining**: X days
- **Points Completed**: X/32 points
- **On Track**: Yes/No

## Completed This Week

- Feature A: Description of completed work
- Bug Fix B: Issue resolution details
- Technical Debt C: Refactoring improvements

## Planned Next Week

- Feature D: Development continuation
- Feature E: New feature start
- Code Review: Team review sessions

## Blockers and Risks

- None currently / List any issues

## Team Highlights

- Notable achievements or learning
- Process improvements implemented
- Collaboration successes
```

### Monthly Summary

```markdown
# Monthly Project Summary - $(date +%B %Y)

## Delivery Summary

- **Features Delivered**: X features across Y sprints
- **Story Points Completed**: Total points for month
- **Velocity Trend**: Increasing/Stable/Decreasing
- **Quality Metrics**: Bug rates, code coverage

## Milestone Progress

- **Current Milestone**: Progress percentage and timeline
- **Next Milestone**: Upcoming goals and timeline
- **Risk Assessment**: Current project risks

## Team Performance

- **Velocity Stability**: Trend analysis
- **Team Satisfaction**: Survey results or feedback
- **Process Improvements**: Changes implemented
- **Skill Development**: Training and growth activities

## Stakeholder Updates

- **Key Achievements**: Major accomplishments
- **Business Impact**: User/customer feedback
- **Next Month Focus**: Priority areas and goals
```

## Best Practices

### File Organization

- Use consistent naming conventions with dates
- Keep current sprint symlinked for easy access
- Archive completed sprints by quarter
- Maintain metrics in CSV format for analysis

### Automation

- Run tracking scripts daily via cron jobs
- Generate reports automatically on sprint boundaries
- Integrate with git hooks for real-time updates
- Backup tracking data regularly

### Team Coordination

- Review tracking files during daily standups
- Update progress during development work
- Use tracking data for retrospective discussions
- Share reports with stakeholders regularly

## Related Documents

- **[.pair/knowledge/guidelines/collaboration/issue-management/filesystem-issues.md](.pair/knowledge/guidelines/collaboration/issue-management/filesystem-issues.md)** - Issue tracking implementation
- **[.pair/knowledge/guidelines/collaboration/automation/filesystem-automation.md](.pair/knowledge/guidelines/collaboration/automation/filesystem-automation.md)** - Automation workflows
- **[github-tracking.md](github-tracking.md)** - Comparison with GitHub-based tracking
