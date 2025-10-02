# Scrum Framework

Sprint-based iterative development framework emphasizing team collaboration, regular delivery, and continuous improvement through structured ceremonies and roles.

## Overview

Scrum is an agile framework that organizes development work into fixed-length iterations called sprints, typically 1-4 weeks long. Teams work through a prioritized backlog, delivering potentially shippable increments while adapting to changing requirements through regular inspection and adaptation.

## Core Components

### Roles

**Product Owner**

- Defines and prioritizes product backlog
- Represents stakeholder interests and requirements
- Makes decisions on scope and feature priorities
- Accepts or rejects completed work

**Scrum Master**

- Facilitates Scrum process and ceremonies
- Removes impediments and blockers
- Coaches team on Scrum practices
- Protects team from external distractions

**Development Team**

- Cross-functional group delivering the product
- Self-organizing and self-managing
- Collaboratively estimates and commits to sprint work
- Delivers potentially shippable increments

### Artifacts

**Product Backlog**

- Prioritized list of features and requirements
- Continuously refined and updated
- Items include user stories, bugs, and technical tasks
- Maintained and owned by Product Owner

**Sprint Backlog**

- Subset of product backlog selected for current sprint
- Includes sprint goal and task breakdown
- Owned and managed by development team
- Updated daily during sprint execution

**Increment**

- Potentially shippable product increment
- Meets definition of done criteria
- Cumulative sum of all completed backlog items
- Demonstrated at sprint review

### Ceremonies

**Sprint Planning**

- Team selects work for upcoming sprint
- Defines sprint goal and commitment
- Breaks down selected items into tasks
- Time-boxed to 2 hours per week of sprint

**Daily Scrum**

- 15-minute daily synchronization meeting
- Team discusses progress, plans, and blockers
- Focus on sprint goal achievement
- Team members coordinate and adapt

**Sprint Review**

- Demonstration of completed work to stakeholders
- Feedback collection on delivered increment
- Product backlog adaptation based on learnings
- Time-boxed to 1 hour per week of sprint

**Sprint Retrospective**

- Team reflection on process and collaboration
- Identification of improvement opportunities
- Action items for next sprint enhancement
- Time-boxed to 45 minutes per week of sprint

## Implementation Guidelines

### GitHub Integration

**Project Board Setup**

```markdown
# Scrum Board Columns

- Product Backlog: All prioritized work items
- Sprint Backlog: Selected items for current sprint
- In Progress: Active development work
- Review: Code review and testing phase
- Done: Completed work meeting definition of done
```

**Sprint Management**

- Use GitHub milestones for sprint tracking
- Create sprint-specific project boards
- Tag issues with sprint labels
- Track velocity through completed story points

### Estimation and Planning

**Story Point Estimation**

- Use relative sizing (Fibonacci sequence)
- Include entire team in estimation sessions
- Focus on complexity, not time duration
- Regularly calibrate estimates with actuals

**Sprint Planning Process**

1. **Review product backlog**: Prioritization and refinement
2. **Set sprint goal**: Clear objective for upcoming sprint
3. **Select backlog items**: Based on team capacity and priority
4. **Break down tasks**: Detailed task breakdown for selected items
5. **Commit to sprint**: Team agreement on deliverable scope

## Best Practices

### Team Collaboration

**Cross-Functional Skills**

- Team members with diverse but overlapping skills
- Shared knowledge and collective code ownership
- Pair programming and knowledge sharing
- Focus on team success over individual achievement

**Communication Patterns**

- Daily face-to-face or video communication
- Transparent progress and impediment sharing
- Regular stakeholder feedback and collaboration
- Open discussion of process improvements

### Continuous Improvement

**Retrospective Focus Areas**

- Team collaboration and communication effectiveness
- Technical practices and code quality
- Process efficiency and waste elimination
- Stakeholder engagement and feedback integration

**Adaptation Strategies**

- Experiment with process modifications
- Measure impact of changes on team performance
- Regular assessment of team satisfaction and engagement
- Continuous learning and skill development

## Related Documents

- **[../estimation/](.pair/knowledge/guidelines/collaboration/estimation/README.md)** - Story point estimation techniques
- **[.pair/knowledge/guidelines/collaboration/project-tracking/github-tracking.md](.pair/knowledge/guidelines/collaboration/project-tracking/github-tracking.md)** - Sprint tracking implementation
- **[methodology-selection-guide.md](methodology-selection-guide.md)** - When to choose Scrum vs other frameworks
