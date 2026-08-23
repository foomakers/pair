# Agent Harness Framework

## Overview

pair's process lives in skills, not in any one AI coding agent. This framework covers **agent harnesses** — the CLI/TUI programs that read `AGENTS.md`, load skills, hold a model connection, and execute a session (Claude Code, pi, opencode, and any future one) — the way `collaboration/project-management-tool/` covers PM tools: a framework README with the fixed contract every implementation guide follows, plus one guide per harness.

**Harness ≠ engine ≠ model provider.** Three separate axes, easy to conflate:

- **Harness** — which program runs the session and exposes tools/skills to the model (this framework: pi, opencode, Claude Code).
- **Engine** — which harness invocation drives pair's automated loops (`--engine` + `pair.config.json`; a separate concern, tracked in #451).
- **Model provider** — who serves the model to the harness (Anthropic direct, an OAuth subscription, a gateway like opencode Zen/Go). Documented per-harness below, never pinned in this framework.

## Scope

This framework covers:

- Per-harness configuration: file locations, which are committable, how skill paths are declared, how project context loads.
- Authentication shape (API key vs. OAuth subscription) and its local-interactive vs. CI implications.
- Access paths a harness supports (MCP yes/no) and how model providers, including third-party gateways, are configured.
- Headless/non-interactive execution.
- What a harness explicitly does **not** support, and the version each guide was verified against.

## Out of Scope

- Which harness a project or developer should use — that stays a per-project (`tech/automation.md`, delta-only) and per-session (developer/config) choice, never a pinned recommendation (Business Rule: a project declares harnesses it *supports*, never the one to use).
- The execution/orchestration layer that drives pair's automated loops across a chosen engine — that is `--engine` + `pair.config.json` (#451), a distinct concern from harness fitness.
- Model names and pricing — volatile by nature; concrete names live in each guide, never in adoption.

## CLI-First Is the Portable Baseline

Every harness in this framework exposes a CLI. Not every harness exposes MCP (pi does not, by design — see [pi.md](pi.md)). So **CLI is the baseline access path pair's skills are written against, and MCP is opt-in enrichment** where a harness offers it — never a requirement a fitness check assumes silently. A skill that only works through MCP is not portable across this framework by construction.

**Confirmed coverage gap**: multi-comment / inline-line-comment PR reviews currently have no documented CLI path — [`github-implementation.md`](../../../collaboration/project-management-tool/github-implementation.md)'s Pending Review Workflow is MCP-only, and the CLI fallback (`gh pr review`) covers only a single summary-body review. See that file's "CLI Coverage Gap" section for the remedy/limitation. This is exactly why a harness's MCP support must be declared up front, as part of its fitness check, rather than discovered mid-review.

## Directory Contents

### Fixed Per-Guide Index

Every guide in this directory covers, **in this exact order**, so a reader comparing two harnesses compares like with like:

1. **Config file locations** — where, and which are committable.
2. **Skill-path declaration** — how the harness discovers pair's skills.
3. **Project context loading** — what the harness reads at startup, and any duplication finding.
4. **Authentication** — API key vs. OAuth subscription, and which is CI-viable.
5. **Access paths** — MCP yes/no.
6. **Model provider configuration** — including third-party gateways.
7. **Headless execution** — the non-interactive invocation(s).
8. **What the harness does NOT support**.
9. **Verified-against version**.

A conformance test asserts every guide carries all nine section headings, in order — see `packages/knowledge-hub/src/conformance/agent-harness-guides.test.ts`.

**Adding a harness is one markdown file and zero code.** If supporting a new harness ever requires a code change here or in `/pair-capability-setup-harness`, the framework — not the harness — is what needs fixing.

### Implementation Guides

- **[pi.md](pi.md)** — the no-MCP-by-design case; proves the framework doesn't assume MCP.
- **[opencode.md](opencode.md)** — MCP-native, and the only harness with a persistent headless server (`opencode serve`).
- **[claude-code.md](claude-code.md)** — the control case pair was built on; documents `claude -p` and `Workflow` as two distinct execution layers.

## Credentials Never Pass Through This Framework or Its Skill

No guide, and `/pair-capability-setup-harness`, ever reads, writes, stores, transmits or prints a token or API key. Each guide states which auth path is missing and how to obtain it, and states plainly where OAuth subscription is a **local-interactive path, not a CI path** — the harness's own docs govern the exact login flow, not this KB.

## Free-Model Recommendations Carry Their Data-Exposure Warning

Where a guide recommends a free/no-cost model tier (e.g. opencode Zen's free models) for cost reasons, the recommendation ships **together with** the data-exposure disclosure for that specific provider (some log for model improvement, some retain requests, some train on prompts — see [opencode.md](opencode.md)). The warning is never separated from the recommendation.

---

**Skill**: Use `/setup-harness` to resolve, verify the fitness of, and configure a harness for this project. See [automation policy / harness + model-class schema](../../../collaboration/automation/automation-policy.md) for the adoption-side declaration.
