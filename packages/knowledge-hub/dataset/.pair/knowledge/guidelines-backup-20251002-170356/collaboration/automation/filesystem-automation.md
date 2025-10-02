# Filesystem Automation

Automated workflows and tools for filesystem-based project management, including script-based board management, automated reporting, and integration patterns.

## Overview

Filesystem automation provides powerful scripting and automation capabilities for teams using filesystem-based project management. This approach leverages shell scripts, automation tools, and file monitoring to create sophisticated project management workflows without external SaaS dependencies.

## Core Automation Concepts

### File-Based Workflows

**Markdown-Driven Management**

- Project boards as structured markdown files
- Issue tracking through file naming conventions
- Status updates via file movement and metadata
- Automated reporting from file analysis

**Directory Structure Automation**

```bash
# Standard project structure with automation hooks
project/
├── .pair/
│   ├── automation/
│   │   ├── board-sync.sh
│   │   ├── report-generator.py
│   │   └── status-updater.sh
│   ├── product/
│   │   ├── adopted/
│   │   │   ├── sprint-status.md
│   │   │   └── current-milestone.md
│   │   └── backlog/
│   │       ├── 01-initiatives/
│   │       ├── 02-epics/
│   │       └── 03-user-stories/
│   ├── how-to/
│   │   └── sprint-tracking/
│   │       ├── current-sprint.md
│   │       └── metrics/
│   └── tech/
│       ├── adopted/
│       └── knowledge-base/
├── docs/
├── src/
└── tests/
```

### Automation Triggers

**File System Events**

- File creation, modification, and deletion
- Directory structure changes
- Git commit and push events
- Scheduled time-based triggers

**Git Hooks Integration**

```bash
#!/bin/bash
# .git/hooks/post-commit
# Automatic board updates on commit

COMMIT_MSG=$(git log -1 --pretty=%B)
ISSUE_NUMBER=$(echo "$COMMIT_MSG" | grep -o '#[0-9]\+' | head -1)

if [ ! -z "$ISSUE_NUMBER" ]; then
    .pair/automation/update-issue-status.sh "$ISSUE_NUMBER" "in-progress"
fi
```

## Board Management Automation

### Automated Board Updates

**Status Synchronization**

```bash
#!/bin/bash
# board-sync.sh - Synchronize issues with board columns

update_board_status() {
    local story_id="$1"
    local new_status="$2"

    # Move issue file to appropriate directory
    find .pair/product/backlog/03-user-stories -name "*$story_id*" -exec mv {} .pair/product/backlog/03-user-stories/$new_status/ \;

    # Update board markdown files
    python3 .pair/automation/board-generator.py

    # Commit changes
    git add .pair/
    git commit -m "Auto-update: Story $story_id moved to $new_status"
}

# Usage: ./board-sync.sh 123 "in-progress"
update_board_status "$1" "$2"
```

**Board Generation from Files**

```python
#!/usr/bin/env python3
# board-generator.py - Generate board markdown from issue files

import os
import re
from datetime import datetime
from pathlib import Path

def generate_board():
    """Generate current sprint board from issue files"""

    board_content = """# Current Sprint Board
Generated: {timestamp}

## Backlog
{backlog_items}

## In Progress
{in_progress_items}

## Review
{review_items}

## Done
{done_items}
""".format(
        timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        backlog_items=get_issues_in_status("backlog"),
        in_progress_items=get_issues_in_status("in-progress"),
        review_items=get_issues_in_status("review"),
        done_items=get_issues_in_status("done")
    )

    with open(".pair/how-to/sprint-tracking/current-sprint.md", "w") as f:
        f.write(board_content)

def get_issues_in_status(status):
    """Get formatted list of issues in given status"""
    stories_dir = Path(f".pair/product/backlog/03-user-stories/{status}")
    if not issues_dir.exists():
        return "- No items"

    items = []
    for issue_file in issues_dir.glob("*.md"):
        with open(issue_file) as f:
            title = f.readline().strip("# \n")
        items.append(f"- [{issue_file.stem}] {title}")

    return "\n".join(items) if items else "- No items"

if __name__ == "__main__":
    generate_board()
```

### Automated Reporting

**Velocity Tracking**

```bash
#!/bin/bash
# velocity-tracker.sh - Calculate team velocity from completed issues

calculate_velocity() {
    local start_date="$1"
    local end_date="$2"

    # Count completed stories in date range
    completed_count=$(find .pair/product/backlog/03-user-stories/completed -name "*.md" -newermt "$start_date" ! -newermt "$end_date" | wc -l)

    # Calculate story points (from story metadata)
    total_points=0
    for story in $(find .pair/product/backlog/03-user-stories/completed -name "*.md" -newermt "$start_date" ! -newermt "$end_date"); do
        points=$(grep "Points:" "$story" | cut -d: -f2 | tr -d ' ')
        total_points=$((total_points + points))
    done

    echo "Sprint Velocity Report"
    echo "Period: $start_date to $end_date"
    echo "Stories Completed: $completed_count"
    echo "Story Points: $total_points"
    echo "Average Points per Story: $((total_points / completed_count))"
}

# Usage: ./velocity-tracker.sh "2025-09-15" "2025-09-29"
calculate_velocity "$1" "$2"
```

**Burndown Chart Generation**

```python
#!/usr/bin/env python3
# burndown-generator.py - Generate burndown chart data

import json
import matplotlib.pyplot as plt
from datetime import datetime, timedelta
from pathlib import Path

def generate_burndown_data():
    """Generate burndown chart from git history"""

    # Get sprint start and end dates
    sprint_config = load_sprint_config()
    start_date = datetime.fromisoformat(sprint_config['start_date'])
    end_date = datetime.fromisoformat(sprint_config['end_date'])

    # Calculate daily remaining work
    daily_remaining = []
    current_date = start_date

    while current_date <= end_date:
        remaining_points = calculate_remaining_points(current_date)
        daily_remaining.append({
            'date': current_date.isoformat(),
            'remaining': remaining_points
        })
        current_date += timedelta(days=1)

    # Save data and generate chart
    with open('.pair/reports/burndown-data.json', 'w') as f:
        json.dump(daily_remaining, f, indent=2)

    generate_burndown_chart(daily_remaining)

def calculate_remaining_points(date):
    """Calculate story points remaining on given date"""
    # Use git log to find issues completed by date
    import subprocess

    result = subprocess.run([
        'git', 'log', '--until', date.isoformat(),
        '--grep', 'completed:', '--oneline'
    ], capture_output=True, text=True)

    completed_issues = len(result.stdout.strip().split('\n')) if result.stdout.strip() else 0
    total_points = get_sprint_total_points()

    return max(0, total_points - (completed_issues * 3))  # Assume 3 points average

def generate_burndown_chart(data):
    """Generate visual burndown chart"""
    dates = [datetime.fromisoformat(d['date']) for d in data]
    remaining = [d['remaining'] for d in data]

    plt.figure(figsize=(12, 6))
    plt.plot(dates, remaining, 'b-', label='Actual Burndown')

    # Add ideal burndown line
    ideal_remaining = [data[0]['remaining'] * (1 - i/(len(data)-1)) for i in range(len(data))]
    plt.plot(dates, ideal_remaining, 'r--', label='Ideal Burndown')

    plt.xlabel('Date')
    plt.ylabel('Story Points Remaining')
    plt.title('Sprint Burndown Chart')
    plt.legend()
    plt.grid(True)
    plt.xticks(rotation=45)
    plt.tight_layout()

    plt.savefig('.pair/reports/burndown-chart.png')
    plt.close()

if __name__ == "__main__":
    generate_burndown_data()
```

## Issue Management Automation

### Automated Issue Creation

**Issue Template Processing**

```bash
#!/bin/bash
# create-issue.sh - Create new issue with template and automation

create_issue() {
    local title="$1"
    local type="$2"  # story, task, bug
    local priority="$3"  # high, medium, low

    # Generate unique issue ID
    story_id=$(date +%Y%m%d%H%M%S)

    # Create issue file from template
    sed -e "s/{TITLE}/$title/g" \
        -e "s/{TYPE}/$type/g" \
        -e "s/{PRIORITY}/$priority/g" \
        -e "s/{ID}/$story_id/g" \
        -e "s/{DATE}/$(date -I)/g" \
        .pair/assets/user-story-template.md > ".pair/product/backlog/03-user-stories/backlog/$story_id-$(echo $title | tr ' ' '-' | tr '[:upper:]' '[:lower:]').md"

    # Update board
    .pair/automation/board-generator.py

    # Notify team (if configured)
    if [ -f .pair/config/notifications.sh ]; then
        .pair/config/notifications.sh "new-issue" "$story_id" "$title"
    fi

    echo "Created issue $story_id: $title"
}

# Usage: ./create-issue.sh "User login feature" "story" "high"
create_issue "$1" "$2" "$3"
```

**Issue Template**

```markdown
# {TITLE}

**ID**: {ID}  
**Type**: {TYPE}  
**Priority**: {PRIORITY}  
**Created**: {DATE}  
**Status**: backlog  
**Assignee**: unassigned  
**Points**: TBD

## Description

[Detailed description of the issue]

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Technical Notes

[Technical implementation details]

## Related Issues

[Links to related issues]

## Definition of Done

- [ ] Code implemented and tested
- [ ] Code reviewed and approved
- [ ] Documentation updated
- [ ] Deployed to staging
- [ ] Stakeholder approval received
```

### Status Transition Automation

**Git Hook Integration**

```bash
#!/bin/bash
# pre-commit hook - Validate issue status transitions

validate_status_change() {
    local issue_file="$1"
    local old_status=$(git show HEAD:"$issue_file" | grep "Status:" | cut -d: -f2 | tr -d ' ')
    local new_status=$(grep "Status:" "$issue_file" | cut -d: -f2 | tr -d ' ')

    # Define valid transitions
    case "$old_status" in
        "backlog")
            if [[ "$new_status" != "in-progress" && "$new_status" != "cancelled" ]]; then
                echo "Error: Invalid transition from $old_status to $new_status"
                exit 1
            fi
            ;;
        "in-progress")
            if [[ "$new_status" != "review" && "$new_status" != "blocked" && "$new_status" != "backlog" ]]; then
                echo "Error: Invalid transition from $old_status to $new_status"
                exit 1
            fi
            ;;
        "review")
            if [[ "$new_status" != "done" && "$new_status" != "in-progress" ]]; then
                echo "Error: Invalid transition from $old_status to $new_status"
                exit 1
            fi
            ;;
    esac
}

# Check all modified issue files
for file in $(git diff --cached --name-only | grep ".pair/product/backlog/03-user-stories/.*\.md$"); do
    if [ -f "$file" ]; then
        validate_status_change "$file"
    fi
done
```

## Integration Patterns

### External Tool Integration

**GitHub Synchronization**

```bash
#!/bin/bash
# github-sync.sh - Sync filesystem issues with GitHub issues

sync_to_github() {
    local issue_file="$1"

    # Extract issue metadata
    title=$(grep "^# " "$issue_file" | sed 's/^# //')
    body=$(sed -n '/## Description/,/## /p' "$issue_file" | head -n -1 | tail -n +2)
    labels=$(grep "Type:" "$issue_file" | cut -d: -f2 | tr -d ' ')

    # Create or update GitHub issue
    if grep -q "GitHub-ID:" "$issue_file"; then
        github_id=$(grep "GitHub-ID:" "$issue_file" | cut -d: -f2 | tr -d ' ')
        gh issue edit "$github_id" --title "$title" --body "$body"
    else
        github_id=$(gh issue create --title "$title" --body "$body" --label "$labels" | grep -o '[0-9]\+$')
        echo "GitHub-ID: $github_id" >> "$issue_file"
    fi
}

# Sync all modified issues
for issue in .pair/product/backlog/03-user-stories/*/*.md; do
    if [[ $(git status --porcelain "$issue") ]]; then
        sync_to_github "$issue"
    fi
done
```

**Slack Notifications**

```python
#!/usr/bin/env python3
# slack-notifier.py - Send project updates to Slack

import requests
import json
import os
from pathlib import Path

def send_slack_notification(event_type, story_id, details):
    """Send formatted notification to Slack"""

    webhook_url = os.environ.get('SLACK_WEBHOOK_URL')
    if not webhook_url:
        return

    message = format_message(event_type, story_id, details)

    payload = {
        'text': message,
        'username': 'Project Bot',
        'icon_emoji': ':robot_face:'
    }

    response = requests.post(webhook_url, json=payload)
    return response.status_code == 200

def format_message(event_type, story_id, details):
    """Format message based on event type"""

    templates = {
        'issue_created': f'🆕 New story created: #{story_id} - {details["title"]}',
        'issue_completed': f'✅ Issue completed: #{story_id} - {details["title"]}',
        'sprint_started': f'🚀 Sprint started: {details["sprint_name"]}',
        'sprint_completed': f'🎯 Sprint completed: {details["sprint_name"]} - {details["velocity"]} points'
    }

    return templates.get(event_type, f'📋 Project update: {event_type}')

if __name__ == "__main__":
    import sys
    send_slack_notification(sys.argv[1], sys.argv[2], json.loads(sys.argv[3]))
```

### Continuous Integration Integration

**CI Pipeline Triggers**

```yaml
# .github/workflows/project-automation.yml
name: Project Management Automation

on:
  push:
    paths:
      - '.pair/product/backlog/03-user-stories/**'
      - '.pair/how-to/sprint-tracking/**'

jobs:
  update-boards:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Update project boards
        run: |
          python3 .pair/automation/board-generator.py

      - name: Generate reports
        run: |
          bash .pair/automation/velocity-tracker.sh
          python3 .pair/automation/burndown-generator.py

      - name: Commit updates
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"
          git add .pair/how-to/sprint-tracking/ .pair/reports/
          git diff --staged --quiet || git commit -m "Auto-update: boards and reports"
          git push
```

## Monitoring and Analytics

### Automated Metrics Collection

**Team Performance Tracking**

```bash
#!/bin/bash
# metrics-collector.sh - Collect team performance metrics

collect_metrics() {
    local output_file=".pair/reports/team-metrics-$(date +%Y-%m-%d).json"

    # Collect various metrics
    metrics=$(cat <<EOF
{
  "date": "$(date -I)",
  "issues": {
    "total": $(find .pair/product/backlog/03-user-stories -name "*.md" | wc -l),
    "completed_this_week": $(find .pair/product/backlog/03-user-stories/done -name "*.md" -newermt "$(date -d '7 days ago' -I)" | wc -l),
    "in_progress": $(find .pair/product/backlog/03-user-stories/in-progress -name "*.md" | wc -l),
    "backlog": $(find .pair/product/backlog/03-user-stories/backlog -name "*.md" | wc -l)
  },
  "git": {
    "commits_this_week": $(git log --since="7 days ago" --oneline | wc -l),
    "active_branches": $(git branch -r | wc -l),
    "code_churn": $(git log --since="7 days ago" --stat | grep "insertions\|deletions" | wc -l)
  },
  "velocity": {
    "story_points_completed": $(grep -r "Points:" .pair/product/backlog/03-user-stories/completed/ | cut -d: -f3 | awk '{sum+=$1} END {print sum}'),
    "average_cycle_time": "$(calculate_average_cycle_time)"
  }
}
```
