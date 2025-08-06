# Getting Started - AI-Human Pairing Repository

Welcome to the AI-Human pairing repository template! This guide provides essential information to start using this framework for collaborative software development.

## 📁 Essential Folders

```
.pair/
├── way-of-working.md          # 📋 Main process (START HERE!)
├── getting-started.md         # 🚀 This guide
├── how-to/                      # 📚 Process guides for each development
│   ├── 01-how-to-create-PRD_TBD.md
│   ├── 02-how-to-create-and-prioritize-initiatives_TBD.md
│   ├── 03-how-to-complete-bootstrap-checklist_TBD.md
│   ├── 04-how-to-define-subdomains_TBD.md
│   ├── 05-how-to-define-bounded-contexts_TBD.md
│   ├── 06-how-to-breakdown-epics_TBD.md
│   ├── 07-how-to-breakdown-user-stories_TBD.md
│   ├── 08-how-to-refine-a-user-story_TBD.md
│   ├── 10-how-to-implement-a-task_TBD.md
│   ├── 11-how-to-code-review_TBD.md
│   ├── 12-how-to-commit-and-push_TBD.md
│   ├── 13-how-to-create-a-pr_TBD.md
│   ├── PRD_example.md
│   ├── PRD_template.md
│   └── _assets_structure.md
├── product/                   # 💼 Product requirements and backlog
│   ├── PRD.md
│   └── backlog/
│       ├── epics/
│       ├── initiatives/
│       └── stories/
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
    │   └── README.md
    └── adopted/                # Adopted standards and practices
        ├── architecture.md
        ├── README.md
        ├── infrastructure.md
        ├── tech-stack.md
        ├── ux-ui.md
        ├── way-of-working.md
        └── work-practices.md
```

### 📂 Folder Overview:

- **`way-of-working.md`**: Main process documentation - the starting point to understand the entire workflow
- **`getting-started.md`**: This guide - essential information to get started with the framework
- **`how-to/`**: Step-by-step guides for collaborating with LLM at each development phase
  - Process guides (01-12): How-to documentation for each development phase
  - `PRD_example.md` & `PRD_template.md`: Product Requirements Document templates
  - `_assets_structure.md`: Asset organization guidelines
- **`product/`**: Product Requirements Document (PRD) and backlog items
  - `PRD.md`: Main Product Requirements Document
  - `backlog/`: Organized backlog with epics, initiatives, and stories folders
- **`prompts/`**: Optimized prompt templates for different development tasks
- **`tech/`**: Technical guidelines, architectural standards, and quality criteria
  - `adr/`: Architecture Decision Records
  - `knowledge-base/`: Comprehensive technical guidelines (01-11)
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
