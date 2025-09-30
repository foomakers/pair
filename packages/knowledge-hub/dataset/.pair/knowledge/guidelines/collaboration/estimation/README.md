# Estimation

Estimation frameworks, AI-assisted approaches, and context-based selection guidance for accurate project planning.

## Overview

Comprehensive coverage of estimation approaches optimized for AI-assisted development, providing frameworks for different contexts, team capabilities, and project requirements.

## Estimation Categories

### Complexity-Based Estimation
- **[complexity-based-estimation.md](complexity-based-estimation.md)** - Relative sizing approaches
  - **T-Shirt Sizing** (XS, S, M, L, XL) - Quick relative estimation
  - **Fibonacci Story Points** (1, 2, 3, 5, 8, 13, 21) - Standard Agile approach
  - **Power of 2** (1, 2, 4, 8, 16) - Simplified for AI processing

### Time-Based Estimation  
- **[time-based-estimation.md](time-based-estimation.md)** - Duration-focused approaches
  - **Ideal Hours** - Pure development time estimation
  - **Elapsed Time** - Real-world delivery time with interruptions
  - **Sprint Capacity** - Estimation within sprint boundaries

### Forecast-Based Estimation
- **[forecast-based-estimation.md](forecast-based-estimation.md)** - Predictive approaches
  - **Velocity-Based Forecasting** - Predict delivery based on team velocity
  - **Monte Carlo Simulation** - Statistical forecasting with uncertainty
  - **Throughput Forecasting** - Based on historical throughput data
  - **Burn-up/Burn-down Charts** - Visual progress forecasting

### AI-Assisted Estimation
- **[ai-assisted-estimation.md](ai-assisted-estimation.md)** - AI-optimized approaches
  - **Confidence Intervals** - AI provides estimate + confidence percentage
  - **Historical Pattern Matching** - AI learns from past similar tasks
  - **Component-Based Estimation** - Break tasks into AI-recognizable patterns
  - **Human-AI Collaboration** - When to trust AI vs human oversight

### Hybrid Approaches
- **[hybrid-estimation.md](hybrid-estimation.md)** - Combined methodologies
  - **Three-Point Estimation** (Optimistic, Realistic, Pessimistic)
  - **Planning Poker** (modified for AI-human collaboration)
  - **Affinity Estimation** - Group similar items by complexity

## Selection Framework

### Decision Matrix

| Context | Team Size | Complexity | Recommended Approach |
|---------|-----------|------------|---------------------|
| New Project | Small (1-5) | Low | T-Shirt + AI-Assisted |
| New Project | Medium (5-15) | Medium | Fibonacci + Monte Carlo |
| New Project | Large (15+) | High | Hybrid + Velocity Forecasting |
| Maintenance | Any | Low | Throughput + Historical Patterns |
| R&D | Any | High | Three-Point + Confidence Intervals |

### Context Factors

- **Team Experience**: New teams → simpler approaches, experienced teams → sophisticated methods
- **Project Certainty**: High certainty → time-based, low certainty → complexity-based  
- **AI Capability**: High AI maturity → leverage AI-assisted approaches
- **Stakeholder Needs**: Management → forecasting, development → story points

## Implementation Guidelines

Each estimation approach includes:
- **When to Use**: Context and scenarios
- **Setup Instructions**: Tool configuration and team training
- **AI Integration**: How to leverage AI assistance
- **Calibration Methods**: Improving accuracy over time
- **Success Metrics**: Measuring estimation effectiveness

## Related Topics

- **[../methodology/](../methodology/README.md)** - Methodology-specific estimation practices
- **[../project-tracking/](../project-tracking/README.md)** - Tracking estimation accuracy
- **[../project-management-tool/](../project-management-tool/README.md)** - Tool-specific estimation features