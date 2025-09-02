# 📋 Adopted Standards & Practices

This directory contains the **adopted standards and practices** for the project. These documents serve as the authoritative source for all technical and process decisions, providing strict context for the AI assistant during vibecoding and development.

## 📁 Document Requirements

All adopted documents must:

- Be written in **English**
- Be **concise**: list only choices and decisions without explanations or rationale
- Reference the [knowledge-base](.pair/knowledge) for details, explanations, and background information
- Be **self-consistent** with compatible choices across library versions, user device targets, and deployment environments
- Be **strict and prescriptive** with no ambiguity or open interpretation
- Address all relevant points from the [bootstrap-checklist](.pair/knowledge/assets/bootstrap-checklist.md)

## 📁 Document Categories

### 🏗️ System Design

- **[architecture.md](architecture.md)** – Validated architectural decisions and system boundaries
- **[tech-stack.md](tech-stack.md)** – Technology stack components with exact versions

### 🚀 Implementation & Operations

- **[infrastructure.md](infrastructure.md)** – Infrastructure and deployment choices
- **[way-of-working.md](way-of-working.md)** – Development practices and team workflows

### 🎨 User Experience

- **[ux-ui.md](ux-ui.md)** – UX/UI patterns and design system choices

## 📝 Usage Guidelines

These documents are **decision records**, not guidelines:

- Contain only **validated choices** proposed by AI and approved by the team
- Must be **implemented as written** with full compliance required
- Reference the [knowledge-base](.pair/knowledge) for detailed explanations
- Must reflect the current project state and be kept up to date

## 🔄 Update Process

Standards are updated during specific development phases:

1. **Strategic Preparation**: Architecture and tech-stack updates
2. **Customer-Facing Iterations**: UX/UI and infrastructure updates
3. **Continuous Value Delivery**: Way of working and deployment updates

## 🔗 Related Documentation

### Knowledge Base

Detailed technical guidelines and explanations:

- [01-architectural-guidelines.md](.pair/knowledge/guidelines/01-architectural-guidelines.md)
- [02-code-design-guidelines.md](.pair/knowledge/guidelines/02-code-design-guidelines.md)
- [03-technical-guidelines.md](.pair/knowledge/guidelines/03-technical-guidelines.md)
- [04-infrastructure-guidelines.md](.pair/knowledge/guidelines/04-infrastructure-guidelines.md)
- [05-ux-guidelines.md](.pair/knowledge/guidelines/05-ux-guidelines.md)
- [06-definition-of-done.md](.pair/knowledge/guidelines/06-definition-of-done.md)
- [07-testing-strategy.md](.pair/knowledge/guidelines/07-testing-strategy.md)
- [08-accessibility-guidelines.md](.pair/knowledge/guidelines/08-accessibility-guidelines.md)
- [09-performance-guidelines.md](.pair/knowledge/guidelines/09-performance-guidelines.md)
- [10-security-guidelines.md](.pair/knowledge/guidelines/10-security-guidelines.md)
- [11-observability-guidelines.md](.pair/knowledge/guidelines/11-observability-guidelines.md)
- [README.md](.pair/knowledge/guidelines/README.md) – Knowledge Base Overview

### Additional Resources

- **[Bootstrap Checklist](.pair/knowledge/assets/bootstrap-checklist.md)** – Project Setup & Bootstrap Checklist with all relevant questions the adopted standards must address
- **[ADR](adr)** – Architecture Decision Records for significant changes
- **[Way of Working](.pair/knowledge/way-of-working.md)** – Development process and collaboration patterns
