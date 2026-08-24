/**
 * The optional `engine` block of `pair.config.json` (US-451 T-3).
 *
 * ```json
 * { "engine": { "id": "pi" } }
 * ```
 *
 * DELTA-ONLY (D21): the block exists purely to DEVIATE from the schema default, so a
 * repository with no `pair.config.json` at all resolves an engine and runs (AC12), and
 * `pair install` keeps writing nothing — nothing needs to be written for the default to
 * apply. Its absence is a valid state and never a warning.
 *
 * The known engine ids are INJECTED rather than imported: the config layer is below the
 * command layer (`#registry` and `#config` are imported BY commands, never the reverse), and
 * the engine map is command-layer data. Passing the ids in keeps this guard engine-agnostic —
 * the same reason the automation-policy label is never hardcoded in a skill (D18).
 */

/** What the block may declare. One field; anything else is a config mistake, not an extension. */
export interface EngineDeclaration {
  id: string
}

const DECLARABLE_FIELDS = ['id'] as const

export interface EngineBlockOutcome {
  /** The declared engine id, present only when the block is valid. */
  engine?: string
  /** Validation errors, in the same style as the registry ones (empty ⇒ valid or absent). */
  errors: string[]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Reads and validates the optional `engine` block.
 *
 * A malformed block is an ERROR, never a silent drop to the default: an operator who wrote
 * `{"engine":{"id":"opencde"}}` and got a Claude Code run would have no way to tell the typo
 * from a working configuration. Unknown keys are rejected too — an unrecognised field must
 * never travel on to a spawn.
 */
export function readEngineDeclaration(
  config: unknown,
  knownEngineIds: readonly string[],
): EngineBlockOutcome {
  if (!isPlainObject(config) || !('engine' in config)) return { errors: [] }

  const block = config['engine']
  if (!isPlainObject(block)) {
    return { errors: ['engine: must be an object, e.g. {"engine": {"id": "pi"}}'] }
  }

  const unknownFields = Object.keys(block).filter(
    key => !(DECLARABLE_FIELDS as readonly string[]).includes(key),
  )
  if (unknownFields.length > 0) {
    return { errors: [`engine: unknown field(s) ${unknownFields.join(', ')}`] }
  }

  const id = block['id']
  if (typeof id !== 'string' || id.trim().length === 0) {
    return { errors: ['engine.id: must be a non-empty string'] }
  }
  if (!knownEngineIds.includes(id)) {
    return {
      errors: [`engine.id: unknown engine '${id}' (supported: ${knownEngineIds.join(', ')})`],
    }
  }

  return { engine: id, errors: [] }
}
