# Markdown Templates

## Introduction

Markdown templates provide standardized formats for documentation, content creation, and communication across design and development workflows.

## Scope

**In scope**: documentation, design system, process, UX research, and project management templates. **Out of scope**: content writing training, markdown syntax education, platform-specific implementation, content strategy.

## Template Categories

### Documentation Templates

#### Design System Documentation

```markdown
# Component Name

## Overview

Brief description of the component and its purpose.

## Usage Guidelines

When and how to use this component effectively.

## Variants

Available component variations and their use cases.

## Properties

| Property | Type    | Default | Description             |
| -------- | ------- | ------- | ----------------------- |
| variant  | string  | primary | Component style variant |
| size     | string  | medium  | Component size option   |
| disabled | boolean | false   | Disabled state          |

## Examples

Code examples and implementation patterns.

## Accessibility

Accessibility considerations and requirements.

## Related Components

Links to related components and patterns.
```

#### Feature Documentation

```markdown
# Feature Name

## Summary

Brief description of the feature and its value proposition.

## User Stories

- As a [user type], I want [functionality] so that [benefit]
- As a [user type], I want [functionality] so that [benefit]

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Design Specifications

Link to design files and specifications.

## Technical Requirements

Technical implementation details and constraints.

## Testing Requirements

Testing scenarios and verification methods.

## Dependencies

Related features and system dependencies.
```

### Process Templates

#### Design Review Template

```markdown
# Design Review: [Feature/Component Name]

## Meeting Details

- **Date**: YYYY-MM-DD
- **Attendees**: List of participants
- **Duration**: Duration of review
- **Facilitator**: Review leader

## Design Overview

Summary of the design being reviewed.

## Review Criteria

- [ ] Design system compliance
- [ ] Accessibility requirements
- [ ] User experience quality
- [ ] Technical feasibility
- [ ] Performance considerations

## Feedback Summary

### Critical Issues

- Issue 1: Description and required action
- Issue 2: Description and required action

### Suggestions

- Suggestion 1: Description and reasoning
- Suggestion 2: Description and reasoning

### Approved Elements

- Approved aspect 1
- Approved aspect 2

## Action Items

- [ ] Action item 1 - Assignee - Due date
- [ ] Action item 2 - Assignee - Due date

## Next Steps

Outline of follow-up activities and timeline.
```

#### Decision Record Template

```markdown
# ADR-XXX: Decision Title

## Status

[Proposed | Accepted | Deprecated | Superseded]

## Context

Background information and problem description.

## Decision

The decision that was made and its rationale.

## Consequences

### Positive

- Benefit 1
- Benefit 2

### Negative

- Trade-off 1
- Trade-off 2

### Neutral

- Neutral impact 1
- Neutral impact 2

## Implementation

How the decision will be implemented.

## Related Decisions

Links to related ADRs and decisions.
```

### User Experience Templates

#### User Research Summary

```markdown
# User Research: [Study Name]

## Research Objectives

- Primary objective
- Secondary objectives

## Methodology

Research methods and approach used.

## Participants

Participant demographics and characteristics.

## Key Findings

### Insight 1

Description and supporting evidence.

### Insight 2

Description and supporting evidence.

### Insight 3

Description and supporting evidence.

## Recommendations

### Short-term Actions

- Recommendation 1
- Recommendation 2

### Long-term Considerations

- Consideration 1
- Consideration 2

## Supporting Data

Links to research materials and raw data.
```

#### Usability Test Report

```markdown
# Usability Test: [Feature/Product Name]

## Test Overview

- **Test Date**: YYYY-MM-DD
- **Participants**: Number and type
- **Test Environment**: Remote/In-person
- **Duration**: Test session length

## Test Objectives

Primary and secondary testing goals.

## Test Scenarios

1. Scenario 1: Description
2. Scenario 2: Description
3. Scenario 3: Description

## Results Summary

### Success Rates

| Task   | Success Rate | Average Time | Error Rate |
| ------ | ------------ | ------------ | ---------- |
| Task 1 | 85%          | 2:30         | 15%        |
| Task 2 | 92%          | 1:45         | 8%         |

### Key Issues Identified

1. **Issue 1**: Description, frequency, severity
2. **Issue 2**: Description, frequency, severity

### Positive Feedback

- Positive aspect 1
- Positive aspect 2

## Recommendations

### High Priority

- [ ] Critical fix 1
- [ ] Critical fix 2

### Medium Priority

- [ ] Improvement 1
- [ ] Improvement 2

### Low Priority

- [ ] Enhancement 1
- [ ] Enhancement 2

## Next Steps

Follow-up actions and timeline.
```

### Project Management Templates

#### Sprint Planning Template

```markdown
# Sprint Planning: Sprint [Number]

## Sprint Goals

Primary objectives for this sprint.

## Sprint Capacity

- **Team Capacity**: X story points
- **Available Days**: X days
- **Team Members**: List of participants

## Backlog Items

### Committed Items

- [ ] Story 1 - X points
- [ ] Story 2 - X points
- [ ] Story 3 - X points

### Stretch Goals

- [ ] Story 4 - X points
- [ ] Story 5 - X points

## Definition of Done

- [ ] Code review completed
- [ ] Tests written and passing
- [ ] Documentation updated
- [ ] Design review approved
- [ ] Accessibility verified

## Risks and Dependencies

- Risk 1: Description and mitigation
- Dependency 1: Description and owner

## Success Metrics

How sprint success will be measured.
```

#### Retrospective Template

```markdown
# Sprint Retrospective: Sprint [Number]

## Sprint Summary

- **Sprint Duration**: X weeks
- **Team Velocity**: X story points
- **Completed Items**: X of X planned

## What Went Well

- Positive outcome 1
- Positive outcome 2
- Positive outcome 3

## What Could Be Improved

- Improvement area 1
- Improvement area 2
- Improvement area 3

## Action Items

### Start Doing

- [ ] Action 1 - Owner - Target date
- [ ] Action 2 - Owner - Target date

### Stop Doing

- [ ] Action 1 - Owner - Target date
- [ ] Action 2 - Owner - Target date

### Continue Doing

- Practice 1
- Practice 2

## Experiment for Next Sprint

Description of process experiment to try.
```

## Content Standards

- **Voice and tone**: clear, concise, active voice, consistent and inclusive terminology.
- **Structure**: logical hierarchy, scannable organization, consistent heading levels, bullets for lists, tables for structured data.
- **Formatting**: proper link formatting, code blocks for code, image alt text, table headers.

## Template Maintenance

Templates are versioned with the knowledge base: propose changes via PR, review regularly, evolve from usage feedback. When creating content, start from the matching template, include its required sections, and review before publishing.
