# Architecture

- The system is designed for a small team and rapid development.
- Architecture supports desktop usage only.
- All components are self-hosted unless external services are required for LLM or vector database functionality.
- Data storage and retrieval for Retrieval-Augmented Generation (RAG) is provided by Supabase.
- Local LLM models are supported via Ollama for RAG use cases.
- Bash scripts are used to coordinate and simplify the execution of AI assistant processes.
- All data is handled in lightweight fashion; no large-scale processing is required.
- No compliance or integration requirements are adopted.
- No formal scalability or performance constraints are adopted.
- No external integrations are required for initial release.

## Knowledge Base Distribution

- KB dataset is distributed separately from CLI bundle as GitHub release artifact.
- CLI auto-downloads KB on first run from GitHub releases (default) or custom URL.
- KB cache location: `~/.pair/kb/{version}/` for the official KB, `~/.pair/kb/external/{kind}-{hash}/` for every other source that needs materializing (only the remote-URL form keeps a `{label}`: `~/.pair/kb/external/url-{label}-{hash}/`; a `--source` directory is read in place and owns no slot; slot keyed by source identity — see the [2026-08-11 ADL](../decision-log/2026-08-11-kb-cache-slots-keyed-by-source-identity.md)).
- Fallback chain (default source only): monorepo dataset (checkout) → cache hit → default GitHub release. A source the user NAMES bypasses that chain and resolves to its own identity slot — `--source <path|url|git>`, or the program-level `--url` when the command names no `--source` (`--source` outranks it).
- Version coordination: CLI version maps to KB version (e.g. CLI v0.2.0 → KB v0.2.0).

### CLI Download Patterns

- **TTY Detection**: CLI UX adapts to environment using `process.stdout.isTTY` - progress bars in interactive terminals, simple logs in CI/CD. See [ADR-001](adr/adr-001-tty-detection-pattern.md).
- **Resume Support**: Interrupted downloads resume using HTTP Range requests with `.partial` file tracking. See [ADR-002](adr/adr-002-http-range-resume.md).
- **Integrity Validation**: All KB downloads validated using SHA256 checksums for security and corruption detection. See [ADR-003](adr/adr-003-checksum-validation.md).
- **Streaming Downloads**: Memory-efficient streaming writes with real-time progress tracking. See [ADR-004](adr/adr-004-streaming-downloads.md).

## Tooling Package Boundaries

- A package boundary tracks a bounded context, not a folder-level tool grouping. When two or more tool families map onto the same bounded context (e.g. `@pair/dev-tools`'s quality-gate tools and release-pipeline tooling both belong to Integration & Process Standardization — see [context](boundedcontext/integration-process-standardization.md)), they live in one package, organized into folders by tool family (e.g. `src/quality-gates/`, `src/release/`) — not split into a package per tool family. See [ADR-014](adr/adr-014-tool-package-boundary-by-bounded-context.md).

## Skills Distribution

- Skills are stored in `.skills/` within the KB dataset, following the Agent Skills open standard (agentskills.io).
- Each skill is a `SKILL.md` file in a category/name directory structure (e.g., `.skills/navigator/next/SKILL.md`).
- Skills are distributed to 6 AI tool directories via flatten/prefix naming transforms and multi-target distribution.
- Canonical target (`.claude/skills/`) receives physical copies; secondary targets receive symlinks.
- Windows environments fall back to copy mode (symlinks rejected at validation time). See [ADR-005](adr/adr-005-skills-infrastructure.md).

## Unattended Dispatch

- **Tag-driven dispatch is opt-in, per card, and declared in adoption.** `## Workflows` in `tech/automation.md` maps a tag to the workflow (a skill name) that runs on a card carrying it; the tag is an opaque routing key and no classification criterion ever lives in the routing code (D18). A card with no mapped tag runs nothing — there is no default workflow. See [ADR-024](adr/adr-024-tag-driven-dispatch-agnostic-core-host-adapter.md).
- **The routing core is host-agnostic and credential-free.** It lives in the `pair run` entry point (ADR-021 tier 2) as a pure function over the card, the labels a trigger observed, and the policy; the labels are an INPUT (`--card`/`--card-tags`) supplied by a thin per-host trigger adapter, never fetched by the driver. Adding a code host is a new adapter, never a change to the core.
- **A dispatched card reaches its workflow under that workflow's own argument name** (`--root` for `pair-loop`, `--story` for `pair-process-refine-story`/`pair-process-plan-tasks`), borrowed from its `## Arguments` table and never invented (D18). A mapping naming a workflow outside the KB catalog — or one the driver holds no such row for — **HALTs** with the uninstalled-workflow check, before eligibility and routing: an undeclared argument is ignored rather than rejected, and a workflow that picks its own subject when unscoped would then work a card nobody tagged while the trail below named the card that was. The mappable set is a declaration of its own (`DISPATCHABLE_WORKFLOWS`), asserted equal to the guideline's catalog table — knowing how a skill spells its scope is not what makes a tag allowed to route a card to it, and neither does it license routing to a workflow that needs a human: `pair-process-refine-story` is scopable, hand-drivable and deliberately NOT mappable, because its alignment gate ends only on an explicit human approval (ADR-024 item 8).
- **Nothing displaces the dispatched card as the run's scope.** `--root`, like `--skill`/`--prompt`, is refused alongside `--card` at parse time, and the handler reads the dispatched card before `config.scope.root`: an operator flag that silently outranked the mapping would drive the agent over one subtree while the audit trail, the on-issue record and the exclusive lock all named another (ADR-024 item 7).
- **The audit trail is split accordingly**: every decision is appended to the `## Audit Location` file, and the run-start record — only that one — is printed as a `DISPATCH-RECORD:` line for the host adapter to post on the card. Skips and endings stay in the file.
- **Never two runs on one card, within one working area**: a dispatch takes an exclusive per-card lock under `working_path` before spawning and releases it unconditionally (a crash writes `outcome=crashed` on the way out); a trigger burst is skipped and logged, never queued. The lock is filesystem-local, so a host that gives every job a fresh checkout needs its own concurrency group as the cross-job guard — see ADR-024's limitations.

---

All architectural implementations must follow these adopted standards. For process and rationale, see [way-of-working.md](../../way-of-working.md).
