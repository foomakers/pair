# Infrastructure

- All components are self-hosted on local machines or team-managed servers.
- Supabase is deployed as a managed cloud service or self-hosted instance for RAG database and vector storage.
- Ollama is deployed locally for LLM model execution in RAG workflows.
- Bash scripts are used for deployment, orchestration, and process automation.
- No cloud provider lock-in; infrastructure is portable and can be migrated as needed.
- No external integrations or compliance requirements for initial release.
- Minimal DevOps practices: manual deployment, lightweight monitoring, and basic backup procedures.
- CI/CD pipeline is adopted using Github Actions.
- Website (`apps/website/`) is deployed to Vercel Hobby plan via Vercel CLI in GitHub Actions. Production deploy is release-gated (tag `v*`, `deploy-website` job in `release.yml`). Preview deploys on PRs via `website-preview-deploy.yml`. Secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
- Infrastructure supports desktop usage only; no mobile or browser deployment required.
- Manual CLI release artifact (`scripts/workflows/release/package-manual.sh`): the contract is `bin/pair-cli` + `bundle-cli/index.js` + docs — it is **executed, never imported**, so bundled type declarations are optional and `bundle-cli/index.d.ts` is best-effort. When it is absent the emitted `package.json` omits `types` (asserted by the packaging smoke scenario). See ADL [2026-08-12-manual-cli-artifact-types-are-optional.md](../decision-log/2026-08-12-manual-cli-artifact-types-are-optional.md).
- `pair-cli` is the sole canonical CLI invocation name — no `pair` bin alias exists or is planned. See ADL [2026-08-25-cli-invocation-canonical-name-is-pair-cli.md](../decision-log/2026-08-25-cli-invocation-canonical-name-is-pair-cli.md).

---

All deployment and infrastructure implementations must follow these adopted standards. For process and rationale, see [way-of-working.md](../../way-of-working.md).
