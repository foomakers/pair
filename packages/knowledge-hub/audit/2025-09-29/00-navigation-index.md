# Knowledge Base Navigation Index

**Version:** 2025-09-29  
**Status:** 3-Level Structure (Planned)  
**Scope:** AI-Assisted Development Resources

## Overview

This knowledge base provides comprehensive documentation for AI-assisted software development, organized into a 3-level hierarchy for optimal discoverability and maintenance.

## Current Structure (Flat - To Be Reorganized)

### 📚 Quick Access - Current Files

**Getting Started:**
- [Getting Started Guide](getting-started.md) - Project onboarding and initial setup
- [Way of Working](way-of-working.md) - Development methodology and processes

**Complete How-To Guides (13):**
- [01: Create PRD](how-to/01-how-to-create-PRD.md) - Product Requirements Document
- [02: Bootstrap Checklist](how-to/02-how-to-complete-bootstrap-checklist.md) - Project setup
- [03: Create Initiatives](how-to/03-how-to-create-and-prioritize-initiatives.md) - Strategic planning
- [04: Define Subdomains](how-to/04-how-to-define-subdomains.md) - Domain modeling
- [05: Define Bounded Contexts](how-to/05-how-to-define-bounded-contexts.md) - Architecture boundaries
- [06: Breakdown Epics](how-to/06-how-to-breakdown-epics.md) - Epic decomposition
- [07: Breakdown User Stories](how-to/07-how-to-breakdown-user-stories.md) - Story creation
- [08: Refine User Story](how-to/08-how-to-refine-a-user-story.md) - Story refinement
- [09: Create Tasks](how-to/09-how-to-create-tasks.md) - Task breakdown
- [10: Implement Task](how-to/10-how-to-implement-a-task.md) - **Development implementation**
- [11: Commit and Push](how-to/11-how-to-commit-and-push.md) - Git workflow
- [12: Create PR](how-to/12-how-to-create-a-pr.md) - Pull request process
- [13: Code Review](how-to/13-how-to-code-review.md) - Review guidelines

**Technical Guidelines (26):**
- [Guidelines Index](guidelines/README.md) - Complete guidelines overview
- [01: Architecture](guidelines/01-architectural-guidelines.md) - System design patterns
- [02: Code Design](guidelines/02-code-design-guidelines.md) - Code organization
- [03: Technical Standards](guidelines/03-technical-guidelines.md) - Technical practices
- [04: Infrastructure](guidelines/04-infrastructure-guidelines.md) - Infrastructure setup
- [05: UX Guidelines](guidelines/05-ux-guidelines.md) - User experience standards
- [06: Definition of Done](guidelines/06-definition-of-done.md) - **Quality criteria**
- [07: Testing Strategy](guidelines/07-testing-strategy.md) - **Testing approach**
- [08: Accessibility](guidelines/08-accessibility-guidelines.md) - Accessibility standards
- [09: Performance](guidelines/09-performance-guidelines.md) - Performance standards
- [10: Security](guidelines/10-security-guidelines.md) - Security practices
- [11: Observability](guidelines/11-observability-guidelines.md) - Monitoring and logging
- [12: Collaboration](guidelines/12-collaboration-and-process-guidelines/README.md) - **Process framework**

**Assets & Templates (8):**
- [Bootstrap Checklist](assets/bootstrap-checklist.md) - Setup checklist template
- [PRD Example](assets/PRD_example.md) - Product requirements example
- [PRD Template](assets/PRD_template.md) - Product requirements template
- [Collaboration Assets](guidelines/12-collaboration-and-process-guidelines/assets/) - Work item templates

---

## Planned 3-Level Structure

The knowledge base will be reorganized into the following 3-level hierarchy:

### Level 1: Theme Folders

#### 🚀 **getting-started/** - Project Onboarding
*Quick start guides and initial setup procedures*

#### 🏗️ **architecture/** - System Design  
*Architectural guidelines, patterns, and bounded contexts*

#### 💻 **development/** - Code & Implementation
*Development practices, testing, and technical standards*

#### 🤝 **collaboration/** - Process & Workflow
*Project management, reviews, and team coordination*

#### ✅ **quality/** - Standards & Assurance
*Quality criteria, accessibility, performance, and security*

#### 🔧 **operations/** - Infrastructure & Monitoring
*Infrastructure setup, observability, and operational practices*

#### 📋 **assets/** - Templates & Resources
*Reusable templates, examples, and reference materials*

### Level 2: Theme READMEs
Each theme folder contains a `README.md` that:
- Lists practices within the theme (short descriptions)
- Links to Level 3 practice files
- Includes minimal assistant context hints (1-2 lines)

### Level 3: Practice Files  
Individual practice files containing:
- Detailed implementation guidance
- Tool-specific instructions
- Examples and templates
- Links to related practices

## Migration Progress

**Current Status:** Planning Phase
- [x] Audit completed (`packages/knowledge-hub/audit/2025-09-29/`)
- [x] Index structure defined (this file)
- [ ] Mapping JSONs prepared
- [ ] 3-level migration executed
- [ ] Link validation completed
- [ ] Root `.pair` synchronization

## Navigation Tips

1. **For Quick Reference:** Use the "Current Files" links above
2. **For Comprehensive Guidance:** Follow the how-to sequence (01-13)
3. **For Technical Standards:** Start with guidelines overview
4. **For AI Assistants:** Focus on bolded items (Definition of Done, Testing Strategy, Process Framework, Implementation)

## Related Resources

- **Repository:** `packages/knowledge-hub/` - This knowledge base package
- **Main Documentation:** `.pair/` - Working copy (synced from this source)
- **Adoption Docs:** `.pair/adoption/` - Repository-specific configurations
- **Migration Audit:** `packages/knowledge-hub/audit/2025-09-29/` - Reorganization documentation

---

*This index will be updated as the 3-level restructuring progresses. Current structure remains functional during migration.*
