# Getting Started - AI-Human Pairing Repository

Welcome to the AI-Human pairing repository template! This guide provides essential information to start using this framework for collaborative software development.

## 📁 Essential Folders

```
.pair/
├── way-of-working.md          # 📋 Main process (START HERE!)
├── getting-started.md         # 🚀 This guide
├── how-to/                    # 📚 Process guides for each development phase
│   ├── 01-how-to-create-PRD.md
│   ├── 02-how-to-complete-bootstrap-checklist.md
│   ├── 03-how-to-create-and-prioritize-initiatives.md
│   ├── 04-how-to-define-subdomains.md
│   ├── 05-how-to-define-bounded-contexts.md
│   ├── 06-how-to-breakdown-epics.md
│   ├── 07-how-to-breakdown-user-stories.md
│   ├── 08-how-to-refine-a-user-story.md
│   ├── 09-how-to-create-tasks.md
│   ├── 10-how-to-implement-a-task.md
│   ├── 11-how-to-commit-and-push.md
│   ├── 12-how-to-create-a-pr.md
│   ├── 13-how-to-code-review.md
├── assets/                    # 📑 Document templates and examples
│   ├── PRD_example.md
│   ├── PRD_template.md
│   └── bootstrap-checklist.md
├── product/                   # 💼 Product requirements and adoption
│   ├── adopted/
│   │   ├── PRD.md
│   │   └── subdomain/
│   │       ├── adoption-guidelines.md
│   │       ├── code-documentation-generation.md
│   │       ├── collaborative-workflow.md
│   │       ├── how-to-knowledge.md
│   │       ├── integration-process-standardization.md
│   │       └── README.md
│   └── backlog/
│       ├── 01-initiatives/
│       ├── 02-epics/
│       ├── 03-user-stories/
│       │   ├── current-sprint/
│       │   └── done/
├── prompts/                   # 🤖 LLM prompt templates
└── tech/                      # ⚙️ Technical guidelines and standards
  ├── adr/                   # Architecture Decision Records
  ├── knowledge-base/        # Technical guidelines
  │   ├── 01-architectural-guidelines.md
  │   ├── 02-code-design-guidelines.md
  │   ├── 03-technical-guidelines.md
  │   ├── 04-infrastructure-guidelines.md
  │   ├── 05-ux-guidelines.md
  │   ├── 06-definition-of-done.md
  │   ├── 07-testing-strategy.md
  │   ├── 08-accessibility-guidelines.md
  │   ├── 09-performance-guidelines.md
  │   ├── 10-security-guidelines.md
  │   ├── 11-observability-guidelines.md
  │   ├── 12-collaboration-and-process-guidelines/
  │   │   ├── README.md
  │   │   ├── project-management-framework-github.md
  │   │   └── assets/
  │   │       ├── code-review-template.md
  │   │       ├── epic-template.md
  │   │       ├── initiative-template.md
  │   │       ├── task-template.md
  │   │       └── user-story-template.md
  │   └── README.md
  └── adopted/                # Adopted standards and practices
    ├── architecture.md
    ├── README.md
    ├── infrastructure.md
    ├── tech-stack.md
    ├── ux-ui.md
    ├── way-of-working.md
```

### 📂 Folder Overview:

- **`way-of-working.md`**: Main process documentation – the starting point to understand the full workflow
- **`getting-started.md`**: This guide – essential information to get started with the framework
- **`how-to/`**: Step-by-step guides for each development phase and LLM collaboration
  - Process guides (01-13): Operational documentation for each phase
- **`assets/`**: Templates, checklists, and document examples (e.g., PRD, bootstrap checklist)
- **`product/`**: Product requirements and adoption documents
  - `adopted/`: Adoption documents and subdomain guidelines
  - `backlog/`: Backlog organized into initiatives, epics, and user stories (with sprint and done subdivisions)
- **`prompts/`**: Optimized prompt templates for various development activities
- **`tech/`**: Technical guidelines, architectural standards, and quality criteria
  - `adr/`: Architecture Decision Records
  - `knowledge-base/`: Comprehensive technical guidelines (01-11) and modular processes in `12-collaboration-and-process-guidelines/` with templates and specific frameworks
  - `adopted/`: Currently adopted standards and practices

## 🎯 Quick Start

1. **Read** `way-of-working.md` to understand the development process
2. **Adapt** technical guidelines in `tech/` folder to your technology stack
3. **Follow** the process guides in `how-to/` folder for each development phase

## 🚨 Critical: Technical Guidelines Setup

Before development, **review and adapt** all documents in the `tech/` folder to match your specific technology stack and requirements. These are templates with opinionated choices that need customization.

## 💡 How It Works

- 🤖🤝👨‍💻 **LLM + Human Review**: AI proposes, developer validates
- 👨‍💻💡🤖 **Human + AI Support**: Developer leads, AI assists
- 🤖⚡ **AI Autonomous**: Full AI execution until completion
- 👨‍💻 **Human Only**: Developer-exclusive activities

Happy AI-Human pairing! 🚀🤖👨‍💻
