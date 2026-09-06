import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(__dirname, '../../..')
const VERCEL_JSON = resolve(__dirname, '../vercel.json')

/**
 * THE DEPLOY PATH IS A BUILD PATH, and it is the only one turbo does not own.
 *
 * `apps/website/vercel.json`'s `buildCommand` is what actually ships the docs site.
 * When it invokes the package script directly (`pnpm --filter @pair/website build`) it
 * bypasses turbo, so the workspace edge `@pair/website -> @pair/content-ops` — declared
 * in turbo.json as `build.dependsOn: ["^build"]` — is never honoured and
 * `packages/content-ops/dist/` does not exist when `next build` runs. `next build`'s
 * type-check phase covers every `.ts` under `lib` (tsconfig includes them; `exclude`
 * lists only node_modules, .next, test files and `scripts`), and
 * `lib/docs-staleness-check.ts:25` imports
 * `@pair/content-ops/markdown/commonmark-blocks`.
 *
 * MEASURED in this worktree at HEAD 965a60f2, with `packages/content-ops/dist/` and
 * `packages/content-ops/tsconfig.build.tsbuildinfo` moved aside (the clean-checkout
 * state), running the LITERAL buildCommand:
 *
 *     $ pnpm --filter @pair/website build
 *     ✓ Compiled successfully in 4.2s
 *     Linting and checking validity of types ...
 *     Failed to compile.
 *     ./lib/docs-staleness-check.ts:25:8
 *     Type error: Cannot find module '@pair/content-ops/markdown/commonmark-blocks'
 *       or its corresponding type declarations.
 *     ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL @pair/website@0.4.3 build: `next build`
 *
 * ...and, same state, the turbo-routed form:
 *
 *     $ pnpm turbo run build --filter @pair/website
 *     Tasks:    2 successful, 2 total          (@pair/content-ops#build, @pair/website#build)
 *
 * The whole local/turbo surface stays green either way — `pnpm build`, CI's `build` job
 * and the pre-push hook all go through turbo — so this is invisible everywhere EXCEPT
 * the one command that ships the site. It is the same clean-checkout class the
 * `docs:staleness` / `docs:anchor-oracle` turbo tasks were added for, on the deploy path.
 *
 * The assertion is not a string match on the config: the string only decides WHICH
 * producer resolves the graph, and the real producer — turbo — is then asked for the
 * task graph of that exact command. A `buildCommand` that routes through turbo but
 * somehow does not schedule `@pair/content-ops#build` fails here too.
 */
describe('vercel buildCommand honours the workspace build graph', () => {
  const vercel = JSON.parse(readFileSync(VERCEL_JSON, 'utf-8')) as {
    readonly buildCommand?: string
  }

  it('routes the deploy build through turbo, not straight at the package script', () => {
    // `pnpm --filter <pkg> <script>` runs ONE script and resolves no `^build` edge.
    expect(vercel.buildCommand, 'apps/website/vercel.json buildCommand').toMatch(
      /(^|\s)turbo(\s|$)/,
    )
  })

  it('schedules @pair/content-ops#build before the site build, per turbo itself', () => {
    const cmd = vercel.buildCommand ?? ''
    expect(cmd, 'buildCommand must be a turbo run to have a task graph at all').toMatch(
      /(^|\s)turbo(\s|$)/,
    )
    const graph = JSON.parse(
      execFileSync('sh', ['-c', `${cmd} --dry=json`], {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
        maxBuffer: 64 * 1024 * 1024,
      }),
    ) as { readonly tasks: ReadonlyArray<{ readonly taskId: string }> }
    const ids = graph.tasks.map(t => t.taskId)
    expect(ids, 'turbo task graph for the deploy buildCommand').toContain('@pair/website#build')
    expect(ids, 'the shared CommonMark reader the site type-checks against').toContain(
      '@pair/content-ops#build',
    )
  })
})
