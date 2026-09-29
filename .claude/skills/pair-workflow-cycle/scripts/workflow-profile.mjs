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
import { existsSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONTEXT_TABLE, contextReuseAdmissibleInto } from './cycle-state.mjs'

export const STAGES = ['prepare', 'validate', 'implement', 'green', 'verify', 'contract', 'merge']
export const FIELDS = ['engine', 'model', 'effort', 'context']
export const EFFORTS = ['default', 'low', 'medium', 'high', 'xhigh', 'max']
export const CONTEXTS = ['fresh', 'reuse']
// The KB default (D21): the schema default for engine and model, default effort, a fresh context.
export const MODEL_CLASSES = ['cheap', 'balanced', 'frontier']
/** A model value meaning "the class `## Model Policy` assigns to the card's risk tier". */
export const BY_TIER = 'by-tier'
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
  if (profile.modelClasses !== undefined) {
    if (!isObject(profile.modelClasses)) errs.push('modelClasses: must be an object keyed by model class')
    else
      for (const [k, v] of Object.entries(profile.modelClasses)) {
        if (!MODEL_CLASSES.includes(k)) errs.push(`modelClasses: unknown class '${k}' (allowed: ${MODEL_CLASSES.join(', ')})`)
        else if (typeof v !== 'string' || v.trim() === '') errs.push(`modelClasses.${k}: must be a non-empty model id`)
      }
  }
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

// `## Model Policy` (#450): `risk:<tier>: cheap|balanced|frontier`, one line per tier, in
// `.pair/adoption/tech/automation.md`. Fence-blind like every reader of that file; absent file or
// section ⇒ no policy (never a HALT); a class outside the three is malformed.
function readModelPolicy(root) {
  const path = join(root, '.pair', 'adoption', 'tech', 'automation.md')
  if (!existsSync(path)) return {}
  const policy = {}
  let inSection = false
  let fenced = false
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('```')) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    if (/^##\s+/.test(line)) {
      inSection = line.replace(/^##\s+/, '') === 'Model Policy'
      continue
    }
    const m = inSection && /^(risk:[A-Za-z0-9_-]+):\s*(\S+)\s*$/.exec(line)
    if (!m) continue
    if (!MODEL_CLASSES.includes(m[2])) throw new ProfileError('profile-invalid', `${path}: \`## Model Policy\` maps ${m[1]} to '${m[2]}' — expected one of ${MODEL_CLASSES.join(' | ')}`)
    policy[m[1]] = m[2]
  }
  return policy
}

// A stage's model, resolved: explicit id (unchanged) | class → its concrete id | by-tier → the tier's
// class → its id | default → the engine's own default. An unknown class id is `null`, never a HALT.
function resolveModel(value, { tier, modelClasses = {}, policyOf }) {
  if (value === KB_DEFAULT.model) return { id: null, line: 'engine default' }
  const named = value === BY_TIER ? policyOf()[tier] : MODEL_CLASSES.includes(value) ? value : undefined
  if (named === undefined && value === BY_TIER) return { id: null, tier, line: `by-tier (${tier ?? 'untagged card'}) → engine default (no class declared for it in ## Model Policy)` }
  if (named === undefined) return { id: value, line: value }
  const id = modelClasses[named] ?? null
  const via = `${named}${tier ? ` (${tier})` : ''}`
  return { class: named, id, ...(tier ? { tier } : {}), line: id === null ? `${via} → engine default (no modelClasses.${named} declared)` : `${via} → ${id}` }
}

function finish(root, profile, source, sourceDetail, notes, tier) {
  const { errors } = validateProfile(profile)
  if (errors.length) throw new ProfileError('profile-invalid', `${sourceDetail}: ${errors.join('; ')}`)
  let policy
  const policyOf = () => (policy ??= readModelPolicy(root))
  const stages = Object.fromEntries(
    STAGES.map(stage => {
      const eff = effectiveStage(profile, stage)
      eff.model = { ...eff.model, resolved: resolveModel(eff.model.value, { tier, modelClasses: profile.modelClasses, policyOf }) }
      return [stage, eff]
    }),
  )
  return { name: profile.name, source, sourceDetail, hash: profileHash(profile), profile, stages, notes, ...(tier ? { tier } : {}) }
}

function lookup(root, block, name, source, tier) {
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
  return finish(root, hit.profile, source, hit.path, notes, tier)
}

/**
 * Resolves the run's profile. Pure apart from reading the named files. `root` is the project root.
 * Throws a `ProfileError` — never falls back to the KB default on an error (a typo must not quietly
 * run the whole cycle on the wrong model).
 */
export function resolveProfile({ root, profile, workflowConfig, tier }) {
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
    return finish(root, body, '--workflow-config', path, notes, tier)
  }
  const block = readBlock(root)
  if (profile !== undefined) return lookup(root, block, profile, 'argument', tier)
  if (block.default !== undefined) return lookup(root, block, block.default, 'pair.config.json', tier)
  return finish(root, { name: 'KB default' }, 'KB default', 'KB default', [], tier)
}

// ── the run's binding (AC7) ──────────────────────────────────────────────────────────────────
// The resolved profile's identity is written beside the run's handoffs, and `cycle-state.mjs publish`
// stamps `workflowProfile: { name, hash }` from it into every handoff (the same file name is spelled
// there — a test pins the pair). It is AUDIT only: it is never an effective input, so swapping the
// profile mid-cycle invalidates nothing.
export const PROFILE_BINDING_FILE = '.workflow-profile.json'

/** `bound` (first time), `reused` (same content hash), `rebound` (the profile changed; `previous` says from what). */
export function bindProfile({ dir, resolved }) {
  const path = join(dir, PROFILE_BINDING_FILE)
  const binding = { name: resolved.name, hash: resolved.hash, source: resolved.source }
  let previous
  if (existsSync(path))
    try {
      previous = JSON.parse(readFileSync(path, 'utf8'))
    } catch {}
  if (previous?.hash === binding.hash && previous?.name === binding.name) return { action: 'reused', binding }
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(binding, null, 2) + '\n')
  renameSync(tmp, path)
  return previous ? { action: 'rebound', binding, previous } : { action: 'bound', binding }
}

// ── what the coordinators print and pass on (AC6, AC5) ───────────────────────────────────────

/** The one transparency block printed BEFORE the first dispatch: profile, source, hash, then every stage. */
export function describeProfile(resolved) {
  const where = resolved.sourceDetail && resolved.sourceDetail !== resolved.source ? ` — ${resolved.sourceDetail}` : ''
  const lines = [`Profile: ${resolved.name} (source: ${resolved.source}${where}) hash ${resolved.hash.slice(0, 12)}`]
  if (resolved.tier) lines.push(`  Card tier: ${resolved.tier}`)
  for (const stage of STAGES) {
    const s = resolved.stages[stage]
    const cell = f => `${f.text ?? f.value} (${f.source})`
    lines.push(
      `  ${stage.padEnd(9)} | engine ${cell(s.engine)} | model ${cell({ ...s.model, text: s.model.resolved.line })} | effort ${cell(s.effort)} | context ${cell(s.context)}`,
    )
  }
  for (const n of resolved.notes ?? []) lines.push(`  note: ${n}`)
  return lines
}

/**
 * The profile's `reuse` stages as `cycle-state.mjs`'s own `contextPolicy` (keyed by transition). Only
 * transitions the table admits are ever named, so `resolve` accepts it by construction.
 */
export function profileContextPolicy(resolved) {
  const policy = {}
  for (const stage of STAGES)
    if (resolved.stages[stage].context.value === 'reuse')
      for (const transition of CONTEXT_TABLE.reuseAllowed) if (transition.split('->')[1] === stage) policy[transition] = 'reuse'
  return policy
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────
//   node workflow-profile.mjs resolve --root <project root> [--profile <name>] [--workflow-config <path>]
//        [--tier risk:<tier>] [--dir <run/story dir>]
//   node workflow-profile.mjs bind --dir <run/story dir> --name <n> --hash <sha256> [--source <s>]
//     → { action: bound | reused | rebound, binding } — records an identity already resolved, never re-resolving.
//   resolve →
//     the resolved profile as JSON { name, source, sourceDetail, hash, stages, table, contextPolicy,
//       notes, binding? }; `--dir` also binds it to the run (stamped into every later handoff).
//     A refusal is `{ halt, detail }` on stdout, exit 1 (profile-unresolved | profile-invalid |
//     profile-name-collision); a usage error is `{ error }`, exit 2.
const isMain = () => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}
if (isMain()) {
  const out = o => process.stdout.write(JSON.stringify(o) + '\n')
  try {
    const [cmd, ...rest] = process.argv.slice(2)
    const opts = {}
    for (let i = 0; i < rest.length; i += 2) {
      if (!rest[i].startsWith('--') || rest[i + 1] === undefined) throw new Error(`malformed arguments near ${rest[i]}`)
      opts[rest[i].slice(2)] = rest[i + 1]
    }
    const FLAGS = { resolve: ['root', 'profile', 'workflow-config', 'tier', 'dir'], bind: ['dir', 'name', 'hash', 'source'] }
    if (!FLAGS[cmd]) throw new Error(`unknown command: ${cmd} (expected resolve | bind)`)
    const unknown = Object.keys(opts).filter(k => !FLAGS[cmd].includes(k))
    if (unknown.length) throw new Error(`unknown flag(s) for ${cmd}: ${unknown.map(k => `--${k}`).join(', ')}`)
    if (cmd === 'bind') {
      // Records an identity a coordinator ALREADY resolved (and printed) — it never re-resolves.
      for (const k of ['dir', 'name', 'hash']) if (opts[k] === undefined) throw new Error(`--${k} is required`)
      if (!/^[0-9a-f]{64}$/.test(opts.hash)) throw new Error('--hash must be a sha256 hex digest')
      out(bindProfile({ dir: opts.dir, resolved: { name: opts.name, hash: opts.hash, source: opts.source ?? 'unknown' } }))
      process.exit(0)
    }
    if (opts.root === undefined) throw new Error('--root is required')
    const resolved = resolveProfile({ root: opts.root, profile: opts.profile, workflowConfig: opts['workflow-config'], tier: opts.tier })
    const binding = opts.dir !== undefined ? bindProfile({ dir: opts.dir, resolved }) : undefined
    out({ ...resolved, table: describeProfile(resolved), contextPolicy: profileContextPolicy(resolved), ...(binding ? { binding } : {}) })
  } catch (e) {
    if (e instanceof ProfileError) {
      out({ halt: e.code, detail: e.detail })
      process.exit(1)
    }
    out({ error: e.message })
    process.exit(2)
  }
}
