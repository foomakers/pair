import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The deploy path is a build path, and it is the only one turbo does not own by default.
 *
 * Vercel runs `apps/website/vercel.json`'s `buildCommand` LITERALLY. Every other build in this
 * repo — `pnpm build`, CI, the pre-push hook — goes through turbo, whose `build` task declares
 * `dependsOn: ["^build"]`, so a workspace dependency's `dist/` exists before `next build` reads
 * it. A `buildCommand` that calls the package script directly skips that edge: the moment
 * `apps/website` imports a workspace package, local and CI stay green while the deploy fails
 * on a missing `dist/` (MEASURED on PR #471: `Type error: Cannot find module
 * '@pair/content-ops/…'` in the Vercel preview job, every other gate PASS).
 *
 * Today the site's workspace deps ship source, not a build output — `@pair/brand` and four config
 * packages, none of which declares a `build` script — so the direct command happens to work.
 * `packages/content-ops` (real `build`: `tsc -b`) exists in this repo today; the hazard is one
 * import away, not hypothetical. This guard exists so the coincidence is not something to
 * remember: the deploy must resolve its graph through the same producer as everything else.
 */
const WEBSITE = resolve(__dirname, '..')
const REPO_ROOT = resolve(WEBSITE, '..', '..')

describe('vercel.json deploy contract', () => {
  const vercel = JSON.parse(readFileSync(resolve(WEBSITE, 'vercel.json'), 'utf8')) as {
    buildCommand?: string
  }

  it('routes the deploy build through turbo, not straight at the package script', () => {
    expect(vercel.buildCommand, 'vercel.json declares no buildCommand').toBeTypeOf('string')
    // `pnpm turbo run build --filter @pair/website` — the `run` form, so turbo (not pnpm's
    // --filter) resolves the graph. Anything invoking the package script directly bypasses
    // `^build` and is exactly the shape that broke the preview deploy.
    expect(vercel.buildCommand).toMatch(/^pnpm turbo run build\b/)
    expect(vercel.buildCommand).toMatch(/--filter[= ]@pair\/website\b/)
    expect(vercel.buildCommand).not.toMatch(/pnpm --filter @pair\/website build/)
  })

  it('asks turbo for a graph that contains the site build and every ^build it depends on', () => {
    // Real producer, not a regex: turbo's own dry run of the LITERAL buildCommand. The graph must
    // contain @pair/website#build, and each workspace dependency the site declares must have its
    // #build scheduled ahead of it — that is the edge the direct command silently dropped.
    // MEASURED at 2fb1d809 (G0 commit): the site's five workspace deps (@pair/brand and four config packages)
    // declare no `build` script, so those five edges are no-op tasks today and a real run reports
    // `1 successful, 1 total`. The assertion is about the EDGE existing, not the work it does: the
    // day a dependency with a real build (the shape PR #471 had with @pair/content-ops) is added,
    // the same edge is what makes its dist/ exist before `next build` — and the direct command
    // would still have none.
    const cmd = String(vercel.buildCommand)
    // Fail fast with the real diagnosis instead of shelling out `pnpm turbo run pnpm --filter …`
    // when the command is not the turbo form: test 1 owns the shape, this test owns the graph.
    expect(
      cmd,
      `buildCommand is not turbo-routed, so turbo cannot be asked for its graph: ${cmd}`,
    ).toMatch(/^pnpm turbo run /)
    const args = cmd
      .replace(/^pnpm turbo run /, '')
      .split(/\s+/)
      .filter(Boolean)
    let out: string
    try {
      out = execFileSync('pnpm', ['turbo', 'run', ...args, '--dry=json'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        // Strictly below the test's 60s budget, so a hang surfaces as the exec timeout with turbo's
        // stderr attached, not as vitest's generic timeout.
        timeout: 45_000,
      })
    } catch (e) {
      // turbo prints its banner to stderr and the actual diagnosis (unknown task, bad filter) to
      // stdout, so both streams are attached — a bare `Command failed` says nothing useful.
      const err = e as { stdout?: string; stderr?: string; message?: string }
      const detail = [err.stdout, err.stderr]
        .map(s => s?.trim())
        .filter(Boolean)
        .join('\n')
      throw new Error(`turbo rejected the literal buildCommand (${cmd}): ${detail || err.message}`)
    }
    const plan = JSON.parse(out) as { tasks: Array<{ taskId: string; dependencies?: string[] }> }
    const ids = plan.tasks.map(t => t.taskId)
    expect(ids).toContain('@pair/website#build')
    const site = plan.tasks.find(t => t.taskId === '@pair/website#build')!
    const pkg = JSON.parse(readFileSync(resolve(WEBSITE, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const workspaceDeps = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })
      .filter(([, v]) => String(v).startsWith('workspace:'))
      .map(([k]) => k)
    for (const dep of workspaceDeps) {
      expect(site.dependencies ?? [], `${dep}#build must precede @pair/website#build`).toContain(
        `${dep}#build`,
      )
    }
  }, 60_000)
})
