# Methodology Selection Guide

Context-based selection framework for choosing the most appropriate project management methodology for your team and project needs.

## Decision Framework

### Team Assessment Matrix

| Factor                | Kanban     | Scrum       | Waterfall | Lean       | SAFe        |
| --------------------- | ---------- | ----------- | --------- | ---------- | ----------- |
| **Team Size**         | 1-10       | 3-9         | 5-50+     | 1-15       | 50-500+     |
| **Experience Level**  | Any        | Medium-High | High      | Medium     | High        |
| **Project Certainty** | Low-Medium | Medium      | High      | Low-Medium | Medium-High |
| **Change Frequency**  | High       | Medium-High | Low       | High       | Medium      |
| **Delivery Cadence**  | Continuous | Iterative   | Milestone | Continuous | Planned     |
| **Process Maturity**  | Low-High   | Medium-High | High      | Medium     | High        |

### Context Factors

**Project Characteristics:**

- **Requirements Stability**: How well-defined and stable are requirements?
- **Scope Complexity**: How complex is the overall project scope?
- **Technical Risk**: How much technical uncertainty exists?
- **Delivery Timeline**: What are the delivery expectations and constraints?
- **Stakeholder Involvement**: How engaged are stakeholders in the process?

**Team Characteristics:**

- **Team Experience**: Experience with agile/traditional methodologies
- **Team Location**: Co-located vs distributed teams
- **Team Autonomy**: Decision-making authority and empowerment
- **Skill Diversity**: Range of skills and expertise within team
- **Communication Patterns**: Formal vs informal communication preferences

**Organizational Context:**

- **Cultural Fit**: Alignment with organizational culture and values
- **Compliance Requirements**: Regulatory or audit requirements
- **Resource Constraints**: Budget, time, and personnel limitations
- **Tool Availability**: Available project management and development tools
- **Change Tolerance**: Organizational appetite for process change

## Methodology Recommendations

### Small Teams (1-5 people)

**Recommended: Kanban or Lean**

- **Why**: Lower overhead, flexible workflow, continuous improvement focus
- **Best For**: Startups, small product teams, maintenance work
- **AI Integration**: Simple automation, basic forecasting
- **Tools**: GitHub Projects with basic board, filesystem for simplicity

**Avoid**: SAFe (too heavyweight), complex Scrum ceremonies

### Medium Teams (5-15 people)

**Recommended: Scrum or Hybrid Kanban-Scrum**

- **Why**: Structure without excessive overhead, proven for this size
- **Best For**: Product development, feature teams, established products
- **AI Integration**: Sprint planning assistance, velocity forecasting
- **Tools**: GitHub Projects with custom fields, automated sprint management

**Consider**: Lean for operational teams, Waterfall for regulatory environments

### Large Teams (15+ people)

**Recommended: SAFe or Scaled Scrum**

- **Why**: Coordination mechanisms, dependency management, portfolio alignment
- **Best For**: Enterprise products, complex systems, multiple teams
- **AI Integration**: Advanced forecasting, resource optimization, risk analysis
- **Tools**: Enterprise project management tools, GitHub Projects for team level

**Avoid**: Simple Kanban (insufficient coordination), pure Waterfall (too rigid)

## Context-Specific Guidance

### High Uncertainty Projects

**Recommended Approach**: Lean + Kanban

- **Rationale**: Maximum flexibility, rapid learning, minimal waste
- **Key Practices**: Hypothesis-driven development, rapid prototyping, continuous feedback
- **AI Support**: Pattern recognition, outcome prediction, adaptive planning
- **Success Metrics**: Learning velocity, time to insight, customer validation

### Regulatory/Compliance Projects

**Recommended Approach**: Waterfall or Disciplined Agile

- **Rationale**: Documentation requirements, approval gates, audit trails
- **Key Practices**: Comprehensive documentation, formal reviews, traceability
- **AI Support**: Compliance checking, documentation generation, risk monitoring
- **Success Metrics**: Compliance adherence, audit readiness, defect rates

### Innovation/R&D Projects

**Recommended Approach**: Lean Startup + Kanban

- **Rationale**: Experimentation focus, fast feedback loops, pivot capability
- **Key Practices**: Build-measure-learn cycles, MVP development, customer discovery
- **AI Support**: Experiment design, data analysis, market prediction
- **Success Metrics**: Innovation rate, market validation, time to market

### Maintenance/Support Projects

**Recommended Approach**: Kanban

- **Rationale**: Continuous flow, priority flexibility, quick response
- **Key Practices**: SLA management, priority queues, flow optimization
- **AI Support**: Incident prediction, auto-routing, capacity planning
- **Success Metrics**: Response time, resolution rate, customer satisfaction

## Hybrid Approaches

### Scrumban (Scrum + Kanban)

**When to Use**: Teams wanting Scrum structure with Kanban flow flexibility

- **Structure**: Sprint planning + continuous flow
- **Benefits**: Predictability with adaptability
- **AI Integration**: Sprint optimization + flow analysis

### Water-Scrum-Fall

**When to Use**: Organizations with traditional upstream/downstream processes

- **Structure**: Waterfall requirements + Scrum development + Waterfall deployment
- **Benefits**: Agile development within traditional constraints
- **AI Integration**: Requirements analysis + development automation + deployment optimization

### Lean-Agile

**When to Use**: Organizations focusing on value stream optimization

- **Structure**: Lean principles + Agile practices
- **Benefits**: Waste elimination with iterative development
- **AI Integration**: Value stream analysis + iterative optimization

## AI-Assisted Methodology Selection

### Assessment Automation

```markdown
AI Analysis Prompt:
"Analyze team context: [team_size], [experience_level], [project_type], [requirements_stability], [organizational_culture]. Recommend optimal methodology with rationale."
```

### Dynamic Methodology Adaptation

- **Continuous Assessment**: Regular methodology effectiveness analysis
- **Adaptive Recommendations**: Suggestions for methodology adjustments
- **Performance Prediction**: Forecast success with different approaches
- **Risk Identification**: Early warning for methodology misalignment

### Implementation Support

- **Transition Planning**: AI-assisted migration from current to recommended methodology
- **Training Recommendations**: Personalized learning paths for team members
- **Tool Selection**: Optimal tool recommendations based on methodology choice
- **Success Metrics**: KPI recommendations for methodology effectiveness

## Implementation Strategy

### Phase 1: Assessment (1-2 weeks)

1. **Team Assessment**: Evaluate team characteristics and capabilities
2. **Project Analysis**: Analyze project requirements and constraints
3. **Organizational Review**: Assess cultural and structural factors
4. **Tool Evaluation**: Review available tools and integrations

### Phase 2: Selection (1 week)

1. **Decision Matrix**: Apply assessment results to selection framework
2. **Stakeholder Alignment**: Ensure buy-in from key stakeholders
3. **Risk Assessment**: Identify potential challenges and mitigation strategies
4. **Success Criteria**: Define metrics for methodology effectiveness

### Phase 3: Implementation (2-4 weeks)

1. **Training Plan**: Develop team training and onboarding program
2. **Tool Setup**: Configure selected tools and automation
3. **Process Definition**: Define specific practices and workflows
4. **Pilot Project**: Start with limited scope for learning and adjustment

### Phase 4: Optimization (Ongoing)

1. **Regular Review**: Periodic assessment of methodology effectiveness
2. **Continuous Improvement**: Regular retrospectives and adjustments
3. **Metrics Monitoring**: Track success metrics and team satisfaction
4. **Evolution Planning**: Plan for methodology evolution as team matures

## Success Metrics by Methodology

### Kanban Metrics

- **Flow Efficiency**: Percentage of time items spend in active work
- **Cycle Time**: Time from start to completion
- **Throughput**: Items completed per time period
- **WIP Compliance**: Adherence to work-in-progress limits

### Scrum Metrics

- **Velocity**: Story points completed per sprint
- **Sprint Goal Success**: Percentage of sprint goals achieved
- **Team Satisfaction**: Regular team happiness surveys
- **Predictability**: Variance in sprint completion

### Waterfall Metrics

- **Schedule Adherence**: On-time delivery percentage
- **Budget Compliance**: Cost variance from planned budget
- **Quality Metrics**: Defect rates and customer satisfaction
- **Scope Management**: Change request frequency and impact

### Lean Metrics

- **Value Stream Efficiency**: End-to-end delivery time
- **Waste Reduction**: Measured elimination of non-value activities
- **Customer Value**: Direct customer benefit measurement
- **Learning Velocity**: Speed of hypothesis testing and validation

## Common Pitfalls and Mitigation

### Over-Engineering Process

- **Problem**: Choosing methodology that's too complex for team/project needs
- **Mitigation**: Start simple, add complexity gradually based on demonstrated need
- **AI Support**: Complexity analysis and right-sizing recommendations

### Under-Estimating Change Management

- **Problem**: Not accounting for team adaptation time and resistance
- **Mitigation**: Comprehensive change management plan with training and support
- **AI Support**: Change readiness assessment and personalized adaptation plans

### Tool-First Approach

- **Problem**: Selecting methodology based on available tools rather than needs
- **Mitigation**: Methodology selection first, then tool selection to support chosen approach
- **AI Support**: Tool-methodology fit analysis and recommendations

### Rigid Implementation

- **Problem**: Implementing methodology without adaptation to specific context
- **Mitigation**: Regular retrospectives and willingness to adapt practices
- **AI Support**: Continuous optimization recommendations based on team performance

## Related Topics

- **[kanban.md](kanban.md)** - Detailed Kanban implementation guide
- **[scrum.md](scrum.md)** - Comprehensive Scrum framework guide
- **[../project-management-tool/](.pair/knowledge/guidelines/collaboration/project-management-tool/README.md)** - Tool selection for chosen methodology
- **[../estimation/](.pair/knowledge/guidelines/collaboration/estimation/README.md)** - Estimation approaches by methodology
