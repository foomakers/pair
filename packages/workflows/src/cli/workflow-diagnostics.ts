import { checkAgainstEngines, type EngineFacts } from '../configuration'
import { addressedSteps, formatError } from '../grammar'
import { projectConfig } from './session-files'
import {
  workflowConfiguration,
  workflowDefinition,
  workflowSummary,
  type Project,
} from './session-project'

// Only structural checks apply here. Engine availability and model catalogues belong to the runner.
const offlineFacts: EngineFacts = {
  known: () => true,
  installed: () => true,
  models: () => undefined,
  recognizesModel: () => true,
  supportsEffort: () => true,
}

function declaredEngine(config: Record<string, unknown>): string {
  const run = config['run'] as { defaults?: { engine?: unknown } } | undefined
  const engine = config['engine'] as { id?: unknown } | undefined
  const declared = run?.defaults?.engine ?? engine?.id
  return typeof declared === 'string' ? declared : 'claude'
}

export function validateWorkflow(
  project: Project,
  name: string,
  { engine: engineFlag, config: flag }: { engine?: string; config?: string },
) {
  const { workflow, warnings } = workflowDefinition(project, name)
  const projectSettings = projectConfig(project.cwd) ?? {}
  const engine = engineFlag ?? declaredEngine(projectSettings)
  const selected = workflowConfiguration(
    project,
    { workflow: workflow.name, engine, flag, labels: [] },
    projectSettings,
  )
  const checked =
    selected &&
    checkAgainstEngines(selected.configuration, {
      file: selected.file,
      steps: addressedSteps(workflow),
      aliases: workflow.aliases,
      facts: offlineFacts,
      engineFlag,
    })
  if (checked?.errors.length)
    throw new Error(`configuration-invalid: ${checked.errors.map(formatError).join('\n')}`)
  return {
    file: workflow.file,
    ...workflowSummary(workflow, selected?.configuration, engine),
    warnings: [...warnings, ...(checked?.warnings.map(formatError) ?? [])],
  }
}
