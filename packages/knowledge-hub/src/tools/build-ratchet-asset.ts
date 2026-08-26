import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import ts from 'typescript'

/**
 * Builds the shipped coverage-ratchet asset out of the single tested source
 * (ADL 2026-07-13: gate-tooling logic lives in a tested module; ADR-023: it
 * ships as a GENERATED KB asset, not as a CLI command).
 *
 * The module imports only node builtins, so a single-file transpile is a
 * complete program — no bundler in the dependency tree.
 *
 * Output (both copies, kept byte-identical):
 *   - packages/knowledge-hub/dataset/.pair/knowledge/assets/coverage-ratchet.cjs  (shipped corpus)
 *   - .pair/knowledge/assets/coverage-ratchet.cjs                                 (pair's own installed copy)
 *
 * The committed assets are drift-guarded by
 * conformance/coverage-ratchet-asset.test.ts: editing either copy by hand —
 * or editing the source without regenerating — turns the gate red.
 */

const HEADER =
  '// GENERATED FILE — do not edit.\n' +
  '// Source: packages/knowledge-hub/src/tools/coverage-baseline-ratchet.ts\n' +
  '// Regenerate: pnpm --filter @pair/knowledge-hub ratchet:asset\n\n'

const REPO_ROOT = join(__dirname, '../../../..')
const SOURCE = join(REPO_ROOT, 'packages/knowledge-hub/src/tools/coverage-baseline-ratchet.ts')
const TARGETS = [
  join(REPO_ROOT, 'packages/knowledge-hub/dataset/.pair/knowledge/assets/coverage-ratchet.cjs'),
  join(REPO_ROOT, '.pair/knowledge/assets/coverage-ratchet.cjs'),
]

export function compileRatchetAsset(sourceText: string): string {
  const { outputText } = ts.transpileModule(sourceText, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      importHelpers: false,
      // Shipped-corpus rule (ADL 2026-08-12): no story-local (ACn) markers in KB
      // files. The source's comments carry them for pair-internal review; the
      // generated asset strips every comment instead of curating them.
      removeComments: true,
    },
    fileName: 'coverage-baseline-ratchet.ts',
  })
  return HEADER + outputText
}

function main(): void {
  const source = readFileSync(SOURCE, 'utf8')
  const compiled = compileRatchetAsset(source)
  for (const target of TARGETS) {
    const fs = require('node:fs') as typeof import('node:fs')
    fs.mkdirSync(dirname(target), { recursive: true })
    fs.writeFileSync(target, compiled)
    console.log(`ratchet:asset → ${target}`)
  }
}

if (require.main === module) main()
