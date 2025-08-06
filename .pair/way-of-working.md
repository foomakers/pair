# AI-Assisted Development Process

## Purpose

This document defines a structured methodology for AI-assisted software development that combines human expertise with AI capabilities to deliver high-quality software efficiently. The framework establishes clear responsibility boundaries between developers and AI systems, ensuring optimal collaboration while maintaining code quality, business alignment, and continuous value delivery.

The process is designed to:

- **Accelerate development velocity** through intelligent automation and AI-powered code generation
- **Maintain quality standards** via systematic review processes and automated quality checks
- **Ensure business alignment** by connecting technical implementation to strategic business objectives
- **Enable continuous learning** through captured knowledge and iterative improvements
- **Scale development practices** across teams while preserving consistency and best practices

## 🔑 Responsibility Matrix

| Symbol | Role                     | Description                       |
| ------ | ------------------------ | --------------------------------- |
| 🤖🤝👨‍💻 | **LLM + Dev Review**     | LLM proposes, Developer validates |
| 👨‍💻💡🤖 | **Dev + LLM Suggestion** | Developer leads, LLM supports     |
| 🤖⚡   | **LLM Agent**            | Full autonomy until completion    |
| 👨‍💻     | **Dev**                  | Developer-only activity           |

---

## Product Lifecycle

### Hierarchy & Value Streams

```
📘 STRATEGIC PREPARATION
└── Product Foundation & Architecture
    │
    ├── 🚀 STRATEGIC INITIATIVES
    │   └── Business Value & Market Position
    │       │
    │       ├── 🧩 CUSTOMER-FACING ITERATIONS
    │       │   └── User Experience & Feature Delivery
    │       │       │
    │       │       └── 🛠️ CONTINUOUS VALUE DELIVERY
    │       │           └── Working Software & Feedback Loops
```

### Timeline & Card Types

| Level                             | Duration (Sprints) | Value Stream       | Card Type              | Focus                                              |
| --------------------------------- | ------------------ | ------------------ | ---------------------- | -------------------------------------------------- |
| 📘 **Strategic Preparation**      | One-time           | Product Foundation | **PRD**                | Product Vision, Market Fit, Technical Architecture |
| 🚀 **Strategic Initiatives**      | 6-8 sprints        | Business Value     | **Initiative**         | Business Objectives, Value Proposition, Roadmap    |
| 🧩 **Customer-Facing Iterations** | 2-4 sprints        | User Experience    | **Epic**               | Feature Sets, User Journeys, Integration Points    |
| 🛠️ **Continuous Value Delivery**  | 1 sprint           | Working Software   | **User Story (&Task)** | Deliverable Features, Code Quality, User Feedback  |

---

## Operational Flow

### 📘 Strategic Preparation

1. **🤖🤝👨‍💻 PRD Creation** → Generate Product Requirements Document from user needs & market insights
2. **🤖🤝👨‍💻 Initiative Prioritization** → Identify and rank initiatives by impact
3. **🤖🤝👨‍💻 Bootstrap Checklist Completion** → Define technical context and operational framework through comprehensive project assessment
4. **🤖🤝👨‍💻 Subdomain Analysis** → Map relevant functional subdomains
5. **🤖🤝👨‍💻 Bounded Context Definition** → Define boundaries to prevent ambiguity
6. **🤖🤝👨‍💻 AI Context File Generation** → Connect PRD, initiatives, bootstrap decisions, and technical specifications

### 🚀 Strategic Initiatives

1. **🤖🤝👨‍💻 Initiative Selection** → Choose next product objective
2. **🤖🤝👨‍💻 Epic Breakdown** → Divide initiative into value increments

### 🧩 Customer-Facing Iterations

1. **🤖🤝👨‍💻 User Story Breakdown** → Decompose epics into granular stories
2. **🤖🤝👨‍💻 Story Refinement** → Complete with description, scope, acceptance criteria, technical notes
3. **🤖🤝👨‍💻 Sprint Planning** → Define a Sprint GOAL and select and prioritize stories for next sprint accordingly

### 🛠️ Sprint Execution

**👨‍💻💡🤖 Story Kickoff** (create new branch) → followed by:

1. **🤖🤝👨‍💻 Task Breakdown** → Decompose story into executable tasks
2. **🤖⚡ Task Iteration** → Autonomous completion until done
3. **🤖⚡ Automated Code Review** → AI-driven quality checks
4. **👨‍💻 Manual Code Review** → Human validation
5. **🤖🤝👨‍💻 Squash & Push** → Consolidate and commit to Git
6. **👨‍💻💡🤖 Next Card Iteration** → Continue until sprint completion
7. **🤖🤝👨‍💻 DoD Verification** → Final check with corrections if needed
8. **👨‍💻💡🤖 Refactoring Suggestions** → Pre-commit improvements (if accepted → dedicated task)
9. **🤖⚡ Code Smells Detection** → Pre-PR automated analysis
10. **🤖⚡ Static Analysis** → Automated warnings and suggestions
11. **🤖⚡ PR Creation** → Auto-generate with summary
12. **🤖🤝👨‍💻 PR Review** → Collaborative final validation
13. **👨‍💻 PR Merge** → Final merge
14. **🤖⚡ Status Update** → Automatic story tracking update
15. **🤖⚡ Knowledge Capture** → Extract patterns, solutions, and learnings for future iterations
