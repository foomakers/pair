# ADR: AI-Generated Machine Contracts from KB Templates (md → contract.json)

## Status

Accepted

## Date

2026-07-12

## Context

- The agent execution layer's orchestrator (`.claude/workflows/implement-batch.js`, ADL 2026-07-11-agent-execution-layer) consumes machine return-value schemas (review verdicts, severities, finding fields) that must mirror the KB markdown templates (`code-review-template.md`, `pr-template.md`, ...). Hand-rolled schemas drifted from the templates (verdict vocabulary 2-vs-4, severity sets); the interim fix loosened the schemas to free strings.
- The team authors only human-friendly markdown — no JSON authoring should be required to keep the machine contract in sync.
- Constraint: the Workflow sandbox has **no filesystem access** — the orchestrator script cannot read or hash a template at runtime; any file work must happen inside a spawned agent.
- Emerged from the 2026-07-11 orchestrator dogfood (story #292, epic #206).

## Options Considered

### Option 1: Keep hand-rolled schemas in the workflow (status quo)

- **Description**: Maintain the return-value schemas by hand next to the orchestrator, loosened to free strings.
- **Pros**: Zero moving parts; already works.
- **Cons**: Drift by construction — a template edit silently invalidates the machine contract; loose schemas give agents no vocabulary guidance.

### Option 2: Deterministic markdown parser (template → schema at runtime)

- **Description**: Parse the template with code to extract vocabulary and build the schema.
- **Pros**: No AI call; fully reproducible.
- **Cons**: Brittle — breaks on any heading rename, section move, or reformatting; the sandbox cannot run it anyway (no FS), so it would still need an agent host; a parser hard-codes the very structure the templates are free to evolve.

### Option 3: AI-generated `contract.json`, cache-by-hash, loose fallback (chosen)

- **Description**: A `contract-generator` agent (has FS + AI) reads the template and derives a `*.contract.json` (vocabulary + enum-locked JSON Schema). The deterministic half (sha256 hashing, cache decision fresh/stale/missing/invalid, validation, `$meta` stamping) lives in `.claude/workflows/contracts/ensure-contract.mjs`. The orchestrator's phase 0 ("ensure-contract") spawns the agent per template spec; unchanged template hash → the cached contract is reused with no regeneration; malformed/failed contract → the workflow falls back to the loose skeleton schema and reports it — the run never breaks.
- **Pros**: Markdown stays the single source of truth; the AI adapts to reformatting and restructuring (that is why it replaces a parser); deterministic across runs via the hash cache; per-template and reusable (`code-review` → `code-review.contract.json`, `pr` → `pr.contract.json`, ...).
- **Cons**: One AI generation per template change (or per fresh clone); two validators exist (canonical in `ensure-contract.mjs`, a minimal consumer-side guard duplicated in the sandboxed workflow, which cannot import modules).

## Decision

Option 3. Additional calls within it:

- **Contract artifacts are git-ignored** (`.claude/workflows/contracts/.gitignore`), not committed: they are a regenerable derived cache. Committing them would require mutating the main working tree during orchestrator runs (violating the execution layer's isolation invariant) and would force template PRs to remember to regenerate. The cost — one AI generation per clone or template change — is negligible.
- **Control flow stays value-agnostic**: the orchestrator converges on `actionable.length === 0` + `nonActionable`, never on specific verdict/severity strings. Enum-locking lives only in the generated schema (safe, because it regenerates with the template); the fallback skeleton stays loose.
- **Orchestration-only fields** (`needsHumanDecision`, `nonActionable`) have no template counterpart and are preserved byte-identical from the skeleton — the generator only tightens template-mirroring fields.
- **Reviewer prompt vocabulary** (severities, verdict options) is threaded from the generated contract, with the current KB wording as fallback.

## Consequences

### Benefits

- Editing a KB template can no longer drift the workflow: the hash mismatch forces regeneration, and the vocabulary the agents see always comes from the template.
- The team keeps authoring only markdown; no JSON maintenance, no parser maintenance.
- Pattern reusable for any template a workflow consumes; adding one = one entry in `CONTRACT_SPECS` (documented in `implement-batch.js` for `pr-template.md`).
- The run degrades gracefully (loose fallback + reported `fallback-loose` status) instead of failing.

### Trade-offs and Limitations

- Generation correctness is AI-judged (mitigated: `ensure-contract.mjs write` validates structure and stamps the hash; the workflow's `usableSchema` guard re-checks the control-flow-critical shape before use; enum values must appear verbatim in the template per the generator's rules).
- A minimal, documented duplication between the canonical validator and the sandboxed consumer guard (the sandbox cannot import modules).
- Applies to the Claude-Code-specific execution layer only — not the portable skills (per ADL 2026-07-11-agent-execution-layer).

## Adoption Impact

- No adoption file changes: the execution layer is opt-in, lives under `.claude/`, and is not part of the shipped dataset/KB.
- New components: `.claude/agents/contract-generator.md`, `.claude/workflows/contracts/ensure-contract.mjs` (+ tests), phase 0 in `.claude/workflows/implement-batch.js`.
