# Strategic Subdomain Definition Guide

Comprehensive guide for identifying, classifying, and defining business subdomains using Domain-Driven Design strategic principles.

## Purpose

Provide systematic methodology for subdomain identification and classification to establish clear business domain boundaries, prioritize development efforts, and align technical implementation with business value.

## Strategic Subdomain Framework

### Subdomain Categories

All subdomains can be classified into three strategic categories that drive development priorities and architectural decisions:

#### Core Domains

**Definition**: Makes an organization unique and different from competitors. The source of competitive advantage.

**Characteristics**:

- High business value and strategic importance
- Requires exceptional execution quality
- Cannot be outsourced or commoditized
- Differentiates the organization in the market
- Deserves highest priority, biggest effort, and best developers

**Implementation Strategy**:

- Build from scratch with custom solutions
- Invest in deep domain expertise
- Apply rigorous quality standards
- Continuous innovation and improvement

**Example**: For an EMR system specializing in efficiency through innovative scheduling, the scheduling subdomain becomes core domain.

#### Supporting Subdomains

**Definition**: Necessary for business operations but not a source of competitive advantage. Business-specific but not strategically differentiating.

**Characteristics**:

- Moderate business value and complexity
- Required for core domain success
- Business-specific customization needed
- Important but not competitively differentiating

**Implementation Strategy**:

- Start with existing solutions and customize
- Build on proven frameworks and platforms
- Focus on operational efficiency
- Adequate quality for business needs

**Example**: Patient record management in an EMR system - essential but typically not the competitive differentiator.

#### Generic Subdomains

**Definition**: Commodity functions that don't contain organization-specific logic but are needed for the overall solution.

**Characteristics**:

- Low strategic value but operational necessity
- Industry-standard functionality
- No business differentiation required
- Cost optimization focus

**Implementation Strategy**:

- Use off-the-shelf software solutions
- Minimize custom development
- Focus on integration and configuration
- Evaluate build vs. buy carefully

**Example**: User identity management, file archive systems, email notifications.

### Context-Dependent Classification

**Important**: The same functionality can fall into different categories depending on the organization's business model:

- **Identity Management**: Core domain for auth providers, generic for CRM companies
- **Payment Processing**: Core for fintech, supporting for e-commerce, generic for content platforms
- **Scheduling**: Core for appointment systems, supporting for general business apps

## Subdomain Identification Process

### 1. Domain Analysis

**Business Capability Extraction**:

- Analyze core business processes and workflows
- Identify distinct functional areas
- Map organizational units to capabilities
- Understand value chain and business model

**Strategic Priority Assessment**:

- Evaluate competitive differentiation potential
- Assess business complexity and importance
- Consider organizational expertise and investment
- Review market positioning and strategy

### 2. Boundary Definition

**Functional Cohesion**:

- Group related business capabilities
- Identify natural seams in business processes
- Consider data ownership patterns
- Evaluate change frequency and drivers

**Independence Criteria**:

- Assess autonomous operation potential
- Consider separate development team viability
- Evaluate independent deployment requirements
- Review distinct stakeholder groups

### 3. Classification Decision Matrix

| Factor              | Core                       | Supporting                   | Generic               |
| ------------------- | -------------------------- | ---------------------------- | --------------------- |
| **Strategic Value** | High competitive advantage | Business necessity           | Commodity function    |
| **Complexity**      | High business complexity   | Moderate complexity          | Standard/Simple       |
| **Customization**   | Extensive custom logic     | Some business-specific needs | Minimal customization |
| **Investment**      | Maximum resources          | Adequate resources           | Cost minimization     |
| **Quality**         | Exceptional standards      | Business adequate            | Industry standard     |
| **Innovation**      | Continuous improvement     | Periodic enhancement         | Stability focus       |

## Practical Examples

### EMR System Case Study

**Domain**: Electronic Medical Records for smaller clinics

**Identified Subdomains**:

1. **Patient Records** (Core)

   - **Rationale**: Central to EMR value proposition
   - **Complexity**: High - medical data, privacy, workflows
   - **Differentiation**: Core business capability

2. **Scheduling** (Core or Supporting - depends on strategy)

   - **Core if**: Innovative scheduling is competitive advantage
   - **Supporting if**: Standard appointment management
   - **Decision Factor**: Business strategy and market positioning

3. **Lab Integration** (Core or Supporting - depends on strategy)

   - **Core if**: Seamless lab integration is key differentiator
   - **Supporting if**: Standard lab connectivity
   - **Decision Factor**: Integration complexity and business value

4. **File Archive** (Generic)

   - **Rationale**: Standard document storage functionality
   - **Strategy**: Use existing cloud storage solutions
   - **Focus**: Cost optimization and reliability

5. **Identity Management** (Generic)
   - **Rationale**: Standard user authentication and authorization
   - **Strategy**: Leverage existing identity providers
   - **Focus**: Security compliance and cost efficiency

### E-Commerce Platform Example

**Domain**: Online retail platform

**Potential Subdomains**:

- **Product Catalog** (Core/Supporting - depends on differentiation)
- **Order Management** (Core - if complex fulfillment is advantage)
- **Customer Management** (Supporting - business-specific but not differentiating)
- **Payment Processing** (Generic - use payment providers)
- **Inventory Management** (Supporting - business rules but not competitive)
- **Notifications** (Generic - standard communication)

## Implementation Guidelines

### Development Prioritization

1. **Phase 1**: Core Domains

   - Allocate best developers and maximum resources
   - Focus on business domain expertise development
   - Implement comprehensive testing and quality assurance
   - Plan for continuous evolution and improvement

2. **Phase 2**: Supporting Subdomains

   - Balance efficiency with business requirements
   - Leverage existing frameworks and platforms
   - Focus on integration with core domains
   - Implement adequate quality and monitoring

3. **Phase 3**: Generic Subdomains
   - Evaluate market solutions thoroughly
   - Minimize custom development investment
   - Focus on configuration and integration
   - Optimize for cost and operational efficiency

### Team Allocation Strategy

**Core Domains**:

- Senior developers with domain expertise
- Product managers with deep business knowledge
- Architecture specialists for complex patterns
- Dedicated quality assurance resources

**Supporting Subdomains**:

- Mid-level developers with business understanding
- Shared product management resources
- Standard development practices
- Automated testing focus

**Generic Subdomains**:

- Junior developers for integration work
- Configuration and administration focus
- Vendor relationship management
- Cost optimization expertise

## Relationship Patterns

### Dependency Analysis

**Upstream Dependencies**:

- Core domains typically depend on supporting and generic
- Supporting subdomains depend on generic subdomains
- Minimize dependencies between core domains

**Data Flow Patterns**:

- Events from core to supporting domains
- Configuration from generic to supporting/core
- Business data primarily within core domains

**Integration Complexity**:

- **High**: Core-to-core relationships (minimize)
- **Medium**: Core-to-supporting relationships (optimize)
- **Low**: Generic integrations (standardize)

## Validation Checklist

### Strategic Alignment

- [ ] Subdomain classification aligns with business strategy
- [ ] Core domains reflect competitive differentiation
- [ ] Supporting subdomains enable core domain success
- [ ] Generic subdomains minimize development cost

### Boundary Quality

- [ ] Clear functional boundaries between subdomains
- [ ] Minimal coupling between subdomains
- [ ] Independent development and deployment potential
- [ ] Distinct stakeholder groups for each subdomain

### Implementation Viability

- [ ] Resource allocation matches subdomain classification
- [ ] Technology strategy appropriate for each category
- [ ] Team structure supports subdomain ownership
- [ ] Evolution path planned for changing business needs

## Related Patterns

- **[Domain-Driven Design](domain-driven-design.md)** - Overall DDD principles and tactical patterns
- **[Bounded Contexts](bounded-contexts.md)** - Technical implementation boundaries for subdomains
- **[Integration Patterns](integration-patterns.md)** - Communication patterns between subdomains
- **[System Design](system-design.md)** - High-level architecture considerations

## References

### Core Resources

- **Domain-Driven Design** by Eric Evans - Original DDD principles
- **Implementing Domain-Driven Design** by Vaughn Vernon - Practical implementation guidance
- **Strategic Domain-Driven Design** by Vaadin - Practical examples and classification guidance

### Decision Framework

- **[Architecture Decision Records](.pair/knowledge/guidelines/architecture/decision-frameworks/README.md)** - Document subdomain classification decisions
- **[Code Design Guidelines](.pair/knowledge/guidelines/code-design/README.md)** - Implementation patterns for subdomain boundaries
