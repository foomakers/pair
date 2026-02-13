# [Context Name] Context

> Type: **[Core | Supporting | Infrastructure]**

## Subdomains Covered

- [Subdomain 1]
- [Subdomain 2]

## Business Scope and Purpose

[What this context is responsible for — core capability, business value, and why these subdomains are grouped together]

## Relationships Between Bounded Context and Sub Domains

- **[Subdomain 1]** [How this subdomain contributes to the context — role, triggers, data it provides]
- **[Subdomain 2]** [How this subdomain contributes — what it consumes or produces]
- [Cross-context relationships — what this context consumes from and provides to other contexts]

## Integration Patterns

- [Synchronous integrations: REST/gRPC calls to/from other contexts]
- [Asynchronous integrations: events published/consumed]
- [Anti-corruption layers: protection strategies for external system boundaries]

## Data Ownership

- [Key aggregates, entities, and data stores owned by this context]

## Team Alignment

- [Team responsible for this context, autonomy level, and scaling considerations]

## Ubiquitous Language

| Term | Definition |
| ---- | ---------- |
| [Domain term 1] | [Context-specific meaning] |
| [Domain term 2] | [Context-specific meaning] |

## Quality Attributes

- **Performance:** [Latency, throughput, or response time requirements]
- **Scalability:** [Growth expectations and scaling approach]
- **Reliability:** [Availability, fault tolerance, consistency model]
