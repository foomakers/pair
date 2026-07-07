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

### Cross-Context Relationship Assessment

Each relationship with another bounded context is assessed on three dimensions to derive its integration pattern. High distance ⇒ contract/ACL; high strength with low distance ⇒ consider co-location in the same context. An **unbalanced AND volatile** relationship does not pass approval without a mitigation or an explicit acceptance.

| Related Context | Integration Strength | Socio-Technical Distance | Volatility | Outcome | Pattern | Notes |
| ---------------- | --------------------- | ------------------------- | ---------- | -------- | ------- | ----- |
| [Context name] | [intrusive \| functional \| model \| contract] | [low \| medium \| high] | [High \| Medium \| Low — from the related subdomain(s)] | [balanced \| unbalanced] | [sync \| async \| ACL \| contract] | [contract tests expected — if strength=contract] [mitigation/acceptance — if gated] |

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

## Encapsulated Knowledge

[What this context knows that no other context must — internal model details, business rules, or data that would create hidden coupling if leaked across the boundary]

## Change Vectors

[Expected changes that must stay internal to this boundary — the kinds of change this context absorbs without forcing a change on its relationships]
