// #645 r1-g2-contract-hash: embedded identity must equal the canonical contract hash.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const { contractHash } = await import(
  pathToFileURL(resolve('.claude/skills/pair-workflow-red-spec/scripts/cycle-state.mjs'))
)
const contract = JSON.parse(readFileSync(process.argv[2], 'utf8'))
assert.match(contract.contractHash, /^sha256:[0-9a-f]{64}$/)
assert.equal(contract.contractHash, contractHash(contract))
process.stdout.write('PASS embedded contract hash equals canonical hash\n')
