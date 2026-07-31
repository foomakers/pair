/**
 * Thin entrypoint for the pre-push gate composition check (#394). All logic and
 * all tests live in `pre-push-gate-composition.ts`, per the gate-tooling ADL
 * (2026-07-13): scripts are never unit-tested.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { checkRootGate } from './pre-push-gate-composition'

const rootPackageJson = join(__dirname, '../../../../package.json')
const result = checkRootGate(readFileSync(rootPackageJson, 'utf-8'))

if (!result.ok) {
  console.error(`\n❌ pre-push gate composition\n\n${result.message}\n`)
  process.exit(1)
}
console.log('✓ pre-push gate composition: check-mode only')
