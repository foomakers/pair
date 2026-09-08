# Decision: The docs-site deploy build routes through turbo

## Date

2026-09-08

## Status

Active

## Category

Convention Adoption

## Context

Vercel builds the docs site by running `apps/website/vercel.json`'s `buildCommand` literally. It was `pnpm --filter @pair/website build` — the package script, called directly. Every other build in the repository (`pnpm build`, CI, the pre-push hook) goes through turbo, whose `build` task declares `dependsOn: ["^build"]`, so a workspace dependency's `dist/` exists before `next build` reads it. The direct command skips that edge.

Measured on PR #471: the moment `apps/website/lib` imported `@pair/content-ops`, every turbo-routed gate stayed green while the Vercel preview failed with `Type error: Cannot find module '@pair/content-ops/markdown/commonmark-blocks'` — `packages/content-ops/dist/` did not exist on the deploy. Two independent reviews found it as a Critical. Today the site's five workspace dependencies (`@pair/brand` and four config packages) declare no `build` script, so the direct command works by coincidence; `packages/content-ops` has a real build and is one import away.

## Decision

1. `apps/website/vercel.json` `buildCommand` is `pnpm turbo run build --filter @pair/website`. The deploy resolves its graph through the same producer as every other build, and `^build` is honoured for whatever the site depends on, now or later.
2. The invariant is a test, not a convention to remember: `apps/website/lib/deploy-build-command.test.ts` asserts the command's shape and asks turbo's own `--dry=json` for the graph of the literal command, requiring `@pair/website#build` and every declared workspace dependency's `#build` among its dependencies. Removing `^build`, or appending `--only`, reddens it.
3. The `pnpm turbo` prefix is deliberate: turbo is a root devDependency, `apps/website/node_modules/.bin` has no `turbo`, and Vercel runs the command from the project root directory. One canonical spelling is pinned; `pnpm exec turbo` / `npx turbo` forms are rejected by the shape test on purpose.

## Alternatives Considered

- **Keep the direct command and add a test that simulates Vercel (clean install, no `dist/`, run the literal command)**: rejected — it tests the symptom on today's dependency set and goes green again the moment nobody imports a built package; routing through turbo removes the class.
- **Build the dependency explicitly in `buildCommand`** (`pnpm --filter @pair/content-ops build && …`): rejected — re-encodes the dependency graph by hand in a second place; turbo already owns it.

## Consequences

- Vercel's build now schedules the site's `^build` tasks first; today they are no-ops (no `build` script), so build time is unchanged (`1 successful, 1 total`, measured).
- A future `apps/website` import of a built workspace package works on the deploy without anyone remembering `vercel.json`.
- Cold-install proof at `2fb1d809` (the G0 commit): fresh worktree, `pnpm install --frozen-lockfile`, no `dist/` anywhere, literal `buildCommand` → exit 0, `Compiled successfully`.

## Adoption Impact

- `apps/website/vercel.json` — the command.
- `apps/website/lib/deploy-build-command.test.ts` — the guard.
- No change to `.pair/adoption/tech/way-of-working.md`: deploy method (ADR-008) is unchanged; this fixes the build path that method runs.
