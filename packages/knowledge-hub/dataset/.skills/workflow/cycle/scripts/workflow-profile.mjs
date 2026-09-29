#!/usr/bin/env node
// Workflow profiles (US-488): which engine, model, effort and context policy each delivery-cycle
// stage uses, declared as named JSON profiles and resolved ONCE per run.
//
// ONE implementation, two callers: `pair-workflow-cycle`'s in-session coordinator runs the CLI below,
// and `pair-cli run --card` spawns the same CLI through its script bridge — neither re-implements the
// cascade, the validation or the model-class lookup. Dependency-free, no build step.
//
// The `context` rule is NOT restated here: whether a stage may `reuse` is asked of `cycle-state.mjs`'s
// own table (`contextReuseAdmissibleInto`), the single owner (#486 T-2).
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve as resolvePath, sep } from 'node:path'
import { contextReuseAdmissibleInto } from './cycle-state.mjs'

export const STAGES = ['prepare', 'validate', 'implement', 'green', 'verify', 'contract', 'merge']
export const FIELDS = ['engine', 'model', 'effort', 'context']
export const EFFORTS = ['default', 'low', 'medium', 'high', 'xhigh', 'max']
export const CONTEXTS = ['fresh', 'reuse']
// The KB default (D21): the schema default for engine and model, default effort, a fresh context.
export const KB_DEFAULT = { engine: 'default', model: 'default', effort: 'default', context: 'fresh' }
const TOP_KEYS = ['name', 'description', 'defaults', 'stages', 'modelClasses']

const isObject = v => typeof v === 'object' && v !== null && !Array.isArray(v)

function fieldErrors(where, entry) {
  const errs = []
  if (!isObject(entry)) return [`${where}: must be an object`]
  for (const k of Object.keys(entry)) if (!FIELDS.includes(k)) errs.push(`${where}: unknown field '${k}' (allowed: ${FIELDS.join(', ')})`)
  for (const k of ['engine', 'model']) if (entry[k] !== undefined && (typeof entry[k] !== 'string' || entry[k].trim() === '')) errs.push(`${where}.${k}: must be a non-empty string`)
  if (entry.effort !== undefined && !EFFORTS.includes(entry.effort)) errs.push(`${where}.effort: '${entry.effort}' is not one of ${EFFORTS.join(' | ')}`)
  if (entry.context !== undefined && !CONTEXTS.includes(entry.context)) errs.push(`${where}.context: '${entry.context}' is not one of ${CONTEXTS.join(' | ')}`)
  return errs
}

/** `{ errors: string[] }` — empty when the profile is valid. Fail-closed on any unknown key. */
export function validateProfile(profile) {
  if (!isObject(profile)) return { errors: ['profile: must be an object'] }
  const errs = []
  if (typeof profile.name !== 'string' || profile.name.trim() === '') errs.push('name: must be a non-empty string')
  for (const k of Object.keys(profile)) if (!TOP_KEYS.includes(k)) errs.push(`profile: unknown key '${k}' (allowed: ${TOP_KEYS.join(', ')})`)
  if (profile.defaults !== undefined) errs.push(...fieldErrors('defaults', profile.defaults))
  if (profile.stages !== undefined) {
    if (!isObject(profile.stages)) errs.push('stages: must be an object keyed by stage id')
    else
      for (const [stage, entry] of Object.entries(profile.stages)) {
        if (!STAGES.includes(stage)) {
          errs.push(`stages: unknown stage '${stage}' (known: ${STAGES.join(', ')})`)
          continue
        }
        errs.push(...fieldErrors(`stages.${stage}`, entry))
        // A stage entry's own `reuse` must be one the transition table admits — never accepted here
        // and silently overridden at dispatch time.
        if (isObject(entry) && entry.context === 'reuse' && !contextReuseAdmissibleInto(stage))
          errs.push(`stages.${stage}.context: 'reuse' is not admissible into '${stage}' by the cycle transition table (cycle-state.mjs CONTEXT_TABLE) — the stage always runs fresh`)
      }
  }
  return { errors: errs }
}

/**
 * The per-field value of one stage, each with where it came from: `stage` > `defaults` > `KB default`.
 * A `defaults.context: reuse` applies only where the transition table admits it (never an error).
 */
export function effectiveStage(profile, stage) {
  const out = {}
  for (const f of FIELDS) {
    const own = profile?.stages?.[stage]?.[f]
    const dflt = profile?.defaults?.[f]
    if (own !== undefined) out[f] = { value: own, source: 'stage' }
    else if (dflt !== undefined) out[f] = { value: dflt, source: 'defaults' }
    else out[f] = { value: KB_DEFAULT[f], source: 'KB default' }
  }
  if (out.context.value === 'reuse' && out.context.source === 'defaults' && !contextReuseAdmissibleInto(stage)) out.context = { value: 'fresh', source: 'defaults' }
  return out
}

// ── resolution (AC2, AC3, AC8) ───────────────────────────────────────────────────────────────
// Cascade, resolved ONCE per run: --workflow-config (an external file, verbatim) > --profile (looked up
// in `files`/`inline`) > pair.config.json's `workflowProfiles.default` > the KB default.

/** A typed HALT: `code` is one of profile-invalid | profile-unresolved | profile-name-collision. */
export class ProfileError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`)
    this.code = code
    this.detail = detail
  }
}

const canonical = v =>
  Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : isObject(v) ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v)
/** The profile's content hash — what every handoff records for audit. */
export const profileHash = profile => createHash('sha256').update(canonical(profile)).digest('hex')

const CONFIG_KEYS = ['default', 'files', 'inline']

function readBlock(root) {
  const path = join(root, 'pair.config.json')
  if (!existsSync(path)) return {}
  let config
  try {
    config = JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    throw new ProfileError('profile-invalid', `${path} is not valid JSON: ${e.message}`)
  }
  const block = isObject(config) ? config.workflowProfiles : undefined
  if (block === undefined) return {}
  if (!isObject(block)) throw new ProfileError('profile-invalid', 'pair.config.json workflowProfiles: must be an object')
  const errs = []
  for (const k of Object.keys(block)) if (!CONFIG_KEYS.includes(k)) errs.push(`workflowProfiles: unknown key '${k}' (allowed: ${CONFIG_KEYS.join(', ')})`)
  if (block.default !== undefined && (typeof block.default !== 'string' || block.default === '')) errs.push('workflowProfiles.default: must be a profile name')
  const files = block.files === undefined ? [] : Array.isArray(block.files) ? block.files : [block.files]
  if (files.some(f => typeof f !== 'string' || f === '')) errs.push('workflowProfiles.files: must be a glob or an array of globs')
  if (block.inline !== undefined && !isObject(block.inline)) errs.push('workflowProfiles.inline: must be an object keyed by profile name')
  if (errs.length) throw new ProfileError('profile-invalid', errs.join('; '))
  return { default: block.default, files, inline: block.inline ?? {} }
}

// A small glob (no dependency, Node >= 20): `*` inside a segment, `**` as a whole segment.
const segmentRe = seg => new RegExp(`^${seg.split('*').map(p => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`)
function expandGlob(root, pattern) {
  if (isAbsolute(pattern) || pattern.split('/').includes('..')) throw new ProfileError('profile-invalid', `workflowProfiles.files: '${pattern}' escapes the project root`)
  const out = []
  const walk = (dir, segs) => {
    if (!segs.length) return
    const [seg, ...rest] = segs
    let names = []
    try {
      names = readdirSync(dir).sort()
    } catch {
      return
    }
    if (seg === '**') {
      walk(dir, rest)
      for (const n of names) if (statSync(join(dir, n)).isDirectory()) walk(join(dir, n), segs)
      return
    }
    const re = segmentRe(seg)
    for (const n of names) {
      if (!re.test(n)) continue
      const full = join(dir, n)
      if (!rest.length) statSync(full).isFile() && out.push(full)
      else if (statSync(full).isDirectory()) walk(full, rest)
    }
  }
  walk(root, pattern.split('/').filter(Boolean))
  return [...new Set(out)]
}

function loadIndex(root, block) {
  const byName = new Map()
  const unparsable = []
  const notes = []
  for (const glob of block.files ?? [])
    for (const file of expandGlob(root, glob)) {
      let body
      try {
        body = JSON.parse(readFileSync(file, 'utf8'))
      } catch {
        unparsable.push(relative(root, file))
        continue
      }
      const name = isObject(body) && typeof body.name === 'string' ? body.name : undefined
      if (name === undefined) {
        unparsable.push(relative(root, file))
        continue
      }
      if (byName.has(name)) throw new ProfileError('profile-name-collision', `profile '${name}' is declared by both ${byName.get(name).path} and ${file}`)
      byName.set(name, { profile: body, path: file, origin: 'files' })
    }
  for (const [key, body] of Object.entries(block.inline ?? {})) {
    if (isObject(body) && body.name !== undefined && body.name !== key) throw new ProfileError('profile-invalid', `workflowProfiles.inline.${key}: name '${body.name}' does not match its key`)
    const profile = isObject(body) ? { ...body, name: key } : body
    if (byName.has(key)) notes.push(`profile '${key}': inline wins over ${relative(root, byName.get(key).path)}`)
    byName.set(key, { profile, path: 'pair.config.json (inline)', origin: 'inline' })
  }
  return { byName, unparsable, notes }
}

function finish(root, profile, source, sourceDetail, notes) {
  const { errors } = validateProfile(profile)
  if (errors.length) throw new ProfileError('profile-invalid', `${sourceDetail}: ${errors.join('; ')}`)
  const stages = Object.fromEntries(STAGES.map(stage => [stage, effectiveStage(profile, stage)]))
  return { name: profile.name, source, sourceDetail, hash: profileHash(profile), profile, stages, notes }
}

function lookup(root, block, name, source) {
  const { byName, unparsable, notes } = loadIndex(root, block)
  const hit = byName.get(name)
  if (!hit) {
    const searched = [...(block.files ?? []).map(g => `files ${g}`), ...(block.inline ? [`inline (${Object.keys(block.inline).join(', ') || 'empty'})`] : [])]
    throw new ProfileError(
      'profile-unresolved',
      `profile '${name}' (${source}) was not found. Searched: ${searched.join('; ') || 'nothing — pair.config.json declares no workflowProfiles.files/inline'}. ` +
        `Known profiles: ${[...byName.keys()].join(', ') || 'none'}.${unparsable.length ? ` Unreadable profile files: ${unparsable.join(', ')}.` : ''}`,
    )
  }
  return finish(root, hit.profile, source, hit.path, notes)
}

/**
 * Resolves the run's profile. Pure apart from reading the named files. `root` is the project root.
 * Throws a `ProfileError` — never falls back to the KB default on an error (a typo must not quietly
 * run the whole cycle on the wrong model).
 */
export function resolveProfile({ root, profile, workflowConfig }) {
  if (workflowConfig !== undefined) {
    const path = resolvePath(root, workflowConfig)
    if (!existsSync(path)) throw new ProfileError('profile-unresolved', `--workflow-config ${path} does not exist`)
    let body
    try {
      body = JSON.parse(readFileSync(path, 'utf8'))
    } catch (e) {
      throw new ProfileError('profile-invalid', `${path} is not valid JSON: ${e.message}`)
    }
    const notes = profile !== undefined ? [`--profile '${profile}' ignored: --workflow-config wins`] : []
    return finish(root, body, '--workflow-config', path, notes)
  }
  const block = readBlock(root)
  if (profile !== undefined) return lookup(root, block, profile, 'argument')
  if (block.default !== undefined) return lookup(root, block, block.default, 'pair.config.json')
  return finish(root, { name: 'KB default' }, 'KB default', 'KB default', [])
}
