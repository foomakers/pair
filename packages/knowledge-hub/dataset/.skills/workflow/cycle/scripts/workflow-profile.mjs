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
