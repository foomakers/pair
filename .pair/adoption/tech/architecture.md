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
- KB cache location: `~/.pair/kb/{version}/` for the official KB, `~/.pair/kb/external/{kind}-{label}-{hash}/` for every other source that needs materializing (a `--source` directory is read in place and owns no slot; slot keyed by source identity — see the [2026-08-11 ADL](../decision-log/2026-08-11-kb-cache-slots-keyed-by-source-identity.md)).
- Fallback chain: cache hit → default GitHub release → custom URL (via `--url` flag).
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

---

All architectural implementations must follow these adopted standards. For process and rationale, see [way-of-working.md](../../way-of-working.md).
