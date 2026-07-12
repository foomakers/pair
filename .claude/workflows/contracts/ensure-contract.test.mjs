// Tests for the deterministic side of the md → contract.json pattern (#292):
// hashing, cache decision (fresh/stale/missing/invalid), contract validation,
// stamping, and the CLI fixture dry-run (cache-hit / cache-miss / fallback path).
// Run: node --test .claude/workflows
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import {
  hashContent,
  decide,
  validateContract,
  schemaErrors,
  stampContract,
} from './ensure-contract.mjs'

const CLI = fileURLToPath(new URL('./ensure-contract.mjs', import.meta.url))

// ── fixtures ───────────────────────────────────────────────────────────────
const TEMPLATE_V1 = '# Code Review Template\n\n- [ ] **Approved**\n'
const TEMPLATE_V2 = '# Code Review Template\n\n- [ ] **Approved**\n- [ ] **Rejected**\n'

function goodDraft() {
  return {
    vocabulary: {
      verdictOptions: ['Approved', 'Approved with Comments', 'Request Changes', 'Comment Only'],
      severities: ['Critical', 'Major', 'Minor'],
      findingFields: ['location', 'severity', 'description', 'recommendation'],
    },
    schema: {
      type: 'object',
      properties: {
        verdict: {
          type: 'string',
          enum: ['Approved', 'Approved with Comments', 'Request Changes', 'Comment Only'],
        },
        needsHumanDecision: { type: 'boolean' },
        findings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              location: { type: 'string' },
              severity: { type: 'string', enum: ['Critical', 'Major', 'Minor'] },
              description: { type: 'string' },
              recommendation: { type: 'string' },
              nonActionable: { type: 'boolean' },
            },
          },
        },
      },
      required: ['verdict'],
    },
  }
}

function stamped(templateContent = TEMPLATE_V1) {
  return stampContract(goodDraft(), {
    source: 'template.md',
    sourceHash: hashContent(templateContent),
  })
}

// ── hashContent ────────────────────────────────────────────────────────────
test('hashContent is deterministic and prefixed', () => {
  assert.equal(hashContent(TEMPLATE_V1), hashContent(TEMPLATE_V1))
  assert.match(hashContent(TEMPLATE_V1), /^sha256:[0-9a-f]{64}$/)
})

test('hashContent differs when the template changes', () => {
  assert.notEqual(hashContent(TEMPLATE_V1), hashContent(TEMPLATE_V2))
})

// ── decide (cache decision) ────────────────────────────────────────────────
test('decide: missing contract → missing (cache-miss, generate)', () => {
  assert.equal(decide({ templateHash: hashContent(TEMPLATE_V1), contractRaw: null }), 'missing')
})

test('decide: unchanged template hash → fresh (cache-hit, AC2)', () => {
  const raw = JSON.stringify(stamped(TEMPLATE_V1))
  assert.equal(decide({ templateHash: hashContent(TEMPLATE_V1), contractRaw: raw }), 'fresh')
})

test('decide: changed template hash → stale (regenerate, AC3)', () => {
  const raw = JSON.stringify(stamped(TEMPLATE_V1))
  assert.equal(decide({ templateHash: hashContent(TEMPLATE_V2), contractRaw: raw }), 'stale')
})

test('decide: non-JSON contract → invalid (fallback path, AC4)', () => {
  assert.equal(
    decide({ templateHash: hashContent(TEMPLATE_V1), contractRaw: '{not json' }),
    'invalid',
  )
})

test('decide: structurally bad contract → invalid (fallback path, AC4)', () => {
  const bad = JSON.stringify({
    $meta: { source: 't.md', sourceHash: hashContent(TEMPLATE_V1) },
    schema: { type: 'nope' },
  })
  assert.equal(decide({ templateHash: hashContent(TEMPLATE_V1), contractRaw: bad }), 'invalid')
})

// ── validateContract ───────────────────────────────────────────────────────
test('validateContract accepts a stamped well-formed contract', () => {
  const { ok, errors } = validateContract(stamped())
  assert.deepEqual(errors, [])
  assert.equal(ok, true)
})

test('validateContract rejects a missing/invalid $meta', () => {
  const c = stamped()
  delete c.$meta
  assert.equal(validateContract(c).ok, false)
  const c2 = stamped()
  c2.$meta.sourceHash = 'md5:abc'
  assert.equal(validateContract(c2).ok, false)
})

test('validateContract rejects empty or non-string vocabulary entries', () => {
  const c = stamped()
  c.vocabulary.severities = []
  assert.equal(validateContract(c).ok, false)
  const c2 = stamped()
  c2.vocabulary = {}
  assert.equal(validateContract(c2).ok, false)
})

test('validateContract rejects non-object input', () => {
  assert.equal(validateContract(null).ok, false)
  assert.equal(validateContract([1]).ok, false)
  assert.equal(validateContract('x').ok, false)
})

// ── schemaErrors (generic JSON Schema shape) ───────────────────────────────
test('schemaErrors: valid nested schema has no errors', () => {
  assert.deepEqual(schemaErrors(goodDraft().schema), [])
})

test('schemaErrors: invalid type keyword', () => {
  assert.ok(schemaErrors({ type: 'strnig' }).length > 0)
})

test('schemaErrors: empty enum rejected', () => {
  assert.ok(schemaErrors({ type: 'string', enum: [] }).length > 0)
})

test('schemaErrors: required must name declared properties', () => {
  const s = { type: 'object', properties: { a: { type: 'string' } }, required: ['b'] }
  assert.ok(schemaErrors(s).length > 0)
})

test('schemaErrors: recurses into array items and object properties', () => {
  const s = { type: 'object', properties: { xs: { type: 'array', items: { type: 'bogus' } } } }
  assert.ok(schemaErrors(s).some(e => e.includes('items')))
})

// ── stampContract ──────────────────────────────────────────────────────────
test('stampContract embeds source, hash and generation metadata', () => {
  const c = stampContract(goodDraft(), { source: 'x.md', sourceHash: hashContent(TEMPLATE_V1) })
  assert.equal(c.$meta.source, 'x.md')
  assert.equal(c.$meta.sourceHash, hashContent(TEMPLATE_V1))
  assert.ok(c.$meta.generatedAt)
})

// ── CLI fixture dry-run (end-to-end cache lifecycle) ───────────────────────
function cli(...argv) {
  const r = spawnSync(process.execPath, [CLI, ...argv], { encoding: 'utf8' })
  return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() }
}

test('CLI dry-run: missing → write → fresh (cache-hit) → template change → stale → corrupt → invalid', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contract-292-'))
  try {
    const template = join(dir, 'template.md')
    const contract = join(dir, 'out.contract.json')
    const draft = join(dir, 'out.contract.draft.json')
    writeFileSync(template, TEMPLATE_V1)

    // cache-miss: no contract yet
    let r = cli('check', template, contract)
    assert.equal(r.code, 0)
    assert.equal(JSON.parse(r.out).status, 'missing')

    // generator writes a draft; write validates, stamps hash, persists
    writeFileSync(draft, JSON.stringify(goodDraft()))
    r = cli('write', template, contract, draft)
    assert.equal(r.code, 0, r.err)
    assert.equal(JSON.parse(r.out).status, 'written')
    const written = JSON.parse(readFileSync(contract, 'utf8'))
    assert.equal(written.$meta.sourceHash, hashContent(readFileSync(template)))

    // cache-hit: unchanged template → fresh, no regeneration needed (AC2)
    r = cli('check', template, contract)
    assert.equal(JSON.parse(r.out).status, 'fresh')

    // template changed → stale, regenerate (AC3)
    writeFileSync(template, TEMPLATE_V2)
    r = cli('check', template, contract)
    assert.equal(JSON.parse(r.out).status, 'stale')

    // malformed contract → invalid; the workflow falls back to the loose schema (AC4)
    writeFileSync(contract, '{broken')
    r = cli('check', template, contract)
    assert.equal(JSON.parse(r.out).status, 'invalid')

    // write rejects an invalid draft (never persists garbage)
    writeFileSync(draft, JSON.stringify({ schema: { type: 'bogus' } }))
    r = cli('write', template, contract, draft)
    assert.notEqual(r.code, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CLI: missing template is a hard error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contract-292-'))
  try {
    const r = cli('check', join(dir, 'nope.md'), join(dir, 'c.json'))
    assert.notEqual(r.code, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
