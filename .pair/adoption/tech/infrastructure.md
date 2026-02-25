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

---

All deployment and infrastructure implementations must follow these adopted standards. For process and rationale, see [way-of-working.md](../../way-of-working.md).
