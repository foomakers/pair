# Getting Started - AI-Human Pairing Repository

Welcome to the AI-Human pairing repository template! This guide will provide you with all the necessary information to start using this structured framework for collaborative software development.

## 📁 `.pair` Folder Structure

The `.pair` folder contains all the necessary elements for the pairing process between human developers and artificial intelligence:

```
.pair/
├── way-of-working.md          # 📋 Main process (FIRST STEP!)
├── getting-started.md         # 🚀 This guide
├── docs/                      # 📚 Entry points for each process phase
│   ├── 01-how-to-create-PRD.md
│   ├── 02-how-to-create-and-prioritize-initiatives.md
│   ├── 03-how-to-define-subdomains.md
│   ├── 04-how-to-define-bounded-contexts.md
│   ├── 05-how-to-breakdown-epics.md
│   ├── 06-how-to-breakdown-user-stories.md
│   ├── 07-how-to-refine-a-user-story.md
│   ├── 09-how-to-implement-a-task.md
│   ├── 10-how-to-code-review.md
│   ├── 11-how-to-commit-and-push.md
│   ├── 12-how-to-create-a-pr.md
│   ├── PRD_example.md         # 📝 PRD Example
│   ├── PRD_template.md        # 📋 PRD Template
│   └── _assets_structure.md   # 🗂️ Assets structure
├── product/                   # 💼 Product documents and backlog
│   ├── PRD.md                 # 📋 Product Requirements Document
│   └── backlog/               # 📦 Backlog items (for simple projects)
├── prompts/                   # 🤖 LLM prompt templates
└── tech/                      # ⚙️ Technical guidelines and specifications
    ├── 01-architectural-guidelines.md
    ├── 02-code-design-guidelines.md
    ├── 03-technical-guidelines.md
    ├── 04-infrastructure-guidelines.md
    ├── 05-ux-guidelines.md
    ├── 06-definition-of-done.md
    ├── 07-testing-strategy.md
    ├── 08-accessibility-guidelines.md
    ├── 09-performance-guidelines.md
    ├── 10-security-guidelines.md
    ├── 11-observability-guidelines.md
    ├── 12-infrastructure-guidelines.md
    └── 13-mcp-integration-guidelines.md
```

### 📂 Main folder descriptions:

- **`docs/`**: Contains specific entry points for each process phase, with detailed instructions on how to collaborate with the LLM for each step
- **`product/`**: Documents to describe the product (like PRD) and backlog items. For complex projects, it's recommended to use a dedicated issue tracker like Jira or GitHub Issues
- **`prompts/`**: Optimized prompt templates for different phases of the development process
- **`tech/`**: Technical, architectural guidelines and quality standards to follow during development

## 🎯 First Step: Read the Way of Working

**IMPORTANT**: Before starting any activity, carefully read the `way-of-working.md` file. This document contains:

- **Responsibility matrix** between human and AI
- **Complete operational flow** of the development process
- **Product hierarchy and value streams**
- **Timeline and card types** for each level

The process is structured in 4 main levels:

1. 📘 **Strategic Preparation** - Product foundations
2. 🚀 **Strategic Initiatives** - Business objectives
3. 🧩 **Customer-Facing Iterations** - User experience
4. 🛠️ **Continuous Value Delivery** - Working software

## 📚 Entry Points for Each Step

Each process phase has a dedicated entry point in the `docs/` folder that provides specific instructions on how to collaborate with the LLM:

### 📘 Strategic Preparation

- **01-how-to-create-PRD** - Product Requirements Document creation
- **02-how-to-create-and-prioritize-initiatives** - Initiative identification and prioritization
- **03-how-to-define-subdomains** - Functional subdomain mapping
- **04-how-to-define-bounded-contexts** - Bounded context definition

### 🚀 Strategic Initiatives

- **05-how-to-breakdown-epics** - Initiative breakdown into epics

### 🧩 Customer-Facing Iterations

- **06-how-to-breakdown-user-stories** - Epic decomposition into user stories
- **07-how-to-refine-a-user-story** - User story refinement

### 🛠️ Sprint Execution

- **09-how-to-implement-a-task** - Task implementation
- **10-how-to-code-review** - Code review process
- **11-how-to-commit-and-push** - Commit and push management
- **12-how-to-create-a-pr** - Pull request creation and management

## 🤖 How to Instruct the LLM

Each file in the `docs/` folder contains:

1. **Specific context** for that process phase
2. Link to **Prompt templates** optimized for the LLM found in the `prompts/` folder
3. **Practical examples** of expected input and output
4. **Quality criteria** to validate the result
5. **Checklist** for human review

### Typical entry point structure:

```markdown
# How to [Process Phase]

## Context

Description of the phase and its role in the general process

## Suggested Model

Advice on the type of model to use and recommendation of which models work well for this task

## Link to LLM Prompt Template

Link to the optimized template to use with AI

## Required Input

What to provide to the LLM to get optimal results

## Expected Output

Format and content of the desired result

## Quality Criteria

How to validate the LLM result

## Human Review Checklist

Control points for human validation
```

## 🚀 Quick Start

1. **Read** `way-of-working.md` to understand the complete process
2. **Identify** which phase you are in or want to start
3. **Open** the corresponding `how-to-*` file in the `docs/` folder
4. **Follow** the instructions to collaborate with the LLM
5. **Validate** the result using the provided quality criteria

## 💡 Responsibility Matrix Symbols

- 🤖🤝👨‍💻 **LLM + Dev Review**: LLM proposes, developer validates
- 👨‍💻💡🤖 **Dev + LLM Suggestion**: Developer leads, LLM supports
- 🤖⚡ **LLM Agent**: Full autonomy until completion
- 👨‍💻 **Dev**: Developer-only activity

Happy AI-Human pairing! 🚀🤖👨‍💻
