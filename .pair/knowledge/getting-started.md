# Getting Started - AI-Human Pairing Repository

Welcome to the AI-Human pairing repository template! This guide provides essential information to start using this framework for collaborative software development.

## 📁 Essential Folders

````text
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
├── knowledge/                # 📚 Knowledge base and process documentation
│   ├── getting-started.md    # This guide
│   ├── way-of-working.md     # Main process documentation
│   ├── assets/               # Templates and checklists
│   │   ├── bootstrap-checklist.md
│   │   ├── PRD_example.md
│   │   └── PRD_template.md
│   ├── guidelines/           # Technical guidelines organized by theme
│   │   ├── README.md         # Guidelines overview and navigation
│   │   ├── architecture/     # System architecture patterns and ADR processes
│   │   ├── code-design/      # Code design and development standards
│   │   ├── collaboration/    # Process workflows and project management
│   │   │   ├── README.md
│   │   │   ├── automation/   # Automation and CI/CD guidelines
│   │   │   ├── estimation/   # Project estimation methodologies
│   │   │   ├── issue-management/  # Issue tracking and lifecycle
│   │   │   ├── methodology/  # Agile methodologies (Kanban, Scrum, etc.)
│   │   │   ├── project-management-tool/  # Tool-specific implementations
│   │   │   │   ├── README.md
│   │   │   │   ├── github-implementation.md
│   │   │   │   └── filesystem-implementation.md
│   │   │   ├── project-tracking/  # Project tracking and reporting
│   │   │   ├── team/         # Team collaboration guidelines
│   │   │   └── templates/    # Templates for process docs
│   │   │       ├── README.md
│   │   │       ├── branch-template.md
│   │   │       ├── code-review-template.md
│   │   │       ├── commit-template.md
│   │   │       ├── epic-template.md
│   │   │       ├── initiative-template.md
│   │   │       ├── pr-template.md
│   │   │       ├── task-template.md
│   │   │       └── user-story-template.md
│   │   ├── infrastructure/   # Infrastructure and deployment guidelines
│   │   ├── observability/    # Monitoring and observability practices
│   │   ├── quality-assurance/  # Quality criteria, accessibility, performance, security
│   │   ├── technical-standards/  # Technical standards and coding practices
│   │   ├── testing/          # Testing strategies and automation
│   │   └── user-experience/  # UX/UI design guidelines and principles
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
│       └── 11-how-to-code-review.md
```markdown

### 📂 Folder Overview:

- **`way-of-working.md`**: Main process documentation – the starting point to understand the full workflow
- **`getting-started.md`**: This guide – essential information to get started with the framework
- **`how-to/`**: Step-by-step guides for each development phase and LLM collaboration
  - Process guides (01-11): Operational documentation for each phase
- **`assets/`**: Templates, checklists, and document examples (e.g., PRD, bootstrap checklist)
- **`adoption/`**: Product requirements and technical adoption documents
  - `product/`: Product requirements and subdomain guidelines
  - `tech/`: Currently adopted technical standards and practices
- **`guidelines/`**: Technical guidelines organized by theme
  - `architecture/`: System architecture patterns and ADR processes
  - `code-design/`: Code design and development standards
  - `collaboration/`: Process workflows, project management, and team collaboration
  - `infrastructure/`: Infrastructure and deployment guidelines
  - `observability/`: Monitoring and observability practices
  - `quality-assurance/`: Quality criteria, accessibility, performance, security
  - `technical-standards/`: Technical standards and coding practices
  - `testing/`: Testing strategies and automation
  - `user-experience/`: UX/UI design guidelines and principles

### 🎯 Quick Start

1. **Read** `way-of-working.md` to understand the development process
2. **Adapt** technical guidelines in `guidelines/` folder to your technology stack
3. **Follow** the process guides in `how-to/` folder for each development phase

### 🚨 Critical: Technical Guidelines Setup

Before development, **review and adapt** all documents in the `guidelines/` and `adoption/tech/` folders to match your specific technology stack and requirements. These are templates with opinionated choices that need customization.

### 💡 How It Works

- 🤖🤝👨‍💻 **LLM + Human Review**: AI proposes, developer validates
- 👨‍💻💡🤖 **Human + AI Support**: Developer leads, AI assists
- 🤖⚡ **AI Autonomous**: Full AI execution until completion
- 👨‍💻 **Human Only**: Developer-exclusive activities

Happy AI-Human pairing! 🚀🤖👨‍💻

````
