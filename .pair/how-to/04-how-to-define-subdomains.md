# How to Define Subdomains

## Overview

This guide enables AI assistants to systematically identify and define business subdomains within a Domain-Driven Design (DDD) context, transforming product requirements and strategic initiatives into clear subdomain boundaries that drive architectural decisions and team organization.

**Key Benefits:**

- Establishes clear business domain boundaries based on PRD analysis and strategic initiatives
- Creates structured subdomain definitions that guide microservices architecture and team allocation
- Provides systematic approach to identify core, supporting, and generic subdomains
- Ensures alignment between business capabilities and technical implementation boundaries
- Enables effective bounded context definition for complex business domains
- Maintains subdomain evolution as new initiatives emerge

## AI Assistant Role Definition

The AI assistant acts as a **Strategic Domain Architect** with the following responsibilities:

- Analyze product requirements and strategic initiatives to extract business capabilities
- Identify subdomain boundaries based on business value, complexity, and strategic importance
- Classify subdomains into core, supporting, and generic categories
- Map relationships and dependencies between subdomains
- Facilitate collaborative validation with developers to ensure practical feasibility
- Generate comprehensive subdomain documentation that serves as foundation for bounded context definition
- Monitor initiative evolution to maintain subdomain relevance and accuracy

## **Issue Access and Tool Integration**

**⚠️ MANDATORY COMPLIANCE: These instructions must ALWAYS be followed without exception when accessing initiatives, epics, user stories, or tasks. NEVER deviate from this process.**

### **Access Protocol**

**Step 1: Tool Configuration Check**

1. **Read** [.pair/adoption/tech/way-of-working.md](.pair/adoption/tech/way-of-working.md) to identify configured project management tool
2. **If no tool configured**: **HALT PROCESS** and request bootstrap completion:

_"I cannot proceed because no project management tool is configured in [.pair/adoption/tech/way-of-working.md](.pair/adoption/tech/way-of-working.md). Complete bootstrap first: [How to Complete Bootstrap Checklist](./02-how-to-complete-bootstrap-checklist.md). Proceed with bootstrap now?"_

**Step 2: Follow Tool-Specific Instructions**

- **Consult** [Project Management Tool Guidelines](.pair/tech/knowledge-base/12-collaboration-and-process-guidelines/project-management-framework.md) for all access procedures
- **Use configured tool** as primary and authoritative source for all issue data

### **Filesystem Access Rules**

**✅ PERMITTED ONLY when:**

- Tool in [way-of-working.md](.pair/adoption/tech/way-of-working.md) = "filesystem"

**🚫 PROHIBITED when:**

- Any other tool is configured
- **DO NOT** read [.pair/adoption/product/backlog/](.pair/adoption/product/backlog/) directories
- **DO NOT** use filesystem as fallback

### **Validation Checklist**

- [ ] [way-of-working.md](.pair/adoption/tech/way-of-working.md) read and tool identified
- [ ] Tool configured (if not: halt and request bootstrap)
- [ ] [Project Management Tool Guidelines](.pair/tech/knowledge-base/12-collaboration-and-process-guidelines/project-management-framework.md) consulted for access procedures

## Step-by-Step Implementation Process

### Step 1: Business Context Analysis

**Objective**: Extract business capabilities and domain knowledge from existing product documentation.

**Process**:

1. **Analyze Product Requirements Document**:

   - Read [`.pair/product/adopted/PRD.md`](.pair/product/adopted/PRD.md) thoroughly
   - Extract business objectives, target users, and value propositions
   - Identify key business processes and workflows
   - Note compliance requirements and business constraints

2. **Review Strategic Initiatives**:

   - Examine all initiatives following configured project management tool access rules
   - Map initiatives to business capabilities
   - Identify cross-cutting concerns and shared functionalities
   - Understand strategic priorities and business growth plans

3. **Understand Way of Working**:
   - Review [`.pair/adoption/tech/way-of-working.md`](.pair/adoption/tech/way-of-working.md)
   - Understand team structure and organizational constraints
   - Identify development phases and delivery expectations
   - Consider operational and maintenance requirements

### Step 2: Initial Business Capability Mapping

**AI Assistant Instructions:** Analyze and extract business capabilities with systematic approach:

**Process**:

1. **Present initial capability analysis:**

_"Based on my analysis of your PRD and strategic initiatives, I've identified the following preliminary business capabilities:_

**Primary Business Capabilities** (from PRD analysis):
_- **[Capability 1]**: [Brief description based on PRD section X]_
_- **[Capability 2]**: [Brief description based on PRD section Y]_
_- **[Capability 3]**: [Brief description based on PRD section Z]_

**Supporting Capabilities** (from initiatives analysis):
_- **[Capability A]**: [Description from initiative file X]_
_- **[Capability B]**: [Description from initiative file Y]_

**Cross-Cutting Concerns** (identified patterns):
_- **[Concern 1]**: [Evidence from multiple sources]_
_- **[Concern 2]**: [Evidence from multiple sources]_

_These capabilities suggest [X] potential subdomains. Does this capability breakdown accurately reflect your business model, or have I missed any critical business functions?"_

2. **Handle capability feedback:**
   - If confirmed: Proceed to subdomain identification
   - If incomplete: Ask for specific missing capabilities
   - If misunderstood: Request clarification on business processes

### Step 3: Subdomain Identification and Initial Classification

**AI Assistant Instructions:** Systematically identify subdomains and create initial classification:

**Process**:

1. **Present comprehensive subdomain catalog:**

_"Based on the business capabilities analysis, I propose the following subdomain catalog with initial classifications and relationships:_

## **PROPOSED SUBDOMAIN CATALOG**

### **Core Subdomains** (High strategic value, competitive advantage)

_1. **[Core Subdomain 1]** - [One-line business purpose]_
_2. **[Core Subdomain 2]** - [One-line business purpose]_
_3. **[Core Subdomain 3]** - [One-line business purpose]_

### **Supporting Subdomains** (Business-specific, necessary for operations)

_4. **[Supporting Subdomain 1]** - [One-line business purpose]_
_5. **[Supporting Subdomain 2]** - [One-line business purpose]_
_6. **[Supporting Subdomain 3]** - [One-line business purpose]_

### **Generic Subdomains** (Commodity functions, industry standard)

_7. **[Generic Subdomain 1]** - [One-line business purpose]_
_8. **[Generic Subdomain 2]** - [One-line business purpose]_

## **SUBDOMAIN RELATIONSHIPS**

### **Primary Dependencies**

_- **[Core A] → [Supporting B]**: [Nature of dependency]_
_- **[Core A] → [Generic C]**: [Nature of dependency]_
_- **[Supporting B] → [Generic D]**: [Nature of dependency]_

### **Data Flow Patterns**

_- **[Subdomain X] ⟷ [Subdomain Y]**: [Bidirectional data exchange]_
_- **[Subdomain Z] → Multiple**: [Data provider pattern]_

### **Integration Complexity**

_- **High Coupling**: [Subdomains that require tight coordination]_
_- **Loose Coupling**: [Subdomains with minimal interaction]_
_- **Shared Services**: [Generic subdomains used by multiple others]_

_This catalog represents my understanding based on your PRD and initiatives. Please review:_

_1. **Missing Subdomains**: Are there business areas I haven't identified?_
_2. **Wrong Classifications**: Should any subdomain be reclassified (core/supporting/generic)?_
_3. **Incorrect Relationships**: Do the dependency patterns match your business reality?_
_4. **Boundary Issues**: Should any subdomains be merged or split?_

_What changes would you make to this subdomain catalog?"_

### Step 4: Subdomain Catalog Validation and Refinement

**AI Assistant Instructions:** Iterate on the catalog until developer approves the complete list:

**Process**:

1. **Handle catalog feedback systematically:**

_"Based on your feedback, I'll update the subdomain catalog:_

**CHANGES REQUESTED**:
_- **Add**: [New subdomain] - [Rationale for addition]_
_- **Remove**: [Subdomain to remove] - [Rationale for removal]_
_- **Reclassify**: [Subdomain] from [Old Type] to [New Type] - [Rationale]_
_- **Merge**: [Subdomain A] + [Subdomain B] → [New Combined Subdomain]_
_- **Split**: [Original Subdomain] → [New Subdomain 1] + [New Subdomain 2]_

**RELATIONSHIP UPDATES**:
_- **New Dependency**: [Subdomain X] → [Subdomain Y] - [Reason]_
_- **Removed Dependency**: [Previous relationship no longer valid]_
_- **Modified Pattern**: [Changed data flow or integration approach]_

## **UPDATED SUBDOMAIN CATALOG**

[Present complete revised catalog with all changes incorporated]

_Does this updated catalog accurately represent your business domain? Are there any other adjustments needed before we proceed to detailed subdomain definitions?"_

2. **Continue refinement until approval:**

_"I want to confirm we have agreement on the complete subdomain landscape before moving to detailed definitions:_

**FINAL SUBDOMAIN LIST** ([X] Total):

- [x] **Core Subdomains** (competitive advantage focus)
- [Y] **Supporting Subdomains** (operational excellence focus)
- [Z] **Generic Subdomains** (cost optimization focus)

**KEY RELATIONSHIP PATTERNS**:

- [x] **High-coupling relationships** (require coordination)
- [Y] **Data provider patterns** (one-to-many dependencies)
- [Z] **Shared service patterns** (many-to-one dependencies)

_Is this the definitive subdomain catalog we should use for detailed analysis? Once confirmed, I'll proceed to create comprehensive definitions for each subdomain."_

### Step 5: Individual Subdomain Detailed Definition

**AI Assistant Instructions:** Only after catalog approval, develop detailed specifications for each subdomain:

**Process**:

1. **Define each subdomain systematically:**

_"Now I'll create detailed definitions for each approved subdomain. Starting with [Core Subdomain 1]:_

## **[SUBDOMAIN NAME]** (Core)

**Business Purpose**: [Clear business value statement]
**Key Capabilities**:
_- [Business function 1]_
_- [Business function 2]_
_- [Business function 3]_

**Strategic Importance**: [Why this is core to your business differentiation]
**Complexity Assessment**: [Business and technical complexity factors]
**Data Ownership**: [Key entities and data relationships]
**Dependencies**:
_- **Depends on**: [List of subdomains this one needs]_
_- **Provides to**: [List of subdomains that depend on this one]_

**Team Recommendations**: [Team size, skills, and focus areas]
**Implementation Priority**: [Rationale for development sequencing]

_Does this definition accurately capture [Subdomain Name]'s role in your business architecture?"_

2. **Continue with systematic validation:**

_"Moving to [Supporting Subdomain 1]:_

## **[SUBDOMAIN NAME]** (Supporting)

**Business Purpose**: [Support function for core business operations]
**Key Capabilities**: [List of supporting business functions]
**Efficiency Focus**: [Why this emphasizes operational optimization]
**Standardization Opportunities**: [Areas for process standardization]
**Dependencies**: [Integration requirements with other subdomains]
**Implementation Strategy**: [Build vs. buy vs. configure approach]

_This supporting subdomain seems essential for business operations but not for competitive advantage. Does this assessment align with your business strategy?"_

3. **Complete all subdomains before proceeding:**

_"Final subdomain - [Generic Subdomain 1]:_

## **[SUBDOMAIN NAME]** (Generic)

**Commodity Function**: [Standard industry requirement]
**Key Capabilities**: [Common business/technical functions]
**Buy vs. Build Recommendation**: [Market solution preference]
**Cost Optimization Focus**: [Emphasis on operational efficiency]
**Vendor Evaluation Criteria**: [If external solutions recommended]
**Minimal Customization**: [Only necessary business-specific adaptations]

_This appears suitable for off-the-shelf solutions. Do you agree with minimizing custom development here?"_

### Step 6: Comprehensive Relationship Validation

**AI Assistant Instructions:** Validate all subdomain relationships with the detailed definitions:

**Process**:

1. **Present complete relationship matrix:**

_"With all subdomains defined, let me validate the complete relationship matrix:_

## **COMPREHENSIVE SUBDOMAIN RELATIONSHIPS**

### **Core Domain Interactions**

| From     | To       | Relationship Type                      | Data Flow        | Coordination Level |
| -------- | -------- | -------------------------------------- | ---------------- | ------------------ |
| [Core A] | [Core B] | [Collaboration/Customer-Supplier/etc.] | [Data exchanged] | [High/Medium/Low]  |

### **Core-Supporting Interactions**

| From     | To             | Relationship Type     | Data Flow     | Coordination Level   |
| -------- | -------------- | --------------------- | ------------- | -------------------- |
| [Core A] | [Supporting B] | [Service consumption] | [Data/events] | [Coordination needs] |

### **Generic Service Relationships**

| Generic Service | Consumers              | Service Type     | Integration Pattern    |
| --------------- | ---------------------- | ---------------- | ---------------------- |
| [Generic A]     | [Core A, Supporting B] | [Shared service] | [Integration approach] |

### **Critical Integration Points**

_- **High-Risk Dependencies**: [Relationships requiring careful management]_
_- **Data Consistency Requirements**: [Where strong consistency needed]_
_- **Event-Driven Patterns**: [Asynchronous communication opportunities]_
_- **Potential Bottlenecks**: [Services that could become system constraints]_

_Do these relationships accurately represent how your business operates? Are there missing interactions or incorrect dependency patterns?"_

### Step 7: Subdomain Document Generation

**AI Assistant Instructions:** Create comprehensive subdomain documentation, including a subdomain index.

**Process**:

1. **Generate complete structured document:**

_"I'll now create the complete subdomain document incorporating all validated definitions and relationships:_

## **DOCUMENT STRUCTURE**

**Executive Summary**: [Business context and strategic overview]
**Subdomain Catalog**: [Complete approved listing with classifications]
**Detailed Definitions**: [All subdomain specifications]
**Relationship Matrix**: [Complete integration patterns and dependencies]
**Implementation Strategy**: [Phased approach and team recommendations]
**Evolution Guidelines**: [How to maintain subdomain model as business grows]

_The document will follow our adopted standards format (concise, prescriptive, English) and serve as authoritative context for bounded context definition and team organization._

_For the output, I will generate a separate file for each subdomain under the folder [`.pair/product/adopted/subdomain/`](.pair/product/adopted/subdomain/), creating the folder if it does not exist, with all validated content. Each subdomain will be saved in its own file (e.g., `.pair/product/adopted/subdomain/<subdomain-name>.md`)._

_Additionally, I will generate a `README.md` file in the same folder. This file will contain a list of all subdomains, each with a link to its file and a brief description. The README.md will serve as an index and quick reference for the subdomain documentation._

_The README.md will also be submitted for developer review and must be revised according to any feedback, following the same validation process as the subdomain catalog and definitions._

_Should I proceed to generate the individual subdomain files and the README.md index in [`.pair/product/adopted/subdomain/`](.pair/product/adopted/subdomain/)?"_

### Step 8: Final Document and README.md Review and Storage

**AI Assistant Instructions:** Present the complete subdomain documentation and the README.md index for approval.

**Process**:

1. **Present complete document and README.md summary:**

_"Here's the final subdomain document summary and the generated README.md index:_

## **SUBDOMAIN ANALYSIS RESULTS**

**Total Subdomains**: [X] ([Y] Core, [Z] Supporting, [W] Generic)
**Key Strategic Decisions**:
_- **Core Focus Areas**: [Primary competitive differentiators]_
_- **Supporting Optimization**: [Operational efficiency priorities]_
_- **Generic Solutions**: [Cost optimization approaches]_

**Implementation Roadmap**:
_- **Phase 1**: [Core subdomains - competitive advantage]_
_- **Phase 2**: [Supporting subdomains - operational capability]_
_- **Phase 3**: [Generic subdomains - cost efficiency]_

**Architecture Impact**:
_- **Bounded Context Candidates**: [X] potential contexts identified_
_- **Team Structure**: [Recommended team-to-subdomain alignment]_
_- **Integration Complexity**: [Assessment of system coordination needs]_

_The documentation and the README.md index will be presented for developer review. The README.md must be revised according to any feedback, and the process will iterate until the developer approves both the subdomain files and the README.md index._

_Once approved, the files will be stored as individual files in [`.pair/product/adopted/subdomain/`](.pair/product/adopted/subdomain/), one file per subdomain, plus the README.md index._

### Step 9: Iterative Updates Process

**AI Assistant Instructions:** Establish process for maintaining subdomain relevance:

### During Initiative Evolution

**Process**:

1. **Monitor and propose catalog updates:**

_"I've detected new initiatives that may impact our subdomain catalog:_

## **INITIATIVE IMPACT ANALYSIS**

**New Initiative**: [Initiative name and business objective]
**Potential Subdomain Impact**:
_- **New Subdomain Needed**: [If completely new business capability]_
_- **Existing Subdomain Expansion**: [If extending current scope]_
_- **Classification Change**: [If strategic importance has shifted]_
_- **New Relationships**: [Additional dependencies or data flows]_

**PROPOSED CATALOG UPDATES**:
[Present specific changes to the subdomain list and relationships]

_Should I update the subdomain catalog to reflect these business model changes, or do you want to review the impact first?"_

**Important Note**: _Epic breakdown and detailed feature analysis are handled in a separate process described in [How to Breakdown Epics](./06-how-to-breakdown-epics.md). The subdomain analysis focuses on strategic business capabilities at the initiative level, while epic-level details are managed through the dedicated epic breakdown workflow._

## Best Practices

### Do's for AI Assistants

- **Always start with comprehensive document analysis** - thoroughly examine PRD, initiatives, and way-of-working before proposing subdomains
- **Present complete subdomain catalog first** - propose all subdomains with classifications and relationships before detailed definitions
- **Seek explicit approval on catalog** - ensure developer validates complete subdomain list and relationships before proceeding
- **Apply DDD strategic principles rigorously** - use business value, complexity, and strategic importance as primary classification criteria
- **Map all relationships systematically** - identify complete dependency matrix between all subdomains
- **Validate catalog iteratively** - refine the complete list until developer confirms it's accurate and complete
- **Only proceed to detailed definitions after catalog approval** - avoid detailed work until the overall structure is validated
- **Connect subdomains to business outcomes** - explicitly link each subdomain to PRD objectives and strategic initiatives
- **Focus on initiative-level capabilities** - maintain strategic perspective rather than detailed feature analysis
- **Monitor initiative evolution** - proactively detect when subdomain catalog needs updates
- **Follow the 🤖🤝👨‍💻 model** - propose structured analysis and seek developer validation at each major decision point

### Don'ts for AI Assistants

- **Don't create detailed definitions before catalog approval** - validate the complete subdomain list and relationships first
- **Don't assume business knowledge** - extract all business understanding from provided documents rather than making presumptions
- **Don't create technology-driven subdomains** - focus on business capabilities and strategic value, not technical convenience
- **Don't ignore relationship complexity** - map all dependencies and data flows between subdomains comprehensively
- **Don't skip catalog validation** - ensure developer approves the complete subdomain landscape before detailed work
- **Don't dive into epic-level details** - maintain strategic focus on initiatives; epic breakdown is handled separately
- **Don't provide generic recommendations** - tailor all suggestions to specific business context from PRD and initiatives
- **Don't forget organizational constraints** - consider team size, skills, and structure from way-of-working when making recommendations
- **Don't create isolated subdomains** - ensure integration patterns support actual business workflows and data flows
- **Don't ignore business evolution** - monitor for new initiatives that affect subdomain relevance
- **Don't rush through validation** - take time to verify complete catalog with developer before proceeding to detailed definitions

## Quality Assurance Checklist

- [ ] Complete business capability analysis from PRD and initiatives
- [ ] Comprehensive subdomain catalog proposed with classifications
- [ ] All subdomain relationships and dependencies mapped
- [ ] Developer approval obtained for complete subdomain catalog
- [ ] Individual subdomain detailed definitions created only after catalog approval
- [ ] All relationships validated against detailed subdomain definitions
- [ ] Implementation strategy aligned with business priorities and constraints
- [ ] Strategic focus maintained at initiative level (epic details handled separately)
- [ ] Document follows adopted standards format (concise, prescriptive, English)
- [ ] Update process established for initiative evolution
- [ ] Complete subdomain model provides foundation for bounded context definition
- [ ] Each subdomain stored in a separate file under [`.pair/product/adopted/subdomain/`](.pair/product/adopted/subdomain/) (folder created if not present)

## Common Pitfalls and Solutions

| Pitfall                                               | Impact                                              | Solution                                                                                                                   |
| ----------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Creating detailed definitions before catalog approval | Wasted effort on wrong subdomain boundaries         | Always validate complete subdomain list and relationships first                                                            |
| Missing subdomain relationships                       | Integration complexity and coupling issues          | Map complete dependency matrix before detailed definitions                                                                 |
| Technology-driven subdomain boundaries                | Misalignment with business capabilities             | Focus on business functions and strategic value, not technical architecture preferences                                    |
| Incomplete catalog validation                         | Discovering missing subdomains during detailed work | Ensure developer approves complete catalog before proceeding                                                               |
| Diving into epic-level details                        | Losing strategic perspective                        | Focus on initiative-level capabilities; use [epic breakdown process](./06-how-to-breakdown-epics.md) for detailed analysis |
| Ignoring strategic classification                     | Misallocated development resources                  | Apply DDD core/supporting/generic criteria based on competitive advantage                                                  |
| Static subdomain model                                | Outdated business alignment                         | Monitor initiative evolution for business model changes                                                                    |
| Overly granular subdomain decomposition               | Excessive coordination overhead                     | Group related business capabilities that change together                                                                   |
| Generic business analysis                             | Non-actionable subdomain definitions                | Extract specific business context from PRD and initiatives                                                                 |
| Skipping relationship validation                      | Integration problems during implementation          | Validate complete relationship matrix with detailed subdomain definitions                                                  |

## References

### Core Documentation

- [Product Requirements Document](.pair/product/adopted/PRD.md) - Business context, objectives, and value propositions
- [Strategic Initiatives](.pair/adoption/product/backlog/01-initiatives/) - Business priorities and capability roadmap
- [Way of Working](.pair/adoption/tech/way-of-working.md) - Team structure and organizational constraints
- [Adopted Standards README](../tech/adopted/README.md) - Document format and content requirements

### Related Process Guides

- [How to Breakdown Epics](./06-how-to-breakdown-epics.md) - Detailed feature analysis and epic decomposition process
- [How to Complete the Bootstrap Checklist](./02-how-to-complete-bootstrap-checklist.md) - Project setup and technical context establishment
- [Bounded Context Definition Guide](./05-how-to-define-bounded-contexts.md) - Next phase in strategic DDD implementation

### Strategic DDD Resources

- [Strategic DDD by Example: Subdomains Identification](https://levelup.gitconnected.com/strategic-ddd-by-example-subdomains-identification-4bd979f78370) - Practical subdomain identification techniques
- [Revisiting the Basics of DDD](https://vladikk.com/2018/01/26/revisiting-the-basics-of-ddd/) - Strategic design fundamentals
- [Strategic Design - Domain-Driven Design](https://medium.com/@masoud.chelongar/strategic-design-domain-driven-design-b6d25640df83) - Strategic DDD principles and practices

### Knowledge Base Guidelines

- [Architecture Guidelines](../tech/knowledge-base/01-architectural-guidelines.md) - Architectural patterns and principles for subdomain implementation
