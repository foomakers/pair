# Filesystem Tool Setup and Navigation

Complete setup guide for filesystem-based project management and cross-topic navigation hub.

## Quick Setup

### Prerequisites

- Local project directory structure
- Basic shell scripting knowledge
- Text editor or IDE with markdown support
- Optional: Git for version control

### Essential Setup Steps

1. **Directory Structure Creation**

```bash
mkdir -p .pair/adoption/product/backlog/{01-initiatives,02-epics,03-user-stories}
mkdir -p .pair/adoption/product/backlog/02-epics/{not-started,in-progress,under-review,completed}
mkdir -p .pair/adoption/product/backlog/03-user-stories/{not-started,in-progress,under-review,completed}
```

2. **Basic Configuration**

- Set up naming conventions
- Create template files
- Configure local automation scripts

3. **Tool Integration**

- IDE/editor configuration for markdown
- Shell scripts for common operations
- Optional Git hooks for automation

## Filesystem Tool Usage Across Topics

### Issue Management

**→ See [.pair/knowledge/guidelines/collaboration/issue-management/filesystem-issues.md](.pair/knowledge/guidelines/collaboration/issue-management/filesystem-issues.md)**

- Local issue tracking with markdown files
- Directory-based status management
- File naming conventions and organization
- Simple automation with shell scripts

### Project Tracking

**→ See [.pair/knowledge/guidelines/collaboration/project-tracking/filesystem-tracking.md](.pair/knowledge/guidelines/collaboration/project-tracking/filesystem-tracking.md)**

- Hierarchical directory structure
- Status tracking via file location
- Progress monitoring with file operations
- Local reporting and metrics

### Automation

**→ See [.pair/knowledge/guidelines/collaboration/automation/filesystem-automation.md](.pair/knowledge/guidelines/collaboration/automation/filesystem-automation.md)**

- Shell script automation
- File operation automation
- Directory management scripts
- Integration with development tools

### Board Management

**→ See [board-management.md](.pair/knowledge/guidelines/collaboration/board-management.md)**

- Directory-based board visualization
- Local backlog management
- File-based workflow optimization
- Simple progress tracking

### Communication

**→ See [../communication-protocols/](.pair/knowledge/guidelines/collaboration/communication-protocols/README.md)**

- Documentation-based communication
- Local changelog management
- File-based review processes
- Markdown documentation patterns

### Estimation Integration

**→ See [../estimation/](.pair/knowledge/guidelines/collaboration/estimation/README.md)**

- File-based estimation tracking
- Simple effort recording in metadata
- Local velocity calculations
- Lightweight forecasting approaches

## Directory Structure Details

### Standard Layout

```
.pair/adoption/product/backlog/
├── 01-initiatives/
│   └── 2025/                    # Year-based organization
│       └── initiative-name.md
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

**Initiatives:** `[initiative-name].md` in `01-initiatives/[YEAR]/`
**Epics:** `[initiative-code]-[epic-code]-[epic-name].md` in `02-epics/[status]/`  
**User Stories:** `[initiative-code]-[epic-code]-[story-code]-[story-name].md` in `03-user-stories/[status]/`

### Status Management

Status changes are reflected by moving files between directories:

- **not-started/**: Items defined but not yet started
- **in-progress/**: Active work in progress
- **under-review/**: Completed work awaiting review/validation
- **completed/**: Finished and accepted items

## Integration with Methodologies

**→ See [../methodology/](.pair/knowledge/guidelines/collaboration/methodology/README.md)**

### Scrum Integration

- Sprint directories for time-boxed work
- Sprint planning via file organization
- Simple burndown tracking with file counts
- Retrospective notes in dedicated files

### Kanban Integration

- Directory columns represent workflow states
- WIP limits via directory file counts
- Flow tracking through file movements
- Simple metrics via file timestamps

## Automation Scripts

### Basic Operations

```bash
# Move item to next status
./scripts/move-to-progress.sh epic-name.md

# Create new user story
./scripts/create-story.sh "Epic Code" "Story Name"

# Generate status report
./scripts/status-report.sh
```

### File Templates

- Initiative template with metadata
- Epic breakdown template
- User story template with acceptance criteria
- Task checklist templates

## Advantages and Limitations

### Advantages

- **Simple**: No external tools required
- **Portable**: Works with any text editor
- **Version Controlled**: Full Git integration
- **Offline**: No network dependencies
- **Flexible**: Easy to customize and extend

### Limitations

- **Manual**: More manual operations required
- **Limited Automation**: Basic automation only
- **No Real-time Collaboration**: File-based conflicts
- **Simple Reporting**: Limited analytics capabilities
- **Scalability**: Becomes complex with large teams

## Best Practices

### File Organization

- Consistent naming conventions
- Clear directory structures
- Regular cleanup of completed items
- Archive old items periodically

### Collaboration

- Clear commit messages for file moves
- Regular synchronization with Git
- Documented processes for team members
- Simple conflict resolution procedures

## Migration Considerations

### To GitHub Projects

- Export file metadata to GitHub issues
- Recreate hierarchy in GitHub Projects
- Migrate file content to issue descriptions
- Set up automation to replace manual processes

### From Other Tools

- Import existing items as markdown files
- Preserve metadata in file headers
- Recreate status through directory placement
- Maintain traceability during migration

## Related Resources

- **[Markdown Best Practices](https://www.markdownguide.org/basic-syntax/)**
- **[Git Workflow Integration](https://git-scm.com/book/en/v2/Git-Branching-Branching-Workflows)**
- **[Shell Scripting Guide](https://www.shellscript.sh/)**
