# Methodology Selection Framework

## Overview

Systematic methodology selection through context-aware evaluation, adaptive implementation, and continuous optimization that ensures teams adopt the most effective working approaches based on project characteristics, team dynamics, and organizational constraints.

## Scope

This framework covers:

- Project management methodology selection and implementation guidance
- Agile methodologies (Scrum, Kanban) for iterative development
- Traditional methodologies (Waterfall) for structured environments
- Lean methodologies for efficiency optimization
- Enterprise frameworks (SAFe) for large-scale coordination
- Methodology selection criteria and decision frameworks

## Out of Scope

This framework does not cover:

- Technical implementation methodologies (covered in technical standards)
- Architecture methodology frameworks (covered in architecture guidelines)
- Quality assurance methodologies (covered in quality assurance)
- Change management methodologies (covered in project management)

## Directory Contents

**[kanban.md](kanban.md)** - Kanban methodology implementation for project management

**[lean.md](lean.md)** - Lean methodology implementation for project management

**[less.md](less.md)** - Large-Scale Scrum (LeSS) framework for scaling agile across multiple teams

**[safe.md](safe.md)** - Scaled Agile Framework (SAFe) implementation for enterprise project management

**[scrum.md](scrum.md)** - Scrum methodology implementation for project management

**[waterfall.md](waterfall.md)** - Waterfall methodology implementation for project management

## Introduction to Methodology Selection Excellence

### Comprehensive Methodology Selection Framework

The selection of an appropriate project management methodology is a critical decision that impacts team productivity, project success, and organizational effectiveness. Our comprehensive framework provides systematic guidance for evaluating methodologies based on project characteristics, organizational context, and team capabilities.

## Decision Framework

### Project Characteristics Assessment

#### Requirements Stability

```text
High Stability (Waterfall-friendly):
- Well-defined, documented requirements
- Minimal expected changes during development
- Clear regulatory or compliance requirements
- Established business processes and workflows

Medium Stability (Hybrid approaches):
- Core requirements defined with some unknowns
- Expected refinement but not major changes
- Some regulatory constraints with flexibility
- Mix of known and exploratory elements

Low Stability (Agile-friendly):
- Evolving or unclear requirements
- High likelihood of significant changes
- Innovation or research-oriented projects
- Customer feedback-driven development
```

#### Project Complexity

```text
Low Complexity:
- Single team or small project
- Well-understood technology and domain
- Minimal dependencies and integrations
- Straightforward technical implementation

Medium Complexity:
- Multiple teams or moderate scale
- Some new technology or domain challenges
- Moderate dependencies and coordination needs
- Standard integration requirements

High Complexity:
- Large-scale, enterprise-wide projects
- Cutting-edge technology or domain
- Complex dependencies and coordination
- Extensive integration and system impacts
```

#### Timeline and Budget Constraints

```text
Fixed Constraints (Waterfall/Traditional):
- Non-negotiable deadlines (regulatory, events)
- Fixed budget with limited flexibility
- Contractual commitments with penalties
- Resource constraints requiring predictability

Flexible Constraints (Agile/Iterative):
- Value-driven delivery priorities
- Budget flexibility for optimization
- Timeline adaptable based on learning
- Resource allocation can be adjusted

Time-to-Market Critical (Lean/Kanban):
- Competitive market pressures
- First-mover advantage opportunities
- Continuous delivery and improvement
- Flow optimization over resource efficiency
```

### Organizational Context

#### Culture and Maturity

```text
Traditional/Hierarchical Organizations:
- Formal governance and approval processes
- Risk-averse decision making culture
- Structured roles and responsibilities
- Documentation and audit requirements
→ Waterfall, SAFe, or Hybrid approaches

Collaborative/Innovative Organizations:
- Experimental and learning-oriented culture
- Distributed decision making authority
- Cross-functional collaboration emphasis
- Rapid adaptation and change capability
→ Scrum, Kanban, or Lean approaches

Scaling Organizations:
- Multiple teams requiring coordination
- Mix of traditional and agile practices
- Need for standardization and alignment
- Enterprise governance requirements
→ SAFe, LeSS, or scaled agile frameworks
```

#### Team Characteristics

```text
Co-located, Experienced Teams:
- High collaboration and communication
- Domain and technology expertise
- Self-organizing capability
- Trust and psychological safety
→ Scrum, XP, or team-centric approaches

Distributed or Mixed-Experience Teams:
- Remote or multiple location coordination
- Variable skill levels and experience
- Need for structure and guidance
- Communication and coordination challenges
→ Kanban, Waterfall, or structured approaches

Large, Multi-disciplinary Teams:
- Coordination across multiple specialties
- Different working styles and preferences
- Need for standardization and alignment
- Complex dependency management
→ SAFe, portfolio management approaches
```

## Methodology Comparison Matrix

### Decision Matrix

| Criteria                   | Waterfall | Scrum | Kanban | Lean | LeSS | SAFe | Weight |
| -------------------------- | --------- | ----- | ------ | ---- | ---- | ---- | ------ |
| **Requirements Stability** | 9         | 3     | 5      | 4    | 3    | 6    | 20%    |
| **Change Tolerance**       | 2         | 9     | 8      | 9    | 9    | 7    | 18%    |
| **Team Size/Complexity**   | 6         | 7     | 8      | 6    | 9    | 9    | 15%    |
| **Time to Market**         | 4         | 8     | 9      | 9    | 8    | 6    | 15%    |
| **Predictability Needs**   | 9         | 6     | 5      | 4    | 6    | 7    | 12%    |
| **Quality Focus**          | 7         | 8     | 6      | 9    | 8    | 8    | 10%    |
| **Learning/Innovation**    | 3         | 9     | 7      | 8    | 9    | 6    | 10%    |

#### Scoring Guide:

- 9: Excellent fit for this criterion
- 7-8: Good fit with minor limitations
- 5-6: Moderate fit, may require adaptation
- 3-4: Poor fit, significant challenges
- 1-2: Very poor fit, not recommended

### Methodology Profiles

#### Waterfall Profile

```text
Best For:
- Stable, well-defined requirements
- Regulatory or compliance-driven projects
- Fixed budget and timeline constraints
- Formal governance requirements
- Mature technology and established practices

Challenges:
- Limited flexibility for changes
- Late feedback and validation
- High risk if requirements unclear
- Difficulty with innovation projects

Success Factors:
- Comprehensive upfront planning
- Strong requirements analysis
- Experienced project management
- Stakeholder commitment and sign-off
```

#### Scrum Profile

```text
Best For:
- Product development with evolving requirements
- Innovation and exploration projects
- Customer feedback-driven development
- Cross-functional team collaboration
- Learning and adaptation emphasis

Challenges:
- Requires dedicated Product Owner
- May struggle with fixed deadlines
- Needs organizational culture change
- Scaling challenges for large projects

Success Factors:
- Strong Product Owner and Scrum Master
- Team empowerment and autonomy
- Regular stakeholder engagement
- Commitment to continuous improvement
```

#### Kanban Profile

```text
Best For:
- Continuous flow and delivery focus
- Support and maintenance work
- Varied work item types and priorities
- Improvement of existing processes
- Minimal process change requirements

Challenges:
- Limited planning and predictability
- May lack urgency without timeboxes
- Requires discipline for WIP limits
- Less guidance for new teams

Success Factors:
- Visual management and transparency
- Flow measurement and optimization
- Continuous improvement culture
- Clear policies and work standards
```

#### Lean Profile

```text
Best For:
- Waste elimination and efficiency focus
- Process optimization and improvement
- Value stream analysis and enhancement
- Operational excellence initiatives
- Continuous improvement culture

Challenges:
- Requires long-term commitment
- Cultural change can be difficult
- May sacrifice speed for optimization
- Needs management support

Success Factors:
- Leadership commitment to lean principles
- Employee engagement and empowerment
- Systematic waste identification
- Continuous learning and adaptation
```

#### LeSS Profile

```text
Best For:
- Large product development (2-8+ teams)
- Scaling Scrum while maintaining simplicity
- Feature teams over component teams
- Whole product focus with single Product Owner
- Organizations wanting agility at scale

Challenges:
- Requires organizational design changes
- Feature team formation complexity
- Single Product Owner scaling limits
- Cultural shift from traditional structures
- Initial coordination overhead

Success Factors:
- Strong organizational commitment to change
- Feature team formation and training
- Effective Product Owner with broad knowledge
- Technical practices for integration
- Continuous improvement culture
```

#### SAFe Profile

```text
Best For:
- Large-scale enterprise projects
- Multiple team coordination needs
- Mix of traditional and agile practices
- Compliance and governance requirements
- Portfolio and program management

Challenges:
- Complex framework requiring training
- Can be heavy for smaller projects
- Requires significant organizational change
- Risk of losing agility through structure

Success Factors:
- Strong leadership and change management
- Comprehensive training and coaching
- Clear roles and responsibilities
- Regular communication and alignment
```

## Selection Process

### Step 1: Project Assessment

#### Requirements Analysis

```text
Assessment Questions:
1. How well-defined are the requirements?
   - Completely specified and stable
   - Mostly defined with some unknowns
   - High-level vision with details to emerge
   - Completely exploratory and experimental

2. What is the expected level of change?
   - Minimal changes expected
   - Some refinement anticipated
   - Significant evolution likely
   - Constant adaptation required

3. How critical is predictability?
   - Fixed commitments and deadlines
   - Moderate predictability needs
   - Flexibility more important than predictability
   - Optimization over prediction
```

#### Complexity Analysis

```text
Complexity Factors:
□ Number of teams involved (1, 2-5, 6-20, 20+)
□ Technology novelty (proven, established, emerging, cutting-edge)
□ Domain familiarity (expert, experienced, some knowledge, new)
□ Integration complexity (standalone, few systems, many systems, enterprise-wide)
□ Stakeholder complexity (single, few, many, complex ecosystem)
□ Regulatory requirements (none, minimal, moderate, extensive)
□ Geographic distribution (co-located, single time zone, multiple zones, global)
```

### Step 2: Organizational Assessment

#### Culture and Readiness

```text
Cultural Assessment:
1. Decision Making Style:
   - Hierarchical and centralized
   - Delegated with clear authority
   - Collaborative and consensus-based
   - Distributed and empowered

2. Change Tolerance:
   - Formal change management required
   - Managed change with approvals
   - Adaptive change with guidance
   - Continuous adaptation expected

3. Risk Tolerance:
   - Risk-averse with extensive mitigation
   - Calculated risks with management
   - Moderate risk tolerance
   - High risk tolerance for innovation

4. Learning Orientation:
   - Stability and proven practices preferred
   - Incremental improvement focus
   - Active learning and experimentation
   - Innovation and breakthrough focus
```

#### Capability Assessment

```text
Team and Organizational Capabilities:
□ Project management experience and maturity
□ Agile and lean methodology experience
□ Change management and coaching capabilities
□ Tool and technology infrastructure
□ Training and development resources
□ Leadership support and commitment
□ Cross-functional collaboration skills
□ Customer and stakeholder engagement ability
```

### Step 3: Methodology Selection

#### Selection Algorithm

```text
Primary Selection Criteria:
1. Requirements Stability → Agile vs. Traditional approach
2. Organizational Scale → Team-level vs. Enterprise frameworks
3. Change Tolerance → Iterative vs. Sequential approaches
4. Complexity → Structured vs. Flexible frameworks

Decision Tree:
Requirements Stable?
├─ Yes → Consider Waterfall, V-Model, or Hybrid
└─ No → Continue to Agile Assessment

Large Scale/Multiple Teams?
├─ Yes → Continue to Scale Assessment
│   ├─ 2-8 Teams with Product Focus? → Consider LeSS
│   ├─ 8+ Teams or Multiple Products? → Consider LeSS Huge
│   └─ Enterprise with Portfolio Needs? → Consider SAFe
└─ No → Consider Team-level approaches

Focus on Flow vs. Iterations?
├─ Flow → Consider Kanban or Lean approaches
└─ Iterations → Consider Scrum or XP approaches

High Compliance/Governance Needs?
├─ Yes → Consider SAFe or Disciplined Agile
└─ No → Consider pure Agile approaches (Scrum, LeSS)
```

#### Scoring and Ranking

```text
Weighted Scoring Process:
1. Define project-specific criteria weights
2. Score each methodology against criteria (1-9 scale)
3. Calculate weighted scores for each methodology
4. Rank methodologies by total weighted score
5. Consider top 2-3 methodologies for detailed analysis

Example Calculation:
Methodology Score = Σ(Criterion Score × Criterion Weight)

Scrum Example:
- Requirements Stability: 3 × 0.20 = 0.60
- Change Tolerance: 9 × 0.18 = 1.62
- Team Size: 7 × 0.15 = 1.05
- Time to Market: 8 × 0.15 = 1.20
- Predictability: 6 × 0.12 = 0.72
- Quality Focus: 8 × 0.10 = 0.80
- Innovation: 9 × 0.10 = 0.90
Total Score: 6.89

LeSS Example:
- Requirements Stability: 3 × 0.20 = 0.60
- Change Tolerance: 9 × 0.18 = 1.62
- Team Size: 9 × 0.15 = 1.35
- Time to Market: 8 × 0.15 = 1.20
- Predictability: 6 × 0.12 = 0.72
- Quality Focus: 8 × 0.10 = 0.80
- Innovation: 9 × 0.10 = 0.90
Total Score: 7.19
```

### Step 4: Implementation Planning

#### Transition Strategy

```text
Implementation Approaches:
1. Big Bang Transition:
   - Complete methodology change at once
   - High risk but potentially faster adoption
   - Requires extensive training and support
   - Best for small, motivated teams

2. Pilot and Scale:
   - Start with pilot team or project
   - Learn and adapt based on experience
   - Scale successful practices gradually
   - Lower risk with longer timeline

3. Evolutionary Transition:
   - Gradual introduction of new practices
   - Build on existing processes and culture
   - Continuous improvement and adaptation
   - Minimal disruption but slower change

4. Hybrid Implementation:
   - Combine elements from multiple methodologies
   - Adapt to specific organizational context
   - Balance different project and team needs
   - Requires careful design and governance
```

#### Success Factors

```text
Critical Success Elements:
□ Leadership commitment and support
□ Clear communication and change management
□ Adequate training and coaching resources
□ Pilot projects for learning and validation
□ Regular assessment and adaptation
□ Stakeholder engagement and buy-in
□ Infrastructure and tool support
□ Performance measurement and improvement
```

## Common Selection Scenarios

### Scenario-Based Recommendations

#### New Product Development

```text
Context: Innovative product with unclear market requirements
Characteristics:
- High uncertainty and exploration needed
- Customer feedback critical for success
- Time-to-market competitive advantage
- Cross-functional team collaboration required

Recommended Approach: Scrum or Lean Startup
- Short iterations for rapid learning
- Customer feedback integration
- MVP and iterative development
- Flexibility for pivot decisions

Alternative: Kanban for continuous flow
- Continuous delivery and feedback
- Flow optimization over planning
- Visual management of work
- Adaptive capacity management
```

#### Enterprise System Implementation

```text
Context: Large-scale ERP or infrastructure project
Characteristics:
- Multiple teams and stakeholder groups
- Compliance and governance requirements
- Complex integration and dependencies
- Fixed budget and timeline constraints

Recommended Approach: SAFe or Hybrid Waterfall-Agile
- Structured coordination across teams
- Governance and compliance framework
- Predictable delivery with flexibility
- Portfolio and program management

Alternative: LeSS for Product-Focused Development
- Large-scale Scrum scaling for product teams
- Single Product Owner with area focus (LeSS Huge)
- Feature teams over component teams
- Simplified scaling with agile principles
```

#### Large Product Development

```text
Context: Complex product with multiple development teams
Characteristics:
- 2-8+ teams working on same product
- Need for agile scaling without heavy process
- Single product vision and ownership
- Feature-oriented delivery over component delivery

Recommended Approach: LeSS or LeSS Huge
- Scaled Scrum with minimal additional process
- Single Product Owner for product coherence
- Feature teams for end-to-end delivery
- Simplified coordination mechanisms

Alternative: SAFe for Enterprise Context
- More structured approach with portfolio alignment
- Additional roles and ceremonies for governance
- Program and portfolio level planning
- Suitable for larger organizational context
```

#### Maintenance and Support

```text
Context: Ongoing support and enhancement work
Characteristics:
- Varied work types and priorities
- Continuous flow of requests
- Service level commitments
- Established processes and systems

Recommended Approach: Kanban
- Visual workflow management
- Work in progress limits
- Service level expectation management
- Continuous flow optimization

Alternative: Scrum for Enhancement Work
- Regular planning and review cycles
- Structured improvement initiatives
- Team collaboration and improvement
- Predictable delivery cadence
```

#### Regulated Industry Project

```text
Context: Healthcare, finance, or aerospace project
Characteristics:
- Strict regulatory and compliance requirements
- Extensive documentation and audit trails
- Quality and safety critical systems
- Formal approval and validation processes

Recommended Approach: V-Model or Disciplined Agile
- Structured verification and validation
- Comprehensive documentation
- Quality gates and approvals
- Risk management and mitigation

Alternative: SAFe with Compliance Focus
- Agile practices with governance
- Continuous compliance and quality
- Portfolio and program oversight
- Built-in quality and documentation
```

| **Delivery Cadence** | Continuous | Iterative | Milestone | Continuous | Planned  |
| **Process Overhead** | Low        | Medium    | High      | Low        | High     |
| **Documentation**    | Minimal    | Moderate  | Extensive | Minimal    | Moderate |
| **Predictability**   | Low        | Medium    | High      | Low        | Medium   |

### Methodology Selection Decision Tree

```text
Start: What are your project characteristics?

├── Team size > 50 people?
│   └── → Consider SAFe or Scaled Scrum
│
├── Fixed requirements with regulatory compliance?
│   └── → Use Waterfall methodology
│
├── High uncertainty with frequent changes?
│   ├── Small team (< 10 people)?
│   │   └── → Use Kanban or Lean
│   └── Medium team (10-50 people)?
│       └── → Use Scrum with short sprints
│
├── Continuous delivery focus?
│   └── → Use Kanban methodology
│
├── Product development with defined releases?
│   └── → Use Scrum methodology
│
└── Efficiency optimization primary goal?
    └── → Use Lean methodology
```

### Cost-Benefit Analysis

#### Kanban Methodology

#### Benefits:

- Low process overhead and immediate implementation
- High flexibility and adaptability to changing requirements
- Continuous flow and fast delivery cycles
- Visual management and transparency

#### Costs:

- Limited predictability for long-term planning
- Requires discipline for work-in-progress limits
- May lack structure for inexperienced teams
- Difficult integration with traditional project reporting

**Best ROI:** Small teams with continuous delivery needs

#### Scrum Methodology

#### Benefits:

- Proven framework with extensive community support
- Balanced structure and flexibility
- Regular inspection and adaptation cycles
- Clear roles and responsibilities

#### Costs:

- Requires team training and certification
- Ceremony overhead (meetings, planning sessions)
- May not suit all types of work
- Can become rigid if poorly implemented

**Best ROI:** Product development teams with iterative delivery

#### Waterfall Methodology

#### Benefits:

- High predictability and detailed planning
- Comprehensive documentation and traceability
- Clear phase gates and approval processes
- Good for compliance and regulatory requirements

#### Costs:

- Low adaptability to changing requirements
- Late feedback and validation cycles
- Higher risk of project failure
- Long time to market

**Best ROI:** Projects with stable requirements and compliance needs

#### Lean Methodology

#### Benefits:

- Focus on waste elimination and efficiency
- Fast learning cycles and rapid iteration
- Customer value optimization
- Minimal process overhead

#### Costs:

- Requires cultural change and mindset shift
- May lack structure for complex projects
- Difficult to scale to large teams
- Requires continuous improvement discipline

**Best ROI:** Efficiency-focused teams with optimization goals

#### SAFe Methodology

#### Benefits:

- Scales agile practices to enterprise level
- Coordinates multiple teams and dependencies
- Portfolio-level planning and alignment
- Proven patterns for large organizations

#### Costs:

- High implementation complexity and cost
- Extensive training and certification requirements
- Significant process overhead
- Risk of bureaucracy and reduced agility

**Best ROI:** Large enterprises with multiple coordinated teams

### Context-Based Recommendations

#### Small Teams (1-5 people)

**Primary Choice:** Kanban or Lean

- **Rationale:** Low overhead, maximum flexibility, continuous improvement focus
- **Best for:** Startups, small product teams, maintenance work
- **Implementation:** Simple board, WIP limits, regular retrospectives

#### Medium Teams (5-15 people)

**Primary Choice:** Scrum or Hybrid Kanban-Scrum

- **Rationale:** Structure without excessive overhead, proven effectiveness
- **Best for:** Product development, feature teams, established products
- **Implementation:** 2-week sprints, cross-functional teams, regular ceremonies

#### Large Teams (15+ people)

**Primary Choice:** SAFe or Scaled Scrum

- **Rationale:** Coordination mechanisms, dependency management, portfolio alignment
- **Best for:** Enterprise products, complex systems, multiple teams
- **Implementation:** Program increments, solution trains, portfolio planning

#### High Uncertainty Projects

**Primary Choice:** Lean + Kanban

- **Rationale:** Maximum flexibility, rapid learning, minimal waste
- **Best for:** Innovation projects, research, market exploration
- **Implementation:** Hypothesis-driven development, rapid prototyping, continuous feedback

#### Regulatory/Compliance Projects

**Primary Choice:** Waterfall with Agile elements

- **Rationale:** Documentation requirements, approval gates, audit trails
- **Best for:** Medical devices, financial systems, government projects
- **Implementation:** Phase gates with iterative development within phases

```bash
pair "Analyze team context and recommend optimal methodology with rationale"
pair "Evaluate current methodology effectiveness and suggest improvements"
pair "Generate methodology transition plan with timeline and milestones"
```

### Implementation Support

- **Transition Planning**: AI-assisted migration from current to recommended methodology
- **Training Recommendations**: Personalized learning paths for team members
- **Tool Selection**: Optimal tool recommendations based on methodology choice
- **Success Metrics**: KPI recommendations for methodology effectiveness

## Implementation Notes

Each methodology file includes:

- Core principles and practices
- Team roles and responsibilities
- Typical workflows and ceremonies
- Tool integration recommendations
- Success metrics and KPIs
- AI-assisted optimization techniques

## Related Topics

- **[Project Management Tools](../project-management-tool/README.md)**: Tool support for different methodologies
- **[Estimation](../estimation/README.md)**: Estimation approaches by methodology
- **[Board Management](../project-tracking/README.md)**: Board configuration for different methodologies
- Common pitfalls and mitigation strategies

## Related Topics

- **[../project-management-tool/](../project-management-tool/README.md)** - Tool implementations for each methodology
- **[../estimation/](../estimation/README.md)** - Estimation approaches by methodology
- **[.pair/knowledge/guidelines/collaboration/team/role-responsibilities.md](../team/role-responsibilities.md)** - Role definitions within methodologies

---

**Skill**: Use `/assess-methodology` to evaluate and adopt a methodology from these guidelines via the resolution cascade.
