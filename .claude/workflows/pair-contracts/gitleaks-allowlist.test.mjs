// Row GL-1: every synthetic `lin_api_` sentinel in the linear adapter test is allowlisted repo-wide in
// .gitleaks.toml (the secret-scan CI gate otherwise reports it as generic-api-key). Hermetic: no gitleaks binary.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
let root = here
while (!existsSync(join(root, '.gitleaks.toml'))) root = dirname(root)

const repoWide = readFileSync(join(root, '.gitleaks.toml'), 'utf8')
  .split('[[allowlists]]')
  .slice(1)
  .filter(b => !/^\s*paths\s*=/m.test(b))
  .flatMap(b => [...b.matchAll(/'''(.+?)'''/g)].map(m => new RegExp(m[1])))

test('GL-1: linear-adapter sentinel token is allowlisted repo-wide', () => {
  const src = readFileSync(join(here, 'linear-adapter.test.mjs'), 'utf8')
  const literals = [...src.matchAll(/lin_api_\w+/g)].map(m => m[0])
  assert.ok(literals.length > 0, 'sentinel literal present in linear-adapter.test.mjs')
  for (const l of literals) assert.ok(repoWide.some(r => r.test(l)), `${l} not allowlisted in .gitleaks.toml`)
})
