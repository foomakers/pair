# Methodology

Project management methodologies and framework selection guidance for different contexts and team needs.

## Overview

This section provides comprehensive coverage of major project management methodologies, helping teams select the most appropriate approach based on their context, team size, project complexity, and organizational culture.

## Methodology Selection Framework

### Team Assessment Matrix

| Factor                | Kanban     | Scrum       | Waterfall | Lean       | SAFe        |
| --------------------- | ---------- | ----------- | --------- | ---------- | ----------- |
| **Team Size**         | 1-10       | 3-9         | 5-50+     | 1-15       | 50-500+     |
| **Experience Level**  | Any        | Medium-High | High      | Medium     | High        |
| **Project Certainty** | Low-Medium | Medium      | High      | Low-Medium | Medium-High |
| **Change Frequency**  | High       | Medium-High | Low       | High       | Medium      |
| **Delivery Cadence**  | Continuous | Iterative   | Milestone | Continuous | Planned     |
| **Process Maturity**  | Low-High   | Medium-High | High      | Medium     | High        |

### Context-Based Recommendations

#### Small Teams (1-5 people)

**Recommended: [Kanban](kanban.md) or [Lean](lean.md)**

- Lower overhead, flexible workflow, continuous improvement focus
- Best for startups, small product teams, maintenance work
- AI Integration: Simple automation, basic forecasting

#### Medium Teams (5-15 people)

**Recommended: [Scrum](scrum.md) or Hybrid Kanban-Scrum**

- Structure without excessive overhead, proven for this size
- Best for product development, feature teams, established products
- AI Integration: Sprint planning assistance, velocity forecasting

#### Large Teams (15+ people)

**Recommended: [SAFe](safe.md) or Scaled Scrum**

- Coordination mechanisms, dependency management, portfolio alignment
- Best for enterprise products, complex systems, multiple teams
- AI Integration: Advanced forecasting, resource optimization, risk analysis

### Context-Specific Guidance

#### High Uncertainty Projects → [Lean](lean.md) + [Kanban](kanban.md)

- Maximum flexibility, rapid learning, minimal waste
- Hypothesis-driven development, rapid prototyping, continuous feedback

#### Regulatory/Compliance Projects → [Waterfall](waterfall.md)

- Documentation requirements, approval gates, audit trails
- Comprehensive documentation, formal reviews, traceability

#### Enterprise Scale → [SAFe](safe.md)

- Multiple teams coordination, portfolio alignment
- Program increment planning, solution train coordination

## Available Methodologies

### Agile Methodologies

- **[scrum.md](scrum.md)** - Sprint-based iterative development framework

  - Best for: Complex product development, changing requirements
  - Roles: Product Owner, Scrum Master, Development Team
  - Events: Sprint Planning, Daily Standups, Sprint Review, Retrospectives

- **[kanban.md](kanban.md)** - Visual workflow management system
  - Best for: Continuous delivery, maintenance work, support teams
  - Focus: Work-in-progress limits, flow optimization, visual management

### Traditional Methodologies

- **[waterfall.md](waterfall.md)** - Sequential project management approach
  - Best for: Fixed requirements, regulatory environments
  - Phases: Requirements → Design → Implementation → Testing → Deployment

### Lean Methodologies

- **[lean.md](lean.md)** - Waste elimination and value optimization
  - Best for: Efficiency optimization, startup environments
  - Principles: Eliminate waste, amplify learning, decide as late as possible

### Enterprise Frameworks

- **[safe.md](safe.md)** - Scaled Agile Framework for enterprise
  - Best for: Large organizations, multiple teams, complex dependencies
  - Levels: Team, Program, Portfolio, Value Stream

## AI-Assisted Methodology Selection

### Assessment Automation

```bash
pair "Analyze team context and recommend optimal methodology with rationale"
pair "Evaluate current methodology effectiveness and suggest improvements"
pair "Generate methodology transition plan with timeline and milestones"
```

### Implementation Support

- **Transition Planning**: AI-assisted migration from current to recommended methodology
- **Training Recommendations**: Personalized learning paths for team members
- **Tool Selection**: Optimal tool recommendations based on methodology choice
- **Success Metrics**: KPI recommendations for methodology effectiveness

## Implementation Notes

Each methodology file includes:

- Core principles and practices
- Team roles and responsibilities
- Typical workflows and ceremonies
- Tool integration recommendations
- Success metrics and KPIs
- AI-assisted optimization techniques

## Related Topics

- **[Project Management Tools](../project-management-tool/README.md)**: Tool support for different methodologies
- **[Estimation](../estimation/README.md)**: Estimation approaches by methodology
- **[Board Management](../board-management.md)**: Board configuration for different methodologies
- Common pitfalls and mitigation strategies

## Related Topics

- **[../project-management-tool/](../project-management-tool/README.md)** - Tool implementations for each methodology
- **[../estimation/](../estimation/README.md)** - Estimation approaches by methodology
- **[../role-responsibilities.md](../role-responsibilities.md)** - Role definitions within methodologies
