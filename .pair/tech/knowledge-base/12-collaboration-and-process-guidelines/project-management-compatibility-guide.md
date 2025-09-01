# Project Management Compatibility Guide

**API Compatibility and Change Management for GitHub Projects Integration**

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [GitHub Projects API Compatibility](#github-projects-api-compatibility)
3. [Known API Changes and Workarounds](#known-api-changes-and-workarounds)
4. [MCP Server Compatibility](#mcp-server-compatibility)
5. [Version Compatibility Matrix](#version-compatibility-matrix)
6. [Migration Guides](#migration-guides)
7. [Monitoring and Updates](#monitoring-and-updates)

---

## Overview

This guide documents compatibility requirements, known API changes, and workarounds for GitHub Projects integration with pair. Use this guide to understand version requirements, handle API deprecations, and ensure smooth operation across different GitHub Projects API versions.

### Compatibility Scope

- **GitHub Projects API**: GraphQL API for Projects (beta and stable)
- **GitHub REST API**: Issues, labels, and repository management
- **GitHub MCP Server**: Integration layer compatibility
- **GitHub CLI**: Fallback functionality support

---

## GitHub Projects API Compatibility

### Supported API Versions

**Primary Support:**

- **GitHub Projects API (GraphQL)**: Latest stable version
- **GitHub REST API v4**: Full compatibility
- **GitHub Projects (Classic)**: Limited support (read-only)

**Version Requirements:**

| Component           | Minimum Version | Recommended Version | Status       |
| ------------------- | --------------- | ------------------- | ------------ |
| GitHub Projects API | 2024-01-01      | Latest              | ✅ Supported |
| GitHub REST API     | v4              | v4                  | ✅ Supported |
| GitHub MCP Server   | 1.0.0           | Latest              | ✅ Supported |
| GitHub CLI          | 2.0.0           | Latest              | ✅ Fallback  |

### Feature Compatibility

**Fully Supported Features:**

- ✅ Project creation and management
- ✅ Issue assignment to projects
- ✅ Custom field management (Status, Priority)
- ✅ Project board automation
- ✅ Organization and repository projects
- ✅ Bulk operations via MCP server

**Partially Supported Features:**

- ⚠️ GitHub Projects (Classic): Read-only access
- ⚠️ Legacy project boards: Migration recommended
- ⚠️ Some advanced automation rules: Manual setup required

**Unsupported Features:**

- ❌ GitHub Projects v1 (deprecated)
- ❌ Third-party project management tools
- ❌ Custom project templates (use pair templates instead)

---

## Known API Changes and Workarounds

### Recent API Changes (2024-2025)

#### 1. Projects GraphQL API Field Changes

**Issue**: Some field names changed in Projects API v2
**Impact**: Medium
**Affected Operations**: Custom field management, project item queries

**Workaround:**

```bash
# Use new field names in GraphQL queries
# Old: status { name }
# New: status { optionName }

pair "Update project item status using new GraphQL field syntax"
```

**MCP Server Handling**: Automatically handles field mapping for supported versions.

#### 2. Rate Limiting Changes

**Issue**: GitHub increased rate limiting on Projects API
**Impact**: Low-Medium
**Affected Operations**: Bulk project operations, frequent status updates

**Workaround:**

```bash
# Use batch operations to reduce API calls
pair "Perform bulk project updates with rate limiting consideration"

# Alternative: Use GitHub CLI for large operations
gh project item-list --owner ORG --number PROJECT_NUMBER --limit 100
```

**Prevention**: MCP server implements automatic rate limiting and retry logic.

#### 3. Authentication Scope Changes

**Issue**: New authentication scopes required for project management
**Impact**: High
**Affected Operations**: All project operations

**Required Scopes:**

- `read:project` (minimum for read access)
- `write:project` (required for status updates)
- `admin:org` (required for organization projects)

**Workaround:**

```bash
# Update GitHub authentication with new scopes
gh auth refresh --scopes "read:project,write:project,admin:org"

# Verify scopes
gh auth status
```

### Legacy API Deprecations

#### GitHub Projects Classic API

**Deprecation Date**: 2024-12-31 (estimated)
**Replacement**: GitHub Projects (GraphQL API)
**Migration Required**: Yes

**Migration Steps:**

1. **Export Classic Project Data:**

```bash
# Use GitHub CLI to export classic project data
gh project list --owner ORG
gh project view --owner ORG --number PROJECT_NUMBER
```

2. **Create New Projects:**

```bash
pair "Create new GitHub Project from classic project data"
```

3. **Migrate Issues:**

```bash
pair "Migrate issues from classic project to new GitHub Projects"
```

#### Legacy Custom Fields

**Issue**: Old custom field types deprecated
**Impact**: Medium
**Affected**: Priority and Status fields created before 2024

**Migration:**

```bash
# Update field types
pair "Update project custom fields to new supported types"

# Verify field compatibility
pair "Validate project custom field configuration"
```

---

## MCP Server Compatibility

### GitHub MCP Server Versions

**Compatibility Matrix:**

| MCP Server Version | GitHub API Support          | pair Integration | Status                 |
| ------------------ | --------------------------- | ---------------- | ---------------------- |
| 1.3.x              | GraphQL Projects API v2     | Full             | ✅ Recommended         |
| 1.2.x              | GraphQL Projects API v1.1   | Full             | ✅ Supported           |
| 1.1.x              | REST API + Limited Projects | Partial          | ⚠️ Upgrade Recommended |
| 1.0.x              | REST API Only               | Limited          | ❌ Deprecated          |

### Version Update Process

**Check Current Version:**

```bash
npm list -g @github/github-mcp-server
```

**Update to Latest:**

```bash
npm update -g @github/github-mcp-server
```

**Verify Compatibility:**

```bash
pair "Test GitHub MCP server compatibility with current API version"
```

### Configuration Updates

**For MCP Server 1.3.x+:**

Configuration requires updated field mappings:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@github/github-mcp-server"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxxxxxxxxxxx"
      }
    }
  }
}
```

**Required Environment Variables:**

- `GITHUB_PERSONAL_ACCESS_TOKEN`: With project scopes
- `GITHUB_API_VERSION`: Optional (defaults to latest)

---

## Version Compatibility Matrix

### GitHub Enterprise Compatibility

**GitHub Enterprise Server:**

| GHES Version  | Projects API Support  | pair Compatibility | Notes                 |
| ------------- | --------------------- | ------------------ | --------------------- |
| 3.11+         | Full Projects API     | ✅ Full            | Latest features       |
| 3.9-3.10      | Limited Projects API  | ⚠️ Partial         | Some features missing |
| 3.8 and below | Classic Projects Only | ❌ Limited         | Migration required    |

**GitHub Enterprise Cloud:**

- ✅ Full compatibility with all features
- Latest API versions supported

### Operating System Compatibility

**MCP Server Support:**

| OS                    | Node.js Version | npm Version | Status             |
| --------------------- | --------------- | ----------- | ------------------ |
| macOS 12+             | 18.x+           | 9.x+        | ✅ Fully Supported |
| Linux (Ubuntu 20.04+) | 18.x+           | 9.x+        | ✅ Fully Supported |
| Windows 10+           | 18.x+           | 9.x+        | ✅ Fully Supported |

---

## Migration Guides

### Migrating from Classic Projects

**Step 1: Assessment**

```bash
# List existing classic projects
gh project list --owner ORG

# Export project data
pair "Export GitHub classic project data for migration analysis"
```

**Step 2: Create New Project Structure**

```bash
# Create new GitHub Project
pair "Create new GitHub Project with standard fields and automation"

# Configure custom fields
pair "Set up Status and Priority fields in new project"
```

**Step 3: Migrate Content**

```bash
# Migrate issues to new project
pair "Migrate issues from classic project to new GitHub Projects with status mapping"

# Verify migration completeness
pair "Validate migrated project structure and issue assignments"
```

### Upgrading MCP Server

**Pre-upgrade Checklist:**

- [ ] Backup current MCP configuration
- [ ] Note current GitHub API version
- [ ] Export project state for verification

**Upgrade Process:**

```bash
# Backup configuration
cp ~/.config/claude/claude_desktop_config.json ~/.config/claude/claude_desktop_config.json.backup

# Update MCP server
npm update -g @github/github-mcp-server

# Test compatibility
pair "Test GitHub MCP server functionality after upgrade"
```

**Post-upgrade Validation:**

```bash
# Verify project access
pair "List GitHub projects to verify MCP server connectivity"

# Test operations
pair "Perform test project operation to validate functionality"
```

---

## Monitoring and Updates

### API Change Monitoring

**GitHub API Changelog:**

- Monitor: https://docs.github.com/en/rest/overview/changelog
- Projects API: https://docs.github.com/en/issues/planning-and-tracking-with-projects

**Notification Setup:**

1. **GitHub Blog Subscription**: Subscribe to GitHub blog for major announcements
2. **API Deprecation Notices**: Watch for deprecation warnings in API responses
3. **MCP Server Updates**: Monitor npm package updates for compatibility

### Update Schedule

**Recommended Monitoring:**

- **Weekly**: Check for MCP server updates
- **Monthly**: Review GitHub API changelog
- **Quarterly**: Validate full compatibility suite

**Update Process:**

1. **Test in Development**: Always test updates in non-production environment
2. **Backup Before Updates**: Export project state before major updates
3. **Gradual Rollout**: Update one project at a time for validation

### Compatibility Testing

**Automated Testing:**

```bash
# Create compatibility test script
cat > .pair/scripts/compatibility-test.sh << 'EOF'
#!/bin/bash

echo "=== GitHub Projects Compatibility Test ==="
echo "Date: $(date)"
echo ""

# Test MCP server connectivity
echo "Testing MCP server connectivity..."
pair "List GitHub repositories to test basic connectivity"

# Test project operations
echo "Testing project operations..."
pair "List GitHub projects to test project API access"

# Test issue operations
echo "Testing issue operations..."
pair "List recent GitHub issues to test issue API access"

echo ""
echo "=== Compatibility Test Complete ==="
EOF

chmod +x .pair/scripts/compatibility-test.sh
```

**Manual Testing Checklist:**

- [ ] MCP server responds to project queries
- [ ] Project creation and field management works
- [ ] Issue assignment to projects functions
- [ ] Status and priority updates succeed
- [ ] Bulk operations complete without errors

---

## Emergency Procedures

### API Deprecation Response

**When API Features are Deprecated:**

1. **Immediate Assessment**:

   - Identify affected operations
   - Check alternative API endpoints
   - Estimate migration timeline

2. **Temporary Workarounds**:

   - Enable GitHub CLI fallback mode
   - Use manual operations for critical functions
   - Document alternative processes

3. **Migration Planning**:
   - Update MCP server if available
   - Modify configuration for new API versions
   - Test extensively before rollout

### Rollback Procedures

**If Updates Cause Issues:**

```bash
# Rollback MCP server version
npm install -g @github/github-mcp-server@PREVIOUS_VERSION

# Restore configuration backup
cp ~/.config/claude/claude_desktop_config.json.backup ~/.config/claude/claude_desktop_config.json

# Verify rollback success
pair "Test GitHub connectivity after rollback"
```

---

This compatibility guide ensures smooth operation across GitHub API changes and provides clear migration paths for deprecated features. Regular monitoring and proactive updates help maintain reliable project management integration.

**Related Documentation:**

- [GitHub Projects Integration Guide](github-projects-integration-guide.md) - Main integration setup and workflows
- [Filesystem Workflow Integration Guide](filesystem-workflow-integration-guide.md) - Alternative workflow approach
- [Project Management Troubleshooting Guide](project-management-troubleshooting-guide.md) - Problem-solving procedures
- [Project Management Framework](project-management-framework.md) - General framework concepts
