# ADR-008: Vercel CLI Deployment via GitHub Actions

**Status:** Accepted
**Date:** 2026-02-25
**Context:** Story #132 - CI/CD + Hosting

## Decision

Deploy `apps/website/` to Vercel Hobby plan using the Vercel CLI from GitHub Actions, bypassing the native Git Integration. Production deploy is release-gated (tag `v*`), running as `deploy-website` job in `release.yml`. Preview deploys on PRs via separate `website-preview-deploy.yml`.

### Key Design Choices

1. **Deploy method**: Vercel CLI (`npx vercel deploy`) with token auth via GitHub Actions secrets, NOT Vercel Git Integration
2. **Production trigger**: Release-gated — `deploy-website` job in `release.yml`, runs after `release` job on tag `v*`
3. **Preview trigger**: PR-scoped — `website-preview-deploy.yml` with path filter (`apps/website/**`, `packages/brand/**`)
4. **Project scope**: Linked to personal Vercel account (Hobby plan), not organization team
5. **Secrets**: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` in GitHub repo secrets

## Rationale

**Constraint:** The repo `foomakers/pair` is private and owned by an organization. Vercel Hobby plan cannot connect private org repos via Git Integration (requires Pro at $20/mo/user). Since July 2025, Vercel allows public org repos on Hobby, but our repo is private.

**Alternatives Considered:**

1. **Vercel Git Integration (native)**
   - ❌ Rejected: Requires Pro plan ($20/mo/user) for private org repos
   - ❌ Rejected: Hard budget constraint — must stay free

2. **Make repo public**
   - ❌ Rejected: Business decision outside tech scope; exposes all code, history, issues
   - ❌ Rejected: Would require audit for secrets in git history

3. **Netlify (free tier)**
   - ❌ Rejected: Partial Next.js SSR support, requires extra config
   - ❌ Rejected: Only 300 build min/mo (vs Vercel 6000)
   - ❌ Rejected: Fumadocs optimized for Vercel/Next.js, not tested on Netlify

4. **Cloudflare Pages**
   - ❌ Rejected: SSR requires Workers (complexity)
   - ❌ Rejected: Only 500 build min/mo
   - ❌ Rejected: Next.js compatibility partial, ecosystem mismatch

5. **Deploy on every push to main**
   - ❌ Rejected: Website documents released product (CLI + KB); deploying on every push risks publishing docs referencing unreleased features

**Selected Approach (Vercel CLI via GH Actions, release-gated):**

- ✅ Free — Hobby plan, no paid features
- ✅ Best Next.js runtime — Vercel is the native platform for Next.js/Fumadocs
- ✅ Release-gated — docs always match the released product version
- ✅ Preview deploys — reviewers can check doc changes before merge
- ✅ Well-documented pattern — widely used by OSS projects with private org repos
- ✅ Minimal new infra — 1 new workflow file + 1 job added to existing release.yml

## Consequences

**Positive:**

- Website deploys automatically on every release, zero manual steps
- Preview URLs on PRs for doc review
- Stays within Vercel Hobby plan (free)
- Integrates cleanly with existing release pipeline (changeset → tag → release → deploy)
- No vendor lock-in change — already using Vercel

**Negative:**

- No Vercel native Git Integration features (auto-deploy comments, branch-based env)
- Preview URL posted via `gh` CLI comment (not Vercel's native PR integration)
- 3 secrets to manage in GitHub repo settings
- Vercel CLI version may need periodic updates
- Cannot deploy docs independently of a release (mitigated: `workflow_dispatch` escape hatch)

## Implementation

- **Release deploy**: `deploy-website` job in `.github/workflows/release.yml` — `needs: release`, runs `npx vercel deploy --prod`
- **Preview deploy**: `.github/workflows/website-preview-deploy.yml` — path-filtered, runs `npx vercel deploy`, posts URL as PR comment
- **Secrets**: `VERCEL_TOKEN` (account token), `VERCEL_ORG_ID` (from `.vercel/project.json`), `VERCEL_PROJECT_ID` (from `.vercel/project.json`)
- **Existing CI**: `ci.yml` already validates website build (`pnpm build`) and runs E2E tests on all PRs — no changes needed

## Adoption Impact

- `adoption/tech/tech-stack.md` — updated Vercel line: CLI deployment, release-gated production, preview on PR
- `adoption/tech/infrastructure.md` — added Vercel CLI deployment details and secrets list

## References

- Story: #132 (CI/CD + Hosting)
- Epic: #93 (Website & Documentation)
- Vercel Hobby plan docs: https://vercel.com/docs/plans/hobby
- Community workaround guide: https://gist.github.com/ky28059/1c9af929a9030105da8cf00006b50484
