// Row GL-2 (control): the repo-wide allowlist is exact-value — a realistic non-sentinel `lin_api_` literal
// stays scanned (no repo-wide regex of .gitleaks.toml may match it). Hermetic: no gitleaks binary.
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

test('GL-2: non-sentinel lin_api_ literal is not allowlisted repo-wide', () => {
  const l = 'lin_api_REALISTIC0123456789abcdef'
  assert.ok(repoWide.length > 0, 'repo-wide allowlist regexes parsed')
  for (const r of repoWide) assert.ok(!r.test(l), `${l} exempted by ${r}`)
})
