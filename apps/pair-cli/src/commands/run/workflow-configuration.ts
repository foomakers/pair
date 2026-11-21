import { join, resolve } from 'path'
import type { FileSystemService } from '@pair/content-ops'
import {
  applyOverride,
  checkAgainstEngines,
  configurationText,
  firstExisting,
  formatError,
  isConfigurationPath,
  parseConfiguration,
  selectConfiguration,
  type Configuration,
  type EngineFacts,
  type Workflow,
  type WorkflowsConfig,
} from '@pair/workflows'
import type { Config } from '#registry'
import { getKnowledgeHubDatasetPath } from '#config/kb-resolver'
import { ENGINES, isEngineId, type EngineId } from './engines'
import type { ExecutableProbe } from './resolve-engine'
import { resolveEngine } from './resolve-engine'
import { withRunAgentRunner } from './run-context'

export const CONFIGURATIONS_DIR = '.pair/adoption/tech/configurations'

/** The engines this CLI knows, as the package's injected facts. No engine declares a model list today: a model is checked by its form only (ADR-034). */
export function engineFacts(project: Config, probe: ExecutableProbe): EngineFacts {
  return {
    known: isEngineId,
    installed: id =>
      isEngineId(id) &&
      probe(withRunAgentRunner(resolveEngine({ flag: id }), project).engine.command),
    models: () => undefined,
    supportsEffort: id => isEngineId(id) && ENGINES[id].effortArgs !== undefined,
  }
}

/** What a run launches with: the effective configuration, its text (what is frozen) and the override applied. */
export interface ConfigurationPlan {
  readonly configuration: Configuration
  readonly text: string
  readonly override?: unknown
  /** Printed once: what was chosen and from where. */
  readonly source: string
}

export interface ConfigurationInput {
  readonly fs: FileSystemService
  readonly cwd: string
  readonly main: string
  readonly project: Config
  readonly workflow: Workflow
  readonly flag?: string | undefined
  readonly override?: string | undefined
  readonly engineFlag?: EngineId | undefined
  readonly engine: EngineId
  readonly probe: ExecutableProbe
}

export interface ConfigurationOutcome {
  readonly plan?: ConfigurationPlan
  readonly warnings: readonly string[]
  readonly errors: readonly string[]
}

const refused = (...errors: string[]): ConfigurationOutcome => ({ errors, warnings: [] })

function locate(fs: FileSystemService, name: string, at: { cwd: string; main: string }) {
  if (isConfigurationPath(name))
    return firstExisting([resolve(at.cwd, name)], p => fs.existsSync(p))
  const candidates = [join(at.main, CONFIGURATIONS_DIR, `${name}.yaml`)]
  try {
    candidates.push(join(getKnowledgeHubDatasetPath(fs), CONFIGURATIONS_DIR, `${name}.yaml`))
  } catch {
    // no knowledge base beside this CLI: the project is the only place
  }
  // The project's file is first: it replaces the knowledge-base file of the same name entirely.
  return firstExisting(candidates, p => fs.existsSync(p) && fs.statSync(p).isFile())
}

/** The selected file, parsed: `undefined` when nothing is selected; else the configuration or the refusal. */
function load(input: ConfigurationInput, selection: { name: string; via: string } | undefined) {
  if (selection === undefined) return undefined
  const found = locate(input.fs, selection.name, input)
  if (found === undefined)
    return refused(
      `configuration-not-found: '${selection.name}' (${selection.via}) is neither a file nor ` +
        `${CONFIGURATIONS_DIR}/${selection.name}.yaml, nor a knowledge-base default`,
    )
  const parsed = parseConfiguration(input.fs.readFileSync(found), found)
  return parsed.configuration === undefined
    ? refused(...parsed.errors.map(formatError))
    : { base: parsed.configuration, file: found, source: `${found} (${selection.via})` }
}

type Chosen = { configuration?: Configuration; file: string; source: string; override?: unknown }

/** `--config-override` merged over `chosen`; or the refusal. */
function overlay(chosen: Chosen, text: string): Chosen | ConfigurationOutcome {
  const merged = applyOverride(chosen.configuration, text, chosen.file)
  if ('problem' in merged) return refused(merged.problem)
  if (merged.parsed.configuration === undefined)
    return refused(...merged.parsed.errors.map(formatError))
  return {
    ...chosen,
    configuration: merged.parsed.configuration,
    override: merged.override,
    source: `${chosen.source} + --config-override`,
  }
}

/** The selected file with `--config-override` merged over it; or the refusal. */
function choose(input: ConfigurationInput): Chosen | ConfigurationOutcome {
  let selection
  try {
    selection = selectConfiguration({
      flag: input.flag,
      engineFlag: input.engineFlag,
      engine: input.engine,
      workflows: input.project['workflows'] as WorkflowsConfig | undefined,
      workflow: input.workflow.name,
    })
  } catch (error) {
    return refused((error as Error).message)
  }
  const loaded = load(input, selection)
  if (loaded !== undefined && 'errors' in loaded) return loaded
  const chosen: Chosen = {
    ...(loaded && { configuration: loaded.base }),
    file: loaded?.file ?? 'override.yaml',
    source: loaded?.source ?? 'none',
  }
  return input.override === undefined ? chosen : overlay(chosen, input.override)
}

/** Which configuration runs, validated and merged with the override — or why the run is refused. */
export function resolveConfiguration(input: ConfigurationInput): ConfigurationOutcome {
  const chosen = choose(input)
  if ('errors' in chosen) return chosen
  const { configuration, file, source, override } = chosen
  if (configuration === undefined) return { errors: [], warnings: [] }
  const checked = checkAgainstEngines(configuration, {
    file,
    facts: engineFacts(input.project, input.probe),
    steps: input.workflow.steps,
    aliases: input.workflow.aliases,
    engineFlag: input.engineFlag,
  })
  const plan: ConfigurationPlan = {
    configuration,
    text: configurationText(configuration),
    ...(override !== undefined && { override }),
    source,
  }
  return {
    ...(checked.errors.length === 0 && { plan }),
    warnings: checked.warnings.map(formatError),
    errors: checked.errors.map(formatError),
  }
}
