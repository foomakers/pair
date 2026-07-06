# Context Map

> **Optional artifact.** Not scaffolded during bootstrap — created and maintained inline the first time a brainstorm or refine session sharpens a domain term (see [Context Map Maintenance](../../architecture/design-patterns/context-map-maintenance.md)). Its absence is the expected steady state for small or new projects; loading skills degrade gracefully when this file doesn't exist.

Dispatcher + index + core for this project's domain model. The unit is the **subdomain** — no separate "domain" taxonomy. Consult this file (and any linked `subdomain/<slug>.context.md`) before proposing a feature that touches an existing term, entity, or rule; flag conflicts against the registered rule (and the DDR, when one exists) instead of silently overriding it.

## Subdomain Index

| Subdomain | Classification | Own Context | Volatility |
| --- | --- | --- | --- |
| [Subdomain slug] | [Core \| Supporting \| Generic] | [No — context inline below \| Yes — see `subdomain/<slug>.context.md`] | [Low \| Medium \| High \| _(leave empty if not set in the catalog)_] |

- **Classification** and **Volatility** mirror the subdomain catalog (`subdomain/<slug>.md`) — one column each here, never invented in the map.
- **Own Context** flips to "Yes" only after a lazy, human-approved split: once a subdomain's inline context has grown, its Glossary and Entities rows move to the co-located `subdomain/<slug>.context.md` sibling (see the [Subdomain Context Template](subdomain-context-template.md)).

## Glossary

Ubiquitous language, one row per term. Skip terms owned by a subdomain marked "Yes" in the index above — they live in that subdomain's context file instead.

| Term | Definition | Subdomain |
| --- | --- | --- |
| [Term] | [What it means in this project — sharpen vague terms until they're testable] | [Subdomain slug \| _domain-wide_] |

## Entities

Domain entities and aggregates, one row per entity. Same rule as Glossary — skip entities owned by a split-out subdomain.

| Entity | Description | Subdomain |
| --- | --- | --- |
| [Entity] | [What it represents; identity, lifecycle, or ownership notes worth stress-testing] | [Subdomain slug \| _domain-wide_] |

## Common Rules and Invariants

Domain-wide business rules — the "common parts" the map keeps even after subdomains split out their own context. Subdomain-specific rules belong in that subdomain's context file, not here.

- [Rule or invariant] — [what breaks if it's violated; cite the DDR if one formalizes it]
