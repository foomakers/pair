# AI-Assisted Development Template

This repository serves as a template for AI-assisted development projects, providing a structured approach to collaboration between AI tools and human developers.

## 🚀 Quick Start

1. **Clone this repository**

   ```bash
   git clone <repository-url>
   cd <project-name>
   ```

2. **Review the AI development process**

   - Check out the comprehensive guides in `.pair/how-to/`
   - Understand the way of working in `.pair/way-of-working.md`

3. **Define your project**
   - Start with the getting started guide in `.pair/getting-started.md`

## 📁 Structure

```
├── .pair/                          # AI-specific files and configurations
│   ├── how-to/                      # Development process documentation
│   ├── product/                   # Product requirements and PRD
│   ├── prompts/                   # Reusable prompts and templates
│   ├── tech/                      # Technical guidelines and standards
│   └── way-of-working.md         # Process and collaboration guidelines
├── examples/                      # Example implementations and templates
├── package.json                   # Project configuration (supports workspaces)
└── README.md                     # This file
```

## 🤖 AI Integration

This template is designed to work seamlessly with:

- **Claude** (Anthropic)
- **Cursor** IDE
- **GitHub Copilot**
- **VS Code with Copilot**

All AI tools can reference the comprehensive documentation in `.pair/how-to/` and technical guidelines in `.pair/tech/` to understand your project's specific requirements and constraints.

## 📋 Development Process

1. **Strategic Preparation** → Define PRD and architecture in `.pair/product/` and `.pair/tech/`
2. **Initiative Planning** → Break down using guides in `.pair/how-to/`
3. **AI-Assisted Development** → Collaborate with AI tools using established patterns
4. **Quality Assurance** → Follow definition of done in `.pair/tech/knowledge-base/06-definition-of-done.md`

See `.pair/way-of-working.md` for detailed process guidelines.

## 🛠 Getting Started with Development

1. **Setup your project foundation**

   - Start with the PRD template in `.pair/product/PRD.md`
   - Review all technical guidelines in `.pair/tech/`

2. **Create your workspace structure**

   - Add an `apps/` folder for application code (monorepo structure)
   - Add a `packages/` folder for shared libraries
   - Use the examples in the `examples/` folder as reference

3. **Follow the development process**
   - Use the guides in `.pair/how-to/` for breaking down work
   - Follow the technical standards in `.pair/tech/knowledge-base/`
   - Ensure all work meets the criteria in `.pair/tech/knowledge-base/06-definition-of-done.md`

## 📚 Documentation

- [Development Process Guides](.pair/how-to/) – Step-by-step guides for breaking down work
- [Product Requirements](.pair/product/PRD.md) – Template for defining product requirements
- [Technical Guidelines](.pair/tech/knowledge-base/) – Comprehensive technical standards and best practices
- [Way of Working](.pair/way-of-working.md) – Process and collaboration guidelines
