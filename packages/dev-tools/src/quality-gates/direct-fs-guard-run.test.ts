import { fileSystemService as fs } from '@pair/content-ops'
import { execFileSync, spawnSync } from 'child_process'
import { randomUUID } from 'crypto'
import { readFileSync, symlinkSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import { REGISTRY_PATH, runGuard } from './direct-fs-guard'

const FS_SRC = "import fs from 'fs'\nexport default fs\n"
const row = (path: string) => ({
  path,
  disposition: 'os-guarantee',
  reason: 'r',
  decision: 'd',
  testCategory: 't',
})

let root = ''

async function repo(files: Record<string, string>, rows: object[]): Promise<string> {
  root = join(tmpdir(), `direct-fs-guard-${randomUUID()}`)
  execFileSync('git', ['init', '-q', root])
  const all = { ...files, [REGISTRY_PATH]: JSON.stringify({ rows }) }
  for (const [p, src] of Object.entries(all)) {
    await fs.mkdir(dirname(join(root, p)), { recursive: true })
    await fs.writeFile(join(root, p), src)
  }
  execFileSync('git', ['add', '-A'], { cwd: root })
  return root
}

afterEach(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true })
  root = ''
})

describe('runGuard (AC5 root gate: git ls-files -> audited filter -> registry)', () => {
  it('fails an unlisted direct-fs import with path, line and specifier', async () => {
    const r = await repo({ 'packages/x/src/a.ts': FS_SRC }, [])
    expect(runGuard(r)).toEqual([
      expect.stringContaining("packages/x/src/a.ts:1 unlisted direct-fs import 'fs'"),
    ])
  })

  it('passes a listed, reasoned entry', async () => {
    const r = await repo({ 'packages/x/src/a.ts': FS_SRC }, [row('packages/x/src/a.ts')])
    expect(runGuard(r)).toEqual([])
  })

  it('fails a stale entry whose file no longer imports fs', async () => {
    const r = await repo({ 'packages/x/src/a.ts': 'export {}\n' }, [row('packages/x/src/a.ts')])
    expect(runGuard(r)).toEqual([
      expect.stringContaining('packages/x/src/a.ts stale registry entry'),
    ])
  })

  it('ignores a non-audited tracked path (outside apps|packages|scripts)', async () => {
    const r = await repo({ 'docs/a.ts': FS_SRC }, [])
    expect(runGuard(r)).toEqual([])
  })

  // r0-3: authored code under a nested `build` dir is not generated output
  it.each(['build', 'dist', 'coverage', '.next'])(
    'scans a tracked authored file under a nested %s directory',
    async dir => {
      const p = `packages/x/src/${dir}/helper.ts`
      const r = await repo({ [p]: FS_SRC }, [])
      expect(runGuard(r)).toEqual([
        expect.stringContaining(`${p}:1 unlisted direct-fs import 'fs'`),
      ])
    },
  )

  it.each(['dist', 'build', '.next', 'coverage'])('skips package-root %s output', async dir => {
    const r = await repo({ [`packages/x/${dir}/out.js`]: FS_SRC }, [])
    expect(runGuard(r)).toEqual([])
  })

  // r0-3: third-party code stays excluded at any depth
  it('skips tracked node_modules code under a package', async () => {
    const r = await repo({ 'packages/x/node_modules/y/index.js': FS_SRC }, [])
    expect(runGuard(r)).toEqual([])
  })
})

// r0-2: the CLI wrapper (pnpm direct-fs:check) must turn runGuard's result into exit code + output.
// main() scans REPO_ROOT (resolved from its own location), so the real sources run from a temp repo.
describe('main CLI (pnpm direct-fs:check)', () => {
  const GUARD_DIR = 'packages/dev-tools/src/quality-gates'
  const guardFiles = ['direct-fs-guard.ts', 'repo-root.ts'].map(f => `${GUARD_DIR}/${f}`)
  const cli = async (rows: object[]) => {
    const files = Object.fromEntries(
      guardFiles.map(f => [f, readFileSync(join(__dirname, '..', '..', '..', '..', f), 'utf8')]),
    )
    const r = await repo({ ...files, 'packages/x/src/a.ts': FS_SRC }, rows)
    symlinkSync(
      join(__dirname, '..', '..', 'node_modules'),
      join(r, 'packages/dev-tools/node_modules'),
    )
    return spawnSync(
      process.execPath,
      [require.resolve('ts-node/dist/bin.js'), '--transpile-only', join(r, guardFiles[0])],
      {
        cwd: r,
        encoding: 'utf8',
        env: {
          ...process.env,
          TS_NODE_COMPILER_OPTIONS:
            '{"module":"NodeNext","moduleResolution":"NodeNext","rootDir":".","esModuleInterop":true}',
        },
      },
    )
  }

  it('exits 1 and prints FAIL when the registry misses an import', async () => {
    const res = await cli([row(guardFiles[0])])
    expect(res.status).toBe(1)
    expect(res.stdout).toContain('FAIL')
    expect(res.stdout).toContain("packages/x/src/a.ts:1 unlisted direct-fs import 'fs'")
  })

  it('exits 0 and prints PASS when every import is listed', async () => {
    const res = await cli([row(guardFiles[0]), row('packages/x/src/a.ts')])
    expect(res.status).toBe(0)
    expect(res.stdout).toContain('PASS')
  })
})
