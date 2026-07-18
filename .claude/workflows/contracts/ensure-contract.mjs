#!/usr/bin/env node
// Deterministic side of the "AI-generated machine contract from KB templates"
// pattern (#292; ADR-016 (adr-016-ai-generated-template-contracts.md)): hashing,
// cache decision, contract validation, hash stamping. The SEMANTIC step
// (markdown template → vocabulary/enums) is done by the `contract-generator`
// agent — this module never parses markdown.
//
// Contract artifact shape (`*.contract.json`, git-ignored derived cache):
//   {
//     "$meta": { source, sourceHash: "sha256:<hex>", generatedAt, generator },
//     "vocabulary": { <name>: [strings...] },   // verdictOptions, severities (required,
//                                                // canonical keys), plus any others (e.g. findingFields)
//     "schema": { ...JSON Schema for the agent return value... }
//   }
//
// CLI (used by the agent — never hand-roll hash/cache/validation):
//   node ensure-contract.mjs check <template.md> <contract.json>
//     → {"status":"fresh|stale|missing|invalid","templateHash":"sha256:..."}
//   node ensure-contract.mjs write <template.md> <contract.json> <draft.json>
//     → validates the draft, stamps $meta with the template hash, persists.
//
// NOTE: the workflow sandbox (implement-batch.js) cannot import this module
// (no filesystem access); it keeps a deliberately minimal duplicate guard
// (`usableSchema`) for its own consumer-side needs. Keep both small.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

export function hashContent(content) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

const SCHEMA_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'])

// Generic JSON-Schema shape check (not a full validator): enough to guarantee
// the orchestrator can pass `schema` to an agent() call without breaking.
export function schemaErrors(node, path = 'schema') {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return [`${path} must be an object`]
  const errs = []
  if (!SCHEMA_TYPES.has(node.type))
    errs.push(`${path}.type is not a valid JSON Schema type: ${JSON.stringify(node.type)}`)
  if (node.enum !== undefined && (!Array.isArray(node.enum) || node.enum.length === 0))
    errs.push(`${path}.enum must be a non-empty array`)
  if (node.type === 'object') {
    if (node.properties !== undefined) {
      if (!node.properties || typeof node.properties !== 'object' || Array.isArray(node.properties))
        errs.push(`${path}.properties must be an object`)
      else
        for (const [key, sub] of Object.entries(node.properties))
          errs.push(...schemaErrors(sub, `${path}.properties.${key}`))
    }
    if (node.required !== undefined) {
      const keys = Object.keys(
        node.properties && typeof node.properties === 'object' ? node.properties : {},
      )
      if (!Array.isArray(node.required) || node.required.some(r => !keys.includes(r)))
        errs.push(`${path}.required entries must name declared properties`)
    }
  }
  if (node.type === 'array' && node.items !== undefined)
    errs.push(...schemaErrors(node.items, `${path}.items`))
  return errs
}

export function validateContract(contract) {
  if (!contract || typeof contract !== 'object' || Array.isArray(contract))
    return { ok: false, errors: ['contract must be a JSON object'] }
  const errors = []
  const meta = contract.$meta
  if (!meta || typeof meta !== 'object' || Array.isArray(meta))
    errors.push('$meta must be an object')
  else {
    if (typeof meta.source !== 'string' || !meta.source)
      errors.push('$meta.source must be a non-empty string')
    if (typeof meta.sourceHash !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(meta.sourceHash))
      errors.push('$meta.sourceHash must be "sha256:<64 hex chars>"')
  }
  const vocab = contract.vocabulary
  if (!vocab || typeof vocab !== 'object' || Array.isArray(vocab))
    errors.push('vocabulary must be an object')
  else {
    if (Object.keys(vocab).length === 0) errors.push('vocabulary must have at least one entry')
    for (const [key, values] of Object.entries(vocab))
      if (
        !Array.isArray(values) ||
        values.length === 0 ||
        values.some(v => typeof v !== 'string' || !v)
      )
        errors.push(`vocabulary.${key} must be a non-empty array of non-empty strings`)
    // verdictOptions and severities are CANONICAL required keys: consumers (e.g.
    // implement-batch.js) derive the reviewer prompt's vocabulary text from these
    // exact names as the single source of truth, so a contract using different
    // key names could enum-lock the schema while the prompt silently falls back
    // to a hardcoded default — reject that mismatch here, at the source.
    for (const required of ['verdictOptions', 'severities'])
      if (!Array.isArray(vocab[required]) || vocab[required].length === 0)
        errors.push(`vocabulary.${required} is required and must be a non-empty array`)
  }
  errors.push(...schemaErrors(contract.schema))
  return { ok: errors.length === 0, errors }
}

// Cache decision: given the current template hash and the raw contract file
// content (or null if absent), decide whether the contract can be reused.
//   fresh   → cache-hit, reuse as-is (no AI call)
//   stale   → template changed, regenerate
//   missing → no contract yet, generate
//   invalid → unreadable/malformed, regenerate (consumer falls back to loose meanwhile)
export function decide({ templateHash, contractRaw }) {
  if (contractRaw === null || contractRaw === undefined) return 'missing'
  let contract
  try {
    contract = JSON.parse(contractRaw)
  } catch {
    return 'invalid'
  }
  if (!validateContract(contract).ok) return 'invalid'
  return contract.$meta.sourceHash === templateHash ? 'fresh' : 'stale'
}

export function stampContract(draft, { source, sourceHash }) {
  return {
    ...draft,
    $meta: {
      ...(draft && typeof draft.$meta === 'object' ? draft.$meta : {}),
      source,
      sourceHash,
      generatedAt: new Date().toISOString(),
      generator: 'contract-generator agent (AI) via ensure-contract.mjs',
    },
  }
}

// ── CLI ────────────────────────────────────────────────────────────────────
function readOrNull(path) {
  try {
    return readFileSync(path)
  } catch {
    return null
  }
}

export function main(argv, { log = console.log, error = console.error } = {}) {
  const [cmd, templatePath, contractPath, draftPath] = argv
  const usage =
    'usage: ensure-contract.mjs check <template.md> <contract.json> | write <template.md> <contract.json> <draft.json>'
  if (
    !['check', 'write'].includes(cmd) ||
    !templatePath ||
    !contractPath ||
    (cmd === 'write' && !draftPath)
  ) {
    error(usage)
    return 2
  }
  const template = readOrNull(templatePath)
  if (template === null) {
    error(`template not found: ${templatePath}`)
    return 2
  }
  const templateHash = hashContent(template)
  if (cmd === 'check') {
    const status = decide({ templateHash, contractRaw: readOrNull(contractPath) })
    log(JSON.stringify({ status, templateHash }))
    return 0
  }
  // write
  let draft
  try {
    draft = JSON.parse(readFileSync(draftPath, 'utf8'))
  } catch (e) {
    error(`draft unreadable or not JSON: ${e.message}`)
    return 1
  }
  const stamped = stampContract(draft, { source: templatePath, sourceHash: templateHash })
  const { ok, errors } = validateContract(stamped)
  if (!ok) {
    error(`invalid contract draft:\n- ${errors.join('\n- ')}`)
    return 1
  }
  mkdirSync(dirname(contractPath), { recursive: true })
  writeFileSync(contractPath, `${JSON.stringify(stamped, null, 2)}\n`)
  log(JSON.stringify({ status: 'written', templateHash }))
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)))
}
