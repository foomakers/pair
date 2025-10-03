# Prettier Formatting

## Overview

Prettier is an opinionated code formatter that eliminates debates about code style by automatically formatting code according to consistent rules. It supports TypeScript, JavaScript, CSS, and many other languages, making it essential for maintaining consistent code style across teams.

## Philosophy and Benefits

**Consistency Over Preference**: Prettier's strength lies in removing subjective formatting decisions. Instead of debating whether to use semicolons or how to indent, teams can focus on logic and architecture.

**Cognitive Load Reduction**: When all code follows the same format, developers can read and understand code faster, regardless of who wrote it.

**Reduced Code Review Friction**: Eliminates style-related comments in code reviews, allowing reviewers to focus on functionality and design.

## Core Configuration

Prettier works best with minimal configuration. The default settings are well-researched and work for most teams:

```json
{
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5"
}
```

### Key Configuration Decisions

**Print Width (80 characters)**: Optimized for readability and git diffs. Longer lines become harder to scan and review.

**Single Quotes**: More common in modern JavaScript/TypeScript ecosystems and requires fewer escape characters.

**Trailing Commas**: Helps with cleaner git diffs when adding new items to objects or arrays.

## Integration Strategy

### Editor Integration

Configure your editor to format on save. This provides immediate feedback and ensures consistency without manual intervention.

**VS Code**: Install the Prettier extension and enable format on save in settings.

**Rationale**: Automatic formatting prevents formatting issues from accumulating and reduces cognitive overhead.

### Git Workflow Integration

**Pre-commit Hooks**: Use `husky` and `lint-staged` to format files before commit. This ensures the repository stays consistently formatted.

```json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["prettier --write"]
  }
}
```

**Benefits**: Catches any files that weren't formatted by the editor and ensures consistency across different development environments.

### CI/CD Integration

Include Prettier checks in continuous integration to verify formatting consistency:

- **Check Mode**: Use `prettier --check` to verify formatting without modifying files
- **Fail Fast**: Run formatting checks early in CI pipeline to provide quick feedback

## Team Adoption Patterns

### Initial Rollout

**Batch Formatting**: Format the entire codebase initially with `prettier --write` to establish baseline consistency.

**Communication**: Explain to the team that Prettier reduces decision fatigue and improves collaboration.

**Grace Period**: Allow time for developers to adjust to automated formatting before enforcing strict policies.

### Conflict Resolution

**Prettier vs ESLint**: Use `eslint-config-prettier` to disable ESLint formatting rules that conflict with Prettier. Let each tool focus on its strengths.

**Legacy Code**: For large existing codebases, consider formatting files incrementally as they're modified rather than all at once.

## Advanced Configuration

### File-Specific Overrides

Some file types may benefit from different formatting rules:

```json
{
  "overrides": [
    {
      "files": "*.md",
      "options": {
        "printWidth": 100,
        "proseWrap": "always"
      }
    }
  ]
}
```

### Language-Specific Considerations

**TypeScript**: Prettier handles TypeScript syntax well, including generics, decorators, and complex type definitions.

**JSX/TSX**: Automatically formats React components consistently, including prop alignment and children indentation.

**JSON**: Ensures consistent formatting for configuration files and API responses.

## Common Challenges and Solutions

### Performance with Large Files

**Problem**: Prettier can be slow on very large files or when processing many files simultaneously.

**Solution**: Use `lint-staged` to only format changed files, and consider parallel processing in CI environments.

### Merge Conflicts

**Problem**: Formatting changes can create merge conflicts in collaborative environments.

**Solution**: Format code consistently before merging, and educate team members about resolving formatting conflicts.

### Custom Formatting Preferences

**Problem**: Team members may have strong preferences about specific formatting choices.

**Solution**: Focus on the benefits of consistency over individual preferences. Consider having a team discussion about Prettier's opinionated nature.

## Measuring Impact

Track Prettier's effectiveness through:

- **Code Review Time**: Measure reduction in style-related review comments
- **Developer Satisfaction**: Survey team members about formatting experience
- **Consistency Metrics**: Monitor consistency across the codebase

## Best Practices

**Minimal Configuration**: Use Prettier's defaults unless there's a compelling reason to change them. Fewer configuration options mean less to debate and maintain.

**Tool Integration**: Combine Prettier with ESLint for comprehensive code quality - Prettier for formatting, ESLint for logic and style patterns.

**Documentation**: Document any non-default configuration choices and the reasoning behind them.

**Regular Updates**: Keep Prettier updated to benefit from improvements and new language feature support.

## Migration Strategy

For existing projects:

1. **Assessment**: Review current formatting inconsistencies to demonstrate value
2. **Configuration**: Start with minimal Prettier configuration
3. **Tooling**: Set up editor integration for immediate feedback
4. **Automation**: Add pre-commit hooks and CI checks
5. **Team Training**: Educate team on benefits and workflow changes

The goal is making code formatting invisible - developers shouldn't need to think about it, and code should always look consistent regardless of who wrote it.
