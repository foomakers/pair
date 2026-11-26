import { fileSystemService as fs } from '@pair/content-ops'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'

const root = resolve(__dirname, '../../../..')
const compiler = join(root, 'packages/dev-tools/node_modules/@typescript/native/bin/tsc')

const publicEntries = [
  ['apps/pair-cli', 'pair-cli', ''],
  ['packages/content-ops', 'content-ops', ''],
  ['packages/content-ops', 'content-ops', '/file-system'],
  ['packages/content-ops', 'content-ops', '/http'],
  ['packages/content-ops', 'content-ops', '/ops/SyncOptions'],
  ['packages/content-ops', 'content-ops', '/test-utils/in-memory-fs'],
  ['packages/workflows', 'workflows', ''],
  ['packages/workflows', 'workflows', '/cli'],
  ['packages/workflows', 'workflows', '/worktree'],
]

it.each(publicEntries)(
  '#757 AC-2: %s resolves %s%s with explicit consumer types',
  (workspace, name, entry) => {
    const cwd = fs.mkdtempSync(join(tmpdir(), 'pair-declaration-consumer-'))
    try {
      const scope = join(cwd, 'node_modules/@pair')
      fs.mkdirSync(scope, { recursive: true })
      fs.symlinkSync(join(root, workspace), join(scope, name))
      fs.writeFileSync(join(cwd, 'consumer.ts'), `export * from '@pair/${name}${entry}'\n`)
      fs.writeFileSync(
        join(cwd, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            lib: ['ES2022'],
            target: 'ES2022',
            module: 'NodeNext',
            strict: true,
            types: [],
            noEmit: true,
          },
          files: ['consumer.ts'],
        }),
      )

      const check = spawnSync(process.execPath, [compiler, '--pretty', 'false'], {
        cwd,
        encoding: 'utf8',
      })
      expect(check.error).toBeUndefined()
      expect(check.status, check.stdout + check.stderr).toBe(0)
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true })
    }
  },
)
