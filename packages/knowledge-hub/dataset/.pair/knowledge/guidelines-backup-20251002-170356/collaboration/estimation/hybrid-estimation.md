# Hybrid Estimation Approaches

Combined estimation methodologies that leverage multiple techniques for comprehensive project planning and risk management.

## Overview

Hybrid estimation combines different estimation approaches to provide more accurate and confident project planning. This guide covers techniques for integrating AI-assisted, complexity-based, time-based, and forecast-based estimation methods.

## Common Hybrid Patterns

### Three-Point Estimation

Combines optimistic, realistic, and pessimistic estimates using PERT (Program Evaluation and Review Technique) formula.

**Formula**: Expected Estimate = (Optimistic + 4×Realistic + Pessimistic) / 6

**Example**:

```markdown
# Feature: User Dashboard Redesign

## Optimistic Scenario (2 days)

- Simple template modification
- No API changes required
- Existing components work perfectly

## Realistic Scenario (5 days)

- Some custom component development
- Minor API adjustments needed
- Normal testing and review process

## Pessimistic Scenario (10 days)

- Major component rewrite required
- Complex API integration issues
- Extended testing and rework

## PERT Calculation

Expected = (2 + 4×5 + 10) / 6 = 5.3 days
```

### Planning Poker with AI Assistance

Traditional planning poker enhanced with AI-generated estimates as starting points.

**Process**:

1. **AI Initial Estimate**: Get AI estimate with confidence level
2. **Team Discussion**: Review AI reasoning and assumptions
3. **Individual Estimates**: Team members provide their estimates
4. **Consensus Building**: Discuss differences and converge
5. **Final Estimate**: Agreed estimate with confidence interval

### Triangulation Method

Use multiple estimation approaches and compare results for validation.

**Example Implementation**:

```markdown
# Story: Implement OAuth Integration

## Method 1: Story Points (Complexity-Based)

- Estimate: 8 story points
- Reasoning: Complex integration, new technology
- Confidence: Medium (60%)

## Method 2: Time-Based

- Estimate: 12-16 hours
- Reasoning: Research (4h) + Implementation (6h) + Testing (4h)
- Confidence: High (80%)

## Method 3: AI-Assisted

- Estimate: 5-8 story points / 10-14 hours
- Confidence: 75%
- Risk factors: OAuth provider documentation quality

## Triangulated Result

- **Final Estimate**: 8 story points / 14 hours
- **Confidence Level**: 70%
- **Key Risks**: OAuth provider changes, testing complexity
```

## Implementation Strategies

### Agile Hybrid Approach

Combine story points with time validation for sprint planning.

**Sprint Planning Process**:

1. **Complexity Estimation**: Use story points for backlog items
2. **Capacity Validation**: Convert to hours for sprint capacity check
3. **Risk Assessment**: Apply three-point estimation to high-risk items
4. **AI Enhancement**: Use AI for novel or complex features

### Waterfall Hybrid Approach

Detailed time estimates enhanced with complexity assessment and forecasting.

**Planning Process**:

1. **Work Breakdown**: Detailed task decomposition
2. **Time Estimation**: Bottom-up hour estimates
3. **Complexity Weighting**: Apply complexity multipliers
4. **Historical Validation**: Compare with forecast-based predictions
5. **Risk Buffers**: Add contingency based on uncertainty

## Tool Integration

### GitHub Integration

```markdown
# Hybrid Estimation Issue Template

## Estimation Summary

- **Story Points**: X points
- **Time Estimate**: Y hours/days
- **Confidence Level**: Z%
- **Risk Level**: Low/Medium/High

## Estimation Methods Used

- [ ] Planning Poker
- [ ] Three-Point Estimation
- [ ] AI-Assisted Estimation
- [ ] Historical Comparison

## Validation Checks

- [ ] Complexity vs time alignment
- [ ] Historical data comparison
- [ ] Risk factor assessment
- [ ] Team consensus achieved

## Assumptions and Dependencies

- List key assumptions made during estimation
- External dependencies identified
- Technology/knowledge assumptions
```

### Automated Estimation Pipeline

```yaml
# .github/workflows/estimation-validation.yml
name: Estimation Validation
on:
  issues:
    types: [labeled]

jobs:
  validate-estimates:
    if: contains(github.event.label.name, 'estimated')
    runs-on: ubuntu-latest
    steps:
      - name: Check estimation completeness
        uses: actions/github-script@v6
        with:
          script: |
            const issue = context.payload.issue;
            const body = issue.body;

            // Check for required estimation fields
            const hasStoryPoints = /Story Points.*\d+/.test(body);
            const hasTimeEstimate = /Time Estimate.*\d+/.test(body);
            const hasConfidence = /Confidence Level.*\d+%/.test(body);

            if (!hasStoryPoints || !hasTimeEstimate || !hasConfidence) {
              await github.rest.issues.createComment({
                issue_number: issue.number,
                owner: context.repo.owner,
                repo: context.repo.repo,
                body: '⚠️ Estimation incomplete. Please provide story points, time estimate, and confidence level.'
              });
            }
```

## Best Practices

### When to Use Hybrid Approaches

**High-Risk Projects**

- Use multiple estimation methods for validation
- Apply three-point estimation to uncertain work
- Combine expert judgment with data-driven forecasting

**Large-Scale Initiatives**

- Break down into smaller estimable pieces
- Use different methods for different work types
- Validate estimates across multiple time horizons

**Cross-Functional Teams**

- Leverage different expertise and perspectives
- Use planning poker for consensus building
- Apply AI assistance for objectivity

### Common Pitfalls to Avoid

**Over-Engineering Estimation**

- Don't use every method for every item
- Focus on high-impact, high-uncertainty work
- Balance estimation effort with value gained

**Conflicting Methods**

- Ensure estimation methods are complementary
- Resolve conflicts through discussion, not averaging
- Document reasoning for estimate selection

**Analysis Paralysis**

- Set time limits for estimation activities
- Use estimation confidence levels appropriately
- Make decisions with available information

## Related Documents

- **[ai-assisted-estimation.md](ai-assisted-estimation.md)** - AI-powered estimation techniques
- **[complexity-based-estimation.md](complexity-based-estimation.md)** - Story point and relative sizing
- **[time-based-estimation.md](time-based-estimation.md)** - Hour and calendar-based estimation
- **[forecast-based-estimation.md](forecast-based-estimation.md)** - Data-driven prediction methods
