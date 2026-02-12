# Complexity-Based Estimation

## Overview

Relative sizing approach using story points, t-shirt sizes, and complexity indicators rather than time estimates, focusing on relative comparison and team velocity tracking for predictable planning and delivery.

## Core Principles

### Relative Sizing Philosophy

#### Comparison-Based Estimation

- Compare new work against previously completed items
- Focus on relative complexity rather than absolute time
- Use consistent reference points for calibration
- Build team consensus through collaborative estimation

#### Abstract Units

- Use story points or t-shirt sizes instead of hours/days
- Avoid false precision of time-based estimates
- Separate complexity from capacity and availability
- Enable velocity-based forecasting and planning

#### Team Velocity Focus

- Track team delivery capacity over time
- Use historical velocity for future planning
- Account for team composition and context changes
- Enable predictable sprint and release planning

## Estimation Scales and Methods

### Story Point Scales

#### Fibonacci Sequence (Recommended)

```text
1, 2, 3, 5, 8, 13, 21, 34
- Reflects increasing uncertainty at larger sizes
- Prevents false precision in large estimates
- Natural progression that matches human perception
- Forces choice between significantly different sizes
```

#### Powers of 2

```text
1, 2, 4, 8, 16, 32
- Simple mathematical progression
- Clear doubling relationship between sizes
- Good for teams comfortable with binary thinking
- Less granular than Fibonacci for medium sizes
```

#### Linear Scale

```text
1, 2, 3, 4, 5, 6, 7, 8, 9, 10
- More granular sizing options
- May encourage false precision
- Easier for new teams to understand
- Risk of treating as time estimates
```

### T-Shirt Sizing

#### Basic T-Shirt Scale

```text
XS (Extra Small) - 1 point
S (Small) - 2 points
M (Medium) - 5 points
L (Large) - 8 points
XL (Extra Large) - 13 points
XXL (Extra Extra Large) - 21 points
```

#### Extended T-Shirt Scale

```text
XS, S, M, L, XL, XXL, XXXL
- More granular than basic scale
- Intuitive sizing metaphor
- Good for initial rough sizing
- Can map to story points for velocity tracking
```

### Complexity Factors

#### Technical Complexity

- Algorithm complexity and performance requirements
- Integration points and external dependencies
- Technology novelty and team experience
- Architecture changes and refactoring needs

#### Business Complexity

- Number of business rules and edge cases
- Stakeholder coordination and approval requirements
- Compliance and regulatory considerations
- User experience and interface complexity

#### Risk and Uncertainty

- Unknown technical challenges
- External dependencies and third-party integrations
- Research and investigation requirements
- Cross-team coordination needs

## Estimation Techniques

### Planning Poker

#### Process Overview

1. **Story Presentation**: Product Owner presents user story
2. **Clarification**: Team asks questions and discusses requirements
3. **Private Estimation**: Each team member selects estimate privately
4. **Reveal**: All estimates revealed simultaneously
5. **Discussion**: Discuss differences, especially outliers
6. **Re-estimate**: Repeat until consensus achieved

#### Best Practices

- Use timer to limit discussion time (5-10 minutes per story)
- Focus on highest and lowest estimates for discussion
- Document assumptions and clarifications
- Avoid averaging estimates - seek genuine consensus

#### Common Variations

- **Async Planning Poker**: Use digital tools for remote estimation
- **Modified Delphi**: Multiple rounds with anonymous feedback
- **Affinity Estimation**: Group stories by relative size first

### Affinity Estimation

#### Setup Process

1. **Story Preparation**: Write stories on cards or sticky notes
2. **Reference Stories**: Identify well-understood reference stories
3. **Initial Grouping**: Team groups stories by relative size
4. **Size Assignment**: Assign point values to each group
5. **Validation**: Review and adjust groupings as needed

#### Advantages

- Fast estimation for large numbers of stories
- Good for initial backlog sizing
- Encourages relative thinking
- Reduces individual bias through group process

### Bucket Estimation

#### Implementation

1. **Create Buckets**: Set up containers for each story point value
2. **Reference Examples**: Place known stories in appropriate buckets
3. **Story Sorting**: Team places new stories in buckets
4. **Review and Adjust**: Validate placement and move if needed
5. **Final Sizing**: Assign final point values based on bucket placement

#### Use Cases

- Large backlog estimation sessions
- Initial project sizing and planning
- Regular backlog grooming and refinement
- Cross-team estimation standardization

## Velocity Tracking and Forecasting

### Velocity Calculation

#### Basic Velocity

```text
Sprint Velocity = Total Story Points Completed in Sprint
Team Velocity = Average Sprint Velocity over last 3-6 sprints
```

#### Adjusted Velocity

```text
Capacity-Adjusted Velocity = Velocity × (Actual Capacity / Planned Capacity)
- Account for holidays, vacations, and availability changes
- Adjust for team composition changes
- Factor in context switching and interrupt work
```

#### Trend Analysis

- Track velocity trends over time
- Identify patterns and seasonal variations
- Adjust forecasts based on velocity trends
- Monitor for significant velocity changes

### Forecasting Methods

#### Simple Velocity Forecasting

```text
Estimated Completion = Remaining Story Points / Average Velocity
Confidence Range = ± 20-30% based on velocity variance
```

#### Monte Carlo Simulation

```python
# Example forecasting simulation
import random
import numpy as np

def monte_carlo_forecast(remaining_points, velocity_history, iterations=1000):
    completion_times = []

    for _ in range(iterations):
        velocity = random.choice(velocity_history)
        sprints_needed = np.ceil(remaining_points / velocity)
        completion_times.append(sprints_needed)

    return {
        '50th_percentile': np.percentile(completion_times, 50),
        '80th_percentile': np.percentile(completion_times, 80),
        '95th_percentile': np.percentile(completion_times, 95)
    }
```

#### Scenario-Based Forecasting

- Optimistic scenario (high velocity)
- Most likely scenario (average velocity)
- Pessimistic scenario (low velocity)
- Risk-adjusted scenario (velocity with known risks)

## Implementation Guidelines

### Team Calibration

#### Establish Reference Stories

1. **Select Representative Stories**: Choose 3-5 well-understood completed stories
2. **Assign Reference Points**: Distribute across point scale (e.g., 2, 5, 8, 13)
3. **Document Characteristics**: Record what makes each reference story that size
4. **Team Agreement**: Ensure all team members understand and agree
5. **Regular Review**: Revisit and update references as team learns

#### Calibration Process

```markdown
Reference Story Examples:

- 2 points: Simple bug fix with clear solution
- 5 points: Standard feature with known technology
- 8 points: Complex feature requiring research
- 13 points: Epic-sized work requiring breakdown
```

### Estimation Sessions

#### Preparation

- Stories should be well-written with clear acceptance criteria
- Product Owner available for questions and clarification
- Reference stories and estimation scale visible to team
- Estimation tools prepared (cards, apps, etc.)

#### Session Structure

1. **Review Process** (5 minutes): Remind team of estimation approach
2. **Estimate Stories** (30-60 minutes): Work through prioritized backlog
3. **Capture Decisions** (5 minutes): Document estimates and assumptions
4. **Review Velocity** (10 minutes): Update velocity tracking if needed

#### Quality Checks

- Stories larger than 13 points should be broken down
- Estimates should have team consensus, not averages
- Assumptions and clarifications should be documented
- Reference stories should be periodically validated

### Continuous Improvement

#### Velocity Analysis

- Track actual completion against estimates
- Identify patterns in over/under estimation
- Analyze factors that impact velocity
- Adjust reference stories based on learning

#### Estimation Accuracy

- Compare initial estimates with final story sizes
- Track stories that required re-estimation
- Identify categories of work that are consistently mis-estimated
- Refine estimation process based on accuracy data

#### Team Retrospectives

- Regular discussion of estimation effectiveness
- Identify process improvements and adjustments
- Share learnings across teams and projects
- Evolve estimation practices based on team growth

## Advanced Techniques

### Multi-Team Calibration

#### Cross-Team Reference Stories

- Establish common reference stories across teams
- Regular calibration sessions between teams
- Shared story point definitions and examples
- Normalized velocity tracking for portfolio planning

#### Scaling Considerations

- Account for different team contexts and capabilities
- Adjust for technology stack and domain differences
- Consider team maturity and experience levels
- Enable portfolio-level planning and forecasting

### Epic and Initiative Estimation

#### Top-Down Estimation

1. **Epic Sizing**: Estimate epic as a whole using large point values
2. **Story Breakdown**: Break epic into individual user stories
3. **Story Estimation**: Estimate individual stories normally
4. **Validation**: Compare epic estimate with sum of story estimates
5. **Adjustment**: Adjust based on integration overhead and risks

#### Bottom-Up Aggregation

1. **Story Identification**: Identify all stories within epic
2. **Individual Estimation**: Estimate each story separately
3. **Dependency Analysis**: Identify cross-story dependencies
4. **Integration Overhead**: Add points for integration and testing
5. **Epic Total**: Sum individual estimates plus overhead

This complexity-based estimation approach provides reliable relative sizing that enables velocity-based forecasting while avoiding the pitfalls of time-based estimation.
