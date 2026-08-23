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
| 🤖🤝👨‍💻  | **LLM + Dev Review**     | LLM proposes, Developer validates |
| 👨‍💻💡🤖  | **Dev + LLM Suggestion** | Developer leads, LLM supports     |
| 🤖⚡     | **LLM Agent**            | Full autonomy until completion    |
| 👨‍💻    | **Dev**                  | Developer-only activity           |

---

## Product Lifecycle

### Hierarchy & Value Streams

```text
📘 INDUCTION
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

| Level                            | Duration (Sprints) | Value Stream       | Card Type              | Focus                                              |
| -------------------------------- | ------------------ | ------------------ | ---------------------- | -------------------------------------------------- |
| 📘 **Induction**                  | One-time           | Product Foundation | **PRD**                | Product Vision, Market Fit, Technical Architecture |
| 🚀 **Strategic Initiatives**      | 6-8 sprints        | Business Value     | **Initiative**         | Business Objectives, Value Proposition, Roadmap    |
| 🧩 **Customer-Facing Iterations** | 2-4 sprints        | User Experience    | **Epic**               | Feature Sets, User Journeys, Integration Points    |
| 🛠️ **Continuous Value Delivery** | 1 sprint           | Working Software   | **User Story (&Task)** | Deliverable Features, Code Quality, User Feedback  |

---

## Operational Flow

### 🔍 Discovery (optional entry point, before any level)

- **🤖🤝👨‍💻 Structured Discovery** (`/brainstorm`) → Turn a rough theme, or an existing epic/story `$root`, into an integrated **Draft** epic/story tree (interview → domain → triage). Human-initiated and optional: it feeds the levels below and never modifies the PRD. It is not one of the nine numbered steps and has no numbered how-to guide — see the ADL on `/brainstorm`'s catalog exceptions.

### 📘 Induction

1. **🤖🤝👨‍💻 PRD Creation** (`/specify-prd`) → Generate Product Requirements Document from user needs & market insights
2. **🤖🤝👨‍💻 Bootstrap Checklist Completion** (`/bootstrap`) → Define technical context and operational framework through comprehensive project assessment
3. **🤖🤝👨‍💻 Initiative Prioritization** (`/plan-initiatives`) → Identify and rank initiatives by impact

> **Domain modeling (optional DDD)**: `/map-subdomains` and `/map-contexts` are scoped capabilities, not standalone induction steps — invoked with `$scope` by `/plan-initiatives`, `/plan-epics`, `/refine-story`, `/plan-tasks`, or with full scope by `/bootstrap`. No DDD prerequisite: projects without subdomain/bounded-context artifacts fall back to "system areas".

### 🚀 Strategic Initiatives

1. **🤖🤝👨‍💻 Epic Breakdown** (`/plan-epics`) → Divide initiative into value increments

### 🧩 Customer-Facing Iterations

1. **🤖🤝👨‍💻 User Story Breakdown** (`/plan-stories`) → Decompose epics into granular stories
2. **🤖🤝👨‍💻 Story Refinement** (`/refine-story`) → Complete with description, scope, acceptance criteria, technical notes
3. **🤖🤝👨‍💻 Task Breakdown** (`/plan-tasks`) → Decompose stories into executable tasks

### 🛠️ Sprint Execution

1. **🤖⚡ Task Implementation** (`/implement`) → Autonomous completion with TDD, quality gates, and commit-per-task/story strategy
2. **🤖🤝👨‍💻 Code Review** (`/review`) → Structured review with adoption compliance, merge flow, and parent cascade
3. **🤖⚡ Status Update** → Automatic story/epic/initiative tracking update (handled by `/implement` and `/review`)

> **Skill-enabled workflow**: Run `/next` at session start to determine the most relevant skill. See [skills-guide.md](skills-guide.md) for the full catalog of 42 skills.
