import { join, resolve } from 'path'
import { createRequire } from 'module'
import { existsSync } from 'fs'
import type { FileSystemService } from '@pair/content-ops'
import { extractRegistries, type Config } from '#registry'
import type { CardReadiness } from './cycle-scripts'

/** The CLI reads the installed pair-next authority; the source path is for source-level unit tests. */
const SOURCE_SCRIPT = resolve(
  __dirname,
  '../../../../../packages/knowledge-hub/dataset/.skills/next/control-state.mjs',
)
const BUNDLED_SCRIPT = resolve(__dirname, '../../assets/control-state.mjs')
const requireScript = createRequire(__filename)
export const WAY_OF_WORKING_PATH = '.pair/adoption/tech/way-of-working.md'
export const MACROSTATES = ['Draft', 'Ready', 'In Progress', 'Review', 'Done'] as const
export type Macrostate = (typeof MACROSTATES)[number]
export interface StateMappingRow {
  readonly boardState: string
  readonly macrostate: Macrostate
}
export type StateMapping = readonly StateMappingRow[] | undefined
export interface CardDocument {
  readonly title: string
  readonly body: string
  readonly boardState: string | undefined
}
export interface ReadinessVerdict {
  readonly readiness: CardReadiness
  readonly explanation: string
  readonly warnings?: readonly string[]
}
export class CardOutOfScopeError extends Error {
  override readonly name = 'CardOutOfScopeError'
}

interface ControlStateModule {
  parseStateMapping(markdown: string): StateMapping
  resolveMacrostate(literal: string, mapping: StateMapping): Macrostate | undefined
  readyBoardState(mapping: StateMapping): string
  hasTaskBreakdown(body: string): boolean
  unmetReadinessCriteria(card: Pick<CardDocument, 'title' | 'body'>): string[]
  resolveControlState(
    card: CardDocument,
    mapping: StateMapping,
  ): {
    macrostate: Macrostate | null
    readiness: CardReadiness | null
    explanation?: string
    outOfProcess?: string
    warnings: string[]
  }
  validateStatusFilter(value: string, mapping: StateMapping): string[]
}

function authority(path: string): ControlStateModule {
  try {
    return requireScript(path) as ControlStateModule
  } catch (error) {
    throw new Error(`control-state-load-failed: ${path}: ${(error as Error).message}`)
  }
}

function installedScriptInTarget(
  fs: FileSystemService,
  root: string,
  names: string[],
): string | undefined {
  for (const name of names) {
    const skill = resolve(root, name)
    if (!skill.startsWith(`${root}/`) || !fs.existsSync(join(skill, 'SKILL.md'))) continue
    const script = join(skill, 'control-state.mjs')
    if (!fs.existsSync(script))
      throw new Error(
        `control-state-load-failed: installed pair-next at ${skill} has no control-state.mjs`,
      )
    return script
  }
  return undefined
}

/** Resolve through every configured skills target, including prefixed installs. */
export function locateControlStateScript(
  fs: FileSystemService,
  config: Config,
  projectRoot: string,
): string {
  const registry = extractRegistries(config)['skills']
  const targets = registry?.targets?.map(target => target.path) ?? ['.claude/skills']
  const prefix = registry?.prefix
  const names = ['pair-next', ...(prefix ? [`${prefix}-pair-next`, 'next'] : [])]
  for (const target of targets) {
    const script = installedScriptInTarget(fs, resolve(projectRoot, target), names)
    if (script !== undefined) return script
  }
  if (existsSync(BUNDLED_SCRIPT)) return BUNDLED_SCRIPT
  if (existsSync(SOURCE_SCRIPT)) return SOURCE_SCRIPT
  throw new Error(
    `control-state-load-failed: pair-next is not installed under configured skills targets and the bundled resolver is missing`,
  )
}

export function parseStateMapping(markdown: string, script = SOURCE_SCRIPT): StateMapping {
  return authority(script).parseStateMapping(markdown)
}

export function readStateMapping(
  fs: FileSystemService,
  projectRoot: string,
  script = SOURCE_SCRIPT,
): StateMapping {
  const path = join(projectRoot, WAY_OF_WORKING_PATH)
  return fs.existsSync(path) ? parseStateMapping(fs.readFileSync(path), script) : undefined
}

export function resolveMacrostate(
  literal: string,
  mapping: StateMapping,
  script = SOURCE_SCRIPT,
): Macrostate | undefined {
  return authority(script).resolveMacrostate(literal, mapping)
}

export function readyBoardState(mapping: StateMapping, script = SOURCE_SCRIPT): string {
  return authority(script).readyBoardState(mapping)
}

export function hasTaskBreakdown(body: string, script = SOURCE_SCRIPT): boolean {
  return authority(script).hasTaskBreakdown(body)
}

export function unmetReadinessCriteria(
  card: Pick<CardDocument, 'title' | 'body'>,
  script = SOURCE_SCRIPT,
): string[] {
  return authority(script).unmetReadinessCriteria(card)
}

export function validateStatusFilter(
  value: string,
  mapping: StateMapping,
  script = SOURCE_SCRIPT,
): string[] {
  return authority(script).validateStatusFilter(value, mapping)
}

export function resolveCardReadiness(
  card: CardDocument,
  mapping: StateMapping,
  script = SOURCE_SCRIPT,
): ReadinessVerdict {
  const result = authority(script).resolveControlState(card, mapping)
  if (result.outOfProcess !== undefined) {
    throw new CardOutOfScopeError(
      `card-out-of-scope: ${result.outOfProcess} — nothing to prepare or drive, so nothing was spawned`,
    )
  }
  return {
    readiness: result.readiness!,
    explanation: result.explanation!,
    warnings: result.warnings,
  }
}
