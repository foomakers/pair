import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const packageDir = join(__dirname, '..')
const shippedBundle = join(
  packageDir,
  '../knowledge-hub/dataset/.skills/capability/workflow/scripts/workflow.mjs',
)

it('ships the current workflow bundle as a standalone script (#696 AC-6)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'pair-workflow-bundle-'))
  try {
    const generated = join(tempDir, 'workflow.mjs')
    const build = spawnSync('pnpm', ['bundle:workflow', '--output', generated], {
      cwd: packageDir,
      encoding: 'utf8',
      timeout: 30_000,
    })
    expect(build.status, build.error?.message ?? (build.stderr || build.stdout)).toBe(0)

    expect(
      readFileSync(generated).equals(readFileSync(shippedBundle)),
      'Regenerate the dataset bundle with `pnpm --filter @pair/workflows bundle:workflow`',
    ).toBe(true)

    const schema = execFileSync(process.execPath, [generated, 'schema'], {
      cwd: tempDir,
      env: { ...process.env, NODE_PATH: '' },
      encoding: 'utf8',
      timeout: 5_000,
    })
    expect(JSON.parse(schema)).toMatchObject({
      workflow: { properties: { version: { const: 1 } } },
    })
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}, 40_000)
