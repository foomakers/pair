# Getting Started - AI-Human Pairing Repository

Welcome to the AI-Human pairing repository template! This guide provides essential information to start using this framework for collaborative software development.

## 📁 Essential Folders

```
.pair/
├── adoption/                  # 💼 Product requirements and technical standards
│   ├── product/              # Product requirements and adoption docs
│   │   ├── PRD.md            # Product Requirements Document
│   │   └── subdomain/        # Subdomain adoption guidelines
│   │       └── README.md
│   └── tech/                 # Adopted technical standards and practices
│       ├── architecture.md
│       ├── infrastructure.md
│       ├── README.md
│       ├── tech-stack.md
│       ├── ux-ui.md
│       ├── way-of-working.md
│       ├── adr/              # Architecture Decision Records
│       │   └── .keep
│       └── boundedcontext/   # Bounded context guidelines
│           └── README.md
├── knowledge/                       # 📚 Knowledge base and process documentation
│   ├── getting-started.md    # This guide
│   ├── way-of-working.md     # Main process documentation
│   ├── assets/               # Templates and checklists
│   │   ├── bootstrap-checklist.md
│   │   ├── PRD_example.md
│   │   └── PRD_template.md
│   ├── guidelines/           # Technical guidelines organized by theme
│   │   ├── README.md         # Guidelines overview and navigation
│   │   ├── architecture/     # System architecture patterns and ADR processes
│   │   │   └── architectural-guidelines.md
│   │   ├── development/      # Code design, technical standards, and testing
│   │   │   ├── code-design-guidelines.md
│   │   │   ├── technical-guidelines.md
│   │   │   └── testing-strategy.md
│   │   ├── collaboration/    # Process workflows and project management
│   │   │   └── project-management/ # Comprehensive collaboration guidelines
│   │   ├── quality/          # Quality criteria, accessibility, performance, security
│   │   │   ├── definition-of-done.md
│   │   │   ├── accessibility-guidelines.md
│   │   │   ├── performance-guidelines.md
│   │   │   └── security-guidelines.md
│   │   └── operations/       # Infrastructure, UX, and observability
│   │       ├── infrastructure-guidelines.md
│   │       ├── ux-guidelines.md
│   │       └── observability-guidelines.md
│   │       ├── filesystem-workflow-integration-guide.md
│   │       ├── github-projects-integration-guide.md
│   │       ├── project-management-compatibility-guide.md
│   │       ├── project-management-framework-filesystem.md
│   │       ├── project-management-framework-github.md
│   │       ├── project-management-framework.md
│   │       ├── project-management-integration-guide.md
│   │       ├── project-management-support-guide.md
│   │       ├── README.md
│   │       └── assets/       # Templates for process docs
│   │           ├── code-review-template.md
│   │           ├── epic-template.md
│   │           ├── initiative-template.md
│   │           ├── task-template.md
│   │           └── user-story-template.md
│   └── how-to/               # Step-by-step process guides
│       ├── 01-how-to-create-PRD.md
│       ├── 02-how-to-complete-bootstrap-checklist.md
│       ├── 03-how-to-create-and-prioritize-initiatives.md
│       ├── 04-how-to-define-subdomains.md
│       ├── 05-how-to-define-bounded-contexts.md
│       ├── 06-how-to-breakdown-epics.md
│       ├── 07-how-to-breakdown-user-stories.md
│       ├── 08-how-to-refine-a-user-story.md
│       ├── 09-how-to-create-tasks.md
│       ├── 10-how-to-implement-a-task.md
│       ├── 11-how-to-commit-and-push.md
│       ├── 12-how-to-create-a-pr.md
│       └── 13-how-to-code-review.md
```

### 📂 Folder Overview:

- **`way-of-working.md`**: Main process documentation – the starting point to understand the full workflow
- **`getting-started.md`**: This guide – essential information to get started with the framework
- **`how-to/`**: Step-by-step guides for each development phase and LLM collaboration
  - Process guides (01-13): Operational documentation for each phase
- **`assets/`**: Templates, checklists, and document examples (e.g., PRD, bootstrap checklist)
- **`product/`**: Product requirements and adoption documents
  - `adopted/`: Adoption documents and subdomain guidelines
  - `backlog/`: Backlog organized into initiatives, epics, and user stories (with sprint and done subdivisions). Only for file-system project management tool
- **`tech/`**: Technical guidelines, architectural standards, and quality criteria
  - `adr/`: Architecture Decision Records
  - `knowledge-base/`: Comprehensive technical guidelines organized by theme (architecture, development, collaboration, quality, operations) with navigation READMEs
  - `adopted/`: Currently adopted standards and practices. Specific for project

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
