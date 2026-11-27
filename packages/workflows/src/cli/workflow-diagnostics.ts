import { formatError } from '../grammar'
import { resumeEngineWarnings } from '../validate'
import { loadSessionProjectConfig } from './session-files'
import {
  checkWorkflowConfiguration,
  workflowConfiguration,
  workflowDefinition,
  workflowSummary,
  type Project,
} from './session-project'

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
  const projectSettings = loadSessionProjectConfig(project.cwd) ?? {}
  const engine = engineFlag ?? declaredEngine(projectSettings)
  const selected = workflowConfiguration(
    project,
    { workflow: workflow.name, engine, flag, labels: [] },
    projectSettings,
  )
  const configWarnings = checkWorkflowConfiguration(workflow, selected, engineFlag)
  const summary = workflowSummary(project, workflow, selected?.configuration, engine)
  const engines = new Map(summary.steps.map(step => [step.id, step.settings.engine]))
  const resumeWarnings = resumeEngineWarnings(workflow, {
    engineFor: id => engines.get(id),
    supports: () => undefined,
  })
  return {
    file: workflow.file,
    ...summary,
    warnings: [...warnings, ...configWarnings, ...resumeWarnings.map(formatError)],
  }
}
