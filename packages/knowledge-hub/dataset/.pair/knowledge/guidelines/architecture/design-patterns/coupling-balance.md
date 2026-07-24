# Coupling Balance

The single home of Pair's coupling model (D37): how to evaluate whether a
relationship between two components is *balanced*, on three dimensions, at every
level of abstraction. Skills reference this file; they never restate the model.

## Purpose

Coupling is not a defect to be minimized to zero — a system with no coupling does
nothing. The engineering question is never "is there coupling?" but "is this
coupling **balanced**?". This guideline defines the three dimensions used to answer
that, the balance rule that combines them, the severity a given imbalance carries,
and how the model maps onto the DDD patterns already in this knowledge base. It is
the criteria source for the `assess-coupling` skill (diff review + full audit) and a
reading input to `assess-architecture`.

## The Three Dimensions

Every coupling relationship is characterised on **all three** dimensions. A verdict
that rests on fewer than three is not a coupling verdict — it is a structural guess,
and this model rejects it.

### 1. Integration Strength — how much two components must know about each other

Strength measures the *amount of shared knowledge* a relationship carries: the more
one component must understand about the internals of the other to work with it, the
stronger the coupling. Four levels, from strongest to weakest:

| Level | Shared knowledge | Example |
| --- | --- | --- |
| **Intrusive** (strongest) | Private internals: reaching past the public surface into implementation detail | reading another module's database tables directly; depending on a private field or an undocumented side effect |
| **Functional** | Shared behavioural expectations: a caller relies on *how* the other fulfils a responsibility, not only *what* it exposes | duplicated business rules kept in sync by hand; a consumer that re-implements the producer's validation |
| **Model** | A shared data model / shared types: both sides bind to the same representation of a concept | a common DTO or schema imported by both; a shared entity passed across a boundary |
| **Contract** (weakest) | Only a published contract: a stable interface, event shape, or protocol, with internals hidden on both sides | calling a versioned API; consuming a documented event; depending on an interface, not an implementation |

Stronger integration means a change on one side is more likely to force a change on
the other. Strength is the dimension a rebalancing usually targets: introducing a
contract *reduces* strength without moving the components.

### 2. Socio-technical Distance — the cost of co-evolving the two components

Distance measures how expensive it is to change both sides **together**. It is
socio-technical because the cost is not only in the code:

- **Code-structure distance** — same function / same module / same package / same
  deployable / separate deployables. The further apart in the structure, the more
  coordination a joint change needs.
- **Team distance** — same author / same team / different teams / different
  organisations. Crossing a team boundary turns a code change into a negotiation.
- **Runtime distance** — in-process call / same process boundary / network hop /
  asynchronous exchange. The further apart at runtime, the harder atomic change and
  the more failure modes a joint change must survive.

Distance is the dimension a rebalancing targets when it *co-locates*: moving the two
sides closer (same module, same team) lowers the cost of the changes they force on
each other. Decomposition does the opposite — it **raises** distance.

### 3. Volatility — how likely the relationship is to change

Volatility is the probability that the coupled behaviour will actually change. It is
evaluated **from the business domain, never from commit history alone** — a file
that churned last month is not thereby volatile, and a quiet file in a core
subdomain is not thereby stable. Two kinds:

- **Essential volatility** — inherent to the domain: core, differentiating
  capabilities change as the business learns. Sourced from subdomain classification
  (see [strategic-subdomain-definition.md](strategic-subdomain-definition.md)):
  **core → high**, **supporting → medium**, **generic → low**.
- **Accidental volatility** — a generic capability whose *implementation* is
  provider- or fashion-dependent (a payment SDK, a UI framework) can be volatile even
  though the capability is generic. Flag it explicitly as accidental so the
  rebalancing targets the implementation seam, not the capability.

Commit frequency is at most a weak corroborating signal and is never, on its own,
evidence of volatility.

## The Balance Rule

Combine strength and distance first, then let volatility set the stakes.

- **Balanced**: strength and distance move together in *opposite* directions — high
  strength with low distance (tightly-related things kept close), or low strength
  with high distance (loosely-related things kept apart). Both are healthy.
- **Unbalanced — high strength + high distance**: the pathological case.
  Tightly-coupled components that are expensive to change together produce
  **cascading, expensive changes**: every modification ripples across the boundary
  that was meant to contain it. This is the imbalance that hurts most.
- **Unbalanced — low strength + low distance**: **low cohesion**. Things that barely
  relate are crammed together, so the module has no reason to exist as a unit and
  changes for unrelated reasons.

**Volatility is the multiplier.** An imbalance in a **stable** relationship is
tolerable — it will rarely be paid for, so rebalancing may cost more than it saves.
The same imbalance in a **volatile** relationship is where change actually lands, and
is where the model raises the alarm. **Low volatility neutralises an imbalance;**
high volatility sharpens it.

## Severity

Severity is a function of the imbalance *and* its volatility — never of structure
alone:

| Severity | Condition |
| --- | --- |
| **Critical** | Unbalanced **and** high volatility — the imbalance sits exactly where change lands. |
| **Significant** | Unbalanced and moderate volatility; **or** implicit shared knowledge regardless of stated volatility — duplicated business rules, access to another component's private interface/tables (intrusive/functional strength that hides as if it were a contract). |
| **Tolerable** | Unbalanced and low volatility — recorded as architectural debt, **never blocks** a merge. |

The guiding heuristic is **few critical findings beat many minor ones**: a report
that flags everything flags nothing. Only unbalanced-and-volatile relationships earn
*attention* — the critical/significant findings that feed the merge decision. An
imbalance neutralised by low volatility does **not** vanish: it is **retained as a
tolerable finding** and surfaced as architectural debt — never dropped, never
blocking. What is genuinely *not a finding* is a **balanced** relationship, or any
score resting on fewer than three dimensions.

## Rebalancing — always two-dimensional

A rebalancing proposal names the dimension it moves and why. There is **no valid
single-word "decouple" recommendation**:

- **Reduce strength** — introduce a contract (interface, published event, API
  version, anti-corruption layer) so the two sides stop sharing internals. This is
  the default move when the components genuinely belong apart.
- **Reduce distance** — co-locate: move the two sides into the same module / team /
  process so a joint change is cheap. The right move when the coupling is essential
  and the split was accidental.

**Decomposition is not free: splitting components raises distance.** Recommending
"decouple" (i.e. split) is only sound when strength is already low enough that the
higher distance stays balanced. Proposing a split on a high-strength relationship
just converts a *cascading-change* imbalance into a *distributed cascading-change*
imbalance — strictly worse. When strength is high, reduce strength first.

## Fractal Application

The model applies at **every level of abstraction**, and distance is always relative
to the level under analysis:

- functions within a module,
- modules within a package,
- packages within a deployable,
- deployables within a system.

A cross-module imbalance counts even inside a single deployable: "it all ships
together" does not make two tightly-coupled, distant-in-structure modules balanced.
Evaluate the relationship at the level where the change actually crosses a boundary.

## Mapping to DDD Patterns

The strategic DDD patterns already in this knowledge base are *instances* of
rebalancing moves — this model is the why behind them:

- **[Bounded contexts](bounded-contexts.md)** partition the model so a change stays
  inside one context: a distance boundary drawn where volatility differs.
- **Anticorruption layer** is a strength reducer: the downstream context refuses the
  upstream model and translates at the seam, turning model/functional coupling into
  contract coupling.
- **Open-host service / published language** lowers strength for *many* downstream
  consumers at once — one stable contract instead of N model bindings.
- **Aggregates** keep high-strength, high-volatility invariants inside a single
  consistency boundary — low distance where strength must stay high.
- **Conformist / shared kernel** are the deliberately-accepted high-strength
  relationships; the model says they are only safe when distance is low (same team,
  minimal shared surface) and are re-examined the moment volatility rises.

See [integration-patterns.md](integration-patterns.md) for the communication
mechanics and [context-map-maintenance.md](context-map-maintenance.md) for keeping
the relationship assessment current.

## Test Implications

The strength level of a relationship dictates what must be tested at its boundary:

- **Contract-coupled** relationships imply **integration contract tests** — proof the
  published contract is honoured by both sides (the consumer's expectations and the
  provider's guarantees stay in agreement) — **and boundary tests** proving
  encapsulation holds: nothing beyond the contract leaks across the seam. A leak
  silently upgrades the relationship from contract to model/intrusive strength
  without anyone deciding to.
- **Model/functional-coupled** relationships need tests that pin the shared model or
  duplicated rule, so a drift on one side breaks a test rather than production.
- **Intrusive** coupling is, by definition, untestable at a stable boundary — there
  is no boundary — which is itself the finding.

## Bibliographic Reference

The three-dimensional framing of coupling as *integration strength × distance ×
volatility*, and the balance rule that combines them, is informed by the coupling
model articulated at [coupling.dev](https://coupling.dev). The content of this
guideline — definitions, levels, severity criteria, DDD mapping, and examples — is
Pair's own formulation.

## Related Documents

- [Design Patterns README](README.md) — pattern index
- [Strategic Subdomain Definition](strategic-subdomain-definition.md) — subdomain
  classification, the source of essential volatility
- [Bounded Contexts](bounded-contexts.md) · [Integration Patterns](integration-patterns.md)
  · [Context Map Maintenance](context-map-maintenance.md) — the DDD patterns this
  model explains
