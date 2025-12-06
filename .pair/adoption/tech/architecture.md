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
- KB cache location: `~/.pair/kb/{version}/` (version-specific isolation).
- Fallback chain: cache hit → default GitHub release → custom URL (via `--url` flag).
- Version coordination: CLI version maps to KB version (e.g. CLI v0.2.0 → KB v0.2.0).

### CLI Download Patterns

- **TTY Detection**: CLI UX adapts to environment using `process.stdout.isTTY` - progress bars in interactive terminals, simple logs in CI/CD. See [ADR-001](adr/adr-001-tty-detection-pattern.md).
- **Resume Support**: Interrupted downloads resume using HTTP Range requests with `.partial` file tracking. See [ADR-002](adr/adr-002-http-range-resume.md).
- **Integrity Validation**: All KB downloads validated using SHA256 checksums for security and corruption detection. See [ADR-003](adr/adr-003-checksum-validation.md).
- **Streaming Downloads**: Memory-efficient streaming writes with real-time progress tracking. See [ADR-004](adr/adr-004-streaming-downloads.md).

---

All architectural implementations must follow these adopted standards. For process and rationale, see [way-of-working.md](../../way-of-working.md).
