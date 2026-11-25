import { projectConfig } from './session-files'
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
  const projectSettings = projectConfig(project.cwd) ?? {}
  const engine = engineFlag ?? declaredEngine(projectSettings)
  const selected = workflowConfiguration(
    project,
    { workflow: workflow.name, engine, flag, labels: [] },
    projectSettings,
  )
  const configWarnings = checkWorkflowConfiguration(workflow, selected, engineFlag)
  return {
    file: workflow.file,
    ...workflowSummary(project, workflow, selected?.configuration, engine),
    warnings: [...warnings, ...configWarnings],
  }
}
